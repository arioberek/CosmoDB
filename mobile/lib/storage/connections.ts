import * as SecureStore from "expo-secure-store";
import type { ConnectionConfig } from "../types";

const CONNECTIONS_KEY = "cosmq_connections";
const PASSWORD_PREFIX = "cosmq_pwd_";

export async function saveConnection(
  connection: ConnectionConfig
): Promise<void> {
  const connections = await getConnections();
  const existingIndex = connections.findIndex((c) => c.id === connection.id);

  // Store password separately in secure storage
  await SecureStore.setItemAsync(
    `${PASSWORD_PREFIX}${connection.id}`,
    connection.password
  );

  // Remove password from the main config before storing
  const configWithoutPassword = { ...connection, password: "" };

  if (existingIndex >= 0) {
    connections[existingIndex] = configWithoutPassword;
  } else {
    connections.push(configWithoutPassword);
  }

  await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(connections));
}

export async function getConnections(): Promise<ConnectionConfig[]> {
  const data = await SecureStore.getItemAsync(CONNECTIONS_KEY);
  if (!data) return [];

  try {
    return JSON.parse(data) as ConnectionConfig[];
  } catch {
    return [];
  }
}

export async function getConnectionWithPassword(
  id: string
): Promise<ConnectionConfig | null> {
  const connections = await getConnections();
  const connection = connections.find((c) => c.id === id);

  if (!connection) return null;

  const password = await SecureStore.getItemAsync(`${PASSWORD_PREFIX}${id}`);
  return { ...connection, password: password || "" };
}

export async function deleteConnection(id: string): Promise<void> {
  const connections = await getConnections();
  const filtered = connections.filter((c) => c.id !== id);

  await SecureStore.deleteItemAsync(`${PASSWORD_PREFIX}${id}`);
  await SecureStore.setItemAsync(CONNECTIONS_KEY, JSON.stringify(filtered));
}

export function generateConnectionId(): string {
  return `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
