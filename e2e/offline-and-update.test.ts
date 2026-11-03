import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { CURRENT_BUILD, PREVIOUS_BUILD } from './builds';
import { siteAt, type Site } from './static-host';

const sites: Site[] = [];

const openSite = (port: number) => {
  const site = siteAt(port);
  sites.push(site);
  return site;
};

test.afterEach(async () => {
  await Promise.all(sites.splice(0).map((site) => site.takeDown()));
});

const versionOf = (build: string) =>
  String(
    (
      JSON.parse(readFileSync(join(build, '_app', 'version.json'), 'utf8')) as {
        version: unknown;
      }
    ).version
  );

const servesVersion = async (page: Page, version: string) =>
  (await page.content()).includes(`"${version}"`);

const dropPot = async (page: Page) => {
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Pot 1 dropped' })
  ).toBeVisible();
};

const expectStoredPot = async (page: Page) => {
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('listitem').filter({ hasText: 'Pot 1' })
  ).toBeVisible();
};

const workerReady = (page: Page) =>
  page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));

const controlled = (page: Page) =>
  page.evaluate(() => Boolean(navigator.serviceWorker.controller));

const waitingWorker = (page: Page) =>
  page.evaluate(() =>
    navigator.serviceWorker
      .getRegistration()
      .then((registration) => registration?.waiting?.state ?? null)
  );

const storedBuilds = (page: Page) =>
  page.evaluate(() => caches.keys().then((keys) => keys.length));

const fetchFrom = (page: Page, url: string) =>
  page.evaluate(
    (target) =>
      fetch(target, { mode: 'no-cors' }).then(
        () => 'fetched',
        () => 'failed'
      ),
    url
  );

const goOffline = async (context: BrowserContext, site: Site) => {
  await site.takeDown();
  await context.setOffline(true);
};

const launch = async (context: BrowserContext, site: Site) => {
  const page = await context.newPage();
  await page.goto(site.origin);
  return page;
};

const relaunchUntilServing = async (
  context: BrowserContext,
  site: Site,
  version: string
) => {
  const relaunched = await launch(context, site);
  const serving = await servesVersion(relaunched, version);
  if (!serving) await relaunched.close();
  return serving;
};

test('after one online load Krab opens offline and shows the stored trip', async ({
  context,
  page
}) => {
  const site = openSite(4174);
  await site.deploy(CURRENT_BUILD);
  await page.goto(site.origin);
  await dropPot(page);
  await workerReady(page);

  await goOffline(context, site);
  const offline = await launch(context, site);

  await expectStoredPot(offline);
});

test('Krab leaves third-party requests to the network', async ({
  context,
  page
}) => {
  const site = openSite(4176);
  const thirdParty = openSite(4177);
  await site.deploy(CURRENT_BUILD);
  await thirdParty.deploy(CURRENT_BUILD);
  const tile = `${thirdParty.origin.replace('127.0.0.1', 'localhost')}icons/icon-192.png`;
  await page.goto(site.origin);
  await workerReady(page);
  await expect.poll(() => controlled(page)).toBe(true);
  expect(await fetchFrom(page, tile)).toBe('fetched');

  await thirdParty.takeDown();
  await goOffline(context, site);
  const offline = await launch(context, site);

  expect(await fetchFrom(offline, tile)).toBe('failed');
});

test('a new build waits while Krab is open and takes over on the next launch', async ({
  context,
  page
}) => {
  const previous = versionOf(PREVIOUS_BUILD);
  const next = versionOf(CURRENT_BUILD);
  expect(next).not.toBe(previous);
  const site = openSite(4175);
  await site.deploy(PREVIOUS_BUILD);
  await page.goto(site.origin);
  await dropPot(page);
  await workerReady(page);

  await site.deploy(CURRENT_BUILD);
  await page.reload();
  await expect.poll(() => waitingWorker(page)).toBe('installed');
  expect(await servesVersion(page, previous)).toBe(true);
  const secondTab = await launch(context, site);
  expect(await servesVersion(secondTab, previous)).toBe(true);
  await expectStoredPot(page);

  await secondTab.close();
  await page.close();
  await expect.poll(() => relaunchUntilServing(context, site, next)).toBe(true);
  expect(context.pages()).toHaveLength(1);
  const [updated] = context.pages();
  await expectStoredPot(updated);
  expect(await storedBuilds(updated)).toBe(1);

  await goOffline(context, site);
  const offline = await launch(context, site);
  expect(await servesVersion(offline, next)).toBe(true);
  await expectStoredPot(offline);
});
