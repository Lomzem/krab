import type { Rule } from 'eslint';
import type * as ESTree from 'estree';
import { basename, relative } from 'node:path';
import { getStaticYAMLValue, type AST } from 'yaml-eslint-parser';

type Options = { bitsUi: string[] };

const BITS_UI = /^bits-ui(?:\/|$)/;
const SHADCN = /^shadcn-svelte(?:\/|$)/;
const DEPENDENCY_FIELDS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies'
];

const specifierOf = (node: ESTree.Node | null | undefined) => {
  if (node?.type === 'Literal' && typeof node.value === 'string')
    return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? null;
  return null;
};

const NPM_ALIAS = /^npm:((?:@[^/@]+\/)?[^@]+)/;

const dependencyProblems = (manifest: unknown) =>
  DEPENDENCY_FIELDS.flatMap((field) => {
    const dependencies =
      typeof manifest === 'object' && manifest !== null
        ? (manifest as Record<string, unknown>)[field]
        : null;
    if (typeof dependencies !== 'object' || dependencies === null) return [];
    return Object.entries(dependencies).flatMap(([name, version]) => {
      const target =
        typeof version === 'string' ? NPM_ALIAS.exec(version)?.[1] : undefined;
      if (SHADCN.test(name))
        return [{ messageId: 'shadcnDependency', data: { name, field } }];
      if (
        target !== undefined &&
        target !== name &&
        (SHADCN.test(target) || BITS_UI.test(target))
      )
        return [{ messageId: 'alias', data: { name, field, target } }];
      return [];
    });
  });

const checkManifest = (context: Rule.RuleContext, program: AST.YAMLProgram) => {
  for (const document of program.body)
    for (const problem of dependencyProblems(
      document.content ? getStaticYAMLValue(document.content) : null
    ))
      context.report({ loc: document.loc, ...problem });
};

export const uiSdkPriority: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: { bitsUi: { type: 'array', items: { type: 'string' } } },
        required: ['bitsUi'],
        additionalProperties: false
      }
    ],
    messages: {
      shadcnDependency:
        '{{name}} in {{field}} brings shadcn-svelte back. Build controls with UI SDK primitives instead.',
      registry:
        'components.json is shadcn-svelte registry scaffolding. Build controls with UI SDK primitives instead.',
      alias:
        '{{name}} in {{field}} aliases {{target}} under another name. Build controls with UI SDK primitives instead.',
      shadcnImport:
        'Importing {{specifier}} brings shadcn-svelte back. Build controls with UI SDK primitives instead.',
      bitsUi:
        'Importing {{specifier}} outside the bait command wrappers adds to bits-ui, which UI SDK replaces. Build controls with UI SDK primitives instead.'
    }
  },
  create: (context) => {
    const [{ bitsUi }] = context.options as [Options];
    const file = relative(context.cwd, context.filename);
    const name = basename(file);
    const bitsUiAllowed = bitsUi.includes(file);

    const check = (
      node: ESTree.Node,
      source: ESTree.Node | null | undefined
    ) => {
      const specifier = specifierOf(source);
      if (specifier === null) return;
      if (SHADCN.test(specifier))
        context.report({
          node,
          messageId: 'shadcnImport',
          data: { specifier }
        });
      else if (BITS_UI.test(specifier) && !bitsUiAllowed)
        context.report({ node, messageId: 'bitsUi', data: { specifier } });
    };

    if (name === 'package.json' || name === 'components.json')
      return {
        Program(node) {
          if (name === 'components.json')
            context.report({ node, messageId: 'registry' });
          else checkManifest(context, node as unknown as AST.YAMLProgram);
        }
      };

    return {
      ImportDeclaration(node) {
        check(node, node.source);
      },
      ExportNamedDeclaration(node) {
        check(node, node.source);
      },
      ExportAllDeclaration(node) {
        check(node, node.source);
      },
      ImportExpression(node) {
        check(node, node.source);
      },
      CallExpression(node) {
        check(node, node.arguments[0]);
      },
      'TSImportType, TSExternalModuleReference'(node: ESTree.Node) {
        const typed = node as unknown as {
          source?: ESTree.Node;
          expression?: ESTree.Node;
        };
        check(node, typed.source ?? typed.expression);
      }
    };
  }
};
