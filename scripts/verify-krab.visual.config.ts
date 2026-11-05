#!/usr/bin/env bun
import { defineConfig, devices } from '@playwright/test';
import base from './verify-krab.config';

export default defineConfig({
  ...base,
  testMatch: ['visual-states.ts'],
  projects: ['light', 'dark'].flatMap((colorScheme) =>
    [
      { name: 'phone', width: 393, height: 852 },
      { name: 'narrow', width: 320, height: 640 }
    ].map(({ name, width, height }) => ({
      name: `${name}-${colorScheme}`,
      use: {
        ...devices['iPhone 17'],
        viewport: { width, height },
        colorScheme: colorScheme as 'light' | 'dark',
        timezoneId: 'America/New_York'
      }
    }))
  )
});
