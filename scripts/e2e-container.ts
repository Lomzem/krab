import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';

const manifest = join(
  process.cwd(),
  'node_modules',
  '@playwright',
  'test',
  'package.json'
);

const installedVersion = (): string | null => {
  if (!existsSync(manifest)) return null;
  const parsed: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  if (typeof parsed !== 'object' || parsed === null) return null;
  const { version } = parsed as { version?: unknown };
  return typeof version === 'string' && /^\d+\.\d+\.\d+$/.test(version)
    ? version
    : null;
};

const run = (command: string, args: string[]) =>
  spawnSync(command, args, { stdio: 'inherit' }).status ?? 1;

const test = (image: string) => {
  const build = run('bun', ['run', 'build']);
  if (build !== 0) return build;
  const { uid, gid } = userInfo();
  return run('docker', [
    'run',
    '--rm',
    '--ipc=host',
    '--user',
    `${String(uid)}:${String(gid)}`,
    '--env',
    'HOME=/tmp',
    '--env',
    'NPM_CONFIG_UPDATE_NOTIFIER=false',
    '--volume',
    `${process.cwd()}:/work`,
    '--workdir',
    '/work',
    image,
    'npx',
    'playwright',
    'test',
    ...process.argv.slice(2)
  ]);
};

const version = installedVersion();
if (version === null) {
  console.error(
    `Can't resolve the installed @playwright/test version from ${manifest}. Run bun install --frozen-lockfile, then retry.`
  );
  process.exitCode = 1;
} else {
  process.exitCode = test(`mcr.microsoft.com/playwright:v${version}-noble`);
}
