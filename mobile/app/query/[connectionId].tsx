import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams } from "expo-router";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from "react-native";
import type { QueryResult } from "../../lib/types";
import { useConnectionStore } from "../../stores/connection";

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
}

const SqlEditor = ({ value, onChangeText, placeholder }: SqlEditorProps) => {
  const [cursorPosition, setCursorPosition] = useState(0);
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const cursorRef = useRef(0);

  const tokens = useMemo(() => tokenizeSql(value), [value]);
  
  const currentWordInfo = useMemo(() => getCurrentWord(value, cursorPosition), [value, cursorPosition]);
  
  const suggestions = useMemo(
    () => getSuggestions(value, cursorPosition, currentWordInfo.word),
    [value, cursorPosition, currentWordInfo.word]
  );

  const handleSelectionChange = useCallback((event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
    const { start } = event.nativeEvent.selection;
    cursorRef.current = start;
    setCursorPosition(start);
    const wordInfo = getCurrentWord(value, start);
    const filtered = getSuggestions(value, start, wordInfo.word);
    setShowAutocomplete(filtered.length > 0);
  }, [value]);

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
            placeholderTextColor="#666"
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            selectionColor="#c678dd"
          />
        </View>
      </View>

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
    </View>
  );
};

export default function QueryScreen() {
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);

  const { activeConnections, executeQuery } = useConnectionStore();
  const connection = connectionId ? activeConnections.get(connectionId) : null;

  const handleExecute = async () => {
    if (!connectionId || !query.trim()) return;

    setExecuting(true);
    setError(null);
    setResult(null);

    try {
      const queryResult = await executeQuery(connectionId, query.trim());
      setResult(queryResult);
    } catch (err) {
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
        />
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

      <View style={styles.resultsContainer}>
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
        )}

        {result && (
          <>
            <View style={styles.resultsMeta}>
              <Text style={styles.metaText}>
                {result.rowCount} rows - {result.executionTime}ms
              </Text>
              <Text style={styles.metaText}>{result.command}</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#16213e",
  },
  editorContainer: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff10",
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
    backgroundColor: '#1a1a2e',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#c678dd30',
    marginRight: 6,
  },
  templateChipPressed: {
    backgroundColor: '#252545',
    borderColor: '#c678dd60',
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
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    minHeight: 100,
    maxHeight: 200,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  editorWrapperFocused: {
    borderColor: '#c678dd40',
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
    backgroundColor: '#252545',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ffffff10',
    marginRight: 6,
  },
  quickActionChipPressed: {
    backgroundColor: '#353565',
    borderColor: '#c678dd40',
  },
  quickActionText: {
    color: '#c678dd',
    fontSize: 13,
    fontFamily: 'JetBrainsMono',
  },
  autocompleteDropdown: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#252545',
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
    borderBottomColor: '#ffffff10',
  },
  autocompleteItemPressed: {
    backgroundColor: '#353565',
  },
  autocompleteText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'JetBrainsMono',
  },
  autocompleteMatch: {
    color: '#c678dd',
    fontWeight: '600',
  },
  runButton: {
    backgroundColor: "#22c55e",
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
  resultsContainer: {
    flex: 1,
    padding: 16,
  },
  resultsMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  metaText: {
    color: "#888",
    fontSize: 12,
  },
  tableContainer: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
  },
  tableWrapper: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#252545",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  headerCell: {
    width: 150,
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: "#ffffff10",
  },
  headerText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  typeText: {
    color: "#666",
    fontSize: 10,
    marginTop: 2,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff10",
  },
  cell: {
    width: 150,
    padding: 12,
    borderRightWidth: 1,
    borderRightColor: "#ffffff10",
  },
  cellText: {
    color: "#ccc",
    fontSize: 13,
    fontFamily: "JetBrainsMono",
  },
  errorContainer: {
    backgroundColor: "#dc262620",
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  errorTitle: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  errorMessage: {
    color: "#fca5a5",
    fontSize: 13,
  },
  placeholder: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#666",
    fontSize: 14,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
    textAlign: "center",
    marginTop: 24,
  },
});
