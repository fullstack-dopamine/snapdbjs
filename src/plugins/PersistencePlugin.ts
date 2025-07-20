/**
 * Persistence plugin for SnapDBJS - provides disk persistence
 */

import { Plugin, ISnapDB } from '../types';
import { logger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';

export interface PersistenceOptions {
  dataDir?: string;
  saveInterval?: number; // Auto-save interval in ms
  compression?: boolean;
  maxBackups?: number;
}

export class PersistencePlugin<K = string, V = any> implements Plugin<K, V> {
  name = 'PersistencePlugin';
  version = '1.0.0';
  
  private store?: ISnapDB<K, V>;
  private options: Required<PersistenceOptions>;
  private saveTimer?: NodeJS.Timeout;
  private isDirty: boolean = false;

  constructor(options: PersistenceOptions = {}) {
    this.options = {
      dataDir: options.dataDir || './snapdb-data',
      saveInterval: options.saveInterval || 60000, // 1 minute
      compression: options.compression || false,
      maxBackups: options.maxBackups || 3
    };
  }

  async init(store: ISnapDB<K, V>): Promise<void> {
    this.store = store;
    
    // Ensure data directory exists
    await this.ensureDataDir();
    
    // Add persistence commands
    (store as any).save = this.save.bind(this);
    (store as any).load = this.load.bind(this);
    (store as any).enableAutoSave = this.enableAutoSave.bind(this);
    (store as any).disableAutoSave = this.disableAutoSave.bind(this);
    
    // Listen for write events to mark as dirty
    store.on('set', () => { this.isDirty = true; });
    store.on('del', () => { this.isDirty = true; });
    store.on('flush', () => { this.isDirty = true; });
    
    // Try to load existing data
    try {
      await this.load();
    } catch (error) {
      logger.warn('No existing data to load', error);
    }
    
    // Start auto-save if configured
    if (this.options.saveInterval > 0) {
      this.enableAutoSave();
    }
    
    logger.info('PersistencePlugin initialized', this.options);
  }

  private async ensureDataDir(): Promise<void> {
    try {
      await fs.access(this.options.dataDir);
    } catch {
      await fs.mkdir(this.options.dataDir, { recursive: true });
    }
  }

  private getDataPath(): string {
    return path.join(this.options.dataDir, 'snapdb.json');
  }

  private getBackupPath(index: number): string {
    return path.join(this.options.dataDir, `snapdb.backup.${index}.json`);
  }

  async save(): Promise<void> {
    if (!this.store) {
      throw new Error('Plugin not initialized');
    }

    const keys = await this.store.keys();
    const data: Array<{ key: K; value: V; ttl?: number }> = [];
    
    // Collect all data
    for (const key of keys) {
      const value = await this.store.get(key);
      if (value !== null) {
        const ttl = await this.store.ttl(key);
        data.push({
          key,
          value,
          ttl: ttl > 0 ? ttl * 1000 : undefined
        });
      }
    }

    const saveData = {
      version: this.version,
      timestamp: Date.now(),
      entries: data
    };

    // Rotate backups
    await this.rotateBackups();

    // Save data
    const dataPath = this.getDataPath();
    const content = JSON.stringify(saveData, null, this.options.compression ? 0 : 2);
    await fs.writeFile(dataPath, content, 'utf-8');
    
    // Data saved successfully
    this.isDirty = false;
    
    logger.info('Data saved', { entries: data.length, size: content.length });
  }

  async load(): Promise<void> {
    if (!this.store) {
      throw new Error('Plugin not initialized');
    }

    const dataPath = this.getDataPath();
    const content = await fs.readFile(dataPath, 'utf-8');
    const saveData = JSON.parse(content);

    // Clear existing data
    await this.store.flushall();

    // Restore data
    const now = Date.now();
    let loaded = 0;
    let expired = 0;

    for (const entry of saveData.entries) {
      // Check if TTL has expired
      if (entry.ttl) {
        const expiresAt = saveData.timestamp + entry.ttl;
        if (expiresAt < now) {
          expired++;
          continue;
        }
        // Adjust TTL for remaining time
        entry.ttl = Math.ceil((expiresAt - now) / 1000);
      }

      await this.store.set(entry.key, entry.value, entry.ttl);
      loaded++;
    }

    logger.info('Data loaded', { loaded, expired, total: saveData.entries.length });
  }

  private async rotateBackups(): Promise<void> {
    if (this.options.maxBackups <= 0) return;

    try {
      // Move existing backups
      for (let i = this.options.maxBackups - 1; i >= 0; i--) {
        const sourcePath = i === 0 ? this.getDataPath() : this.getBackupPath(i - 1);
        const targetPath = this.getBackupPath(i);
        
        try {
          await fs.access(sourcePath);
          await fs.rename(sourcePath, targetPath);
        } catch {
          // File doesn't exist, skip
        }
      }
    } catch (error) {
      logger.warn('Failed to rotate backups', error);
    }
  }

  enableAutoSave(): void {
    if (this.saveTimer) return;

    this.saveTimer = setInterval(async () => {
      if (this.isDirty) {
        try {
          await this.save();
        } catch (error) {
          logger.error('Auto-save failed', error);
        }
      }
    }, this.options.saveInterval);

    logger.info('Auto-save enabled', { interval: this.options.saveInterval });
  }

  disableAutoSave(): void {
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = undefined;
      logger.info('Auto-save disabled');
    }
  }

  async destroy(): Promise<void> {
    this.disableAutoSave();
    
    // Save final state if dirty
    if (this.isDirty && this.store) {
      try {
        await this.save();
      } catch (error) {
        logger.error('Failed to save on destroy', error);
      }
    }
    
    logger.info('PersistencePlugin destroyed');
  }
}