/**
 * Main client API for SnapDBJS
 */

import { Worker } from 'worker_threads';
import { EventEmitter } from 'events';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ISnapDB,
  SnapDBConfig,
  SnapDBEvent,
  WorkerRequest,
  WorkerResponse,
  CommandContext,
  MiddlewareFn,
  Plugin,
  StorageStats
} from '../types';
import { 
  WorkerError, 
  TimeoutError, 
  ValidationError,
  deserializeError
} from '../utils/errors';
import { logger } from '../utils/logger';
import { defaultSerializer } from '../utils/serializer';
import { v4 as uuid } from '../utils/uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class SnapDB<K = string, V = any> extends EventEmitter implements ISnapDB<K, V> {
  private worker?: Worker;
  private config: Required<SnapDBConfig>;
  private pendingRequests: Map<string, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();
  private middlewares: MiddlewareFn<K, V>[] = [];
  private plugins: Plugin<K, V>[] = [];
  private isReady = false;
  private readyPromise: Promise<void>;

  constructor(config: SnapDBConfig = {}) {
    super();
    
    this.config = {
      maxMemtableSizeMB: config.maxMemtableSizeMB ?? 64,
      compactionIntervalMs: config.compactionIntervalMs ?? 60000,
      enableBloomFilter: config.enableBloomFilter ?? true,
      maxWorkers: config.maxWorkers ?? 1,
      serialization: config.serialization ?? defaultSerializer,
      logLevel: config.logLevel ?? 'info'
    };

    logger.setLevel(this.config.logLevel);
    
    this.readyPromise = this.initializeWorker();
  }

  private async initializeWorker(): Promise<void> {
    const workerPath = path.join(__dirname, '../worker/worker.js');
    
    this.worker = new Worker(workerPath);
    
    this.worker.on('message', (message: any) => {
      if (message.type === 'ready') {
        this.isReady = true;
        this.emit('workerReady', { workerId: message.workerId });
        logger.info('Worker ready', { workerId: message.workerId });
        return;
      }

      this.handleWorkerResponse(message);
    });

    this.worker.on('error', (error) => {
      logger.error('Worker error', error);
      this.emit('workerError', error);
      
      // Reject all pending requests
      for (const [, request] of this.pendingRequests) {
        clearTimeout(request.timeout);
        request.reject(new WorkerError('Worker crashed', { error }));
      }
      this.pendingRequests.clear();
    });

    this.worker.on('exit', (code) => {
      logger.warn('Worker exited', { code });
      if (code !== 0) {
        this.emit('error', new WorkerError(`Worker exited with code ${code}`));
      }
    });

    // Wait for worker to be ready
    return new Promise((resolve) => {
      const checkReady = () => {
        if (this.isReady) {
          resolve();
        } else {
          setTimeout(checkReady, 10);
        }
      };
      checkReady();
    });
  }

  private async ensureReady(): Promise<void> {
    if (!this.isReady) {
      await this.readyPromise;
    }
  }

  private handleWorkerResponse(response: WorkerResponse<V>): void {
    const request = this.pendingRequests.get(response.id);
    if (!request) {
      logger.warn('Received response for unknown request', { id: response.id });
      return;
    }

    clearTimeout(request.timeout);
    this.pendingRequests.delete(response.id);

    if (response.error) {
      request.reject(deserializeError(response.error));
    } else {
      request.resolve(response.result);
    }
  }

  private async sendCommand<T>(
    command: string,
    args: any,
    timeoutMs: number = 5000
  ): Promise<T> {
    await this.ensureReady();

    const id = uuid();
    const request: WorkerRequest<K, V> = {
      id,
      command: command as any,
      args
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new TimeoutError(command, timeoutMs));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve, reject, timeout });
      this.worker!.postMessage(request);
    });
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
      await this.sendCommand('SET', { key, value, ttl });
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
      const value = await this.sendCommand<V | null>('GET', { key });
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
      const result = await this.sendCommand<boolean>('DEL', { key });
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
      return this.sendCommand<boolean>('EXISTS', { key });
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
      const result = await this.sendCommand<boolean>('EXPIRE', { key, ttl });
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
      return this.sendCommand<number>('TTL', { key });
    });
  }

  async incr(key: K): Promise<number> {
    const context: CommandContext<K, V> = {
      command: 'INCR',
      key,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.sendCommand<number>('INCR', { key });
    });
  }

  async decr(key: K): Promise<number> {
    const context: CommandContext<K, V> = {
      command: 'DECR',
      key,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.sendCommand<number>('DECR', { key });
    });
  }

  async keys(pattern?: string): Promise<K[]> {
    const context: CommandContext<K, V> = {
      command: 'KEYS',
      pattern,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.sendCommand<K[]>('KEYS', { pattern });
    });
  }

  async flushall(): Promise<void> {
    const context: CommandContext<K, V> = {
      command: 'FLUSHALL',
      timestamp: Date.now()
    };

    await this.executeWithMiddleware(context, async () => {
      await this.sendCommand('FLUSHALL', {});
      this.emit('flush');
    });
  }

  async info(): Promise<StorageStats> {
    const context: CommandContext<K, V> = {
      command: 'INFO',
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.sendCommand<StorageStats>('INFO', {});
    });
  }

  async mget(keys: K[]): Promise<(V | null)[]> {
    const context: CommandContext<K, V> = {
      command: 'MGET',
      keys,
      timestamp: Date.now()
    };

    return this.executeWithMiddleware(context, async () => {
      return this.sendCommand<(V | null)[]>('MGET', { keys });
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
      await this.sendCommand('MSET', {
        keys: entries.map(e => e.key),
        values: entries.map(e => e.value),
        ttl: entries[0]?.ttl // For simplicity, use first entry's TTL
      });
    });
  }

  use(middleware: MiddlewareFn<K, V>): void {
    this.middlewares.push(middleware);
  }

  async register(plugin: Plugin<K, V>): Promise<void> {
    await plugin.init(this);
    this.plugins.push(plugin);
    logger.info('Plugin registered', { name: plugin.name, version: plugin.version });
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

    // Clear pending requests
    for (const [, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new WorkerError('SnapDB is closing'));
    }
    this.pendingRequests.clear();

    // Terminate worker
    if (this.worker) {
      await this.worker.terminate();
      this.worker = undefined;
    }

    this.isReady = false;
    this.removeAllListeners();
    logger.info('SnapDB closed');
  }
}