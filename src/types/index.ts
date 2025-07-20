/**
 * Core types and interfaces for SnapDBJS
 */

export type CommandType = 
  | 'SET' 
  | 'GET' 
  | 'DEL' 
  | 'EXPIRE' 
  | 'TTL' 
  | 'INCR' 
  | 'DECR' 
  | 'KEYS' 
  | 'FLUSHALL' 
  | 'INFO'
  | 'EXISTS'
  | 'MGET'
  | 'MSET';

export interface CommandContext<K = string, V = any> {
  command: CommandType;
  key?: K;
  keys?: K[];
  value?: V;
  values?: V[];
  ttl?: number;
  pattern?: string;
  timestamp?: number;
}

export interface CommandArgs<K = string, V = any> {
  key?: K;
  keys?: K[];
  value?: V;
  values?: V[];
  ttl?: number;
  pattern?: string;
  delta?: number;
}

export interface WorkerRequest<K = string, V = any> {
  id: string;
  command: CommandType;
  args: CommandArgs<K, V>;
}

export interface WorkerResponse<V = any> {
  id: string;
  result?: V;
  error?: WorkerError;
}

export interface WorkerError {
  code: string;
  message: string;
  stack?: string;
}

export interface StorageEntry<K = string, V = any> {
  key: K;
  value: V | null;
  timestamp: number;
  ttl?: number;
  version?: number;
}

export interface SerializationOptions {
  serialize: <T>(value: T) => Buffer | string;
  deserialize: <T>(data: Buffer | string) => T;
}

export interface SnapDBConfig {
  maxMemtableSizeMB?: number;
  compactionIntervalMs?: number;
  enableBloomFilter?: boolean;
  maxWorkers?: number;
  serialization?: SerializationOptions;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface MemtableStats {
  size: number;
  entries: number;
  oldestEntry: number;
  newestEntry: number;
}

export interface SSTableMetadata {
  id: string;
  level: number;
  minKey: string;
  maxKey: string;
  size: number;
  entries: number;
  createdAt: number;
  bloomFilter?: BloomFilterData;
}

export interface BloomFilterData {
  bits: Uint8Array;
  numHashes: number;
  size: number;
}

export interface CompactionStats {
  level: number;
  inputFiles: number;
  outputFiles: number;
  inputSize: number;
  outputSize: number;
  inputBytes?: number;
  outputBytes?: number;
  duration: number;
  entriesCompacted: number;
  entriesDropped: number;
}

export interface StorageStats {
  memtable: MemtableStats;
  sstables: SSTableMetadata[];
  totalSize: number;
  totalEntries: number;
  compactionStats: CompactionStats[];
}

export type NextFunction = () => Promise<any>;
export type MiddlewareNext = NextFunction;

export type MiddlewareFn<K = string, V = any> = (
  ctx: CommandContext<K, V>,
  next: NextFunction
) => Promise<any>;

export interface Plugin<K = string, V = any> {
  name: string;
  version: string;
  init(store: ISnapDB<K, V>): void | Promise<void>;
  destroy?(): void | Promise<void>;
}

export interface ISnapDB<K = string, V = any> {
  set(key: K, value: V, ttl?: number): Promise<void>;
  get(key: K): Promise<V | null>;
  del(key: K): Promise<boolean>;
  exists(key: K): Promise<boolean>;
  expire(key: K, ttl: number): Promise<boolean>;
  ttl(key: K): Promise<number>;
  incr(key: K): Promise<number>;
  decr(key: K): Promise<number>;
  keys(pattern?: string): Promise<K[]>;
  flushall(): Promise<void>;
  info(): Promise<StorageStats>;
  mget(keys: K[]): Promise<(V | null)[]>;
  mset(entries: Array<{ key: K; value: V; ttl?: number }>): Promise<void>;
  
  use(middleware: MiddlewareFn<K, V>): void;
  register(plugin: Plugin<K, V>): Promise<void>;
  
  on(event: SnapDBEvent, listener: (...args: any[]) => void): void;
  off(event: SnapDBEvent, listener: (...args: any[]) => void): void;
  
  close(): Promise<void>;
}

export type SnapDBEvent = 
  | 'set'
  | 'get'
  | 'del'
  | 'expire'
  | 'flush'
  | 'compactionStart'
  | 'compactionEnd'
  | 'error'
  | 'workerReady'
  | 'workerError';

export interface EventPayload<K = string, V = any> {
  event: SnapDBEvent;
  timestamp: number;
  data?: {
    key?: K;
    value?: V;
    keys?: K[];
    error?: Error;
    stats?: CompactionStats | StorageStats;
  };
}

export interface LogEntry {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  data?: any;
}

export type CommandHandler<K = string, V = any> = (
  args: CommandArgs<K, V>
) => Promise<any>;

export interface CommandRegistry<K = string, V = any> {
  register(command: CommandType, handler: CommandHandler<K, V>): void;
  get(command: CommandType): CommandHandler<K, V> | undefined;
  has(command: CommandType): boolean;
}