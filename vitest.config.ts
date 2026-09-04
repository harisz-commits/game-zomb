import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Every unit-tested system is intentionally free of Phaser/DOM imports,
    // so the plain node environment is enough and keeps the suite fast.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    reporters: 'default',
  },
});
