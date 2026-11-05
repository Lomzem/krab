#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { strict as assert } from 'node:assert';
import { missingPlaywrightImage, playwrightImage } from '../playwright-image';
import { sourceIdentity, writeEvidenceIndex } from './bundle';

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
  evidence !== scratch && !evidence.startsWith(scratch + sep),
  'Evidence must survive scratch cleanup'
);
const visual = process.argv.includes('--visual');
const config = visual
  ? 'scripts/verify-krab.visual.config.ts'
  : 'scripts/verify-krab.config.ts';
const before = sourceIdentity();
mkdirSync(resolve('test-results'), { recursive: true });
mkdirSync(scratch);
mkdirSync(evidence, { recursive: true });
const manifest = {
  startedAt: new Date().toISOString(),
  mode: visual ? 'visual' : 'journeys',
  selection: process.argv.slice(2),
  image,
  sourceBefore: before
};
writeFileSync(
  resolve(evidence, 'manifest.json'),
  JSON.stringify(manifest, null, 2)
);
const result = spawnSync(
  'bun',
  [
    'run',
    'scripts/e2e-container.ts',
    '--config',
    config,
    ...process.argv.slice(2).filter((arg) => arg !== '--visual')
  ],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
);
writeFileSync(
  resolve(evidence, 'run.log'),
  `${result.stdout}\n${result.stderr}`
);
cpSync(scratch, resolve(evidence, 'artifacts'), { recursive: true });
const after = sourceIdentity();
const unchanged =
  before.revision === after.revision && before.sha256 === after.sha256;
writeFileSync(
  resolve(evidence, 'manifest.json'),
  JSON.stringify(
    {
      ...manifest,
      finishedAt: new Date().toISOString(),
      sourceAfter: after,
      sourceUnchanged: unchanged,
      journeyExitCode: result.status ?? 1,
      exitCode: unchanged ? (result.status ?? 1) : 1
    },
    null,
    2
  )
);
const screenshots = writeEvidenceIndex(
  evidence,
  result.status === 0 && unchanged ? 'passed' : 'failed or source changed'
);
rmSync(scratch, { recursive: true });
assert.ok(existsSync(resolve(evidence, 'index.md')), 'Evidence index missing');
assert.ok(
  result.status !== 0 || screenshots > 0,
  'Successful run has no screenshots'
);
assert.ok(
  existsSync(resolve(evidence, 'artifacts')),
  'Evidence missing after cleanup'
);
console.log(result.stdout, result.stderr);
console.log(`Evidence retained after cleanup: ${evidence}`);
process.exitCode = unchanged ? (result.status ?? 1) : 1;
