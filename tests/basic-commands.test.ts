/**
 * Basic command tests for SnapDBJS
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SnapDB } from '../src';

describe('SnapDB Basic Commands', () => {
  let db: SnapDB<string, any>;

  beforeEach(async () => {
    db = new SnapDB({
      maxMemtableSizeMB: 1,
      logLevel: 'error'
    });
    // Wait for worker to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(async () => {
    if (db) {
      await db.close();
    }
  });

  describe('SET/GET operations', () => {
    it('should set and get a string value', async () => {
      await db.set('key1', 'value1');
      const value = await db.get('key1');
      expect(value).toBe('value1');
    });

    it('should set and get a number value', async () => {
      await db.set('num', 42);
      const value = await db.get('num');
      expect(value).toBe(42);
    });

    it('should set and get an object value', async () => {
      const obj = { name: 'test', count: 10 };
      await db.set('obj', obj);
      const value = await db.get('obj');
      expect(value).toEqual(obj);
    });

    it('should return null for non-existent key', async () => {
      const value = await db.get('nonexistent');
      expect(value).toBeNull();
    });

    it('should overwrite existing value', async () => {
      await db.set('key1', 'value1');
      await db.set('key1', 'value2');
      const value = await db.get('key1');
      expect(value).toBe('value2');
    });
  });

  describe('DEL operations', () => {
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

  describe('EXISTS operations', () => {
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

  describe('TTL operations', () => {
    it('should set and get TTL', async () => {
      await db.set('key1', 'value1', 10000); // 10 seconds
      const ttl = await db.ttl('key1');
      expect(ttl).toBeGreaterThan(8); // Allow for some execution time
      expect(ttl).toBeLessThanOrEqual(10);
    });

    it('should return -1 for key without TTL', async () => {
      await db.set('key1', 'value1');
      const ttl = await db.ttl('key1');
      expect(ttl).toBe(-1);
    });

    it('should return -2 for non-existent key', async () => {
      const ttl = await db.ttl('nonexistent');
      expect(ttl).toBe(-2);
    });

    it('should expire key after TTL', async () => {
      await db.set('key1', 'value1', 100); // 100ms
      await new Promise(resolve => setTimeout(resolve, 150));
      const value = await db.get('key1');
      expect(value).toBeNull();
    });
  });

  describe('INCR/DECR operations', () => {
    it('should increment numeric value', async () => {
      await db.set('counter', 5);
      const result = await db.incr('counter');
      expect(result).toBe(6);

      const value = await db.get('counter');
      expect(value).toBe(6);
    });

    it('should initialize to 1 if key does not exist', async () => {
      const result = await db.incr('newcounter');
      expect(result).toBe(1);
    });

    it('should decrement numeric value', async () => {
      await db.set('counter', 5);
      const result = await db.decr('counter');
      expect(result).toBe(4);
    });

    it('should initialize to -1 if key does not exist', async () => {
      const result = await db.decr('newcounter');
      expect(result).toBe(-1);
    });
  });

  describe('KEYS operations', () => {
    beforeEach(async () => {
      await db.set('user:1', 'John');
      await db.set('user:2', 'Jane');
      await db.set('post:1', 'Hello');
      await db.set('comment:1', 'Nice');
    });

    it('should return all keys when no pattern', async () => {
      const keys = await db.keys();
      expect(keys).toHaveLength(4);
      expect(keys).toContain('user:1');
      expect(keys).toContain('user:2');
      expect(keys).toContain('post:1');
      expect(keys).toContain('comment:1');
    });

    it('should return keys matching pattern', async () => {
      const keys = await db.keys('user:*');
      expect(keys).toHaveLength(2);
      expect(keys).toContain('user:1');
      expect(keys).toContain('user:2');
    });

    it('should return empty array for no matches', async () => {
      const keys = await db.keys('nonexistent:*');
      expect(keys).toHaveLength(0);
    });
  });

  describe('FLUSHALL operations', () => {
    it('should remove all keys', async () => {
      await db.set('key1', 'value1');
      await db.set('key2', 'value2');
      await db.set('key3', 'value3');

      await db.flushall();

      const keys = await db.keys();
      expect(keys).toHaveLength(0);
    });
  });

  describe('MGET/MSET operations', () => {
    it('should set multiple keys at once', async () => {
      await db.mset([
        { key: 'key1', value: 'value1' },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: 'value3' }
      ]);

      const value1 = await db.get('key1');
      const value2 = await db.get('key2');
      const value3 = await db.get('key3');

      expect(value1).toBe('value1');
      expect(value2).toBe('value2');
      expect(value3).toBe('value3');
    });

    it('should get multiple keys at once', async () => {
      await db.set('key1', 'value1');
      await db.set('key2', 'value2');
      await db.set('key3', 'value3');

      const values = await db.mget(['key1', 'key2', 'key3', 'nonexistent']);

      expect(values).toEqual(['value1', 'value2', 'value3', null]);
    });
  });
});