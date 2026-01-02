import { useQuery } from "@tanstack/react-query";
import { Link, router } from "expo-router";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { getConnections } from "../lib/storage/connections";
import type { ConnectionConfig } from "../lib/types";
import { useConnectionStore } from "../stores/connection";

const DatabaseIcon = ({ type }: { type: string }) => {
  const icon = type === "postgres" ? "🐘" : "🐬";
  return <Text style={styles.icon}>{icon}</Text>;
};

const ConnectionItem = ({ connection }: { connection: ConnectionConfig }) => {
  const { activeConnections, connect } = useConnectionStore();
  const activeConnection = activeConnections.get(connection.id);
  const isConnected = activeConnection?.state.status === "connected";

  const handlePress = async () => {
    if (isConnected) {
      router.push(`/query/${connection.id}`);
    } else {
      router.push(`/connection/${connection.id}`);
    }
  };

  return (
    <Pressable
      style={({ pressed }) => [
        styles.connectionItem,
        pressed && styles.connectionItemPressed,
      ]}
      onPress={handlePress}
    >
      <DatabaseIcon type={connection.type} />
      <View style={styles.connectionInfo}>
        <Text style={styles.connectionName}>{connection.name}</Text>
        <Text style={styles.connectionDetails}>
          {connection.host}:{connection.port}/{connection.database}
        </Text>
      </View>
      <View
        style={[
          styles.statusIndicator,
          isConnected ? styles.statusConnected : styles.statusDisconnected,
        ]}
      />
    </Pressable>
  );
};

export default function HomeScreen() {
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["connections"],
    queryFn: getConnections,
  });

  return (
    <View style={styles.container}>
      {connections.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🗄️</Text>
          <Text style={styles.emptyTitle}>No Connections</Text>
          <Text style={styles.emptyDescription}>
            Add a database connection to get started
          </Text>
          <Link href="/connection/new" asChild>
            <Pressable style={styles.addButton}>
              <Text style={styles.addButtonText}>+ Add Connection</Text>
            </Pressable>
          </Link>
        </View>
      ) : (
        <>
          <FlatList
            data={connections}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ConnectionItem connection={item} />}
            contentContainerStyle={styles.list}
          />
          <Link href="/connection/new" asChild>
            <Pressable style={styles.fab}>
              <Text style={styles.fabText}>+</Text>
            </Pressable>
          </Link>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#16213e",
  },
  list: {
    padding: 16,
    gap: 12,
  },
  connectionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  connectionItemPressed: {
    opacity: 0.8,
  },
  icon: {
    fontSize: 32,
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  connectionDetails: {
    color: "#888",
    fontSize: 12,
    marginTop: 4,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusConnected: {
    backgroundColor: "#4ade80",
  },
  statusDisconnected: {
    backgroundColor: "#6b7280",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyDescription: {
    color: "#888",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: "#4f46e5",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#4f46e5",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabText: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "300",
  },
});
