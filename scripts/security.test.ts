import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, symlink, writeFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = process.cwd();
const root = await mkdtemp(join(tmpdir(), 'krab-security-'));
process.on('exit', () => {
  rmSync(root, { recursive: true, force: true });
});
function run(cwd: string, command: string, args: string[]) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return { status: result.status, output: result.stdout + result.stderr };
}
function succeeds(cwd: string, command: string, args: string[]) {
  const result = run(cwd, command, args);
  assert.equal(
    result.status,
    0,
    `${command} operation failed; output withheld`
  );
  return result.output;
}
async function repository(name: string) {
  const cwd = join(root, name);
  await cp(source, cwd, {
    recursive: true,
    filter: (path) =>
      ![
        '.git',
        'node_modules',
        '.svelte-kit',
        'build',
        '.scratch',
        '.tools'
      ].some((part) => path.slice(source.length).split('/').includes(part))
  });
  await symlink(join(source, 'node_modules'), join(cwd, 'node_modules'));
  await symlink(join(source, '.tools'), join(cwd, '.tools'));
  succeeds(cwd, 'git', ['init', '-b', 'main']);
  succeeds(cwd, 'git', ['config', 'user.name', 'Security scenario']);
  succeeds(cwd, 'git', ['config', 'user.email', 'security@example.invalid']);
  return cwd;
}
const lifecycle = await repository('lifecycle');
succeeds(lifecycle, 'bun', ['install', '--frozen-lockfile']);
succeeds(lifecycle, 'git', ['add', '.']);
succeeds(lifecycle, 'git', ['commit', '-m', 'Clean scaffold']);
const head = succeeds(lifecycle, 'git', ['rev-parse', 'HEAD']);
await writeFile(join(lifecycle, 'probe.json'), '{"value":1}');
succeeds(lifecycle, 'git', ['add', 'probe.json']);
const policy = run(lifecycle, 'git', ['commit', '-m', 'Invalid formatting']);
assert.notEqual(
  policy.status,
  0,
  'Installed hook must reject invalid formatting'
);
assert.ok(
  policy.output.includes('probe.json'),
  'Formatting must be the failing guard'
);
assert.equal(succeeds(lifecycle, 'git', ['rev-parse', 'HEAD']), head);
assert.equal(
  await readFile(join(lifecycle, 'probe.json'), 'utf8'),
  '{"value":1}'
);
assert.equal(
  succeeds(lifecycle, 'git', ['show', ':probe.json']),
  '{"value":1}'
);
console.log(
  'PASS installed hook accepts clean commit and blocks policy failure without mutation'
);

succeeds(lifecycle, 'git', ['reset', '--hard', 'HEAD']);
await writeFile(join(lifecycle, 'probe.json'), '{}\n');
const material = ['gh', 'p_', randomBytes(18).toString('hex')].join('');
const content = `Credential marker: ${material}\n`;
await writeFile(join(lifecycle, 'credential.md'), content);
succeeds(lifecycle, 'git', ['add', 'credential.md']);
await writeFile(join(lifecycle, 'credential.md'), 'Clean working copy.\n');
const nativeReport = join(root, 'native-report.json');
const native = run(lifecycle, join(source, '.tools/gitleaks'), [
  'git',
  '--pre-commit',
  '--staged',
  '--redact=100',
  '--no-banner',
  '--report-format=json',
  `--report-path=${nativeReport}`,
  '.'
]);
assert.equal(
  native.status,
  1,
  'Native staged scan must find synthetic credential'
);
const raw = await readFile(nativeReport, 'utf8');
assert.ok(raw.includes('REDACTED'), 'Native report must contain redaction');
assert.ok(
  ![raw, native.output].some(
    (text) => text.includes(material) || text.includes(material.slice(-12))
  ),
  'Native diagnostics/report exposed synthetic material'
);
const staged = run(lifecycle, 'git', [
  'commit',
  '-m',
  'Blocked staged credential'
]);
assert.notEqual(
  staged.status,
  0,
  'Hook must block a secret in the index despite clean working copy'
);
const diagnostic = JSON.stringify({
  path: 'credential.md',
  line: 1,
  rule: 'github-pat'
});
assert.ok(
  staged.output.includes(diagnostic),
  'Hook must fail at the secret guard with path/line/rule'
);
assert.ok(
  !staged.output.includes(material) &&
    !staged.output.includes(material.slice(-12)) &&
    !staged.output.includes('Credential marker:'),
  'Hook exposed synthetic content'
);
assert.equal(succeeds(lifecycle, 'git', ['rev-parse', 'HEAD']), head);
assert.ok(
  succeeds(lifecycle, 'git', ['show', ':credential.md']) === content,
  'Hook changed index'
);
assert.ok(
  (await readFile(join(lifecycle, 'credential.md'), 'utf8')) ===
    'Clean working copy.\n',
  'Hook changed worktree'
);
console.log(
  'PASS staged secret blocks commit despite clean working copy; native and hook diagnostics redact material'
);

const history = await repository('history');
succeeds(history, 'git', ['add', '.']);
succeeds(history, 'git', [
  'commit',
  '-m',
  'Clean fixture before hook activation'
]);
succeeds(history, 'git', ['switch', '-c', 'archive']);
const historicalMaterial = ['gh', 'p_', randomBytes(18).toString('hex')].join(
  ''
);
await writeFile(join(history, 'historical.md'), `${historicalMaterial}\n`);
succeeds(history, 'git', ['add', 'historical.md']);
succeeds(history, 'git', ['commit', '-m', 'Synthetic historical fixture']);
succeeds(history, 'git', ['rm', 'historical.md']);
succeeds(history, 'git', ['commit', '-m', 'Remove synthetic fixture']);
succeeds(history, 'git', ['switch', 'main']);
const currentTree = succeeds(history, 'git', [
  'ls-tree',
  '-r',
  '--name-only',
  'HEAD'
]);
assert.ok(!currentTree.includes('historical.md'), 'Current tree must be clean');
const historical = run(history, 'bun', ['run', 'secrets:history']);
assert.equal(
  historical.status,
  1,
  'Full history scan must reach older commits on other refs'
);
assert.ok(
  historical.output.includes(
    JSON.stringify({ path: 'historical.md', line: 1, rule: 'github-pat' })
  ),
  'History scan must report only path/line/rule'
);
assert.ok(
  !historical.output.includes(historicalMaterial) &&
    !historical.output.includes(historicalMaterial.slice(-12)),
  'History output exposed synthetic material'
);
console.log(
  'PASS history scan finds removed synthetic material on another branch with redacted diagnostics'
);
