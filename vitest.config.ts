import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/verify-krab/**/*.test.ts'],
    env: { TZ: 'America/New_York' }
  }
});
