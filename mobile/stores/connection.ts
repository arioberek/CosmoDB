import { create } from "zustand";
import Constants, { ExecutionEnvironment } from "expo-constants";
import type {
  ConnectionConfig,
  ConnectionState,
  DatabaseConnection,
  QueryResult,
} from "../lib/types";
import { PostgresConnection } from "../lib/protocols/postgres/connection";
import { MySQLConnection } from "../lib/protocols/mysql/connection";
import { SQLiteConnection } from "../lib/protocols/sqlite/connection";
import { MongoDBConnection } from "../lib/protocols/mongodb/connection";
import { MockConnection } from "../lib/protocols/mock/connection";
import { formatConnectionError, formatQueryError } from "../lib/errors";

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

type ConnectionFactory = (config: ConnectionConfig) => DatabaseConnection;

const connectionFactories: Record<string, ConnectionFactory> = {
  postgres: (config) => new PostgresConnection(config),
  cockroachdb: (config) => new PostgresConnection(config),
  mysql: (config) => new MySQLConnection(config),
  mariadb: (config) => new MySQLConnection(config),
  sqlite: (config) => new SQLiteConnection(config),
  mongodb: (config) => new MongoDBConnection(config),
};

interface ActiveConnection {
  config: ConnectionConfig;
  instance: DatabaseConnection;
  state: ConnectionState;
}

interface ConnectionStore {
  activeConnections: Map<string, ActiveConnection>;
  currentConnectionId: string | null;

  connect: (config: ConnectionConfig) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  disconnectAll: () => Promise<void>;
  setCurrentConnection: (id: string | null) => void;
  getCurrentConnection: () => ActiveConnection | null;
  executeQuery: (connectionId: string, sql: string) => Promise<QueryResult>;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  activeConnections: new Map(),
  currentConnectionId: null,

  connect: async (config: ConnectionConfig) => {
    const existing = get().activeConnections.get(config.id);
    if (existing?.state.status === "connected") {
      set({ currentConnectionId: config.id });
      return;
    }

    let instance: DatabaseConnection;

    if (isExpoGo) {
      instance = new MockConnection(config);
    } else {
      const factory = connectionFactories[config.type];
      if (!factory) {
        throw new Error(`Unknown database type: ${config.type}`);
      }
      instance = factory(config);
    }

    const activeConnection: ActiveConnection = {
      config,
      instance,
      state: { status: "connecting" },
    };

    set((state) => ({
      activeConnections: new Map(state.activeConnections).set(
        config.id,
        activeConnection
      ),
    }));

    try {
      await instance.connect();

      set((state) => {
        const connections = new Map(state.activeConnections);
        const conn = connections.get(config.id);
        if (conn) {
          conn.state = { status: "connected" };
        }
        return {
          activeConnections: connections,
          currentConnectionId: config.id,
        };
      });
    } catch (error) {
      const errorMessage = formatConnectionError(error, config.type);
      set((state) => {
        const connections = new Map(state.activeConnections);
        const conn = connections.get(config.id);
        if (conn) {
          conn.state = {
            status: "error",
            error: errorMessage,
          };
        }
        return { activeConnections: connections };
      });
      throw new Error(errorMessage);
    }
  },

  disconnect: async (id: string) => {
    const connection = get().activeConnections.get(id);
    if (!connection) return;

    try {
      await connection.instance.disconnect();
    } catch {}

    set((state) => {
      const connections = new Map(state.activeConnections);
      connections.delete(id);
      return {
        activeConnections: connections,
        currentConnectionId:
          state.currentConnectionId === id ? null : state.currentConnectionId,
      };
    });
  },

  disconnectAll: async () => {
    const connections = get().activeConnections;
    for (const [id] of connections) {
      await get().disconnect(id);
    }
  },

  setCurrentConnection: (id: string | null) => {
    set({ currentConnectionId: id });
  },

  getCurrentConnection: () => {
    const { activeConnections, currentConnectionId } = get();
    if (!currentConnectionId) return null;
    return activeConnections.get(currentConnectionId) || null;
  },

  executeQuery: async (connectionId: string, sql: string) => {
    const connection = get().activeConnections.get(connectionId);
    if (!connection) {
      throw new Error("Connection not found");
    }
    if (connection.state.status !== "connected") {
      throw new Error("Not connected");
    }

    try {
      return await connection.instance.query(sql);
    } catch (error) {
      throw new Error(formatQueryError(error, connection.config.type));
    }
  },
}));
