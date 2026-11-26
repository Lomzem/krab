import type { Rule } from 'eslint';
import type * as ESTree from 'estree';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AST } from 'svelte-eslint-parser';

type Options = { stylesheet: string };
type Tokens = { colors: Set<string>; text: Set<string>; spacing: Set<string> };
type Parented = { type: string; parent?: Parented | null };
type Problem = { messageId: string; value: string };

const RAW_COLOR =
  /#[0-9a-f]{3,8}(?![\w-])|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const WHOLE_COLOR =
  /^(?:#[0-9a-f]{3,8}|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(.*\))$/i;
const COLOR_PREFIX =
  '(?:bg|text|border(?:-[xytrblse])?|divide|outline|ring(?:-offset)?|inset-ring|shadow|inset-shadow|drop-shadow|text-shadow|fill|stroke|from|via|to|accent|caret|decoration|placeholder)';
const PALETTE = new RegExp(
  `^${COLOR_PREFIX}-(?:black|white|(?:slate|gray|zinc|neutral|stone|taupe|mauve|mist|olive|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3})(?:/.+)?$`
);
const TEXT = /^text-(?!shadow-)(.+?)(?:\/[\w.[\]]+)?$/;
const TEXT_UTILITIES = new Set([
  'left',
  'center',
  'right',
  'justify',
  'start',
  'end',
  'wrap',
  'nowrap',
  'balance',
  'pretty',
  'ellipsis',
  'clip',
  'transparent',
  'current',
  'inherit'
]);
const SPACING =
  /^(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|scroll-[pm][xytrblse]?)-(.+)$/;
const SPACING_KEYWORDS = new Set(['px', 'auto', 'reverse']);
const SPACING_PROPERTY =
  /^(?:padding|margin|gap|row-gap|column-gap|scroll-padding|scroll-margin)(?:-[a-z-]+)?$/;
const SAFE_AREA = 'safe-area-inset-';
const SVG_PAINT =
  /^(?:currentColor|none|transparent|inherit|url\(#[\w-]+\)|var\(--[\w-]+\))$/;
const PAINT_ATTRIBUTES = new Set([
  'fill',
  'stroke',
  'color',
  'stop-color',
  'flood-color',
  'lighting-color'
]);

const loaded = new Map<string, Tokens>();
const tokensOf = (path: string) => {
  const known = loaded.get(path);
  if (known) return known;
  const css = readFileSync(path, 'utf8');
  const names = (pattern: RegExp) =>
    new Set([...css.matchAll(pattern)].map(([, name]) => name));
  const tokens = {
    colors: names(/--color-([a-z0-9]+(?:-[a-z0-9]+)*)\s*:/g),
    text: names(/--text-([a-z0-9]+(?:-[a-z0-9]+)*)\s*:/g),
    spacing: names(/--spacing-([a-z0-9]+(?:-[a-z0-9]+)*)\s*:/g)
  };
  loaded.set(path, tokens);
  return tokens;
};

const utilityOf = (token: string) => {
  let depth = 0;
  let start = 0;
  for (let at = 0; at < token.length; at += 1) {
    const character = token[at];
    if (character === '[' || character === '(') depth += 1;
    else if (character === ']' || character === ')') depth -= 1;
    else if (character === ':' && depth === 0) start = at + 1;
  }
  return token.slice(start).replace(/^!|!$/g, '').replace(/^-/, '');
};

const isArbitrary = (value: string) => /^[[(].*[\])]$/.test(value);

const textProblem = (value: string, tokens: Tokens): string | null => {
  if (tokens.text.has(value) || tokens.colors.has(value)) return null;
  if (TEXT_UTILITIES.has(value)) return null;
  if (isArbitrary(value) && /^[[(](?:color:|var\(--color-)/.test(value))
    return null;
  return 'typography';
};

const spacingProblem = (value: string, tokens: Tokens) => {
  if (/^\d+(?:\.\d+)?$/.test(value) || SPACING_KEYWORDS.has(value)) return null;
  if (tokens.spacing.has(value)) return null;
  if (
    isArbitrary(value) &&
    (value.includes(SAFE_AREA) || value.includes('--spacing'))
  )
    return null;
  return 'spacing';
};

const classProblems = (token: string, tokens: Tokens): Problem[] => {
  const utility = utilityOf(token);
  if (/[[(]/.test(utility) && RAW_COLOR.test(utility))
    return [{ messageId: 'color', value: token }];
  if (PALETTE.test(utility)) return [{ messageId: 'palette', value: token }];
  const text = TEXT.exec(utility)?.[1];
  const textIssue = text === undefined ? null : textProblem(text, tokens);
  if (textIssue) return [{ messageId: textIssue, value: token }];
  const spacing = SPACING.exec(utility)?.[1];
  const spacingIssue =
    spacing === undefined ? null : spacingProblem(spacing, tokens);
  return spacingIssue ? [{ messageId: spacingIssue, value: token }] : [];
};

const declarationProblems = (property: string, value: string): Problem[] => {
  const shown = `${property}: ${value.trim()}`;
  if (RAW_COLOR.test(value)) return [{ messageId: 'color', value: shown }];
  if (property === 'font-size' && !/var\(--text-/.test(value))
    return [{ messageId: 'typography', value: shown }];
  if (
    SPACING_PROPERTY.test(property) &&
    !/^\s*(?:0|auto)?\s*$/.test(value) &&
    !value.includes(SAFE_AREA) &&
    !value.includes('var(--spacing')
  )
    return [{ messageId: 'spacing', value: shown }];
  return [];
};

const styleProblems = (css: string) =>
  [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+)/g)].flatMap(
    ([, property = '', value = '']) => declarationProblems(property, value)
  );

const classListProblems = (text: string, tokens: Tokens) =>
  text
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((token) => classProblems(token, tokens));

type Context =
  | { kind: 'class' }
  | { kind: 'attribute' }
  | { kind: 'style' }
  | { kind: 'property'; property: string }
  | { kind: 'paint' };

const contextOf = (node: Parented): Context => {
  for (let at = node.parent; at; at = at.parent) {
    if (at.type === 'SvelteStyleDirective') {
      const directive = at as unknown as { key: { name: { name: string } } };
      return { kind: 'property', property: directive.key.name.name };
    }
    if (at.type === 'SvelteAttribute') {
      const name = (at as unknown as { key: { name: string } }).key.name;
      if (name === 'style') return { kind: 'style' };
      if (PAINT_ATTRIBUTES.has(name)) return { kind: 'paint' };
      return { kind: name === 'class' ? 'class' : 'attribute' };
    }
    if (at.type === 'SvelteStartTag') break;
  }
  return { kind: 'class' };
};

const problemsOf = (text: string, context: Context, tokens: Tokens) => {
  switch (context.kind) {
    case 'style':
      return styleProblems(text);
    case 'property':
      return declarationProblems(context.property, text);
    case 'paint':
      return SVG_PAINT.test(text.trim()) || text.trim() === ''
        ? []
        : [{ messageId: 'paint', value: text.trim() }];
    case 'class':
      if (WHOLE_COLOR.test(text.trim()))
        return [{ messageId: 'color', value: text.trim() }];
      return classListProblems(text, tokens);
    case 'attribute':
      return classListProblems(text, tokens);
  }
};

export const chromeTokens: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { stylesheet: { type: 'string' } },
        required: ['stylesheet'],
        additionalProperties: false
      }
    ],
    messages: {
      color:
        'Raw color in {{value}}. Use a semantic color token from the global stylesheet, such as text-foreground or bg-card.',
      palette:
        '{{value}} uses the Tailwind palette. Use a semantic color token from the global stylesheet.',
      typography:
        '{{value}} is off the type scale. Use a text size token from the global stylesheet: {{text}}.',
      spacing:
        '{{value}} is off the spacing scale. Use the numeric scale or a spacing token ({{spacing}}); only safe-area insets take arbitrary values.',
      paint:
        'SVG paint {{value}} is not currentColor, none, url(#id) or a var(--token).'
    }
  },
  create: (context) => {
    const [{ stylesheet }] = context.options as [Options];
    const tokens = tokensOf(resolve(context.cwd, stylesheet));
    const data = {
      text: [...tokens.text].map((name) => `text-${name}`).join(', '),
      spacing: [...tokens.spacing].join(', ')
    };
    const report = (node: ESTree.Node, problems: Problem[]) => {
      for (const problem of problems)
        context.report({
          node,
          messageId: problem.messageId,
          data: { ...data, value: problem.value }
        });
    };
    const check = (node: ESTree.Node, text: string) => {
      report(node, problemsOf(text, contextOf(node), tokens));
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked ?? node.value.raw);
      },
      SvelteLiteral(node: ESTree.Node) {
        check(node, (node as unknown as AST.SvelteLiteral).value);
      },
      SvelteDirective(node: ESTree.Node) {
        const directive = node as unknown as AST.SvelteDirective;
        if (directive.kind === 'Class') check(node, directive.key.name.name);
      },
      SvelteStyleElement(node: ESTree.Node) {
        const style = node as unknown as AST.SvelteStyleElement;
        report(
          node,
          styleProblems(style.children.map((child) => child.value).join(''))
        );
      }
    };
  }
};
