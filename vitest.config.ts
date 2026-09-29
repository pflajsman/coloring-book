import { defineConfig } from 'vitest/config';

// Unit tests cover pure modules only (no DOM, no canvas), so the plain node
// environment is enough and keeps the test run fast.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
