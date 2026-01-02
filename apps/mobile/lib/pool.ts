import type { ConnectionConfig, DatabaseConnection } from "./types";

type PooledConnection = {
  connection: DatabaseConnection;
  lastUsed: number;
  inUse: boolean;
};

type PoolConfig = {
  maxSize: number;
  idleTimeoutMs: number;
  acquireTimeoutMs: number;
};

const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxSize: 5,
  idleTimeoutMs: 30000,
  acquireTimeoutMs: 10000,
};

export class ConnectionPool {
  private pools = new Map<string, PooledConnection[]>();
  private config: PoolConfig;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<PoolConfig> = {}) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
    this.startCleanupTimer();
  }

  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, this.config.idleTimeoutMs / 2);
  }

  private cleanupIdleConnections(): void {
    const now = Date.now();
    for (const [configId, pool] of this.pools) {
      const activeConnections = pool.filter((pc) => {
        if (pc.inUse) return true;
        if (now - pc.lastUsed > this.config.idleTimeoutMs) {
          pc.connection.disconnect().catch(() => {});
          return false;
        }
        return true;
      });
      if (activeConnections.length === 0) {
        this.pools.delete(configId);
      } else {
        this.pools.set(configId, activeConnections);
      }
    }
  }

  async acquire(
    config: ConnectionConfig,
    factory: (config: ConnectionConfig) => DatabaseConnection
  ): Promise<DatabaseConnection> {
    const poolKey = this.getPoolKey(config);
    let pool = this.pools.get(poolKey);

    if (!pool) {
      pool = [];
      this.pools.set(poolKey, pool);
    }

    const available = pool.find((pc) => !pc.inUse);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available.connection;
    }

    if (pool.length < this.config.maxSize) {
      const connection = factory(config);
      await connection.connect();
      const pooled: PooledConnection = {
        connection,
        lastUsed: Date.now(),
        inUse: true,
      };
      pool.push(pooled);
      return connection;
    }

    return this.waitForAvailable(pool);
  }

  private async waitForAvailable(pool: PooledConnection[]): Promise<DatabaseConnection> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const available = pool.find((pc) => !pc.inUse);
        if (available) {
          clearInterval(checkInterval);
          available.inUse = true;
          available.lastUsed = Date.now();
          resolve(available.connection);
          return;
        }

        if (Date.now() - startTime > this.config.acquireTimeoutMs) {
          clearInterval(checkInterval);
          reject(new Error("Connection pool exhausted"));
        }
      }, 50);
    });
  }

  release(config: ConnectionConfig, connection: DatabaseConnection): void {
    const poolKey = this.getPoolKey(config);
    const pool = this.pools.get(poolKey);
    if (!pool) return;

    const pooled = pool.find((pc) => pc.connection === connection);
    if (pooled) {
      pooled.inUse = false;
      pooled.lastUsed = Date.now();
    }
  }

  async destroy(config: ConnectionConfig): Promise<void> {
    const poolKey = this.getPoolKey(config);
    const pool = this.pools.get(poolKey);
    if (!pool) return;

    await Promise.all(pool.map((pc) => pc.connection.disconnect().catch(() => {})));
    this.pools.delete(poolKey);
  }

  async destroyAll(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    const destroyPromises: Promise<void>[] = [];
    for (const pool of this.pools.values()) {
      for (const pc of pool) {
        destroyPromises.push(pc.connection.disconnect().catch(() => {}));
      }
    }
    await Promise.all(destroyPromises);
    this.pools.clear();
  }

  getStats(): { total: number; inUse: number; idle: number } {
    let total = 0;
    let inUse = 0;

    for (const pool of this.pools.values()) {
      total += pool.length;
      inUse += pool.filter((pc) => pc.inUse).length;
    }

    return { total, inUse, idle: total - inUse };
  }

  private getPoolKey(config: ConnectionConfig): string {
    return `${config.type}://${config.host}:${config.port}/${config.database}@${config.username}`;
  }
}

export const globalPool = new ConnectionPool();
