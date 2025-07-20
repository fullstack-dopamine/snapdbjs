/**
 * In-memory write buffer implementing memtable for LSM-tree
 */

import { StorageEntry, MemtableStats } from '../../types';
import { calculateSize } from '../../utils/serializer';

export class Memtable<K = string, V = any> {
  private data: Map<string, StorageEntry<K, V>>;
  private sizeBytes: number = 0;
  private maxSizeBytes: number;

  constructor(maxSizeMB: number) {
    this.data = new Map();
    this.maxSizeBytes = maxSizeMB * 1024 * 1024;
  }

  set(key: K, value: V, ttl?: number): void {
    const serializedKey = String(key);
    const existingEntry = this.data.get(serializedKey);
    
    if (existingEntry) {
      this.sizeBytes -= this.calculateEntrySize(existingEntry);
    }

    const entry: StorageEntry<K, V> = {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl ? Date.now() + ttl : undefined,
      version: (existingEntry?.version || 0) + 1
    };

    this.data.set(serializedKey, entry);
    this.sizeBytes += this.calculateEntrySize(entry);
  }

  get(key: K): V | null {
    const serializedKey = String(key);
    const entry = this.data.get(serializedKey);
    
    if (!entry) {
      return null;
    }

    // Check TTL
    if (entry.ttl && entry.ttl < Date.now()) {
      this.data.delete(serializedKey);
      this.sizeBytes -= this.calculateEntrySize(entry);
      return null;
    }

    return entry.value;
  }

  getEntry(key: K): StorageEntry<K, V> | undefined {
    const serializedKey = String(key);
    const entry = this.data.get(serializedKey);
    
    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (entry.ttl && entry.ttl < Date.now()) {
      this.data.delete(serializedKey);
      this.sizeBytes -= this.calculateEntrySize(entry);
      return undefined;
    }

    return entry;
  }

  delete(key: K): boolean {
    const serializedKey = String(key);
    const entry = this.data.get(serializedKey);
    
    if (entry) {
      this.sizeBytes -= this.calculateEntrySize(entry);
      return this.data.delete(serializedKey);
    }
    
    return false;
  }

  keys(pattern?: string): K[] {
    const keys: K[] = [];
    const now = Date.now();
    const regex = pattern ? this.patternToRegex(pattern) : null;

    for (const [, entry] of this.data) {
      // Skip expired entries
      if (entry.ttl && entry.ttl < now) {
        continue;
      }

      // Skip tombstones
      if (entry.value === null) {
        continue;
      }

      const keyStr = String(entry.key);
      if (!regex || regex.test(keyStr)) {
        keys.push(entry.key);
      }
    }

    return keys;
  }

  clear(): void {
    this.data.clear();
    this.sizeBytes = 0;
  }

  shouldFlush(): boolean {
    return this.sizeBytes >= this.maxSizeBytes;
  }

  isEmpty(): boolean {
    return this.data.size === 0;
  }

  getAllEntries(): StorageEntry[] {
    const entries: StorageEntry[] = [];
    const now = Date.now();

    for (const entry of this.data.values()) {
      // Skip expired entries
      if (entry.ttl && entry.ttl < now) {
        continue;
      }
      entries.push(entry);
    }

    // Sort by key for efficient SSTable creation
    return entries.sort((a, b) => {
      const keyA = String(a.key);
      const keyB = String(b.key);
      return keyA.localeCompare(keyB);
    });
  }

  getStats(): MemtableStats {
    let oldestEntry = Number.MAX_SAFE_INTEGER;
    let newestEntry = 0;

    for (const entry of this.data.values()) {
      if (entry.timestamp < oldestEntry) {
        oldestEntry = entry.timestamp;
      }
      if (entry.timestamp > newestEntry) {
        newestEntry = entry.timestamp;
      }
    }

    return {
      size: this.sizeBytes,
      entries: this.data.size,
      oldestEntry: this.data.size > 0 ? oldestEntry : 0,
      newestEntry: this.data.size > 0 ? newestEntry : 0
    };
  }

  private calculateEntrySize(entry: StorageEntry<K, V>): number {
    return (
      calculateSize(entry.key) +
      calculateSize(entry.value) +
      8 + // timestamp
      (entry.ttl ? 8 : 0) + // ttl
      4 // version
    );
  }

  private patternToRegex(pattern: string): RegExp {
    // Convert Redis-style pattern to regex
    // * -> .*
    // ? -> .
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/\*/g, '.*') // * -> .*
      .replace(/\?/g, '.'); // ? -> .
    
    return new RegExp(`^${regexPattern}$`);
  }
}