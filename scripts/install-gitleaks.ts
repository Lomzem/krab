import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  rename,
  writeFile
} from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const checksums: Record<string, string> = {
  linux_x64: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
  linux_arm64:
    'e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080',
  darwin_x64:
    'dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709',
  darwin_arm64:
    'b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5'
};
const platform = `${process.platform}_${process.arch}`;
const checksum = checksums[platform];
assert.ok(checksum, 'Supported platforms: Linux/macOS x64/arm64; tar required');
const response = await fetch(
  `https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_${platform}.tar.gz`
);
assert.ok(response.ok, 'Official Gitleaks download failed');
const archive = Buffer.from(await response.arrayBuffer());
assert.ok(
  createHash('sha256').update(archive).digest('hex') === checksum,
  'Gitleaks checksum mismatch'
);
const root = await mkdtemp(join(tmpdir(), 'krab-gitleaks-install-'));
process.on('exit', () => {
  rmSync(root, { recursive: true, force: true });
});
await writeFile(join(root, 'release.tar.gz'), archive, { mode: 0o600 });
const extracted = spawnSync(
  'tar',
  ['-xzf', join(root, 'release.tar.gz'), '-C', root, 'gitleaks'],
  { stdio: 'ignore' }
);
assert.ok(extracted.status === 0, 'Gitleaks extraction failed');
const binary = join(root, 'gitleaks');
await chmod(binary, 0o755);
const version = spawnSync(binary, ['version'], { encoding: 'utf8' });
assert.ok(
  version.status === 0 && version.stdout.trim() === '8.30.1',
  'Unexpected Gitleaks version'
);
await mkdir('.tools', { recursive: true });
await copyFile(binary, '.tools/gitleaks.pending');
await chmod('.tools/gitleaks.pending', 0o755);
await rename('.tools/gitleaks.pending', '.tools/gitleaks');
console.log('Installed official Gitleaks 8.30.1 (SHA-256 verified)');
