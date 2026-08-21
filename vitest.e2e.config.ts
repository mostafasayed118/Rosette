import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    include: ['tests/e2e/*.test.ts', 'tests/e2e/**/*.test.ts'],
    environment: 'node',
    globals: true,
    testTimeout: 300_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    globalSetup: ['./tests/e2e/global-setup.ts'],
  },
});
