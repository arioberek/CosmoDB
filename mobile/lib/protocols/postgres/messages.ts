// PostgreSQL Protocol v3 Message Types
// Reference: https://www.postgresql.org/docs/current/protocol-message-formats.html

export const MessageType = {
  // Frontend (client) messages
  STARTUP: null, // No type byte, special format
  PASSWORD: "p",
  QUERY: "Q",
  TERMINATE: "X",
  PARSE: "P",
  BIND: "B",
  EXECUTE: "E",
  DESCRIBE: "D",
  SYNC: "S",
  FLUSH: "H",
  CLOSE: "C",

  // Backend (server) messages
  AUTHENTICATION: "R",
  BACKEND_KEY_DATA: "K",
  PARAMETER_STATUS: "S",
  READY_FOR_QUERY: "Z",
  ROW_DESCRIPTION: "T",
  DATA_ROW: "D",
  COMMAND_COMPLETE: "C",
  ERROR_RESPONSE: "E",
  NOTICE_RESPONSE: "N",
  EMPTY_QUERY_RESPONSE: "I",
  PARSE_COMPLETE: "1",
  BIND_COMPLETE: "2",
  CLOSE_COMPLETE: "3",
  NO_DATA: "n",
} as const;

export const AuthType = {
  OK: 0,
  KERBEROS_V5: 2,
  CLEARTEXT_PASSWORD: 3,
  MD5_PASSWORD: 5,
  SCM_CREDENTIAL: 6,
  GSS: 7,
  GSS_CONTINUE: 8,
  SSPI: 9,
  SASL: 10,
  SASL_CONTINUE: 11,
  SASL_FINAL: 12,
} as const;

export const TransactionStatus = {
  IDLE: "I",
  IN_TRANSACTION: "T",
  FAILED: "E",
} as const;

export function createStartupMessage(
  user: string,
  database: string,
  options: Record<string, string> = {}
): Buffer {
  const protocolVersion = 196608; // 3.0

  const params: Record<string, string> = {
    user,
    database,
    client_encoding: "UTF8",
    ...options,
  };

  // Calculate message length
  let paramLength = 0;
  for (const [key, value] of Object.entries(params)) {
    paramLength += key.length + 1 + value.length + 1;
  }

  const messageLength = 4 + 4 + paramLength + 1; // length + version + params + null terminator
  const buffer = Buffer.alloc(messageLength);
  let offset = 0;

  // Message length (includes self)
  buffer.writeInt32BE(messageLength, offset);
  offset += 4;

  // Protocol version
  buffer.writeInt32BE(protocolVersion, offset);
  offset += 4;

  // Parameters
  for (const [key, value] of Object.entries(params)) {
    buffer.write(key, offset);
    offset += key.length;
    buffer.writeUInt8(0, offset);
    offset += 1;
    buffer.write(value, offset);
    offset += value.length;
    buffer.writeUInt8(0, offset);
    offset += 1;
  }

  // Final null terminator
  buffer.writeUInt8(0, offset);

  return buffer;
}

export function createPasswordMessage(password: string): Buffer {
  const passwordBytes = Buffer.from(password, "utf8");
  const messageLength = 1 + 4 + passwordBytes.length + 1;
  const buffer = Buffer.alloc(messageLength);
  let offset = 0;

  buffer.write("p", offset);
  offset += 1;
  buffer.writeInt32BE(messageLength - 1, offset);
  offset += 4;
  passwordBytes.copy(buffer, offset);
  offset += passwordBytes.length;
  buffer.writeUInt8(0, offset);

  return buffer;
}

export function createMd5PasswordMessage(
  password: string,
  username: string,
  salt: Buffer
): Buffer {
  // MD5(MD5(password + username) + salt)
  // We'll need a crypto implementation for this
  // For now, return placeholder - will implement with proper crypto
  const crypto = require("crypto");

  const inner = crypto
    .createHash("md5")
    .update(password + username)
    .digest("hex");

  const outer = crypto
    .createHash("md5")
    .update(inner + salt.toString("binary"))
    .digest("hex");

  const md5Password = "md5" + outer;

  return createPasswordMessage(md5Password);
}

export function createQueryMessage(query: string): Buffer {
  const queryBytes = Buffer.from(query, "utf8");
  const messageLength = 1 + 4 + queryBytes.length + 1;
  const buffer = Buffer.alloc(messageLength);
  let offset = 0;

  buffer.write("Q", offset);
  offset += 1;
  buffer.writeInt32BE(messageLength - 1, offset);
  offset += 4;
  queryBytes.copy(buffer, offset);
  offset += queryBytes.length;
  buffer.writeUInt8(0, offset);

  return buffer;
}

export function createTerminateMessage(): Buffer {
  const buffer = Buffer.alloc(5);
  buffer.write("X", 0);
  buffer.writeInt32BE(4, 1);
  return buffer;
}

export interface ParsedMessage {
  type: string;
  length: number;
  payload: Buffer;
}

export function parseMessage(buffer: Buffer): ParsedMessage | null {
  if (buffer.length < 5) {
    return null;
  }

  const type = String.fromCharCode(buffer[0]);
  const length = buffer.readInt32BE(1);

  if (buffer.length < length + 1) {
    return null;
  }

  const payload = buffer.subarray(5, length + 1);

  return { type, length, payload };
}

export function parseAuthenticationMessage(payload: Buffer): {
  authType: number;
  data?: Buffer;
} {
  const authType = payload.readInt32BE(0);
  const data = payload.length > 4 ? payload.subarray(4) : undefined;
  return { authType, data };
}

export function parseRowDescription(
  payload: Buffer
): Array<{ name: string; tableOid: number; columnId: number; typeOid: number }> {
  const fieldCount = payload.readInt16BE(0);
  const fields: Array<{
    name: string;
    tableOid: number;
    columnId: number;
    typeOid: number;
  }> = [];

  let offset = 2;

  for (let i = 0; i < fieldCount; i++) {
    // Find null terminator for field name
    let nameEnd = offset;
    while (payload[nameEnd] !== 0) {
      nameEnd++;
    }

    const name = payload.toString("utf8", offset, nameEnd);
    offset = nameEnd + 1;

    const tableOid = payload.readInt32BE(offset);
    offset += 4;
    const columnId = payload.readInt16BE(offset);
    offset += 2;
    const typeOid = payload.readInt32BE(offset);
    offset += 4;
    // Skip: type size (2), type modifier (4), format code (2)
    offset += 8;

    fields.push({ name, tableOid, columnId, typeOid });
  }

  return fields;
}

export function parseDataRow(payload: Buffer): Array<string | null> {
  const columnCount = payload.readInt16BE(0);
  const values: Array<string | null> = [];
  let offset = 2;

  for (let i = 0; i < columnCount; i++) {
    const length = payload.readInt32BE(offset);
    offset += 4;

    if (length === -1) {
      values.push(null);
    } else {
      const value = payload.toString("utf8", offset, offset + length);
      offset += length;
      values.push(value);
    }
  }

  return values;
}

export function parseCommandComplete(payload: Buffer): string {
  // Remove trailing null byte
  return payload.toString("utf8", 0, payload.length - 1);
}

export function parseErrorResponse(
  payload: Buffer
): Record<string, string> {
  const fields: Record<string, string> = {};
  let offset = 0;

  while (offset < payload.length && payload[offset] !== 0) {
    const fieldType = String.fromCharCode(payload[offset]);
    offset++;

    let valueEnd = offset;
    while (payload[valueEnd] !== 0) {
      valueEnd++;
    }

    const value = payload.toString("utf8", offset, valueEnd);
    offset = valueEnd + 1;

    fields[fieldType] = value;
  }

  return fields;
}
