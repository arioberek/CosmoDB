export const CapabilityFlags = {
  CLIENT_LONG_PASSWORD: 1 << 0,
  CLIENT_FOUND_ROWS: 1 << 1,
  CLIENT_LONG_FLAG: 1 << 2,
  CLIENT_CONNECT_WITH_DB: 1 << 3,
  CLIENT_NO_SCHEMA: 1 << 4,
  CLIENT_COMPRESS: 1 << 5,
  CLIENT_ODBC: 1 << 6,
  CLIENT_LOCAL_FILES: 1 << 7,
  CLIENT_IGNORE_SPACE: 1 << 8,
  CLIENT_PROTOCOL_41: 1 << 9,
  CLIENT_INTERACTIVE: 1 << 10,
  CLIENT_SSL: 1 << 11,
  CLIENT_IGNORE_SIGPIPE: 1 << 12,
  CLIENT_TRANSACTIONS: 1 << 13,
  CLIENT_RESERVED: 1 << 14,
  CLIENT_SECURE_CONNECTION: 1 << 15,
  CLIENT_MULTI_STATEMENTS: 1 << 16,
  CLIENT_MULTI_RESULTS: 1 << 17,
  CLIENT_PS_MULTI_RESULTS: 1 << 18,
  CLIENT_PLUGIN_AUTH: 1 << 19,
  CLIENT_CONNECT_ATTRS: 1 << 20,
  CLIENT_PLUGIN_AUTH_LENENC_CLIENT_DATA: 1 << 21,
  CLIENT_DEPRECATE_EOF: 1 << 24,
} as const;

export const ServerStatus = {
  STATUS_IN_TRANS: 1 << 0,
  STATUS_AUTOCOMMIT: 1 << 1,
  MORE_RESULTS_EXISTS: 1 << 3,
  STATUS_NO_GOOD_INDEX_USED: 1 << 4,
  STATUS_NO_INDEX_USED: 1 << 5,
  STATUS_CURSOR_EXISTS: 1 << 6,
  STATUS_LAST_ROW_SENT: 1 << 7,
  STATUS_DB_DROPPED: 1 << 8,
  STATUS_NO_BACKSLASH_ESCAPES: 1 << 9,
  STATUS_METADATA_CHANGED: 1 << 10,
} as const;

export const ColumnTypes = {
  DECIMAL: 0x00,
  TINY: 0x01,
  SHORT: 0x02,
  LONG: 0x03,
  FLOAT: 0x04,
  DOUBLE: 0x05,
  NULL: 0x06,
  TIMESTAMP: 0x07,
  LONGLONG: 0x08,
  INT24: 0x09,
  DATE: 0x0a,
  TIME: 0x0b,
  DATETIME: 0x0c,
  YEAR: 0x0d,
  NEWDATE: 0x0e,
  VARCHAR: 0x0f,
  BIT: 0x10,
  JSON: 0xf5,
  NEWDECIMAL: 0xf6,
  ENUM: 0xf7,
  SET: 0xf8,
  TINY_BLOB: 0xf9,
  MEDIUM_BLOB: 0xfa,
  LONG_BLOB: 0xfb,
  BLOB: 0xfc,
  VAR_STRING: 0xfd,
  STRING: 0xfe,
  GEOMETRY: 0xff,
} as const;

export const CommandCodes = {
  COM_QUIT: 0x01,
  COM_INIT_DB: 0x02,
  COM_QUERY: 0x03,
  COM_FIELD_LIST: 0x04,
  COM_CREATE_DB: 0x05,
  COM_DROP_DB: 0x06,
  COM_REFRESH: 0x07,
  COM_SHUTDOWN: 0x08,
  COM_STATISTICS: 0x09,
  COM_PROCESS_INFO: 0x0a,
  COM_CONNECT: 0x0b,
  COM_PROCESS_KILL: 0x0c,
  COM_DEBUG: 0x0d,
  COM_PING: 0x0e,
  COM_TIME: 0x0f,
  COM_DELAYED_INSERT: 0x10,
  COM_CHANGE_USER: 0x11,
  COM_STMT_PREPARE: 0x16,
  COM_STMT_EXECUTE: 0x17,
  COM_STMT_SEND_LONG_DATA: 0x18,
  COM_STMT_CLOSE: 0x19,
  COM_STMT_RESET: 0x1a,
  COM_SET_OPTION: 0x1b,
  COM_STMT_FETCH: 0x1c,
} as const;

export interface HandshakeV10 {
  protocolVersion: number;
  serverVersion: string;
  connectionId: number;
  authPluginDataPart1: Buffer;
  capabilityFlagsLower: number;
  characterSet: number;
  statusFlags: number;
  capabilityFlagsUpper: number;
  authPluginDataLength: number;
  authPluginDataPart2: Buffer;
  authPluginName: string;
}

export interface OkPacket {
  affectedRows: number;
  lastInsertId: number;
  statusFlags: number;
  warningCount: number;
  info: string;
}

export interface ErrPacket {
  errorCode: number;
  sqlState: string;
  errorMessage: string;
}

export interface ColumnDefinition {
  catalog: string;
  schema: string;
  table: string;
  orgTable: string;
  name: string;
  orgName: string;
  characterSet: number;
  columnLength: number;
  columnType: number;
  flags: number;
  decimals: number;
}

export function parseHandshakeV10(payload: Buffer): HandshakeV10 {
  let offset = 0;

  const protocolVersion = payload.readUInt8(offset);
  offset += 1;

  const serverVersionEnd = payload.indexOf(0, offset);
  const serverVersion = payload.toString("utf8", offset, serverVersionEnd);
  offset = serverVersionEnd + 1;

  const connectionId = payload.readUInt32LE(offset);
  offset += 4;

  const authPluginDataPart1 = payload.subarray(offset, offset + 8);
  offset += 8;

  offset += 1;

  const capabilityFlagsLower = payload.readUInt16LE(offset);
  offset += 2;

  const characterSet = payload.readUInt8(offset);
  offset += 1;

  const statusFlags = payload.readUInt16LE(offset);
  offset += 2;

  const capabilityFlagsUpper = payload.readUInt16LE(offset);
  offset += 2;

  const authPluginDataLength = payload.readUInt8(offset);
  offset += 1;

  offset += 10;

  const authPluginDataPart2Length = Math.max(13, authPluginDataLength - 8);
  const authPluginDataPart2 = payload.subarray(
    offset,
    offset + authPluginDataPart2Length - 1
  );
  offset += authPluginDataPart2Length;

  let authPluginName = "";
  const capabilityFlags =
    capabilityFlagsLower | (capabilityFlagsUpper << 16);
  if (capabilityFlags & CapabilityFlags.CLIENT_PLUGIN_AUTH) {
    const authPluginNameEnd = payload.indexOf(0, offset);
    if (authPluginNameEnd !== -1) {
      authPluginName = payload.toString("utf8", offset, authPluginNameEnd);
    }
  }

  return {
    protocolVersion,
    serverVersion,
    connectionId,
    authPluginDataPart1,
    capabilityFlagsLower,
    characterSet,
    statusFlags,
    capabilityFlagsUpper,
    authPluginDataLength,
    authPluginDataPart2,
    authPluginName,
  };
}

export function createHandshakeResponse41(
  handshake: HandshakeV10,
  username: string,
  authResponse: Buffer,
  database: string,
  authPluginName: string
): Buffer {
  const capabilities =
    CapabilityFlags.CLIENT_PROTOCOL_41 |
    CapabilityFlags.CLIENT_SECURE_CONNECTION |
    CapabilityFlags.CLIENT_LONG_PASSWORD |
    CapabilityFlags.CLIENT_TRANSACTIONS |
    CapabilityFlags.CLIENT_MULTI_RESULTS |
    CapabilityFlags.CLIENT_PLUGIN_AUTH |
    (database ? CapabilityFlags.CLIENT_CONNECT_WITH_DB : 0) |
    CapabilityFlags.CLIENT_DEPRECATE_EOF;

  const usernameBuffer = Buffer.from(username, "utf8");
  const databaseBuffer = database ? Buffer.from(database, "utf8") : null;
  const authPluginNameBuffer = Buffer.from(authPluginName, "utf8");

  let payloadLength =
    4 +
    4 +
    1 +
    23 +
    usernameBuffer.length +
    1 +
    1 +
    authResponse.length +
    authPluginNameBuffer.length +
    1;

  if (databaseBuffer) {
    payloadLength += databaseBuffer.length + 1;
  }

  const buffer = Buffer.alloc(payloadLength);
  let offset = 0;

  buffer.writeUInt32LE(capabilities, offset);
  offset += 4;

  buffer.writeUInt32LE(0x00ffffff, offset);
  offset += 4;

  buffer.writeUInt8(handshake.characterSet || 33, offset);
  offset += 1;

  buffer.fill(0, offset, offset + 23);
  offset += 23;

  usernameBuffer.copy(buffer, offset);
  offset += usernameBuffer.length;
  buffer.writeUInt8(0, offset);
  offset += 1;

  buffer.writeUInt8(authResponse.length, offset);
  offset += 1;
  authResponse.copy(buffer, offset);
  offset += authResponse.length;

  if (databaseBuffer) {
    databaseBuffer.copy(buffer, offset);
    offset += databaseBuffer.length;
    buffer.writeUInt8(0, offset);
    offset += 1;
  }

  authPluginNameBuffer.copy(buffer, offset);
  offset += authPluginNameBuffer.length;
  buffer.writeUInt8(0, offset);

  return buffer;
}

export function createQueryPacket(query: string): Buffer {
  const queryBuffer = Buffer.from(query, "utf8");
  const buffer = Buffer.alloc(1 + queryBuffer.length);

  buffer.writeUInt8(CommandCodes.COM_QUERY, 0);
  queryBuffer.copy(buffer, 1);

  return buffer;
}

export function createQuitPacket(): Buffer {
  const buffer = Buffer.alloc(1);
  buffer.writeUInt8(CommandCodes.COM_QUIT, 0);
  return buffer;
}

export function wrapPacket(payload: Buffer, sequenceId: number): Buffer {
  const buffer = Buffer.alloc(4 + payload.length);

  buffer.writeUIntLE(payload.length, 0, 3);
  buffer.writeUInt8(sequenceId, 3);
  payload.copy(buffer, 4);

  return buffer;
}

export function parsePacketHeader(
  buffer: Buffer
): { length: number; sequenceId: number } | null {
  if (buffer.length < 4) {
    return null;
  }

  const length = buffer.readUIntLE(0, 3);
  const sequenceId = buffer.readUInt8(3);

  return { length, sequenceId };
}

export function parseOkPacket(payload: Buffer): OkPacket {
  let offset = 1;

  const { value: affectedRows, bytesRead: affectedRowsBytes } =
    readLengthEncodedInteger(payload, offset);
  offset += affectedRowsBytes;

  const { value: lastInsertId, bytesRead: lastInsertIdBytes } =
    readLengthEncodedInteger(payload, offset);
  offset += lastInsertIdBytes;

  const statusFlags = payload.readUInt16LE(offset);
  offset += 2;

  const warningCount = payload.readUInt16LE(offset);
  offset += 2;

  const info =
    offset < payload.length ? payload.toString("utf8", offset) : "";

  return {
    affectedRows,
    lastInsertId,
    statusFlags,
    warningCount,
    info,
  };
}

export function parseErrPacket(payload: Buffer): ErrPacket {
  let offset = 1;

  const errorCode = payload.readUInt16LE(offset);
  offset += 2;

  let sqlState = "";
  if (payload[offset] === 0x23) {
    offset += 1;
    sqlState = payload.toString("utf8", offset, offset + 5);
    offset += 5;
  }

  const errorMessage = payload.toString("utf8", offset);

  return {
    errorCode,
    sqlState,
    errorMessage,
  };
}

export function parseColumnDefinition(payload: Buffer): ColumnDefinition {
  let offset = 0;

  const { value: catalog, bytesRead: catalogBytes } =
    readLengthEncodedString(payload, offset);
  offset += catalogBytes;

  const { value: schema, bytesRead: schemaBytes } =
    readLengthEncodedString(payload, offset);
  offset += schemaBytes;

  const { value: table, bytesRead: tableBytes } =
    readLengthEncodedString(payload, offset);
  offset += tableBytes;

  const { value: orgTable, bytesRead: orgTableBytes } =
    readLengthEncodedString(payload, offset);
  offset += orgTableBytes;

  const { value: name, bytesRead: nameBytes } =
    readLengthEncodedString(payload, offset);
  offset += nameBytes;

  const { value: orgName, bytesRead: orgNameBytes } =
    readLengthEncodedString(payload, offset);
  offset += orgNameBytes;

  offset += 1;

  const characterSet = payload.readUInt16LE(offset);
  offset += 2;

  const columnLength = payload.readUInt32LE(offset);
  offset += 4;

  const columnType = payload.readUInt8(offset);
  offset += 1;

  const flags = payload.readUInt16LE(offset);
  offset += 2;

  const decimals = payload.readUInt8(offset);

  return {
    catalog,
    schema,
    table,
    orgTable,
    name,
    orgName,
    characterSet,
    columnLength,
    columnType,
    flags,
    decimals,
  };
}

export function parseResultSetRow(
  payload: Buffer,
  columnCount: number
): Array<string | null> {
  const values: Array<string | null> = [];
  let offset = 0;

  for (let i = 0; i < columnCount; i++) {
    if (payload[offset] === 0xfb) {
      values.push(null);
      offset += 1;
    } else {
      const { value, bytesRead } = readLengthEncodedString(payload, offset);
      values.push(value);
      offset += bytesRead;
    }
  }

  return values;
}

function readLengthEncodedInteger(
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

function readLengthEncodedString(
  buffer: Buffer,
  offset: number
): { value: string; bytesRead: number } {
  const { value: length, bytesRead: lengthBytes } = readLengthEncodedInteger(
    buffer,
    offset
  );

  const value = buffer.toString("utf8", offset + lengthBytes, offset + lengthBytes + length);
  return { value, bytesRead: lengthBytes + length };
}

export function getColumnTypeName(typeCode: number): string {
  const typeMap: Record<number, string> = {
    [ColumnTypes.DECIMAL]: "decimal",
    [ColumnTypes.TINY]: "tinyint",
    [ColumnTypes.SHORT]: "smallint",
    [ColumnTypes.LONG]: "int",
    [ColumnTypes.FLOAT]: "float",
    [ColumnTypes.DOUBLE]: "double",
    [ColumnTypes.NULL]: "null",
    [ColumnTypes.TIMESTAMP]: "timestamp",
    [ColumnTypes.LONGLONG]: "bigint",
    [ColumnTypes.INT24]: "mediumint",
    [ColumnTypes.DATE]: "date",
    [ColumnTypes.TIME]: "time",
    [ColumnTypes.DATETIME]: "datetime",
    [ColumnTypes.YEAR]: "year",
    [ColumnTypes.VARCHAR]: "varchar",
    [ColumnTypes.BIT]: "bit",
    [ColumnTypes.JSON]: "json",
    [ColumnTypes.NEWDECIMAL]: "decimal",
    [ColumnTypes.ENUM]: "enum",
    [ColumnTypes.SET]: "set",
    [ColumnTypes.TINY_BLOB]: "tinyblob",
    [ColumnTypes.MEDIUM_BLOB]: "mediumblob",
    [ColumnTypes.LONG_BLOB]: "longblob",
    [ColumnTypes.BLOB]: "blob",
    [ColumnTypes.VAR_STRING]: "varchar",
    [ColumnTypes.STRING]: "char",
    [ColumnTypes.GEOMETRY]: "geometry",
  };

  return typeMap[typeCode] || `type:${typeCode}`;
}
