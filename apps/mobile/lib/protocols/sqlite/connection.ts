import * as SQLite from "expo-sqlite";
import type {
  ColumnInfo,
  ConnectionConfig,
  ConnectionState,
  DatabaseConnection,
  DatabaseInfo,
  QueryResult,
  TableInfo,
} from "../../types";

type SQLiteDatabase = Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;

export class SQLiteConnection implements DatabaseConnection {
  config: ConnectionConfig;
  state: ConnectionState = { status: "disconnected" };
  private db: SQLiteDatabase | null = null;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.state = { status: "connecting" };

    try {
      const dbName = this.config.database || this.config.host || "local.db";
      this.db = await SQLite.openDatabaseAsync(dbName);
      this.state = { status: "connected" };
    } catch (error) {
      this.state = {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      await this.db.closeAsync();
      this.db = null;
    }
    this.state = { status: "disconnected" };
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.db) {
      throw new Error("Not connected");
    }

    const startTime = Date.now();
    const trimmedSql = sql.trim();
    const command = trimmedSql.split(/\s+/)[0].toUpperCase();

    const isSelect =
      command === "SELECT" ||
      command === "PRAGMA" ||
      command === "EXPLAIN";

    if (isSelect) {
      const rows = await this.db.getAllAsync(trimmedSql);
      const columns = this.extractColumnsFromRows(rows);

      return {
        columns,
        rows: rows as Record<string, unknown>[],
        rowCount: rows.length,
        executionTime: Date.now() - startTime,
        command,
      };
    }

    const result = await this.db.runAsync(trimmedSql);

    return {
      columns: [],
      rows: [],
      rowCount: result.changes,
      executionTime: Date.now() - startTime,
      command,
    };
  }

  private extractColumnsFromRows(
    rows: unknown[]
  ): ColumnInfo[] {
    if (rows.length === 0) {
      return [];
    }

    const firstRow = rows[0] as Record<string, unknown>;
    return Object.keys(firstRow).map((name) => ({
      name,
      type: this.inferType(firstRow[name]),
    }));
  }

  private inferType(value: unknown): string {
    if (value === null) return "null";
    if (typeof value === "number") {
      return Number.isInteger(value) ? "integer" : "real";
    }
    if (typeof value === "boolean") return "integer";
    if (typeof value === "string") return "text";
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
      return "blob";
    }
    return "text";
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.query("PRAGMA database_list");
    return result.rows.map((row) => ({
      name: (row.name as string) || "main",
    }));
  }

  async listTables(_schema?: string): Promise<TableInfo[]> {
    const result = await this.query(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );

    return result.rows.map((row) => ({
      schema: "main",
      name: row.name as string,
      type: (row.type as string) === "view" ? "view" : "table",
    }));
  }

  async describeTable(_schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.query(`PRAGMA table_info('${table}')`);

    return result.rows.map((row) => ({
      name: row.name as string,
      type: (row.type as string).toLowerCase(),
    }));
  }
}
