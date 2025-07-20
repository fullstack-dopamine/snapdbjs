import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'benchmarks/',
        'examples/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts'
      ]
    },
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts'],
    testTimeout: 10000,
    poolOptions: {
      threads: {
        minThreads: 1,
        maxThreads: 4
      }
    }
  }
});