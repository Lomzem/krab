import { RuleTester } from 'eslint';
import { describe, it } from 'vitest';
import * as yaml from 'yaml-eslint-parser';
import { featureBoundaries } from './feature-boundaries.ts';
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
    }
  ]
});

const manifest = '{\n  "dependencies": { "bits-ui": "2.21.0" }\n}\n';

tester.run('ui-sdk-priority', uiSdkPriority, {
  valid: [
    {
      code: manifest,
      filename: at('probe/package.json'),
      languageOptions: { parser: yaml },
      options: [{ bitsUi: ['src/lib/features/a/command.svelte'] }]
    }
  ],
  invalid: [
    {
      code: manifest,
      filename: at('probe/package.json'),
      languageOptions: { parser: yaml },
      options: [{ bitsUi: [] }],
      errors: [{ messageId: 'bitsUiDependency' }]
    }
  ]
});
