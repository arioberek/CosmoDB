import type { DatabaseType } from "./types";

const enum ErrorCode {
  CONNECTION_REFUSED = "CONNECTION_REFUSED",
  CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
  HOST_UNREACHABLE = "HOST_UNREACHABLE",
  DNS_RESOLUTION_FAILED = "DNS_RESOLUTION_FAILED",
  AUTH_FAILED = "AUTH_FAILED",
  SSL_REQUIRED = "SSL_REQUIRED",
  SSL_HANDSHAKE_FAILED = "SSL_HANDSHAKE_FAILED",
  INVALID_CREDENTIALS = "INVALID_CREDENTIALS",
  DATABASE_NOT_FOUND = "DATABASE_NOT_FOUND",
  PERMISSION_DENIED = "PERMISSION_DENIED",
  PROTOCOL_ERROR = "PROTOCOL_ERROR",
  UNKNOWN = "UNKNOWN",
}

type ErrorPattern = {
  patterns: Array<string | RegExp>;
  code: ErrorCode;
  userMessage: string;
};

const POSTGRES_ERROR_PATTERNS: ErrorPattern[] = [
  {
    patterns: ["ECONNREFUSED", "connection refused"],
    code: ErrorCode.CONNECTION_REFUSED,
    userMessage: "Cannot connect to PostgreSQL server. Check if the server is running and the port is correct.",
  },
  {
    patterns: ["ETIMEDOUT", "timeout", "Connection timeout"],
    code: ErrorCode.CONNECTION_TIMEOUT,
    userMessage: "Connection timed out. The server may be slow or unreachable.",
  },
  {
    patterns: ["ENOTFOUND", "getaddrinfo"],
    code: ErrorCode.DNS_RESOLUTION_FAILED,
    userMessage: "Cannot resolve hostname. Check if the host address is correct.",
  },
  {
    patterns: ["password authentication failed", "28P01"],
    code: ErrorCode.INVALID_CREDENTIALS,
    userMessage: "Invalid username or password.",
  },
  {
    patterns: ["database.*does not exist", "3D000"],
    code: ErrorCode.DATABASE_NOT_FOUND,
    userMessage: "Database not found. Check if the database name is correct.",
  },
  {
    patterns: ["permission denied", "42501"],
    code: ErrorCode.PERMISSION_DENIED,
    userMessage: "Permission denied. The user may not have access to this database.",
  },
  {
    patterns: ["SSL required", "no pg_hba.conf entry"],
    code: ErrorCode.SSL_REQUIRED,
    userMessage: "Server requires SSL connection. Enable SSL in connection settings.",
  },
  {
    patterns: ["SSL", "certificate", "CERT"],
    code: ErrorCode.SSL_HANDSHAKE_FAILED,
    userMessage: "SSL handshake failed. Check certificate configuration.",
  },
];

const MYSQL_ERROR_PATTERNS: ErrorPattern[] = [
  {
    patterns: ["ECONNREFUSED", "connection refused"],
    code: ErrorCode.CONNECTION_REFUSED,
    userMessage: "Cannot connect to MySQL server. Check if the server is running and the port is correct.",
  },
  {
    patterns: ["ETIMEDOUT", "timeout"],
    code: ErrorCode.CONNECTION_TIMEOUT,
    userMessage: "Connection timed out. The server may be slow or unreachable.",
  },
  {
    patterns: ["ENOTFOUND", "getaddrinfo"],
    code: ErrorCode.DNS_RESOLUTION_FAILED,
    userMessage: "Cannot resolve hostname. Check if the host address is correct.",
  },
  {
    patterns: ["Access denied", "1045"],
    code: ErrorCode.INVALID_CREDENTIALS,
    userMessage: "Invalid username or password.",
  },
  {
    patterns: ["Unknown database", "1049"],
    code: ErrorCode.DATABASE_NOT_FOUND,
    userMessage: "Database not found. Check if the database name is correct.",
  },
  {
    patterns: ["caching_sha2_password requires SSL"],
    code: ErrorCode.SSL_REQUIRED,
    userMessage: "Server requires SSL for this authentication method. Enable SSL or use mysql_native_password.",
  },
];

const MONGODB_ERROR_PATTERNS: ErrorPattern[] = [
  {
    patterns: ["ECONNREFUSED", "connection refused"],
    code: ErrorCode.CONNECTION_REFUSED,
    userMessage: "Cannot connect to MongoDB server. Check if the server is running and the port is correct.",
  },
  {
    patterns: ["ETIMEDOUT", "timeout"],
    code: ErrorCode.CONNECTION_TIMEOUT,
    userMessage: "Connection timed out. The server may be slow or unreachable.",
  },
  {
    patterns: ["ENOTFOUND", "getaddrinfo"],
    code: ErrorCode.DNS_RESOLUTION_FAILED,
    userMessage: "Cannot resolve hostname. Check if the host address is correct.",
  },
  {
    patterns: ["Authentication failed", "auth error"],
    code: ErrorCode.INVALID_CREDENTIALS,
    userMessage: "Invalid username or password.",
  },
  {
    patterns: ["not authorized", "Unauthorized"],
    code: ErrorCode.PERMISSION_DENIED,
    userMessage: "Permission denied. The user may not have access to this database.",
  },
];

const SQLITE_ERROR_PATTERNS: ErrorPattern[] = [
  {
    patterns: ["ENOENT", "no such file"],
    code: ErrorCode.DATABASE_NOT_FOUND,
    userMessage: "Database file not found. Check if the file path is correct.",
  },
  {
    patterns: ["EACCES", "permission denied"],
    code: ErrorCode.PERMISSION_DENIED,
    userMessage: "Cannot access database file. Check file permissions.",
  },
  {
    patterns: ["not a database", "malformed"],
    code: ErrorCode.PROTOCOL_ERROR,
    userMessage: "Invalid database file. The file may be corrupted or not a valid SQLite database.",
  },
];

const ERROR_PATTERNS_BY_TYPE: Record<DatabaseType, ErrorPattern[]> = {
  postgres: POSTGRES_ERROR_PATTERNS,
  cockroachdb: POSTGRES_ERROR_PATTERNS,
  mysql: MYSQL_ERROR_PATTERNS,
  mariadb: MYSQL_ERROR_PATTERNS,
  mongodb: MONGODB_ERROR_PATTERNS,
  sqlite: SQLITE_ERROR_PATTERNS,
};

const matchesPattern = (message: string, pattern: string | RegExp): boolean => {
  if (typeof pattern === "string") {
    return message.toLowerCase().includes(pattern.toLowerCase());
  }
  return pattern.test(message);
};

export const formatConnectionError = (error: unknown, dbType: DatabaseType): string => {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const patterns = ERROR_PATTERNS_BY_TYPE[dbType] ?? [];

  for (const errorPattern of patterns) {
    const matches = errorPattern.patterns.some((p) => matchesPattern(rawMessage, p));
    if (matches) {
      return errorPattern.userMessage;
    }
  }

  if (rawMessage.includes("ECONNREFUSED")) {
    return "Cannot connect to server. Check if the server is running.";
  }
  if (rawMessage.includes("ETIMEDOUT")) {
    return "Connection timed out.";
  }
  if (rawMessage.includes("ENOTFOUND")) {
    return "Cannot resolve hostname.";
  }

  return rawMessage;
};

export const formatQueryError = (error: unknown, _dbType: DatabaseType): string => {
  const rawMessage = error instanceof Error ? error.message : String(error);

  const syntaxPatterns = [
    { pattern: /syntax error/i, message: "SQL syntax error" },
    { pattern: /column.*does not exist/i, message: "Column not found" },
    { pattern: /table.*does not exist/i, message: "Table not found" },
    { pattern: /relation.*does not exist/i, message: "Table or view not found" },
    { pattern: /permission denied/i, message: "Permission denied" },
    { pattern: /duplicate key/i, message: "Duplicate key violation" },
    { pattern: /foreign key/i, message: "Foreign key constraint violation" },
    { pattern: /null value/i, message: "NULL value not allowed" },
  ];

  for (const { pattern, message } of syntaxPatterns) {
    if (pattern.test(rawMessage)) {
      return `${message}: ${rawMessage}`;
    }
  }

  return rawMessage;
};
