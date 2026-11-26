import { RuleTester } from 'eslint';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as svelte from 'svelte-eslint-parser';
import { describe, expect, it, onTestFinished } from 'vitest';
import * as yaml from 'yaml-eslint-parser';
import { chromeTokens } from './chrome-tokens.ts';
import { featureBoundaries } from './feature-boundaries.ts';
import { packageImportTargets } from './package-imports.ts';
import { uiSdkPriority } from './ui-sdk-priority.ts';

RuleTester.describe = describe;
RuleTester.it = it;

const at = (path: string) => `${process.cwd()}/${path}`;
const tester = new RuleTester();

tester.run('feature-boundaries', featureBoundaries, {
  valid: [
    {
      code: "export { b } from '#lib/features/b/index.js';\nexport const a = 1;\n",
      filename: at('src/lib/features/a/probe.ts'),
      options: [{ features: { a: ['b'], b: [] } }]
    },
    {
      code: 'export const config = [];\n',
      filename: at('eslint.config.js'),
      options: [{ features: { a: ['b'], b: [] } }]
    }
  ],
  invalid: [
    {
      code: 'export const config = [];\n',
      filename: at('eslint.config.js'),
      options: [{ features: { a: [], compass: ['map'], map: ['compass'] } }],
      errors: [
        {
          messageId: 'featureCycle',
          data: { cycle: 'compass → map → compass' }
        }
      ]
    }
  ]
});

const manifest = '{\n  "dependencies": { "bits-ui": "2.21.0" }\n}\n';
const source = (code: string) => ({
  code,
  filename: at('src/lib/features/a/probe.ts')
});

tester.run('ui-sdk-priority', uiSdkPriority, {
  valid: [
    source(
      "import path from 'node:path';\nconst catalog = new Map();\ncatalog.resolve('bits-ui');\npath.resolve('bits-ui');\n"
    ),
    source(
      "import { createRequire } from 'probe-loader';\nconst load = createRequire(import.meta.url);\nload.resolve('bits-ui');\n"
    )
  ],
  invalid: [
    {
      code: manifest,
      filename: at('probe/package.json'),
      languageOptions: { parser: yaml },
      errors: [{ messageId: 'bitsUiDependency' }]
    },
    {
      ...source("import { Command } from 'bits-ui?raw';\n"),
      errors: [{ messageId: 'bitsUi' }]
    },
    {
      ...source("export { Button } from 'shadcn-svelte#button';\n"),
      errors: [{ messageId: 'shadcnImport' }]
    },
    {
      ...source(
        "import.meta['resolve']('bits-ui');\nimport.meta.resolve('bits-ui?url');\nrequire.resolve('bits-ui');\n"
      ),
      errors: [
        { messageId: 'bitsUi' },
        { messageId: 'bitsUi' },
        { messageId: 'bitsUi' }
      ]
    },
    {
      ...source(
        "import { createRequire } from 'node:module';\nconst load = createRequire(import.meta.url);\nload.resolve('bits-ui');\n"
      ),
      errors: [{ messageId: 'bitsUi' }]
    },
    {
      ...source(
        "import * as modules from 'node:module';\nimport { createRequire as cr } from 'node:module';\ncr(import.meta.url).resolve('bits-ui');\nconst load = modules['createRequire'](import.meta.url);\nload.resolve('bits-ui');\n"
      ),
      errors: [{ messageId: 'bitsUi' }, { messageId: 'bitsUi' }]
    },
    {
      ...source(
        "const { createRequire } = await import('node:module');\nconst req = createRequire(import.meta.url);\nreq.resolve('bits-ui');\nconst { createRequire: cr } = await import('module');\ncr(import.meta.url).resolve('bits-ui');\n"
      ),
      errors: [{ messageId: 'bitsUi' }, { messageId: 'bitsUi' }]
    },
    {
      ...source(
        "import { createRequire } from 'node:module';\nconst cr = createRequire;\ncr(import.meta.url).resolve('bits-ui');\n"
      ),
      errors: [{ messageId: 'bitsUi' }]
    },
    {
      ...source(
        "import { createRequire } from 'node:module';\nconst load = createRequire(import.meta.url);\nexport const find = (createRequire) => load.resolve('bits-ui');\n"
      ),
      errors: [{ messageId: 'bitsUi' }]
    }
  ]
});

const chrome = (code: string, file = 'probe.ts') => ({
  code,
  filename: at(`src/lib/features/on-water/${file}`),
  languageOptions: file.endsWith('.svelte') ? { parser: svelte } : {},
  options: [{ stylesheet: 'src/app.css' }]
});
const markup = (code: string) =>
  chrome(
    `<script lang="ts">\n  let { mode, map, pick, action, Comp } = $props();\n  const PAD = { 'text-depth': 'p-1' };\n</script>\n\n${code}\n`,
    'Probe.svelte'
  );

tester.run('chrome-tokens', chromeTokens, {
  valid: [
    chrome(
      "export const id = 'text-depth';\nexport const when = new Date().toLocaleString('pt-BR');\nexport const marker = 'my-location';\nexport const cursor = 'px-move';\n"
    ),
    chrome("<p class={{ 'bg-card': true }}>Pot</p>\n", 'Probe.svelte'),
    chrome(
      "export const rowClass = () => {\n  const id = 'px-move';\n  return id;\n};\nconst tv = (config) => config;\nexport const chip = tv({ variants: { 'text-depth': { true: 'bg-card' } } });\n"
    ),
    chrome(
      "<script lang=\"ts\">\n  let mode = $state('north');\n</script>\n\n<p class={mode === 'my-location' ? 'bg-card' : 'bg-muted'}>Pot</p>\n",
      'Probe.svelte'
    ),
    chrome(
      '<p class="probe">Pot</p>\n\n<style>\n  .probe {\n    @apply bg-card }\n</style>\n',
      'Probe.svelte'
    ),
    markup("<p class={map['text-depth']}>Pot</p>"),
    markup('<p class={PAD[mode]}>Pot</p>'),
    markup("<div use:action={'px-move'}></div>"),
    markup("<Comp {...{ id: 'text-depth' }} />"),
    markup("<p class:active={pick('text-depth')}>Pot</p>"),
    markup('<p class:text-sm={mode}>Pot</p>')
  ],
  invalid: [
    {
      ...chrome("<p class={{ 'bg-red-500': true }}>Pot</p>\n", 'Probe.svelte'),
      errors: [{ messageId: 'palette' }]
    },
    {
      ...chrome(
        '<p class="probe">Pot</p>\n\n<style>\n  .probe {\n    @apply bg-red-500 }\n</style>\n',
        'Probe.svelte'
      ),
      errors: [{ messageId: 'palette' }]
    },
    {
      ...chrome(
        "const cn = (...list) => list.join(' ');\nexport const rowClass = 'text-lg';\nexport const row = cn('bg-red-500');\nexport const SHAPE = 'flex bg-red-500';\n"
      ),
      errors: [
        { messageId: 'typography' },
        { messageId: 'palette' },
        { messageId: 'palette' }
      ]
    },
    {
      ...chrome(
        "const SHAPE = 'flex';\nexport const chip = `${SHAPE} bg-red-500`;\nexport const LINE_3 = 'text-red-600';\nexport const rowClass = { 'bg-red-500': true };\n"
      ),
      errors: [
        { messageId: 'palette' },
        { messageId: 'palette' },
        { messageId: 'palette' }
      ]
    },
    {
      ...chrome(
        "<p class={{ 'bg-(--color-probe-undeclared)': true }}>Pot</p>\n",
        'Probe.svelte'
      ),
      errors: [{ messageId: 'token' }]
    },
    {
      ...chrome(
        "<script lang=\"ts\">\n  const PAD = { sm: 'p-1', lg: 'p-fluid' };\n</script>\n\n<p class={['flex', PAD.lg]}>Pot</p>\n",
        'Probe.svelte'
      ),
      errors: [{ messageId: 'spacing' }]
    },
    {
      ...markup("<p class={['flex', 'bg-red-500'].join(' ')}>Pot</p>"),
      errors: [{ messageId: 'palette' }]
    },
    {
      ...markup("<p class={['flex', 'p-fluid'].filter(Boolean)}>Pot</p>"),
      errors: [{ messageId: 'spacing' }]
    },
    {
      ...markup("<p class={pick('text-red-600')}>Pot</p>"),
      errors: [{ messageId: 'palette' }]
    },
    {
      ...markup("<p style:padding={'13px'.trim()}>Pot</p>"),
      errors: [{ messageId: 'spacing' }]
    },
    {
      ...chrome(
        "<script lang=\"ts\">\n  let { mode } = $props();\n  const PAD = { 'text-depth': 'p-fluid' };\n</script>\n\n<p class={PAD[mode]}>Pot</p>\n",
        'Probe.svelte'
      ),
      errors: [{ messageId: 'spacing' }]
    },
    {
      ...markup('<p class:text-lg={mode}>Pot</p>'),
      errors: [{ messageId: 'typography' }]
    },
    {
      ...markup('<p class:p-fluid={mode}>Pot</p>'),
      errors: [{ messageId: 'spacing' }]
    }
  ]
});

it('a package import pattern with the longer suffix wins a prefix tie', () => {
  const root = mkdtempSync(join(tmpdir(), 'krab-imports-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      imports: { '#probe/*': './a/*.js', '#probe/*.private': './b/*.js' }
    })
  );
  expect(
    packageImportTargets('#probe/x.private', join(root, 'file.ts'))
  ).toEqual([join(root, 'b/x.js')]);
});
