import { SnapDB, MetricsMiddleware } from '../src';
import { performance } from 'perf_hooks';
import * as fs from 'fs/promises';
import * as path from 'path';

interface TestResult {
  name: string;
  description: string;
  iterations: number;
  totalTimeMs: number;
  avgTimeMs: number;
  opsPerSecond: number;
  minTimeMs: number;
  maxTimeMs: number;
  memoryUsedMB: number;
}

interface PerformanceReport {
  timestamp: string;
  nodeVersion: string;
  platform: string;
  cpuModel: string;
  totalMemoryGB: number;
  snapdbVersion: string;
  config: any;
  results: TestResult[];
  summary: {
    totalTests: number;
    totalDuration: number;
    averageOpsPerSecond: number;
  };
}

class PerformanceTestSuite {
  private db: SnapDB<string, any>;
  private metrics: MetricsMiddleware;
  private results: TestResult[] = [];

  constructor(private config: any = {}) {
    this.db = new SnapDB<string, any>({
      maxMemtableSizeMB: 128,
      compactionIntervalMs: 300000,
      enableBloomFilter: true,
      logLevel: 'error',
      ...config
    });
    
    this.metrics = new MetricsMiddleware();
    this.db.use(this.metrics.middleware());
  }

  async setup() {
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async cleanup() {
    await this.db.close();
  }

  private async measureOperation(
    name: string,
    description: string,
    iterations: number,
    operation: () => Promise<void>
  ): Promise<TestResult> {
    const times: number[] = [];
    const memBefore = process.memoryUsage().heapUsed;
    
    // Warmup
    for (let i = 0; i < Math.min(100, iterations / 10); i++) {
      await operation();
    }

    // Actual test
    const startTotal = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      times.push(end - start);
    }
    
    const endTotal = performance.now();
    const memAfter = process.memoryUsage().heapUsed;
    
    const totalTimeMs = endTotal - startTotal;
    const avgTimeMs = totalTimeMs / iterations;
    const minTimeMs = Math.min(...times);
    const maxTimeMs = Math.max(...times);
    const opsPerSecond = 1000 / avgTimeMs;
    const memoryUsedMB = (memAfter - memBefore) / 1024 / 1024;

    return {
      name,
      description,
      iterations,
      totalTimeMs,
      avgTimeMs,
      opsPerSecond,
      minTimeMs,
      maxTimeMs,
      memoryUsedMB
    };
  }

  async testSetOperations() {
    console.log('Testing SET operations...');
    const result = await this.measureOperation(
      'SET',
      'Basic set operations with string values',
      10000,
      async () => {
        const key = `test:${Math.random()}`;
        await this.db.set(key, 'value');
      }
    );
    this.results.push(result);
  }

  async testGetOperations() {
    console.log('Testing GET operations...');
    
    // Pre-populate data
    const keys: string[] = [];
    for (let i = 0; i < 10000; i++) {
      const key = `get-test:${i}`;
      keys.push(key);
      await this.db.set(key, `value-${i}`);
    }

    const result = await this.measureOperation(
      'GET',
      'Basic get operations on existing keys',
      10000,
      async () => {
        const key = keys[Math.floor(Math.random() * keys.length)];
        await this.db.get(key);
      }
    );
    this.results.push(result);
  }

  async testMixedOperations() {
    console.log('Testing mixed operations...');
    
    const result = await this.measureOperation(
      'MIXED',
      '80% reads, 20% writes workload',
      10000,
      async () => {
        const rand = Math.random();
        if (rand < 0.8) {
          // Read
          await this.db.get(`mixed:${Math.floor(Math.random() * 1000)}`);
        } else {
          // Write
          await this.db.set(`mixed:${Math.floor(Math.random() * 1000)}`, 'value');
        }
      }
    );
    this.results.push(result);
  }

  async testTTLOperations() {
    console.log('Testing TTL operations...');
    
    const result = await this.measureOperation(
      'SET_WITH_TTL',
      'Set operations with 5 second TTL',
      5000,
      async () => {
        const key = `ttl:${Math.random()}`;
        await this.db.set(key, 'value', 5000);
      }
    );
    this.results.push(result);
  }

  async testCounterOperations() {
    console.log('Testing counter operations...');
    
    // Initialize counters
    const counters: string[] = [];
    for (let i = 0; i < 100; i++) {
      const key = `counter:${i}`;
      counters.push(key);
      await this.db.set(key, 0);
    }

    const result = await this.measureOperation(
      'INCR',
      'Increment counter operations',
      10000,
      async () => {
        const key = counters[Math.floor(Math.random() * counters.length)];
        await this.db.incr(key);
      }
    );
    this.results.push(result);
  }

  async testBatchOperations() {
    console.log('Testing batch operations...');
    
    const result = await this.measureOperation(
      'MSET',
      'Batch set operations (10 keys per batch)',
      1000,
      async () => {
        const batch = Array.from({ length: 10 }, (_, i) => ({
          key: `batch:${Math.random()}:${i}`,
          value: `value-${i}`
        }));
        await this.db.mset(batch);
      }
    );
    this.results.push(result);

    // Test MGET
    const mgetResult = await this.measureOperation(
      'MGET',
      'Batch get operations (10 keys per batch)',
      1000,
      async () => {
        const keys = Array.from({ length: 10 }, (_, i) => `batch:test:${i}`);
        await this.db.mget(keys);
      }
    );
    this.results.push(mgetResult);
  }

  async testLargeValues() {
    console.log('Testing large value operations...');
    
    // Create large objects
    const largeObject = {
      data: Array(1000).fill(0).map((_, i) => ({
        id: i,
        name: `User ${i}`,
        email: `user${i}@example.com`,
        metadata: { created: new Date(), tags: ['tag1', 'tag2', 'tag3'] }
      }))
    };

    const result = await this.measureOperation(
      'SET_LARGE',
      'Set operations with large objects (~100KB)',
      1000,
      async () => {
        const key = `large:${Math.random()}`;
        await this.db.set(key, largeObject);
      }
    );
    this.results.push(result);
  }

  async testPatternMatching() {
    console.log('Testing pattern matching...');
    
    // Pre-populate data with patterns
    for (let i = 0; i < 1000; i++) {
      await this.db.set(`user:${i}`, { id: i });
      await this.db.set(`session:${i}`, { token: `token${i}` });
      await this.db.set(`cache:${i}`, { data: `data${i}` });
    }

    const result = await this.measureOperation(
      'KEYS_PATTERN',
      'Pattern matching with wildcard (user:*)',
      100,
      async () => {
        await this.db.keys('user:*');
      }
    );
    this.results.push(result);
  }

  async testDeleteOperations() {
    console.log('Testing delete operations...');
    
    // Pre-populate data
    const keys: string[] = [];
    for (let i = 0; i < 10000; i++) {
      const key = `delete-test:${i}`;
      keys.push(key);
      await this.db.set(key, `value-${i}`);
    }

    const result = await this.measureOperation(
      'DEL',
      'Delete operations on existing keys',
      5000,
      async () => {
        const key = keys.pop();
        if (key) {
          await this.db.del(key);
        }
      }
    );
    this.results.push(result);
  }

  async testConcurrentOperations() {
    console.log('Testing concurrent operations...');
    
    const startTime = performance.now();
    const promises: Promise<void>[] = [];
    const concurrency = 100;
    const operationsPerThread = 100;

    for (let i = 0; i < concurrency; i++) {
      promises.push((async () => {
        for (let j = 0; j < operationsPerThread; j++) {
          const key = `concurrent:${i}:${j}`;
          await this.db.set(key, { thread: i, operation: j });
          await this.db.get(key);
        }
      })());
    }

    await Promise.all(promises);
    const endTime = performance.now();
    
    const totalOps = concurrency * operationsPerThread * 2; // set + get
    const totalTimeMs = endTime - startTime;
    
    this.results.push({
      name: 'CONCURRENT',
      description: `${concurrency} concurrent clients, ${operationsPerThread} ops each`,
      iterations: totalOps,
      totalTimeMs,
      avgTimeMs: totalTimeMs / totalOps,
      opsPerSecond: (totalOps / totalTimeMs) * 1000,
      minTimeMs: 0,
      maxTimeMs: 0,
      memoryUsedMB: 0
    });
  }

  private getSystemInfo() {
    const os = require('os');
    return {
      nodeVersion: process.version,
      platform: os.platform(),
      cpuModel: os.cpus()[0]?.model || 'Unknown',
      totalMemoryGB: os.totalmem() / 1024 / 1024 / 1024
    };
  }

  async generateReport(): Promise<PerformanceReport> {
    const systemInfo = this.getSystemInfo();
    const packageJson = JSON.parse(
      await fs.readFile(path.join(__dirname, '../package.json'), 'utf-8')
    );

    const totalDuration = this.results.reduce((sum, r) => sum + r.totalTimeMs, 0);
    const averageOpsPerSecond = 
      this.results.reduce((sum, r) => sum + r.opsPerSecond, 0) / this.results.length;

    return {
      timestamp: new Date().toISOString(),
      ...systemInfo,
      snapdbVersion: packageJson.version,
      config: this.config,
      results: this.results,
      summary: {
        totalTests: this.results.length,
        totalDuration,
        averageOpsPerSecond
      }
    };
  }

  async saveReport(report: PerformanceReport) {
    const reportDir = path.join(__dirname, '../performance-reports');
    await fs.mkdir(reportDir, { recursive: true });
    
    const filename = `performance-report-${new Date().toISOString().split('T')[0]}.json`;
    const filepath = path.join(reportDir, filename);
    
    await fs.writeFile(filepath, JSON.stringify(report, null, 2));
    console.log(`\nPerformance report saved to: ${filepath}`);
    
    // Also save a markdown version
    const markdownReport = this.generateMarkdownReport(report);
    const mdFilepath = filepath.replace('.json', '.md');
    await fs.writeFile(mdFilepath, markdownReport);
    console.log(`Markdown report saved to: ${mdFilepath}`);
  }

  private generateMarkdownReport(report: PerformanceReport): string {
    let md = `# SnapDB Performance Report\n\n`;
    md += `**Date**: ${new Date(report.timestamp).toLocaleString()}\n`;
    md += `**SnapDB Version**: ${report.snapdbVersion}\n`;
    md += `**Node Version**: ${report.nodeVersion}\n`;
    md += `**Platform**: ${report.platform}\n`;
    md += `**CPU**: ${report.cpuModel}\n`;
    md += `**Total Memory**: ${report.totalMemoryGB.toFixed(2)} GB\n\n`;
    
    md += `## Configuration\n\`\`\`json\n${JSON.stringify(report.config, null, 2)}\n\`\`\`\n\n`;
    
    md += `## Summary\n`;
    md += `- **Total Tests**: ${report.summary.totalTests}\n`;
    md += `- **Total Duration**: ${(report.summary.totalDuration / 1000).toFixed(2)} seconds\n`;
    md += `- **Average Operations/Second**: ${report.summary.averageOpsPerSecond.toFixed(0)}\n\n`;
    
    md += `## Test Results\n\n`;
    md += `| Test | Description | Iterations | Avg Time (ms) | Ops/Sec | Min (ms) | Max (ms) | Memory (MB) |\n`;
    md += `|------|-------------|------------|---------------|---------|----------|----------|-------------|\n`;
    
    for (const result of report.results) {
      md += `| ${result.name} | ${result.description} | ${result.iterations.toLocaleString()} | `;
      md += `${result.avgTimeMs.toFixed(3)} | ${result.opsPerSecond.toFixed(0)} | `;
      md += `${result.minTimeMs.toFixed(3)} | ${result.maxTimeMs.toFixed(3)} | `;
      md += `${result.memoryUsedMB.toFixed(2)} |\n`;
    }
    
    md += `\n## Detailed Metrics\n\n`;
    const metrics = this.metrics.getMetrics();
    md += `\`\`\`json\n${JSON.stringify(metrics, null, 2)}\n\`\`\`\n`;
    
    return md;
  }

  async runAllTests() {
    console.log('Starting SnapDB Performance Tests...\n');
    
    await this.setup();
    
    await this.testSetOperations();
    await this.testGetOperations();
    await this.testMixedOperations();
    await this.testTTLOperations();
    await this.testCounterOperations();
    await this.testBatchOperations();
    await this.testLargeValues();
    await this.testPatternMatching();
    await this.testDeleteOperations();
    await this.testConcurrentOperations();
    
    const report = await this.generateReport();
    await this.saveReport(report);
    
    console.log('\nPerformance Test Summary:');
    console.log('=========================');
    for (const result of this.results) {
      console.log(`${result.name}: ${result.opsPerSecond.toFixed(0)} ops/sec (${result.avgTimeMs.toFixed(3)}ms avg)`);
    }
    
    await this.cleanup();
  }
}

// Run the performance tests
async function main() {
  const suite = new PerformanceTestSuite({
    maxMemtableSizeMB: 128,
    compactionIntervalMs: 300000,
    enableBloomFilter: true,
    logLevel: 'error'
  });
  
  await suite.runAllTests();
}

main().catch(console.error);