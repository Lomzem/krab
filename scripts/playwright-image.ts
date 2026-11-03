import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const playwrightManifest = join(
  process.cwd(),
  'node_modules',
  '@playwright',
  'test',
  'package.json'
);

const installedVersion = (): string | null => {
  if (!existsSync(playwrightManifest)) return null;
  const parsed: unknown = JSON.parse(readFileSync(playwrightManifest, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { version } = parsed as { version?: unknown };
  return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)
    ? version
    : null;
};

export const playwrightImage = (): string | null => {
  const version = installedVersion();
  return version === null
    ? null
    : `mcr.microsoft.com/playwright:v${version}-noble`;
};

export const missingPlaywrightImage = `Can't resolve the installed @playwright/test version from ${playwrightManifest}. Run bun install --frozen-lockfile, then retry.`;
