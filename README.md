# SnapDBJS

A high-performance, Redis-style, in-memory, TypeScript-first key-value store with LSM-tree architecture.

## Features

- **High Performance**: Built with LSM-tree architecture for optimal write throughput
- **Redis-Compatible API**: Familiar commands like SET, GET, DEL, EXPIRE, TTL, INCR, DECR
- **Worker Thread Architecture**: Non-blocking operations with dedicated storage worker
- **TypeScript First**: Full type safety with generic key-value support
- **Extensible**: Middleware pipeline and plugin system
- **Built-in Metrics**: Performance monitoring and Prometheus export
- **Optional Persistence**: Save/load data to disk with the persistence plugin
- **Snapshots**: Point-in-time backups with the snapshot plugin
- **Pub/Sub**: Redis-style publish/subscribe with the pubsub plugin
- **Bloom Filters**: Probabilistic data structure for efficient key existence checks
- **Compaction**: Automatic background compaction for optimal storage

## Installation

```bash
npm install snapdbjs
```

## Quick Start

```typescript
import { SnapDB } from 'snapdbjs';

// Create a new instance
const db = new SnapDB();

// Basic operations
await db.set('user:1', { name: 'John Doe', age: 30 });
const user = await db.get('user:1');
console.log(user); // { name: 'John Doe', age: 30 }

// Set with TTL (expires in 5 seconds)
await db.set('session:123', 'token', 5000);

// Counter operations
await db.incr('views'); // 1
await db.incr('views'); // 2

// Pattern matching
const userKeys = await db.keys('user:*');

// Clean up
await db.close();
```

## API Reference

### Core Commands

#### `set(key: K, value: V, ttl?: number): Promise<void>`
Set a key-value pair with optional TTL in milliseconds.

#### `get(key: K): Promise<V | null>`
Get the value for a key. Returns null if not found or expired.

#### `del(key: K): Promise<boolean>`
Delete a key. Returns true if deleted, false if not found.

#### `exists(key: K): Promise<boolean>`
Check if a key exists.

#### `expire(key: K, ttl: number): Promise<boolean>`
Set TTL for an existing key. TTL is in milliseconds.

#### `ttl(key: K): Promise<number>`
Get remaining TTL in seconds. Returns -1 if no TTL, -2 if key doesn't exist.

#### `incr(key: K): Promise<number>`
Increment a numeric value. Initializes to 1 if not exists.

#### `decr(key: K): Promise<number>`
Decrement a numeric value. Initializes to -1 if not exists.

#### `keys(pattern?: string): Promise<K[]>`
Get all keys matching the pattern. Supports `*` and `?` wildcards.

#### `flushall(): Promise<void>`
Remove all keys.

#### `info(): Promise<StorageStats>`
Get storage statistics including memtable and SSTable info.

### Batch Operations

#### `mget(keys: K[]): Promise<(V | null)[]>`
Get multiple values at once.

#### `mset(entries: Array<{ key: K; value: V; ttl?: number }>): Promise<void>`
Set multiple key-value pairs at once.

## Middleware

Middleware allows you to intercept and modify commands:

```typescript
import { LoggingMiddleware } from 'snapdbjs';

// Add logging middleware
db.use(LoggingMiddleware({ 
  logLevel: 'info',
  includeTimings: true 
}));

// Custom middleware
db.use(async (ctx, next) => {
  console.log(`Command: ${ctx.command}`);
  const result = await next();
  console.log(`Result:`, result);
  return result;
});
```

### Built-in Middleware

- **LoggingMiddleware**: Log all commands with timing information
- **TTLMiddleware**: Automatic TTL cleanup
- **MetricsMiddleware**: Collect performance metrics

## Plugins

Plugins extend SnapDB with additional functionality:

```typescript
import { SnapshotPlugin, PersistencePlugin, PubSubPlugin } from 'snapdbjs';

// Snapshot plugin
const snapshotPlugin = new SnapshotPlugin();
await db.register(snapshotPlugin);
await db.snapshot('backup1');

// Persistence plugin
const persistencePlugin = new PersistencePlugin({
  dataDir: './data',
  saveInterval: 60000 // Auto-save every minute
});
await db.register(persistencePlugin);

// Pub/Sub plugin
const pubsubPlugin = new PubSubPlugin();
await db.register(pubsubPlugin);
```

## Configuration

```typescript
const db = new SnapDB({
  maxMemtableSizeMB: 64,        // Max size before flush to SSTable
  compactionIntervalMs: 60000,   // Compaction check interval
  enableBloomFilter: true,       // Enable bloom filters for SSTables
  maxWorkers: 1,                 // Number of worker threads
  logLevel: 'info'              // Log level: debug, info, warn, error
});
```

## Events

SnapDB emits events for various operations:

```typescript
db.on('set', (event) => {
  console.log('Key set:', event.data.key);
});

db.on('del', (event) => {
  console.log('Key deleted:', event.data.key);
});

db.on('compactionStart', (event) => {
  console.log('Compaction started');
});

db.on('error', (event) => {
  console.error('Error:', event.data.error);
});
```

Available events:
- `set`, `get`, `del`, `expire`, `flush`
- `compactionStart`, `compactionEnd`
- `workerReady`, `workerError`, `error`

## Architecture

SnapDBJS uses an LSM-tree (Log-Structured Merge-tree) architecture:

1. **Write-Ahead Log (WAL)**: Ensures durability
2. **Memtable**: In-memory sorted map for recent writes
3. **SSTables**: Immutable sorted files on disk
4. **Compaction**: Background process to merge SSTables
5. **Bloom Filters**: Probabilistic data structure for fast lookups

All storage operations run in a dedicated worker thread, keeping the main thread responsive.

## Performance

SnapDBJS is designed for high performance:

- Write throughput: 10,000+ ops/sec
- Read latency: < 1ms average
- Memory efficient with automatic compaction
- Non-blocking operations with worker threads

## TypeScript Support

SnapDBJS is written in TypeScript with full type safety:

```typescript
// Type-safe keys and values
const db = new SnapDB<string, User>();

interface User {
  id: number;
  name: string;
  email: string;
}

await db.set('user:1', { 
  id: 1, 
  name: 'John', 
  email: 'john@example.com' 
});

const user = await db.get('user:1'); // Type: User | null
```

## License

MIT

## Author

Abhilash (https://github.com/abhilashmadi)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [GitHub Repository](https://github.com/fullstack-dopamine/snapdbjs)
- [Issue Tracker](https://github.com/fullstack-dopamine/snapdbjs/issues)
- [NPM Package](https://www.npmjs.com/package/snapdbjs)
