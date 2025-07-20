/**
 * Worker thread implementation for SnapDBJS
 */

import { parentPort } from 'worker_threads';
import { StorageEngine } from './storage/StorageEngine';
import { WorkerMessage, StorageEngineConfig } from './types';
import { WorkerRequest, WorkerResponse, CommandType } from '../types';
import { WorkerError, ValidationError } from '../utils/errors';
import { createLogger } from '../utils/logger';

class WorkerThread<K = string, V = any> {
  private storageEngine: StorageEngine<K, V>;

  constructor(config: StorageEngineConfig) {
    this.storageEngine = new StorageEngine<K, V>(config);
    this.setupMessageHandler();
    this.storageEngine.startPeriodicCompaction();
  }

  private setupMessageHandler(): void {
    if (!parentPort) {
      throw new WorkerError('Worker must be run in a worker thread');
    }

    parentPort.on('message', async (message: WorkerMessage<K, V>) => {
      if (message.type === 'request') {
        await this.handleRequest(message.data as WorkerRequest<K, V>);
      }
    });

    parentPort.postMessage({
      type: 'event',
      data: {
        type: 'workerReady',
        payload: { ready: true },
      },
    });
  }

  private async handleRequest(request: WorkerRequest<K, V>): Promise<void> {
    const { id, command, args } = request;
    
    try {
      const result = await this.executeCommand(command, args);
      this.sendResponse(id, result);
    } catch (error) {
      this.sendError(id, error as Error);
    }
  }

  private async executeCommand(command: CommandType, args: any): Promise<any> {
    switch (command) {
      case 'SET': {
        if (!args.key || args.value === undefined) {
          throw new ValidationError('SET requires key and value');
        }
        await this.storageEngine.set(args.key, args.value, args.ttl);
        return undefined;
      }

      case 'GET': {
        if (!args.key) {
          throw new ValidationError('GET requires key');
        }
        return await this.storageEngine.get(args.key);
      }

      case 'DEL': {
        if (!args.key) {
          throw new ValidationError('DEL requires key');
        }
        return await this.storageEngine.del(args.key);
      }

      case 'EXISTS': {
        if (!args.key) {
          throw new ValidationError('EXISTS requires key');
        }
        return await this.storageEngine.exists(args.key);
      }

      case 'EXPIRE': {
        if (!args.key || !args.ttl) {
          throw new ValidationError('EXPIRE requires key and ttl');
        }
        return await this.storageEngine.expire(args.key, args.ttl);
      }

      case 'TTL': {
        if (!args.key) {
          throw new ValidationError('TTL requires key');
        }
        return await this.storageEngine.ttl(args.key);
      }

      case 'INCR': {
        if (!args.key) {
          throw new ValidationError('INCR requires key');
        }
        const current = await this.storageEngine.get(args.key);
        const value = typeof current === 'number' ? current : 0;
        const newValue = value + (args.amount || 1);
        await this.storageEngine.set(args.key, newValue as V);
        return newValue;
      }

      case 'DECR': {
        if (!args.key) {
          throw new ValidationError('DECR requires key');
        }
        const current = await this.storageEngine.get(args.key);
        const value = typeof current === 'number' ? current : 0;
        const newValue = value - (args.amount || 1);
        await this.storageEngine.set(args.key, newValue as V);
        return newValue;
      }

      case 'KEYS': {
        return await this.storageEngine.keys(args.pattern);
      }

      case 'FLUSHALL': {
        await this.storageEngine.flushall();
        return undefined;
      }

      case 'INFO': {
        return await this.storageEngine.info();
      }

      default:
        throw new ValidationError(`Unknown command: ${command}`);
    }
  }

  private sendResponse(id: string, result: any): void {
    if (!parentPort) return;

    const response: WorkerResponse = {
      id,
      result,
    };

    parentPort.postMessage({
      type: 'response',
      data: response,
    });
  }

  private sendError(id: string, error: Error): void {
    if (!parentPort) return;

    const response: WorkerResponse = {
      id,
      error: {
        message: error.message,
        code: (error as any).code || 'UNKNOWN_ERROR',
      },
    };

    parentPort.postMessage({
      type: 'response',
      data: response,
    });
  }

  private sendEvent(_type: string, _payload: any): void {
    if (!parentPort) return;

    parentPort.postMessage({
      type: 'event',
      data: {
        type: _type,
        payload: _payload,
      },
    });
  }
}

if (parentPort) {
  parentPort.once('message', (config: StorageEngineConfig) => {
    new WorkerThread(config);
  });
}