import { useQuery, useQueryClient } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
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

export default function ConnectionDetailScreen() {
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
        <ActivityIndicator size="large" color="#4f46e5" />
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
        <Text style={styles.icon}>
          {connection.type === "postgres" ? "🐘" : "🐬"}
        </Text>
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
        <InfoRow label="Type" value={connection.type.toUpperCase()} />
        <InfoRow label="Host" value={connection.host} />
        <InfoRow label="Port" value={connection.port.toString()} />
        <InfoRow label="Database" value={connection.database} />
        <InfoRow label="Username" value={connection.username} />
        <InfoRow label="SSL" value={connection.ssl ? "Enabled" : "Disabled"} />
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

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#16213e",
  },
  content: {
    padding: 16,
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#16213e",
  },
  header: {
    alignItems: "center",
    paddingVertical: 24,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  name: {
    color: "#fff",
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
    backgroundColor: "#22c55e20",
  },
  statusDisconnected: {
    backgroundColor: "#6b728020",
  },
  statusText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "500",
  },
  infoSection: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ffffff10",
  },
  infoLabel: {
    color: "#888",
    fontSize: 14,
  },
  infoValue: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "500",
  },
  actions: {
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#4f46e5",
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
    backgroundColor: "#1a1a2e",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "500",
  },
  dangerButton: {
    backgroundColor: "#dc262620",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  dangerButtonText: {
    color: "#ef4444",
    fontSize: 16,
    fontWeight: "500",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
    textAlign: "center",
    marginTop: 24,
  },
});
