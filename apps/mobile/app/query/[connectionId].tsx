import { FlashList } from "@shopify/flash-list";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from "react-native";
import type { ColumnInfo, DatabaseType, QueryResult, TableInfo } from "../../lib/types";
import { useConnectionStore } from "../../stores/connection";
import { useSettingsStore } from "../../stores/settings";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../lib/theme";
import { normalizeAutoRollbackSeconds } from "../../lib/settings";
import {
  addToQueryHistory,
  getQueryHistory,
  type QueryHistoryItem,
} from "../../lib/storage/query-history";
import {
  deleteSnippet,
  getSnippets,
  saveSnippet,
  type QuerySnippet,
} from "../../lib/storage/snippets";
import { useHaptic } from "../../lib/haptics";

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
  'ON', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'ORDER', 'BY',
  'GROUP', 'HAVING', 'LIMIT', 'OFFSET', 'INSERT', 'INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE', 'CREATE', 'TABLE', 'DROP', 'ALTER',
  'INDEX', 'NULL', 'AS', 'DISTINCT', 'COUNT', 'SUM', 'AVG', 'MAX',
  'MIN', 'UNION', 'EXISTS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'TRUE', 'FALSE'
];

type TokenType = 'keyword' | 'string' | 'number' | 'comment' | 'operator' | 'punctuation' | 'identifier' | 'default';

interface Token {
  type: TokenType;
  value: string;
}

const KEYWORD_SET = new Set(SQL_KEYWORDS.map(k => k.toUpperCase()));

const tokenizeSql = (sql: string): Token[] => {
  const tokens: Token[] = [];
  let remaining = sql;
  
  while (remaining.length > 0) {
    const whitespaceMatch = remaining.match(/^\s+/);
    if (whitespaceMatch) {
      tokens.push({ type: 'default', value: whitespaceMatch[0] });
      remaining = remaining.slice(whitespaceMatch[0].length);
      continue;
    }
    
    const commentMatch = remaining.match(/^--[^\n]*/);
    if (commentMatch) {
      tokens.push({ type: 'comment', value: commentMatch[0] });
      remaining = remaining.slice(commentMatch[0].length);
      continue;
    }
    
    const stringMatch = remaining.match(/^'(?:[^'\\]|\\.)*'/);
    if (stringMatch) {
      tokens.push({ type: 'string', value: stringMatch[0] });
      remaining = remaining.slice(stringMatch[0].length);
      continue;
    }
    
    const numberMatch = remaining.match(/^\d+\.?\d*/);
    if (numberMatch) {
      tokens.push({ type: 'number', value: numberMatch[0] });
      remaining = remaining.slice(numberMatch[0].length);
      continue;
    }
    
    const operatorMatch = remaining.match(/^(<>|!=|<=|>=|::|\|\||&&|[+\-*/%=<>!&|^~])/);
    if (operatorMatch) {
      tokens.push({ type: 'operator', value: operatorMatch[0] });
      remaining = remaining.slice(operatorMatch[0].length);
      continue;
    }
    
    const punctuationMatch = remaining.match(/^[(),;.[\]{}]/);
    if (punctuationMatch) {
      tokens.push({ type: 'punctuation', value: punctuationMatch[0] });
      remaining = remaining.slice(punctuationMatch[0].length);
      continue;
    }
    
    const identifierMatch = remaining.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
    if (identifierMatch) {
      const word = identifierMatch[0];
      const isKeyword = KEYWORD_SET.has(word.toUpperCase());
      tokens.push({ type: isKeyword ? 'keyword' : 'identifier', value: word });
      remaining = remaining.slice(word.length);
      continue;
    }
    
    tokens.push({ type: 'default', value: remaining[0] });
    remaining = remaining.slice(1);
  }
  
  return tokens;
};

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: '#c678dd',
  string: '#98c379',
  number: '#d19a66',
  comment: '#5c6370',
  operator: '#56b6c2',
  punctuation: '#abb2bf',
  identifier: '#e5c07b',
  default: '#abb2bf',
};

const DANGEROUS_KEYWORDS = [
  "UPDATE",
  "DELETE",
  "DROP",
  "TRUNCATE",
  "ALTER",
  "MERGE",
  "REPLACE",
];

type TransactionStatements = {
  begin: string;
  commit: string;
  rollback: string;
};

const getTransactionStatements = (
  type: DatabaseType
): TransactionStatements | null => {
  switch (type) {
    case "postgres":
    case "cockroachdb":
    case "sqlite":
      return { begin: "BEGIN", commit: "COMMIT", rollback: "ROLLBACK" };
    case "mysql":
    case "mariadb":
      return {
        begin: "START TRANSACTION",
        commit: "COMMIT",
        rollback: "ROLLBACK",
      };
    case "mongodb":
      return null;
  }
};

const stripSql = (sql: string): string =>
  sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--.*$/gm, " ")
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/\"(?:[^\"\\]|\\.)*\"/g, "\"\"")
    .replace(/\s+/g, " ");

const findDangerousKeyword = (sql: string): string | null => {
  const normalized = stripSql(sql).toUpperCase();
  const match = normalized.match(
    new RegExp(`\\b(${DANGEROUS_KEYWORDS.join("|")})\\b`)
  );
  return match ? match[1] : null;
};

const formatCountdown = (seconds: number): string => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remaining = safe % 60;
  if (minutes > 0) {
    return `${minutes}:${remaining.toString().padStart(2, "0")}`;
  }
  return `${remaining}s`;
};

type SqlContext = 'select' | 'from' | 'where' | 'orderby' | 'groupby' | 'insert' | 'update' | 'set' | 'join' | 'default';

const CONTEXT_SUGGESTIONS: Record<SqlContext, string[]> = {
  select: ['*', 'DISTINCT', 'COUNT(*)', 'SUM()', 'AVG()', 'MAX()', 'MIN()', 'FROM'],
  from: ['WHERE', 'JOIN', 'LEFT JOIN', 'INNER JOIN', 'ORDER BY', 'GROUP BY', 'LIMIT'],
  where: ['AND', 'OR', 'LIKE', 'IN', 'BETWEEN', 'IS NULL', 'IS NOT NULL', 'ORDER BY', 'LIMIT'],
  orderby: ['ASC', 'DESC', 'LIMIT'],
  groupby: ['HAVING', 'ORDER BY', 'LIMIT'],
  insert: ['VALUES'],
  update: ['SET'],
  set: ['WHERE'],
  join: ['ON', 'WHERE'],
  default: ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP'],
};

const detectContext = (text: string, cursorPosition: number): SqlContext => {
  const beforeCursor = text.slice(0, cursorPosition).toUpperCase();
  const trimmed = beforeCursor.replace(/\s+/g, ' ').trim();
  
  if (/JOIN\s+\w*\s*$/i.test(trimmed)) return 'join';
  if (/SET\s+.*$/i.test(trimmed)) return 'set';
  if (/UPDATE\s+\w*\s*$/i.test(trimmed)) return 'update';
  if (/INSERT\s+INTO\s+\w*\s*$/i.test(trimmed)) return 'insert';
  if (/GROUP\s+BY\s+.*$/i.test(trimmed)) return 'groupby';
  if (/ORDER\s+BY\s+.*$/i.test(trimmed)) return 'orderby';
  if (/(WHERE|AND|OR)\s+.*$/i.test(trimmed)) return 'where';
  if (/FROM\s+\w*\s*$/i.test(trimmed)) return 'from';
  if (/SELECT\s+.*$/i.test(trimmed) && !/FROM/i.test(trimmed)) return 'select';
  
  return 'default';
};

const SQL_TEMPLATES = [
  { label: 'Select All', template: 'SELECT * FROM ' },
  { label: 'Select Where', template: 'SELECT * FROM table WHERE ' },
  { label: 'Count', template: 'SELECT COUNT(*) FROM ' },
  { label: 'Insert', template: 'INSERT INTO table (col) VALUES ' },
  { label: 'Update', template: 'UPDATE table SET col = ' },
  { label: 'Delete', template: 'DELETE FROM table WHERE ' },
];

const SQL_QUICK_ACTIONS = [
  { label: 'SELECT', value: 'SELECT ' },
  { label: '*', value: '* ' },
  { label: 'FROM', value: 'FROM ' },
  { label: 'WHERE', value: 'WHERE ' },
  { label: 'AND', value: 'AND ' },
  { label: 'OR', value: 'OR ' },
  { label: '=', value: '= ' },
  { label: 'LIKE', value: "LIKE '%%'" },
  { label: 'IN', value: 'IN ()' },
  { label: 'JOIN', value: 'JOIN ' },
  { label: 'ON', value: 'ON ' },
  { label: 'ORDER BY', value: 'ORDER BY ' },
  { label: 'GROUP BY', value: 'GROUP BY ' },
  { label: 'LIMIT', value: 'LIMIT ' },
  { label: 'NULL', value: 'IS NULL' },
  { label: 'ASC', value: 'ASC ' },
  { label: 'DESC', value: 'DESC ' },
];

const getCurrentWord = (text: string, cursorPosition: number): { word: string; start: number; end: number } => {
  const beforeCursor = text.slice(0, cursorPosition);
  const afterCursor = text.slice(cursorPosition);

  const wordStartMatch = beforeCursor.match(/[a-zA-Z_*][a-zA-Z0-9_*]*$/);
  const wordEndMatch = afterCursor.match(/^[a-zA-Z0-9_*]*/);

  const start = wordStartMatch ? cursorPosition - wordStartMatch[0].length : cursorPosition;
  const end = cursorPosition + (wordEndMatch ? wordEndMatch[0].length : 0);
  const word = text.slice(start, end);

  return { word, start, end };
};

const getSuggestions = (text: string, cursorPosition: number, currentWord: string): string[] => {
  const beforeCursor = text.slice(0, cursorPosition);
  
  if (/LIMIT\s+\d*$/i.test(beforeCursor)) {
    return [];
  }
  
  if (/OFFSET\s+\d*$/i.test(beforeCursor)) {
    return [];
  }
  
  if (currentWord && /^\d+$/.test(currentWord)) {
    return [];
  }
  
  if (currentWord.length < 1) {
    return [];
  }
  
  const context = detectContext(text, cursorPosition);
  const contextSuggestions = CONTEXT_SUGGESTIONS[context];
  
  const upper = currentWord.toUpperCase();
  const allSuggestions = [...new Set([...contextSuggestions, ...SQL_KEYWORDS])];
  
  return allSuggestions
    .filter(s => s.toUpperCase().startsWith(upper) && s.toUpperCase() !== upper)
    .slice(0, 8);
};

interface SqlEditorProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  enableAutocomplete: boolean;
  showTemplates: boolean;
  showQuickActions: boolean;
  styles: ReturnType<typeof createStyles>;
  theme: Theme;
}

const SqlEditor = ({
  value,
  onChangeText,
  placeholder,
  enableAutocomplete,
  showTemplates,
  showQuickActions,
  styles,
  theme,
}: SqlEditorProps) => {
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const cursorRef = useRef(0);

  const tokens = useMemo(() => tokenizeSql(value), [value]);
  
  const currentWordInfo = useMemo(() => getCurrentWord(value, cursorPosition), [value, cursorPosition]);
  
  const suggestions = useMemo(
    () =>
      enableAutocomplete
        ? getSuggestions(value, cursorPosition, currentWordInfo.word)
        : [],
    [value, cursorPosition, currentWordInfo.word, enableAutocomplete]
  );

  const handleSelectionChange = useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start } = event.nativeEvent.selection;
    cursorRef.current = start;
    setCursorPosition(start);
    if (!enableAutocomplete) {
      setShowAutocomplete(false);
      return;
    }
    const wordInfo = getCurrentWord(value, start);
    const filtered = getSuggestions(value, start, wordInfo.word);
    setShowAutocomplete(filtered.length > 0);
  }, [value, enableAutocomplete]);

  const handleTextChange = useCallback((text: string) => {
    onChangeText(text);
  }, [onChangeText]);

  const handleSuggestionPress = useCallback((suggestion: string) => {
    const { start, end } = currentWordInfo;
    const needsSpace = !suggestion.endsWith(' ') && !suggestion.endsWith('()') && !suggestion.endsWith('%%\'');
    const insertText = needsSpace ? suggestion + ' ' : suggestion;
    const newText = value.slice(0, start) + insertText + value.slice(end);
    const newCursor = start + insertText.length;
    onChangeText(newText);
    setShowAutocomplete(false);
    cursorRef.current = newCursor;
    setCursorPosition(newCursor);
    setTimeout(() => inputRef.current?.setNativeProps({ selection: { start: newCursor, end: newCursor } }), 0);
  }, [value, currentWordInfo, onChangeText]);

  const handleQuickAction = useCallback((insertValue: string) => {
    const cursor = cursorRef.current;
    const newText = value.slice(0, cursor) + insertValue + value.slice(cursor);
    const newCursor = cursor + insertValue.length;
    onChangeText(newText);
    cursorRef.current = newCursor;
    setCursorPosition(newCursor);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps({ selection: { start: newCursor, end: newCursor } });
    }, 0);
  }, [value, onChangeText]);

  const handleTemplatePress = useCallback((template: string) => {
    onChangeText(template);
    const newCursor = template.length;
    cursorRef.current = newCursor;
    setCursorPosition(newCursor);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps({ selection: { start: newCursor, end: newCursor } });
    }, 0);
  }, [onChangeText]);

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    setTimeout(() => setShowAutocomplete(false), 150);
  }, []);

  return (
    <View style={styles.sqlEditorContainer}>
      {showTemplates && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.templatesContainer}
          contentContainerStyle={styles.templatesContent}
          keyboardShouldPersistTaps="handled"
        >
          {SQL_TEMPLATES.map((t) => (
            <Pressable
              key={t.label}
              style={({ pressed }) => [styles.templateChip, pressed && styles.templateChipPressed]}
              onPress={() => handleTemplatePress(t.template)}
            >
              <Text style={styles.templateText}>{t.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.editorAndAutocompleteWrapper}>
        {showAutocomplete && suggestions.length > 0 && (
          <View style={styles.autocompleteDropdown}>
            <ScrollView style={styles.autocompleteScroll} keyboardShouldPersistTaps="handled">
              {suggestions.map((suggestion) => (
                <Pressable
                  key={`suggestion-${suggestion}`}
                  style={({ pressed }) => [styles.autocompleteItem, pressed && styles.autocompleteItemPressed]}
                  onPress={() => handleSuggestionPress(suggestion)}
                >
                  <Text style={styles.autocompleteText}>
                    {currentWordInfo.word && (
                      <Text style={styles.autocompleteMatch}>
                        {suggestion.slice(0, currentWordInfo.word.length)}
                      </Text>
                    )}
                    {suggestion.slice(currentWordInfo.word.length)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={[styles.editorWrapper, isFocused && styles.editorWrapperFocused]}>
          <View style={styles.highlightedTextContainer} pointerEvents="none">
            <Text style={styles.highlightedText}>
              {tokens.map((token, index) => (
                <Text key={`token-${index}-${token.value.slice(0, 5)}`} style={{ color: TOKEN_COLORS[token.type] }}>
                  {token.value}
                </Text>
              ))}
            </Text>
          </View>
          <TextInput
            ref={inputRef}
            style={styles.editor}
            value={value}
            onChangeText={handleTextChange}
            onSelectionChange={handleSelectionChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={placeholder}
            placeholderTextColor={theme.colors.placeholder}
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor={theme.colors.accent}
          />
        </View>
      </View>

      {showQuickActions && (
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false} 
          style={styles.quickActionsContainer}
          contentContainerStyle={styles.quickActionsContent}
          keyboardShouldPersistTaps="handled"
        >
          {SQL_QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.label}
              style={({ pressed }) => [styles.quickActionChip, pressed && styles.quickActionChipPressed]}
              onPress={() => handleQuickAction(action.value)}
            >
              <Text style={styles.quickActionText}>{action.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

/**
 * Screen component that provides an SQL editor, execution controls, and result display with support for transactions, table/schema inspection, query history, and saved snippets.
 *
 * Renders an editor with syntax highlighting and autocomplete, controls to run queries (with optional transactional wrapping and auto-rollback), panels for tables/columns, modals for history and snippets, and a results area with copy-to-clipboard and error handling.
 *
 * @returns The rendered Query screen as a React element
 */
export default function QueryScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const haptic = useHaptic();
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [transactionState, setTransactionState] = useState<{
    active: boolean;
    statements: TransactionStatements | null;
  }>({ active: false, statements: null });
  const [transactionDeadline, setTransactionDeadline] = useState<number | null>(
    null
  );
  const [transactionTimeLeft, setTransactionTimeLeft] = useState(0);
  const [showTransactionBanner, setShowTransactionBanner] = useState(true);
  const autoRollbackTriggered = useRef(false);
  const settings = useSettingsStore((state) => state.settings);

  const [showTables, setShowTables] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [expandedTable, setExpandedTable] = useState<string | null>(null);
  const [tableColumns, setTableColumns] = useState<Record<string, ColumnInfo[]>>({});
  const [loadingTables, setLoadingTables] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);

  const [showSnippets, setShowSnippets] = useState(false);
  const [snippets, setSnippets] = useState<QuerySnippet[]>([]);

  const [showSaveSnippetPrompt, setShowSaveSnippetPrompt] = useState(false);
  const [snippetName, setSnippetName] = useState("");

  const { activeConnections, executeQuery } = useConnectionStore();
  const connection = connectionId ? activeConnections.get(connectionId) : null;
  const showAutoRollbackCountdown =
    settings.autoRollbackEnabled && transactionDeadline !== null;
  const transactionChipLabel = showAutoRollbackCountdown
    ? `Txn ${formatCountdown(transactionTimeLeft)}`
    : "Txn Manual";

  const copyAllResults = async () => {
    if (!result) return;
    const header = result.columns.map(c => c.name).join("\t");
    const rows = result.rows.map(row =>
      result.columns.map(c => {
        const val = row[c.name];
        return val === null ? "NULL" : String(val);
      }).join("\t")
    ).join("\n");
    await Clipboard.setStringAsync(`${header}\n${rows}`);
    Alert.alert("Copied", "Results copied to clipboard");
  };

  const loadTables = async () => {
    if (!connection?.instance) return;
    setLoadingTables(true);
    try {
      const tableList = await connection.instance.listTables();
      setTables(tableList);
    } catch {
      Alert.alert("Error", "Failed to load tables");
    } finally {
      setLoadingTables(false);
    }
  };

  const loadTableColumns = async (tableName: string) => {
    if (!connection?.instance) return;
    
    if (expandedTable === tableName) {
      setExpandedTable(null);
      return;
    }

    if (tableColumns[tableName]) {
      setExpandedTable(tableName);
      return;
    }

    try {
      const table = tables.find(t => t.name === tableName);
      const schema = table?.schema || 'public';
      const columns = await connection.instance.describeTable(schema, tableName);
      setTableColumns(prev => ({ ...prev, [tableName]: columns }));
      setExpandedTable(tableName);
    } catch {
      Alert.alert("Error", `Failed to load columns for ${tableName}`);
    }
  };

  const insertIntoQuery = (text: string) => {
    setQuery(prev => prev + text + ' ');
  };

  const loadHistory = async () => {
    const items = await getQueryHistory();
    setHistory(items);
  };

  const handleSelectHistory = (item: QueryHistoryItem) => {
    setQuery(item.query);
    setShowHistory(false);
  };

  const loadSnippets = async () => {
    const items = await getSnippets();
    setSnippets(items);
  };

  const handleSelectSnippet = (snippet: QuerySnippet) => {
    setQuery(snippet.query);
    setShowSnippets(false);
  };

  const handleSaveSnippet = () => {
    const trimmed = query.trim();
    if (!trimmed) {
      Alert.alert("Error", "Enter a query first");
      return;
    }
    setSnippetName("");
    setShowSaveSnippetPrompt(true);
  };

  const confirmSaveSnippet = async () => {
    const trimmedName = snippetName.trim();
    if (!trimmedName) return;
    try {
      await saveSnippet({ name: trimmedName, query: query.trim() });
      haptic.success();
      setShowSaveSnippetPrompt(false);
      Alert.alert("Saved", "Snippet saved successfully");
    } catch (err) {
      haptic.error();
      console.error("[confirmSaveSnippet] Failed to save snippet:", err);
      Alert.alert(
        "Save Failed",
        err instanceof Error ? err.message : "Could not save snippet"
      );
    }
  };

  const handleDeleteSnippet = async (id: string) => {
    Alert.alert("Delete Snippet", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteSnippet(id);
            loadSnippets();
          } catch (err) {
            console.error("[handleDeleteSnippet] Failed to delete snippet:", err);
            Alert.alert(
              "Delete Failed",
              err instanceof Error ? err.message : "Could not delete snippet"
            );
          }
        },
      },
    ]);
  };

  const finalizeTransaction = useCallback(
    async (action: "commit" | "rollback", auto = false) => {
      if (
        !transactionState.active ||
        !transactionState.statements ||
        !connectionId
      ) {
        return;
      }

      setExecuting(true);
      if (!auto) {
        setError(null);
      }

      try {
        await executeQuery(
          connectionId,
          action === "commit"
            ? transactionState.statements.commit
            : transactionState.statements.rollback
        );
        setTransactionState({ active: false, statements: null });
        setTransactionDeadline(null);
        setTransactionTimeLeft(0);
        setShowTransactionBanner(false);
        if (action === "commit") {
          haptic.success();
        } else {
          haptic.warning();
        }
      } catch (err) {
        haptic.error();
        setError(err instanceof Error ? err.message : "Transaction failed");
      } finally {
        setExecuting(false);
      }
    },
    [connectionId, executeQuery, haptic, transactionState.active, transactionState.statements]
  );

  const executeWithTransaction = async (sql: string) => {
    if (!connectionId || !connection) return;
    const transaction = getTransactionStatements(connection.config.type);
    if (!transaction) {
      Alert.alert(
        "Transactions Unavailable",
        "Transactions are not supported for this connection type."
      );
      return;
    }
    if (transactionState.active) {
      Alert.alert(
        "Transaction Active",
        "Commit or rollback the current transaction before starting a new one."
      );
      return;
    }

    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      const autoRollbackSeconds = settings.autoRollbackEnabled
        ? normalizeAutoRollbackSeconds(settings.autoRollbackSeconds)
        : null;
      await executeQuery(connectionId, transaction.begin);
      const queryResult = await executeQuery(connectionId, sql);
      setResult(queryResult);
      setTransactionState({ active: true, statements: transaction });
      if (autoRollbackSeconds) {
        setTransactionDeadline(Date.now() + autoRollbackSeconds * 1000);
        setTransactionTimeLeft(autoRollbackSeconds);
      } else {
        setTransactionDeadline(null);
        setTransactionTimeLeft(0);
      }
      setShowTransactionBanner(true);
      autoRollbackTriggered.current = false;
    } catch (err) {
      try {
        await executeQuery(connectionId, transaction.rollback);
      } catch {}
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setExecuting(false);
    }
  };

  useEffect(() => {
    if (!transactionState.active || !transactionDeadline || !settings.autoRollbackEnabled) {
      setTransactionTimeLeft(0);
      autoRollbackTriggered.current = false;
      return;
    }

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.ceil((transactionDeadline - Date.now()) / 1000)
      );
      setTransactionTimeLeft(remaining);
      if (remaining <= 0 && !autoRollbackTriggered.current && !executing) {
        autoRollbackTriggered.current = true;
        finalizeTransaction("rollback", true);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [
    transactionState.active,
    transactionDeadline,
    executing,
    finalizeTransaction,
    settings.autoRollbackEnabled,
  ]);

  useEffect(() => {
    if (!transactionState.active) {
      return;
    }

    if (!settings.autoRollbackEnabled) {
      setTransactionDeadline(null);
      setTransactionTimeLeft(0);
      autoRollbackTriggered.current = false;
      return;
    }

    const normalized = normalizeAutoRollbackSeconds(settings.autoRollbackSeconds);
    setTransactionDeadline(Date.now() + normalized * 1000);
    setTransactionTimeLeft(normalized);
    autoRollbackTriggered.current = false;
  }, [
    transactionState.active,
    settings.autoRollbackEnabled,
    settings.autoRollbackSeconds,
  ]);

  const handleExecute = async () => {
    const trimmed = query.trim();
    if (!connectionId || !trimmed) return;

    if (settings.dangerousOpsHint) {
      const dangerousKeyword = findDangerousKeyword(trimmed);
      if (dangerousKeyword) {
        const action = await new Promise<"cancel" | "wrap" | "run">((resolve) => {
          Alert.alert(
            "Confirm Dangerous Command",
            `This looks like a ${dangerousKeyword} statement. Are you sure you want to run it? These commands can be irreversible.\n\nConsider wrapping it in a transaction (BEGIN ... COMMIT) so you can ROLLBACK if needed.`,
            [
              { text: "Cancel", style: "cancel", onPress: () => resolve("cancel") },
              { text: "Wrap in Transaction", onPress: () => resolve("wrap") },
              { text: "Run Anyway", style: "destructive", onPress: () => resolve("run") },
            ]
          );
        });
        if (action === "cancel") return;
        if (action === "wrap") {
          await executeWithTransaction(trimmed);
          return;
        }
      }
    }

    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      const queryResult = await executeQuery(connectionId, trimmed);
      setResult(queryResult);
      haptic.success();
      addToQueryHistory({
        query: trimmed,
        connectionId,
        connectionName: connection?.config.name ?? "Unknown",
      });
    } catch (err) {
      haptic.error();
      setError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setExecuting(false);
    }
  };

  if (!connection) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Connection not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.editorContainer}>
        <SqlEditor
          value={query}
          onChangeText={setQuery}
          placeholder="Type SQL or tap a template..."
          enableAutocomplete={settings.enableAutocomplete}
          showTemplates={settings.showSqlTemplates}
          showQuickActions={settings.showQuickActions}
          styles={styles}
          theme={theme}
        />
        <View style={styles.runRow}>
          <View style={styles.runRowLeft}>
            <Pressable
              style={styles.tablesToggle}
              onPress={() => {
                if (!showTables && tables.length === 0) loadTables();
                setShowTables(!showTables);
              }}
            >
              <Text style={styles.tablesToggleText}>
                {showTables ? "Hide Tables" : "Tables"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.historyToggle}
              onPress={() => {
                loadHistory();
                setShowHistory(true);
              }}
            >
              <Text style={styles.historyToggleText}>History</Text>
            </Pressable>
            <Pressable
              style={styles.snippetsToggle}
              onPress={() => {
                loadSnippets();
                setShowSnippets(true);
              }}
            >
              <Text style={styles.snippetsToggleText}>Snippets</Text>
            </Pressable>
            <Pressable
              style={styles.saveSnippetToggle}
              onPress={handleSaveSnippet}
            >
              <Text style={styles.saveSnippetToggleText}>+ Save</Text>
            </Pressable>
          </View>
          <View style={styles.runRowRight}>
            {transactionState.active && (
              <Pressable
                style={styles.transactionChip}
                onPress={() => setShowTransactionBanner(true)}
              >
                <Text style={styles.transactionChipText}>{transactionChipLabel}</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.runButton, executing && styles.runButtonDisabled]}
              onPress={handleExecute}
              disabled={executing}
            >
              {executing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.runButtonText}>Run</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.resultsContainer}>
        {showTables && (
          <View style={styles.tablesPanel}>
            <View style={styles.tablesPanelHeader}>
              <Text style={styles.tablesPanelTitle}>Tables</Text>
              <Pressable onPress={loadTables} disabled={loadingTables}>
                <Text style={styles.refreshText}>{loadingTables ? "Loading..." : "Refresh"}</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.tablesList} nestedScrollEnabled>
              {tables.length === 0 && !loadingTables && (
                <Text style={styles.tablesEmpty}>No tables found</Text>
              )}
              {tables.map(table => (
                <View key={`${table.schema}-${table.name}`}>
                  <Pressable
                    style={styles.tableItem}
                    onPress={() => loadTableColumns(table.name)}
                    onLongPress={() => insertIntoQuery(table.name)}
                  >
                    <Text style={styles.tableName}>{table.name}</Text>
                    <Text style={styles.tableType}>{table.type}</Text>
                  </Pressable>
                  {expandedTable === table.name && tableColumns[table.name] && (
                    <View style={styles.columnsList}>
                      {tableColumns[table.name].map(col => (
                        <Pressable
                          key={col.name}
                          style={styles.columnItem}
                          onPress={() => insertIntoQuery(col.name)}
                        >
                          <Text style={styles.columnName}>{col.name}</Text>
                          <Text style={styles.columnType}>{col.type}</Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
          </View>
        )}
        {transactionState.active && showTransactionBanner && (
          <View style={styles.transactionBanner}>
            <View style={styles.transactionHeader}>
              <Text style={styles.transactionTitle}>Transaction Pending</Text>
              <Pressable onPress={() => setShowTransactionBanner(false)}>
                <Text style={styles.transactionHideText}>Hide</Text>
              </Pressable>
            </View>
            <View style={styles.transactionText}>
              <Text style={styles.transactionDescription}>
                {showAutoRollbackCountdown
                  ? `Auto-rollback in ${formatCountdown(
                      transactionTimeLeft
                    )}. Commit to keep changes or rollback to undo them.`
                  : "Auto-rollback is off. Commit to keep changes or rollback to undo them."}
              </Text>
            </View>
            <View style={styles.transactionActions}>
              <Pressable
                style={[
                  styles.transactionButton,
                  styles.transactionRollback,
                  executing && styles.transactionButtonDisabled,
                ]}
                onPress={() => finalizeTransaction("rollback")}
                disabled={executing}
              >
                <Text style={styles.transactionRollbackText}>Rollback</Text>
              </Pressable>
              <Pressable
                style={[
                  styles.transactionButton,
                  styles.transactionCommit,
                  executing && styles.transactionButtonDisabled,
                ]}
                onPress={() => finalizeTransaction("commit")}
                disabled={executing}
              >
                <Text style={styles.transactionCommitText}>Commit</Text>
              </Pressable>
            </View>
          </View>
        )}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
            <Pressable
              style={[styles.retryButton, executing && styles.retryButtonDisabled]}
              onPress={handleExecute}
              disabled={executing}
            >
              <Text style={styles.retryButtonText}>
                {executing ? "Retrying..." : "Retry"}
              </Text>
            </Pressable>
          </View>
        )}

        {result && (
          <>
            <View style={styles.resultsMeta}>
              <Text style={styles.metaText}>
                {result.rowCount} rows - {result.executionTime}ms
              </Text>
              <View style={styles.resultsActions}>
                <Pressable style={styles.copyAllButton} onPress={copyAllResults}>
                  <Text style={styles.copyAllText}>Copy All</Text>
                </Pressable>
                <Text style={styles.metaText}>{result.command}</Text>
              </View>
            </View>

            {result.columns.length > 0 && (
              <ScrollView horizontal style={styles.tableContainer}>
                <View style={styles.tableWrapper}>
                  <View style={styles.tableHeader}>
                    {result.columns.map((col) => (
                      <View key={`header-${col.name}`} style={styles.headerCell}>
                        <Text style={styles.headerText}>{col.name}</Text>
                        <Text style={styles.typeText}>{col.type}</Text>
                      </View>
                    ))}
                  </View>
                  <FlashList
                    data={result.rows}
                    keyExtractor={(_item, index) => `row-${index}`}
                    renderItem={({ item }) => (
                      <View style={styles.tableRow}>
                        {result.columns.map((col) => (
                          <View key={`cell-${col.name}`} style={styles.cell}>
                            <Text style={styles.cellText} numberOfLines={3}>
                              {item[col.name] === null
                                ? "NULL"
                                : String(item[col.name])}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  />
                </View>
              </ScrollView>
            )}
          </>
        )}

        {!result && !error && !executing && (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>
              Run a query to see results
            </Text>
          </View>
        )}
      </View>

      <Modal
        visible={showHistory}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHistory(false)}
      >
        <Pressable 
          style={styles.dialogOverlay} 
          onPress={() => setShowHistory(false)}
        >
          <Pressable style={styles.dialogContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Query History</Text>
              <Pressable onPress={() => setShowHistory(false)} hitSlop={8}>
                <Text style={styles.dialogCloseText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.dialogList} contentContainerStyle={styles.dialogListContent}>
              {history.length === 0 ? (
                <Text style={styles.dialogEmpty}>No query history yet</Text>
              ) : (
                history.map((item) => (
                  <Pressable
                    key={item.id}
                    style={styles.historyItem}
                    onPress={() => handleSelectHistory(item)}
                  >
                    <Text style={styles.historyQuery} numberOfLines={2}>
                      {item.query}
                    </Text>
                    <View style={styles.historyMeta}>
                      <Text style={styles.historyConnection}>
                        {item.connectionName}
                      </Text>
                      <Text style={styles.historyTime}>
                        {new Date(item.timestamp).toLocaleDateString()}
                      </Text>
                    </View>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showSnippets}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSnippets(false)}
      >
        <Pressable 
          style={styles.dialogOverlay} 
          onPress={() => setShowSnippets(false)}
        >
          <Pressable style={styles.dialogContainer} onPress={(e) => e.stopPropagation()}>
            <View style={styles.dialogHeader}>
              <Text style={styles.dialogTitle}>Saved Snippets</Text>
              <Pressable onPress={() => setShowSnippets(false)} hitSlop={8}>
                <Text style={styles.dialogCloseText}>✕</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.dialogList} contentContainerStyle={styles.dialogListContent}>
              {snippets.length === 0 ? (
                <Text style={styles.dialogEmpty}>
                  No snippets yet. Use "+ Save" button to save your query.
                </Text>
              ) : (
                snippets.map((snippet) => (
                  <Pressable
                    key={snippet.id}
                    style={styles.snippetItem}
                    onPress={() => handleSelectSnippet(snippet)}
                    onLongPress={() => handleDeleteSnippet(snippet.id)}
                  >
                    <Text style={styles.snippetName}>{snippet.name}</Text>
                    <Text style={styles.snippetQuery} numberOfLines={2}>
                      {snippet.query}
                    </Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showSaveSnippetPrompt}
        transparent
        animationType="fade"
        onRequestClose={() => setShowSaveSnippetPrompt(false)}
      >
        <View style={styles.saveSnippetModal}>
          <View style={styles.saveSnippetModalContent}>
            <Text style={styles.saveSnippetModalTitle}>Save Snippet</Text>
            <TextInput
              style={styles.saveSnippetInput}
              value={snippetName}
              onChangeText={setSnippetName}
              placeholder="Snippet name..."
              placeholderTextColor={theme.colors.placeholder}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.saveSnippetActions}>
              <Pressable onPress={() => setShowSaveSnippetPrompt(false)}>
                <Text style={styles.saveSnippetCancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={confirmSaveSnippet}>
                <Text style={styles.saveSnippetSaveText}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  editorContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  sqlEditorContainer: {
    position: 'relative',
  },
  templatesContainer: {
    marginBottom: 8,
  },
  templatesContent: {
    paddingHorizontal: 2,
    gap: 6,
  },
  templateChip: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.accentMuted,
    marginRight: 6,
  },
  templateChipPressed: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.accent,
  },
  templateText: {
    color: '#98c379',
    fontSize: 12,
    fontFamily: 'JetBrainsMono',
  },
  editorAndAutocompleteWrapper: {
    position: 'relative',
    zIndex: 10,
  },
  editorWrapper: {
    position: 'relative',
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    minHeight: 100,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  editorWrapperFocused: {
    borderColor: theme.colors.accentMuted,
  },
  highlightedTextContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
    pointerEvents: 'none',
  },
  highlightedText: {
    padding: 12,
    fontSize: 14,
    fontFamily: "JetBrainsMono",
    lineHeight: 20,
  },
  editor: {
    backgroundColor: 'transparent',
    padding: 12,
    color: 'transparent',
    fontSize: 14,
    fontFamily: "JetBrainsMono",
    minHeight: 100,
    maxHeight: 200,
    lineHeight: 20,
  },
  quickActionsContainer: {
    marginTop: 8,
  },
  quickActionsContent: {
    paddingHorizontal: 2,
    gap: 6,
  },
  quickActionChip: {
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: 6,
  },
  quickActionChipPressed: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.accentMuted,
  },
  quickActionText: {
    color: theme.colors.accent,
    fontSize: 13,
    fontFamily: 'JetBrainsMono',
  },
  autocompleteDropdown: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 8,
    marginBottom: 4,
    maxHeight: 250,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  autocompleteScroll: {
    maxHeight: 250,
  },
  autocompleteItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  autocompleteItemPressed: {
    backgroundColor: theme.colors.surfaceMuted,
  },
  autocompleteText: {
    color: theme.colors.text,
    fontSize: 14,
    fontFamily: 'JetBrainsMono',
  },
  autocompleteMatch: {
    color: theme.colors.accent,
    fontWeight: '600',
  },
  runButton: {
    backgroundColor: theme.colors.success,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
    alignSelf: "flex-end",
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  runButtonDisabled: {
    opacity: 0.6,
  },
  runButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  runRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  runRowLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  runRowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tablesToggle: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  tablesToggleText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  historyToggle: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  historyToggleText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialogContainer: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    width: '100%',
    maxWidth: 400,
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  dialogHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dialogTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  dialogCloseText: {
    color: theme.colors.textMuted,
    fontSize: 18,
    fontWeight: '400',
  },
  dialogList: {
    flexGrow: 0,
    flexShrink: 1,
  },
  dialogListContent: {
    paddingBottom: 8,
  },
  dialogEmpty: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    padding: 32,
    fontSize: 14,
  },
  historyItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  historyQuery: {
    color: theme.colors.text,
    fontSize: 13,
    fontFamily: 'JetBrainsMono',
    marginBottom: 6,
  },
  historyMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyConnection: {
    color: theme.colors.textSubtle,
    fontSize: 11,
  },
  historyTime: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  snippetsToggle: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  snippetsToggleText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '500',
  },
  saveSnippetToggle: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.success,
  },
  saveSnippetToggleText: {
    color: theme.colors.success,
    fontSize: 12,
    fontWeight: '600',
  },
  snippetItem: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  snippetName: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  snippetQuery: {
    color: theme.colors.textSubtle,
    fontSize: 12,
    fontFamily: 'JetBrainsMono',
  },
  resultsContainer: {
    flex: 1,
    padding: 16,
  },
  tablesPanel: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    marginBottom: 12,
    maxHeight: 180,
  },
  tablesPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tablesPanelTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  refreshText: {
    color: theme.colors.primary,
    fontSize: 12,
  },
  tablesList: {
    flex: 1,
  },
  tablesEmpty: {
    color: theme.colors.textMuted,
    textAlign: 'center',
    padding: 16,
    fontSize: 12,
  },
  tableItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  tableName: {
    color: theme.colors.text,
    fontSize: 13,
  },
  tableType: {
    color: theme.colors.textMuted,
    fontSize: 11,
  },
  columnsList: {
    backgroundColor: theme.colors.background,
    paddingLeft: 16,
  },
  columnItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  columnName: {
    color: theme.colors.textSubtle,
    fontSize: 12,
  },
  columnType: {
    color: theme.colors.textMuted,
    fontSize: 10,
  },
  resultsMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metaText: {
    color: theme.colors.textSubtle,
    fontSize: 12,
  },
  resultsActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  copyAllButton: {
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  copyAllText: {
    color: theme.colors.primary,
    fontSize: 12,
    fontWeight: '500',
  },
  tableContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
  },
  tableWrapper: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: theme.colors.surfaceAlt,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  headerCell: {
    width: 150,
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  headerText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "600",
  },
  typeText: {
    color: theme.colors.textSubtle,
    fontSize: 10,
    marginTop: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  cell: {
    width: 150,
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
  },
  cellText: {
    color: theme.colors.textMuted,
    fontSize: 13,
    fontFamily: "JetBrainsMono",
  },
  errorContainer: {
    backgroundColor: theme.colors.dangerMuted,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  errorTitle: {
    color: theme.colors.danger,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  errorMessage: {
    color: theme.colors.danger,
    fontSize: 13,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  retryButtonDisabled: {
    opacity: 0.6,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: theme.colors.placeholder,
    fontSize: 14,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 16,
    textAlign: "center",
    marginTop: 24,
  },
  transactionBanner: {
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    gap: 12,
  },
  transactionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  transactionText: {
    gap: 4,
  },
  transactionTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
  transactionHideText: {
    color: theme.colors.textSubtle,
    fontSize: 12,
    fontWeight: "600",
  },
  transactionDescription: {
    color: theme.colors.textSubtle,
    fontSize: 12,
  },
  transactionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  transactionButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  transactionCommit: {
    backgroundColor: theme.colors.success,
  },
  transactionCommitText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  transactionRollback: {
    backgroundColor: theme.colors.dangerMuted,
    borderWidth: 1,
    borderColor: theme.colors.danger,
  },
  transactionRollbackText: {
    color: theme.colors.danger,
    fontSize: 13,
    fontWeight: "600",
  },
  transactionButtonDisabled: {
    opacity: 0.6,
  },
  transactionChip: {
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  transactionChipText: {
    color: theme.colors.textSubtle,
    fontSize: 12,
    fontWeight: "600",
  },
  saveSnippetModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  saveSnippetModalContent: {
    backgroundColor: theme.colors.background,
    borderRadius: 16,
    padding: 20,
    width: '100%',
    maxWidth: 320,
  },
  saveSnippetModalTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  saveSnippetInput: {
    backgroundColor: theme.colors.surface,
    padding: 12,
    borderRadius: 8,
    color: theme.colors.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  saveSnippetActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 16,
    marginTop: 16,
  },
  saveSnippetCancelText: {
    color: theme.colors.textSubtle,
    fontSize: 14,
    fontWeight: '500',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  saveSnippetSaveText: {
    color: theme.colors.success,
    fontSize: 14,
    fontWeight: '600',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
});
