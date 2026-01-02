export const MessageType = {
  STARTUP: null,
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
  const protocolVersion = 196608;

  const params: Record<string, string> = {
    user,
    database,
    client_encoding: "UTF8",
    ...options,
  };

  let paramLength = 0;
  for (const [key, value] of Object.entries(params)) {
    paramLength += key.length + 1 + value.length + 1;
  }

  const messageLength = 4 + 4 + paramLength + 1;
  const buffer = Buffer.alloc(messageLength);
  let offset = 0;

  buffer.writeInt32BE(messageLength, offset);
  offset += 4;

  buffer.writeInt32BE(protocolVersion, offset);
  offset += 4;

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

export function createSaslInitialResponseMessage(
  mechanism: string,
  initialResponse: string
): Buffer {
  const mechanismBytes = Buffer.from(mechanism, "utf8");
  const responseBytes = Buffer.from(initialResponse, "utf8");
  const messageLength =
    1 + 4 + mechanismBytes.length + 1 + 4 + responseBytes.length;
  const buffer = Buffer.alloc(messageLength);
  let offset = 0;

  buffer.write("p", offset);
  offset += 1;
  buffer.writeInt32BE(messageLength - 1, offset);
  offset += 4;
  mechanismBytes.copy(buffer, offset);
  offset += mechanismBytes.length;
  buffer.writeUInt8(0, offset);
  offset += 1;
  buffer.writeInt32BE(responseBytes.length, offset);
  offset += 4;
  responseBytes.copy(buffer, offset);

  return buffer;
}

export function createSaslResponseMessage(response: string): Buffer {
  const responseBytes = Buffer.from(response, "utf8");
  const messageLength = 1 + 4 + responseBytes.length;
  const buffer = Buffer.alloc(messageLength);
  let offset = 0;

  buffer.write("p", offset);
  offset += 1;
  buffer.writeInt32BE(messageLength - 1, offset);
  offset += 4;
  responseBytes.copy(buffer, offset);

  return buffer;
}

function utf8ToBytes(input: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(input);
  }

  const encoded = encodeURIComponent(input);
  const bytes: number[] = [];
  for (let i = 0; i < encoded.length; i++) {
    const char = encoded.charAt(i);
    if (char === "%") {
      bytes.push(parseInt(encoded.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return new Uint8Array(bytes);
}

function asciiToBytes(input: string): Uint8Array {
  const bytes = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) {
    bytes[i] = input.charCodeAt(i) & 0xff;
  }
  return bytes;
}

function add32(a: number, b: number): number {
  return (a + b) | 0;
}

function rol(num: number, count: number): number {
  return (num << count) | (num >>> (32 - count));
}

function cmn(
  q: number,
  a: number,
  b: number,
  x: number,
  s: number,
  t: number
): number {
  return add32(rol(add32(add32(a, q), add32(x, t)), s), b);
}

function ff(
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  s: number,
  t: number
): number {
  return cmn((b & c) | (~b & d), a, b, x, s, t);
}

function gg(
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  s: number,
  t: number
): number {
  return cmn((b & d) | (c & ~d), a, b, x, s, t);
}

function hh(
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  s: number,
  t: number
): number {
  return cmn(b ^ c ^ d, a, b, x, s, t);
}

function ii(
  a: number,
  b: number,
  c: number,
  d: number,
  x: number,
  s: number,
  t: number
): number {
  return cmn(c ^ (b | ~d), a, b, x, s, t);
}

function md5Cycle(state: number[], block: number[]): void {
  let a = state[0];
  let b = state[1];
  let c = state[2];
  let d = state[3];

  a = ff(a, b, c, d, block[0], 7, -680876936);
  d = ff(d, a, b, c, block[1], 12, -389564586);
  c = ff(c, d, a, b, block[2], 17, 606105819);
  b = ff(b, c, d, a, block[3], 22, -1044525330);
  a = ff(a, b, c, d, block[4], 7, -176418897);
  d = ff(d, a, b, c, block[5], 12, 1200080426);
  c = ff(c, d, a, b, block[6], 17, -1473231341);
  b = ff(b, c, d, a, block[7], 22, -45705983);
  a = ff(a, b, c, d, block[8], 7, 1770035416);
  d = ff(d, a, b, c, block[9], 12, -1958414417);
  c = ff(c, d, a, b, block[10], 17, -42063);
  b = ff(b, c, d, a, block[11], 22, -1990404162);
  a = ff(a, b, c, d, block[12], 7, 1804603682);
  d = ff(d, a, b, c, block[13], 12, -40341101);
  c = ff(c, d, a, b, block[14], 17, -1502002290);
  b = ff(b, c, d, a, block[15], 22, 1236535329);

  a = gg(a, b, c, d, block[1], 5, -165796510);
  d = gg(d, a, b, c, block[6], 9, -1069501632);
  c = gg(c, d, a, b, block[11], 14, 643717713);
  b = gg(b, c, d, a, block[0], 20, -373897302);
  a = gg(a, b, c, d, block[5], 5, -701558691);
  d = gg(d, a, b, c, block[10], 9, 38016083);
  c = gg(c, d, a, b, block[15], 14, -660478335);
  b = gg(b, c, d, a, block[4], 20, -405537848);
  a = gg(a, b, c, d, block[9], 5, 568446438);
  d = gg(d, a, b, c, block[14], 9, -1019803690);
  c = gg(c, d, a, b, block[3], 14, -187363961);
  b = gg(b, c, d, a, block[8], 20, 1163531501);
  a = gg(a, b, c, d, block[13], 5, -1444681467);
  d = gg(d, a, b, c, block[2], 9, -51403784);
  c = gg(c, d, a, b, block[7], 14, 1735328473);
  b = gg(b, c, d, a, block[12], 20, -1926607734);

  a = hh(a, b, c, d, block[5], 4, -378558);
  d = hh(d, a, b, c, block[8], 11, -2022574463);
  c = hh(c, d, a, b, block[11], 16, 1839030562);
  b = hh(b, c, d, a, block[14], 23, -35309556);
  a = hh(a, b, c, d, block[1], 4, -1530992060);
  d = hh(d, a, b, c, block[4], 11, 1272893353);
  c = hh(c, d, a, b, block[7], 16, -155497632);
  b = hh(b, c, d, a, block[10], 23, -1094730640);
  a = hh(a, b, c, d, block[13], 4, 681279174);
  d = hh(d, a, b, c, block[0], 11, -358537222);
  c = hh(c, d, a, b, block[3], 16, -722521979);
  b = hh(b, c, d, a, block[6], 23, 76029189);
  a = hh(a, b, c, d, block[9], 4, -640364487);
  d = hh(d, a, b, c, block[12], 11, -421815835);
  c = hh(c, d, a, b, block[15], 16, 530742520);
  b = hh(b, c, d, a, block[2], 23, -995338651);

  a = ii(a, b, c, d, block[0], 6, -198630844);
  d = ii(d, a, b, c, block[7], 10, 1126891415);
  c = ii(c, d, a, b, block[14], 15, -1416354905);
  b = ii(b, c, d, a, block[5], 21, -57434055);
  a = ii(a, b, c, d, block[12], 6, 1700485571);
  d = ii(d, a, b, c, block[3], 10, -1894986606);
  c = ii(c, d, a, b, block[10], 15, -1051523);
  b = ii(b, c, d, a, block[1], 21, -2054922799);
  a = ii(a, b, c, d, block[8], 6, 1873313359);
  d = ii(d, a, b, c, block[15], 10, -30611744);
  c = ii(c, d, a, b, block[6], 15, -1560198380);
  b = ii(b, c, d, a, block[13], 21, 1309151649);
  a = ii(a, b, c, d, block[4], 6, -145523070);
  d = ii(d, a, b, c, block[11], 10, -1120210379);
  c = ii(c, d, a, b, block[2], 15, 718787259);
  b = ii(b, c, d, a, block[9], 21, -343485551);

  state[0] = add32(state[0], a);
  state[1] = add32(state[1], b);
  state[2] = add32(state[2], c);
  state[3] = add32(state[3], d);
}

function wordToHex(word: number): string {
  let output = "";
  for (let i = 0; i < 4; i++) {
    const byte = (word >>> (i * 8)) & 0xff;
    output += (byte + 0x100).toString(16).slice(1);
  }
  return output;
}

function md5Bytes(bytes: Uint8Array): string {
  const state = [1732584193, -271733879, -1732584194, 271733878];
  const len = bytes.length;
  const bitLen = len * 8;
  const totalLen = ((len + 8) >>> 6 << 6) + 64;
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[len] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, bitLen >>> 0, true);
  view.setUint32(totalLen - 4, Math.floor(bitLen / 0x100000000), true);

  const block = new Array<number>(16);
  for (let i = 0; i < totalLen; i += 64) {
    for (let j = 0; j < 16; j++) {
      const offset = i + j * 4;
      block[j] =
        padded[offset] |
        (padded[offset + 1] << 8) |
        (padded[offset + 2] << 16) |
        (padded[offset + 3] << 24);
    }
    md5Cycle(state, block);
  }

  return (
    wordToHex(state[0]) +
    wordToHex(state[1]) +
    wordToHex(state[2]) +
    wordToHex(state[3])
  );
}

function md5Utf8(input: string): string {
  return md5Bytes(utf8ToBytes(input));
}

export function createMd5PasswordMessage(
  password: string,
  username: string,
  salt: Buffer
): Buffer {
  // MD5(MD5(password + username) + salt)
  const inner = md5Utf8(password + username);
  const innerBytes = asciiToBytes(inner);
  const combined = new Uint8Array(innerBytes.length + salt.length);
  combined.set(innerBytes, 0);
  combined.set(salt, innerBytes.length);
  const outer = md5Bytes(combined);

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

  const payload = buffer.slice(5, length + 1);

  return { type, length, payload };
}

export function parseAuthenticationMessage(payload: Buffer): {
  authType: number;
  data?: Buffer;
} {
  const authType = payload.readInt32BE(0);
  const data = payload.length > 4 ? payload.slice(4) : undefined;
  return { authType, data };
}

export function parseSaslMechanisms(payload: Buffer): string[] {
  const mechanisms: string[] = [];
  let offset = 0;

  while (offset < payload.length) {
    const end = payload.indexOf(0, offset);
    if (end === -1) break;
    if (end === offset) break;
    mechanisms.push(payload.toString("utf8", offset, end));
    offset = end + 1;
  }

  return mechanisms;
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
