/**
 * Compaction engine for LSM-tree optimization
 */

import { CompactionStats, StorageEntry } from '../../types';
import { SSTable } from '../storage/SSTable';
import { StorageEngineConfig } from '../types';
import { createLogger } from '../../utils/logger';

const logger = createLogger();

export interface CompactionResult {
  sstables: SSTable[];
  stats: CompactionStats;
}

export class CompactionEngine {
  private config: StorageEngineConfig;
  private compactionStats: CompactionStats[] = [];

  constructor(config: StorageEngineConfig) {
    this.config = config;
  }

  async compact(sstables: SSTable[]): Promise<CompactionResult> {
    const startTime = Date.now();
    logger.info('Starting compaction', { sstables: sstables.length });

    // Group SSTables by level
    const levels = this.groupByLevel(sstables);
    const newSSTables: SSTable[] = [];

    // Process each level
    for (const [level, tables] of levels) {
      if (tables.length <= 1) {
        newSSTables.push(...tables);
        continue;
      }

      // Compact tables at this level
      const compacted = await this.compactLevel(level, tables);
      newSSTables.push(...compacted.sstables);
      
      // Update stats
      this.compactionStats.push(compacted.stats);
    }

    const duration = Date.now() - startTime;
    const overallStats: CompactionStats = {
      level: -1, // Overall compaction
      inputFiles: sstables.length,
      outputFiles: newSSTables.length,
      inputSize: sstables.reduce((sum, s) => sum + s.getMetadata().size, 0),
      outputSize: newSSTables.reduce((sum, s) => sum + s.getMetadata().size, 0),
      duration,
      entriesCompacted: sstables.reduce((sum, s) => sum + s.getMetadata().entries, 0),
      entriesDropped: 0 // Will be calculated during merge
    };

    logger.info('Compaction completed', overallStats);

    return {
      sstables: newSSTables,
      stats: overallStats
    };
  }

  private groupByLevel(sstables: SSTable[]): Map<number, SSTable[]> {
    const levels = new Map<number, SSTable[]>();
    
    for (const sstable of sstables) {
      const level = sstable.getLevel();
      if (!levels.has(level)) {
        levels.set(level, []);
      }
      levels.get(level)!.push(sstable);
    }

    return levels;
  }

  private async compactLevel(level: number, sstables: SSTable[]): Promise<CompactionResult> {
    
    // Sort SSTables by creation time
    sstables.sort((a, b) => a.getMetadata().createdAt - b.getMetadata().createdAt);

    // For level 0, we need to handle overlapping key ranges
    if (level === 0) {
      return this.compactLevel0(sstables);
    }

    // For higher levels, merge non-overlapping SSTables
    return this.compactHigherLevel(level, sstables);
  }

  private async compactLevel0(sstables: SSTable[]): Promise<CompactionResult> {
    // Merge all overlapping SSTables from level 0
    const mergedEntries = await this.mergeSSTablesWithOverlap(sstables);
    
    // Create new SSTable at level 1
    const newSSTable = new SSTable(0, 1, mergedEntries, this.config);
    
    const stats: CompactionStats = {
      level: 0,
      inputFiles: sstables.length,
      outputFiles: 1,
      inputSize: sstables.reduce((sum, s) => sum + s.getMetadata().size, 0),
      outputSize: newSSTable.getMetadata().size,
      duration: 0, // Will be set by caller
      entriesCompacted: sstables.reduce((sum, s) => sum + s.getMetadata().entries, 0),
      entriesDropped: sstables.reduce((sum, s) => sum + s.getMetadata().entries, 0) - mergedEntries.length
    };

    return {
      sstables: [newSSTable],
      stats
    };
  }

  private async compactHigherLevel(level: number, sstables: SSTable[]): Promise<CompactionResult> {
    const compactedSSTables: SSTable[] = [];
    const toCompact: SSTable[] = [];

    // Group SSTables that need compaction
    for (const sstable of sstables) {
      if (toCompact.length < 4) { // Compact up to 4 SSTables at a time
        toCompact.push(sstable);
      } else {
        compactedSSTables.push(sstable);
      }
    }

    if (toCompact.length <= 1) {
      return {
        sstables,
        stats: {
          level,
          inputFiles: 0,
          outputFiles: 0,
          inputSize: 0,
          outputSize: 0,
          duration: 0,
          entriesCompacted: 0,
          entriesDropped: 0
        }
      };
    }

    // Merge the selected SSTables
    const mergedEntries = await this.mergeSSTables(toCompact);
    const newSSTable = new SSTable(0, level, mergedEntries, this.config);
    compactedSSTables.push(newSSTable);

    const stats: CompactionStats = {
      level,
      inputFiles: toCompact.length,
      outputFiles: 1,
      inputSize: toCompact.reduce((sum, s) => sum + s.getMetadata().size, 0),
      outputSize: newSSTable.getMetadata().size,
      duration: 0,
      entriesCompacted: toCompact.reduce((sum, s) => sum + s.getMetadata().entries, 0),
      entriesDropped: toCompact.reduce((sum, s) => sum + s.getMetadata().entries, 0) - mergedEntries.length
    };

    return {
      sstables: compactedSSTables,
      stats
    };
  }

  private async mergeSSTablesWithOverlap(sstables: SSTable[]): Promise<StorageEntry[]> {
    // Map to track latest version of each key
    const keyMap = new Map<string, StorageEntry>();
    
    // Process SSTables in chronological order
    for (const sstable of sstables) {
      const entries = sstable.getEntries();
      for (const entry of entries) {
        const keyStr = String(entry.key);
        
        // Keep the latest version
        const existing = keyMap.get(keyStr);
        if (!existing || entry.timestamp > existing.timestamp) {
          keyMap.set(keyStr, entry);
        }
      }
    }

    // Filter out tombstones and expired entries
    const now = Date.now();
    const validEntries: StorageEntry[] = [];
    
    for (const entry of keyMap.values()) {
      // Skip tombstones
      if (entry.value === null) {
        continue;
      }
      
      // Skip expired entries
      if (entry.ttl && entry.ttl < now) {
        continue;
      }
      
      validEntries.push(entry);
    }

    // Sort by key
    return validEntries.sort((a, b) => {
      const keyA = String(a.key);
      const keyB = String(b.key);
      return keyA.localeCompare(keyB);
    });
  }

  private async mergeSSTables(sstables: SSTable[]): Promise<StorageEntry[]> {
    // For non-overlapping SSTables, we can do a simple k-way merge
    const iterators = sstables.map(s => s.getEntries());
    const indices = new Array(sstables.length).fill(0);
    const merged: StorageEntry[] = [];
    const now = Date.now();

    while (true) {
      let minKey: string | null = null;
      let minIndex = -1;
      let minEntry: StorageEntry | null = null;

      // Find the minimum key among all iterators
      for (let i = 0; i < iterators.length; i++) {
        if (indices[i] >= (iterators[i]?.length || 0)) {
          continue;
        }

        const entry = iterators[i]?.[indices[i]];
        if (!entry) continue;
        
        const key = String(entry.key);

        if (minKey === null || key < minKey) {
          minKey = key;
          minIndex = i;
          minEntry = entry;
        }
      }

      if (minIndex === -1) {
        break; // All iterators exhausted
      }

      // Move the chosen iterator forward
      indices[minIndex]++;

      // Skip tombstones and expired entries
      if (minEntry?.value === null || (minEntry?.ttl && minEntry.ttl < now)) {
        continue;
      }

      if (minEntry) {
        merged.push(minEntry);
      }
    }

    return merged;
  }

  getStats(): CompactionStats[] {
    return [...this.compactionStats];
  }
}