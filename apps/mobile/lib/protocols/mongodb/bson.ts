export const BsonType = {
  DOUBLE: 0x01,
  STRING: 0x02,
  DOCUMENT: 0x03,
  ARRAY: 0x04,
  BINARY: 0x05,
  UNDEFINED: 0x06,
  OBJECT_ID: 0x07,
  BOOLEAN: 0x08,
  DATE: 0x09,
  NULL: 0x0a,
  REGEX: 0x0b,
  JAVASCRIPT: 0x0d,
  INT32: 0x10,
  TIMESTAMP: 0x11,
  INT64: 0x12,
  DECIMAL128: 0x13,
  MIN_KEY: 0xff,
  MAX_KEY: 0x7f,
} as const;

export type BsonValue =
  | string
  | number
  | boolean
  | null
  | Date
  | Buffer
  | ObjectId
  | BsonDocument
  | BsonValue[];

export type BsonDocument = { [key: string]: BsonValue };

export class ObjectId {
  private bytes: Buffer;

  constructor(value?: string | Buffer) {
    if (value instanceof Buffer) {
      this.bytes = value;
    } else if (typeof value === "string") {
      this.bytes = Buffer.from(value, "hex");
    } else {
      this.bytes = ObjectId.generate();
    }
  }

  private static generate(): Buffer {
    const buffer = Buffer.alloc(12);
    const timestamp = Math.floor(Date.now() / 1000);
    buffer.writeUInt32BE(timestamp, 0);
    const random = Math.floor(Math.random() * 0xffffffffffff);
    buffer.writeUIntBE(random, 4, 5);
    const counter = Math.floor(Math.random() * 0xffffff);
    buffer.writeUIntBE(counter, 9, 3);
    return buffer;
  }

  toString(): string {
    return this.bytes.toString("hex");
  }

  toBuffer(): Buffer {
    return this.bytes;
  }
}

export function encodeBson(doc: BsonDocument): Buffer {
  const elements: Buffer[] = [];

  for (const [key, value] of Object.entries(doc)) {
    elements.push(encodeElement(key, value));
  }

  const content = Buffer.concat(elements);
  const buffer = Buffer.alloc(4 + content.length + 1);
  buffer.writeInt32LE(buffer.length, 0);
  content.copy(buffer, 4);
  buffer[buffer.length - 1] = 0x00;

  return buffer;
}

function encodeElement(key: string, value: BsonValue): Buffer {
  const keyBuffer = Buffer.from(key + "\0", "utf8");

  if (value === null) {
    const buffer = Buffer.alloc(1 + keyBuffer.length);
    buffer[0] = BsonType.NULL;
    keyBuffer.copy(buffer, 1);
    return buffer;
  }

  if (typeof value === "boolean") {
    const buffer = Buffer.alloc(1 + keyBuffer.length + 1);
    buffer[0] = BsonType.BOOLEAN;
    keyBuffer.copy(buffer, 1);
    buffer[1 + keyBuffer.length] = value ? 0x01 : 0x00;
    return buffer;
  }

  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
      const buffer = Buffer.alloc(1 + keyBuffer.length + 4);
      buffer[0] = BsonType.INT32;
      keyBuffer.copy(buffer, 1);
      buffer.writeInt32LE(value, 1 + keyBuffer.length);
      return buffer;
    }

    const buffer = Buffer.alloc(1 + keyBuffer.length + 8);
    buffer[0] = BsonType.DOUBLE;
    keyBuffer.copy(buffer, 1);
    buffer.writeDoubleLE(value, 1 + keyBuffer.length);
    return buffer;
  }

  if (typeof value === "string") {
    const strBuffer = Buffer.from(value + "\0", "utf8");
    const buffer = Buffer.alloc(1 + keyBuffer.length + 4 + strBuffer.length);
    buffer[0] = BsonType.STRING;
    keyBuffer.copy(buffer, 1);
    buffer.writeInt32LE(strBuffer.length, 1 + keyBuffer.length);
    strBuffer.copy(buffer, 1 + keyBuffer.length + 4);
    return buffer;
  }

  if (value instanceof Date) {
    const buffer = Buffer.alloc(1 + keyBuffer.length + 8);
    buffer[0] = BsonType.DATE;
    keyBuffer.copy(buffer, 1);
    const ms = BigInt(value.getTime());
    buffer.writeBigInt64LE(ms, 1 + keyBuffer.length);
    return buffer;
  }

  if (value instanceof ObjectId) {
    const buffer = Buffer.alloc(1 + keyBuffer.length + 12);
    buffer[0] = BsonType.OBJECT_ID;
    keyBuffer.copy(buffer, 1);
    value.toBuffer().copy(buffer, 1 + keyBuffer.length);
    return buffer;
  }

  if (value instanceof Buffer) {
    const buffer = Buffer.alloc(1 + keyBuffer.length + 4 + 1 + value.length);
    buffer[0] = BsonType.BINARY;
    keyBuffer.copy(buffer, 1);
    buffer.writeInt32LE(value.length, 1 + keyBuffer.length);
    buffer[1 + keyBuffer.length + 4] = 0x00;
    value.copy(buffer, 1 + keyBuffer.length + 5);
    return buffer;
  }

  if (Array.isArray(value)) {
    const arrayDoc: BsonDocument = {};
    value.forEach((item, index) => {
      arrayDoc[index.toString()] = item;
    });
    const encodedArray = encodeBson(arrayDoc);
    const buffer = Buffer.alloc(1 + keyBuffer.length + encodedArray.length);
    buffer[0] = BsonType.ARRAY;
    keyBuffer.copy(buffer, 1);
    encodedArray.copy(buffer, 1 + keyBuffer.length);
    return buffer;
  }

  if (typeof value === "object") {
    const encodedDoc = encodeBson(value as BsonDocument);
    const buffer = Buffer.alloc(1 + keyBuffer.length + encodedDoc.length);
    buffer[0] = BsonType.DOCUMENT;
    keyBuffer.copy(buffer, 1);
    encodedDoc.copy(buffer, 1 + keyBuffer.length);
    return buffer;
  }

  throw new Error(`Unsupported BSON type: ${typeof value}`);
}

export function decodeBson(buffer: Buffer, offset = 0): BsonDocument {
  const docLength = buffer.readInt32LE(offset);
  const doc: BsonDocument = {};
  let pos = offset + 4;
  const end = offset + docLength - 1;

  while (pos < end) {
    const type = buffer[pos];
    pos += 1;

    const keyEnd = buffer.indexOf(0, pos);
    const key = buffer.toString("utf8", pos, keyEnd);
    pos = keyEnd + 1;

    const { value, newPos } = decodeValue(buffer, pos, type);
    doc[key] = value;
    pos = newPos;
  }

  return doc;
}

function decodeValue(
  buffer: Buffer,
  pos: number,
  type: number
): { value: BsonValue; newPos: number } {
  switch (type) {
    case BsonType.DOUBLE: {
      const value = buffer.readDoubleLE(pos);
      return { value, newPos: pos + 8 };
    }

    case BsonType.STRING: {
      const length = buffer.readInt32LE(pos);
      const value = buffer.toString("utf8", pos + 4, pos + 4 + length - 1);
      return { value, newPos: pos + 4 + length };
    }

    case BsonType.DOCUMENT: {
      const docLength = buffer.readInt32LE(pos);
      const value = decodeBson(buffer, pos);
      return { value, newPos: pos + docLength };
    }

    case BsonType.ARRAY: {
      const docLength = buffer.readInt32LE(pos);
      const arrayDoc = decodeBson(buffer, pos);
      const value = Object.values(arrayDoc);
      return { value, newPos: pos + docLength };
    }

    case BsonType.BINARY: {
      const length = buffer.readInt32LE(pos);
      pos += 5;
      const value = buffer.subarray(pos, pos + length);
      return { value: Buffer.from(value), newPos: pos + length };
    }

    case BsonType.OBJECT_ID: {
      const value = new ObjectId(buffer.subarray(pos, pos + 12));
      return { value, newPos: pos + 12 };
    }

    case BsonType.BOOLEAN: {
      const value = buffer[pos] === 0x01;
      return { value, newPos: pos + 1 };
    }

    case BsonType.DATE: {
      const ms = buffer.readBigInt64LE(pos);
      const value = new Date(Number(ms));
      return { value, newPos: pos + 8 };
    }

    case BsonType.NULL: {
      return { value: null, newPos: pos };
    }

    case BsonType.INT32: {
      const value = buffer.readInt32LE(pos);
      return { value, newPos: pos + 4 };
    }

    case BsonType.INT64: {
      const value = Number(buffer.readBigInt64LE(pos));
      return { value, newPos: pos + 8 };
    }

    case BsonType.TIMESTAMP: {
      const value = Number(buffer.readBigInt64LE(pos));
      return { value, newPos: pos + 8 };
    }

    default:
      throw new Error(`Unsupported BSON type: 0x${type.toString(16)}`);
  }
}
