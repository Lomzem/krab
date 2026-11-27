#!/usr/bin/env bun
import { test as base, type TestInfo } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import {
  serveProviders,
  test as fixtureProviders,
  type Providers
} from '../../e2e/fixtures';
import { doctor } from './doctor';

export { expect } from '@playwright/test';

export type ProviderSource = { liveProviders: boolean };

type Doctor = { doctorReceipt: ReturnType<typeof doctor> };

const runDoctor = async (
  // eslint-disable-next-line no-empty-pattern -- Playwright reads fixture dependencies from this destructuring and needs none here
  {},
  use: (receipt: Doctor['doctorReceipt']) => Promise<void>,
  info: TestInfo
) => {
  const receipt = doctor();
  writeFileSync(
    info.outputPath('doctor.json'),
    JSON.stringify(receipt, null, 2)
  );
  await use(receipt);
};

export const test = base.extend<
  ProviderSource & Doctor & { providers: Providers | null }
>({
  liveProviders: [true, { option: true }],
  serviceWorkers: async ({ liveProviders }, use) => {
    await use(liveProviders ? 'allow' : 'block');
  },
  doctorReceipt: [runDoctor, { auto: true }],
  providers: [
    async ({ context, liveProviders }, use) => {
      if (liveProviders) await use(null);
      else await serveProviders(context, use);
    },
    { auto: true }
  ]
});

export const testWithFixtureProviders = fixtureProviders.extend<Doctor>({
  doctorReceipt: [runDoctor, { auto: true }]
});
