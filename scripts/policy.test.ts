import { strict as assert } from 'node:assert';
import {
  mkdtemp,
  cp,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = await mkdtemp(join(tmpdir(), 'krab-policy-'));
process.on('exit', () => {
  rmSync(root, { recursive: true, force: true });
});
const source = process.cwd();
type PolicyCase = {
  name: string;
  file: string;
  valid: string;
  invalid: string;
  command: 'lint' | 'check' | 'format:check';
  diagnostic: string;
  risk: string;
};
const lockfile = await readFile(join(source, 'bun.lock'), 'utf8');
const cases: PolicyCase[] = [
  {
    name: 'HTML inert data versus typed executable script',
    file: 'probe.html',
    valid:
      '<script type="text/plain">This is data: https://example.invalid/*data*/</script>',
    invalid:
      '<script type="text/javascript; charset=utf-8">/* forbidden */const data = "safe";</script>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Unknown data types are parsed as JavaScript or executable MIME types escape checking'
  },
  {
    name: 'HTML JSON data script',
    file: 'probe.html',
    valid:
      '<script type="application/json">{"url":"https://example.invalid/*data*/"}</script>',
    invalid:
      '<script type="application/json">{/* forbidden */"url":"safe"}</script>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Plain JSON data misses the structured data parser'
  },
  {
    name: 'HTML JSON-LD data script',
    file: 'probe.html',
    valid:
      '<script type="application/ld+json">{"url":"https://example.invalid/*data*/"}</script>',
    invalid:
      '<script type="application/ld+json">{/* forbidden */"url":"safe"}</script>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'JSON data is parsed as JavaScript or exempted from comment checking'
  },
  {
    name: 'maintained Bun JSONC lockfile',
    file: 'bun.lock',
    valid: lockfile,
    invalid: '// forbidden\n' + lockfile,
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Maintained text lockfile is excluded as generated output'
  },
  {
    name: 'Svelte style directive CSS',
    file: 'src/Probe.svelte',
    valid: `<script lang="ts">const color = 'red'; const data = '/* data */';</script><p style:color={color} style:--data="'{data}https://example.invalid/*data*/'">safe</p>`,
    invalid: '<p style:color="/* forbidden */ red">safe</p>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Style directives escape inline CSS checking'
  },
  {
    name: 'Svelte inline CSS with expressions',
    file: 'src/Probe.svelte',
    valid: `<script lang="ts">const color = 'red'; const data = '/* data */';</script><p style="color: {color}; --data: '{data}https://example.invalid/*data*/'">safe</p>`,
    invalid: '<p style="color: /* forbidden */ red">safe</p>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Svelte inline declarations bypass CSS checking or expressions become CSS'
  },
  {
    name: 'HTML inline CSS',
    file: 'probe.html',
    valid: `<p style="--data: 'https://example.invalid/*data*/'; color: red">safe</p>`,
    invalid: '<p style="color: /* forbidden */ red">safe</p>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'HTML style attributes escape stylesheet inspection'
  },
  {
    name: 'HTML embedded CSS',
    file: 'probe.html',
    valid: '<style>a { content: "https://example.invalid/*data*/"; }</style>',
    invalid: '<style>/* comment */a { color: red; }</style>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'HTML parser leaves stylesheets as raw text'
  },
  {
    name: 'standalone CSS',
    file: 'probe.css',
    valid: 'a { background: url("https://example.invalid/a"); }',
    invalid: 'a { color: /* comment */red; }',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Only component styles are inspected'
  },
  {
    name: 'script comments cannot disable ESLint',
    file: 'src/probe.ts',
    valid: 'export const url = "https://example.invalid/*data*/";\n',
    invalid: '// eslint-disable\nexport const url = "safe";\n',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Inline configuration or missing script rule permits comments'
  },
  {
    name: 'tooling JavaScript comments',
    file: 'probe.js',
    valid: 'export const data = "/* string */";\n',
    invalid: '/* comment */\nexport const data = "safe";\n',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Only application TypeScript is covered'
  },
  {
    name: 'Svelte script directives',
    file: 'src/Probe.svelte',
    valid: '<script lang="ts">const data = "// text";</script><p>{data}</p>',
    invalid:
      '<script lang="ts">// @ts-nocheck\nconst data = "safe";</script><p>{data}</p>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Embedded script comments or type suppressions bypass policy'
  },
  {
    name: 'Svelte markup suppressions',
    file: 'src/Probe.svelte',
    valid: '<p data-text="&lt;!-- data --&gt;">safe</p>',
    invalid:
      '<!-- svelte-ignore a11y_no_static_element_interactions --><p>safe</p>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Svelte processor consumes comments before reporting'
  },
  {
    name: 'Svelte embedded CSS',
    file: 'src/Probe.svelte',
    valid: '<p>safe</p><style>p::after { content: "/* text */"; }</style>',
    invalid: '<p>safe</p><style>/* comment */p { color: red; }</style>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Markup parser treats stylesheet contents as raw text'
  },
  {
    name: 'HTML markup',
    file: 'probe.html',
    valid: '<p data-url="https://example.invalid/">safe</p>',
    invalid: '<!-- comment --><p>safe</p>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'App shell falls outside Svelte linting'
  },
  {
    name: 'HTML executable script',
    file: 'probe.html',
    valid: '<script>const data = "https://example.invalid/*text*/";</script>',
    invalid: '<script>/* comment */const data = "safe";</script>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'HTML parser leaves executable scripts as raw text'
  },
  ...[
    [
      'JSON configuration',
      'probe.json',
      '{"url":"https://example.invalid/"}',
      '{/* comment */"url":"safe"}'
    ],
    [
      'YAML configuration',
      'probe.yaml',
      'url: "https://example.invalid/#data"',
      '# comment\nurl: safe'
    ],
    [
      'TOML configuration',
      'probe.toml',
      'url = "https://example.invalid/#data"',
      '# comment\nurl = "safe"'
    ],
    [
      'ignore configuration',
      '.probeignore',
      '\\#literal\nhttps://example.invalid/',
      '# comment\n/build/'
    ]
  ].map(([name = '', file = '', valid = '', invalid = '']) => ({
    name,
    file,
    valid,
    invalid,
    command: 'lint' as const,
    diagnostic: 'policy/no-comments',
    risk: 'Configuration parser is absent or confuses strings with comments'
  })),
  {
    name: 'explicit any in an application feature',
    file: 'src/lib/features/on-water/probe.ts',
    valid: 'export type Value = unknown;',
    invalid: 'export type Value = any;',
    command: 'lint',
    diagnostic: '@typescript-eslint/no-explicit-any',
    risk: 'Application features escape the explicit-any policy'
  },
  {
    name: 'implicit any',
    file: 'src/probe.ts',
    valid: 'export const identity = (value: unknown) => value;',
    invalid: 'export const identity = (value) => value;',
    command: 'check',
    diagnostic: "implicitly has an 'any' type",
    risk: 'Whole-project strict TypeScript checking is disabled'
  },
  {
    name: 'unsafe dependency values in Svelte',
    file: 'src/Probe.svelte',
    valid:
      '<script lang="ts">const data: unknown = JSON.parse("null");</script><p>{String(data)}</p>',
    invalid:
      '<script lang="ts">const data = JSON.parse("null");</script><p>{String(data)}</p>',
    command: 'lint',
    diagnostic: '@typescript-eslint/no-unsafe-assignment',
    risk: 'Svelte script parser loses project type information'
  },
  {
    name: 'throw syntax versus Effect failure',
    file: 'src/probe.ts',
    valid:
      'import { Effect } from "effect"; export const result = Effect.fail("unavailable");',
    invalid:
      'export function fail(): never { throw new Error("unavailable"); }',
    command: 'lint',
    diagnostic: 'no-restricted-syntax',
    risk: 'Throw syntax is allowed or Effect APIs are incorrectly forbidden'
  },
  {
    name: 'try syntax versus Effect try and catch',
    file: 'src/probe.ts',
    valid:
      'import { Effect } from "effect"; export const result = Effect.try({ try: () => JSON.parse("null") as unknown, catch: () => "invalid" }).pipe(Effect.catch(() => Effect.succeed(null)));',
    invalid:
      'export function parse(): unknown { try { return JSON.parse("null"); } catch { return null; } }',
    command: 'lint',
    diagnostic: 'no-restricted-syntax',
    risk: 'Syntax selector is missing or rejects legitimate Effect handling'
  },
  {
    name: 'throw syntax in end-to-end tests',
    file: 'e2e/probe.test.ts',
    valid:
      'export const fail = () => Promise.reject(new Error("unavailable"));',
    invalid:
      'export function fail(): never { throw new Error("unavailable"); }',
    command: 'lint',
    diagnostic: 'Use Effect failure APIs instead of throw',
    risk: 'The end-to-end import rule replaces the inherited syntax restrictions'
  },
  {
    name: 'dynamic Playwright import versus the providers fixture',
    file: 'e2e/probe.test.ts',
    valid:
      'import { expect } from "@playwright/test"; export const load = () => import("./fixtures"); export { expect };',
    invalid: 'export const load = () => import("@playwright/test");',
    command: 'lint',
    diagnostic: "Import test from './fixtures'",
    risk: 'A dynamic import skips the NOAA and OpenFreeMap fixture, or the fixture and expect are refused'
  },
  {
    name: 'code depth boundary',
    file: 'src/probe.ts',
    valid:
      'export function depth(n: number) { if (n > 0) { if (n > 1) { if (n > 2) { return n; } } } return 0; }',
    invalid:
      'export function depth(n: number) { if (n > 0) { if (n > 1) { if (n > 2) { if (n > 3) { return n; } } } } return 0; }',
    command: 'lint',
    diagnostic: 'max-depth',
    risk: 'Depth threshold is absent or off by one'
  },
  {
    name: 'callback depth boundary',
    file: 'src/probe.ts',
    valid: 'export const result = [1].map(a => [2].map(b => a + b));',
    invalid:
      'export const result = [1].map(a => [2].map(b => [3].map(c => a + b + c)));',
    command: 'lint',
    diagnostic: 'max-nested-callbacks',
    risk: 'Callback threshold is absent or off by one'
  },
  {
    name: 'nested ternaries',
    file: 'src/probe.ts',
    valid: 'export const choose = (a: boolean) => a ? 1 : 0;',
    invalid:
      'export const choose = (a: boolean, b: boolean) => a ? 1 : b ? 2 : 0;',
    command: 'lint',
    diagnostic: 'no-nested-ternary',
    risk: 'Requested branching rule is missing'
  },
  {
    name: 'non-mutating formatting',
    file: 'probe.json',
    valid: '{\n  "value": 1\n}\n',
    invalid: '{"value":1}',
    command: 'format:check',
    diagnostic: 'probe.json',
    risk: 'Formatting check accepts unformatted files'
  }
];
await cp(source, root, {
  recursive: true,
  filter: (path) =>
    !['.git', 'node_modules', '.svelte-kit', 'build', '.scratch'].some((part) =>
      path.slice(source.length).split('/').includes(part)
    )
});
await symlink(join(source, 'node_modules'), join(root, 'node_modules'));
const fixtures = cases.map((row, index) => ({
  ...row,
  file:
    row.file === 'bun.lock'
      ? row.file
      : join(dirname(row.file), `policy-${String(index)}-${basename(row.file)}`)
}));
const batches = [
  fixtures.filter((row) => row.diagnostic === 'policy/no-comments'),
  fixtures.filter(
    (row) => row.command === 'lint' && row.diagnostic !== 'policy/no-comments'
  ),
  fixtures.filter((row) => row.command === 'check'),
  fixtures.filter((row) => row.command === 'format:check')
];
function diagnosticFor(row: PolicyCase, output: string) {
  if (row.command !== 'lint') return output;
  if (row.diagnostic === 'policy/no-comments')
    return output.split('\n').find((line) => line.startsWith(`${row.file}:`));
  return output
    .split('\n\n')
    .find((block) => block.includes(join(root, row.file)));
}
for (const batch of batches) {
  const first = batch[0];
  assert.ok(first, 'Every policy command must have fixtures');
  for (const [variant, expected] of [
    ['valid', 0],
    ['invalid', 1]
  ] as const) {
    for (const row of batch)
      await writeFile(join(root, row.file), row[variant]);
    const result = spawnSync('bun', ['run', first.command], {
      cwd: root,
      encoding: 'utf8'
    });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, expected, `${first.command}: ${output}`);
    for (const row of batch) {
      assert.ok(
        expected === 0 || diagnosticFor(row, output)?.includes(row.diagnostic),
        `${row.name}: missing file-specific diagnostic: ${output}`
      );
      assert.equal(
        await readFile(join(root, row.file), 'utf8'),
        row[variant],
        `${row.name}: check rewrote input`
      );
    }
  }
  for (const row of batch) {
    if (row.file === 'bun.lock')
      await writeFile(join(root, row.file), lockfile);
    else await rm(join(root, row.file));
    console.log(`PASS ${row.name}`);
  }
}
await rm(root, { recursive: true, force: true });
