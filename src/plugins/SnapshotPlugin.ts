/**
 * Snapshot plugin for SnapDBJS - provides point-in-time snapshots
 */

import { Plugin, ISnapDB, StorageStats } from '../types';
import { logger } from '../utils/logger';

export interface SnapshotData {
  timestamp: number;
  version: string;
  stats: StorageStats;
  data: Array<{ key: any; value: any; ttl?: number }>;
}

export class SnapshotPlugin<K = string, V = any> implements Plugin<K, V> {
  name = 'SnapshotPlugin';
  version = '1.0.0';
  
  private store?: ISnapDB<K, V>;
  private snapshots: Map<string, SnapshotData> = new Map();

  async init(store: ISnapDB<K, V>): Promise<void> {
    this.store = store;
    
    // Add snapshot command
    (store as any).snapshot = this.createSnapshot.bind(this);
    (store as any).restoreSnapshot = this.restoreSnapshot.bind(this);
    (store as any).listSnapshots = this.listSnapshots.bind(this);
    (store as any).deleteSnapshot = this.deleteSnapshot.bind(this);
    
    logger.info('SnapshotPlugin initialized');
  }

  async createSnapshot(name: string): Promise<SnapshotData> {
    if (!this.store) {
      throw new Error('Plugin not initialized');
    }

    const keys = await this.store.keys();
    const data: Array<{ key: K; value: V; ttl?: number }> = [];
    
    // Collect all key-value pairs
    for (const key of keys) {
      const value = await this.store.get(key);
      if (value !== null) {
        const ttl = await this.store.ttl(key);
        data.push({
          key,
          value,
          ttl: ttl > 0 ? ttl * 1000 : undefined // Convert seconds to ms
        });
      }
    }

    const stats = await this.store.info();
    const snapshot: SnapshotData = {
      timestamp: Date.now(),
      version: this.version,
      stats,
      data
    };

    this.snapshots.set(name, snapshot);
    logger.info('Snapshot created', { name, entries: data.length });
    
    return snapshot;
  }

  async restoreSnapshot(name: string): Promise<void> {
    if (!this.store) {
      throw new Error('Plugin not initialized');
    }

    const snapshot = this.snapshots.get(name);
    if (!snapshot) {
      throw new Error(`Snapshot '${name}' not found`);
    }

    // Clear current data
    await this.store.flushall();

    // Restore data
    for (const entry of snapshot.data) {
      await this.store.set(entry.key, entry.value, entry.ttl);
    }

    logger.info('Snapshot restored', { name, entries: snapshot.data.length });
  }

  listSnapshots(): Array<{ name: string; timestamp: number; entries: number }> {
    const list: Array<{ name: string; timestamp: number; entries: number }> = [];
    
    for (const [name, snapshot] of this.snapshots) {
      list.push({
        name,
        timestamp: snapshot.timestamp,
        entries: snapshot.data.length
      });
    }

    return list.sort((a, b) => b.timestamp - a.timestamp);
  }

  deleteSnapshot(name: string): boolean {
    const deleted = this.snapshots.delete(name);
    if (deleted) {
      logger.info('Snapshot deleted', { name });
    }
    return deleted;
  }

  exportSnapshot(name: string): string {
    const snapshot = this.snapshots.get(name);
    if (!snapshot) {
      throw new Error(`Snapshot '${name}' not found`);
    }

    return JSON.stringify(snapshot, null, 2);
  }

  importSnapshot(name: string, data: string): void {
    try {
      const snapshot = JSON.parse(data) as SnapshotData;
      this.snapshots.set(name, snapshot);
      logger.info('Snapshot imported', { name });
    } catch (error) {
      throw new Error(`Failed to import snapshot: ${error instanceof Error ? error.message : 'Invalid data'}`);
    }
  }

  async destroy(): Promise<void> {
    this.snapshots.clear();
    logger.info('SnapshotPlugin destroyed');
  }
}