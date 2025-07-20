// Simple test of SnapDBJS
import { SnapDB } from '../src/index.js';

async function test() {
  console.log('Creating SnapDB instance...');
  const db = new SnapDB();

  try {
    console.log('Setting values...');
    await db.set('key1', 'value1');
    await db.set('key2', { name: 'John', age: 30 });
    
    console.log('Getting values...');
    const val1 = await db.get('key1');
    const val2 = await db.get('key2');
    
    console.log('key1:', val1);
    console.log('key2:', val2);
    
    console.log('Checking existence...');
    const exists = await db.exists('key1');
    console.log('key1 exists:', exists);
    
    console.log('Getting info...');
    const info = await db.info();
    console.log('Storage info:', info);
    
    console.log('Closing database...');
    await db.close();
    console.log('Done!');
  } catch (error) {
    console.error('Error:', error);
    await db.close();
  }
}

test().catch(console.error);