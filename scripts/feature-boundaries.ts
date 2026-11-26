import type { Rule } from 'eslint';
import type * as ESTree from 'estree';
import { basename, dirname, join, relative, resolve } from 'node:path';

type Options = { features: string[] };
type Statement = { type: string; [key: string]: unknown };
type MarkupRoot = {
  expression?: ESTree.Node | null;
  argument?: ESTree.Node;
  value?: ESTree.Node;
};

const LIB_ALIASES = ['#lib/', '$lib/'];
const FEATURE = /^src\/lib\/features\/([^/]+)(?:\/(.*))?$/;
const ENTRYPOINT = /^index(?:\.(?:js|ts))?$/;
const ENTRYPOINT_FILE = /^index\.[^/]+$/;
const DECLARATION_FILE = /\.d\.[mc]?ts$/;
const FRAMEWORK_FILE =
  /^src\/(?:app\.d\.ts|hooks(?:\.(?:client|server|universal))?\.[jt]s|params\/[^/]+\.[jt]s|service-worker(?:\.[jt]s|\/.+))$/;
const ROUTE_FILE =
  /^\+(?:(?:page|layout)(?:@[^.]*)?(?:\.svelte|(?:\.server)?\.[jt]s)|error\.svelte|server\.[jt]s)$/;
const ROUTE_BLOCKS = [
  'SvelteIfBlock',
  'SvelteEachBlock',
  'SvelteAwaitBlock',
  'SvelteKeyBlock',
  'SvelteSnippetBlock',
  'SvelteConstTag',
  'SvelteDeclarationTag'
];
const MARKUP_ROOTS = [
  'SvelteMustacheTag',
  'SvelteRenderTag',
  'SvelteAttachTag',
  'SvelteDirective',
  'SvelteSpecialDirective',
  'SvelteSpreadAttribute',
  'SvelteShorthandAttribute'
];

const targetOf = (specifier: string, fromDir: string, cwd: string) => {
  const path = specifier.split('?', 1)[0] ?? '';
  const alias = LIB_ALIASES.find((prefix) => path.startsWith(prefix));
  if (alias)
    return relative(cwd, resolve(cwd, 'src/lib', path.slice(alias.length)));
  if (path.startsWith('.')) return relative(cwd, resolve(fromDir, path));
  if (!path.startsWith('/')) return null;
  return relative(cwd, path.startsWith(`${cwd}/`) ? path : join(cwd, path));
};

const featureOf = (path: string) => {
  const [, name, rest = ''] = FEATURE.exec(path) ?? [];
  return name ? { name, rest } : null;
};

const literalPath = (node: ESTree.Node) => {
  if (node.type === 'Literal' && typeof node.value === 'string')
    return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0)
    return node.quasis[0]?.value.cooked ?? null;
  return null;
};

const isProps = (init: unknown) => {
  const call = init as ESTree.Node | null;
  return (
    call?.type === 'CallExpression' &&
    call.callee.type === 'Identifier' &&
    call.callee.name === '$props'
  );
};

const isTypeOnly = (node: Statement) =>
  node.type === 'TSTypeAliasDeclaration' ||
  node.type === 'TSInterfaceDeclaration';

const isFrameworkOption = (node: Statement) => {
  const declaration = node.declaration as Statement | null | undefined;
  if (!declaration) return false;
  if (isTypeOnly(declaration)) return true;
  return (
    declaration.type === 'VariableDeclaration' &&
    (declaration as unknown as ESTree.VariableDeclaration).declarations.every(
      (declarator) => declarator.init?.type === 'Literal'
    )
  );
};

const isThinStatement = (node: Statement) => {
  if (node.type === 'ImportDeclaration' || isTypeOnly(node)) return true;
  if (node.type === 'ExportNamedDeclaration') return isFrameworkOption(node);
  return (
    node.type === 'VariableDeclaration' &&
    (node as unknown as ESTree.VariableDeclaration).declarations.every(
      (declarator) => isProps(declarator.init)
    )
  );
};

const isReexport = (node: Statement) =>
  node.type === 'ExportAllDeclaration' ||
  (node.type === 'ExportNamedDeclaration' && !node.declaration);

const exportedName = (specifier: ESTree.ExportSpecifier) =>
  specifier.exported.type === 'Identifier'
    ? specifier.exported.name
    : String(specifier.exported.value);

const propsOf = (body: Statement[]) =>
  body.flatMap((node) =>
    node.type === 'VariableDeclaration'
      ? (node as unknown as ESTree.VariableDeclaration).declarations.filter(
          (declarator) => isProps(declarator.init)
        )
      : []
  );

const propNames = (pattern: ESTree.Pattern): string[] => {
  if (pattern.type === 'Identifier') return [pattern.name];
  if (pattern.type === 'AssignmentPattern') return propNames(pattern.left);
  if (pattern.type === 'RestElement') return propNames(pattern.argument);
  if (pattern.type !== 'ObjectPattern') return [];
  return pattern.properties.flatMap((property) =>
    propNames(property.type === 'Property' ? property.value : property)
  );
};

const propDefaults = (pattern: ESTree.Pattern) =>
  pattern.type === 'ObjectPattern'
    ? pattern.properties.flatMap((property) =>
        property.type === 'Property' &&
        property.value.type === 'AssignmentPattern'
          ? [property.value.right]
          : []
      )
    : [];

export const featureBoundaries: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          features: { type: 'array', items: { type: 'string' } }
        },
        required: ['features'],
        additionalProperties: false
      }
    ],
    messages: {
      placement:
        '{{file}} is outside the application layout. Put feature code in src/lib/features/<feature>/ and code that several features use in src/lib/shared/.',
      routeFile:
        '{{file}} is not a SvelteKit route file. Keep only +page, +layout, +error and +server files in src/routes, and put other code in a feature.',
      undeclared:
        'Feature {{feature}} is not declared. Add it to FEATURES in eslint.config.js, or move the file into a declared feature.',
      entrypoint:
        'Import feature {{feature}} through its public entrypoint, src/lib/features/{{feature}}/index.ts, not {{target}}.',
      entrypointFile:
        'src/lib/features/{{feature}}/index.ts is the only entrypoint file of feature {{feature}}. Rename {{file}}.',
      defaultExport: 'Export a named value instead of a default export.',
      shared:
        'src/lib/shared must not import a feature. Move the code that both need into src/lib/shared.',
      computed:
        'Give {{call}} a literal path, so the feature boundary check can see what it loads.',
      glob: 'import.meta.glob hides imports from the feature boundary check. Import each module by a literal path.',
      wildcard: 'Export each name explicitly instead of export *.',
      passThrough:
        'This file only re-exports other modules. Import from those modules instead.',
      thinRoute:
        'Routes only compose features. Move this {{what}} into a feature.'
    }
  },
  create: (context) => {
    const [{ features }] = context.options as [Options];
    const cwd = context.cwd;
    const file = relative(cwd, context.filename);
    const fromDir = dirname(context.filename);
    const ownFeature = featureOf(file);
    const inLib = file.startsWith('src/lib/');
    const inShared = file.startsWith('src/lib/shared/');
    const inRoutes = file.startsWith('src/routes/');
    const props = new Set<string>();
    const known = new Set<string>();
    const report = (
      node: ESTree.Node,
      messageId: string,
      data?: Record<string, string>
    ) => {
      context.report({ node, messageId, data });
    };

    const checkTarget = (node: ESTree.Node, specifier: string) => {
      const target = targetOf(specifier, fromDir, cwd);
      if (target === null) return;
      const feature = featureOf(target);
      if (inShared && (feature || target === 'src/lib/features')) {
        report(node, 'shared');
        return;
      }
      if (
        feature &&
        feature.name !== ownFeature?.name &&
        feature.rest !== '' &&
        !ENTRYPOINT.test(feature.rest)
      )
        report(node, 'entrypoint', { feature: feature.name, target });
      if (
        inRoutes &&
        target.startsWith('src/') &&
        !target.startsWith('src/lib/') &&
        !target.endsWith('.css') &&
        !target.endsWith('/$types')
      )
        report(node, 'thinRoute', { what: 'route-local import' });
    };

    const checkSource = (
      node: ESTree.Node,
      source: ESTree.Node | null | undefined
    ) => {
      const specifier = source ? literalPath(source) : null;
      if (specifier !== null) checkTarget(node, specifier);
    };

    const checkLoad = (
      node: ESTree.Node,
      source: ESTree.Node | undefined,
      call: string
    ) => {
      const specifier = source ? literalPath(source) : null;
      if (specifier === null) report(node, 'computed', { call });
      else checkTarget(node, specifier);
    };

    const checkPlacement = (program: ESTree.Program) => {
      if (inRoutes) {
        if (!ROUTE_FILE.test(basename(file)))
          report(program, 'routeFile', { file });
        return;
      }
      if (!file.startsWith('src/') || inShared || FRAMEWORK_FILE.test(file))
        return;
      if (!ownFeature) report(program, 'placement', { file });
      else if (!features.includes(ownFeature.name))
        report(program, 'undeclared', { feature: ownFeature.name });
      else if (
        ENTRYPOINT_FILE.test(ownFeature.rest) &&
        ownFeature.rest !== 'index.ts'
      )
        report(program, 'entrypointFile', { feature: ownFeature.name, file });
    };

    const checkPassThrough = (program: ESTree.Program) => {
      if (
        !inLib ||
        file.endsWith('.svelte') ||
        DECLARATION_FILE.test(file) ||
        ownFeature?.rest === 'index.ts'
      )
        return;
      const body = program.body as Statement[];
      if (
        body.some(isReexport) &&
        body.every(
          (node) => node.type === 'ImportDeclaration' || isReexport(node)
        )
      )
        report(program, 'passThrough');
    };

    const isThin = (node: ESTree.Node): boolean => {
      switch (node.type) {
        case 'Literal':
          return true;
        case 'TemplateLiteral':
          return node.expressions.length === 0;
        case 'Identifier':
          return known.has(node.name);
        case 'MemberExpression':
          return !node.computed && isThin(node.object);
        case 'ChainExpression':
          return isThin(node.expression);
        case 'CallExpression':
          return (
            node.callee.type === 'Identifier' &&
            props.has(node.callee.name) &&
            node.arguments.every((argument) => isThin(argument))
          );
        default:
          return false;
      }
    };

    const reportUnlessThin = (node: ESTree.Node, what: string) => {
      if (isThin(node)) return;
      const isFunction = node.type.endsWith('FunctionExpression');
      report(node, 'thinRoute', { what: isFunction ? 'function' : what });
    };

    const checkRouteStatements = (body: Statement[]) => {
      for (const node of body)
        if (!isThinStatement(node))
          report(node as unknown as ESTree.Node, 'thinRoute', {
            what: 'statement'
          });
    };

    const checkRouteScript = (body: Statement[]) => {
      for (const node of body)
        if (node.type === 'ImportDeclaration')
          for (const specifier of (node as unknown as ESTree.ImportDeclaration)
            .specifiers)
            known.add(specifier.local.name);
      for (const { id } of propsOf(body))
        for (const name of propNames(id)) {
          props.add(name);
          known.add(name);
        }
      for (const { id } of propsOf(body))
        for (const value of propDefaults(id))
          reportUnlessThin(value, 'prop default');
      checkRouteStatements(body);
    };

    const visitors: Rule.RuleListener = {
      Program(program) {
        checkPlacement(program);
        checkPassThrough(program);
        if (!inRoutes) return;
        if (!file.endsWith('.svelte')) {
          checkRouteStatements(program.body as Statement[]);
          return;
        }
        for (const node of program.body as Statement[])
          if (node.type === 'SvelteScriptElement')
            checkRouteScript(node.body as Statement[]);
      },
      ImportDeclaration(node) {
        checkSource(node, node.source);
      },
      ExportNamedDeclaration(node) {
        checkSource(node, node.source);
        if (!inLib) return;
        for (const specifier of node.specifiers)
          if (exportedName(specifier) === 'default')
            report(specifier, 'defaultExport');
      },
      ExportDefaultDeclaration(node) {
        if (inLib) report(node, 'defaultExport');
      },
      ExportAllDeclaration(node) {
        report(node, 'wildcard');
        checkSource(node, node.source);
      },
      ImportExpression(node) {
        checkLoad(node, node.source, 'import()');
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require')
          checkLoad(node, node.arguments[0], 'require()');
      },
      MetaProperty(node) {
        const parent = node.parent as ESTree.Node;
        if (
          node.meta.name === 'import' &&
          parent.type === 'MemberExpression' &&
          parent.property.type === 'Identifier' &&
          parent.property.name.startsWith('glob')
        )
          report(parent, 'glob');
      },
      'TSImportType, TSExternalModuleReference'(node: ESTree.Node) {
        const typed = node as unknown as {
          source?: ESTree.Node;
          expression?: ESTree.Node;
        };
        checkSource(node, typed.source ?? typed.expression);
      }
    };
    if (!inRoutes) return visitors;

    return {
      ...visitors,
      [ROUTE_BLOCKS.join(', ')](node: ESTree.Node) {
        report(node, 'thinRoute', { what: 'block' });
      },
      [MARKUP_ROOTS.join(', ')](node: ESTree.Node) {
        const root = node as unknown as MarkupRoot;
        const expression = root.expression ?? root.argument ?? root.value;
        if (expression) reportUnlessThin(expression, 'expression');
      }
    };
  }
};
