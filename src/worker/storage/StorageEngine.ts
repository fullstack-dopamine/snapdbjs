/**
 * Main storage engine for SnapDBJS using LSM-tree architecture
 */

import { WAL } from './WAL';
import { Memtable } from './Memtable';
import { SSTable } from './SSTable';
import { StorageEngineConfig } from '../types';
import { StorageStats, CompactionStats, StorageEntry } from '../../types';
import { StorageError } from '../../utils/errors';
import { createLogger } from '../../utils/logger';

export class StorageEngine<K = string, V = any> {
  private wal: WAL<K, V>;
  private memtable: Memtable;
  private sstables: Map<number, SSTable[]> = new Map();
  private config: StorageEngineConfig;
  private compactionInProgress = false;
  private compactionStats: CompactionStats[] = [];
  private logger = createLogger();

  constructor(config: StorageEngineConfig) {
    this.config = config;
    this.wal = new WAL();
    this.memtable = new Memtable(config.maxMemtableSizeMB);

    for (let level = 0; level < 7; level++) {
      this.sstables.set(level, []);
    }
  }

  async set(key: K, value: V, ttl?: number): Promise<void> {
    try {
      this.wal.append('SET', key, value, ttl);
      this.memtable.set(key, value, ttl);

      if (this.memtable.isFull()) {
        await this.flushMemtable();
      }
    } catch (error) {
      this.logger.error('Failed to set key', { key: String(key), error });
      throw new StorageError(`Failed to set key: ${error}`);
    }
  }

  async get(key: K): Promise<V | null> {
    try {
      const memValue = this.memtable.get(key);
      if (memValue !== null) {
        return memValue;
      }

      for (let level = 0; level < 7; level++) {
        const tables = this.sstables.get(level) || [];
        
        for (let i = tables.length - 1; i >= 0; i--) {
          const value = tables[i].get(key);
          if (value !== null) {
            return value;
          }
        }
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get key', { key: String(key), error });
      throw new StorageError(`Failed to get key: ${error}`);
    }
  }

  async del(key: K): Promise<boolean> {
    try {
      this.wal.append('DEL', key);
      return this.memtable.delete(key);
    } catch (error) {
      this.logger.error('Failed to delete key', { key: String(key), error });
      throw new StorageError(`Failed to delete key: ${error}`);
    }
  }

  async exists(key: K): Promise<boolean> {
    try {
      if (this.memtable.exists(key)) {
        return true;
      }

      for (let level = 0; level < 7; level++) {
        const tables = this.sstables.get(level) || [];
        
        for (let i = tables.length - 1; i >= 0; i--) {
          if (tables[i].exists(key)) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to check key existence', { key: String(key), error });
      throw new StorageError(`Failed to check key existence: ${error}`);
    }
  }

  async expire(key: K, ttl: number): Promise<boolean> {
    try {
      this.wal.append('EXPIRE', key, undefined, ttl);
      return this.memtable.expire(key, ttl);
    } catch (error) {
      this.logger.error('Failed to set expiry', { key: String(key), error });
      throw new StorageError(`Failed to set expiry: ${error}`);
    }
  }

  async ttl(key: K): Promise<number> {
    try {
      const memTtl = this.memtable.ttl(key);
      if (memTtl >= 0) {
        return memTtl;
      }

      return -1;
    } catch (error) {
      this.logger.error('Failed to get TTL', { key: String(key), error });
      throw new StorageError(`Failed to get TTL: ${error}`);
    }
  }

  async keys(pattern?: string): Promise<K[]> {
    try {
      const allKeys = new Set<K>();
      
      const memKeys = this.memtable.keys(pattern);
      memKeys.forEach(key => allKeys.add(key));

      for (let level = 0; level < 7; level++) {
        const tables = this.sstables.get(level) || [];
        
        for (const table of tables) {
          const regex = pattern ? new RegExp(pattern.replace(/\*/g, '.*')) : null;
          
          for (const entry of table.entries) {
            if (!entry.deleted && (!regex || regex.test(String(entry.key)))) {
              allKeys.add(entry.key);
            }
          }
        }
      }

      return Array.from(allKeys);
    } catch (error) {
      this.logger.error('Failed to get keys', { pattern, error });
      throw new StorageError(`Failed to get keys: ${error}`);
    }
  }

  async flushall(): Promise<void> {
    try {
      this.wal.clear();
      this.memtable.clear();
      
      for (let level = 0; level < 7; level++) {
        this.sstables.set(level, []);
      }
      
      this.compactionStats = [];
    } catch (error) {
      this.logger.error('Failed to flush all', { error });
      throw new StorageError(`Failed to flush all: ${error}`);
    }
  }

  async info(): Promise<StorageStats> {
    const memtableStats = {
      size: this.memtable.getSizeInBytes(),
      entries: this.memtable.size(),
      oldestEntry: Date.now(),
      newestEntry: Date.now()
    };

    const stats: StorageStats = {
      memtable: memtableStats,
      sstables: [],
      totalSize: this.memtable.getSizeInBytes(),
      totalEntries: 0,
      compactionStats: [...this.compactionStats]
    };

    const allKeys = new Set<string>();
    
    for (let level = 0; level < 7; level++) {
      const tables = this.sstables.get(level) || [];
      
      for (const table of tables) {
        stats.totalSize += table.metadata?.size || 0;
        stats.sstables.push({
          id: table.id || '',
          level: table.level || level,
          minKey: table.metadata?.minKey || '',
          maxKey: table.metadata?.maxKey || '',
          size: table.metadata?.size || 0,
          entries: table.metadata?.entryCount || 0,
          createdAt: table.metadata?.createdAt || Date.now()
        });
        
        table.entries?.forEach(entry => {
          if (!entry.value === null) { // Not deleted
            allKeys.add(String(entry.key));
          }
        });
      }
    }

    stats.totalEntries = allKeys.size;
    
    return stats;
  }

  private async flushMemtable(): Promise<void> {
    if (this.memtable.size() === 0) return;

    try {
      const entries = this.memtable.getEntries();
      const newSSTable = new SSTable(0, entries, this.config.enableBloomFilter);
      
      const level0Tables = this.sstables.get(0) || [];
      level0Tables.push(newSSTable);
      this.sstables.set(0, level0Tables);

      this.memtable.clear();
      this.wal.clear();

      this.logger.info('Memtable flushed to SSTable', {
        sstableId: newSSTable.id,
        entries: entries.length,
        size: newSSTable.metadata.size,
      });

      if (level0Tables.length >= 4 && !this.compactionInProgress) {
        setImmediate(() => this.triggerCompaction());
      }
    } catch (error) {
      this.logger.error('Failed to flush memtable', { error });
      throw new StorageError(`Failed to flush memtable: ${error}`);
    }
  }

  private async triggerCompaction(): Promise<void> {
    if (this.compactionInProgress) return;

    this.compactionInProgress = true;
    
    try {
      await this.compact();
    } finally {
      this.compactionInProgress = false;
    }
  }

  private async compact(): Promise<void> {
    for (let level = 0; level < 6; level++) {
      const tables = this.sstables.get(level) || [];
      const maxTablesAtLevel = level === 0 ? 4 : Math.pow(10, level);

      if (tables.length >= maxTablesAtLevel) {
        const startTime = Date.now();
        const tablesToCompact = tables.splice(0, Math.min(tables.length, maxTablesAtLevel));
        
        const inputBytes = tablesToCompact.reduce((sum, t) => sum + t.metadata.size, 0);
        
        const nextLevel = level + 1;
        const nextLevelTables = this.sstables.get(nextLevel) || [];
        
        const overlappingTables = nextLevelTables.filter(table =>
          tablesToCompact.some(t => t.overlaps(table))
        );

        const allTablesToMerge = [...tablesToCompact, ...overlappingTables];
        const mergedTable = SSTable.merge(allTablesToMerge, nextLevel, this.config.enableBloomFilter);

        const newNextLevelTables = nextLevelTables.filter(t => 
          !overlappingTables.includes(t)
        );
        newNextLevelTables.push(mergedTable);
        
        this.sstables.set(level, tables);
        this.sstables.set(nextLevel, newNextLevelTables);

        const compactionStat: CompactionStats = {
          level,
          inputFiles: allTablesToMerge.length,
          outputFiles: 1,
          inputBytes,
          outputBytes: mergedTable.metadata.size,
          duration: Date.now() - startTime,
        };

        this.compactionStats.push(compactionStat);
        
        this.logger.info('Compaction completed', compactionStat);
      }
    }
  }

  async startPeriodicCompaction(): Promise<void> {
    setInterval(() => {
      if (!this.compactionInProgress) {
        this.triggerCompaction().catch(error => {
          this.logger.error('Periodic compaction failed', { error });
        });
      }
    }, this.config.compactionIntervalMs);
  }
}