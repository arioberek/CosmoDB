import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  deleteConnection,
  getConnectionWithPassword,
} from "../../lib/storage/connections";
import { useConnectionStore } from "../../stores/connection";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../lib/theme";
import { DatabaseIcon } from "../../components/database-icon";

export default function ConnectionDetailScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const { connect, activeConnections, disconnect } = useConnectionStore();

  const { data: connection, isLoading } = useQuery({
    queryKey: ["connection", id],
    queryFn: () => getConnectionWithPassword(id!),
    enabled: !!id,
  });

  const activeConnection = id ? activeConnections.get(id) : null;
  const isConnected = activeConnection?.state.status === "connected";

  const handleConnect = async () => {
    if (!connection) return;

    setConnecting(true);
    try {
      await connect(connection);
      router.replace(`/query/${connection.id}`);
    } catch (error) {
      Alert.alert(
        "Connection Failed",
        error instanceof Error ? error.message : "Failed to connect"
      );
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!id) return;
    await disconnect(id);
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Connection",
      "Are you sure you want to delete this connection?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (!id) return;
            await disconnect(id);
            await deleteConnection(id);
            await queryClient.invalidateQueries({ queryKey: ["connections"] });
            router.back();
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!connection) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Connection not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.iconContainer}>
          <DatabaseIcon type={connection.type} size={64} color={theme.colors.text} />
        </View>
        <Text style={styles.name}>{connection.name}</Text>
        <View
          style={[
            styles.statusBadge,
            isConnected ? styles.statusConnected : styles.statusDisconnected,
          ]}
        >
          <Text style={styles.statusText}>
            {isConnected ? "Connected" : "Disconnected"}
          </Text>
        </View>
      </View>

      <View style={styles.infoSection}>
        <InfoRow
          label="Type"
          value={connection.type.toUpperCase()}
          styles={styles}
        />
        <InfoRow label="Host" value={connection.host} styles={styles} />
        <InfoRow label="Port" value={connection.port.toString()} styles={styles} />
        <InfoRow label="Database" value={connection.database} styles={styles} />
        <InfoRow label="Username" value={connection.username} styles={styles} />
        <InfoRow label="SSL" value={connection.ssl ? "Enabled" : "Disabled"} styles={styles} />
      </View>

      <View style={styles.actions}>
        {isConnected ? (
          <>
            <Pressable
              style={styles.primaryButton}
              onPress={() => router.push(`/query/${connection.id}`)}
            >
              <Text style={styles.primaryButtonText}>Open Query Editor</Text>
            </Pressable>
            <Pressable
              style={styles.secondaryButton}
              onPress={handleDisconnect}
            >
              <Text style={styles.secondaryButtonText}>Disconnect</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            style={[styles.primaryButton, connecting && styles.buttonDisabled]}
            onPress={handleConnect}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>Connect</Text>
            )}
          </Pressable>
        )}

        <Pressable style={styles.dangerButton} onPress={handleDelete}>
          <Text style={styles.dangerButtonText}>Delete Connection</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const InfoRow = ({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof createStyles>;
}) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.background,
  },
  header: {
    alignItems: "center",
    paddingVertical: 24,
  },
  iconContainer: {
    marginBottom: 16,
  },
  name: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "600",
    marginBottom: 12,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusConnected: {
    backgroundColor: theme.colors.successMuted,
  },
  statusDisconnected: {
    backgroundColor: theme.colors.primaryMuted,
  },
  statusText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "500",
  },
  infoSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  infoLabel: {
    color: theme.colors.textSubtle,
    fontSize: 14,
  },
  infoValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "500",
  },
  dangerButton: {
    backgroundColor: theme.colors.dangerMuted,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  dangerButtonText: {
    color: theme.colors.danger,
    fontSize: 16,
    fontWeight: "500",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 16,
    textAlign: "center",
    marginTop: 24,
  },
});
