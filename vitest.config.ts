import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [svelte({ configFile: false })],
  test: {
    environment: 'node',
    include: [
      'src/**/*.test.ts',
      'scripts/verify-krab/**/*.test.ts',
      'scripts/lint-rules.test.ts'
    ],
    env: { TZ: 'America/New_York' }
  }
});
