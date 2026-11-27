import type { Rule, Scope } from 'eslint';
import type * as ESTree from 'estree';
import { basename } from 'node:path';
import { getStaticYAMLValue, type AST } from 'yaml-eslint-parser';
import { bareSpecifier, packageImportTargets } from './package-imports.ts';

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

const propertyName = (member: ESTree.MemberExpression) =>
  member.computed
    ? specifierOf(member.property)
    : (member.property as ESTree.Identifier).name;

type ScopeOf = (node: ESTree.Node) => Scope.Scope;

const NODE_MODULE = new Set(['node:module', 'module']);

const variableOf = (name: string, scope: Scope.Scope | null) => {
  for (let at = scope; at; at = at.upper) {
    const variable = at.set.get(name);
    if (variable) return variable;
  }
  return null;
};

const keyName = (property: ESTree.Property) =>
  property.key.type === 'Identifier' && !property.computed
    ? property.key.name
    : specifierOf(property.key);

const importsCreateRequire = (definition: Scope.Definition) =>
  definition.type === 'ImportBinding' &&
  definition.node.type === 'ImportSpecifier' &&
  NODE_MODULE.has(String(definition.parent.source.value)) &&
  (definition.node.imported.type === 'Identifier'
    ? definition.node.imported.name
    : definition.node.imported.value) === 'createRequire';

const destructuresCreateRequire = (definition: Scope.Definition) => {
  if (definition.type !== 'Variable') return false;
  const { id, init } = definition.node;
  const loaded = init?.type === 'AwaitExpression' ? init.argument : init;
  if (
    id.type !== 'ObjectPattern' ||
    loaded?.type !== 'ImportExpression' ||
    !NODE_MODULE.has(specifierOf(loaded.source) ?? '')
  )
    return false;
  return id.properties.some(
    (property) =>
      property.type === 'Property' &&
      (property.value === definition.name ||
        (property.value.type === 'AssignmentPattern' &&
          property.value.left === definition.name)) &&
      keyName(property) === 'createRequire'
  );
};

const namesCreateRequire = (
  node: ESTree.Node | null | undefined,
  scopeOf: ScopeOf,
  seen = new Set<Scope.Variable>()
): boolean => {
  if (node?.type === 'MemberExpression')
    return propertyName(node) === 'createRequire';
  if (node?.type !== 'Identifier') return false;
  const variable = variableOf(node.name, scopeOf(node));
  if (!variable) return node.name === 'createRequire';
  if (seen.has(variable)) return false;
  seen.add(variable);
  return variable.defs.some(
    (definition) =>
      importsCreateRequire(definition) ||
      destructuresCreateRequire(definition) ||
      (definition.type === 'Variable' &&
        definition.node.id.type === 'Identifier' &&
        namesCreateRequire(definition.node.init, scopeOf, seen))
  );
};

const isCreateRequire = (
  node: ESTree.Node | null | undefined,
  scopeOf: ScopeOf
) =>
  node?.type === 'CallExpression' && namesCreateRequire(node.callee, scopeOf);

const isImportMeta = (node: ESTree.Node) =>
  node.type === 'MetaProperty' &&
  node.meta.name === 'import' &&
  node.property.name === 'meta';

const isRequire = (node: ESTree.Node, scopeOf: ScopeOf) => {
  if (node.type !== 'Identifier') return isCreateRequire(node, scopeOf);
  if (node.name === 'require') return true;
  return (
    variableOf(node.name, scopeOf(node))?.defs.some(
      (definition) =>
        definition.node.type === 'VariableDeclarator' &&
        isCreateRequire(definition.node.init, scopeOf)
    ) ?? false
  );
};

const isLoader = (call: ESTree.CallExpression, scopeOf: ScopeOf) => {
  const callee = call.callee;
  if (callee.type !== 'MemberExpression') return isRequire(callee, scopeOf);
  return (
    propertyName(callee) === 'resolve' &&
    (isImportMeta(callee.object) || isRequire(callee.object, scopeOf))
  );
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
      if (BITS_UI.test(name))
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
    schema: [],
    messages: {
      shadcnDependency:
        '{{name}} in {{field}} brings shadcn-svelte back. Build controls with UI SDK primitives instead.',
      bitsUiDependency:
        '{{name}} in {{field}} brings bits-ui back. Build controls with UI SDK primitives instead.',
      registry:
        'components.json is shadcn-svelte registry scaffolding. Build controls with UI SDK primitives instead.',
      alias:
        '{{name}} in {{field}} aliases {{target}} under another name. Build controls with UI SDK primitives instead.',
      shadcnImport:
        'Importing {{specifier}} brings shadcn-svelte back. Build controls with UI SDK primitives instead.',
      bitsUi:
        'Importing {{specifier}} brings bits-ui back. Build controls with UI SDK primitives instead.'
    }
  },
  create: (context) => {
    const name = basename(context.filename);

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
      else if (loads.some((load) => BITS_UI.test(load)))
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
        if (isLoader(node, (at) => context.sourceCode.getScope(at)))
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
