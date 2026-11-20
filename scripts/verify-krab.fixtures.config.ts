#!/usr/bin/env bun
import { defineConfig } from '@playwright/test';
import journeys from './verify-krab.config';
import visual from './verify-krab.visual.config';
import type { ProviderSource } from './verify-krab/recipe';

process.env['KRAB_VERIFY_SCRATCH'] = 'test-results/verify-recipes';

const fixtures = { liveProviders: false };

export default defineConfig<ProviderSource>({
  ...journeys,
  testMatch: undefined,
  outputDir: '../test-results/verify-recipes/artifacts',
  reporter: 'list',
  projects: [
    ...(journeys.projects ?? []).map((project) => ({
      ...project,
      testMatch: journeys.testMatch,
      use: { ...project.use, ...fixtures }
    })),
    ...(visual.projects ?? []).map((project) => ({
      ...project,
      testMatch: visual.testMatch,
      use: { ...project.use, ...fixtures }
    }))
  ]
});
