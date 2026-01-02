# CosmoDB Mobile - Database Client

A universal mobile database client for iOS, Android, and Web. Connect directly to PostgreSQL and MySQL/MariaDB databases using native TCP sockets, just like DBeaver or TablePlus, but for your phone.

## Overview

CosmoDB Mobile is a full-featured database client that brings professional database management to your mobile device. Instead of relying on REST APIs or web dashboards, this app connects directly to your database servers using the native database wire protocols.

**Key Highlights:**
- 🔌 Direct TCP connection to databases (no intermediate API)
- 🔒 Encrypted credential storage using device-native security
- 📊 SQL query editor with results visualization
- 🚀 Native iOS, Android, and Web support via Expo
- ⚡ Built with modern React Native and TypeScript
- 🌙 Dark theme optimized for SQL editors

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     React Native App                      │
│              (iOS / Android / Web via Expo)               │
└─────────────────────────────────────────────────────────┘
                            ↓
                 ┌──────────────────────┐
                 │  Connection Manager  │
                 │   (Zustand Store)    │
                 └──────────────────────┘
                            ↓
        ┌───────────────────┴───────────────────┐
        ↓                                       ↓
┌──────────────────┐              ┌──────────────────┐
│ PostgreSQL v3    │              │  MySQL Protocol  │
│   Implementation │              │  (Planned)       │
└──────────────────┘              └──────────────────┘
        ↓                                       ↓
        └───────────────────┬───────────────────┘
                            ↓
                  ┌──────────────────┐
                  │  TCP Socket      │
                  │  (react-native   │
                  │   -tcp-socket)   │
                  └──────────────────┘
                            ↓
        ┌───────────────────┴───────────────────┐
        ↓                                       ↓
   PostgreSQL Server                    MySQL/MariaDB Server
```

## Quick Start

### Prerequisites

- **Node.js**: 18+ (with bun package manager)
- **Bun**: Latest version (`curl -fsSL https://bun.sh/install | bash`)
- **Expo CLI**: Installed via bun (handled automatically)
- **iOS/Android Development**: See [Expo documentation](https://docs.expo.dev)

### Installation

```bash
# Install dependencies
bun install

# Generate TypeScript types for expo-router
bun --filter @hr/frontend generate

# Type check
bun typecheck
```

### Running the App

**Development Server:**
```bash
bun start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Press `w` for web browser

**Native Build (iOS):**
```bash
# First time setup
bunx expo prebuild --platform ios --clean

# Run on simulator
bunx expo start --ios
```

**Native Build (Android):**
```bash
# First time setup
bunx expo prebuild --platform android --clean

# Run on emulator
bunx expo start --android
```

## Features

### Current (MVP)

#### 1. **Connection Management**
- Save multiple database connections locally
- Secure storage of credentials (encrypted on device)
- Quick connect/disconnect
- Connection status indicators
- Support for:
  - PostgreSQL (all versions)
  - SSL/TLS connections
  - Custom connection ports
  - Multiple databases per server

#### 2. **Query Editor**
- Syntax-highlighting SQL editor
- Execute queries with keyboard shortcut
- View execution time and row count
- Clear, readable results table

#### 3. **Results Viewer**
- Horizontal scrollable table for wide datasets
- Column names with data types
- NULL value highlighting
- Results exported as-is (ready for copying)

#### 4. **Database Explorer** (Planned)
- List databases/schemas
- List tables with structure
- View indexes and constraints
- Quick table inspection

### Future Features

- MySQL/MariaDB protocol support
- Query history and favorites
- Export results (CSV, JSON, SQL INSERT)
- Database diff tool
- Transaction support
- Saved queries library
- Query performance insights

## Project Structure

```
mobile/
├── app/                          # Expo Router screens (file-based routing)
│   ├── _layout.tsx              # Root layout with providers
│   ├── index.tsx                # Home screen (connections list)
│   ├── connection/
│   │   ├── new.tsx              # New connection form
│   │   └── [id].tsx             # Connection details screen
│   └── query/
│       └── [connectionId].tsx    # SQL editor and results
├── lib/
│   ├── types.ts                 # TypeScript interfaces
│   ├── tcp/
│   │   └── socket.ts            # TCP socket wrapper (TcpClient class)
│   ├── protocols/
│   │   └── postgres/            # PostgreSQL v3 wire protocol
│   │       ├── connection.ts     # PostgresConnection class
│   │       ├── messages.ts       # Message builders and parsers
│   │       └── index.ts          # Public exports
│   └── storage/
│       └── connections.ts        # Secure credential storage
├── stores/
│   └── connection.ts             # Zustand connection state management
├── app.json                       # Expo configuration
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript configuration
└── README.md                      # This file
```

## Technical Details

### Database Connection Flow

```
User Action (Connect)
    ↓
useConnectionStore.connect()
    ↓
Create PostgresConnection instance
    ↓
TcpClient.connect() → Raw TCP socket
    ↓
PostgreSQL Startup Message
    ↓
Server: Auth Challenge (MD5, SCRAM-SHA-256, or Cleartext)
    ↓
Client: Password Message
    ↓
Server: Backend Key Data + Ready for Query
    ↓
Connection Ready
```

### Query Execution

```
User: Enters SQL and presses Run
    ↓
executeQuery(connectionId, sql)
    ↓
PostgresConnection.query(sql)
    ↓
Send Query Message (Describe + Execute)
    ↓
Receive: RowDescription (columns)
    ↓
Receive: DataRow messages (loop)
    ↓
Receive: CommandComplete
    ↓
Parse rows and return QueryResult
    ↓
Display results in table
```

### PostgreSQL Wire Protocol (v3)

The implementation handles:

1. **Startup (StartupMessage)**
   - Protocol version: 3.0 (196608 in big-endian)
   - Parameters: user, database, optional options

2. **Authentication (AuthenticationXxx)**
   - `OK` (0): No authentication
   - `CleartextPassword` (3): Send password in plaintext
   - `MD5Password` (5): MD5 hash of password + salt
   - `SASL` (10): SCRAM-SHA-256 [Implemented, ready]

3. **Query (Query)**
   - Simple query string: `SELECT * FROM users;`
   - Returns rows immediately

4. **Response Messages**
   - `RowDescription`: Column metadata (name, type OID)
   - `DataRow`: Single row data with value lengths
   - `CommandComplete`: Query finished with tag (SELECT, INSERT, etc.)
   - `ErrorResponse`: Query error details

### Type System

All TypeScript code uses strict mode with full type safety:

```typescript
// Connection configuration
export interface ConnectionConfig {
  id: string;
  name: string;
  type: "postgres" | "mysql";
  host: string;
  port: number;
  database: string;
  username: string;
  // password is stored separately in secure storage
  ssl?: boolean;
}

// Query results
export interface QueryResult {
  columns: ColumnInfo[];
  rows: Record<string, any>[];
  rowCount: number;
  command: string;
  executionTime: number;
}

// Column metadata
export interface ColumnInfo {
  name: string;
  type: string;
  typeOID: number;
  tableName?: string;
}
```

### State Management (Zustand)

The connection store manages all active database connections:

```typescript
const useConnectionStore = create<ConnectionStore>((set, get) => ({
  // Map of connection ID → active connection instance
  activeConnections: new Map<string, ActiveConnection>(),

  // Connect to a database
  connect: async (config: ConnectionConfig) => { /* ... */ },

  // Execute SQL query on a connection
  executeQuery: async (connectionId: string, sql: string) => Promise<QueryResult>,

  // Cleanup when done
  disconnect: async (connectionId: string) => { /* ... */ },
  disconnectAll: async () => { /* ... */ },
}));
```

### Secure Storage

Passwords are stored separately from connection configs:

```typescript
// Config stored in regular storage (AsyncStorage)
await AsyncStorage.setItem(`connection_${id}`, JSON.stringify(config));

// Password stored in secure storage (encrypted on device)
await SecureStore.setItemAsync(`password_${id}`, password);
```

This prevents accidental password exposure via debug logs or backups.

## Development Workflow

### Making Changes

1. **UI Changes**: Edit files in `app/` directory (hot reload works)
2. **Protocol Changes**: Modify `lib/protocols/postgres/`
3. **State Changes**: Update `stores/connection.ts`
4. **Type Changes**: Update `lib/types.ts`

### Testing Changes

```bash
# Type check (catches errors before runtime)
bun typecheck

# Run on emulator (live reload)
bunx expo start --ios    # iOS
bunx expo start --android # Android
```

### Adding Dependencies

```bash
# Add a package
bun add some-package

# Add as dev dependency
bun add -d some-package

# Install all
bun install
```

## Database Support Matrix

### PostgreSQL ✅ Implemented

| Feature | Status |
|---------|--------|
| Connection | ✅ Full support |
| Authentication | ✅ Cleartext, MD5, SCRAM-SHA-256 ready |
| SELECT queries | ✅ Fully working |
| INSERT/UPDATE/DELETE | ✅ Fully working |
| Transactions | ⏳ Ready to implement |
| SSL/TLS | ✅ Supported |
| Type OID mapping | ✅ Common types supported |

### MySQL/MariaDB ⏳ Planned

The MySQL protocol implementation will follow the same pattern as PostgreSQL:

```
lib/protocols/mysql/
├── connection.ts      # MySQLConnection class
├── packets.ts         # MySQL packet builders/parsers
└── index.ts           # Public exports
```

## Configuration

### `app.json` - Expo Configuration

Key settings:
- **SDK**: 54.0.0 (latest)
- **Plugins**: expo-router, expo-secure-store
- **Theme**: Dark theme colors (#16213e, #1a1a2e)
- **TypedRoutes**: Enabled for type-safe routing

### `tsconfig.json` - TypeScript

- **Strict mode**: Enabled (no implicit any, etc.)
- **Path aliases**: `@/*` for clean imports
- **Target**: ES2020 with ES modules

### `package.json` - Dependencies

**Core:**
- `expo` - Universal React Native framework
- `expo-router` - File-based routing
- `react-native` - Cross-platform UI
- `react` - Component framework

**Database:**
- `react-native-tcp-socket` - Raw TCP connections

**Storage:**
- `expo-secure-store` - Encrypted credential storage

**State & Data:**
- `zustand` - Lightweight state management
- `@tanstack/react-query` - Data fetching (ready to use)

## Troubleshooting

### Connection Fails with "Connection timeout"

**Cause**: Server unreachable or firewall blocking
**Solution**:
1. Verify host and port
2. Check if server is running: `telnet host port`
3. Verify network connectivity (not on VPN?)
4. Try without SSL first

### "Buffer is not assignable to Uint8Array"

**This is fixed**, but if you see it:
- Ensure `@types/node` is in devDependencies
- Run `bun install`
- Run `bun typecheck` to verify

### App crashes on connect

**Check**:
1. Connection credentials are correct
2. Database name exists
3. User has permission to connect
4. Check device logs:
   ```bash
   # iOS
   xcrun simctl launch booted com.yourapp

   # Android
   adb logcat | grep com.yourapp
   ```

### Query returns no results but should

**Common issues**:
1. Query is case-sensitive in some dialects
2. User lacks SELECT permission on table
3. Table doesn't exist in the selected database
4. Check the error message in the app

## Security Considerations

⚠️ **Important**: This app connects to real database servers. Take security seriously:

1. **Never share connection credentials** via screenshots, backups, etc.
2. **Use SSL/TLS** for connections over untrusted networks
3. **Avoid production databases** on shared devices
4. **Clear connections** when handing device to someone else
5. **Enable device lock** (biometric/passcode) - credentials are safer when device is locked
6. **Use read-only database users** if connecting from shared networks

## Performance Tips

1. **Large result sets**: Pagination isn't implemented yet. Start with `LIMIT 100`
2. **Slow queries**: Complex joins may timeout. Verify queries in a database client first
3. **Mobile network**: Cellular connections may drop. Keep queries simple
4. **Battery**: Extended connections drain battery. Use efficiently

## Building for Production

```bash
# Create production build for iOS
bunx expo build:ios

# Create production build for Android
bunx expo build:android

# Or submit directly to app stores
bunx eas build --platform ios
bunx eas build --platform android
```

See [Expo documentation](https://docs.expo.dev/build/setup/) for details.

## Future Roadmap

### Phase 2: MySQL Support
- Implement MySQL wire protocol (similar to PostgreSQL)
- Support for MySQL 5.7+, 8.0+, MariaDB
- Same connection interface as PostgreSQL

### Phase 3: Enhanced Features
- Database explorer with tree view
- Query history with search
- Saved queries with tags
- Results export (CSV, JSON, SQL)
- Query builder UI (drag-drop table joins)

### Phase 4: Advanced
- Query performance analysis
- Transaction support with rollback UI
- Database diff/schema comparison
- Batch operations
- Scripting support

## Contributing

Found a bug or have a feature idea?

1. Check existing issues in the repo
2. Create detailed bug reports with:
   - Steps to reproduce
   - Expected vs. actual behavior
   - Device and OS version
   - Connection type (PostgreSQL/MySQL)

## License

MIT - Use freely in personal and commercial projects

## Resources

- [Expo Documentation](https://docs.expo.dev)
- [PostgreSQL Wire Protocol](https://www.postgresql.org/docs/current/protocol.html)
- [MySQL Protocol](https://dev.mysql.com/doc/internals/en/client-server-protocol.html)
- [React Native TCP Socket](https://github.com/rvagg/react-native-tcp-socket)
- [React Native Documentation](https://reactnative.dev)

## Support

For issues:
1. Check the troubleshooting section above
2. Review device logs
3. Try connecting with `psql` or `mysql` CLI to verify server is accessible
4. Open an issue with detailed information

---

**Made with ❤️ for database enthusiasts on mobile**
