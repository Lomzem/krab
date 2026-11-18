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
const DEVELOPER_CALLS = new Set(['Error', 'TaggedError', 'RegExp']);
const COMPARISONS = new Set(['===', '!==', '==', '!=', 'in']);
const CLASS_TOKEN =
  /^[a-z0-9!@:_\-[\]/.%#()&>*~=,+'"\uE000]*[a-z0-9\])%\uE000]$/;

const words = (text: string) =>
  text.split(/\s+/).filter((token) => /[\p{L}\p{N}\uE000]/u.test(token));
const isClassList = (tokens: readonly string[]) =>
  tokens.every((token) => CLASS_TOKEN.test(token)) &&
  tokens.some((token) => /[-:[]/.test(token));

export const copyProblems = (raw: string): Problem[] => {
  const text = raw.replace(/\s+/g, ' ').trim();
  const tokens = words(text);
  const problems: Problem[] = [];
  if (tokens.length > 5)
    problems.push({ messageId: 'words', count: tokens.length });
  if (/[.!](?:\s|$)|\?\s/.test(text))
    problems.push({ messageId: 'punctuation' });
  if (/\byou(?:r|rs|rself|['’](?:re|ve|ll|d))?\b/iu.test(text))
    problems.push({ messageId: 'secondPerson' });
  if (/[\u2013\u2014]/.test(text)) problems.push({ messageId: 'dash' });
  return problems;
};

const scriptCopyProblems = (raw: string): Problem[] => {
  const text = raw
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const tokens = words(text);
  if (tokens.length === 0 || /[[\]={}<>|\\]/.test(text)) return [];
  const problems = copyProblems(text);
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
    if (at.type === 'SvelteDirective' || at.type === 'SvelteStyleDirective') {
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

const isRendered = (literal: Parented) => {
  let node = unwrap(literal);
  while (node.parent && isValue(node, node.parent)) node = unwrap(node.parent);
  const tag = node.parent;
  if (tag?.type !== 'SvelteMustacheTag') return false;
  if ((tag as unknown as AST.SvelteMustacheTag).kind !== 'text') return false;
  if (tag.parent?.type !== 'SvelteAttribute') return true;
  return COPY_ATTRIBUTES.has(
    (tag.parent as unknown as AST.SvelteAttribute).key.name
  );
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

type Run = { text: string; node: Parented };
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
  const extend = (text: string, node: Parented) => {
    open.run ??= { text: '', node };
    open.run.text += text;
  };
  const walk = (list: readonly Child[]) => {
    for (const child of list) {
      if (child.type === 'SvelteText') extend(child.value, child);
      else if (child.type === 'SvelteMustacheTag') extend(` ${SLOT} `, child);
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
        report(run.node, copyProblems(run.text));
    };
    const containerNode = (node: Parented & { children: readonly Child[] }) => {
      if (isInline(node as unknown as Child)) return;
      container(node);
    };
    const literal = (node: Rule.Node, text: string) => {
      if (isRendered(node)) report(node, copyProblems(text));
      else if (!isCode(node)) report(node, scriptCopyProblems(text));
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
        report(
          node,
          copyProblems(
            node.value
              .map((part) =>
                part.type === 'SvelteLiteral' ? part.value : SLOT
              )
              .join('')
          )
        );
      },
      Program(node: { body: unknown[] }) {
        container({ children: node.body as Child[] });
      },
      SvelteElement: containerNode,
      SvelteIfBlock: containerNode,
      SvelteElseBlock: containerNode,
      SvelteEachBlock: containerNode,
      SvelteKeyBlock: containerNode,
      SvelteSnippetBlock: containerNode,
      SvelteAwaitPendingBlock: containerNode,
      SvelteAwaitThenBlock: containerNode,
      SvelteAwaitCatchBlock: containerNode
    };
    return { ...script, ...(markup as unknown as Rule.RuleListener) };
  }
};

export default {
  meta: { name: 'krab' },
  rules: { 'ui-copy': rule }
} satisfies ESLint.Plugin;
