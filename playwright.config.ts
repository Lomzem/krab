import { defineConfig, devices } from '@playwright/test';

export const MADE_UP_SEA = { latitude: -47.123456, longitude: -128.654321 };

const origin = 'http://127.0.0.1:4173';

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  reporter: 'list',
  forbidOnly: Boolean(process.env.CI),
  use: { baseURL: origin, trace: 'off', screenshot: 'off', video: 'off' },
  projects: [
    {
      name: 'iphone-webkit',
      use: {
        ...devices['iPhone 17'],
        geolocation: { ...MADE_UP_SEA, accuracy: 8 },
        permissions: ['geolocation']
      }
    }
  ],
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: origin,
    reuseExistingServer: false
  }
});
