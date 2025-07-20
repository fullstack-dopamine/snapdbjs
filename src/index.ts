/**
 * SnapDBJS - A Redis-style, in-memory, TypeScript-first key-value store
 * 
 * @packageDocumentation
 */

export { SimpleSnapDB as SnapDB } from './client/SimpleSnapDB';
export { SnapDBEventEmitter } from './events/EventEmitter';

// Export types
export type {
  // Core interfaces
  ISnapDB,
  SnapDBConfig,
  SnapDBEvent,
  EventPayload,
  
  // Command types
  CommandType,
  CommandContext,
  CommandArgs,
  CommandHandler,
  CommandRegistry,
  
  // Storage types
  StorageEntry,
  StorageStats,
  MemtableStats,
  SSTableMetadata,
  CompactionStats,
  BloomFilterData,
  
  // Middleware and Plugin types
  MiddlewareFn,
  MiddlewareNext,
  Plugin,
  
  // Serialization
  SerializationOptions,
  
  // Worker types
  WorkerRequest,
  WorkerResponse,
  WorkerError as WorkerErrorType,
  
  // Logging
  LogEntry
} from './types';

// Export errors
export {
  SnapDBError,
  ValidationError,
  WorkerError,
  StorageError,
  CompactionError,
  PluginError,
  KeyNotFoundError,
  MemoryLimitError,
  TimeoutError,
  SerializationError,
  ErrorCodes,
  type ErrorCode,
  isSnapDBError
} from './utils/errors';

// Export utilities
export { 
  Logger,
  createLogger,
  type LogLevel,
  type LoggerOptions
} from './utils/logger';

export {
  defaultSerializer,
  CompactSerializer,
  calculateSize,
  serializeEntry,
  deserializeEntry
} from './utils/serializer';

// Export middleware
export { LoggingMiddleware } from './middleware/LoggingMiddleware';
export { TTLMiddleware } from './middleware/TTLMiddleware';
export { MetricsMiddleware } from './middleware/MetricsMiddleware';

// Export plugins  
export { SnapshotPlugin } from './plugins/SnapshotPlugin';

// Default export
import { SimpleSnapDB } from './client/SimpleSnapDB';
export default SimpleSnapDB;