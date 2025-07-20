/**
 * Worker-specific types for SnapDBJS
 */

import { WorkerRequest, WorkerResponse, StorageEntry } from '../types';

export interface WorkerMessage<K = string, V = any> {
  type: 'request' | 'response' | 'event';
  data: WorkerRequest<K, V> | WorkerResponse<V> | WorkerEvent;
}

export interface WorkerEvent {
  type: string;
  payload: any;
}

export interface WALEntry<K = string, V = any> {
  id: string;
  timestamp: number;
  operation: 'SET' | 'DEL' | 'EXPIRE';
  key: K;
  value?: V;
  ttl?: number;
}

export interface MemtableEntry<K = string, V = any> extends StorageEntry<K, V> {
  expiresAt?: number;
}

export interface SSTable<K = string, V = any> {
  id: string;
  level: number;
  entries: StorageEntry<K, V>[];
  bloomFilter?: BloomFilter;
  metadata: {
    minKey: K;
    maxKey: K;
    size: number;
    entryCount: number;
    createdAt: number;
  };
}

export interface BloomFilter {
  bits: Uint8Array;
  numHashes: number;
  add(key: string): void;
  contains(key: string): boolean;
}

export interface StorageEngineConfig {
  maxMemtableSizeMB: number;
  compactionIntervalMs: number;
  enableBloomFilter: boolean;
}