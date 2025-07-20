/**
 * Simple demo of SnapDBJS
 */

import { SnapDB } from '../src/client/SnapDB';

async function demo() {
  console.log('🚀 SnapDBJS Demo\n');
  
  // Create database instance
  const db = new SnapDB<string, any>({
    maxMemtableSizeMB: 32,
    logLevel: 'info'
  });

  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 100));

  try {
    // Basic operations
    console.log('Setting values...');
    await db.set('name', 'SnapDBJS');
    await db.set('version', '1.0.0');
    await db.set('features', ['LSM-tree', 'TypeScript', 'Worker Threads']);
    
    console.log('\nGetting values...');
    const name = await db.get('name');
    const version = await db.get('version');
    const features = await db.get('features');
    
    console.log(`  Name: ${name}`);
    console.log(`  Version: ${version}`);
    console.log(`  Features: ${features.join(', ')}`);
    
    // Counter operations
    console.log('\nCounter operations...');
    await db.set('counter', 0);
    console.log('  Initial counter:', await db.get('counter'));
    
    await db.incr('counter');
    console.log('  After increment:', await db.get('counter'));
    
    await db.incr('counter');
    await db.incr('counter');
    console.log('  After 2 more increments:', await db.get('counter'));
    
    // TTL demonstration
    console.log('\nTTL demonstration...');
    await db.set('temp-key', 'This will expire', 2000); // 2 seconds
    console.log('  Value:', await db.get('temp-key'));
    console.log('  TTL:', await db.ttl('temp-key'), 'seconds');
    
    console.log('  Waiting 2.5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2500));
    console.log('  Value after expiry:', await db.get('temp-key'));
    
    // Pattern matching
    console.log('\nPattern matching...');
    await db.set('user:1:name', 'Alice');
    await db.set('user:1:email', 'alice@example.com');
    await db.set('user:2:name', 'Bob');
    await db.set('user:2:email', 'bob@example.com');
    
    const userKeys = await db.keys('user:*');
    console.log('  User keys:', userKeys);
    
    // Storage info
    console.log('\nStorage statistics...');
    const info = await db.info();
    console.log(`  Total keys: ${await db.keys().then(k => k.length)}`);
    console.log(`  Memtable size: ${info.memtable.size} bytes`);
    console.log(`  SSTable count: ${info.sstables.length}`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Clean up
    await db.close();
    console.log('\nDemo completed!');
  }
}

// Run the demo
demo().catch(console.error);