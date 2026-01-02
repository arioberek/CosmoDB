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
  type BsonDocument,
  ObjectId,
  decodeBson,
  encodeBson,
} from "./bson";

const OP_MSG = 2013;

export class MongoDBConnection implements DatabaseConnection {
  config: ConnectionConfig;
  state: ConnectionState = { status: "disconnected" };
  private client: TcpClient;
  private buffer: Buffer = Buffer.alloc(0);
  private requestId = 1;

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
    const helloCommand: BsonDocument = {
      hello: 1,
      $db: "admin",
    };

    const helloResponse = await this.sendCommand(helloCommand);

    if (!helloResponse.ok) {
      throw new Error(
        (helloResponse.errmsg as string) || "Hello command failed"
      );
    }

    if (!this.config.password) {
      return;
    }

    const nonce = this.generateNonce();
    const saslStartCommand: BsonDocument = {
      saslStart: 1,
      mechanism: "SCRAM-SHA-1",
      payload: Buffer.from(`n,,n=${this.config.username},r=${nonce}`),
      $db: "admin",
      autoAuthorize: 1,
    };

    const saslStartResponse = await this.sendCommand(saslStartCommand);

    if (!saslStartResponse.ok) {
      if (saslStartResponse.errmsg) {
        throw new Error(saslStartResponse.errmsg as string);
      }
      throw new Error("SASL start failed");
    }

    const serverFirstMessage = (saslStartResponse.payload as Buffer).toString(
      "utf8"
    );
    const conversationId = saslStartResponse.conversationId;

    const { clientFinal, serverSignature } = this.buildScramClientFinal(
      this.config.password,
      nonce,
      serverFirstMessage
    );

    const saslContinueCommand: BsonDocument = {
      saslContinue: 1,
      conversationId,
      payload: Buffer.from(clientFinal),
      $db: "admin",
    };

    const saslContinueResponse = await this.sendCommand(saslContinueCommand);

    if (!saslContinueResponse.ok) {
      throw new Error(
        (saslContinueResponse.errmsg as string) || "Authentication failed"
      );
    }

    const serverFinalMessage = (
      saslContinueResponse.payload as Buffer
    ).toString("utf8");
    const parsedServerFinal = this.parseScramAttributes(serverFinalMessage);

    if (parsedServerFinal.v !== serverSignature) {
      throw new Error("Server signature verification failed");
    }

    if (!saslContinueResponse.done) {
      const finalCommand: BsonDocument = {
        saslContinue: 1,
        conversationId,
        payload: Buffer.alloc(0),
        $db: "admin",
      };
      await this.sendCommand(finalCommand);
    }
  }

  private generateNonce(): string {
    const bytes = new Uint8Array(24);
    if (globalThis.crypto?.getRandomValues) {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
    }
    return Buffer.from(bytes).toString("base64");
  }

  private parseScramAttributes(message: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const parts = message.split(",");
    for (const part of parts) {
      const [key, ...rest] = part.split("=");
      if (key && rest.length > 0) {
        attrs[key] = rest.join("=");
      }
    }
    return attrs;
  }

  private buildScramClientFinal(
    password: string,
    clientNonce: string,
    serverFirstMessage: string
  ): { clientFinal: string; serverSignature: string } {
    const attrs = this.parseScramAttributes(serverFirstMessage);
    const serverNonce = attrs.r;
    const salt = Buffer.from(attrs.s, "base64");
    const iterations = parseInt(attrs.i, 10);

    const saltedPassword = this.pbkdf2Sha1(
      Buffer.from(password, "utf8"),
      salt,
      iterations,
      20
    );

    const clientKey = this.hmacSha1(saltedPassword, Buffer.from("Client Key"));
    const storedKey = this.sha1(clientKey);
    const channelBinding = Buffer.from("n,,").toString("base64");
    const clientFinalWithoutProof = `c=${channelBinding},r=${serverNonce}`;
    const authMessage = `n=${this.config.username},r=${clientNonce},${serverFirstMessage},${clientFinalWithoutProof}`;
    const clientSignature = this.hmacSha1(
      storedKey,
      Buffer.from(authMessage, "utf8")
    );
    const clientProof = this.xorBuffers(clientKey, clientSignature);
    const serverKey = this.hmacSha1(saltedPassword, Buffer.from("Server Key"));
    const serverSignature = this.hmacSha1(
      serverKey,
      Buffer.from(authMessage, "utf8")
    );

    const clientFinal = `${clientFinalWithoutProof},p=${clientProof.toString(
      "base64"
    )}`;

    return {
      clientFinal,
      serverSignature: serverSignature.toString("base64"),
    };
  }

  private sha1(input: Buffer): Buffer {
    const K = [0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xca62c1d6];
    let h0 = 0x67452301;
    let h1 = 0xefcdab89;
    let h2 = 0x98badcfe;
    let h3 = 0x10325476;
    let h4 = 0xc3d2e1f0;

    const bitLength = input.length * 8;
    const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
    const padded = Buffer.alloc(paddedLength);
    input.copy(padded);
    padded[input.length] = 0x80;
    padded.writeUInt32BE(bitLength >>> 0, paddedLength - 4);

    const w = new Uint32Array(80);

    for (let i = 0; i < paddedLength; i += 64) {
      for (let j = 0; j < 16; j++) {
        w[j] = padded.readUInt32BE(i + j * 4);
      }

      for (let j = 16; j < 80; j++) {
        const temp = w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16];
        w[j] = ((temp << 1) | (temp >>> 31)) >>> 0;
      }

      let a = h0;
      let b = h1;
      let c = h2;
      let d = h3;
      let e = h4;

      for (let j = 0; j < 80; j++) {
        let f: number;
        let k: number;

        if (j < 20) {
          f = (b & c) | (~b & d);
          k = K[0];
        } else if (j < 40) {
          f = b ^ c ^ d;
          k = K[1];
        } else if (j < 60) {
          f = (b & c) | (b & d) | (c & d);
          k = K[2];
        } else {
          f = b ^ c ^ d;
          k = K[3];
        }

        const temp = (((a << 5) | (a >>> 27)) + f + e + k + w[j]) >>> 0;
        e = d;
        d = c;
        c = ((b << 30) | (b >>> 2)) >>> 0;
        b = a;
        a = temp;
      }

      h0 = (h0 + a) >>> 0;
      h1 = (h1 + b) >>> 0;
      h2 = (h2 + c) >>> 0;
      h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0;
    }

    const result = Buffer.alloc(20);
    result.writeUInt32BE(h0, 0);
    result.writeUInt32BE(h1, 4);
    result.writeUInt32BE(h2, 8);
    result.writeUInt32BE(h3, 12);
    result.writeUInt32BE(h4, 16);

    return result;
  }

  private hmacSha1(key: Buffer, message: Buffer): Buffer {
    const blockSize = 64;
    let normalizedKey = key;

    if (normalizedKey.length > blockSize) {
      normalizedKey = this.sha1(normalizedKey);
    }

    const paddedKey = Buffer.alloc(blockSize);
    normalizedKey.copy(paddedKey);

    const oKeyPad = Buffer.alloc(blockSize);
    const iKeyPad = Buffer.alloc(blockSize);

    for (let i = 0; i < blockSize; i++) {
      oKeyPad[i] = paddedKey[i] ^ 0x5c;
      iKeyPad[i] = paddedKey[i] ^ 0x36;
    }

    const inner = this.sha1(Buffer.concat([iKeyPad, message]));
    return this.sha1(Buffer.concat([oKeyPad, inner]));
  }

  private pbkdf2Sha1(
    password: Buffer,
    salt: Buffer,
    iterations: number,
    keyLen: number
  ): Buffer {
    const blocksNeeded = Math.ceil(keyLen / 20);
    const output = Buffer.alloc(blocksNeeded * 20);

    for (let blockIndex = 1; blockIndex <= blocksNeeded; blockIndex++) {
      const blockSalt = Buffer.alloc(salt.length + 4);
      salt.copy(blockSalt);
      blockSalt.writeUInt32BE(blockIndex, salt.length);

      let u = this.hmacSha1(password, blockSalt);
      const t = Buffer.from(u);

      for (let i = 1; i < iterations; i++) {
        u = this.hmacSha1(password, u);
        for (let j = 0; j < t.length; j++) {
          t[j] ^= u[j];
        }
      }

      t.copy(output, (blockIndex - 1) * 20);
    }

    return output.subarray(0, keyLen);
  }

  private xorBuffers(a: Buffer, b: Buffer): Buffer {
    const result = Buffer.alloc(a.length);
    for (let i = 0; i < a.length; i++) {
      result[i] = a[i] ^ b[i];
    }
    return result;
  }

  private async sendCommand(command: BsonDocument): Promise<BsonDocument> {
    const bsonPayload = encodeBson(command);

    const sectionPayload = Buffer.alloc(1 + bsonPayload.length);
    sectionPayload[0] = 0;
    bsonPayload.copy(sectionPayload, 1);

    const header = Buffer.alloc(16);
    const messageLength = 16 + 4 + sectionPayload.length;
    header.writeInt32LE(messageLength, 0);
    header.writeInt32LE(this.requestId++, 4);
    header.writeInt32LE(0, 8);
    header.writeInt32LE(OP_MSG, 12);

    const flags = Buffer.alloc(4);
    flags.writeUInt32LE(0, 0);

    const message = Buffer.concat([header, flags, sectionPayload]);
    await this.client.send(message);

    return this.receiveResponse();
  }

  private async receiveResponse(): Promise<BsonDocument> {
    while (true) {
      if (this.buffer.length >= 4) {
        const messageLength = this.buffer.readInt32LE(0);

        if (this.buffer.length >= messageLength) {
          const responseBuffer = this.buffer.subarray(0, messageLength);
          this.buffer = this.buffer.subarray(messageLength);

          const sectionKind = responseBuffer[20];

          if (sectionKind !== 0) {
            throw new Error(`Unsupported section kind: ${sectionKind}`);
          }

          const bsonStart = 21;
          const response = decodeBson(responseBuffer, bsonStart);

          return response;
        }
      }

      const data = await this.client.receive();
      this.buffer = Buffer.concat([this.buffer, data]);
    }
  }

  async disconnect(): Promise<void> {
    await this.client.disconnect();
    this.state = { status: "disconnected" };
  }

  async query(queryString: string): Promise<QueryResult> {
    if (!this.client.isConnected()) {
      throw new Error("Not connected");
    }

    const startTime = Date.now();

    let queryDoc: BsonDocument;
    try {
      queryDoc = JSON.parse(queryString);
    } catch {
      throw new Error("Invalid JSON query. MongoDB queries must be valid JSON.");
    }

    queryDoc.$db = this.config.database;

    const response = await this.sendCommand(queryDoc);

    if (!response.ok && response.ok !== 1) {
      throw new Error((response.errmsg as string) || "Query failed");
    }

    const documents = this.extractDocuments(response);
    const columns = this.extractColumnsFromDocuments(documents);

    return {
      columns,
      rows: documents,
      rowCount: documents.length,
      executionTime: Date.now() - startTime,
      command: Object.keys(queryDoc)[0],
    };
  }

  private extractDocuments(response: BsonDocument): Record<string, unknown>[] {
    if (response.cursor && typeof response.cursor === "object") {
      const cursor = response.cursor as BsonDocument;
      if (cursor.firstBatch && Array.isArray(cursor.firstBatch)) {
        return cursor.firstBatch as Record<string, unknown>[];
      }
    }

    if (response.values && Array.isArray(response.values)) {
      return response.values as Record<string, unknown>[];
    }

    if (response.databases && Array.isArray(response.databases)) {
      return response.databases as Record<string, unknown>[];
    }

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(response)) {
      if (key !== "ok" && key !== "$clusterTime" && key !== "operationTime") {
        result[key] = value;
      }
    }
    return [result];
  }

  private extractColumnsFromDocuments(
    documents: Record<string, unknown>[]
  ): ColumnInfo[] {
    if (documents.length === 0) {
      return [];
    }

    const columnSet = new Set<string>();
    for (const doc of documents) {
      for (const key of Object.keys(doc)) {
        columnSet.add(key);
      }
    }

    return Array.from(columnSet).map((name) => ({
      name,
      type: this.inferMongoType(documents[0][name]),
    }));
  }

  private inferMongoType(value: unknown): string {
    if (value === null) return "null";
    if (value instanceof ObjectId) return "objectId";
    if (value instanceof Date) return "date";
    if (value instanceof Buffer) return "binary";
    if (Array.isArray(value)) return "array";
    if (typeof value === "object") return "document";
    if (typeof value === "number") {
      return Number.isInteger(value) ? "int" : "double";
    }
    if (typeof value === "boolean") return "bool";
    if (typeof value === "string") return "string";
    return "unknown";
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    const command: BsonDocument = {
      listDatabases: 1,
      $db: "admin",
    };

    const response = await this.sendCommand(command);

    if (!response.ok) {
      throw new Error((response.errmsg as string) || "listDatabases failed");
    }

    const databases = response.databases as BsonDocument[];
    return databases.map((db) => ({
      name: db.name as string,
    }));
  }

  async listTables(_schema?: string): Promise<TableInfo[]> {
    const command: BsonDocument = {
      listCollections: 1,
      $db: this.config.database,
    };

    const response = await this.sendCommand(command);

    if (!response.ok) {
      throw new Error((response.errmsg as string) || "listCollections failed");
    }

    const cursor = response.cursor as BsonDocument;
    const collections = (cursor?.firstBatch as BsonDocument[]) || [];

    return collections.map((col) => ({
      schema: this.config.database,
      name: col.name as string,
      type: (col.type as string) === "view" ? "view" : "table",
    }));
  }

  async describeTable(_schema: string, table: string): Promise<ColumnInfo[]> {
    const command: BsonDocument = {
      find: table,
      limit: 1,
      $db: this.config.database,
    };

    const response = await this.sendCommand(command);

    if (!response.ok) {
      throw new Error((response.errmsg as string) || "describe failed");
    }

    const cursor = response.cursor as BsonDocument;
    const documents = (cursor?.firstBatch as BsonDocument[]) || [];

    if (documents.length === 0) {
      return [];
    }

    const sampleDoc = documents[0];
    return Object.entries(sampleDoc).map(([name, value]) => ({
      name,
      type: this.inferMongoType(value),
    }));
  }
}
