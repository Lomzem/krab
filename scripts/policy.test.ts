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
import { join } from 'node:path';
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
  command: string;
  diagnostic: string;
  risk: string;
};
const cases: PolicyCase[] = [
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
    name: 'HTML embedded languages',
    file: 'probe.html',
    valid:
      '<script>const data = "/* text */";</script><style>a { content: "// text"; }</style>',
    invalid:
      '<script>/* comment */const data = "safe";</script><style>/* comment */a { color: red; }</style>',
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'HTML parser leaves script and style as raw text'
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
    command: 'lint',
    diagnostic: 'policy/no-comments',
    risk: 'Configuration parser is absent or confuses strings with comments'
  })),
  {
    name: 'explicit any in maintained UI',
    file: 'src/lib/components/ui/probe.ts',
    valid: 'export type Value = unknown;',
    invalid: 'export type Value = any;',
    command: 'lint',
    diagnostic: '@typescript-eslint/no-explicit-any',
    risk: 'Component overrides disable general policies'
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
    name: 'Svelte shadcn restyling',
    file: 'src/Probe.svelte',
    valid:
      '<script lang="ts">import { Badge } from "#lib/components/ui/badge/index.js";</script><Badge class="mt-4">safe</Badge>',
    invalid:
      '<script lang="ts">import { Badge } from "#lib/components/ui/badge/index.js";</script><Badge class="p-4">safe</Badge>',
    command: 'lint',
    diagnostic: 'shadcn/no-restyle',
    risk: 'Design-system integration does not recognize Svelte markup or project imports'
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
for (const row of cases) {
  for (const [text, expected] of [
    [row.valid, 0],
    [row.invalid, 1]
  ] as const) {
    await writeFile(join(root, row.file), text);
    const result = spawnSync('bun', ['run', row.command], {
      cwd: root,
      encoding: 'utf8'
    });
    const output = result.stdout + result.stderr;
    assert.equal(result.status, expected, `${row.name}: ${output}`);
    if (expected === 1)
      assert.ok(output.includes(row.diagnostic), `${row.name}: ${output}`);
    assert.equal(
      await readFile(join(root, row.file), 'utf8'),
      text,
      `${row.name}: check rewrote input`
    );
    await rm(join(root, row.file));
  }
  console.log(`PASS ${row.name}`);
}
await rm(root, { recursive: true, force: true });
