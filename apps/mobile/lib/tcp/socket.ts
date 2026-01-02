import Constants, { ExecutionEnvironment } from "expo-constants";
import type { SslConfig } from "../types";

export interface TlsOptions {
  enabled: boolean;
  rejectUnauthorized?: boolean;
  ca?: string;
  cert?: string;
  key?: string;
}

export interface TcpConnectionOptions {
  host: string;
  port: number;
  tls?: boolean | TlsOptions;
  timeout?: number;
}

export const sslConfigToTlsOptions = (ssl: boolean | SslConfig): boolean | TlsOptions => {
  if (typeof ssl === "boolean") {
    return ssl;
  }
  return {
    enabled: ssl.enabled,
    rejectUnauthorized: ssl.rejectUnauthorized,
    ca: ssl.ca,
    cert: ssl.cert,
    key: ssl.key,
  };
};

type TcpSocketInstance = {
  write: (
    data: Buffer,
    encoding?: string,
    cb?: (err?: Error) => void
  ) => void;
  on: (event: string, cb: (...args: any[]) => void) => void;
  destroy: () => void;
};

type TcpSocketModule = {
  createConnection: (options: Record<string, unknown>, cb?: () => void) => TcpSocketInstance;
  connectTLS?: (options: Record<string, unknown>, cb?: () => void) => TcpSocketInstance;
};

let cachedTcpSocket: TcpSocketModule | null = null;
let tcpSocketLoadError: Error | null = null;

function getTcpSocket(): TcpSocketModule {
  if (cachedTcpSocket) return cachedTcpSocket;
  if (tcpSocketLoadError) throw tcpSocketLoadError;

  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    const message =
      "TCP sockets are not available in Expo Go. Create a development build to use database connections.";
    tcpSocketLoadError = new Error(message);
    throw tcpSocketLoadError;
  }

  try {
    const mod = require("react-native-tcp-socket");
    cachedTcpSocket = (mod?.default ?? mod) as TcpSocketModule;
    return cachedTcpSocket;
  } catch (error) {
    const message =
      "TCP sockets are not available in Expo Go. Create a development build to use database connections.";
    tcpSocketLoadError = new Error(message);
    throw tcpSocketLoadError;
  }
}

export class TcpClient {
  private socket: TcpSocketInstance | null = null;
  private buffer: Buffer = Buffer.alloc(0);
  private messageQueue: Array<{
    resolve: (data: Buffer) => void;
    reject: (error: Error) => void;
  }> = [];
  private connected = false;

  async connect(options: TcpConnectionOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const { host, port, tls = false, timeout = 10000 } = options;

      let TcpSocket: TcpSocketModule;
      try {
        TcpSocket = getTcpSocket();
      } catch (error) {
        reject(error instanceof Error ? error : new Error("TCP socket unavailable"));
        return;
      }

      const useTls = typeof tls === "boolean" ? tls : tls.enabled;

      const connectionOptions: Record<string, unknown> = {
        host,
        port,
        timeout,
      };

      if (useTls && typeof tls === "object") {
        if (tls.rejectUnauthorized !== undefined) {
          connectionOptions.rejectUnauthorized = tls.rejectUnauthorized;
        }
        if (tls.ca) {
          connectionOptions.ca = tls.ca;
        }
        if (tls.cert) {
          connectionOptions.cert = tls.cert;
        }
        if (tls.key) {
          connectionOptions.key = tls.key;
        }
      }

      const socket = useTls
        ? TcpSocket.connectTLS?.(connectionOptions, () => {
            this.connected = true;
            resolve();
          })
        : TcpSocket.createConnection(connectionOptions, () => {
            this.connected = true;
            resolve();
          });

      if (!socket) {
        reject(new Error("TLS connections are not supported on this build"));
        return;
      }

      this.socket = socket;

      socket.on("data", (data) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        this.buffer = Buffer.concat([this.buffer, buf]);
        this.processBuffer();
      });

      socket.on("error", (error: Error) => {
        if (!this.connected) {
          reject(error);
        }
        this.handleError(error);
      });

      socket.on("close", () => {
        this.connected = false;
        this.rejectPendingMessages(new Error("Connection closed"));
      });

      socket.on("timeout", () => {
        reject(new Error("Connection timeout"));
        this.disconnect();
      });
    });
  }

  async send(data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected"));
        return;
      }

      this.socket.write(data, undefined, (err: Error | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async receive(expectedLength?: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (expectedLength && this.buffer.length >= expectedLength) {
        const data = this.buffer.slice(0, expectedLength);
        this.buffer = this.buffer.slice(expectedLength);
        resolve(data);
        return;
      }

      this.messageQueue.push({ resolve, reject });
    });
  }

  private processBuffer(): void {
    while (this.messageQueue.length > 0 && this.buffer.length > 0) {
      const pending = this.messageQueue.shift();
      if (pending) {
        const data = this.buffer;
        this.buffer = Buffer.alloc(0);
        pending.resolve(data);
      }
    }
  }

  private handleError(error: Error): void {
    this.rejectPendingMessages(error);
  }

  private rejectPendingMessages(error: Error): void {
    while (this.messageQueue.length > 0) {
      const pending = this.messageQueue.shift();
      pending?.reject(error);
    }
  }

  async disconnect(): Promise<void> {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
      this.buffer = Buffer.alloc(0);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}
