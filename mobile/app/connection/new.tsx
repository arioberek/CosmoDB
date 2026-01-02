import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  generateConnectionId,
  saveConnection,
} from "../../lib/storage/connections";
import type { ConnectionConfig, DatabaseType } from "../../lib/types";

const DEFAULT_PORTS: Record<DatabaseType, number> = {
  postgres: 5432,
  mysql: 3306,
};

export default function NewConnectionScreen() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<DatabaseType>("postgres");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(DEFAULT_PORTS.postgres.toString());
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(false);

  const handleTypeChange = (newType: DatabaseType) => {
    setType(newType);
    setPort(DEFAULT_PORTS[newType].toString());
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Connection name is required");
      return;
    }
    if (!host.trim()) {
      Alert.alert("Error", "Host is required");
      return;
    }
    if (!database.trim()) {
      Alert.alert("Error", "Database name is required");
      return;
    }
    if (!username.trim()) {
      Alert.alert("Error", "Username is required");
      return;
    }

    setSaving(true);

    try {
      const connection: ConnectionConfig = {
        id: generateConnectionId(),
        name: name.trim(),
        type,
        host: host.trim(),
        port: parseInt(port, 10) || DEFAULT_PORTS[type],
        database: database.trim(),
        username: username.trim(),
        password,
        ssl,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await saveConnection(connection);
      await queryClient.invalidateQueries({ queryKey: ["connections"] });

      router.back();
    } catch (error) {
      Alert.alert(
        "Error",
        error instanceof Error ? error.message : "Failed to save connection"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={styles.container}
    >
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.section}>
          <Text style={styles.label}>Connection Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="My Database"
            placeholderTextColor="#666"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Database Type</Text>
          <View style={styles.typeSelector}>
            <Pressable
              style={[
                styles.typeButton,
                type === "postgres" && styles.typeButtonActive,
              ]}
              onPress={() => handleTypeChange("postgres")}
            >
              <Text style={styles.typeEmoji}>🐘</Text>
              <Text
                style={[
                  styles.typeText,
                  type === "postgres" && styles.typeTextActive,
                ]}
              >
                PostgreSQL
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.typeButton,
                type === "mysql" && styles.typeButtonActive,
              ]}
              onPress={() => handleTypeChange("mysql")}
            >
              <Text style={styles.typeEmoji}>🐬</Text>
              <Text
                style={[
                  styles.typeText,
                  type === "mysql" && styles.typeTextActive,
                ]}
              >
                MySQL
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Host</Text>
          <TextInput
            style={styles.input}
            value={host}
            onChangeText={setHost}
            placeholder="localhost"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Port</Text>
          <TextInput
            style={styles.input}
            value={port}
            onChangeText={setPort}
            placeholder={DEFAULT_PORTS[type].toString()}
            placeholderTextColor="#666"
            keyboardType="number-pad"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Database</Text>
          <TextInput
            style={styles.input}
            value={database}
            onChangeText={setDatabase}
            placeholder="mydb"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="postgres"
            placeholderTextColor="#666"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor="#666"
            secureTextEntry
          />
        </View>

        <View style={styles.switchSection}>
          <Text style={styles.label}>Use SSL/TLS</Text>
          <Switch
            value={ssl}
            onValueChange={setSsl}
            trackColor={{ false: "#333", true: "#4f46e5" }}
            thumbColor="#fff"
          />
        </View>

        <Pressable
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? "Saving..." : "Save Connection"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#16213e",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 8,
  },
  label: {
    color: "#ccc",
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 12,
    color: "#fff",
    fontSize: 16,
  },
  typeSelector: {
    flexDirection: "row",
    gap: 12,
  },
  typeButton: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    borderRadius: 8,
    padding: 16,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  typeButtonActive: {
    borderColor: "#4f46e5",
  },
  typeEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  typeText: {
    color: "#888",
    fontSize: 14,
    fontWeight: "500",
  },
  typeTextActive: {
    color: "#fff",
  },
  switchSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  saveButton: {
    backgroundColor: "#4f46e5",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
