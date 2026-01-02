import { useQuery } from "@tanstack/react-query";
import { Link, Stack, router } from "expo-router";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMemo } from "react";
import { getConnections } from "../lib/storage/connections";
import type { ConnectionConfig } from "../lib/types";
import { useConnectionStore } from "../stores/connection";
import { useTheme } from "../hooks/useTheme";
import type { Theme } from "../lib/theme";
import { DatabaseIcon } from "../components/database-icon";

type HomeStyles = ReturnType<typeof createStyles>;

const ConnectionItem = ({
  connection,
  styles,
  theme,
}: {
  connection: ConnectionConfig;
  styles: HomeStyles;
  theme: Theme;
}) => {
  const { activeConnections } = useConnectionStore();
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
      <DatabaseIcon type={connection.type} size={32} color={theme.colors.text} />
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
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["connections"],
    queryFn: getConnections,
  });

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              onPress={() => router.push("/settings")}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.headerButtonPressed,
              ]}
            >
              <Text style={styles.headerButtonText}>⚙️</Text>
            </Pressable>
          ),
        }}
      />
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
            renderItem={({ item }) => (
              <ConnectionItem connection={item} styles={styles} theme={theme} />
            )}
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

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  connectionItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    gap: 12,
  },
  connectionItemPressed: {
    opacity: 0.8,
  },
  connectionInfo: {
    flex: 1,
  },
  connectionName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "600",
  },
  connectionDetails: {
    color: theme.colors.textSubtle,
    fontSize: 12,
    marginTop: 4,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  statusConnected: {
    backgroundColor: theme.colors.success,
  },
  statusDisconnected: {
    backgroundColor: theme.colors.disabled,
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
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
  },
  emptyDescription: {
    color: theme.colors.textSubtle,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: theme.colors.primary,
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
    backgroundColor: theme.colors.primary,
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
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  headerButtonPressed: {
    backgroundColor: theme.colors.primaryMuted,
  },
  headerButtonText: {
    color: theme.colors.text,
    fontSize: 18,
  },
});
