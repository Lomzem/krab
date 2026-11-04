import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import { plugin as shadcn } from '@shadcn/lint';

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
    linterOptions: { noInlineConfig: true },
    rules: {
      'no-restricted-syntax': ['error', ...EFFECT_ONLY],
      'max-depth': ['error', 3],
      'max-nested-callbacks': ['error', 2],
      'no-nested-ternary': 'error'
    }
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
    languageOptions: { parserOptions: { parser: ts.parser } },
    rules: { 'svelte/comment-directive': 'off' }
  },
  {
    files: ['**/*.{ts,svelte}'],
    plugins: { shadcn },
    settings: { shadcn: { ui: '#lib/components/ui' } },
    rules: { 'shadcn/no-restyle': ['error', { allow: ['layout'] }] }
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
  {
    files: ['src/lib/components/ui/**'],
    rules: { 'shadcn/no-restyle': 'off' }
  },
  prettier
]);
