import { useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import * as LegacyFileSystem from "expo-file-system/legacy";
import { router } from "expo-router";
import type { FC } from "react";
import { useMemo, useState } from "react";
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
import type { SvgProps } from "react-native-svg";
import {
  generateConnectionId,
  saveConnection,
} from "../../lib/storage/connections";
import type { ConnectionConfig, ConnectionColor, DatabaseType } from "../../lib/types";
import { CONNECTION_COLORS } from "../../lib/types";
import { useTheme } from "../../hooks/useTheme";
import type { Theme } from "../../lib/theme";
import { useConnectionStore } from "../../stores/connection";
import PostgresqlIcon from "../../assets/icons/postgresql.svg";
import MysqlIcon from "../../assets/icons/mysql.svg";
import MariadbIcon from "../../assets/icons/mariadb.svg";
import SqliteIcon from "../../assets/icons/sqlite.svg";
import CockroachdbIcon from "../../assets/icons/cockroachdb.svg";
import MongodbIcon from "../../assets/icons/mongodb.svg";

const DEFAULT_PORTS: Record<DatabaseType, number> = {
  postgres: 5432,
  mysql: 3306,
  mariadb: 3306,
  sqlite: 0,
  cockroachdb: 26257,
  mongodb: 27017,
};

const DATABASE_OPTIONS: Array<{
  type: DatabaseType;
  label: string;
  Icon: FC<SvgProps>;
}> = [
  { type: "postgres", label: "PostgreSQL", Icon: PostgresqlIcon },
  { type: "mysql", label: "MySQL", Icon: MysqlIcon },
  { type: "mariadb", label: "MariaDB", Icon: MariadbIcon },
  { type: "sqlite", label: "SQLite", Icon: SqliteIcon },
  { type: "cockroachdb", label: "CockroachDB", Icon: CockroachdbIcon },
  { type: "mongodb", label: "MongoDB", Icon: MongodbIcon },
];

type ParsedConnectionUrl = {
  type?: DatabaseType;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
};

const URL_PROTOCOL_TO_TYPE: Record<string, DatabaseType> = {
  postgres: "postgres",
  postgresql: "postgres",
  mysql: "mysql",
  mariadb: "mariadb",
  sqlite: "sqlite",
  file: "sqlite",
  cockroachdb: "cockroachdb",
  crdb: "cockroachdb",
  mongodb: "mongodb",
  "mongodb+srv": "mongodb",
};

const parseSslValue = (value: string | null): boolean | undefined => {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (["disable", "false", "0", "no", "off"].includes(normalized)) {
    return false;
  }
  return true;
};

const parseConnectionUrl = (
  rawValue: string,
  fallbackType: DatabaseType
): ParsedConnectionUrl | null => {
  const trimmed = rawValue.trim();
  if (!trimmed) return null;

  let url: URL | null = null;
  try {
    url = new URL(trimmed);
  } catch {
    if (!trimmed.includes("://")) {
      try {
        url = new URL(`${fallbackType}://${trimmed}`);
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }

  if (!url) return null;

  const protocol = url.protocol.replace(":", "").toLowerCase();
  const type = URL_PROTOCOL_TO_TYPE[protocol];
  if (!type) return null;

  const host = url.hostname || undefined;
  const port = url.port ? Number(url.port) : undefined;
  const database = url.pathname
    ? url.pathname.replace(/^\/+/, "") || undefined
    : undefined;
  const username = url.username || undefined;
  const password = url.password || undefined;
  const ssl =
    parseSslValue(url.searchParams.get("sslmode")) ??
    parseSslValue(url.searchParams.get("ssl"));

  return {
    type,
    host,
    port,
    database,
    username,
    password,
    ssl,
  };
};

const isSqlite = (dbType: DatabaseType) => dbType === "sqlite";

const SQLITE_MAGIC_HEADER = "SQLite format 3";

const validateSqliteFile = async (uri: string): Promise<boolean> => {
  try {
    const base64Header = await LegacyFileSystem.readAsStringAsync(uri, {
      encoding: LegacyFileSystem.EncodingType.Base64,
      length: 16,
      position: 0,
    });
    const header = atob(base64Header);
    return header.startsWith(SQLITE_MAGIC_HEADER);
  } catch {
    return false;
  }
};

const pickDatabaseFile = async (): Promise<string | null> => {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/x-sqlite3", "application/vnd.sqlite3", "application/octet-stream"],
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) {
      return null;
    }

    const uri = result.assets[0].uri;
    const isValid = await validateSqliteFile(uri);

    if (!isValid) {
      Alert.alert(
        "Invalid File",
        "The selected file is not a valid SQLite database. Please select a .db, .sqlite, or .sqlite3 file."
      );
      return null;
    }

    return uri;
  } catch {
    return null;
  }
};

export default function NewConnectionScreen() {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const { connect, disconnect } = useConnectionStore();

  const [connectionUrl, setConnectionUrl] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<DatabaseType>("postgres");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(DEFAULT_PORTS.postgres.toString());
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ssl, setSsl] = useState(false);
  const [color, setColor] = useState<ConnectionColor | undefined>(undefined);

  const handleTypeChange = (newType: DatabaseType) => {
    setType(newType);
    const newPort = DEFAULT_PORTS[newType];
    setPort(newPort > 0 ? newPort.toString() : "");
  };

  const handleUrlChange = (value: string) => {
    setConnectionUrl(value);
    const parsed = parseConnectionUrl(value, type);
    if (!parsed) return;

    if (parsed.type && parsed.type !== type) {
      setType(parsed.type);
      if (parsed.port !== undefined) {
        setPort(parsed.port.toString());
      } else {
        const newPort = DEFAULT_PORTS[parsed.type];
        setPort(newPort > 0 ? newPort.toString() : "");
      }
    } else if (parsed.port !== undefined) {
      setPort(parsed.port.toString());
    }

    if (parsed.host) setHost(parsed.host);
    if (parsed.database) setDatabase(parsed.database);
    if (parsed.username) setUsername(parsed.username);
    if (parsed.password) setPassword(parsed.password);
    if (parsed.ssl !== undefined) setSsl(parsed.ssl);
  };

  const handleTestConnection = async () => {
    if (!isSqlite(type)) {
      if (!host.trim()) {
        Alert.alert("Error", "Host is required");
        return;
      }
      if (!username.trim()) {
        Alert.alert("Error", "Username is required");
        return;
      }
    }

    if (!database.trim()) {
      Alert.alert(
        "Error",
        isSqlite(type)
          ? "Database file path is required"
          : "Database name is required"
      );
      return;
    }

    setTesting(true);
    const testId = `test_${Date.now()}`;

    try {
      const testConfig: ConnectionConfig = {
        id: testId,
        name: name.trim() || "Test Connection",
        type,
        host: isSqlite(type) ? "" : host.trim(),
        port: isSqlite(type) ? 0 : parseInt(port, 10) || DEFAULT_PORTS[type],
        database: database.trim(),
        username: isSqlite(type) ? "" : username.trim(),
        password: isSqlite(type) ? "" : password,
        ssl: isSqlite(type) ? false : ssl,
        color,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await connect(testConfig);
      Alert.alert("Success", "Connection successful!");
    } catch (error) {
      Alert.alert(
        "Connection Failed",
        error instanceof Error ? error.message : "Failed to connect"
      );
    } finally {
      try {
        await disconnect(testId);
      } catch {
      }
      setTesting(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert("Error", "Connection name is required");
      return;
    }

    if (!isSqlite(type)) {
      if (!host.trim()) {
        Alert.alert("Error", "Host is required");
        return;
      }
      if (!username.trim()) {
        Alert.alert("Error", "Username is required");
        return;
      }
    }

    if (!database.trim()) {
      Alert.alert(
        "Error",
        isSqlite(type)
          ? "Database file path is required"
          : "Database name is required"
      );
      return;
    }

    setSaving(true);

    try {
      const connection: ConnectionConfig = {
        id: generateConnectionId(),
        name: name.trim(),
        type,
        host: isSqlite(type) ? "" : host.trim(),
        port: isSqlite(type) ? 0 : parseInt(port, 10) || DEFAULT_PORTS[type],
        database: database.trim(),
        username: isSqlite(type) ? "" : username.trim(),
        password: isSqlite(type) ? "" : password,
        ssl: isSqlite(type) ? false : ssl,
        color,
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
            placeholderTextColor={theme.colors.placeholder}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Color Tag (Optional)</Text>
          <View style={styles.colorGrid}>
            <Pressable
              style={[
                styles.colorOption,
                !color && styles.colorOptionActive,
              ]}
              onPress={() => setColor(undefined)}
            >
              <Text style={styles.colorNoneText}>None</Text>
            </Pressable>
            {CONNECTION_COLORS.map((c) => (
              <Pressable
                key={c}
                style={[
                  styles.colorOption,
                  { backgroundColor: c },
                  color === c && styles.colorOptionActive,
                ]}
                onPress={() => setColor(c)}
              />
            ))}
          </View>
        </View>

        {!isSqlite(type) && (
          <View style={styles.section}>
            <Text style={styles.label}>Connection URL</Text>
            <TextInput
              style={styles.input}
              value={connectionUrl}
              onChangeText={handleUrlChange}
              placeholder="postgres://user:pass@host:5432/db?sslmode=require"
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>Database Type</Text>
          <View style={styles.typeGrid}>
            {DATABASE_OPTIONS.map((option) => (
              <Pressable
                key={option.type}
                style={[
                  styles.typeButton,
                  type === option.type && styles.typeButtonActive,
                ]}
                onPress={() => handleTypeChange(option.type)}
              >
                <View style={styles.typeIconContainer}>
                  <option.Icon width={24} height={24} fill={theme.colors.text} />
                </View>
                <Text
                  style={[
                    styles.typeText,
                    type === option.type && styles.typeTextActive,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {!isSqlite(type) && (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>Host</Text>
              <TextInput
              style={styles.input}
              value={host}
              onChangeText={setHost}
              placeholder="localhost"
              placeholderTextColor={theme.colors.placeholder}
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
              placeholderTextColor={theme.colors.placeholder}
              keyboardType="number-pad"
            />
          </View>
          </>
        )}

        <View style={styles.section}>
          <Text style={styles.label}>
            {isSqlite(type) ? "Database File" : "Database"}
          </Text>
          <View style={isSqlite(type) ? styles.inputRow : undefined}>
            <TextInput
              style={[styles.input, isSqlite(type) && styles.inputFlex]}
              value={database}
              onChangeText={setDatabase}
              placeholder={isSqlite(type) ? "local.db" : "mydb"}
              placeholderTextColor={theme.colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {isSqlite(type) && (
              <Pressable
                style={styles.browseButton}
                onPress={async () => {
                  const uri = await pickDatabaseFile();
                  if (uri) setDatabase(uri);
                }}
              >
                <Text style={styles.browseButtonText}>Browse</Text>
              </Pressable>
            )}
          </View>
        </View>

        {!isSqlite(type) && (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>Username</Text>
              <TextInput
              style={styles.input}
              value={username}
              onChangeText={setUsername}
              placeholder={type === "mongodb" ? "admin" : "postgres"}
              placeholderTextColor={theme.colors.placeholder}
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
              placeholderTextColor={theme.colors.placeholder}
              secureTextEntry
            />
          </View>

          <View style={styles.switchSection}>
            <Text style={styles.label}>Use SSL/TLS</Text>
            <Switch
              value={ssl}
              onValueChange={setSsl}
              trackColor={{
                false: theme.colors.surfaceMuted,
                true: theme.colors.primary,
              }}
              thumbColor="#fff"
            />
          </View>
          </>
        )}

        <Pressable
          style={[styles.testButton, (testing || saving) && styles.testButtonDisabled]}
          onPress={handleTestConnection}
          disabled={testing || saving}
        >
          <Text style={styles.testButtonText}>
            {testing ? "Testing..." : "Test Connection"}
          </Text>
        </Pressable>

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

const createStyles = (theme: Theme) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
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
    color: theme.colors.textMuted,
    fontSize: 14,
    fontWeight: "500",
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 12,
    color: theme.colors.text,
    fontSize: 16,
  },
  inputRow: {
    flexDirection: "row",
    gap: 8,
  },
  inputFlex: {
    flex: 1,
  },
  browseButton: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 16,
    justifyContent: "center",
  },
  browseButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "500",
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  typeButton: {
    width: "31%",
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 12,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  typeButtonActive: {
    borderColor: theme.colors.primary,
  },
  typeIconContainer: {
    marginBottom: 4,
  },
  typeText: {
    color: theme.colors.textSubtle,
    fontSize: 11,
    fontWeight: "500",
    textAlign: "center",
  },
  typeTextActive: {
    color: theme.colors.text,
  },
  switchSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  colorOption: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: theme.colors.surface,
  },
  colorOptionActive: {
    borderColor: theme.colors.text,
  },
  colorNoneText: {
    color: theme.colors.textMuted,
    fontSize: 10,
    fontWeight: "500",
  },
  testButton: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  testButtonDisabled: {
    opacity: 0.6,
  },
  testButtonText: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
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
