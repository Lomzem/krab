import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';
import { missingPlaywrightImage, playwrightImage } from './playwright-image';

const run = (command: string, args: string[]) =>
  spawnSync(command, args, { stdio: 'inherit' }).status ?? 1;

const test = (image: string) => {
  const build = run('bun', ['run', 'build']);
  if (build !== 0) return build;
  const next = run('bun', ['run', 'build:next']);
  if (next !== 0) return next;
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

const image = playwrightImage();
if (image === null) {
  console.error(missingPlaywrightImage);
  process.exitCode = 1;
} else {
  process.exitCode = test(image);
}
