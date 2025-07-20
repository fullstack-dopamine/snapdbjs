/**
 * Performance benchmarks for SnapDBJS
 */

import { SnapDB } from '../src';

interface BenchmarkResult {
  operation: string;
  totalOps: number;
  duration: number;
  opsPerSecond: number;
  avgLatency: number;
}

class Benchmark {
  private db: SnapDB<string, any>;
  private results: BenchmarkResult[] = [];

  constructor() {
    this.db = new SnapDB({
      maxMemtableSizeMB: 128,
      compactionIntervalMs: 300000,
      logLevel: 'error'
    });
  }

  async setup(): Promise<void> {
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async cleanup(): Promise<void> {
    await this.db.close();
  }

  private async measure(
    name: string,
    ops: number,
    fn: () => Promise<void>
  ): Promise<BenchmarkResult> {
    const start = Date.now();
    
    for (let i = 0; i < ops; i++) {
      await fn();
    }
    
    const duration = Date.now() - start;
    const result: BenchmarkResult = {
      operation: name,
      totalOps: ops,
      duration,
      opsPerSecond: Math.round((ops / duration) * 1000),
      avgLatency: duration / ops
    };
    
    this.results.push(result);
    return result;
  }

  async benchmarkWrites(ops: number = 10000): Promise<BenchmarkResult> {
    console.log(`\nBenchmarking ${ops} write operations...`);
    
    const result = await this.measure('SET', ops, async () => {
      const key = `key-${Math.random().toString(36).substr(2, 9)}`;
      const value = { data: 'test', timestamp: Date.now() };
      await this.db.set(key, value);
    });
    
    console.log(`  ✓ ${result.opsPerSecond} ops/sec`);
    console.log(`  ✓ ${result.avgLatency.toFixed(3)}ms avg latency`);
    
    return result;
  }

  async benchmarkReads(ops: number = 10000): Promise<BenchmarkResult> {
    console.log(`\nBenchmarking ${ops} read operations...`);
    
    // Pre-populate data
    const keys: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const key = `read-key-${i}`;
      await this.db.set(key, { data: `value-${i}` });
      keys.push(key);
    }
    
    const result = await this.measure('GET', ops, async () => {
      const key = keys[Math.floor(Math.random() * keys.length)];
      await this.db.get(key);
    });
    
    console.log(`  ✓ ${result.opsPerSecond} ops/sec`);
    console.log(`  ✓ ${result.avgLatency.toFixed(3)}ms avg latency`);
    
    return result;
  }

  async benchmarkMixed(ops: number = 10000): Promise<BenchmarkResult> {
    console.log(`\nBenchmarking ${ops} mixed operations (80% read, 20% write)...`);
    
    // Pre-populate some data
    const keys: string[] = [];
    for (let i = 0; i < 1000; i++) {
      const key = `mixed-key-${i}`;
      await this.db.set(key, { data: `value-${i}` });
      keys.push(key);
    }
    
    let reads = 0;
    let writes = 0;
    
    const result = await this.measure('MIXED', ops, async () => {
      if (Math.random() < 0.8) {
        // Read operation (80%)
        const key = keys[Math.floor(Math.random() * keys.length)];
        await this.db.get(key);
        reads++;
      } else {
        // Write operation (20%)
        const key = `mixed-key-${keys.length + writes}`;
        await this.db.set(key, { data: `value-${writes}` });
        keys.push(key);
        writes++;
      }
    });
    
    console.log(`  ✓ ${result.opsPerSecond} ops/sec`);
    console.log(`  ✓ ${result.avgLatency.toFixed(3)}ms avg latency`);
    console.log(`  ✓ ${reads} reads, ${writes} writes`);
    
    return result;
  }

  async benchmarkPatternMatch(patterns: number = 100): Promise<BenchmarkResult> {
    console.log(`\nBenchmarking ${patterns} pattern matching operations...`);
    
    // Pre-populate with structured keys
    for (let i = 0; i < 100; i++) {
      await this.db.set(`user:${i}:profile`, { id: i });
      await this.db.set(`post:${i}:content`, { id: i });
      await this.db.set(`comment:${i}:text`, { id: i });
    }
    
    const result = await this.measure('KEYS', patterns, async () => {
      const patterns = ['user:*', 'post:*', 'comment:*'];
      const pattern = patterns[Math.floor(Math.random() * patterns.length)];
      await this.db.keys(pattern);
    });
    
    console.log(`  ✓ ${result.opsPerSecond} ops/sec`);
    console.log(`  ✓ ${result.avgLatency.toFixed(3)}ms avg latency`);
    
    return result;
  }

  printSummary(): void {
    console.log('\nBenchmark Summary');
    console.log('═'.repeat(60));
    console.log('Operation\tOps/sec\t\tAvg Latency\tTotal Time');
    console.log('─'.repeat(60));
    
    for (const result of this.results) {
      console.log(
        `${result.operation}\t\t${result.opsPerSecond}\t\t${result.avgLatency.toFixed(3)}ms\t\t${result.duration}ms`
      );
    }
    
    console.log('═'.repeat(60));
  }

  async getStorageInfo(): Promise<void> {
    const info = await this.db.info();
    console.log('\nStorage Information');
    console.log('─'.repeat(40));
    console.log(`Memtable size: ${(info.memtable.size / 1024).toFixed(2)} KB`);
    console.log(`Memtable entries: ${info.memtable.entries}`);
    console.log(`SSTable count: ${info.sstables.length}`);
    console.log(`Total size: ${(info.totalSize / 1024).toFixed(2)} KB`);
    console.log(`Total entries: ${info.totalEntries}`);
  }
}

async function runBenchmarks() {
  console.log('SnapDBJS Performance Benchmarks\n');
  
  const benchmark = new Benchmark();
  
  try {
    await benchmark.setup();
    
    // Run benchmarks
    await benchmark.benchmarkWrites(10000);
    await benchmark.benchmarkReads(10000);
    await benchmark.benchmarkMixed(10000);
    await benchmark.benchmarkPatternMatch(1000);
    
    // Print results
    benchmark.printSummary();
    await benchmark.getStorageInfo();
    
  } catch (error) {
    console.error('Benchmark error:', error);
  } finally {
    await benchmark.cleanup();
  }
}

// Run benchmarks
runBenchmarks().catch(console.error);