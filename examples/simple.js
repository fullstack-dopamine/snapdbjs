// Simple example using SnapDBJS
const { SnapDB } = require('../dist/cjs');

async function main() {
  // Create a new database instance
  const db = new SnapDB();
  
  try {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Basic operations
    await db.set('name', 'SnapDBJS');
    await db.set('version', '1.0.0');
    
    const name = await db.get('name');
    const version = await db.get('version');
    
    console.log(`${name} v${version}`);
    
    // Counter operations
    await db.set('counter', 0);
    await db.incr('counter');
    await db.incr('counter');
    const count = await db.get('counter');
    console.log('Counter:', count);
    
    // TTL example
    await db.set('temp', 'This expires in 2 seconds', 2000);
    console.log('Temp value:', await db.get('temp'));
    
    setTimeout(async () => {
      console.log('Temp value after 2.5s:', await db.get('temp'));
      await db.close();
    }, 2500);
    
  } catch (error) {
    console.error('Error:', error);
    await db.close();
  }
}

main().catch(console.error);