/**
 * Basic unit tests for SnapDBJS
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapDB } from '../src';

describe('SnapDB Basic Operations', () => {
  let db: SnapDB<string, any>;

  beforeEach(async () => {
    db = new SnapDB({
      maxMemtableSizeMB: 1,
      compactionIntervalMs: 60000,
    });
    // Wait for worker to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    await db.close();
  });

  describe('SET and GET', () => {
    it('should set and get a string value', async () => {
      await db.set('key1', 'value1');
      const value = await db.get('key1');
      expect(value).toBe('value1');
    });

    it('should set and get an object value', async () => {
      const obj = { name: 'John', age: 30 };
      await db.set('user:1', obj);
      const value = await db.get('user:1');
      expect(value).toEqual(obj);
    });

    it('should return null for non-existent key', async () => {
      const value = await db.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should overwrite existing key', async () => {
      await db.set('key1', 'value1');
      await db.set('key1', 'value2');
      const value = await db.get('key1');
      expect(value).toBe('value2');
    });
  });

  describe('DEL', () => {
    it('should delete an existing key', async () => {
      await db.set('key1', 'value1');
      const deleted = await db.del('key1');
      expect(deleted).toBe(true);
      
      const value = await db.get('key1');
      expect(value).toBeNull();
    });

    it('should return false when deleting non-existent key', async () => {
      const deleted = await db.del('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('EXISTS', () => {
    it('should return true for existing key', async () => {
      await db.set('key1', 'value1');
      const exists = await db.exists('key1');
      expect(exists).toBe(true);
    });

    it('should return false for non-existent key', async () => {
      const exists = await db.exists('nonexistent');
      expect(exists).toBe(false);
    });
  });

  describe('TTL and EXPIRE', () => {
    it('should set TTL on key creation', async () => {
      await db.set('session', 'data', 5000); // 5 seconds
      const ttl = await db.ttl('session');
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(5);
    });

    it('should expire key after TTL', async () => {
      await db.set('session', 'data', 100); // 100ms
      await new Promise(resolve => setTimeout(resolve, 150));
      const exists = await db.exists('session');
      expect(exists).toBe(false);
    });

    it('should set expiration on existing key', async () => {
      await db.set('key1', 'value1');
      const result = await db.expire('key1', 5000);
      expect(result).toBe(true);
      
      const ttl = await db.ttl('key1');
      expect(ttl).toBeGreaterThan(0);
    });

    it('should return -1 for key without TTL', async () => {
      await db.set('key1', 'value1');
      const ttl = await db.ttl('key1');
      expect(ttl).toBe(-1);
    });
  });

  describe('INCR and DECR', () => {
    it('should increment numeric value', async () => {
      await db.set('counter', 10);
      const result = await db.incr('counter');
      expect(result).toBe(11);
    });

    it('should decrement numeric value', async () => {
      await db.set('counter', 10);
      const result = await db.decr('counter');
      expect(result).toBe(9);
    });

    it('should initialize to 0 for non-existent key', async () => {
      const result = await db.incr('newcounter');
      expect(result).toBe(1);
    });

    it('should handle non-numeric values', async () => {
      await db.set('key1', 'string');
      const result = await db.incr('key1');
      expect(result).toBe(1);
    });
  });

  describe('KEYS', () => {
    it('should return all keys without pattern', async () => {
      await db.set('key1', 'value1');
      await db.set('key2', 'value2');
      await db.set('key3', 'value3');
      
      const keys = await db.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });

    it('should return keys matching pattern', async () => {
      await db.set('user:1', 'John');
      await db.set('user:2', 'Jane');
      await db.set('post:1', 'Hello');
      
      const userKeys = await db.keys('user:*');
      expect(userKeys).toHaveLength(2);
      expect(userKeys).toContain('user:1');
      expect(userKeys).toContain('user:2');
    });

    it('should return empty array for no matches', async () => {
      await db.set('key1', 'value1');
      const keys = await db.keys('nonexistent:*');
      expect(keys).toHaveLength(0);
    });
  });

  describe('FLUSHALL', () => {
    it('should remove all keys', async () => {
      await db.set('key1', 'value1');
      await db.set('key2', 'value2');
      await db.set('key3', 'value3');
      
      await db.flushall();
      
      const keys = await db.keys();
      expect(keys).toHaveLength(0);
    });
  });

  describe('INFO', () => {
    it('should return storage statistics', async () => {
      await db.set('key1', 'value1');
      await db.set('key2', 'value2');
      
      const info = await db.info();
      expect(info).toHaveProperty('memtableSize');
      expect(info).toHaveProperty('sstableCount');
      expect(info).toHaveProperty('totalKeys');
      expect(info).toHaveProperty('totalSize');
      expect(info).toHaveProperty('compactionStats');
    });
  });
});