import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { QueryResult } from "../../lib/types";
import { useConnectionStore } from "../../stores/connection";

export default function QueryScreen() {
  const { connectionId } = useLocalSearchParams<{ connectionId: string }>();
  const [query, setQuery] = useState("SELECT 1 as test;");
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
        <TextInput
          style={styles.editor}
          value={query}
          onChangeText={setQuery}
          placeholder="Enter SQL query..."
          placeholderTextColor="#666"
          multiline
          textAlignVertical="top"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          style={[styles.runButton, executing && styles.runButtonDisabled]}
          onPress={handleExecute}
          disabled={executing}
        >
          {executing ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.runButtonText}>▶ Run</Text>
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
                {result.rowCount} rows • {result.executionTime}ms
              </Text>
              <Text style={styles.metaText}>{result.command}</Text>
            </View>

            {result.columns.length > 0 && (
              <ScrollView horizontal style={styles.tableContainer}>
                <View>
                  <View style={styles.tableHeader}>
                    {result.columns.map((col, i) => (
                      <View key={i} style={styles.headerCell}>
                        <Text style={styles.headerText}>{col.name}</Text>
                        <Text style={styles.typeText}>{col.type}</Text>
                      </View>
                    ))}
                  </View>
                  <FlatList
                    data={result.rows}
                    keyExtractor={(_, i) => i.toString()}
                    renderItem={({ item }) => (
                      <View style={styles.tableRow}>
                        {result.columns.map((col, i) => (
                          <View key={i} style={styles.cell}>
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
            <Text style={styles.placeholderIcon}>📊</Text>
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
  editor: {
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    fontSize: 14,
    fontFamily: "monospace",
    minHeight: 100,
    maxHeight: 200,
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
    fontFamily: "monospace",
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
  placeholderIcon: {
    fontSize: 48,
    marginBottom: 16,
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
