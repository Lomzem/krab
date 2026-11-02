import { readdir, readFile } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';
import { parse as parseHtml, type DefaultTreeAdapterMap } from 'parse5';
import { parse as parseCss } from 'css-tree';
import { parseForESLint as parseJson } from 'jsonc-eslint-parser';
import { parseForESLint as parseYaml } from 'yaml-eslint-parser';
import { parseForESLint as parseToml } from 'toml-eslint-parser';
import * as tsParser from '@typescript-eslint/parser';
import {
  parseForESLint as parseSvelte,
  traverseNodes
} from 'svelte-eslint-parser';

type Position = { line: number; column: number };
const excluded = new Set([
  '.git',
  'node_modules',
  '.svelte-kit',
  'build',
  '.scratch'
]);
let failures = 0;
function report(file: string, position: Position) {
  console.error(
    `${file}:${String(position.line)}:${String(position.column)} policy/no-comments Comments are forbidden.`
  );
  failures += 1;
}
function css(text: string, file: string, line = 0) {
  parseCss(text, {
    positions: true,
    filename: file,
    line: line + 1,
    onComment: (_value, location) => {
      report(file, location.start);
    }
  });
}
function script(text: string, file: string, line = 0) {
  const ast = tsParser.parse(text, {
    comment: true,
    loc: true,
    sourceType: 'module'
  });
  for (const token of ast.comments) {
    report(file, {
      line: token.loc.start.line + line,
      column: token.loc.start.column + 1
    });
  }
}
function htmlNode(node: DefaultTreeAdapterMap['node'], file: string) {
  if (node.nodeName === '#comment') {
    report(file, {
      line: node.sourceCodeLocation?.startLine ?? 1,
      column: node.sourceCodeLocation?.startCol ?? 1
    });
  }
  if (
    'tagName' in node &&
    (node.tagName === 'script' || node.tagName === 'style')
  ) {
    const text = node.childNodes
      .filter((child) => child.nodeName === '#text')
      .map((child) => ('value' in child ? child.value : ''))
      .join('');
    const line = (node.sourceCodeLocation?.startTag?.endLine ?? 1) - 1;
    if (node.tagName === 'script') script(text, file, line);
    else css(text, file, line);
  }
  if ('childNodes' in node)
    node.childNodes.forEach((child) => {
      htmlNode(child, file);
    });
  if ('content' in node) htmlNode(node.content, file);
}
function configurationAst(text: string, extension: string) {
  if (['.json', '.jsonc', '.webmanifest'].includes(extension))
    return parseJson(text).ast;
  if (['.yaml', '.yml'].includes(extension)) return parseYaml(text).ast;
  if (extension === '.toml') return parseToml(text).ast;
  return undefined;
}
async function check(file: string) {
  const extension = extname(file);
  if (
    ![
      '.js',
      '.mjs',
      '.cjs',
      '.ts',
      '.mts',
      '.cts',
      '.css',
      '.html',
      '.svg',
      '.svelte',
      '.json',
      '.jsonc',
      '.webmanifest',
      '.yaml',
      '.yml',
      '.toml'
    ].includes(extension) &&
    !basename(file).endsWith('ignore')
  )
    return;
  const text = await readFile(file, 'utf8');
  if (['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts'].includes(extension))
    script(text, file);
  if (extension === '.css') css(text, file);
  if (['.html', '.svg'].includes(extension))
    htmlNode(parseHtml(text, { sourceCodeLocationInfo: true }), file);
  if (extension === '.svelte') {
    const { ast } = parseSvelte(text, {
      parser: tsParser,
      loc: true,
      range: true
    });
    for (const token of ast.comments)
      report(file, {
        line: token.loc.start.line,
        column: token.loc.start.column + 1
      });
    traverseNodes(ast, {
      enterNode(node) {
        if (node.type === 'SvelteHTMLComment')
          report(file, {
            line: node.loc.start.line,
            column: node.loc.start.column + 1
          });
        if (node.type === 'SvelteStyleElement')
          css(
            text.slice(node.startTag.range[1], node.endTag?.range[0]),
            file,
            node.startTag.loc.end.line - 1
          );
      },
      leaveNode() {}
    });
  }
  const ast = configurationAst(text, extension);
  for (const token of ast?.comments ?? []) {
    report(file, {
      line: token.loc?.start.line ?? 1,
      column: (token.loc?.start.column ?? 0) + 1
    });
  }
  if (basename(file).endsWith('ignore')) {
    const lines = text.split('\n');
    for (const [index, line] of lines.entries()) {
      if (line.startsWith('#')) report(file, { line: index + 1, column: 1 });
    }
  }
}
async function walk(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.isFile()) await check(file);
  }
}
await walk('.');
if (failures > 0) process.exitCode = 1;
