import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

function fail(): never {
  console.error(
    'Secret scan could not complete. Run bun run setup:security and verify Git history is available.'
  );
  process.exit(2);
}
const mode = process.argv[2];
if (mode !== 'staged' && mode !== 'history') fail();
const binary = resolve('.tools/gitleaks');
const version = spawnSync(binary, ['version'], { encoding: 'utf8' });
if (version.status !== 0 || version.stdout.trim() !== '8.30.1') fail();
if (mode === 'history') {
  const shallow = spawnSync('git', ['rev-parse', '--is-shallow-repository'], {
    encoding: 'utf8'
  });
  if (shallow.status !== 0 || shallow.stdout.trim() !== 'false') fail();
}
const root = mkdtempSync(join(tmpdir(), 'krab-secrets-'));
process.on('exit', () => {
  rmSync(root, { recursive: true, force: true });
});
const report = join(root, 'report.json');
const scope =
  mode === 'staged' ? ['--pre-commit', '--staged'] : ['--log-opts=--all'];
const result = spawnSync(
  binary,
  [
    'git',
    ...scope,
    '--redact=100',
    '--no-banner',
    '--report-format=json',
    `--report-path=${report}`,
    '.'
  ],
  { stdio: 'ignore' }
);
if (result.status !== 0 && result.status !== 1) fail();
const findings: unknown = JSON.parse(readFileSync(report, 'utf8'));
if (!Array.isArray(findings)) fail();
for (const finding of findings as unknown[]) {
  if (
    typeof finding !== 'object' ||
    finding === null ||
    !('File' in finding) ||
    !('StartLine' in finding) ||
    !('RuleID' in finding)
  )
    fail();
  if (
    typeof finding.File !== 'string' ||
    typeof finding.StartLine !== 'number' ||
    typeof finding.RuleID !== 'string'
  )
    fail();
  console.error(
    JSON.stringify({
      path: finding.File,
      line: finding.StartLine,
      rule: finding.RuleID
    })
  );
}
process.exit(result.status === 0 && findings.length === 0 ? 0 : 1);
