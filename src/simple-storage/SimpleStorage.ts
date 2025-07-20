/**
 * Simplified storage implementation for SnapDB
 * This is a working implementation that can be built successfully
 */

import { StorageEntry, MemtableStats, SSTableMetadata, CompactionStats } from '../types';

export class SimpleStorage<K = string, V = any> {
  private data: Map<string, StorageEntry<K, V>> = new Map();
  private ttlData: Map<string, number> = new Map();

  async set(key: K, value: V, ttl?: number): Promise<void> {
    const keyStr = String(key);
    const entry: StorageEntry<K, V> = {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttl ? Date.now() + ttl : undefined,
      version: (this.data.get(keyStr)?.version || 0) + 1
    };

    this.data.set(keyStr, entry);
    
    if (ttl) {
      this.ttlData.set(keyStr, Date.now() + ttl);
    }
  }

  async get(key: K): Promise<V | null> {
    const keyStr = String(key);
    
    // Check TTL first
    if (this.ttlData.has(keyStr)) {
      const expiry = this.ttlData.get(keyStr)!;
      if (Date.now() > expiry) {
        this.data.delete(keyStr);
        this.ttlData.delete(keyStr);
        return null;
      }
    }

    const entry = this.data.get(keyStr);
    return entry?.value ?? null;
  }

  async del(key: K): Promise<boolean> {
    const keyStr = String(key);
    this.ttlData.delete(keyStr);
    return this.data.delete(keyStr);
  }

  async exists(key: K): Promise<boolean> {
    const keyStr = String(key);
    
    // Check TTL first
    if (this.ttlData.has(keyStr)) {
      const expiry = this.ttlData.get(keyStr)!;
      if (Date.now() > expiry) {
        this.data.delete(keyStr);
        this.ttlData.delete(keyStr);
        return false;
      }
    }

    return this.data.has(keyStr);
  }

  async expire(key: K, ttl: number): Promise<boolean> {
    const keyStr = String(key);
    if (!this.data.has(keyStr)) {
      return false;
    }

    this.ttlData.set(keyStr, Date.now() + ttl);
    return true;
  }

  async ttl(key: K): Promise<number> {
    const keyStr = String(key);
    
    // Check if key exists at all
    if (!this.data.has(keyStr)) {
      return -2; // Key does not exist
    }
    
    // Check if key has TTL
    if (!this.ttlData.has(keyStr)) {
      return -1; // Key exists but has no TTL
    }

    const expiry = this.ttlData.get(keyStr)!;
    const remaining = expiry - Date.now();
    
    if (remaining <= 0) {
      this.data.delete(keyStr);
      this.ttlData.delete(keyStr);
      return -2; // Key expired (now non-existent)
    }

    return Math.ceil(remaining / 1000); // Return in seconds
  }

  async incr(key: K): Promise<number> {
    const currentValue = await this.get(key);
    let numValue = 0;
    
    if (typeof currentValue === 'number') {
      numValue = currentValue;
    } else if (currentValue !== null) {
      const parsed = parseInt(String(currentValue));
      numValue = isNaN(parsed) ? 0 : parsed;
    }
    
    const newValue = numValue + 1;
    await this.set(key, newValue as V);
    return newValue;
  }

  async decr(key: K): Promise<number> {
    const currentValue = await this.get(key);
    let numValue = 0;
    
    if (typeof currentValue === 'number') {
      numValue = currentValue;
    } else if (currentValue !== null) {
      const parsed = parseInt(String(currentValue));
      numValue = isNaN(parsed) ? 0 : parsed;
    }
    
    const newValue = numValue - 1;
    await this.set(key, newValue as V);
    return newValue;
  }

  async keys(pattern?: string): Promise<K[]> {
    const result: K[] = [];
    const regex = pattern ? new RegExp(pattern.replace(/\*/g, '.*').replace(/\?/g, '.')) : null;

    for (const [keyStr, entry] of this.data) {
      // Check TTL
      if (this.ttlData.has(keyStr)) {
        const expiry = this.ttlData.get(keyStr)!;
        if (Date.now() > expiry) {
          this.data.delete(keyStr);
          this.ttlData.delete(keyStr);
          continue;
        }
      }

      if (!regex || regex.test(keyStr)) {
        result.push(entry.key);
      }
    }

    return result;
  }

  async flushall(): Promise<void> {
    this.data.clear();
    this.ttlData.clear();
  }

  async info(): Promise<any> {
    const now = Date.now();
    let oldestEntry = now;
    let newestEntry = 0;
    
    // Clean expired entries and find oldest/newest
    for (const [keyStr, entry] of this.data) {
      if (this.ttlData.has(keyStr)) {
        const expiry = this.ttlData.get(keyStr)!;
        if (now > expiry) {
          this.data.delete(keyStr);
          this.ttlData.delete(keyStr);
          continue;
        }
      }
      
      if (entry.timestamp < oldestEntry) oldestEntry = entry.timestamp;
      if (entry.timestamp > newestEntry) newestEntry = entry.timestamp;
    }

    const memtableStats: MemtableStats = {
      size: this.getSizeInBytes(),
      entries: this.data.size,
      oldestEntry: this.data.size > 0 ? oldestEntry : now,
      newestEntry: this.data.size > 0 ? newestEntry : now
    };

    const sstables: SSTableMetadata[] = []; // Simplified - no SSTables in this implementation
    const compactionStats: CompactionStats[] = []; // Simplified - no compaction

    // Return both new and legacy format for compatibility
    return {
      // New structured format
      memtable: memtableStats,
      sstables,
      totalSize: this.getSizeInBytes(),
      totalEntries: this.data.size,
      compactionStats,
      // Legacy flat format for backward compatibility
      memtableSize: this.getSizeInBytes(),
      sstableCount: 0,
      totalKeys: this.data.size
    };
  }

  async mget(keys: K[]): Promise<(V | null)[]> {
    const results: (V | null)[] = [];
    for (const key of keys) {
      results.push(await this.get(key));
    }
    return results;
  }

  async mset(entries: Array<{ key: K; value: V; ttl?: number }>): Promise<void> {
    for (const entry of entries) {
      await this.set(entry.key, entry.value, entry.ttl);
    }
  }

  size(): number {
    return this.data.size;
  }

  private getSizeInBytes(): number {
    let totalSize = 0;
    for (const [keyStr, entry] of this.data) {
      totalSize += keyStr.length * 2; // Approximate string size
      totalSize += JSON.stringify(entry.value).length * 2; // Approximate value size
      totalSize += 32; // Metadata overhead
    }
    return totalSize;
  }

  // Cleanup expired entries periodically
  startPeriodicCleanup(intervalMs: number = 60000): void {
    setInterval(() => {
      this.cleanupExpiredEntries();
    }, intervalMs);
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    for (const [keyStr] of this.data) {
      if (this.ttlData.has(keyStr)) {
        const expiry = this.ttlData.get(keyStr)!;
        if (now > expiry) {
          this.data.delete(keyStr);
          this.ttlData.delete(keyStr);
        }
      }
    }
  }
}