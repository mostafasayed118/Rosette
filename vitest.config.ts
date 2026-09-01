import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    // Keep the default command deterministic and allow Vitest to tear down
    // the shared jsdom/react environment cleanly after all files finish.
    pool: 'threads',
    poolOptions: { threads: { singleThread: true } },
    fileParallelism: false,
    exclude: ['node_modules/**', '.worktrees/**', 'worktrees/**', 'dist/**', 'cypress/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['app/**', 'components/**', 'features/**', 'hooks/**', 'lib/**'],
      exclude: ['**/*.d.ts', '**/*.test.*', '**/node_modules/**'],
      reporter: ['text', 'html', 'lcov'],
      reportsDirectory: 'coverage',
    },
  },
});

