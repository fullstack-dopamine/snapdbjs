/**
 * Serialization utilities for SnapDBJS
 */

import { SerializationOptions } from '../types';
import { SerializationError } from './errors';

export const defaultSerializer: SerializationOptions = {
  serialize: <T>(value: T): string => {
    try {
      return JSON.stringify(value);
    } catch (error) {
      throw new SerializationError(
        `Failed to serialize value: ${error instanceof Error ? error.message : 'Unknown error'}`,
        value
      );
    }
  },
  
  deserialize: <T>(data: Buffer | string): T => {
    try {
      const str = Buffer.isBuffer(data) ? data.toString('utf-8') : data;
      return JSON.parse(str) as T;
    } catch (error) {
      throw new SerializationError(
        `Failed to deserialize data: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }
};

export function calculateSize(value: any, serializer: SerializationOptions = defaultSerializer): number {
  try {
    const serialized = serializer.serialize(value);
    if (typeof serialized === 'string') {
      return Buffer.byteLength(serialized, 'utf-8');
    }
    return serialized.length;
  } catch (error) {
    throw new SerializationError(
      `Failed to calculate size: ${error instanceof Error ? error.message : 'Unknown error'}`,
      value
    );
  }
}

export function serializeEntry<K, V>(
  key: K,
  value: V,
  serializer: SerializationOptions = defaultSerializer
): { key: string; value: string } {
  return {
    key: serializer.serialize(key) as string,
    value: serializer.serialize(value) as string
  };
}

export function deserializeEntry<K, V>(
  entry: { key: string; value: string },
  serializer: SerializationOptions = defaultSerializer
): { key: K; value: V } {
  return {
    key: serializer.deserialize<K>(entry.key),
    value: serializer.deserialize<V>(entry.value)
  };
}

export class CompactSerializer implements SerializationOptions {
  serialize<T>(value: T): string {
    if (value === null) return '\x00';
    if (value === undefined) return '\x01';
    if (typeof value === 'boolean') return value ? '\x02' : '\x03';
    if (typeof value === 'number') return '\x04' + value.toString();
    if (typeof value === 'string') return '\x05' + value;
    return '\x06' + JSON.stringify(value);
  }

  deserialize<T>(data: string | Buffer): T {
    const str = Buffer.isBuffer(data) ? data.toString('utf-8') : data;
    if (str.length === 0) throw new SerializationError('Empty data');
    
    const type = str.charCodeAt(0);
    const content = str.slice(1);
    
    switch (type) {
      case 0: return null as T;
      case 1: return undefined as T;
      case 2: return true as T;
      case 3: return false as T;
      case 4: return Number(content) as T;
      case 5: return content as T;
      case 6: return JSON.parse(content) as T;
      default: throw new SerializationError(`Unknown type marker: ${type}`);
    }
  }
}