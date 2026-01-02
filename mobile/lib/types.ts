export type DatabaseType = "postgres" | "mysql";

export interface ConnectionConfig {
  id: string;
  name: string;
  type: DatabaseType;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl: boolean;
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
