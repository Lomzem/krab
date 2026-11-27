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

const ALLOWED_FEATURE_IMPORTS = {
  'app-shell': [],
  compass: [],
  location: ['trip'],
  map: [],
  'on-water': ['app-shell', 'compass', 'location', 'map', 'trip'],
  trip: []
};

const CHROME = [
  'src/lib/features/on-water/**/*.{ts,svelte}',
  'src/lib/features/compass/**/*.{ts,svelte}',
  'src/lib/features/map/**/*.{ts,svelte}',
  'src/lib/shared/**/*.{ts,svelte}',
  'src/routes/**/*.svelte'
];

const MAP_CANVAS = 'src/lib/features/map/base-style.ts';

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

const USE_RECIPE_TEST =
  "Import test from './recipe', whose auto fixtures run doctor and answer NOAA and OpenFreeMap.";

const PLAYWRIGHT_TEST = '@?playwright.test';

const testOnlyFrom = (allowed, otherTests, message) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        { regex: `^(?!${allowed}$)`, importNames: ['test'], message },
        { regex: `^(?:${otherTests})$`, importNames: ['default'], message }
      ]
    }
  ],
  'no-restricted-syntax': [
    'error',
    ...EFFECT_ONLY,
    {
      selector: `ImportExpression:matches([source.value=/^(?:${otherTests})$/], [source.quasis.0.value.cooked=/^(?:${otherTests})$/])`,
      message
    }
  ]
});

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
      'krab/feature-boundaries': [
        'error',
        { features: ALLOWED_FEATURE_IMPORTS }
      ],
      'krab/ui-sdk-priority': 'error'
    }
  },
  {
    files: ['**/package.json', '**/components.json'],
    languageOptions: { parser: yaml },
    plugins: { krab },
    rules: { 'krab/ui-sdk-priority': 'error' }
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
    ignores: ['**/*.test.ts', '**/*.d.ts', MAP_CANVAS],
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
    rules: testOnlyFrom('\\./fixtures', PLAYWRIGHT_TEST, USE_FIXTURE_TEST)
  },
  {
    files: ['scripts/verify-krab/**/*.ts'],
    ignores: ['scripts/verify-krab/recipe.ts', '**/*.test.ts'],
    rules: testOnlyFrom(
      '\\./recipe',
      `${PLAYWRIGHT_TEST}|(?:\\.\\.?.)+e2e.fixtures(?:\\.ts)?`,
      USE_RECIPE_TEST
    )
  },
  prettier
]);
