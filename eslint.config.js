import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import * as yaml from 'yaml-eslint-parser';
import uiCopy from './scripts/ui-copy.ts';
import { ciTimeLimit } from './scripts/ci-time-limit.ts';
import { featureBoundaries } from './scripts/feature-boundaries.ts';
import { chromeTokens } from './scripts/chrome-tokens.ts';
import { uiSdkPriority } from './scripts/ui-sdk-priority.ts';

const krab = {
  meta: uiCopy.meta,
  rules: {
    ...uiCopy.rules,
    'ci-time-limit': ciTimeLimit,
    'feature-boundaries': featureBoundaries,
    'chrome-tokens': chromeTokens,
    'ui-sdk-priority': uiSdkPriority
  }
};

const FEATURES = [
  'app-shell',
  'compass',
  'location',
  'map',
  'on-water',
  'trip'
];

const CHROME = [
  'src/lib/features/on-water/**/*.{ts,svelte}',
  'src/lib/features/compass/**/*.{ts,svelte}',
  'src/lib/shared/**/*.{ts,svelte}'
];

const BITS_UI_WRAPPERS = [
  'src/lib/features/on-water/bait-command/command-input.svelte',
  'src/lib/features/on-water/bait-command/command-item.svelte',
  'src/lib/features/on-water/bait-command/command-list.svelte',
  'src/lib/features/on-water/bait-command/command.svelte'
];

const EFFECT_ONLY = [
  {
    selector: 'ThrowStatement',
    message: 'Use Effect failure APIs instead of throw.'
  },
  {
    selector: 'TryStatement',
    message: 'Use Effect error handling instead of try/catch.'
  }
];

const USE_FIXTURE_TEST =
  "Import test from './fixtures', whose auto fixture answers NOAA and OpenFreeMap.";

export default defineConfig([
  {
    ignores: [
      'node_modules/**',
      '.svelte-kit/**',
      'build/**',
      '.scratch/**',
      '.tools/**'
    ]
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,svelte}'],
    extends: [js.configs.recommended],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-restricted-syntax': ['error', ...EFFECT_ONLY],
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 2],
      'no-nested-ternary': 'error'
    }
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,svelte}'],
    plugins: { krab },
    rules: {
      'krab/feature-boundaries': ['error', { features: FEATURES }],
      'krab/ui-sdk-priority': ['error', { bitsUi: BITS_UI_WRAPPERS }]
    }
  },
  {
    files: ['**/package.json', '**/components.json'],
    languageOptions: { parser: yaml },
    plugins: { krab },
    rules: { 'krab/ui-sdk-priority': ['error', { bitsUi: BITS_UI_WRAPPERS }] }
  },
  {
    files: ['**/*.{ts,mts,cts,svelte}'],
    extends: [ts.configs.strictTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
        extraFileExtensions: ['.svelte']
      }
    }
  },
  svelte.configs.recommended,
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: { parserOptions: { parser: ts.parser } }
  },
  {
    files: ['src/**/*.svelte', 'src/lib/**/*.ts'],
    ignores: ['**/*.test.ts', '**/*.d.ts'],
    plugins: { krab },
    rules: { 'krab/ui-copy': 'error' }
  },
  {
    files: CHROME,
    ignores: ['**/*.test.ts', '**/*.d.ts'],
    plugins: { krab },
    rules: { 'krab/chrome-tokens': ['error', { stylesheet: 'src/app.css' }] }
  },
  {
    files: ['.github/workflows/*.{yml,yaml}'],
    languageOptions: { parser: yaml },
    plugins: { krab },
    rules: { 'krab/ci-time-limit': 'error' }
  },
  {
    files: ['e2e/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          name: '@playwright/test',
          importNames: ['test'],
          message: USE_FIXTURE_TEST
        }
      ],
      'no-restricted-syntax': [
        'error',
        ...EFFECT_ONLY,
        {
          selector: "ImportExpression[source.value='@playwright/test']",
          message: USE_FIXTURE_TEST
        }
      ]
    }
  },
  prettier
]);
