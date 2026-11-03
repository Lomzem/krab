import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { MADE_UP_SEA } from '../playwright.config';
import { expectAccessibleInBothThemes } from './accessibility';

const NOAA = 'https://gis.charttools.noaa.gov/**';
const OPEN_FREE_MAP = 'https://tiles.openfreemap.org/**';
const CHART_TILE =
  /\/MarineChart_Services_NOAACharts\/default\/default028mm\/(\d+)\/\d+\/\d+\.png$/;
const NOAA_TOP_LEVEL = 14;
const CLEAR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

test.use({ serviceWorkers: 'block' });

const servedTiles = async (context: BrowserContext) => {
  await context.unrouteAll();
  await context.route(NOAA, (route) =>
    route.fulfill({
      contentType: 'image/png',
      headers: { 'access-control-allow-origin': '*' },
      body: CLEAR_PNG
    })
  );
  await context.route(OPEN_FREE_MAP, (route) => route.abort());
};

const noSignal = async (context: BrowserContext) => {
  await context.unrouteAll();
  await context.route(NOAA, (route) => route.abort('internetdisconnected'));
  await context.route(OPEN_FREE_MAP, (route) =>
    route.abort('internetdisconnected')
  );
};

const dropPotAndOpenMap = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'dropped' })
  ).toContainText('Pot 1 dropped');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
};

const mapArea = (page: Page) =>
  page.getByRole('region', { name: 'Map', exact: true });
const potOnMap = (page: Page) =>
  mapArea(page).getByRole('button', { name: /^Pot 1,/ });
const myPosition = (page: Page) =>
  mapArea(page).getByRole('img', { name: /^Your position/ });

const chartLevel = (url: string) => Number(CHART_TILE.exec(url)?.[1]);

const writtenForms = (degrees: number) => {
  const size = Math.abs(degrees);
  const whole = Math.trunc(size);
  const fraction = String(size).split('.')[1] ?? '';
  return Array.from({ length: fraction.length }, (_, index) => index + 1)
    .flatMap((places) => [
      `${String(whole)}.${fraction.slice(0, places)}`,
      size.toFixed(places)
    ])
    .flatMap((written) => [written, written.replace('.', ',')]);
};

const MADE_UP_SEA_FORMS = [
  ...writtenForms(MADE_UP_SEA.latitude),
  ...writtenForms(MADE_UP_SEA.longitude)
];

test('the Map tab shows gear and my position from the phone and asks NOAA only for fixed-grid tiles up to its top level', async ({
  context,
  page
}) => {
  const requested: string[] = [];
  context.on('request', (request) => requested.push(request.url()));
  await servedTiles(context);
  await dropPotAndOpenMap(page);

  await expect(potOnMap(page)).toBeVisible();
  await expect(myPosition(page)).toBeVisible();
  await expect(mapArea(page)).toContainText('Not to be used for navigation');

  const zoomIn = mapArea(page).getByRole('button', { name: 'Zoom in' });
  await expect(async () => {
    await zoomIn.press('Enter');
    await expect(zoomIn).toBeDisabled({ timeout: 1000 });
  }).toPass();

  const noaa = () => requested.filter((url) => url.includes('charttools'));
  await expect.poll(() => noaa().map(chartLevel)).toContain(NOAA_TOP_LEVEL);
  for (const url of noaa()) {
    expect(url).toMatch(CHART_TILE);
    expect(chartLevel(url)).toBeLessThanOrEqual(NOAA_TOP_LEVEL);
  }
  for (const url of requested.map((url) => decodeURIComponent(url))) {
    expect(url.toLowerCase()).not.toContain('bbox');
    for (const written of MADE_UP_SEA_FORMS) {
      expect(url).not.toContain(written);
    }
  }
});

test('without signal the Map tab says so, still shows gear and my position, and recovers when the phone reconnects', async ({
  context,
  page
}) => {
  await noSignal(context);
  await dropPotAndOpenMap(page);

  const notice = mapArea(page)
    .getByRole('status')
    .filter({ hasText: 'No signal' });
  await expect(notice).toContainText('No signal');
  await expect(potOnMap(page)).toBeVisible();
  await expect(myPosition(page)).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await servedTiles(context);
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(notice).toBeHidden();
  await expect(potOnMap(page)).toBeVisible();
});

test('gear on the map opens its sheet without Show on map, and Show on map from the Gear list returns to that gear', async ({
  context,
  page
}) => {
  await servedTiles(context);
  await dropPotAndOpenMap(page);
  const sheet = page.getByRole('dialog');
  const showOnMap = sheet.getByRole('button', { name: 'Show on map' });

  await potOnMap(page).click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  await expect(showOnMap).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(potOnMap(page)).toBeFocused();

  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: 'Pot 1' })
    .click();
  await showOnMap.click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Map', exact: true })
  ).toHaveAttribute('aria-current', 'page');
  await expect(potOnMap(page)).toBeFocused();
  await expect(potOnMap(page)).toBeInViewport();
});

test('while moving with a rough fix, my position reads as rough with my heading', async ({
  context,
  page
}) => {
  await servedTiles(context);
  await page.addInitScript((sea) => {
    navigator.geolocation.watchPosition = (success) => {
      success({
        timestamp: Date.now(),
        coords: {
          latitude: sea.latitude,
          longitude: sea.longitude,
          accuracy: 120,
          altitude: null,
          altitudeAccuracy: null,
          heading: 90,
          speed: 2,
          toJSON: () => ({})
        },
        toJSON: () => ({})
      });
      return 1;
    };
    navigator.geolocation.clearWatch = () => undefined;
  }, MADE_UP_SEA);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await page.getByRole('button', { name: 'Map', exact: true }).click();

  await expect(myPosition(page)).toHaveAccessibleName(
    'Your position, rough, within about 390 feet, heading east'
  );
});
