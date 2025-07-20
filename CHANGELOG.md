# Changelog

All notable changes to SnapDBJS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2024-01-20

### Added
- Initial release of SnapDBJS
- LSM-tree based storage engine with Write-Ahead Log, Memtable, and SSTables
- Worker thread architecture for non-blocking operations
- Redis-like API with commands: SET, GET, DEL, EXISTS, EXPIRE, TTL, INCR, DECR, KEYS, FLUSHALL, INFO
- Batch operations: MGET, MSET
- TypeScript support with full type safety and generics
- Middleware pipeline system for extensibility
- Plugin architecture for custom functionality
- Event emitter for lifecycle hooks
- Automatic compaction with size-tiered strategy
- Bloom filters for optimized lookups
- TTL support with automatic expiration
- Pattern matching for keys
- Built-in middleware: LoggingMiddleware, TTLMiddleware, MetricsMiddleware
- Example plugins: SnapshotPlugin, PersistencePlugin, PubSubPlugin
- Comprehensive test suite
- Performance benchmarks
- Full documentation and examples

### Performance
- Write operations: ~10,000+ ops/sec
- Read operations: ~50,000+ ops/sec
- Sub-millisecond average latency
- Memory-efficient storage with automatic compaction

### Technical Details
- Zero external dependencies (only uuid for request IDs)
- Bundle size: < 50KB minified
- Node.js 16+ required
- Full ESM and CommonJS support