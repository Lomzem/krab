#!/usr/bin/env bun
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  readlinkSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from 'node:fs';
import { join, relative } from 'node:path';

export const sourceIdentity = () => {
  const git = (args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8' });
  const files = git([
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z'
  ])
    .split('\0')
    .filter(Boolean)
    .sort();
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file + '\0');
    let content: string | Buffer = '<deleted>';
    if (existsSync(file)) {
      content = lstatSync(file).isSymbolicLink()
        ? readlinkSync(file)
        : readFileSync(file);
    }
    hash.update(content);
    hash.update('\0');
  }
  return {
    revision: git(['rev-parse', 'HEAD']).trim(),
    dirty: git(['status', '--porcelain']).length > 0,
    sha256: hash.digest('hex')
  };
};

const filesUnder = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });

const link = (root: string, path: string) => {
  const name = relative(root, path);
  return `[${name.replaceAll('[', '\\[').replaceAll(']', '\\]')}](${name.split('/').map(encodeURIComponent).join('/')})`;
};

export const writeEvidenceIndex = (root: string, status: string) => {
  const files = filesUnder(root).sort();
  const images = files.filter((path) => path.endsWith('.png'));
  const other = files.filter(
    (path) =>
      !/\.(png|aria\.txt|state\.json)$/.test(path) &&
      !path.endsWith('/index.md')
  );
  writeFileSync(
    join(root, 'index.md'),
    [
      '# Krab review evidence',
      '',
      `Execution: **${status}**. Screenshots captured: ${String(images.length)}. Visual inspection: **pending**.`,
      '',
      'Read manifest.json for source identity and artifacts/results.json for per-journey results. A passing run does not establish visual quality or accessibility compliance. Open images at native size using an image-capable tool; this index alone is not visual inspection.',
      '',
      'Each manual image has matching .aria.txt and .state.json files beside it. Failure screenshots may have no companions.',
      '',
      '## Screenshots',
      '',
      ...images.map((path) => `- ${link(root, path)}`),
      '',
      '## Logs, persisted state and attribution',
      '',
      ...other.map((path) => `- ${link(root, path)}`),
      ''
    ].join('\n')
  );
  return images.length;
};
