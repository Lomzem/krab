import type { Rule } from 'eslint';
import type * as ESTree from 'estree';
import { dirname, relative, resolve } from 'node:path';

type Options = { features: string[] };
type Statement = { type: string; [key: string]: unknown };

const LIB_ALIASES = ['#lib/', '$lib/'];
const FEATURE = /^src\/lib\/features\/([^/]+)(?:\/(.*))?$/;
const ENTRYPOINT = /^index(?:\.(?:js|ts))?$/;
const FRAMEWORK_FILE =
  /^src\/(?:app\.d\.ts|hooks(?:\.(?:client|server|universal))?\.[jt]s|params\/[^/]+\.[jt]s|service-worker(?:\.[jt]s|\/.+))$/;
const ROUTE_BLOCKS = [
  'SvelteIfBlock',
  'SvelteEachBlock',
  'SvelteAwaitBlock',
  'SvelteKeyBlock',
  'SvelteConstTag'
];

const targetOf = (specifier: string, fromDir: string, cwd: string) => {
  const path = specifier.split('?', 1)[0] ?? '';
  const alias = LIB_ALIASES.find((prefix) => path.startsWith(prefix));
  if (alias) return `src/lib/${path.slice(alias.length)}`;
  return path.startsWith('.') ? relative(cwd, resolve(fromDir, path)) : null;
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
      undeclared:
        'Feature {{feature}} is not declared. Add it to FEATURES in eslint.config.js, or move the file into a declared feature.',
      entrypoint:
        'Import feature {{feature}} through its public entrypoint, src/lib/features/{{feature}}/index.ts, not {{target}}.',
      shared:
        'src/lib/shared must not import a feature. Move the code that both need into src/lib/shared.',
      computed:
        'Give import() a literal path, so the feature boundary check can see what it loads.',
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
    const ownFeature = featureOf(file)?.name;
    const inShared = file.startsWith('src/lib/shared/');
    const inRoutes = file.startsWith('src/routes/');
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
        feature.name !== ownFeature &&
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

    const checkPlacement = (program: ESTree.Program) => {
      if (!file.startsWith('src/')) return;
      if (
        inRoutes ||
        inShared ||
        FRAMEWORK_FILE.test(file) ||
        (ownFeature && features.includes(ownFeature))
      )
        return;
      if (ownFeature) report(program, 'undeclared', { feature: ownFeature });
      else report(program, 'placement', { file });
    };

    const checkPassThrough = (program: ESTree.Program) => {
      if (
        !file.startsWith('src/lib/') ||
        !/\.[jt]s$/.test(file) ||
        file.endsWith('.d.ts') ||
        (ownFeature && file === `src/lib/features/${ownFeature}/index.ts`)
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

    const checkRouteStatements = (body: Statement[]) => {
      for (const node of body)
        if (!isThinStatement(node))
          report(node as unknown as ESTree.Node, 'thinRoute', {
            what: 'statement'
          });
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
            checkRouteStatements(node.body as Statement[]);
      },
      ImportDeclaration(node) {
        checkSource(node, node.source);
      },
      ExportNamedDeclaration(node) {
        checkSource(node, node.source);
      },
      ExportAllDeclaration(node) {
        report(node, 'wildcard');
        checkSource(node, node.source);
      },
      ImportExpression(node) {
        const specifier = literalPath(node.source);
        if (specifier === null) report(node, 'computed');
        else checkTarget(node, specifier);
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

    const reportMarkupFunction = (node: ESTree.Node) => {
      const top: string | undefined = context.sourceCode
        .getAncestors(node)
        .at(1)?.type;
      if (top?.startsWith('Svelte') && top !== 'SvelteScriptElement')
        report(node, 'thinRoute', { what: 'function' });
    };
    return {
      ...visitors,
      [ROUTE_BLOCKS.join(', ')](node: ESTree.Node) {
        report(node, 'thinRoute', { what: 'block' });
      },
      'ArrowFunctionExpression, FunctionExpression': reportMarkupFunction
    };
  }
};
