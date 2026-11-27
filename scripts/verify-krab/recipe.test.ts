import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, onTestFinished, vi } from 'vitest';

type Fixture = (
  args: Record<string, unknown>,
  use: (value: unknown) => Promise<void>,
  info: { outputPath: (name: string) => string }
) => Promise<void>;
type Fixtures = Record<string, unknown>;
type TestType = { fixtures: Fixtures; extend: (more: Fixtures) => TestType };

const playwright = vi.hoisted(() => {
  const typeOf = (fixtures: Record<string, unknown>): TestType => ({
    fixtures,
    extend: (more) => typeOf({ ...fixtures, ...more })
  });
  return { test: typeOf({}), expect: () => undefined };
});

const RECEIPT = { pid: '4242', command: 'vite preview', port: 4173 };

vi.mock('@playwright/test', () => playwright);
vi.mock('../../e2e/fixtures', () => ({
  test: playwright.test,
  serveProviders: (_context: unknown, use: (value: unknown) => unknown) =>
    use(null)
}));
vi.mock('./doctor', () => ({ doctor: () => RECEIPT }));

const autoFixtures = (type: TestType) =>
  Object.entries(type.fixtures).flatMap(([name, value]) =>
    Array.isArray(value) &&
    typeof value[0] === 'function' &&
    (value[1] as { auto?: boolean } | undefined)?.auto === true
      ? [{ name, setUp: value[0] as Fixture }]
      : []
  );

const receiptAtFirstNavigation = async (type: TestType) => {
  const dir = mkdtempSync(join(tmpdir(), 'krab-recipe-'));
  onTestFinished(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const info = { outputPath: (name: string) => join(dir, name) };
  const path = info.outputPath('doctor.json');
  let seen: unknown = null;
  const firstNavigation = () => {
    seen = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null;
    return Promise.resolve();
  };
  const runTest = autoFixtures(type).reduceRight(
    (body, { setUp }) =>
      () =>
        setUp({ context: {}, liveProviders: false }, body, info),
    firstNavigation
  );
  await runTest();
  return seen;
};

it.each(['test', 'testWithFixtureProviders'] as const)(
  'recipe %s writes the doctor receipt before its first navigation',
  async (name) => {
    const recipe = (await import('./recipe')) as unknown as Record<
      typeof name,
      TestType
    >;

    expect(await receiptAtFirstNavigation(recipe[name])).toEqual(RECEIPT);
  }
);
