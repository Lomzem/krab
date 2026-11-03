#!/usr/bin/env bun
import { defineConfig } from '@playwright/test';
import base from '../playwright.config';

export default defineConfig({
  ...base,
  testDir: './verify-krab',
  testMatch: ['placing-drop.ts', 'finding-gear.ts', 'collecting.ts'],
  outputDir: '../test-results/verify-krab-lock/artifacts',
  workers: 1,
  retries: 0,
  webServer: {
    command: 'node scripts/verify-krab/preview.ts',
    cwd: process.cwd(),
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false
  }
});
