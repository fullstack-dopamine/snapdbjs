/**
 * Simplified SnapDB client - working implementation
 */

import { EventEmitter } from 'events';
import {
  ISnapDB,
  SnapDBConfig,
  SnapDBEvent,
  CommandContext,
  MiddlewareFn,
  Plugin,
  StorageStats
} from '../types';
import { 
  ValidationError
} from '../utils/errors';
import { createLogger } from '../utils/logger';
import { SimpleStorage } from '../simple-storage/SimpleStorage';

export class SimpleSnapDB<K = string, V = any> extends EventEmitter implements ISnapDB<K, V> {
  private storage: SimpleStorage<K, V>;
  private config: Required<SnapDBConfig>;
  private middlewares: MiddlewareFn<K, V>[] = [];
  private plugins: Plugin<K, V>[] = [];
  private logger = createLogger({ level: 'info' });

  constructor(config: SnapDBConfig = {}) {
    super();
    
    this.config = {
      maxMemtableSizeMB: config.maxMemtableSizeMB ?? 64,
      compactionIntervalMs: config.compactionIntervalMs ?? 60000,
      enableBloomFilter: config.enableBloomFilter ?? true,
      maxWorkers: config.maxWorkers ?? 1,
      serialization: config.serialization ?? {
        serialize: (value: any) => JSON.stringify(value),
        deserialize: <T>(data: string | Buffer) => JSON.parse(typeof data === 'string' ? data : data.toString()) as T
      },
      logLevel: config.logLevel ?? 'info'
    };

    this.storage = new SimpleStorage<K, V>();
    this.storage.startPeriodicCleanup(30000); // Clean up every 30 seconds
    
    this.logger.info('SnapDB initialized', { config: this.config });
  }

  private async executeWithMiddleware<T>(
    context: CommandContext<K, V>,
    handler: () => Promise<T>
  ): Promise<T> {
    const middlewares = [...this.middlewares];
    let index = 0;

    const next = async (): Promise<T> => {
      if (index >= middlewares.length) {
        return handler();
      }

      const middleware = middlewares[index++];
      return middleware!(context, next);
    };

    return next();
  }

  async set(key: K, value: V, ttl?: number): Promise<void> {
    const context: CommandContext<K, V> = {
      command: 'SET',
      key,
      value,
      ttl,
      timestamp: Date.now()
    };

    await this.executeWithMiddleware(context, async () => {
      await this.storage.set(key, value, ttl);
      this.emit('set', { key, value, ttl });
    });
  }

  async get(key: K): Promise<V | null> {
    const context: CommandContext<K, V> = {
      command: 'GET',
      key,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      const value = await this.storage.get(key);
      this.emit('get', { key, value });
      return value;
    });
  }

  async del(key: K): Promise<boolean> {
    const context: CommandContext<K, V> = {
      command: 'DEL',
      key,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      const result = await this.storage.del(key);
      this.emit('del', { key, deleted: result });
      return result;
    });
  }

  async exists(key: K): Promise<boolean> {
    const context: CommandContext<K, V> = {
      command: 'EXISTS',
      key,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.storage.exists(key);
    });
  }

  async expire(key: K, ttl: number): Promise<boolean> {
    if (ttl <= 0) {
      throw new ValidationError('TTL must be positive');
    }

    const context: CommandContext<K, V> = {
      command: 'EXPIRE',
      key,
      ttl,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      const result = await this.storage.expire(key, ttl);
      if (result) {
        this.emit('expire', { key, ttl });
      }
      return result;
    });
  }

  async ttl(key: K): Promise<number> {
    const context: CommandContext<K, V> = {
      command: 'TTL',
      key,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.storage.ttl(key);
    });
  }

  async incr(key: K): Promise<number> {
    const context: CommandContext<K, V> = {
      command: 'INCR',
      key,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.storage.incr(key);
    });
  }

  async decr(key: K): Promise<number> {
    const context: CommandContext<K, V> = {
      command: 'DECR',
      key,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.storage.decr(key);
    });
  }

  async keys(pattern?: string): Promise<K[]> {
    const context: CommandContext<K, V> = {
      command: 'KEYS',
      pattern,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.storage.keys(pattern);
    });
  }

  async flushall(): Promise<void> {
    const context: CommandContext<K, V> = {
      command: 'FLUSHALL',
      timestamp: Date.now()
    };

    await this.executeWithMiddleware(context, async () => {
      await this.storage.flushall();
      this.emit('flush');
    });
  }

  async info(): Promise<StorageStats> {
    const context: CommandContext<K, V> = {
      command: 'INFO',
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.storage.info();
    });
  }

  async mget(keys: K[]): Promise<(V | null)[]> {
    const context: CommandContext<K, V> = {
      command: 'MGET',
      keys,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.storage.mget(keys);
    });
  }

  async mset(entries: Array<{ key: K; value: V; ttl?: number }>): Promise<void> {
    const context: CommandContext<K, V> = {
      command: 'MSET',
      keys: entries.map(e => e.key),
      values: entries.map(e => e.value),
      timestamp: Date.now()
    };

    await this.executeWithMiddleware(context, async () => {
      await this.storage.mset(entries);
    });
  }

  use(middleware: MiddlewareFn<K, V>): void {
    this.middlewares.push(middleware);
  }

  async register(plugin: Plugin<K, V>): Promise<void> {
    await plugin.init(this);
    this.plugins.push(plugin);
    this.logger.info('Plugin registered', { name: plugin.name, version: plugin.version });
  }

  override on(event: SnapDBEvent, listener: (...args: any[]) => void): this {
    return super.on(event, listener);
  }

  override off(event: SnapDBEvent, listener: (...args: any[]) => void): this {
    return super.off(event, listener);
  }

  async close(): Promise<void> {
    // Destroy plugins
    for (const plugin of this.plugins) {
      if (plugin.destroy) {
        await plugin.destroy();
      }
    }

    this.removeAllListeners();
    this.logger.info('SnapDB closed');
  }
}