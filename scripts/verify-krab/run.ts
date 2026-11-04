#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { strict as assert } from 'node:assert';
import { missingPlaywrightImage, playwrightImage } from '../playwright-image';

const pinned = playwrightImage();
if (pinned === null) {
  console.error(missingPlaywrightImage);
  process.exit(1);
}
const image = pinned;
const scratch = resolve('test-results/verify-krab-lock');
const runId =
  new Date().toISOString().replaceAll(':', '-') + `-${String(process.pid)}`;
const evidence = resolve(
  process.env.KRAB_VERIFY_EVIDENCE_ROOT ??
    '.scratch/on-water-workflow/verify-evidence',
  runId
);
const docker = (args: string[]) =>
  spawnSync('docker', args, { encoding: 'utf8' });
assert.equal(docker(['info']).status, 0, 'Doctor: docker daemon unreachable');
assert.equal(
  docker(['image', 'inspect', image]).status,
  0,
  'Doctor: pinned image missing'
);
if (process.argv.includes('--doctor')) {
  const containers = docker([
    'ps',
    '--filter',
    `volume=${process.cwd()}`,
    '--filter',
    `ancestor=${image}`,
    '--format',
    '{{.ID}}'
  ])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  assert.equal(
    containers.length,
    1,
    'Doctor needs exactly one matching active container'
  );
  const checked = docker([
    'exec',
    '--workdir',
    '/work',
    containers[0] ?? '',
    'node',
    'scripts/verify-krab/doctor.ts'
  ]);
  console.log(checked.stdout, checked.stderr);
  process.exit(checked.status ?? 1);
}
assert.ok(
  !existsSync(scratch),
  `Run already active or interrupted: ${scratch}; inspect before cleanup`
);
assert.ok(
  !evidence.startsWith(scratch),
  'Evidence must survive scratch cleanup'
);
mkdirSync(resolve('test-results'), { recursive: true });
mkdirSync(scratch);
mkdirSync(evidence, { recursive: true });
const result = spawnSync(
  'bun',
  [
    'run',
    'scripts/e2e-container.ts',
    '--config',
    'scripts/verify-krab.config.ts'
  ],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
);
writeFileSync(
  resolve(evidence, 'run.log'),
  `${result.stdout}\n${result.stderr}`
);
cpSync(scratch, resolve(evidence, 'artifacts'), { recursive: true });
rmSync(scratch, { recursive: true });
assert.ok(
  existsSync(resolve(evidence, 'artifacts')),
  'Evidence missing after cleanup'
);
console.log(result.stdout, result.stderr);
console.log(`Evidence retained after cleanup: ${evidence}`);
process.exitCode = result.status ?? 1;
