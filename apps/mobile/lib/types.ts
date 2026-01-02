export type DatabaseType =
  | "postgres"
  | "mysql"
  | "mariadb"
  | "sqlite"
  | "cockroachdb"
  | "mongodb";

export interface SslConfig {
  enabled: boolean;
  rejectUnauthorized: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

export const CONNECTION_COLORS = [
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
] as const;

export type ConnectionColor = (typeof CONNECTION_COLORS)[number];

export interface ConnectionConfig {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean | SslConfig;
  color?: ConnectionColor;
  createdAt: number;
  updatedAt: number;
}

export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTime: number;
  command: string;
}

export interface ColumnInfo {
  name: string;
  type: string;
  tableId?: number;
}

export interface TableInfo {
  schema: string;
  name: string;
  type: "table" | "view";
  rowCount?: number;
}

export interface DatabaseInfo {
  name: string;
  owner?: string;
  encoding?: string;
}

export interface ConnectionState {
  status: "disconnected" | "connecting" | "connected" | "error";
  error?: string;
}

export interface DatabaseConnection {
  config: ConnectionConfig;
  state: ConnectionState;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  query(sql: string): Promise<QueryResult>;
  listDatabases(): Promise<DatabaseInfo[]>;
  listTables(schema?: string): Promise<TableInfo[]>;
  describeTable(schema: string, table: string): Promise<ColumnInfo[]>;
}
