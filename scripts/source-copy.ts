import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { cp } from 'node:fs/promises';
import { dirname, relative } from 'node:path';

const sourcePaths = (source: string) => {
  const listed = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: source, encoding: 'utf8' }
  );
  assert.equal(listed.status, 0, `git ls-files: ${listed.stderr}`);
  const kept = new Set<string>(['']);
  for (const file of listed.stdout.split('\0').filter(Boolean)) {
    for (let path = file; !kept.has(path);) {
      kept.add(path);
      const parent = dirname(path);
      path = parent === '.' ? '' : parent;
    }
  }
  return kept;
};

export const copySource = async (source: string, destination: string) => {
  const kept = sourcePaths(source);
  await cp(source, destination, {
    recursive: true,
    filter: (path) => kept.has(relative(source, path))
  });
};
