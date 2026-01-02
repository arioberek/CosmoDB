import type {
  ColumnInfo,
  ConnectionConfig,
  ConnectionState,
  DatabaseConnection,
  DatabaseInfo,
  QueryResult,
  TableInfo,
} from "../../types";
import { TcpClient, sslConfigToTlsOptions } from "../../tcp/socket";
import {
  type ColumnDefinition,
  createHandshakeResponse41,
  createQueryPacket,
  createQuitPacket,
  getColumnTypeName,
  parseColumnDefinition,
  parseErrPacket,
  parseHandshakeV10,
  parseOkPacket,
  parsePacketHeader,
  parseResultSetRow,
  wrapPacket,
} from "./packets";
import { createAuthResponse } from "./auth";

export class MySQLConnection implements DatabaseConnection {
  config: ConnectionConfig;
  state: ConnectionState = { status: "disconnected" };
  private client: TcpClient;
  private buffer: Buffer = Buffer.alloc(0);
  private sequenceId = 0;

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
        tls: sslConfigToTlsOptions(this.config.ssl),
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
    const handshakeData = await this.receivePacket();
    const handshake = parseHandshakeV10(handshakeData.payload);

    const scramble = Buffer.concat([
      handshake.authPluginDataPart1,
      handshake.authPluginDataPart2,
    ]);

    const authPluginName =
      handshake.authPluginName || "mysql_native_password";
    const authResponse = createAuthResponse(
      this.config.password,
      scramble,
      authPluginName
    );

    const responsePayload = createHandshakeResponse41(
      handshake,
      this.config.username,
      authResponse,
      this.config.database,
      authPluginName
    );

    this.sequenceId = 1;
    await this.sendPacket(responsePayload);

    const result = await this.receivePacket();
    const firstByte = result.payload[0];

    if (firstByte === 0x00) {
      return;
    }

    if (firstByte === 0xfe) {
      await this.handleAuthSwitch(result.payload, scramble);
      return;
    }

    if (firstByte === 0x01) {
      await this.handleCachingSha2FastAuth(result.payload);
      return;
    }

    if (firstByte === 0xff) {
      const err = parseErrPacket(result.payload);
      throw new Error(err.errorMessage);
    }

    throw new Error("Unexpected authentication response");
  }

  private async handleAuthSwitch(
    payload: Buffer,
    _scramble: Buffer
  ): Promise<void> {
    let offset = 1;
    const pluginNameEnd = payload.indexOf(0, offset);
    const pluginName = payload.toString("utf8", offset, pluginNameEnd);
    offset = pluginNameEnd + 1;
    const newScramble = payload.subarray(offset, offset + 20);

    const authResponse = createAuthResponse(
      this.config.password,
      newScramble,
      pluginName
    );

    this.sequenceId++;
    await this.sendPacket(authResponse);

    const result = await this.receivePacket();

    if (result.payload[0] === 0x01 && pluginName === "caching_sha2_password") {
      await this.handleCachingSha2FastAuth(result.payload);
      return;
    }

    if (result.payload[0] === 0xff) {
      const err = parseErrPacket(result.payload);
      throw new Error(err.errorMessage);
    }

    if (result.payload[0] !== 0x00) {
      throw new Error("Authentication failed");
    }
  }

  private async handleCachingSha2FastAuth(payload: Buffer): Promise<void> {
    if (payload.length > 1 && payload[1] === 0x03) {
      const finalResult = await this.receivePacket();
      if (finalResult.payload[0] === 0xff) {
        const err = parseErrPacket(finalResult.payload);
        throw new Error(err.errorMessage);
      }
      return;
    }

    if (payload.length > 1 && payload[1] === 0x04) {
      if (this.config.ssl) {
        const passwordBuffer = Buffer.from(this.config.password + "\0", "utf8");
        this.sequenceId++;
        await this.sendPacket(passwordBuffer);
      } else {
        throw new Error(
          "caching_sha2_password requires SSL for full authentication"
        );
      }

      const finalResult = await this.receivePacket();
      if (finalResult.payload[0] === 0xff) {
        const err = parseErrPacket(finalResult.payload);
        throw new Error(err.errorMessage);
      }
    }
  }

  private async sendPacket(payload: Buffer): Promise<void> {
    const packet = wrapPacket(payload, this.sequenceId);
    await this.client.send(packet);
  }

  private async receivePacket(): Promise<{
    payload: Buffer;
    sequenceId: number;
  }> {
    while (true) {
      const header = parsePacketHeader(this.buffer);
      if (header && this.buffer.length >= 4 + header.length) {
        const payload = this.buffer.subarray(4, 4 + header.length);
        this.buffer = this.buffer.subarray(4 + header.length);
        this.sequenceId = header.sequenceId;
        return { payload, sequenceId: header.sequenceId };
      }

      const data = await this.client.receive();
      this.buffer = Buffer.concat([this.buffer, data]);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client.isConnected()) {
      try {
        this.sequenceId = 0;
        await this.sendPacket(createQuitPacket());
      } catch {}
      await this.client.disconnect();
    }
    this.state = { status: "disconnected" };
  }

  async query(sql: string): Promise<QueryResult> {
    if (!this.client.isConnected()) {
      throw new Error("Not connected");
    }

    const startTime = Date.now();
    this.sequenceId = 0;
    await this.sendPacket(createQueryPacket(sql));

    const firstPacket = await this.receivePacket();
    const firstByte = firstPacket.payload[0];

    if (firstByte === 0xff) {
      const err = parseErrPacket(firstPacket.payload);
      throw new Error(err.errorMessage);
    }

    if (firstByte === 0x00) {
      const ok = parseOkPacket(firstPacket.payload);
      return {
        columns: [],
        rows: [],
        rowCount: ok.affectedRows,
        executionTime: Date.now() - startTime,
        command: sql.trim().split(/\s+/)[0].toUpperCase(),
      };
    }

    const columnCount = this.readLengthEncodedInt(firstPacket.payload, 0).value;
    const columns: ColumnInfo[] = [];
    const columnDefs: ColumnDefinition[] = [];

    for (let i = 0; i < columnCount; i++) {
      const colPacket = await this.receivePacket();
      const colDef = parseColumnDefinition(colPacket.payload);
      columnDefs.push(colDef);
      columns.push({
        name: colDef.name,
        type: getColumnTypeName(colDef.columnType),
      });
    }

    const eofOrOk = await this.receivePacket();
    if (eofOrOk.payload[0] === 0xff) {
      const err = parseErrPacket(eofOrOk.payload);
      throw new Error(err.errorMessage);
    }

    const rows: Record<string, unknown>[] = [];

    while (true) {
      const rowPacket = await this.receivePacket();

      if (rowPacket.payload[0] === 0xfe && rowPacket.payload.length < 9) {
        break;
      }

      if (rowPacket.payload[0] === 0xff) {
        const err = parseErrPacket(rowPacket.payload);
        throw new Error(err.errorMessage);
      }

      const values = parseResultSetRow(rowPacket.payload, columnCount);
      const row: Record<string, unknown> = {};
      columns.forEach((col, idx) => {
        row[col.name] = values[idx];
      });
      rows.push(row);
    }

    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTime: Date.now() - startTime,
      command: sql.trim().split(/\s+/)[0].toUpperCase(),
    };
  }

  private readLengthEncodedInt(
    buffer: Buffer,
    offset: number
  ): { value: number; bytesRead: number } {
    const firstByte = buffer.readUInt8(offset);

    if (firstByte < 0xfb) {
      return { value: firstByte, bytesRead: 1 };
    }
    if (firstByte === 0xfc) {
      return { value: buffer.readUInt16LE(offset + 1), bytesRead: 3 };
    }
    if (firstByte === 0xfd) {
      return { value: buffer.readUIntLE(offset + 1, 3), bytesRead: 4 };
    }
    if (firstByte === 0xfe) {
      const low = buffer.readUInt32LE(offset + 1);
      const high = buffer.readUInt32LE(offset + 5);
      return { value: low + high * 0x100000000, bytesRead: 9 };
    }

    return { value: 0, bytesRead: 1 };
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const result = await this.query("SHOW DATABASES");
    return result.rows.map((row) => ({
      name: (row.Database as string) || (row.database as string),
    }));
  }

  async listTables(schema?: string): Promise<TableInfo[]> {
    const db = schema || this.config.database;

    const tablesResult = await this.query(
      `SELECT TABLE_NAME, TABLE_TYPE FROM information_schema.TABLES WHERE TABLE_SCHEMA = '${db}'`
    );

    return tablesResult.rows.map((row) => ({
      schema: db,
      name: row.TABLE_NAME as string,
      type: (row.TABLE_TYPE as string) === "VIEW" ? "view" : "table",
    }));
  }

  async describeTable(schema: string, table: string): Promise<ColumnInfo[]> {
    const result = await this.query(
      `SELECT COLUMN_NAME, DATA_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = '${schema}' AND TABLE_NAME = '${table}' ORDER BY ORDINAL_POSITION`
    );

    return result.rows.map((row) => ({
      name: row.COLUMN_NAME as string,
      type: row.DATA_TYPE as string,
    }));
  }
}
