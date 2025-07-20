/**
 * Basic usage example for SnapDBJS
 */

import { SnapDB, LoggingMiddleware, MetricsMiddleware, SnapshotPlugin } from '../src';

async function main() {
  // Create a new SnapDB instance
  const db = new SnapDB<string, any>({
    maxMemtableSizeMB: 64,
    compactionIntervalMs: 60000,
    enableBloomFilter: true,
    logLevel: 'info'
  });

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 100));

  console.log('=== Basic Operations ===');
  
  // Set and get values
  await db.set('user:1', { name: 'John Doe', age: 30 });
  await db.set('user:2', { name: 'Jane Smith', age: 25 });
  
  const user1 = await db.get('user:1');
  console.log('User 1:', user1);

  // Set with TTL (expires in 5 seconds)
  await db.set('session:123', { token: 'abc123' }, 5000);
  
  // Check TTL
  const ttl = await db.ttl('session:123');
  console.log('Session TTL:', ttl, 'seconds');

  console.log('\n=== Counter Operations ===');
  
  // Increment/decrement counters
  await db.set('views', 100);
  const views1 = await db.incr('views');
  console.log('Views after increment:', views1);
  
  const views2 = await db.decr('views');
  console.log('Views after decrement:', views2);

  console.log('\n=== Pattern Matching ===');
  
  // Find keys by pattern
  const userKeys = await db.keys('user:*');
  console.log('User keys:', userKeys);

  console.log('\n=== Batch Operations ===');
  
  // Set multiple values at once
  await db.mset([
    { key: 'config:host', value: 'localhost' },
    { key: 'config:port', value: 3000 },
    { key: 'config:debug', value: true }
  ]);
  
  // Get multiple values at once
  const configs = await db.mget(['config:host', 'config:port', 'config:debug']);
  console.log('Configs:', configs);

  console.log('\n=== Middleware Example ===');
  
  // Add logging middleware
  db.use(LoggingMiddleware({ 
    logLevel: 'info',
    includeTimings: true 
  }));
  
  // Add metrics middleware
  const metrics = new MetricsMiddleware();
  db.use(metrics.middleware());
  
  // Perform some operations
  await db.set('test:1', 'value1');
  await db.get('test:1');
  await db.del('test:1');
  
  console.log('Metrics:', metrics.getMetrics());

  console.log('\n=== Plugin Example ===');
  
  // Register snapshot plugin
  const snapshotPlugin = new SnapshotPlugin();
  await db.register(snapshotPlugin);
  
  // Create a snapshot
  await (db as any).snapshot('backup1');
  console.log('Snapshot created');
  
  // List snapshots
  const snapshots = (db as any).listSnapshots();
  console.log('Available snapshots:', snapshots);

  console.log('\n=== Event Handling ===');
  
  // Listen to events
  db.on('set', (event) => {
    console.log('SET event:', event);
  });
  
  db.on('del', (event) => {
    console.log('DEL event:', event);
  });
  
  // Trigger some events
  await db.set('event:test', 'value');
  await db.del('event:test');

  console.log('\n=== Storage Info ===');
  
  // Get storage statistics
  const info = await db.info();
  console.log('Storage info:', JSON.stringify(info, null, 2));

  // Clean up
  await db.close();
  console.log('\nDatabase closed');
}

// Run the example
main().catch(console.error);