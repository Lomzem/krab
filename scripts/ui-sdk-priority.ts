import type { Rule, Scope } from 'eslint';
import type * as ESTree from 'estree';
import { basename, relative } from 'node:path';
import { getStaticYAMLValue, type AST } from 'yaml-eslint-parser';
import { bareSpecifier, packageImportTargets } from './package-imports.ts';

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

const isCreateRequire = (node: ESTree.Node | null | undefined) =>
  node?.type === 'CallExpression' &&
  (node.callee.type === 'MemberExpression'
    ? node.callee.property.type === 'Identifier' &&
      node.callee.property.name === 'createRequire'
    : node.callee.type === 'Identifier' &&
      node.callee.name === 'createRequire');

const propertyName = (member: ESTree.MemberExpression) =>
  member.computed
    ? specifierOf(member.property)
    : (member.property as ESTree.Identifier).name;

const isImportMeta = (node: ESTree.Node) =>
  node.type === 'MetaProperty' &&
  node.meta.name === 'import' &&
  node.property.name === 'meta';

const isRequire = (node: ESTree.Node, scope: Scope.Scope | null) => {
  if (node.type !== 'Identifier') return isCreateRequire(node);
  if (node.name === 'require') return true;
  for (let at = scope; at; at = at.upper) {
    const variable = at.set.get(node.name);
    if (variable)
      return variable.defs.some(
        (definition) =>
          definition.node.type === 'VariableDeclarator' &&
          isCreateRequire(definition.node.init)
      );
  }
  return false;
};

const isLoader = (call: ESTree.CallExpression, scope: Scope.Scope | null) => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return isRequire(callee, scope);
  return (
    propertyName(callee) === 'resolve' &&
    (isImportMeta(callee.object) || isRequire(callee.object, scope))
  );
};

const NPM_ALIAS = /^npm:((?:@[^/@]+\/)?[^@]+)/;

const dependencyProblems = (manifest: unknown, bitsUi: string[]) =>
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
      if (BITS_UI.test(name) && bitsUi.length === 0)
        return [{ messageId: 'bitsUiDependency', data: { name, field } }];
      if (
        target !== undefined &&
        target !== name &&
        (SHADCN.test(target) || BITS_UI.test(target))
      )
        return [{ messageId: 'alias', data: { name, field, target } }];
      return [];
    });
  });

const checkManifest = (
  context: Rule.RuleContext,
  program: AST.YAMLProgram,
  bitsUi: string[]
) => {
  for (const document of program.body)
    for (const problem of dependencyProblems(
      document.content ? getStaticYAMLValue(document.content) : null,
      bitsUi
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
      bitsUiDependency:
        '{{name}} in {{field}} outlives the bait command wrappers. Remove bits-ui, which UI SDK replaces.',
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
      const bare = bareSpecifier(specifier);
      const loads = [bare, ...packageImportTargets(bare, context.filename)];
      if (loads.some((load) => SHADCN.test(load)))
        context.report({
          node,
          messageId: 'shadcnImport',
          data: { specifier }
        });
      else if (loads.some((load) => BITS_UI.test(load)) && !bitsUiAllowed)
        context.report({ node, messageId: 'bitsUi', data: { specifier } });
    };

    if (name === 'package.json' || name === 'components.json')
      return {
        Program(node) {
          if (name === 'components.json')
            context.report({ node, messageId: 'registry' });
          else
            checkManifest(context, node as unknown as AST.YAMLProgram, bitsUi);
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
        if (isLoader(node, context.sourceCode.getScope(node)))
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
