import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { CURRENT_BUILD, PREVIOUS_BUILD } from '../e2e/builds';

if (existsSync(join(CURRENT_BUILD, 'index.html'))) {
  rmSync(PREVIOUS_BUILD, { recursive: true, force: true });
  cpSync(CURRENT_BUILD, PREVIOUS_BUILD, { recursive: true });
  process.exitCode =
    spawnSync('bun', ['run', 'build'], { stdio: 'inherit' }).status ?? 1;
} else {
  console.error(`Run bun run build first; ${CURRENT_BUILD} has no index.html.`);
  process.exitCode = 1;
}
