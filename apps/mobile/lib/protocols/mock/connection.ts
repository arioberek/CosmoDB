import type {
  ConnectionConfig,
  ConnectionState,
  DatabaseConnection,
  QueryResult,
  DatabaseInfo,
  TableInfo,
  ColumnInfo,
} from "../../types";

const MOCK_TABLES: TableInfo[] = [
  { schema: "public", name: "users", type: "table", rowCount: 1250 },
  { schema: "public", name: "orders", type: "table", rowCount: 8420 },
  { schema: "public", name: "products", type: "table", rowCount: 342 },
  { schema: "public", name: "categories", type: "table", rowCount: 24 },
  { schema: "public", name: "order_items", type: "table", rowCount: 15680 },
  { schema: "public", name: "reviews", type: "table", rowCount: 3200 },
  { schema: "public", name: "user_sessions", type: "view", rowCount: 89 },
];

const MOCK_COLUMNS: Record<string, ColumnInfo[]> = {
  users: [
    { name: "id", type: "uuid" },
    { name: "email", type: "varchar(255)" },
    { name: "name", type: "varchar(100)" },
    { name: "created_at", type: "timestamp" },
    { name: "updated_at", type: "timestamp" },
    { name: "is_active", type: "boolean" },
  ],
  orders: [
    { name: "id", type: "uuid" },
    { name: "user_id", type: "uuid" },
    { name: "total", type: "decimal(10,2)" },
    { name: "status", type: "varchar(50)" },
    { name: "created_at", type: "timestamp" },
  ],
  products: [
    { name: "id", type: "uuid" },
    { name: "name", type: "varchar(255)" },
    { name: "price", type: "decimal(10,2)" },
    { name: "category_id", type: "integer" },
    { name: "stock", type: "integer" },
  ],
};

const MOCK_DATA: Record<string, Record<string, unknown>[]> = {
  users: [
    { id: "a1b2c3d4", email: "john@example.com", name: "John Doe", created_at: "2025-01-01 10:00:00", is_active: true },
    { id: "e5f6g7h8", email: "jane@example.com", name: "Jane Smith", created_at: "2025-01-02 14:30:00", is_active: true },
    { id: "i9j0k1l2", email: "bob@example.com", name: "Bob Wilson", created_at: "2025-01-03 09:15:00", is_active: false },
    { id: "m3n4o5p6", email: "alice@example.com", name: "Alice Brown", created_at: "2025-01-04 16:45:00", is_active: true },
    { id: "q7r8s9t0", email: "charlie@example.com", name: "Charlie Davis", created_at: "2025-01-05 11:20:00", is_active: true },
  ],
  orders: [
    { id: "ord-001", user_id: "a1b2c3d4", total: 150.00, status: "completed", created_at: "2025-01-10 12:00:00" },
    { id: "ord-002", user_id: "e5f6g7h8", total: 89.99, status: "pending", created_at: "2025-01-11 09:30:00" },
    { id: "ord-003", user_id: "a1b2c3d4", total: 245.50, status: "shipped", created_at: "2025-01-12 15:45:00" },
    { id: "ord-004", user_id: "m3n4o5p6", total: 32.00, status: "completed", created_at: "2025-01-13 08:00:00" },
  ],
  products: [
    { id: "prod-001", name: "Wireless Mouse", price: 29.99, category_id: 1, stock: 150 },
    { id: "prod-002", name: "Mechanical Keyboard", price: 89.99, category_id: 1, stock: 75 },
    { id: "prod-003", name: "USB-C Hub", price: 45.00, category_id: 2, stock: 200 },
    { id: "prod-004", name: "Monitor Stand", price: 65.00, category_id: 3, stock: 50 },
  ],
};

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseQuery(sql: string): { type: string; table?: string } {
  const normalized = sql.trim().toLowerCase();

  if (normalized.startsWith("select")) {
    const fromMatch = normalized.match(/from\s+(\w+)/);
    return { type: "SELECT", table: fromMatch?.[1] };
  }
  if (normalized.startsWith("insert")) {
    const intoMatch = normalized.match(/into\s+(\w+)/);
    return { type: "INSERT", table: intoMatch?.[1] };
  }
  if (normalized.startsWith("update")) {
    const tableMatch = normalized.match(/update\s+(\w+)/);
    return { type: "UPDATE", table: tableMatch?.[1] };
  }
  if (normalized.startsWith("delete")) {
    const fromMatch = normalized.match(/from\s+(\w+)/);
    return { type: "DELETE", table: fromMatch?.[1] };
  }

  return { type: "UNKNOWN" };
}

export class MockConnection implements DatabaseConnection {
  config: ConnectionConfig;
  state: ConnectionState = { status: "disconnected" };

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.state = { status: "connecting" };
    await delay(500 + Math.random() * 500);
    this.state = { status: "connected" };
  }

  async disconnect(): Promise<void> {
    await delay(100);
    this.state = { status: "disconnected" };
  }

  async query(sql: string): Promise<QueryResult> {
    if (this.state.status !== "connected") {
      throw new Error("Not connected");
    }

    const startTime = Date.now();
    await delay(100 + Math.random() * 200);

    const { type, table } = parseQuery(sql);
    const executionTime = Date.now() - startTime;

    if (type === "SELECT" && table) {
      const data = MOCK_DATA[table] ?? [];
      const columns = MOCK_COLUMNS[table] ?? [{ name: "result", type: "text" }];

      return {
        columns,
        rows: data,
        rowCount: data.length,
        executionTime,
        command: `SELECT ${data.length}`,
      };
    }

    if (type === "INSERT") {
      return {
        columns: [],
        rows: [],
        rowCount: 1,
        executionTime,
        command: "INSERT 0 1",
      };
    }

    if (type === "UPDATE") {
      const affected = Math.floor(Math.random() * 5) + 1;
      return {
        columns: [],
        rows: [],
        rowCount: affected,
        executionTime,
        command: `UPDATE ${affected}`,
      };
    }

    if (type === "DELETE") {
      const affected = Math.floor(Math.random() * 3) + 1;
      return {
        columns: [],
        rows: [],
        rowCount: affected,
        executionTime,
        command: `DELETE ${affected}`,
      };
    }

    return {
      columns: [{ name: "result", type: "text" }],
      rows: [{ result: "Query executed (mock)" }],
      rowCount: 1,
      executionTime,
      command: type,
    };
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    await delay(150);
    return [
      { name: this.config.database, owner: this.config.username, encoding: "UTF8" },
      { name: "postgres", owner: "postgres", encoding: "UTF8" },
      { name: "template1", owner: "postgres", encoding: "UTF8" },
    ];
  }

  async listTables(_schema?: string): Promise<TableInfo[]> {
    await delay(200);
    return MOCK_TABLES;
  }

  async describeTable(_schema: string, table: string): Promise<ColumnInfo[]> {
    await delay(100);
    return MOCK_COLUMNS[table] ?? [];
  }
}
