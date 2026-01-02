import type {
  ColumnInfo,
  ConnectionConfig,
  ConnectionState,
  DatabaseConnection,
  DatabaseInfo,
  QueryResult,
  TableInfo,
} from "../../types";
import { TcpClient } from "../../tcp/socket";
import {
  AuthType,
  createMd5PasswordMessage,
  createPasswordMessage,
  createQueryMessage,
  createStartupMessage,
  createTerminateMessage,
  parseAuthenticationMessage,
  parseCommandComplete,
  parseDataRow,
  parseErrorResponse,
  parseMessage,
  parseRowDescription,
} from "./messages";

export class PostgresConnection implements DatabaseConnection {
  config: ConnectionConfig;
  state: ConnectionState = { status: "disconnected" };
  private client: TcpClient;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(config: ConnectionConfig) {
    this.config = config;
    this.client = new TcpClient();
  }

  async connect(): Promise<void> {
    this.state = { status: "connecting" };

    try {
      await this.client.connect({
        host: this.config.host,
        port: this.config.port,
        tls: this.config.ssl,
        timeout: 10000,
      });

      await this.authenticate();
      this.state = { status: "connected" };
    } catch (error) {
      this.state = {
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
      throw error;
    }
  }

  private async authenticate(): Promise<void> {
    const startupMessage = createStartupMessage(
      this.config.username,
      this.config.database
    );

    await this.client.send(startupMessage);

    // Wait for authentication response
    while (true) {
      const data = await this.client.receive();
      this.buffer = Buffer.concat([this.buffer, data]);

      const message = parseMessage(this.buffer);
      if (!message) continue;

      this.buffer = this.buffer.subarray(message.length + 1);

      if (message.type === "R") {
        const auth = parseAuthenticationMessage(message.payload);

        switch (auth.authType) {
          case AuthType.OK:
            // Authentication successful, wait for ReadyForQuery
            continue;

          case AuthType.CLEARTEXT_PASSWORD:
            const clearPassword = createPasswordMessage(this.config.password);
            await this.client.send(clearPassword);
            continue;

          case AuthType.MD5_PASSWORD:
            if (!auth.data) throw new Error("MD5 salt not provided");
            const md5Password = createMd5PasswordMessage(
              this.config.password,
              this.config.username,
              auth.data
            );
            await this.client.send(md5Password);
            continue;

          default:
            throw new Error(`Unsupported auth type: ${auth.authType}`);
        }
      }

      if (message.type === "E") {
        const error = parseErrorResponse(message.payload);
        throw new Error(error["M"] || "Authentication failed");
      }

      if (message.type === "Z") {
        // ReadyForQuery - connection established
        return;
      }

      // Skip other messages like ParameterStatus, BackendKeyData
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.isConnected()) {
      try {
        await this.client.send(createTerminateMessage());
      } catch {
        // Ignore errors during disconnect
      }
      await this.client.disconnect();
    }
    this.state = { status: "disconnected" };
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.client.isConnected()) {
      throw new Error("Not connected");
    }

    const startTime = Date.now();
    const queryMessage = createQueryMessage(sql);
    await this.client.send(queryMessage);

    const columns: ColumnInfo[] = [];
    const rows: Record<string, unknown>[] = [];
    let command = "";

    while (true) {
      const data = await this.client.receive();
      this.buffer = Buffer.concat([this.buffer, data]);

      while (true) {
        const message = parseMessage(this.buffer);
        if (!message) break;

        this.buffer = this.buffer.subarray(message.length + 1);

        switch (message.type) {
          case "T": {
            const fields = parseRowDescription(message.payload);
            columns.push(
              ...fields.map((f) => ({
                name: f.name,
                type: this.getTypeName(f.typeOid),
                tableId: f.tableOid,
              }))
            );
            break;
          }

          case "D": {
            const values = parseDataRow(message.payload);
            const row: Record<string, unknown> = {};
            columns.forEach((col, i) => {
              row[col.name] = values[i];
            });
            rows.push(row);
            break;
          }

          case "C": {
            command = parseCommandComplete(message.payload);
            break;
          }

          case "E": {
            const error = parseErrorResponse(message.payload);
            throw new Error(error["M"] || "Query failed");
          }

          case "I": {
            // Empty query response
            break;
          }

          case "Z": {
            // ReadyForQuery - query complete
            return {
              columns,
              rows,
              rowCount: rows.length,
              executionTime: Date.now() - startTime,
              command,
            };
          }
        }
      }
    }
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.query(
      "SELECT datname as name, pg_catalog.pg_get_userbyid(datdba) as owner, pg_encoding_to_char(encoding) as encoding FROM pg_database WHERE datistemplate = false ORDER BY datname"
    );

    return result.rows.map((row) => ({
      name: row.name as string,
      owner: row.owner as string,
      encoding: row.encoding as string,
    }));
  }

  async listTables(schema = "public"): Promise<TableInfo[]> {
    const result = await this.query(`
      SELECT
        table_schema as schema,
        table_name as name,
        CASE table_type
          WHEN 'BASE TABLE' THEN 'table'
          ELSE 'view'
        END as type
      FROM information_schema.tables
      WHERE table_schema = '${schema}'
      ORDER BY table_name
    `);

    return result.rows.map((row) => ({
      schema: row.schema as string,
      name: row.name as string,
      type: row.type as "table" | "view",
    }));
  }

  async describeTable(schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.query(`
      SELECT
        column_name as name,
        data_type as type
      FROM information_schema.columns
      WHERE table_schema = '${schema}' AND table_name = '${table}'
      ORDER BY ordinal_position
    `);

    return result.rows.map((row) => ({
      name: row.name as string,
      type: row.type as string,
    }));
  }

  private getTypeName(oid: number): string {
    // PostgreSQL type OID mapping (common types)
    const typeMap: Record<number, string> = {
      16: "boolean",
      17: "bytea",
      18: "char",
      19: "name",
      20: "bigint",
      21: "smallint",
      23: "integer",
      25: "text",
      26: "oid",
      700: "real",
      701: "double precision",
      1042: "char",
      1043: "varchar",
      1082: "date",
      1083: "time",
      1114: "timestamp",
      1184: "timestamptz",
      1700: "numeric",
      2950: "uuid",
      3802: "jsonb",
      114: "json",
    };

    return typeMap[oid] || `oid:${oid}`;
  }
}
