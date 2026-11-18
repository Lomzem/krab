import type { ESLint, Rule } from 'eslint';
import type { Node } from 'estree';
import type { AST } from 'svelte-eslint-parser';

const SLOT = '\uE000';
const SHORTEN = 'Shorten the text or delete it.';
const MESSAGES = {
  words: `UI copy has {{count}} words; the limit is 5. ${SHORTEN}`,
  punctuation: `UI copy uses sentence punctuation: no period or ! between phrases or at the end, and ? only at the end. ${SHORTEN}`,
  secondPerson: `UI copy addresses the reader as you or your. ${SHORTEN}`,
  dash: `UI copy uses an em or en dash. ${SHORTEN}`
};
type Problem = { messageId: keyof typeof MESSAGES; count?: number };

const COPY_ATTRIBUTES = new Set([
  'alt',
  'aria-description',
  'aria-label',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'description',
  'heading',
  'label',
  'message',
  'placeholder',
  'text',
  'title'
]);
const CODE_ATTRIBUTES = new Set([
  'class',
  'd',
  'href',
  'id',
  'src',
  'srcset',
  'style',
  'viewBox'
]);
const INLINE = new Set([
  'a',
  'abbr',
  'b',
  'bdi',
  'data',
  'em',
  'i',
  'kbd',
  'mark',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time'
]);
const CONTAINERS = new Set([
  'Program',
  'SvelteElement',
  'SvelteIfBlock',
  'SvelteElseBlock',
  'SvelteEachBlock',
  'SvelteKeyBlock',
  'SvelteSnippetBlock',
  'SvelteAwaitPendingBlock',
  'SvelteAwaitThenBlock',
  'SvelteAwaitCatchBlock'
]);
const DEVELOPER_CALLS = new Set(['Error', 'TaggedError', 'RegExp']);
const COMPARISONS = new Set(['===', '!==', '==', '!=', 'in']);
const CLASS_TOKEN =
  /^[a-z0-9!@:_\-[\]/.%#()&>*~=,+'"\uE000]*[a-z0-9\])%\uE000]$/;

const WORD_CHARACTER = /[\p{L}\p{N}\uE000]/u;
const words = (text: string) =>
  text.split(/\s+/).filter((token) => WORD_CHARACTER.test(token));
const isClassList = (tokens: readonly string[]) =>
  tokens.every((token) => CLASS_TOKEN.test(token)) &&
  tokens.some((token) => /[-:[]/.test(token));

type Choices = readonly (readonly string[])[];
type Check<S> = {
  start: S;
  step: (state: S, character: string) => readonly [S, number];
};
type Punctuation = 'plain' | 'stop' | 'ask' | 'asked';

const SECOND_PERSON = new Set(['you', 'your', 'yours', 'yourself']);
const wordCount: Check<boolean> = {
  start: false,
  step: (counted, character) => {
    if (/\s/.test(character)) return [false, 0];
    const starts = !counted && WORD_CHARACTER.test(character);
    return [counted || starts, starts ? 1 : 0];
  }
};
const punctuation: Check<Punctuation> = {
  start: 'plain',
  step: (state, character) => {
    if (/\s/.test(character))
      return state === 'ask' || state === 'asked'
        ? ['asked', 0]
        : ['plain', state === 'stop' ? 1 : 0];
    const hit = state === 'asked' ? 1 : 0;
    if (/[.!]/.test(character)) return ['stop', hit];
    return [character === '?' ? 'ask' : 'plain', hit];
  }
};
const secondPerson: Check<string> = {
  start: '',
  step: (run, character) => {
    if (!/\w/iu.test(character)) return ['', SECOND_PERSON.has(run) ? 1 : 0];
    const next = run + character.toLowerCase();
    return ['yourself'.startsWith(next) ? next : '-', 0];
  }
};
const dash: Check<null> = {
  start: null,
  step: (state, character) => [state, /[\u2013\u2014]/.test(character) ? 1 : 0]
};

const read = <S>(check: Check<S>, from: S, option: string) => {
  let state = from;
  let gained = 0;
  for (const character of option) {
    const [to, gain] = check.step(state, character);
    state = to;
    gained += gain;
  }
  return [state, gained] as const;
};

const most = <S>(choices: Choices, check: Check<S>) => {
  let best = new Map([[check.start, 0]]);
  for (const options of [...choices, [' ']]) {
    const next = new Map<S, number>();
    for (const [from, score] of best)
      for (const option of options) {
        const [to, gained] = read(check, from, option);
        next.set(to, Math.max(next.get(to) ?? 0, score + gained));
      }
    best = next;
  }
  return Math.max(...best.values());
};

export const copyProblems = (choices: Choices): Problem[] => {
  const problems: Problem[] = [];
  const count = most(choices, wordCount);
  if (count > 5) problems.push({ messageId: 'words', count });
  if (most(choices, punctuation) > 0)
    problems.push({ messageId: 'punctuation' });
  if (most(choices, secondPerson) > 0)
    problems.push({ messageId: 'secondPerson' });
  if (most(choices, dash) > 0) problems.push({ messageId: 'dash' });
  return problems;
};

const scriptCopyProblems = (raw: string): Problem[] => {
  const text = raw
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = words(text);
  if (tokens.length === 0 || /[[\]={}<>|\\]/.test(text)) return [];
  const problems = copyProblems([[text]]);
  const secondPerson = problems.some(
    ({ messageId }) => messageId === 'secondPerson'
  );
  if (!secondPerson && tokens.length > 1 && isClassList(text.split(' ')))
    return [];
  return problems;
};

type Parented = { type: string; parent?: Parented | null };

const attributeName = (node: Parented) => {
  for (let at = node.parent; at; at = at.parent) {
    if (at.type === 'SvelteAttribute')
      return (at as unknown as AST.SvelteAttribute).key.name;
    if (at.type === 'SvelteStyleDirective') return 'style';
    if (at.type === 'SvelteDirective') {
      const directive = at as unknown as AST.SvelteDirective;
      return directive.kind === 'Class' ? 'class' : null;
    }
    if (at.type === 'SvelteStartTag') return null;
  }
  return null;
};

const calleeName = (callee: Node) => {
  if (callee.type === 'Identifier') return callee.name;
  if (
    callee.type === 'MemberExpression' &&
    callee.property.type === 'Identifier'
  )
    return callee.property.name;
  return null;
};

const RUNTIME_WRAPPERS = new Set([
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
  'TSTypeAssertion'
]);

const unwrap = (start: Parented) => {
  let node = start;
  while (
    node.parent &&
    RUNTIME_WRAPPERS.has(node.parent.type) &&
    (node.parent as unknown as { expression: unknown }).expression === node
  )
    node = node.parent;
  return node;
};

const isValue = (node: Parented, parent: Parented) => {
  if (parent.type === 'ConditionalExpression')
    return (parent as unknown as { test: unknown }).test !== node;
  if (parent.type === 'LogicalExpression') {
    const logical = parent as unknown as { operator: string; left: unknown };
    return logical.left !== node || logical.operator !== '&&';
  }
  return false;
};

const isCopyTag = (tag: Parented) => {
  if ((tag as unknown as AST.SvelteMustacheTag).kind !== 'text') return false;
  const at = tag.parent;
  if (at?.type === 'SvelteAttribute')
    return COPY_ATTRIBUTES.has((at as unknown as AST.SvelteAttribute).key.name);
  return at !== undefined && at !== null && CONTAINERS.has(at.type);
};

const isRendered = (literal: Parented) => {
  let node = unwrap(literal);
  while (node.parent && isValue(node, node.parent)) node = unwrap(node.parent);
  return node.parent?.type === 'SvelteMustacheTag' && isCopyTag(node.parent);
};

type Expression = Parented & Record<string, unknown>;

const renderings = (start: Expression): string[] => {
  let node = start;
  while (RUNTIME_WRAPPERS.has(node.type)) node = node.expression as Expression;
  switch (node.type) {
    case 'Literal':
      return typeof node.value === 'string' ? [node.value] : [SLOT];
    case 'TemplateLiteral':
      return [
        (node.quasis as { value: { cooked?: string | null } }[])
          .map((part) => part.value.cooked ?? '')
          .join(SLOT)
      ];
    case 'ConditionalExpression':
      return [
        ...renderings(node.consequent as Expression),
        ...renderings(node.alternate as Expression)
      ];
    case 'LogicalExpression':
      return [
        ...(node.operator === '&&'
          ? [SLOT]
          : renderings(node.left as Expression)),
        ...renderings(node.right as Expression)
      ];
    default:
      return [SLOT];
  }
};

type Part = AST.SvelteLiteral | AST.SvelteMustacheTag | AST.SvelteText;
const partRenderings = (part: Part) => {
  if (part.type !== 'SvelteMustacheTag') return [part.value];
  if (part.kind !== 'text') return [SLOT];
  return renderings(part.expression as unknown as Expression);
};

const isCode = (literal: Parented) => {
  const node = unwrap(literal);
  const parent = node.parent as Node | null | undefined;
  if (!parent) return false;
  switch (parent.type) {
    case 'ImportDeclaration':
    case 'ExportAllDeclaration':
    case 'ExportNamedDeclaration':
    case 'ImportExpression':
    case 'SwitchCase':
    case 'TaggedTemplateExpression':
      return true;
    case 'Property':
    case 'PropertyDefinition':
    case 'MethodDefinition':
      return parent.key === node;
    case 'MemberExpression':
      return parent.property === node;
    case 'BinaryExpression':
      return COMPARISONS.has(parent.operator);
    case 'CallExpression':
    case 'NewExpression': {
      const name = calleeName(parent.callee);
      return (
        (name !== null && DEVELOPER_CALLS.has(name)) ||
        (parent.callee.type === 'MemberExpression' &&
          parent.callee.object.type === 'Identifier' &&
          parent.callee.object.name === 'console')
      );
    }
    default:
      break;
  }
  if ((parent.type as string).startsWith('TS')) return true;
  const attribute = attributeName(node);
  return (
    attribute !== null &&
    (CODE_ATTRIBUTES.has(attribute) || attribute.startsWith('data-'))
  );
};

type Run = { parts: string[][]; node: Parented };
type Child = AST.SvelteHTMLElement['children'][number];

const isAlternative = (attribute: AST.SvelteStartTag['attributes'][number]) =>
  attribute.type === 'SvelteAttribute' &&
  (attribute.key.name === 'aria-hidden' ||
    (attribute.key.name === 'class' &&
      attribute.value.some(
        (part) =>
          part.type === 'SvelteLiteral' && /\bsr-only\b/.test(part.value)
      )));

const isInline = (node: Child): node is AST.SvelteHTMLElement =>
  node.type === 'SvelteElement' &&
  node.kind === 'html' &&
  INLINE.has(node.name.name) &&
  !node.startTag.attributes.some(isAlternative);

const phrases = (children: readonly Child[]): Run[] => {
  const runs: Run[] = [];
  const open: { run: Run | null } = { run: null };
  const extend = (part: Part) => {
    open.run ??= { parts: [], node: part };
    open.run.parts.push(partRenderings(part));
  };
  const walk = (list: readonly Child[]) => {
    for (const child of list) {
      if (child.type === 'SvelteText' || child.type === 'SvelteMustacheTag')
        extend(child);
      else if (isInline(child)) walk(child.children);
      else if (child.type !== 'SvelteHTMLComment') {
        if (open.run) runs.push(open.run);
        open.run = null;
      }
    }
  };
  walk(children);
  if (open.run) runs.push(open.run);
  return runs;
};

const rule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'UI copy is at most 5 words, with no sentence punctuation, second person or em or en dashes'
    },
    messages: MESSAGES,
    schema: []
  },
  create(context) {
    const report = (node: Parented, problems: readonly Problem[]) => {
      for (const { messageId, count } of problems)
        context.report({
          node: node as unknown as Rule.Node,
          messageId,
          data: { count: String(count) }
        });
    };
    const container = (node: { children: readonly Child[] }) => {
      for (const run of phrases(node.children))
        report(run.node, copyProblems(run.parts));
    };
    const containerNode = (node: Parented & { children: readonly Child[] }) => {
      if (isInline(node as unknown as Child)) return;
      container(node);
    };
    const literal = (node: Rule.Node, text: string) => {
      if (!isRendered(node) && !isCode(node))
        report(node, scriptCopyProblems(text));
    };
    const script: Rule.RuleListener = {
      Literal(node) {
        if (typeof node.value === 'string') literal(node, node.value);
      },
      TemplateLiteral(node) {
        literal(
          node,
          node.quasis.map((part) => part.value.cooked ?? '').join(SLOT)
        );
      }
    };
    const markup = {
      SvelteAttribute(node: AST.SvelteAttribute) {
        if (!COPY_ATTRIBUTES.has(node.key.name)) return;
        report(node, copyProblems(node.value.map(partRenderings)));
      },
      Program(node: { body: unknown[] }) {
        container({ children: node.body as Child[] });
      },
      ...Object.fromEntries(
        [...CONTAINERS]
          .filter((type) => type !== 'Program')
          .map((type) => [type, containerNode])
      )
    };
    return { ...script, ...(markup as unknown as Rule.RuleListener) };
  }
};

export default {
  meta: { name: 'krab' },
  rules: { 'ui-copy': rule }
} satisfies ESLint.Plugin;
