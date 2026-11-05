#!/usr/bin/env bun
import { defineConfig } from '@playwright/test';
import base from '../playwright.config';
import { resolve } from 'node:path';

export default defineConfig({
  ...base,
  testDir: './verify-krab',
  testMatch: [
    'placing-drop.ts',
    'finding-gear.ts',
    'collecting.ts',
    'drop-details.ts',
    'compass.ts',
    'days-and-filter.ts',
    'end-and-past-trips.ts'
  ],
  outputDir: '../test-results/verify-krab-lock/artifacts',
  reporter: [
    ['list'],
    [
      'json',
      { outputFile: resolve('test-results/verify-krab-lock/results.json') }
    ]
  ],
  use: { ...base.use, screenshot: 'only-on-failure' },
  workers: 1,
  retries: 0,
  webServer: {
    command: 'node scripts/verify-krab/preview.ts',
    cwd: process.cwd(),
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false
  }
});
