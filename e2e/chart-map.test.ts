import type { Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';
import { MADE_UP_SEA } from '../playwright.config';
import {
  expectAccessibleInBothThemes,
  expectFocusTrapped
} from './accessibility';

const CHART_TILE =
  /\/MarineChart_Services_NOAACharts\/default\/default028mm\/(\d+)\/\d+\/\d+\.png$/;
const NOAA_TOP_LEVEL = 14;
const OPEN_FREE_MAP = 'https://tiles.openfreemap.org/';

const dropPotAndOpenMap = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
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

const expectNoPositionIn = (requested: string[]) => {
  for (const url of requested.map((url) => decodeURIComponent(url))) {
    expect(url.toLowerCase()).not.toContain('bbox');
    for (const written of MADE_UP_SEA_FORMS) {
      expect(url).not.toContain(written);
    }
  }
};

test('the Map tab shows gear and my position from the phone and asks NOAA only for fixed-grid tiles up to its top level', async ({
  context,
  page
}) => {
  const requested: string[] = [];
  context.on('request', (request) => requested.push(request.url()));
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
  expectNoPositionIn(requested);
});

test('on the Street map, panning, zooming, Show on map and reload send no position to OpenFreeMap', async ({
  context,
  page
}) => {
  const requested: string[] = [];
  context.on('request', (request) => requested.push(request.url()));
  const streetTiles = () =>
    requested.filter(
      (url) => url.startsWith(OPEN_FREE_MAP) && url.endsWith('.png')
    );
  const streetStyles = () =>
    requested.filter(
      (url) => url.startsWith(OPEN_FREE_MAP) && !url.endsWith('.png')
    );
  const streetMap = mapArea(page).getByRole('button', { name: 'Street map' });
  const chooseStreet = async () => {
    const before = streetTiles().length;
    await streetMap.click();
    await expect(streetMap).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => streetTiles().length).toBeGreaterThan(before);
  };
  await dropPotAndOpenMap(page);
  await chooseStreet();

  const mapView = mapArea(page).getByRole('region', { name: 'Map view' });
  for (const key of ['ArrowLeft', 'ArrowLeft', 'ArrowUp']) {
    await mapView.press(key);
  }
  await mapArea(page).getByRole('button', { name: 'Zoom out' }).click();
  await mapArea(page).getByRole('button', { name: 'Zoom in' }).click();

  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: 'Pot 1' })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Show on map' })
    .click();
  await expect(potOnMap(page)).toBeFocused();
  await expect(streetMap).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await chooseStreet();
  await expect(potOnMap(page)).toBeVisible();

  expect(streetStyles().length).toBeGreaterThanOrEqual(2);
  expectNoPositionIn(requested);
});

test('without signal the Map tab says so while the toast still expires, still shows gear and my position, keeps saying so through reconnects that load nothing, and clears once a map tile arrives', async ({
  context,
  page,
  providers
}) => {
  const reconnect = async () => {
    await context.setOffline(true);
    await context.setOffline(false);
  };
  providers.cutOff();
  await dropPotAndOpenMap(page);

  const notice = mapArea(page)
    .getByRole('status')
    .filter({ hasText: 'No signal' });
  await expect(notice).toContainText('No signal');
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await expect(toastOf(page)).toBeHidden({ timeout: 10_000 });
  await expect(notice).toBeVisible();
  await expect(potOnMap(page)).toBeVisible();
  await expect(myPosition(page)).toBeVisible();
  await expectAccessibleInBothThemes(page);

  providers.hold();
  await reconnect();
  await expect.poll(() => providers.held()).toBeGreaterThan(0);
  await expect(notice).toBeVisible();
  const firstAttempt = providers.held();
  await reconnect();
  await expect.poll(() => providers.held()).toBeGreaterThan(firstAttempt);
  await expect(notice).toBeVisible();

  providers.serve();
  await expect(notice).toBeHidden();
  await expect(potOnMap(page)).toBeVisible();
});

test('gear on the map opens its sheet without Show on map, and Show on map from the Gear list returns to that gear', async ({
  page
}) => {
  await dropPotAndOpenMap(page);
  const sheet = page.getByRole('dialog');
  const showOnMap = sheet.getByRole('button', { name: 'Show on map' });

  await potOnMap(page).click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  await expect(showOnMap).toHaveCount(0);
  await expectFocusTrapped(page, sheet);
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
  page
}) => {
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
