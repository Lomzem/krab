import { strict as assert } from 'node:assert';
import {
  mkdir,
  mkdtemp,
  cp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile
} from 'node:fs/promises';
import { existsSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';

const root = realpathSync(await mkdtemp(join(tmpdir(), 'krab-policy-')));
const cleanup = () => {
  rmSync(root, { recursive: true, force: true });
};
process.on('exit', cleanup);
const signalGroup = (pid: number, signal: string) =>
  spawnSync('kill', [`-${signal}`, '--', `-${String(pid)}`], {
    stdio: 'ignore'
  }).status === 0;
const running = new Set<number>();
let stopping = false;
async function stop(code: number) {
  if (stopping) return;
  stopping = true;
  const groups = [...running];
  for (const group of groups) signalGroup(group, 'TERM');
  for (
    let waited = 0;
    waited < 5000 && groups.some((group) => signalGroup(group, '0'));
    waited += 50
  )
    await sleep(50);
  for (const group of groups) signalGroup(group, 'KILL');
  cleanup();
  process.exit(code);
}
for (const [signal, code] of [
  ['SIGHUP', 129],
  ['SIGINT', 130],
  ['SIGTERM', 143]
] as const)
  process.on(signal, () => void stop(code));
const source = process.cwd();
type PolicyCase = {
  name: string;
  file: string;
  invalidFile?: string;
  exact?: boolean;
  warningOnly?: boolean;
  valid: string;
  invalid: string;
  command: 'lint' | 'check' | 'format:check';
  diagnostic: string;
  risk: string;
};
const workflow = (job: string) =>
  `on: push\njobs:\n  a:\n    runs-on: ubuntu-24.04\n    timeout-minutes: 5\n    steps:\n      - run: true\n  b:\n    runs-on: ubuntu-24.04\n${job}    steps:\n      - run: true\n`;
const page = (script: string, markup = '<OnWater />\n') =>
  `<script lang="ts">\n  import { OnWater } from '#lib/features/on-water/index.js';${script}\n</script>\n\n${markup}`;
const layout = (markup = '') =>
  `<script lang="ts">\n  import type { Snippet } from 'svelte';\n\n  let { children }: { children: Snippet } = $props();\n</script>\n\n{@render children()}\n${markup}`;
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
    file: 'src/lib/shared/Probe.svelte',
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
    file: 'src/lib/shared/probe.ts',
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
    file: 'src/lib/shared/probe.ts',
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
    name: 'template literal Playwright import versus the providers fixture',
    file: 'e2e/probe.test.ts',
    valid: 'export const load = () => import(`./fixtures`);',
    invalid: 'export const load = () => import(`@playwright/test`);',
    command: 'lint',
    diagnostic: "Import test from './fixtures'",
    risk: 'A template literal import skips the NOAA and OpenFreeMap fixture, or a template literal import of the fixture is refused'
  },
  {
    name: 'static Playwright test import versus the providers fixture',
    file: 'e2e/probe.test.ts',
    valid:
      'import { expect } from "@playwright/test"; import { test } from "./fixtures"; export { expect, test };',
    invalid: 'import { test } from "@playwright/test"; export { test };',
    command: 'lint',
    diagnostic: "Import test from './fixtures'",
    risk: 'A static import of test skips the NOAA and OpenFreeMap fixture, or the fixture test is refused'
  },
  {
    name: 'static Playwright test import versus the recipe doctor fixture',
    file: 'scripts/verify-krab/probe.ts',
    valid: 'import { expect, test } from "./recipe"; export { expect, test };',
    invalid: 'import { test } from "@playwright/test"; export { test };',
    command: 'lint',
    diagnostic: "Import test from './recipe'",
    risk: 'A recipe drives the preview without the doctor receipt, or the recipe test is refused'
  },
  {
    name: 'dynamic Playwright import versus the recipe doctor fixture',
    file: 'scripts/verify-krab/probe.ts',
    valid: 'export const load = () => import("./recipe");',
    invalid: 'export const load = () => import(`@playwright/test`);',
    command: 'lint',
    diagnostic: "Import test from './recipe'",
    risk: 'A dynamic import drives the preview without the doctor receipt, or a dynamic import of the recipe is refused'
  },
  {
    name: 'e2e fixture test import versus the recipe doctor fixture',
    file: 'scripts/verify-krab/probe.ts',
    valid:
      'import { toastOf } from "../../e2e/fixtures"; import { testWithFixtureProviders } from "./recipe"; export { testWithFixtureProviders, toastOf };',
    invalid: 'import { test } from "../../e2e/fixtures"; export { test };',
    command: 'lint',
    diagnostic: "Import test from './recipe'",
    risk: 'A recipe takes the e2e test, which answers providers but drives without the doctor receipt, or e2e helpers are refused'
  },
  {
    name: 'dynamic e2e fixture import versus the recipe doctor fixture',
    file: 'scripts/verify-krab/probe.ts',
    valid: 'export const load = () => import("./evidence");',
    invalid: 'export const load = () => import("../../e2e/fixtures");',
    command: 'lint',
    diagnostic: "Import test from './recipe'",
    risk: 'A dynamic import takes the e2e test without the doctor receipt, or other dynamic imports are refused'
  },
  {
    name: 'default Playwright import versus the recipe doctor fixture',
    file: 'scripts/verify-krab/probe.ts',
    valid: 'import { expect } from "@playwright/test"; export { expect };',
    invalid:
      'import playwright from "@playwright/test"; export const drive = playwright;',
    command: 'lint',
    diagnostic: "Import test from './recipe'",
    risk: 'A default import takes the Playwright test without the doctor receipt, or expect from Playwright is refused'
  },
  {
    name: 'dynamic unscoped Playwright import versus the recipe doctor fixture',
    file: 'scripts/verify-krab/probe.ts',
    valid: 'export const load = () => import("@playwright/test/reporter");',
    invalid: 'export const load = () => import("playwright/test");',
    command: 'lint',
    diagnostic: "Import test from './recipe'",
    risk: 'The unscoped playwright/test entry drives the preview without the doctor receipt, or a neighbouring Playwright module is refused'
  },
  {
    name: 'default Playwright import versus the providers fixture',
    file: 'e2e/probe.test.ts',
    valid: 'import { expect } from "@playwright/test"; export { expect };',
    invalid:
      'import playwright from "@playwright/test"; export const drive = playwright;',
    command: 'lint',
    diagnostic: "Import test from './fixtures'",
    risk: 'A default import takes the Playwright test without the NOAA and OpenFreeMap fixture, or expect from Playwright is refused'
  },
  {
    name: 'throw syntax in verify-krab recipes',
    file: 'scripts/verify-krab/probe.ts',
    valid:
      'export const fail = () => Promise.reject(new Error("unavailable"));',
    invalid:
      'export function fail(): never { throw new Error("unavailable"); }',
    command: 'lint',
    diagnostic: 'Use Effect failure APIs instead of throw',
    risk: 'The recipe import rule replaces the inherited syntax restrictions'
  },
  {
    name: 'code depth boundary',
    file: 'src/lib/shared/probe.ts',
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
    file: 'src/lib/shared/probe.ts',
    valid: 'export const result = [1].map(a => [2].map(b => a + b));',
    invalid:
      'export const result = [1].map(a => [2].map(b => [3].map(c => a + b + c)));',
    command: 'lint',
    diagnostic: 'max-nested-callbacks',
    risk: 'Callback threshold is absent or off by one'
  },
  {
    name: 'nested ternaries',
    file: 'src/lib/shared/probe.ts',
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
      '<script lang="ts">const count = 1;</script><p class="px-4 text-muted-foreground max-[22rem]:text-base">{count} in the <strong>water</strong></p><button aria-label="One more kept">+</button>',
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
    name: 'feature imported past its entrypoint through the alias',
    file: 'src/lib/features/location/probe.ts',
    valid:
      "import type { Trip } from '#lib/features/trip/index.js';\nexport type Probe = Trip;\n",
    invalid:
      "import type { Trip } from '#lib/features/trip/types.js';\nexport type Probe = Trip;\n",
    command: 'lint',
    diagnostic: 'Import feature trip through its public entrypoint',
    risk: 'A feature reaches into the private modules of another feature'
  },
  {
    name: 'feature imported past its entrypoint by a relative path',
    file: 'src/lib/features/location/probe.ts',
    valid:
      "import type { LocationPermission } from './position-watch.svelte';\nimport type { Trip } from '../trip/index';\nexport type Probe = [LocationPermission, Trip];\n",
    invalid:
      "import type { Trip } from '../trip/types';\nexport type Probe = Trip;\n",
    command: 'lint',
    diagnostic: 'Import feature trip through its public entrypoint',
    risk: 'Relative paths skip the entrypoint, or a feature cannot import its own modules'
  },
  {
    name: 'feature re-exported past its entrypoint',
    file: 'src/lib/features/location/probe.ts',
    valid:
      "export type { Trip } from '#lib/features/trip/index.js';\nexport const probe = 1;\n",
    invalid:
      "export type { Trip } from '#lib/features/trip/types.js';\nexport const probe = 1;\n",
    command: 'lint',
    diagnostic: 'Import feature trip through its public entrypoint',
    risk: 'A re-export republishes the private modules of another feature'
  },
  {
    name: 'feature type imported past its entrypoint',
    file: 'src/lib/features/location/probe.ts',
    valid: "export type Probe = import('#lib/features/trip/index.js').Trip;\n",
    invalid:
      "export type Probe = import('#lib/features/trip/types.js').Trip;\n",
    command: 'lint',
    diagnostic: 'Import feature trip through its public entrypoint',
    risk: 'An inline import type skips the entrypoint'
  },
  {
    name: 'feature loaded past its entrypoint by dynamic import',
    file: 'src/lib/features/on-water/probe.ts',
    valid: "export const load = () => import('#lib/features/map/index.js');\n",
    invalid:
      "export const load = () => import('#lib/features/map/ChartMap.svelte');\n",
    command: 'lint',
    diagnostic: 'Import feature map through its public entrypoint',
    risk: 'A lazy load reaches into the private modules of another feature'
  },
  {
    name: 'feature imported past its entrypoint in a Svelte script',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      '<script lang="ts">\n  import type { Trip } from \'#lib/features/trip/index.js\';\n\n  let { trip }: { trip: Trip } = $props();\n</script>\n\n<p>{typeof trip}</p>\n',
    invalid:
      '<script lang="ts">\n  import type { Trip } from \'#lib/features/trip/types.js\';\n\n  let { trip }: { trip: Trip } = $props();\n</script>\n\n<p>{typeof trip}</p>\n',
    command: 'lint',
    diagnostic: 'Import feature trip through its public entrypoint',
    risk: 'Svelte script imports skip the entrypoint'
  },
  {
    name: 'feature loaded past its entrypoint in Svelte markup',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      "{#await import('#lib/features/map/index.js') then loaded}\n  <p>{typeof loaded}</p>\n{/await}\n",
    invalid:
      "{#await import('#lib/features/map/ChartMap.svelte') then loaded}\n  <p>{typeof loaded}</p>\n{/await}\n",
    command: 'lint',
    diagnostic: 'Import feature map through its public entrypoint',
    risk: 'Markup imports skip the entrypoint'
  },
  {
    name: 'feature imported past its entrypoint by a script',
    file: 'scripts/verify-krab/probe.ts',
    valid:
      "import type { Trip } from '../../src/lib/features/trip/index';\nexport type Probe = Trip;\n",
    invalid:
      "import type { Trip } from '../../src/lib/features/trip/types';\nexport type Probe = Trip;\n",
    command: 'lint',
    diagnostic: 'Import feature trip through its public entrypoint',
    risk: 'Code outside src reaches into the private modules of a feature'
  },
  {
    name: 'feature imported past its entrypoint through a traversing alias',
    file: 'src/lib/features/location/probe.ts',
    valid:
      "import type { Trip } from '#lib/features/location/../trip/index.js';\nexport type Probe = Trip;\n",
    invalid:
      "import type { Trip } from '#lib/features/location/../trip/types.js';\nexport type Probe = Trip;\n",
    command: 'lint',
    diagnostic: 'Import feature trip through its public entrypoint',
    risk: 'A path that climbs out of the own feature reaches into another feature unseen'
  },
  {
    name: 'feature imported past its entrypoint by a root path',
    file: 'src/lib/features/location/probe.ts',
    valid:
      "import type { Trip } from '/src/lib/features/trip/index.js';\nexport type Probe = Trip;\n",
    invalid:
      "import type { Trip } from '/src/lib/features/trip/types.js';\nexport type Probe = Trip;\n",
    command: 'lint',
    diagnostic: 'Import feature trip through its public entrypoint',
    risk: 'A root path skips the entrypoint'
  },
  {
    name: 'feature required past its entrypoint',
    file: 'scripts/verify-krab/probe.cjs',
    valid:
      "module.exports = require('../../src/lib/features/trip/index.js');\n",
    invalid:
      "module.exports = require('../../src/lib/features/trip/types.js');\n",
    command: 'lint',
    diagnostic: 'Import feature trip through its public entrypoint',
    risk: 'require() reaches into the private modules of a feature'
  },
  {
    name: 'computed require',
    file: 'scripts/verify-krab/probe.cjs',
    valid: "module.exports = require('./run.ts');\n",
    invalid: 'module.exports = (name) => require(name);\n',
    command: 'lint',
    diagnostic: 'Give require() a literal path',
    risk: 'A computed require hides a cross-feature load, or a literal require is refused'
  },
  {
    name: 'computed dynamic import',
    file: 'src/lib/features/map/probe.ts',
    valid: 'export const load = () => import(`./types`);\n',
    invalid: 'export const load = (name: string) => import(`./${name}`);\n',
    command: 'lint',
    diagnostic: 'Give import() a literal path',
    risk: 'A computed path hides a cross-feature import, or a literal template is refused'
  },
  {
    name: 'import.meta.glob',
    file: 'src/lib/features/map/probe.ts',
    valid: 'export const url = import.meta.url;\n',
    invalid: "export const modules = import.meta.glob('../trip/*.ts');\n",
    command: 'lint',
    diagnostic: 'import.meta.glob hides imports',
    risk: 'A glob loads the private modules of another feature unseen'
  },
  {
    name: 'shared module importing a feature',
    file: 'src/lib/shared/probe.ts',
    valid:
      "import type { LatLon } from './lat-lon';\nexport type Probe = LatLon;\n",
    invalid:
      "import type { Trip } from '#lib/features/trip/index.js';\nexport type Probe = Trip;\n",
    command: 'lint',
    diagnostic: 'src/lib/shared must not import a feature',
    risk: 'Shared code depends on a feature and makes a cycle'
  },
  {
    name: 'module outside features and shared',
    file: 'src/lib/shared/probe.ts',
    invalidFile: 'src/lib/probe.ts',
    valid: 'export const probe = 1;\n',
    invalid: 'export const probe = 1;\n',
    command: 'lint',
    diagnostic: 'is outside the application layout',
    risk: 'Application code collects in loose folders outside features and shared'
  },
  {
    name: 'undeclared feature folder',
    file: 'src/lib/features/map/probe.ts',
    invalidFile: 'src/lib/features/probe/probe.ts',
    valid: 'export const probe = 1;\n',
    invalid: 'export const probe = 1;\n',
    command: 'lint',
    diagnostic: 'Feature probe is not declared',
    risk: 'A new feature folder appears without a declared boundary'
  },
  {
    name: 'feature import outside the allowed table',
    file: 'src/lib/features/location/probe.ts',
    invalidFile: 'src/lib/features/trip/probe.ts',
    valid:
      "export type { Trip } from '#lib/features/trip/index.js';\nexport const probe = 1;\n",
    invalid:
      "export { readiness } from '#lib/features/location/index.js';\nexport const probe = 1;\n",
    command: 'lint',
    diagnostic: 'Feature trip may not import feature location',
    risk: 'Features import each other freely and form a cycle, or an allowed import is refused'
  },
  {
    name: 'second entrypoint file in a feature',
    file: 'src/lib/features/map/policy/index.js',
    invalidFile: 'src/lib/features/map/index.js',
    exact: true,
    valid: 'export const probe = 1;\n',
    invalid: 'export const probe = 1;\n',
    command: 'lint',
    diagnostic: 'is the only entrypoint file of feature map',
    risk: 'A second index file shadows index.ts, or a private folder index is refused'
  },
  {
    name: 'default export by name',
    file: 'src/lib/features/map/probe.ts',
    valid: 'export const probe = 1;\n',
    invalid: 'const probe = 1;\nexport { probe as default };\n',
    command: 'lint',
    diagnostic: 'Export a named value instead of a default export',
    risk: 'An entrypoint publishes an unnamed default'
  },
  {
    name: 'default export declaration',
    file: 'src/lib/features/map/probe.ts',
    valid: 'export const probe = 1;\n',
    invalid: 'export default 1;\n',
    command: 'lint',
    diagnostic: 'Export a named value instead of a default export',
    risk: 'A module publishes an unnamed default'
  },
  {
    name: 'wildcard re-export',
    file: 'src/lib/features/map/probe.ts',
    valid:
      "import { chartSource } from './chart-tiles';\nexport const probe = chartSource;\n",
    invalid: "export * from './chart-tiles';\nexport const probe = 1;\n",
    command: 'lint',
    diagnostic: 'Export each name explicitly instead of export *',
    risk: 'A wildcard publishes every private name of a module'
  },
  {
    name: 'pass-through re-export file',
    file: 'src/lib/features/map/probe.ts',
    valid:
      "export { chartSource } from './chart-tiles';\nexport const probe = 1;\n",
    invalid: "export { chartSource } from './chart-tiles';\n",
    command: 'lint',
    diagnostic: 'This file only re-exports other modules',
    risk: 'A private barrel adds an indirection that hides the real module'
  },
  {
    name: 'pass-through file that imports then exports',
    file: 'src/lib/features/map/probe.ts',
    valid:
      "import { chartSource } from './chart-tiles';\nexport const probe = chartSource;\n",
    invalid:
      "import { chartSource } from './chart-tiles';\nexport { chartSource };\n",
    command: 'lint',
    diagnostic: 'This file only re-exports other modules',
    risk: 'An import and export pair hides a private barrel'
  },
  {
    name: 'pass-through re-export file in another module extension',
    file: 'src/lib/features/map/probe.mjs',
    valid:
      "export { chartSource } from './chart-tiles.js';\nexport const probe = 1;\n",
    invalid: "export { chartSource } from './chart-tiles.js';\n",
    command: 'lint',
    diagnostic: 'This file only re-exports other modules',
    risk: 'A private barrel hides behind a .mjs or .cjs extension'
  },
  {
    name: 'route script statement',
    file: 'src/routes/+page.svelte',
    valid: page(''),
    invalid: page("\n  $effect(() => {\n    document.title = 'Krab';\n  });"),
    command: 'lint',
    diagnostic: 'Move this statement into a feature',
    risk: 'Routes hold state or effects instead of composing features'
  },
  {
    name: 'route module statement',
    file: 'src/routes/+layout.ts',
    valid: 'export const ssr = false;\n',
    invalid:
      "export const ssr = false;\nexport const load = () => ({ title: 'Krab' });\n",
    command: 'lint',
    diagnostic: 'Move this statement into a feature',
    risk: 'Route modules hold logic, or framework options are refused'
  },
  {
    name: 'route markup block',
    file: 'src/routes/+page.svelte',
    valid: page(''),
    invalid: page('', '{#if Math.random() > 0}\n  <OnWater />\n{/if}\n'),
    command: 'lint',
    diagnostic: 'Move this block into a feature',
    risk: 'Routes branch or loop instead of composing features'
  },
  {
    name: 'route markup function',
    file: 'src/routes/+page.svelte',
    valid: page(''),
    invalid: page(
      '',
      '<OnWater />\n<button onclick={() => history.back()}>Back</button>\n'
    ),
    command: 'lint',
    diagnostic: 'Move this function into a feature',
    risk: 'Routes hold event handlers instead of composing features'
  },
  {
    name: 'route style block',
    file: 'src/routes/+page.svelte',
    valid: page(''),
    invalid: page(
      '',
      '<OnWater />\n\n<style>\n  p {\n    margin: 0;\n  }\n</style>\n'
    ),
    command: 'lint',
    diagnostic: 'Move this style block into a feature',
    risk: 'Routes carry their own styles instead of composing features'
  },
  {
    name: 'non-route file in routes',
    file: 'src/routes/+page.svelte',
    invalidFile: 'src/routes/helper.js',
    valid: page(''),
    invalid: "export const title = 'Krab';\n",
    command: 'lint',
    diagnostic: 'is not a SvelteKit route file',
    risk: 'Routes grow helper modules beside their route files'
  },
  {
    name: 'route markup expression',
    file: 'src/routes/+page.svelte',
    valid: page(
      '\n  let { data }: { data: { title: string } } = $props();',
      '<OnWater />\n<p title={data.title}>{data.title}</p>\n'
    ),
    invalid: page('', '<OnWater />\n<p>{localStorage.length}</p>\n'),
    command: 'lint',
    diagnostic: 'Move this expression into a feature',
    risk: 'Routes read browser state in markup, or typed prop reads are refused'
  },
  {
    name: 'route markup call',
    file: 'src/routes/+layout.svelte',
    valid: layout(),
    invalid: layout('<p>{Math.max(1, 2)}</p>\n'),
    command: 'lint',
    diagnostic: 'Move this expression into a feature',
    risk: 'Routes compute values in markup, or rendering children is refused'
  },
  {
    name: 'route snippet',
    file: 'src/routes/+page.svelte',
    valid: page(''),
    invalid: page(
      '',
      '{#snippet header()}\n  <p>Krab</p>\n{/snippet}\n<OnWater />\n'
    ),
    command: 'lint',
    diagnostic: 'Move this block into a feature',
    risk: 'Routes define their own markup pieces instead of composing features'
  },
  {
    name: 'route prop default',
    file: 'src/routes/+page.svelte',
    valid: page(
      '\n  let { form = null }: { form?: string | null } = $props();',
      '<OnWater />\n<p>{form}</p>\n'
    ),
    invalid: page(
      "\n  let { form = localStorage.getItem('form') }: { form?: string | null } = $props();",
      '<OnWater />\n<p>{form}</p>\n'
    ),
    command: 'lint',
    diagnostic: 'Move this prop default into a feature',
    risk: 'Routes compute prop defaults, or literal defaults are refused'
  },
  {
    name: 'route-local import',
    file: 'src/routes/+page.svelte',
    valid: page("\n  import '../../app.css';"),
    invalid: page("\n  import Helper from './Helper.svelte';", '<Helper />\n'),
    command: 'lint',
    diagnostic: 'Move this route-local import into a feature',
    risk: 'Routes grow private modules instead of composing features, or the app stylesheet is refused'
  },
  {
    name: 'Svelte accessibility warning',
    file: 'src/lib/shared/Probe.svelte',
    warningOnly: true,
    valid: '<img src="/pot.png" alt="Pot" />\n',
    invalid: '<img src="/pot.png" />\n',
    command: 'check',
    diagnostic: 'a11y_missing_attribute',
    risk: 'Svelte compiler and accessibility warnings pass typechecking'
  },
  {
    name: 'raw color in a chrome class',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<p class="text-map-ink">Pot</p>\n',
    invalid: '<p class="text-[#1a2e2b]">Pot</p>\n',
    command: 'lint',
    diagnostic: 'Raw color in text-[#1a2e2b]',
    risk: 'Chrome hard-codes a color that skips the theme tokens'
  },
  {
    name: 'raw color value in chrome script',
    file: 'src/lib/features/compass/probe.ts',
    valid: "export const ink = 'var(--map-ink)';\n",
    invalid: "export const ink = '#1a2e2b';\n",
    command: 'lint',
    diagnostic: 'Raw color in #1a2e2b',
    risk: 'Compass script hands a raw color to the screen'
  },
  {
    name: 'raw color in a chrome inline style',
    file: 'src/lib/shared/Probe.svelte',
    valid: '<p style="color: var(--foreground)">Pot</p>\n',
    invalid: '<p style="color: rgb(26 46 43)">Pot</p>\n',
    command: 'lint',
    diagnostic: 'Raw color in color: rgb(26 46 43)',
    risk: 'Shared chrome hides a raw color in a style attribute'
  },
  {
    name: 'raw color in a chrome style block',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      '<p class="probe">Pot</p>\n\n<style>\n  .probe {\n    color: var(--foreground);\n  }\n</style>\n',
    invalid:
      '<p class="probe">Pot</p>\n\n<style>\n  .probe {\n    color: #1a2e2b;\n  }\n</style>\n',
    command: 'lint',
    diagnostic: 'Raw color in color: #1a2e2b',
    risk: 'Chrome hides a raw color in a component style block'
  },
  {
    name: 'Tailwind palette color in chrome',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<p class="backdrop:bg-scrim/40">Pot</p>\n',
    invalid: '<p class="backdrop:bg-black/40">Pot</p>\n',
    command: 'lint',
    diagnostic: 'backdrop:bg-black/40 uses the Tailwind palette',
    risk: 'Chrome picks a palette color that no theme token names'
  },
  {
    name: 'text size off the type scale',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      '<p class="text-center text-control text-muted-foreground">Pot</p>\n',
    invalid: '<p class="text-lg">Pot</p>\n',
    command: 'lint',
    diagnostic: 'text-lg is off the type scale',
    risk: 'Chrome uses a Tailwind size the type scale resets, or the stylesheet tokens go unread'
  },
  {
    name: 'arbitrary font size in chrome script',
    file: 'src/lib/features/on-water/probe.ts',
    valid: "export const size = 'text-display leading-tight';\n",
    invalid: "export const size = 'text-[17px] leading-tight';\n",
    command: 'lint',
    diagnostic: 'text-[17px] is off the type scale',
    risk: 'A class list in script sets a font size off the type scale'
  },
  {
    name: 'raw font size in a chrome inline style',
    file: 'src/lib/shared/Probe.svelte',
    valid: '<p style="font-size: var(--text-control)">Pot</p>\n',
    invalid: '<p style="font-size: 17px">Pot</p>\n',
    command: 'lint',
    diagnostic: 'font-size: 17px is off the type scale',
    risk: 'A style attribute sets a font size off the type scale'
  },
  {
    name: 'arbitrary spacing in a chrome class',
    file: 'src/lib/features/compass/Probe.svelte',
    valid: '<p class="-mx-1 mt-auto gap-x-2.5 p-px px-edge">Pot</p>\n',
    invalid: '<p class="px-[13px]">Pot</p>\n',
    command: 'lint',
    diagnostic: 'px-[13px] is off the spacing scale',
    risk: 'Chrome spacing leaves the scale, or spacing tokens and the numeric scale are refused'
  },
  {
    name: 'raw spacing in a chrome style directive',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<p style:padding="var(--spacing-edge)">Pot</p>\n',
    invalid: '<p style:padding="13px">Pot</p>\n',
    command: 'lint',
    diagnostic: 'padding: 13px is off the spacing scale',
    risk: 'A style directive sets spacing off the scale'
  },
  {
    name: 'safe-area layout exemption',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      '<p\n  class="pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]"\n  style="padding-top: calc(0.75rem + env(safe-area-inset-top))"\n>\n  Pot\n</p>\n',
    invalid:
      '<p class="pb-[max(0.5rem,var(--safe-area-inset-bottom))]">Pot</p>\n',
    command: 'lint',
    diagnostic:
      'pb-[max(0.5rem,var(--safe-area-inset-bottom))] is off the spacing scale',
    risk: 'Safe-area insets are refused, or the exemption admits spacing that only names a safe-area inset'
  },
  {
    name: 'arbitrary font size property in chrome',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<p class="[font-size:var(--text-control)]">Pot</p>\n',
    invalid: '<p class="[font-size:17px]">Pot</p>\n',
    command: 'lint',
    diagnostic: '[font-size:17px] is off the type scale',
    risk: 'An arbitrary property utility sets a font size off the type scale'
  },
  {
    name: 'arbitrary padding property in chrome',
    file: 'src/lib/features/compass/Probe.svelte',
    valid: '<p class="[padding:var(--spacing-edge)]">Pot</p>\n',
    invalid: '<p class="[padding:13px]">Pot</p>\n',
    command: 'lint',
    diagnostic: '[padding:13px] is off the spacing scale',
    risk: 'An arbitrary property utility sets spacing off the scale'
  },
  {
    name: 'named color in an arbitrary chrome utility',
    file: 'src/lib/shared/Probe.svelte',
    valid: '<p class="bg-[var(--color-card)]">Pot</p>\n',
    invalid: '<p class="bg-[tomato]">Pot</p>\n',
    command: 'lint',
    diagnostic: 'Raw color in bg-[tomato]',
    risk: 'A CSS named color slips past the raw color check'
  },
  {
    name: 'undeclared color token in a chrome utility',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid: '<p class="bg-(--color-card)">Pot</p>\n',
    invalid: '<p class="bg-(--color-red-500)">Pot</p>\n',
    command: 'lint',
    diagnostic: '--color-red-500 is not declared in the global stylesheet',
    risk: 'A Tailwind palette variable stands in for a semantic color token'
  },
  {
    name: 'undeclared text token in a chrome inline style',
    file: 'src/lib/shared/Probe.svelte',
    valid: '<p style="font-size: var(--text-title)">Pot</p>\n',
    invalid: '<p style="font-size: var(--text-lg)">Pot</p>\n',
    command: 'lint',
    diagnostic: '--text-lg is not declared in the global stylesheet',
    risk: 'A Tailwind default size variable stands in for the type scale'
  },
  {
    name: 'undeclared spacing token in an arbitrary chrome utility',
    file: 'src/lib/features/compass/Probe.svelte',
    valid: '<p class="px-[var(--spacing-edge)]">Pot</p>\n',
    invalid: '<p class="px-[var(--spacing-wide)]">Pot</p>\n',
    command: 'lint',
    diagnostic: '--spacing-wide is not declared in the global stylesheet',
    risk: 'Any name under the spacing prefix passes as a spacing token'
  },
  {
    name: 'SVG icon paint exemption',
    file: 'src/lib/shared/Probe.svelte',
    valid:
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">\n  <path d="M12 20V4M5.5 10.5 12 4l6.5 6.5" fill="url(#cone)" />\n</svg>\n',
    invalid:
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">\n  <path d="M12 20V4M5.5 10.5 12 4l6.5 6.5" fill="white" />\n</svg>\n',
    command: 'lint',
    diagnostic: 'SVG paint white',
    risk: 'Icons and arrows hard-code paint, or currentColor and vector geometry are refused'
  },
  {
    name: 'SVG paint exemption in a style declaration',
    file: 'src/lib/shared/Probe.svelte',
    valid:
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">\n  <path d="M12 20V4M5.5 10.5 12 4l6.5 6.5" style="fill: url(#fade)" />\n</svg>\n',
    invalid:
      '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true">\n  <path d="M12 20V4M5.5 10.5 12 4l6.5 6.5" style="fill: red" />\n</svg>\n',
    command: 'lint',
    diagnostic: 'SVG paint fill: red',
    risk: 'Paint in a style declaration skips the SVG paint policy, or a gradient reference reads as a hex color'
  },
  {
    name: 'map markup is chrome',
    file: 'src/lib/features/map/Probe.svelte',
    valid: '<p class="bg-map-sea text-map-ink">Pot</p>\n',
    invalid: '<p class="bg-[#d5e2e0] text-map-ink">Pot</p>\n',
    command: 'lint',
    diagnostic: 'Raw color in bg-[#d5e2e0]',
    risk: 'Map markup escapes the token rule with the MapLibre style, or its map tokens are refused'
  },
  {
    name: 'route markup is chrome',
    file: 'src/routes/+page.svelte',
    valid: page('', '<OnWater />\n<p class="text-map-ink">Pot</p>\n'),
    invalid: page('', '<OnWater />\n<p class="text-[#1a2e2b]">Pot</p>\n'),
    command: 'lint',
    diagnostic: 'Raw color in text-[#1a2e2b]',
    risk: 'A route styles its own markup past the token rule'
  },
  {
    name: 'class lists only in class attributes',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      '<label for="text-depth">Depth</label>\n<input id="text-depth" name="gap-row" data-part="text-depth" />\n',
    invalid: '<p panelClass="bg-[tomato]">Pot</p>\n',
    command: 'lint',
    diagnostic: 'Raw color in bg-[tomato]',
    risk: 'Ids and names read as utilities, or a class prop skips the token rule'
  },
  {
    name: 'object keys and literal types are not class lists',
    file: 'src/lib/features/on-water/probe.ts',
    valid:
      "export const parts = { 'text-depth': 'text-control' };\nexport type Tone = 'text-depth';\n",
    invalid: "export const parts = { 'text-depth': 'text-[17px]' };\n",
    command: 'lint',
    diagnostic: 'text-[17px] is off the type scale',
    risk: 'Keys and literal types read as utilities, or class values in an object skip the token rule'
  },
  {
    name: 'parenthesized color token in a text utility',
    file: 'src/lib/shared/Probe.svelte',
    valid: '<p class="text-(--color-muted-foreground)">Pot</p>\n',
    invalid: '<p class="text-(--color-red-500)">Pot</p>\n',
    command: 'lint',
    diagnostic: '--color-red-500 is not declared in the global stylesheet',
    risk: 'The text-(--color-*) form is refused, or an undeclared color passes through it'
  },
  {
    name: 'named color between underscores',
    file: 'src/lib/features/compass/Probe.svelte',
    valid: '<p class="shadow-[0_0_0_2px_var(--color-border)]">Pot</p>\n',
    invalid: '<p class="shadow-[0_0_0_2px_tomato]">Pot</p>\n',
    command: 'lint',
    diagnostic: 'Raw color in shadow-[0_0_0_2px_tomato]',
    risk: 'A named color joined by underscores slips past the raw color check'
  },
  {
    name: 'raw color in an @apply list',
    file: 'src/lib/features/on-water/Probe.svelte',
    valid:
      '<p class="probe">Pot</p>\n\n<style>\n  .probe {\n    @apply bg-card px-edge text-control;\n  }\n</style>\n',
    invalid:
      '<p class="probe">Pot</p>\n\n<style>\n  .probe {\n    @apply hover:bg-[#1a2e2b];\n  }\n</style>\n',
    command: 'lint',
    diagnostic: 'Raw color in hover:bg-[#1a2e2b]',
    risk: 'An @apply list in a style block skips the utility check'
  },
  {
    name: 'bits-ui import, even in the old bait command folder',
    file: 'src/lib/features/on-water/bait-command/command.svelte',
    valid:
      '<script lang="ts">\n  import { Command } from \'@ui-sdk/svelte/command\';\n</script>\n\n<Command />\n',
    invalid:
      '<script lang="ts">\n  import { Command } from \'bits-ui\';\n</script>\n\n<Command.Root />\n',
    command: 'lint',
    diagnostic: 'Importing bits-ui brings bits-ui back',
    risk: 'A file regains a bits-ui allowance, or UI SDK Command is refused'
  },
  {
    name: 'bits-ui through createRequire',
    file: 'src/lib/shared/probe.ts',
    valid:
      "import { createRequire } from 'node:module';\n\nconst load = createRequire(import.meta.url);\nexport const effect: unknown = load('effect');\n",
    invalid:
      "import { createRequire } from 'node:module';\n\nconst load = createRequire(import.meta.url);\nexport const controls: unknown = load('bits-ui');\n",
    command: 'lint',
    diagnostic: 'Importing bits-ui brings bits-ui back',
    risk: 'An aliased require loads bits-ui unseen'
  },
  {
    name: 'dynamic bits-ui import',
    file: 'src/lib/shared/probe.ts',
    valid: "export const load = () => import('effect');\n",
    invalid: "export const load = () => import('bits-ui');\n",
    command: 'lint',
    diagnostic: 'Importing bits-ui brings bits-ui back',
    risk: 'A dynamic import loads bits-ui unseen'
  },
  {
    name: 'bits-ui through import.meta.resolve',
    file: 'src/lib/shared/probe.ts',
    valid:
      "export const known = (name: string) => name.startsWith('bits-ui');\n",
    invalid: "export const where = import.meta.resolve('bits-ui');\n",
    command: 'lint',
    diagnostic: 'Importing bits-ui brings bits-ui back',
    risk: 'A resolve call loads bits-ui unseen, or any call with a bits-ui string is refused'
  },
  {
    name: 'bits-ui through a package.json imports alias',
    file: 'src/lib/shared/probe-imports/package.json',
    invalidFile: 'src/lib/shared/probe-imports/probe.ts',
    exact: true,
    valid: '{\n  "imports": { "#controls": "bits-ui" }\n}\n',
    invalid: "export const load = () => import('#controls');\n",
    command: 'lint',
    diagnostic: 'Importing #controls brings bits-ui back',
    risk: 'A subpath import alias hides bits-ui from the import check'
  },
  {
    name: 'shadcn-svelte dependency',
    file: 'probe-ui-sdk/package.json',
    invalidFile: 'probe-shadcn/package.json',
    exact: true,
    valid: '{\n  "devDependencies": { "@ui-sdk/svelte": "0.1.0-beta.17" }\n}\n',
    invalid: '{\n  "devDependencies": { "shadcn-svelte": "1.0.0" }\n}\n',
    command: 'lint',
    diagnostic: 'shadcn-svelte in devDependencies',
    risk: 'shadcn-svelte comes back as a dependency, or UI SDK is refused'
  },
  {
    name: 'bits-ui dependency',
    file: 'probe-ui-sdk-dependency/package.json',
    invalidFile: 'probe-bits-ui-dependency/package.json',
    exact: true,
    valid: '{\n  "dependencies": { "@ui-sdk/svelte": "0.1.0-beta.17" }\n}\n',
    invalid: '{\n  "dependencies": { "bits-ui": "2.21.0" }\n}\n',
    command: 'lint',
    diagnostic: 'bits-ui in dependencies brings bits-ui back',
    risk: 'bits-ui comes back as a dependency, or UI SDK is refused'
  },
  {
    name: 'npm alias for shadcn-svelte',
    file: 'probe-alias/package.json',
    invalidFile: 'probe-shadcn-alias/package.json',
    exact: true,
    valid: '{\n  "dependencies": { "effect": "npm:effect@4.1.2" }\n}\n',
    invalid: '{\n  "dependencies": { "ui": "npm:shadcn-svelte@1.0.0" }\n}\n',
    command: 'lint',
    diagnostic: 'ui in dependencies aliases shadcn-svelte',
    risk: 'shadcn-svelte comes back under another name, or plain npm aliases are refused'
  },
  {
    name: 'npm alias for bits-ui',
    file: 'probe-bits-ui/package.json',
    invalidFile: 'probe-bits-ui-alias/package.json',
    exact: true,
    valid:
      '{\n  "dependencies": { "@ui-sdk/svelte": "npm:@ui-sdk/svelte@0.1.0-beta.17" }\n}\n',
    invalid: '{\n  "dependencies": { "controls": "npm:bits-ui@2.21.0" }\n}\n',
    command: 'lint',
    diagnostic: 'controls in dependencies aliases bits-ui',
    risk: 'bits-ui hides behind an alias the import check cannot see, or plain npm aliases are refused'
  },
  {
    name: 'shadcn-svelte registry scaffolding',
    file: 'probe-registry/package.json',
    invalidFile: 'probe-registry/components.json',
    exact: true,
    valid: '{\n  "name": "probe"\n}\n',
    invalid:
      '{\n  "$schema": "https://shadcn-svelte.com/schema.json",\n  "registry": "https://shadcn-svelte.com/registry"\n}\n',
    command: 'lint',
    diagnostic: 'components.json is shadcn-svelte registry scaffolding',
    risk: 'A shadcn-svelte registry returns, or plain manifests are refused'
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
const COPIED_OUT = [
  '.git',
  'node_modules',
  '.svelte-kit',
  'build',
  '.scratch',
  '.tools'
];
const writable = (entry: string) =>
  entry === '$app' || (entry.startsWith('.') && entry !== '.bin');
const fixtures = cases.map((row, index) => {
  const variantFile = (variant: 'valid' | 'invalid') => {
    const file =
      variant === 'invalid' ? (row.invalidFile ?? row.file) : row.file;
    const tag = `policy-${String(index)}-${variant}`;
    if (row.exact) return file;
    return basename(file).startsWith('+')
      ? join(dirname(file), tag, basename(file))
      : join(dirname(file), `${tag}-${basename(file)}`);
  };
  return {
    ...row,
    valid: { file: variantFile('valid'), text: row.valid },
    invalid: { file: variantFile('invalid'), text: row.invalid }
  };
});
type Command = PolicyCase['command'];
type Diagnostic = { file: string; text: string; warning?: boolean };
const diagnostics: Record<
  Command,
  (output: string, copy: string) => Diagnostic[]
> = {
  lint: (output, copy) =>
    output
      .split('\n\n')
      .map((block) => block.trim())
      .filter((block) => block.startsWith(`${copy}/`))
      .map((block) => ({
        file: block.slice(copy.length + 1).split('\n', 1)[0] ?? '',
        text: block
      })),
  check: (output, copy) =>
    stripVTControlCharacters(output)
      .split('\n')
      .flatMap((line, at, lines) => {
        const machine = /^\d+ (ERROR|WARNING) "([^"]+)" /.exec(line);
        if (machine)
          return [
            { file: machine[2], text: line, warning: machine[1] === 'WARNING' }
          ];
        const human = /^(\/.+):\d+:\d+$/.exec(line)?.[1];
        const severity = /^(Error|Warn): /.exec(lines[at + 1] ?? '')?.[1];
        if (human === undefined || severity === undefined) return [];
        const end = lines.indexOf('', at);
        return [
          {
            file: relative(copy, human),
            text: lines.slice(at, end === -1 ? undefined : end).join('\n'),
            warning: severity === 'Warn'
          }
        ];
      }),
  'format:check': (output) =>
    output.split('\n').flatMap((line) => {
      const file = /^(\S.*) \([\d.]+m?s\)$/.exec(line)?.[1];
      return file === undefined ? [] : [{ file, text: line }];
    })
};
const run = (copy: string, ...args: string[]) =>
  new Promise<{ status: number | null; output: string }>((resolve, reject) => {
    if (stopping) return;
    const child = spawn('bun', ['run', ...args], { cwd: copy, detached: true });
    const group = child.pid;
    if (group !== undefined) running.add(group);
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => {
      output += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => {
      if (stopping) return;
      if (group !== undefined) running.delete(group);
      resolve({ status, output });
    });
  });
const copyOf = async (name: string) => {
  const copy = join(root, name);
  await cp(source, copy, {
    recursive: true,
    filter: (path) =>
      !COPIED_OUT.some((part) =>
        path.slice(source.length).split('/').includes(part)
      )
  });
  await mkdir(join(copy, 'node_modules'));
  for (const entry of await readdir(join(source, 'node_modules')))
    if (!writable(entry))
      await symlink(
        join(source, 'node_modules', entry),
        join(copy, 'node_modules', entry)
      );
  const sync = await run(copy, 'svelte-kit', 'sync');
  assert.equal(sync.status, 0, `svelte-kit sync: ${sync.output}`);
  return copy;
};
type Variant = 'valid' | 'invalid';
const passes: {
  command: Command;
  takes: (row: Pick<PolicyCase, 'warningOnly'>, variant: Variant) => boolean;
}[] = [
  { command: 'lint', takes: () => true },
  { command: 'check', takes: (_row, variant) => variant === 'valid' },
  {
    command: 'check',
    takes: (row, variant) => variant === 'invalid' && row.warningOnly === true
  },
  {
    command: 'check',
    takes: (row, variant) => variant === 'invalid' && !row.warningOnly
  },
  { command: 'format:check', takes: () => true }
];
const runPass = async (
  { command, takes }: (typeof passes)[number],
  index: number
) => {
  const copy = await copyOf(`pass-${String(index)}`);
  const batch = fixtures.filter((row) => row.command === command);
  assert.ok(batch.length > 0, `${command} must have fixtures`);
  const inputs = batch.flatMap((row) =>
    (['valid', 'invalid'] as const)
      .filter((variant) => takes(row, variant))
      .map((variant) => ({ row, variant, ...row[variant] }))
  );
  for (const input of inputs) {
    assert.ok(
      !existsSync(join(copy, input.file)),
      `${input.row.name}: ${input.file} already exists`
    );
    await mkdir(join(copy, dirname(input.file)), { recursive: true });
    await writeFile(join(copy, input.file), input.text);
  }
  const { status, output } = await run(copy, command);
  const invalid = inputs.filter((input) => input.variant === 'invalid');
  assert.equal(
    status,
    invalid.length > 0 ? 1 : 0,
    `${command} with ${inputs.map((input) => input.variant).join(', ')} fixtures: ${output}`
  );
  const found = diagnostics[command](output, copy);
  const expected = new Set(invalid.map((input) => input.file));
  for (const diagnostic of found)
    assert.ok(
      expected.has(diagnostic.file),
      `${command}: unexpected diagnostic for ${diagnostic.file}: ${output}`
    );
  for (const input of invalid)
    assert.ok(
      found.some(
        (diagnostic) =>
          diagnostic.file === input.file &&
          diagnostic.text.includes(input.row.diagnostic) &&
          (!input.row.warningOnly || diagnostic.warning === true)
      ),
      `${input.row.name}: missing file-specific diagnostic: ${output}`
    );
  for (const input of inputs) {
    assert.equal(
      await readFile(join(copy, input.file), 'utf8'),
      input.text,
      `${input.row.name}: ${command} rewrote input`
    );
    if (input.variant === 'invalid') console.log(`PASS ${input.row.name}`);
  }
  await rm(copy, { recursive: true, force: true });
};
await Promise.all(passes.map(runPass)).catch((error: unknown) => {
  console.error(error);
  return stop(1);
});
cleanup();
