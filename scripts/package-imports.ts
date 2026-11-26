import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type Target = string | null | Target[] | { [condition: string]: Target };
type Scope = { root: string; imports: Record<string, Target> };

const scopes = new Map<string, Scope | null>();

const scopeOf = (directory: string): Scope | null => {
  const known = scopes.get(directory);
  if (known !== undefined) return known;
  const manifest = join(directory, 'package.json');
  const parent = dirname(directory);
  let scope: Scope | null = null;
  if (existsSync(manifest)) {
    const { imports } = JSON.parse(readFileSync(manifest, 'utf8')) as {
      imports?: Record<string, Target>;
    };
    scope = { root: directory, imports: imports ?? {} };
  } else if (parent !== directory) scope = scopeOf(parent);
  scopes.set(directory, scope);
  return scope;
};

const targetsOf = (target: Target): string[] => {
  if (target === null) return [];
  if (typeof target === 'string') return [target];
  return (Array.isArray(target) ? target : Object.values(target)).flatMap(
    targetsOf
  );
};

const patternMatch = (imports: Record<string, Target>, specifier: string) =>
  Object.keys(imports)
    .flatMap((key) => {
      const parts = key.split('*');
      if (parts.length !== 2) return [];
      const [prefix, suffix] = parts as [string, string];
      if (specifier.length < prefix.length + suffix.length) return [];
      if (!specifier.startsWith(prefix) || !specifier.endsWith(suffix))
        return [];
      const match = specifier.slice(
        prefix.length,
        specifier.length - suffix.length
      );
      return [{ key, prefix, match }];
    })
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .at(0);

export const packageImportTargets = (
  specifier: string,
  file: string
): string[] => {
  const scope = specifier.startsWith('#') ? scopeOf(dirname(file)) : null;
  if (!scope) return [];
  const pattern = Object.hasOwn(scope.imports, specifier)
    ? { key: specifier, match: '' }
    : patternMatch(scope.imports, specifier);
  if (!pattern) return [];
  return targetsOf(scope.imports[pattern.key]).map((target) => {
    const path = target.replaceAll('*', pattern.match);
    return path.startsWith('./') ? join(scope.root, path) : path;
  });
};
