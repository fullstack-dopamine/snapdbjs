/**
 * Sorted String Table implementation for LSM-tree
 */

import { StorageEntry, SSTableMetadata, BloomFilterData } from '../../types';
import { BloomFilter } from './BloomFilter';
import { StorageEngineConfig } from './StorageEngine';
import { calculateSize } from '../../utils/serializer';

export class SSTable {
  private id: string;
  private level: number;
  private entries: StorageEntry[];
  private bloomFilter?: BloomFilter;
  private metadata: SSTableMetadata;
  private config: StorageEngineConfig;

  constructor(
    index: number,
    level: number,
    entries: StorageEntry[],
    config: StorageEngineConfig
  ) {
    this.id = `sstable_${Date.now()}_${index}`;
    this.level = level;
    this.entries = entries;
    this.config = config;

    // Create bloom filter if enabled
    if (config.enableBloomFilter && entries.length > 0) {
      this.bloomFilter = new BloomFilter(entries.length * 10); // 10 bits per key
      for (const entry of entries) {
        this.bloomFilter.add(config.serializer.serialize(entry.key) as string);
      }
    }

    // Calculate metadata
    this.metadata = this.calculateMetadata();
  }

  async get(key: any): Promise<any> {
    const serializedKey = this.config.serializer.serialize(key) as string;

    // Check bloom filter first
    if (this.bloomFilter && !this.bloomFilter.contains(serializedKey)) {
      return undefined;
    }

    // Binary search
    const entry = this.binarySearch(key);
    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (entry.ttl && entry.ttl < Date.now()) {
      return undefined;
    }

    // Return null for tombstones
    return entry.value;
  }

  async getEntry(key: any): Promise<StorageEntry | undefined> {
    const entry = this.binarySearch(key);
    if (!entry) {
      return undefined;
    }

    // Check TTL
    if (entry.ttl && entry.ttl < Date.now()) {
      return undefined;
    }

    return entry;
  }

  async keys(pattern?: string): Promise<any[]> {
    const keys: any[] = [];
    const now = Date.now();
    const regex = pattern ? this.patternToRegex(pattern) : null;

    for (const entry of this.entries) {
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

  getMetadata(): SSTableMetadata {
    return { ...this.metadata };
  }

  getEntries(): StorageEntry[] {
    return [...this.entries];
  }

  getLevel(): number {
    return this.level;
  }

  setLevel(level: number): void {
    this.level = level;
    this.metadata.level = level;
  }

  overlaps(other: SSTable): boolean {
    const otherMeta = other.getMetadata();
    return !(
      this.metadata.maxKey < otherMeta.minKey ||
      this.metadata.minKey > otherMeta.maxKey
    );
  }

  private binarySearch(key: any): StorageEntry | undefined {
    let left = 0;
    let right = this.entries.length - 1;
    const targetKey = String(key);

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midKey = String(this.entries[mid].key);

      if (midKey === targetKey) {
        return this.entries[mid];
      }

      if (midKey < targetKey) {
        left = mid + 1;
      } else {
        right = mid - 1;
      }
    }

    return undefined;
  }

  private calculateMetadata(): SSTableMetadata {
    let totalSize = 0;
    let minKey = '';
    let maxKey = '';

    if (this.entries.length > 0) {
      minKey = String(this.entries[0].key);
      maxKey = String(this.entries[this.entries.length - 1].key);

      for (const entry of this.entries) {
        totalSize += calculateSize(entry, this.config.serializer);
      }
    }

    const bloomFilterData: BloomFilterData | undefined = this.bloomFilter
      ? {
          bits: this.bloomFilter.getBits(),
          numHashes: this.bloomFilter.getNumHashes(),
          size: this.bloomFilter.getSize()
        }
      : undefined;

    return {
      id: this.id,
      level: this.level,
      minKey,
      maxKey,
      size: totalSize,
      entries: this.entries.length,
      createdAt: Date.now(),
      bloomFilter: bloomFilterData
    };
  }

  private patternToRegex(pattern: string): RegExp {
    const regexPattern = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${regexPattern}$`);
  }
}