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
const workflow = (job: string) =>
  `on: push\njobs:\n  a:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    steps:\n      - run: true\n  b:\n    runs-on: ubuntu-24.04\n${job}    steps:\n      - run: true\n`;
const cases: PolicyCase[] = [
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
    name: 'UI copy word limit in Svelte markup',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      '<script lang="ts">const count = 1;</script><p class="px-4 text-[16px] text-muted-foreground">{count} in the <strong>water</strong></p><button aria-label="One more kept">+</button>',
    invalid: '<p>Leave both empty if nothing counted</p>',
    command: 'lint',
    diagnostic: 'the limit is 5',
    risk: 'Long explanatory copy reaches the screen'
  },
  {
    name: 'UI copy word limit in feature TypeScript',
    file: 'src/lib/features/on-water/probe.ts',
    valid:
      'export const undo = (name: string) => `Couldn\'t undo, ${name} is gone`;\nexport const failure = new Error("Storage refused the write. Retry the transaction later.");\nexport const style = "min-h-12 w-full rounded-control border px-3";',
    invalid: 'export const hint = "Saving gives it the next pot number";',
    command: 'lint',
    diagnostic: 'the limit is 5',
    risk: 'Script strings that reach the screen escape the copy check, or developer errors and class lists are flagged'
  },
  {
    name: 'UI copy word limit in hyphenated Svelte text',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      '<script lang="ts">const style = "min-h-12 w-full rounded-control border px-3";</script><p class={style}>day-one trip ready</p>',
    invalid: '<p>day-one trip is ready for the water today</p>',
    command: 'lint',
    diagnostic: 'the limit is 5',
    risk: 'Markup text with hyphenated words passes as a class list, or script class lists are flagged'
  },
  {
    name: 'UI copy word limit in Svelte expressions',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      "<script lang=\"ts\">let { mode, labels, pick }: { mode: string; labels: Record<string, string>; pick: (query: string) => string } = $props();</script><button aria-label={mode === 'day-one trip is ready for the water today' ? 'Drop' : 'Wait'} title={labels['day-one trip is ready for the water today']} class={mode ? 'min-h-12 w-full rounded-control border px-3' : 'px-3'}>{pick('[data-pot=\"saving gives it the next number\"]')}</button>",
    invalid:
      "<script lang=\"ts\">let { ready }: { ready: boolean } = $props();</script><button aria-label={ready ? 'day-one trip is ready for the water today' : 'Drop'}>Drop</button>",
    command: 'lint',
    diagnostic: 'the limit is 5',
    risk: 'Copy chosen in an attribute expression passes as a class list, or tests, keys, arguments and class expressions are flagged'
  },
  {
    name: 'UI copy second person in Svelte expressions with symbols',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      "<script lang=\"ts\">let { ready }: { ready: boolean } = $props();</script><p title={ready ? 'Depth = 0' : 'Depth'}>{ready || 'Depth = 0'}</p>",
    invalid:
      "<script lang=\"ts\">let { ready }: { ready: boolean } = $props();</script><p aria-label={ready ? 'Check your depth = 0' : 'Depth'}>Depth</p>",
    command: 'lint',
    diagnostic: 'you or your',
    risk: 'Symbols in attribute expression copy skip the copy check'
  },
  {
    name: 'UI copy word limit in Svelte text expressions',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      "<script lang=\"ts\">let { ready }: { ready: boolean } = $props();</script><p>{ready ? 'day-one trip ready' : 'Wait'}</p>",
    invalid:
      "<script lang=\"ts\">let { ready }: { ready: boolean } = $props();</script><p>{ready ? 'day-one trip is ready for the water today' : 'Wait'}</p>",
    command: 'lint',
    diagnostic: 'the limit is 5',
    risk: 'Copy chosen in a text expression passes as a class list'
  },
  {
    name: 'UI copy word limit beside Svelte style directives',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      "<script lang=\"ts\">let { ready }: { ready: boolean } = $props();</script><div style:grid-template-columns={ready ? '[a] 1fr [b] 1fr [c] 1fr [d]' : '1fr'} style:grid-template-rows=\"{ready ? '[a] 1fr [b] 1fr [c] 1fr [d]' : '1fr'}\">{ready ? 'Depth' : 'Wait'}</div>",
    invalid:
      "<script lang=\"ts\">let { ready }: { ready: boolean } = $props();</script><div style:grid-template-columns={ready ? '[a] 1fr [b] 1fr [c] 1fr [d]' : '1fr'}>{ready ? 'day-one trip is ready for the water today' : 'Wait'}</div>",
    command: 'lint',
    diagnostic: 'the limit is 5',
    risk: 'CSS values in style directives are read as screen copy, or copy beside them is missed'
  },
  {
    name: 'UI copy word limit in mixed Svelte attributes',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      "<script lang=\"ts\">let { ready, count }: { ready: boolean; count: number } = $props();</script><button aria-label=\"Delete {ready ? 'trip' : 'day'} and all drops\" title=\"Pot {count}{ready ? 'a' : 'b'} kept here today\">Delete</button>",
    invalid:
      '<script lang="ts">let { ready }: { ready: boolean } = $props();</script><button aria-label="Delete {ready ? \'this trip\' : \'trip\'} and all drops">Delete</button>',
    command: 'lint',
    diagnostic: 'the limit is 5',
    risk: 'A label mixing text and chosen strings exceeds the limit while each part passes, or joined parts count twice'
  },
  {
    name: 'UI copy word limit in mixed Svelte text',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      "<script lang=\"ts\">let { ready, count }: { ready: boolean; count: number } = $props();</script><p>Delete {ready ? 'trip' : 'day'} and all drops</p><p>Pot {count}{ready ? 'a' : 'b'} kept here today</p>",
    invalid:
      '<script lang="ts">let { ready }: { ready: boolean } = $props();</script><p>Delete {ready && \'this trip\'} and all drops</p>',
    command: 'lint',
    diagnostic: 'the limit is 5',
    risk: 'Text mixing markup and chosen strings exceeds the limit while each part passes, or joined parts count twice'
  },
  {
    name: 'UI copy word limit across several chosen strings',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      "<script lang=\"ts\">let { a, b }: { a: boolean; b: boolean } = $props();</script><button aria-label=\"one two three{a ? 'A' : ' A'}{b ? 'B' : ' B'}\">Drop</button>",
    invalid:
      "<script lang=\"ts\">let { a, b }: { a: boolean; b: boolean } = $props();</script><button aria-label=\"one two three four{a ? 'A' : ' A'}{b ? 'B' : ' B'}\">Drop</button>",
    command: 'lint',
    diagnostic: 'has 6 words',
    risk: 'Only one choice at a time is varied, so copy that is too long only when several choices split words passes'
  },
  {
    name: 'UI copy punctuation across chosen strings',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      "<script lang=\"ts\">let { a, b }: { a: boolean; b: boolean } = $props();</script><p>{a ? 'v1.2' : 'v1'} {b ? 'Ready?' : 'Set'}</p>",
    invalid:
      "<script lang=\"ts\">let { a, b }: { a: boolean; b: boolean } = $props();</script><p>{a ? 'Saved' : 'Saved.'}{b ? 'x' : ' x'}</p>",
    command: 'lint',
    diagnostic: 'sentence punctuation',
    risk: 'A stop from one choice and a space from another form a sentence only together'
  },
  {
    name: 'UI copy word limit in asserted feature TypeScript',
    file: 'src/lib/features/on-water/probe.ts',
    valid:
      'export type Hint = "Saving gives it the next pot number";\nexport const hint = "Next pot" as const;\nexport const style = "min-h-12 w-full rounded-control border px-3" as const;\nexport const query = \'[data-pot="saving gives it the next number"]\' satisfies string;',
    invalid:
      'export const hint = "Saving gives it the next pot number" as const;',
    command: 'lint',
    diagnostic: 'the limit is 5',
    risk: 'Runtime strings under a TypeScript assertion escape the copy check, or type-only literals and selectors are flagged'
  },
  {
    name: 'UI copy sentence punctuation',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<h2>Delete this trip?</h2>',
    invalid: '<p>Position ready.</p>',
    command: 'lint',
    diagnostic: 'sentence punctuation',
    risk: 'Copy is written as sentences, or a closing question mark is refused'
  },
  {
    name: 'UI copy second person',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<p>Finding position</p>',
    invalid: '<p>Finding your position</p>',
    command: 'lint',
    diagnostic: 'you or your',
    risk: 'Copy addresses the reader'
  },
  {
    name: 'UI copy second person in Svelte text with symbols',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<p>Depth = 0</p>',
    invalid: '<p>Check your depth = 0</p>',
    command: 'lint',
    diagnostic: 'you or your',
    risk: 'Symbols in markup text skip the copy check'
  },
  {
    name: 'UI copy second person in attribute with symbols',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<p title="Depth = 0">Depth</p>',
    invalid: '<p title="Check your depth = 0">Depth</p>',
    command: 'lint',
    diagnostic: 'you or your',
    risk: 'Symbols in copy attributes skip the copy check'
  },
  {
    name: 'UI copy em and en dashes',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<p title="Pot 3, Day 1">Pot 3</p>',
    invalid: '<p title="Pot 3 — Day 1">Pot 3</p>',
    command: 'lint',
    diagnostic: 'em or en dash',
    risk: 'Dashes join phrases into sentences in attribute copy'
  },
  {
    name: 'CI job without a time limit',
    file: '.github/workflows/ci.yml',
    valid: workflow('    timeout-minutes: 5\n'),
    invalid: workflow(''),
    command: 'lint',
    diagnostic: 'Job b must set timeout-minutes to at most 5',
    risk: 'A new job runs on the 6-hour GitHub default'
  },
  {
    name: 'CI job over the 5-minute limit',
    file: '.github/workflows/ci.yml',
    valid: workflow('    timeout-minutes: 4\n'),
    invalid: workflow('    timeout-minutes: 6\n'),
    command: 'lint',
    diagnostic: 'Job b must set timeout-minutes to at most 5',
    risk: 'A slow job raises its own limit instead of splitting'
  },
  {
    name: 'CI job that waits for another job',
    file: '.github/workflows/ci.yml',
    valid: workflow('    timeout-minutes: 5\n'),
    invalid: workflow('    timeout-minutes: 5\n    needs: a\n'),
    command: 'lint',
    diagnostic: 'Job b waits for another job',
    risk: 'Chained jobs add their limits past 5 minutes'
  },
  {
    name: 'CI job queued behind a concurrency group',
    file: '.github/workflows/ci.yml',
    valid: workflow('    timeout-minutes: 5\n'),
    invalid: workflow('    timeout-minutes: 5\n    concurrency: shared\n'),
    command: 'lint',
    diagnostic: 'Job b waits for another job',
    risk: 'Jobs in one group run one after another'
  },
  {
    name: 'CI matrix that limits parallel jobs',
    file: '.github/workflows/ci.yml',
    valid: workflow('    timeout-minutes: 5\n'),
    invalid: workflow(
      '    timeout-minutes: 5\n    strategy:\n      max-parallel: 1\n      matrix:\n        shard: [1, 2]\n'
    ),
    command: 'lint',
    diagnostic: 'Job b waits for another job',
    risk: 'Matrix shards run one after another'
  },
  {
    name: 'CI matrix that limits parallel jobs through an alias',
    file: '.github/workflows/ci.yml',
    valid: workflow('    timeout-minutes: 5\n'),
    invalid: `on: push\njobs:\n  a:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    strategy: &serial\n      max-parallel: 1\n      matrix:\n        shard: [1, 2]\n    steps:\n      - run: true\n  b:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    strategy: *serial\n    steps:\n      - run: true\n`,
    command: 'lint',
    diagnostic: 'Job b waits for another job',
    risk: 'An aliased strategy hides max-parallel from the rule'
  },
  {
    name: 'non-mutating formatting',
    file: 'probe.json',
    valid: '{\n  "value": 1\n}\n',
    invalid: '{"value":1}',
    command: 'format:check',
    diagnostic: 'probe.json',
    risk: 'Formatting check accepts unformatted files'
  },
  {
    name: 'Tailwind class order in cn calls with a theme class',
    file: 'src/Probe.svelte',
    valid:
      '<script lang="ts">\n  const style = cn(\'flex bg-map-sea\');\n</script>\n\n<p class={style}>Pot</p>\n',
    invalid:
      '<script lang="ts">\n  const style = cn(\'bg-map-sea flex\');\n</script>\n\n<p class={style}>Pot</p>\n',
    command: 'format:check',
    diagnostic: 'Probe.svelte',
    risk: 'Class sorting skips cn calls or misses the theme stylesheet'
  },
  {
    name: 'Tailwind class order in tv calls with a theme class',
    file: 'src/Probe.svelte',
    valid:
      '<script lang="ts">\n  const button = tv({ base: \'flex bg-map-sea\' });\n</script>\n\n<p class={button()}>Pot</p>\n',
    invalid:
      '<script lang="ts">\n  const button = tv({ base: \'bg-map-sea flex\' });\n</script>\n\n<p class={button()}>Pot</p>\n',
    command: 'format:check',
    diagnostic: 'Probe.svelte',
    risk: 'Class sorting skips tv calls or misses the theme stylesheet'
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
  file: join(dirname(row.file), `policy-${String(index)}-${basename(row.file)}`)
}));
const batches = [
  fixtures.filter((row) => row.command === 'lint'),
  fixtures.filter((row) => row.command === 'check'),
  fixtures.filter((row) => row.command === 'format:check')
];
function diagnosticFor(row: PolicyCase, output: string) {
  if (row.command !== 'lint') return output;
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
    await rm(join(root, row.file));
    console.log(`PASS ${row.name}`);
  }
}
await rm(root, { recursive: true, force: true });
