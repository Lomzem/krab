#!/usr/bin/env bun
import { test as base } from '@playwright/test';
import { serveProviders, type Providers } from '../../e2e/fixtures';

export { expect } from '@playwright/test';

export type ProviderSource = { liveProviders: boolean };

export const test = base.extend<
  ProviderSource & { providers: Providers | null }
>({
  liveProviders: [true, { option: true }],
  serviceWorkers: async ({ liveProviders }, use) => {
    await use(liveProviders ? 'allow' : 'block');
  },
  providers: [
    async ({ context, liveProviders }, use) => {
      if (liveProviders) await use(null);
      else await serveProviders(context, use);
    },
    { auto: true }
  ]
});
