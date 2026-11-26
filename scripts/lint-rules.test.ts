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
    }
  ],
  invalid: [
    {
      code: "export { b } from '#lib/features/b/index.js';\nexport const a = 1;\n",
      filename: at('src/lib/features/a/probe.ts'),
      options: [{ features: { a: ['b'], b: ['a'] } }],
      errors: [{ messageId: 'featureCycle' }]
    },
    {
      code: 'export const heading = 1;\n',
      filename: at('src/lib/features/compass/probe.ts'),
      options: [{ features: { compass: ['map'], map: ['compass'] } }],
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
  filename: at('src/lib/features/a/probe.ts'),
  options: [{ bitsUi: [] }]
});

tester.run('ui-sdk-priority', uiSdkPriority, {
  valid: [
    {
      code: manifest,
      filename: at('probe/package.json'),
      languageOptions: { parser: yaml },
      options: [{ bitsUi: ['src/lib/features/a/command.svelte'] }]
    },
    source(
      "import path from 'node:path';\nconst catalog = new Map();\ncatalog.resolve('bits-ui');\npath.resolve('bits-ui');\n"
    )
  ],
  invalid: [
    {
      code: manifest,
      filename: at('probe/package.json'),
      languageOptions: { parser: yaml },
      options: [{ bitsUi: [] }],
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
    }
  ]
});

const chrome = (code: string, file = 'probe.ts') => ({
  code,
  filename: at(`src/lib/features/on-water/${file}`),
  languageOptions: file.endsWith('.svelte') ? { parser: svelte } : {},
  options: [{ stylesheet: 'src/app.css' }]
});

tester.run('chrome-tokens', chromeTokens, {
  valid: [
    chrome(
      "export const id = 'text-depth';\nexport const when = new Date().toLocaleString('pt-BR');\nexport const marker = 'my-location';\nexport const cursor = 'px-move';\n"
    ),
    chrome("<p class={{ 'bg-card': true }}>Pot</p>\n", 'Probe.svelte'),
    chrome(
      '<p class="probe">Pot</p>\n\n<style>\n  .probe {\n    @apply bg-card }\n</style>\n',
      'Probe.svelte'
    )
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
