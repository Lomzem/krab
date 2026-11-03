import { spawnSync } from 'node:child_process';
import { userInfo } from 'node:os';

const IMAGE = 'mcr.microsoft.com/playwright:v1.64.1-noble';

const run = (command: string, args: string[]) =>
  spawnSync(command, args, { stdio: 'inherit' }).status ?? 1;

const build = run('bun', ['run', 'build']);
const { uid, gid } = userInfo();
process.exitCode =
  build === 0
    ? run('docker', [
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
        IMAGE,
        'npx',
        'playwright',
        'test',
        ...process.argv.slice(2)
      ])
    : build;
