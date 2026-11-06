import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect, storedDrops, test, toastOf } from './fixtures';
import { MADE_UP_SEA } from '../playwright.config';
import { deliverFix, holdFixes } from './held-geolocation';
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

test('on the Street map, panning, every map control, Show on map and reload send no position to OpenFreeMap', async ({
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
  await mapArea(page)
    .getByRole('button', { name: 'Centre on my position' })
    .click();
  const sheet = page.getByRole('dialog');
  await mapArea(page)
    .getByRole('button', { name: /^Filter/ })
    .click();
  await expect(
    sheet.getByRole('heading', { name: 'Map filter' })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await potOnMap(page).click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: 'Pot 1' })
    .click();
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  await expect(potOnMap(page)).toBeFocused();
  await expect(streetMap).toHaveAttribute('aria-pressed', 'true');

  await page.reload();
  await chooseStreet();
  await expect(potOnMap(page)).toBeVisible();

  expect(streetStyles().length).toBeGreaterThanOrEqual(2);
  expectNoPositionIn(requested);
});

const CORS = { 'access-control-allow-origin': '*' };

const reconnect = async (context: BrowserContext) => {
  await context.setOffline(true);
  await context.setOffline(false);
};

const streetMapButton = (page: Page) =>
  mapArea(page).getByRole('button', { name: 'Street map' });
const outageNotice = (page: Page, shown: string | RegExp) =>
  mapArea(page).getByRole('status').filter({ hasText: shown });
const cannotLoad = (page: Page) =>
  outageNotice(page, "The map can't load right now.");
const offline = (page: Page) =>
  outageNotice(page, "Offline. The map can't load.");
const claimsACause = (page: Page) =>
  outageNotice(page, /No signal|Offline|isn't answering/);
const notAnswering = (page: Page) =>
  outageNotice(page, "The map service isn't answering");
const anyOutage = (page: Page) =>
  outageNotice(page, /map can't load|No signal/);

for (const colorScheme of ['light', 'dark'] as const) {
  test(`in ${colorScheme} mode, Street map shows a check while it is on and none once the keyboard turns it off again, keeps its name and stays the same size so no map control moves`, async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme });
    await dropPotAndOpenMap(page);
    const streetMap = streetMapButton(page);
    const check = streetMap.locator('svg path');
    const controls = MAP_CONTROLS.map((name) =>
      mapArea(page).getByRole('button', { name, exact: true })
    );
    const boxes = () => Promise.all(controls.map(boxOf));
    await expect(streetMap).toHaveAttribute('aria-pressed', 'false');
    await expect(check).toBeHidden();
    const chart = await boxes();

    await streetMap.focus();
    await page.keyboard.press('Space');
    await expect(streetMap).toHaveAttribute('aria-pressed', 'true');
    await expect(streetMap).toHaveAccessibleName('Street map');
    await expect(check).toBeVisible();
    expect(await boxes()).toEqual(chart);

    await page.keyboard.press('Enter');
    await expect(streetMap).toHaveAttribute('aria-pressed', 'false');
    await expect(streetMap).toHaveAccessibleName('Street map');
    await expect(check).toBeHidden();
    expect(await boxes()).toEqual(chart);
  });
}

test('map tiles and a Street style the browser cannot load while it is online say the map cannot load right now, never naming a cause, while the toast still expires, gear and my position still show, through reconnects that load nothing, and clear once a map tile arrives', async ({
  context,
  page,
  providers
}) => {
  providers.refuseCors();
  await dropPotAndOpenMap(page);

  const notice = cannotLoad(page);
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Your gear and position still show.');
  await expect(claimsACause(page)).toHaveCount(0);
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await expect(toastOf(page)).toBeHidden({ timeout: 10_000 });
  await expect(notice).toBeVisible();
  await expect(potOnMap(page)).toBeVisible();
  await expect(myPosition(page)).toBeVisible();
  await expectAccessibleInBothThemes(page);

  providers.hold();
  await reconnect(context);
  await expect.poll(() => providers.held()).toBeGreaterThan(0);
  await expect(notice).toBeVisible();
  const firstAttempt = providers.held();
  await reconnect(context);
  await expect.poll(() => providers.held()).toBeGreaterThan(firstAttempt);
  await expect(notice).toBeVisible();

  providers.cutOff();
  await reconnect(context);
  await expect(notice).toBeVisible();
  await expect(claimsACause(page)).toHaveCount(0);

  providers.serve();
  await reconnect(context);
  await expect(notice).toBeHidden();
  await expect(potOnMap(page)).toBeVisible();

  providers.refuseCors();
  await streetMapButton(page).click();
  await expect(streetMapButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(notice).toBeVisible();
  await expect(claimsACause(page)).toHaveCount(0);
  await expect(potOnMap(page)).toBeVisible();
  providers.serve();
  await streetMapButton(page).click();
  await expect(notice).toBeHidden();
});

test('while the browser is offline the Map tab says so for map tiles and the Street style, still shows gear and my position, and clears once back online a map tile arrives', async ({
  context,
  page,
  providers
}) => {
  await dropPotAndOpenMap(page);
  await expect(potOnMap(page)).toBeVisible();
  providers.cutOff();
  await context.setOffline(true);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);

  await streetMapButton(page).click();
  await expect(streetMapButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(offline(page)).toBeVisible();
  await expect(offline(page)).toContainText(
    'Your gear and position still show.'
  );
  await expect(cannotLoad(page)).toHaveCount(0);
  await expect(potOnMap(page)).toBeVisible();
  await expect(myPosition(page)).toBeVisible();

  await streetMapButton(page).click();
  await expect(streetMapButton(page)).toHaveAttribute('aria-pressed', 'false');
  await expect(offline(page)).toBeVisible();
  await expect(cannotLoad(page)).toHaveCount(0);

  providers.serve();
  await context.setOffline(false);
  await expect(offline(page)).toBeHidden();
  await expect(potOnMap(page)).toBeVisible();
});

test('when NOAA answers map tiles busy or failing, the Map tab says the map service is not answering rather than no signal, still shows gear and clears once a map tile arrives', async ({
  context,
  page
}) => {
  let failWith: number | null = null;
  await context.route(CHART_TILE, async (route) => {
    if (failWith === null) {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: failWith, headers: CORS });
  });
  await dropPotAndOpenMap(page);

  for (const status of [429, 503]) {
    failWith = status;
    await reconnect(context);
    await expect(notAnswering(page)).toBeVisible();
    await expect(cannotLoad(page)).toHaveCount(0);
    await expect(offline(page)).toHaveCount(0);
    await expect(potOnMap(page)).toBeVisible();
    await expect(myPosition(page)).toBeVisible();
    failWith = null;
    await reconnect(context);
    await expect(notAnswering(page)).toBeHidden();
  }
});

test('a Street style the map service refuses or the map cannot use falls back to the plain map saying the service is not answering, gear still shown and no page error', async ({
  context,
  page,
  providers
}) => {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  let refuseStyle = false;
  await context.route(`${OPEN_FREE_MAP}styles/**`, async (route) => {
    if (!refuseStyle) {
      await route.fallback();
      return;
    }
    await route.fulfill({ status: 503, headers: CORS });
  });
  const streetMap = streetMapButton(page);
  await dropPotAndOpenMap(page);
  await expect(notAnswering(page)).toBeHidden();

  const unusable = [
    {
      version: 8,
      sources: null,
      layers: [{ id: 'street', type: 'raster', source: 'street' }]
    },
    {
      version: 8,
      sources: {
        street: {
          type: 'raster',
          tiles: ['https://tiles.openfreemap.org/krab-e2e/{z}/{x}/{y}.png'],
          tileSize: 256
        }
      },
      layers: [{ id: 'street', type: 'no-such-layer', source: 'street' }]
    }
  ];
  const failures = [
    ...unusable.map((style) => () => {
      providers.serve(style);
    }),
    () => {
      refuseStyle = true;
    }
  ];
  for (const fail of failures) {
    fail();
    await streetMap.click();
    await expect(streetMap).toHaveAttribute('aria-pressed', 'true');
    await expect(notAnswering(page)).toBeVisible();
    await expect(cannotLoad(page)).toHaveCount(0);
    await expect(offline(page)).toHaveCount(0);
    await expect(potOnMap(page)).toBeVisible();
    await expect(myPosition(page)).toBeVisible();
    refuseStyle = false;
    providers.serve();
    await streetMap.click();
    await expect(notAnswering(page)).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test('a Street style still loading when Chart is chosen again or the Map tab closes is cancelled and never shown', async ({
  context,
  page,
  providers
}) => {
  const requested: string[] = [];
  const cancelled: string[] = [];
  context.on('request', (request) => requested.push(request.url()));
  context.on('requestfailed', (request) => {
    if (request.url().startsWith(OPEN_FREE_MAP)) cancelled.push(request.url());
  });
  const streetTiles = () =>
    requested.filter(
      (url) => url.startsWith(OPEN_FREE_MAP) && url.endsWith('.png')
    );
  const chartTiles = () => requested.filter((url) => CHART_TILE.test(url));
  const streetMap = streetMapButton(page);
  await dropPotAndOpenMap(page);

  providers.hold();
  await streetMap.click();
  await expect.poll(() => providers.held()).toBeGreaterThan(0);
  await streetMap.click();
  await expect(streetMap).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => cancelled.length).toBe(1);
  const chartBefore = chartTiles().length;
  providers.serve();
  await expect.poll(() => chartTiles().length).toBeGreaterThan(chartBefore);
  await expect(anyOutage(page)).toHaveCount(0);
  expect(streetTiles()).toEqual([]);

  providers.hold();
  const heldBefore = providers.held();
  await streetMap.click();
  await expect.poll(() => providers.held()).toBeGreaterThan(heldBefore);
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await expect.poll(() => cancelled.length).toBe(2);
  providers.serve();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(streetMap).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(() => streetTiles().length).toBeGreaterThan(0);
  await expect(anyOutage(page)).toHaveCount(0);
});

test('a Street style that has not arrived after 10 seconds is cancelled and says the map cannot load right now, with gear and my position still shown', async ({
  context,
  page,
  providers
}) => {
  const cancelled: string[] = [];
  context.on('requestfailed', (request) => {
    if (request.url().startsWith(OPEN_FREE_MAP)) cancelled.push(request.url());
  });
  const streetMap = streetMapButton(page);
  await page.clock.install();
  await dropPotAndOpenMap(page);

  providers.hold();
  await streetMap.click();
  await expect.poll(() => providers.held()).toBeGreaterThan(0);
  await page.clock.fastForward(10_000);
  await expect.poll(() => cancelled.length).toBe(1);
  await expect(cannotLoad(page)).toBeVisible();
  await expect(claimsACause(page)).toHaveCount(0);
  await expect(streetMap).toHaveAttribute('aria-pressed', 'true');
  await expect(potOnMap(page)).toBeVisible();
  await expect(myPosition(page)).toBeVisible();

  providers.serve();
  await streetMap.click();
  await expect(cannotLoad(page)).toBeHidden();
});

const offCentre = async (page: Page, target: Locator) => {
  const view = await mapArea(page)
    .getByRole('region', { name: 'Map view' })
    .boundingBox();
  const box = await target.boundingBox();
  if (!view || !box) return Number.POSITIVE_INFINITY;
  return Math.hypot(
    box.x + box.width / 2 - (view.x + view.width / 2),
    box.y + box.height / 2 - (view.y + view.height / 2)
  );
};

const panAway = async (page: Page, target: Locator) => {
  const mapView = mapArea(page).getByRole('region', { name: 'Map view' });
  for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown']) {
    await mapView.press(key);
  }
  await expect.poll(() => offCentre(page, target)).toBeGreaterThan(50);
};

const CENTRED_PX = 3;

test('gear on the map opens its sheet without Show on map; with my position elsewhere, Show on map centres that gear and Centre on my position centres me', async ({
  context,
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

  await context.setGeolocation({
    latitude: MADE_UP_SEA.latitude + 0.02,
    longitude: MADE_UP_SEA.longitude,
    accuracy: 8
  });
  await expect(potOnMap(page)).toHaveAccessibleName(/miles/);
  await panAway(page, potOnMap(page));

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
  await expect
    .poll(() => offCentre(page, potOnMap(page)))
    .toBeLessThan(CENTRED_PX);

  await panAway(page, myPosition(page));
  await mapArea(page)
    .getByRole('button', { name: 'Centre on my position' })
    .click();
  await expect
    .poll(() => offCentre(page, myPosition(page)))
    .toBeLessThan(CENTRED_PX);
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

const WORLD_PX_AT_SHOW_ZOOM = 512 * 2 ** 15;

const shiftedOnScreen = (
  from: { latitude: number; longitude: number },
  dx: number,
  dy: number
) => {
  const x = ((from.longitude + 180) / 360) * WORLD_PX_AT_SHOW_ZOOM + dx;
  const phi = (from.latitude * Math.PI) / 180;
  const y =
    ((1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2) *
      WORLD_PX_AT_SHOW_ZOOM +
    dy;
  return {
    longitude: (x / WORLD_PX_AT_SHOW_ZOOM) * 360 - 180,
    latitude:
      ((2 *
        Math.atan(Math.exp(Math.PI * (1 - (2 * y) / WORLD_PX_AT_SHOW_ZOOM))) -
        Math.PI / 2) *
        180) /
      Math.PI
  };
};

const centreOf = async (target: Locator) => {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  return {
    x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    y: (box?.y ?? 0) + (box?.height ?? 0) / 2
  };
};

type Box = { x: number; y: number; width: number; height: number };

const boxOf = async (target: Locator): Promise<Box> => {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  return box ?? { x: 0, y: 0, width: 0, height: 0 };
};

const within = (area: Box) => (box: Box) =>
  box.x >= area.x &&
  box.x + box.width <= area.x + area.width &&
  box.y >= area.y &&
  box.y + box.height <= area.y + area.height;

test('gear either side of the 180th meridian fits the past trip map as one small area, not the whole world', async ({
  context,
  page
}) => {
  const main = page.getByRole('main');
  const sheet = page.getByRole('dialog');
  await context.setGeolocation({ latitude: 0, longitude: 179.995 });
  await dropPotAndOpenMap(page);
  await context.setGeolocation({ latitude: 0, longitude: -179.995 });
  await expect(potOnMap(page)).toHaveAccessibleName(/miles/);
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  await page.getByRole('button', { name: 'End trip' }).click();
  await sheet.getByRole('button', { name: 'End trip' }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'Past trips', exact: true }).click();
  await main.getByRole('button', { name: /2 drops, 2 uncollected$/ }).click();

  const view = main.getByRole('region', { name: 'Map view' });
  const pins = [/^Pot 1,/, /^Pot 2,/].map((name) =>
    main.getByRole('button', { name })
  );
  for (const pin of pins) await expect(pin).toBeVisible();
  await expect
    .poll(async () => {
      const area = await boxOf(view);
      const [first, second] = await Promise.all(pins.map(boxOf));
      const inside = [first, second].every(within(area));
      return inside ? Math.abs(first.x - second.x) / area.width : 0;
    })
    .toBeGreaterThan(0.5);
});

test('eight drops shown apart merge into groups as I zoom out without any marker, label or tap area touching, end as one group of 8, and each one opens its own sheet from the group list and returns focus to the group', async ({
  page
}) => {
  const map = mapArea(page);
  const dialogs = page.getByRole('dialog');
  await holdFixes(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  for (const index of Array.from({ length: 8 }, (_, step) => step)) {
    await deliverFix(page, {
      latitude: MADE_UP_SEA.latitude + index * 0.001,
      longitude: MADE_UP_SEA.longitude
    });
    await expect(page.getByText('Position ready')).toBeVisible();
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(
      `Pot ${String(index + 1)} dropped`
    );
  }
  await page.getByRole('button', { name: 'Map', exact: true }).click();

  const group = map.getByRole('button', { name: /8 gear in this area: / });
  const gear = map.getByRole('button', { name: /^(Pot \d|\d gear here)/ });
  const zoomOut = map.getByRole('button', { name: 'Zoom out' });
  let footprints: Footprint[] = [];
  const settled = async () => {
    const now = await gear.evaluateAll(markerFootprints);
    const still = JSON.stringify(now) === JSON.stringify(footprints);
    footprints = now;
    return still;
  };
  const zoomIn = map.getByRole('button', { name: 'Zoom in' });
  const pots = map.getByRole('button', { name: /^Pot \d,/ });
  const zoomBy = async (control: Locator) => {
    const before = JSON.stringify(footprints);
    await control.click();
    await expect
      .poll(
        async () => (await settled()) && JSON.stringify(footprints) !== before
      )
      .toBe(true);
  };
  await expect.poll(settled).toBe(true);
  for (let step = 0; step < 6 && (await pots.count()) < 8; step += 1) {
    await zoomBy(zoomIn);
  }
  const shapes: number[] = [];
  for (let step = 0; step < 8 && !(await group.isVisible()); step += 1) {
    shapes.push(footprints.length);
    expect(
      overlapping(footprints),
      'drawn gear, its labels or its tap areas touch'
    ).toEqual([]);
    await zoomBy(zoomOut);
  }
  expect(shapes[0]).toBe(8);
  expect(shapes.length).toBeGreaterThan(2);
  await expect(group).toBeVisible();
  await expectAccessibleInBothThemes(page);
  const lead = /^\d/.exec(await group.innerText())?.[0];
  await expect(group).toHaveAccessibleName(
    `Pot ${String(lead)} +7 more. 8 gear in this area: ${Array.from({ length: 8 }, (_, step) => `Pot ${String(step + 1)}`).join(', ')}`
  );
  await expect(map.getByRole('button', { name: /^Pot \d,/ })).toHaveCount(0);

  await group.click();
  await expect(dialogs).toHaveCount(1);
  await expect(
    dialogs.getByRole('heading', { name: '8 gear in this area' })
  ).toBeVisible();
  await expect(
    dialogs.getByRole('button', { name: /^Pot \d, .*in the water for/ })
  ).toHaveCount(8);
  await page.keyboard.press('Escape');
  await expect(dialogs).toHaveCount(0);
  await expect(group).toBeFocused();

  for (const number of Array.from({ length: 8 }, (_, step) => step + 1)) {
    const name = `Pot ${String(number)}`;
    await group.click();
    await dialogs
      .getByRole('button', { name: new RegExp(`^${name},`) })
      .click();
    await expect(dialogs).toHaveCount(1);
    await expect(dialogs.getByRole('heading', { level: 2 })).toHaveText(name);
    await page.keyboard.press('Escape');
    await expect(dialogs).toHaveCount(0);
    await expect(group).toBeFocused();
  }
});

const representedOn = (map: Locator) =>
  map.locator('.maplibregl-marker[data-place]').evaluateAll((markers) =>
    markers.map((marker) => {
      const name =
        marker.querySelector('button')?.getAttribute('aria-label') ?? '';
      const single = /^((?:Pot|Net) \d+),/.exec(name)?.[1];
      if (single) return [single];
      const listed = /gear (?:here|in this area)[^:]*: ([^;]*)/.exec(name)?.[1];
      return listed ? listed.split(', ') : [];
    })
  );

function ringedInMagenta(button: Element) {
  for (const span of button.querySelectorAll('span'))
    if (getComputedStyle(span).boxShadow.includes('rgb(163, 37, 111)'))
      return true;
  return false;
}

const SIX_IN_A_LINE = [
  { width: 393, height: 852, colorScheme: 'dark', last: 'Pot' },
  { width: 393, height: 852, colorScheme: 'light', last: 'Net' },
  { width: 402, height: 681, colorScheme: 'light', last: 'Pot' },
  { width: 320, height: 640, colorScheme: 'dark', last: 'Net' },
  { width: 320, height: 640, colorScheme: 'light', last: 'Pot' },
  { width: 320, height: 568, colorScheme: 'dark', last: 'Pot' },
  { width: 320, height: 568, colorScheme: 'light', last: 'Net' }
] as const;

for (const { width, height, colorScheme, last } of SIX_IN_A_LINE) {
  test(`on a ${String(width)} by ${String(height)} screen in ${colorScheme} mode, six drops in a line ending with a ${last.toLowerCase()} each keep a marker or a place in a group as the map settles, zooms out and back, shows all, zooms in twice and filters, drawn whole and tappable inside a map view no control covers, and each opens its own gear`, async ({
    page
  }) => {
    await page.emulateMedia({ colorScheme });
    await page.setViewportSize({ width, height });
    const map = mapArea(page);
    const dialogs = page.getByRole('dialog');
    const names = [1, 2, 3, 4, 5].map((n) => `Pot ${String(n)}`);
    names.push(last === 'Pot' ? 'Pot 6' : 'Net 1');
    await holdFixes(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();
    for (const [index, name] of names.entries()) {
      await deliverFix(page, {
        latitude: MADE_UP_SEA.latitude + index * 0.0012,
        longitude: MADE_UP_SEA.longitude + index * 0.0004
      });
      await expect(page.getByText('Position ready')).toBeVisible();
      const kind = name.startsWith('Net') ? 'Net' : 'Pot';
      await page
        .getByRole('group', { name: 'Gear to drop' })
        .getByText(kind, { exact: true })
        .click();
      await page
        .getByRole('button', { name: `Drop ${kind.toLowerCase()}` })
        .click();
      await expect(toastOf(page)).toContainText(`${name} dropped`);
    }
    await page.getByRole('button', { name: 'Map', exact: true }).click();
    await expect.poll(() => storedDrops(page)).toBe(6);

    let seen = '';
    const everyDropOnce = async () => {
      const now = JSON.stringify(await representedOn(map));
      const still = now === seen;
      seen = now;
      return still ? (JSON.parse(now) as string[][]) : null;
    };
    const expectEveryDropOnce = async (when: string) => {
      await expect.poll(everyDropOnce).not.toBeNull();
      const spots = JSON.parse(seen) as string[][];
      expect(
        spots.filter((ids) => ids.length === 0).length,
        `markers drawing no gear ${when}`
      ).toBe(0);
      expect(spots.flat().toSorted(), `gear on the map ${when}`).toEqual(
        names.toSorted()
      );
    };

    await expectEveryDropOnce('while Undo shows');
    await expect(toastOf(page)).toBeHidden({ timeout: 10_000 });
    await expectEveryDropOnce('once Undo ends');

    const zoomIn = map.getByRole('button', { name: 'Zoom in' });
    const zoomOut = map.getByRole('button', { name: 'Zoom out' });
    await zoomIn.click();
    await expectEveryDropOnce('zoomed in');
    await zoomOut.click();
    await expectEveryDropOnce('zoomed back out');
    await zoomOut.click();
    await expectEveryDropOnce('zoomed further out');
    await map.getByRole('button', { name: 'Show all gear' }).click();
    await expectEveryDropOnce('after Show all gear');
    expect(await chromeOverView(page), 'chrome over the map view').toEqual([]);
    const markers = map.locator('.maplibregl-marker[data-place] button');
    const inView = within(await boxOf(drawnView(page)));
    for (const marker of await markers.all())
      expect(inView(await boxOf(marker)), 'marker cut by the view edge').toBe(
        true
      );
    expect(
      (await markers.evaluateAll(takeTapsAtCentre)).every(Boolean),
      'a marker that does not take its tap'
    ).toBe(true);
    for (const step of ['zoomed in once', 'zoomed in twice']) {
      await zoomIn.click();
      await expectEveryDropOnce(step);
    }
    await map.getByRole('button', { name: 'Show all gear' }).click();
    await expectEveryDropOnce('after Show all gear again');

    const timeInWater = page
      .getByRole('dialog')
      .getByRole('checkbox', { name: 'Time in the water' });
    await map.getByRole('button', { name: /^Filter/ }).click();
    await timeInWater.uncheck();
    await page.getByRole('button', { name: 'Done' }).click();
    await expectEveryDropOnce('without time labels');
    await map.getByRole('button', { name: /^Filter/ }).click();
    await timeInWater.check();
    await page.getByRole('button', { name: 'Done' }).click();
    await expectEveryDropOnce('with time labels again');

    for (const name of names) {
      const own = map.getByRole('button', { name: new RegExp(`^${name},`) });
      if (await own.count()) {
        await own.click();
      } else {
        await map
          .getByRole('button', {
            name: new RegExp(
              `gear (here|in this area)[^:]*: (.*, )?${name}(,|;|$)`
            )
          })
          .click();
        await dialogs
          .getByRole('button', { name: new RegExp(`^${name},`) })
          .click();
      }
      await expect(dialogs).toHaveCount(1);
      await expect(dialogs.getByRole('heading', { level: 2 })).toHaveText(name);
      await page.keyboard.press('Escape');
      await expect(dialogs).toHaveCount(0);
    }
  });
}

test('while the map shows all gear, a drop beyond its edge brings all gear back into view, and after I pan the map stays where I put it', async ({
  context,
  page
}) => {
  await dropPotAndOpenMap(page);
  const view = mapArea(page).getByRole('region', { name: 'Map view' });
  await expect(potOnMap(page)).toBeVisible();
  const dropAt = async (north: number, name: string) => {
    await context.setGeolocation({
      ...MADE_UP_SEA,
      latitude: MADE_UP_SEA.latitude + north,
      accuracy: 8
    });
    await expect(page.getByText('Position ready')).toBeVisible();
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(`${name} dropped`);
    return mapArea(page).getByRole('button', {
      name: new RegExp(`^${name},`)
    });
  };

  const pot2 = await dropAt(0.03, 'Pot 2');
  await expect
    .poll(async () => {
      const inView = within(await boxOf(view));
      return inView(await boxOf(pot2)) && inView(await boxOf(potOnMap(page)));
    })
    .toBe(true);

  const fromCentre = async () => {
    const [pin, middle] = await Promise.all([centreOf(pot2), centreOf(view)]);
    return { x: Math.round(pin.x - middle.x), y: Math.round(pin.y - middle.y) };
  };
  await panAway(page, pot2);
  let settled = await fromCentre();
  await expect
    .poll(async () => {
      const now = await fromCentre();
      const still = now.x === settled.x && now.y === settled.y;
      settled = now;
      return still;
    })
    .toBe(true);
  const pot3 = await dropAt(0.09, 'Pot 3');
  await expect(pot3).toHaveCount(1);
  expect(within(await boxOf(view))(await boxOf(pot3))).toBe(false);
  expect(await fromCentre()).toEqual(settled);
});

type Footprint = { left: number; top: number; right: number; bottom: number };

function markerFootprints(buttons: Element[]): Footprint[] {
  return buttons.map((button) => {
    let { left, top, right, bottom } = button.getBoundingClientRect();
    for (const part of button.parentElement?.querySelectorAll('*') ?? []) {
      const drawn = part.getBoundingClientRect();
      if (
        getComputedStyle(part).visibility !== 'visible' ||
        part.closest('.sr-only') ||
        drawn.width === 0 ||
        drawn.height === 0
      )
        continue;
      left = Math.min(left, drawn.left);
      top = Math.min(top, drawn.top);
      right = Math.max(right, drawn.right);
      bottom = Math.max(bottom, drawn.bottom);
    }
    return { left, top, right, bottom };
  });
}

const overlapping = (boxes: Footprint[]) =>
  boxes.flatMap((box, index) =>
    boxes
      .slice(index + 1)
      .filter(
        (other) =>
          Math.min(box.right, other.right) - Math.max(box.left, other.left) >
            0.5 &&
          Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top) >
            0.5
      )
      .map((other) => [box, other])
  );

const asFootprint = ({ x, y, width, height }: Box): Footprint => ({
  left: x,
  top: y,
  right: x + width,
  bottom: y + height
});

const drawnView = (page: Page) =>
  mapArea(page).getByRole('region', { name: 'Map view' });

const chromeOverView = async (page: Page) => {
  const drawn = asFootprint(await boxOf(drawnView(page)));
  const chrome = [
    ...MAP_CONTROLS.map((name) =>
      mapArea(page).getByRole('button', { name, exact: true })
    ),
    ...(await anyOutage(page).all())
  ];
  const over: string[] = [];
  for (const part of chrome) {
    if (overlapping([drawn, asFootprint(await boxOf(part))]).length > 0)
      over.push(
        (await part.getAttribute('aria-label')) ?? (await part.innerText())
      );
  }
  return over;
};

function takeTapsAtCentre(buttons: Element[]) {
  return buttons.map((button) => {
    const { x, y, width, height } = button.getBoundingClientRect();
    return (
      document
        .elementFromPoint(x + width / 2, y + height / 2)
        ?.closest('button') === button
    );
  });
}

test('while the map shows all gear, a map notice that appears later leaves every drop whole and tappable inside the map view', async ({
  context,
  page,
  providers
}) => {
  await dropPotAndOpenMap(page);
  await context.setGeolocation({
    ...MADE_UP_SEA,
    latitude: MADE_UP_SEA.latitude + 0.01,
    accuracy: 8
  });
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  const pins = mapArea(page).getByRole('button', { name: /^Pot \d,/ });
  await expect(pins).toHaveCount(2);

  await expect(toastOf(page)).toBeHidden({ timeout: 10_000 });
  await expect
    .poll(() => pins.evaluateAll(takeTapsAtCentre))
    .toEqual([true, true]);

  providers.cutOff();
  await reconnect(context);
  await expect(cannotLoad(page)).toBeVisible();
  await expect.poll(() => chromeOverView(page)).toEqual([]);
  await expect
    .poll(async () => {
      const inView = within(await boxOf(drawnView(page)));
      return [
        inView(await boxOf(pins.first())),
        inView(await boxOf(pins.last()))
      ];
    })
    .toEqual([true, true]);
  await expect
    .poll(() => pins.evaluateAll(takeTapsAtCentre))
    .toEqual([true, true]);
});

function shownWhole(credits: Element) {
  const { left, width, top, bottom } = credits.getBoundingClientRect();
  return [0, 0.25, 0.5, 0.75, 1]
    .map((across) => left + 4 + (width - 8) * across)
    .flatMap((x) => [
      [x, top + 4],
      [x, bottom - 4]
    ])
    .every(([x = 0, y = 0]) =>
      credits.contains(document.elementFromPoint(x, y))
    );
}

test('on a 320 by 640 screen, the newest drop and its time label stay clear of its Undo toast, and the map credits show whole', async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await dropPotAndOpenMap(page);
  await expect(potOnMap(page)).toBeVisible();
  await expect(potOnMap(page).locator('xpath=..')).toContainText('0 min');
  await expect
    .poll(async () => {
      const [marker] = await potOnMap(page).evaluateAll(markerFootprints);
      const toast = await boxOf(toastOf(page));
      return marker.bottom <= toast.y;
    })
    .toBe(true);
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  expect(
    await mapArea(page).locator('.maplibregl-ctrl-attrib').evaluate(shownWhole)
  ).toBe(true);
});

test('on a 320 by 640 screen with a map notice showing, a new drop stays clear of both the notice and its Undo toast, and stays put when Undo ends', async ({
  context,
  page,
  providers
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await dropPotAndOpenMap(page);
  await expect(toastOf(page)).toBeHidden({ timeout: 10_000 });
  providers.cutOff();
  await reconnect(context);
  await expect(cannotLoad(page)).toBeVisible();
  await context.setGeolocation({
    ...MADE_UP_SEA,
    latitude: MADE_UP_SEA.latitude - 0.02,
    accuracy: 8
  });
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  const newest = mapArea(page).getByRole('button', { name: /^Pot 2[ ,]/ });
  const footprint = async () => {
    const [marker] = await newest.evaluateAll(markerFootprints);
    return marker;
  };
  const coveredBy = async () => {
    const marker = await footprint();
    const covers = await Promise.all(
      [cannotLoad(page), toastOf(page)].map(async (cover) => {
        const { x, y, width, height } = await boxOf(cover);
        return { left: x, top: y, right: x + width, bottom: y + height };
      })
    );
    return covers.flatMap((cover) => overlapping([marker, cover]));
  };
  await expect.poll(coveredBy).toEqual([]);
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  const during = await footprint();
  await expect(toastOf(page)).toBeHidden({ timeout: 10_000 });
  expect(await footprint()).toEqual(during);
  await expect.poll(() => newest.evaluateAll(takeTapsAtCentre)).toEqual([true]);
});

test('on a 320 by 640 screen, gear dropped where the map credits show never covers them, and with a map notice showing Centre on my position puts me clear of every map control, the notice and the credits', async ({
  context,
  page,
  providers
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await dropPotAndOpenMap(page);
  await expect
    .poll(() => offCentre(page, potOnMap(page)))
    .toBeLessThan(CENTRED_PX);
  await mapArea(page)
    .getByRole('region', { name: 'Map view' })
    .press('ArrowLeft');
  let last = await centreOf(potOnMap(page));
  await expect
    .poll(async () => {
      const now = await centreOf(potOnMap(page));
      const still = now.x === last.x && now.y === last.y;
      last = now;
      return still && now.x > 0;
    })
    .toBe(true);

  const creditsText = mapArea(page).locator('.maplibregl-ctrl-attrib');
  const credits = await centreOf(creditsText);
  await context.setGeolocation({
    ...shiftedOnScreen(MADE_UP_SEA, credits.x - last.x, credits.y - last.y),
    accuracy: 8
  });
  await expect
    .poll(async () => {
      const me = await centreOf(myPosition(page));
      return Math.hypot(me.x - credits.x, me.y - credits.y);
    })
    .toBeLessThan(CENTRED_PX);
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  const pot2 = mapArea(page).getByRole('button', { name: /^Pot 2,/ });
  await expect
    .poll(
      async () => {
        const [marker] = await pot2.evaluateAll(markerFootprints);
        return overlapping([marker, asFootprint(await boxOf(creditsText))])
          .length;
      },
      { message: 'Pot 2 is drawn where the credits show' }
    )
    .toBe(1);
  expect(await creditsText.evaluate(shownWhole), 'credits overprinted').toBe(
    true
  );

  await expect(toastOf(page)).toBeHidden({ timeout: 10_000 });
  providers.cutOff();
  await reconnect(context);
  await expect(cannotLoad(page)).toBeVisible();
  await mapArea(page)
    .getByRole('button', { name: 'Centre on my position' })
    .click();
  const covers = [
    cannotLoad(page),
    creditsText,
    ...[
      /^Filter/,
      'Street map',
      'Show all gear',
      'Centre on my position',
      'Zoom in',
      'Zoom out'
    ].map((name) => mapArea(page).getByRole('button', { name, exact: true }))
  ];
  await expect
    .poll(async () => {
      const ring = asFootprint(await boxOf(myPosition(page)));
      const view = asFootprint(
        await boxOf(mapArea(page).getByRole('region', { name: 'Map view' }))
      );
      const blocked = [];
      for (const cover of covers)
        blocked.push(
          overlapping([ring, asFootprint(await boxOf(cover))]).length
        );
      return {
        blocked,
        inView:
          ring.left >= view.left &&
          ring.right <= view.right &&
          ring.top >= view.top &&
          ring.bottom <= view.bottom
      };
    })
    .toEqual({ blocked: covers.map(() => 0), inView: true });
});

function missedInterior(control: Element) {
  const { left, top, right, bottom, width, height } =
    control.getBoundingClientRect();
  const inset = 4;
  return [
    [left + width / 2, top + height / 2],
    [left + width / 2, top + inset],
    [left + width / 2, bottom - inset],
    [left + inset, top + height / 2],
    [right - inset, top + height / 2],
    [left + width / 4, bottom - inset],
    [right - width / 4, bottom - inset],
    [left + width / 4, top + inset],
    [right - width / 4, top + inset]
  ]
    .filter(
      ([x = 0, y = 0]) => !control.contains(document.elementFromPoint(x, y))
    )
    .map(
      ([x = 0, y = 0]) =>
        `${control.getAttribute('aria-label') ?? control.textContent.trim()} at ${x.toFixed(1)},${y.toFixed(1)}`
    );
}

for (const [width, height] of [
  [320, 640],
  [320, 568]
] as const) {
  for (const colorScheme of ['light', 'dark'] as const) {
    test(`on a ${String(width)} by ${String(height)} screen in ${colorScheme} mode, every map control takes taps across its whole target while the Undo toast shows, and tapping their lower edges keeps the drop`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height });
      await page.emulateMedia({ colorScheme });
      await dropPotAndOpenMap(page);
      await expect(potOnMap(page)).toBeVisible();
      const controls = [
        /^Filter/,
        'Street map',
        'Show all gear',
        'Zoom in',
        'Zoom out',
        'Centre on my position'
      ].map((name) => mapArea(page).getByRole('button', { name, exact: true }));
      for (const control of controls) await expect(control).toBeVisible();
      expect(await storedDrops(page)).toBe(1);

      const missed = (
        await Promise.all(
          controls.map((control) => control.evaluate(missedInterior))
        )
      ).flat();
      expect
        .soft(missed, 'control targets covered by another element')
        .toEqual([]);
      expect
        .soft(
          await mapArea(page)
            .locator('.maplibregl-ctrl-attrib')
            .evaluate(shownWhole),
          'map credits are covered'
        )
        .toBe(true);

      for (const name of [
        'Show all gear',
        'Zoom out',
        'Centre on my position'
      ]) {
        const {
          x,
          y,
          width: across,
          height: tall
        } = await boxOf(
          mapArea(page).getByRole('button', { name, exact: true })
        );
        await page.touchscreen.tap(x + across / 2, y + tall - 3);
      }
      await expect.soft(toastOf(page)).toContainText('Pot 1 dropped');
      expect(await storedDrops(page), 'a control tap removed the drop').toBe(1);

      const undo = toastOf(page).getByRole('button', { name: 'Undo' });
      expect(await undo.evaluate(missedInterior), 'Undo is covered').toEqual(
        []
      );
      await undo.tap();
      await expect(toastOf(page)).toContainText('Pot 1 removed');
      expect(await storedDrops(page)).toBe(0);
    });
  }
}

const dropAt = async (page: Page, number: number, north = 0, east = 0) => {
  await deliverFix(page, {
    latitude: MADE_UP_SEA.latitude + north,
    longitude: MADE_UP_SEA.longitude + east
  });
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText(`Pot ${String(number)} dropped`);
};

const settled = async (target: Locator) => {
  let last = '';
  await expect
    .poll(async () => {
      const now = JSON.stringify(await target.boundingBox());
      const still = now === last;
      last = now;
      return still;
    })
    .toBe(true);
};

const labelsOf = (buttons: Element[]) =>
  buttons.map((button) => button.getAttribute('aria-label') ?? '');

const sharedSpotOf = (labels: string[]) =>
  labels
    .filter((name) => name.includes('Pot 3'))
    .map((name) => {
      const sharing = ['Pot 1', 'Pot 2', 'Pot 4'].filter((other) =>
        name.includes(other)
      );
      const said = /\d gear (here|in this area)/.exec(name)?.[0] ?? 'alone';
      return `${sharing.join('+')} ${said}`;
    })
    .join(' | ');

const framesWatched = () => (window as unknown as { frames: number }).frames;

function watchCredits(frames: number) {
  const watched = window as unknown as { frames: number; covered: string[] };
  watched.frames = 0;
  watched.covered = [];
  const look = () => {
    const credits = document.querySelector('.maplibregl-ctrl-attrib');
    const toast = document.querySelector(
      '[aria-label="Messages"] [role="group"]'
    );
    const shown = credits?.getBoundingClientRect();
    if (credits && shown && shown.width > 0 && toast) {
      watched.frames += 1;
      const { left, width, top, bottom } = shown;
      const hidden = [0, 0.25, 0.5, 0.75, 1]
        .map((across) => Math.round(left + 4 + (width - 8) * across))
        .flatMap((x) => [
          [x, Math.round(top + 4)],
          [x, Math.round(bottom - 4)]
        ])
        .filter(
          ([x = 0, y = 0]) => !credits.contains(document.elementFromPoint(x, y))
        );
      if (hidden.length > 0) {
        watched.covered.push(
          `frame ${String(watched.frames)}: ${JSON.stringify(hidden)}`
        );
      }
    }
    if (watched.frames < frames) requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}

const expectMapWhole = async (page: Page, names: (string | RegExp)[]) => {
  const controls = names.map((name) =>
    mapArea(page).getByRole('button', { name, exact: true })
  );
  for (const control of controls) await expect(control).toBeVisible();
  await expect
    .poll(() =>
      mapArea(page).locator('.maplibregl-ctrl-attrib').evaluate(shownWhole)
    )
    .toBe(true);
  const missed = await Promise.all(
    controls.map((control) => control.evaluate(missedInterior))
  );
  expect(missed.flat(), 'control targets covered by another element').toEqual(
    []
  );
  expect(
    await toastOf(page)
      .getByRole('button', { name: 'Undo' })
      .evaluate(missedInterior),
    'Undo is covered'
  ).toEqual([]);
};

const gearRow = (page: Page, name: string) =>
  page.getByRole('main').getByRole('button').filter({ hasText: name });

test('a group led by collected gear says how many are in the water and collected, keeps Collect on its gear in the water, and hiding collected gear leaves only that gear', async ({
  page
}) => {
  const map = mapArea(page);
  const sheet = page.getByRole('dialog');
  const group = map.getByRole('button', { name: /\+\d more\./ });
  const others = group.getByText(/^\+\d$/);
  const othersBorder = () =>
    others.evaluate((segment) => getComputedStyle(segment).borderTopStyle);
  const collectFromGroup = async (name: string) => {
    await group.click();
    await sheet.getByRole('button', { name: new RegExp(`^${name},`) }).click();
    await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
    await sheet.getByRole('button', { name: 'Save' }).click();
    await expect(sheet).toHaveCount(0);
  };
  await holdFixes(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  for (const number of [1, 2, 3]) await dropAt(page, number);

  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(group).toHaveAccessibleName(
    /^Pot \d \+2 more\. 3 gear here: Pot \d, Pot \d, Pot \d$/
  );
  expect(await othersBorder()).toBe('solid');

  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 2').click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0);
  await gearRow(page, 'Pot 2').click();
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  await expect(group).toHaveAccessibleName(
    'Pot 2 +2 more. 3 gear here: Pot 1, Pot 3, Pot 2; 2 in the water, 1 collected'
  );
  await expect(others).toHaveText('+2');
  expect(await othersBorder()).toBe('solid');

  await group.click();
  await sheet.getByRole('button', { name: /^Pot 1,/ }).click();
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Pot 1');
  await expect(
    sheet.getByRole('button', { name: 'Collect', exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  await map.getByRole('button', { name: /^Filter/ }).click();
  await sheet.getByRole('checkbox', { name: 'Collected gear' }).uncheck();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(group).toHaveAccessibleName(
    /^Pot \d \+1 more\. 2 gear here: Pot 1, Pot 3$/
  );
  await map.getByRole('button', { name: /^Filter/ }).click();
  await sheet.getByRole('checkbox', { name: 'Collected gear' }).check();
  await sheet.getByRole('button', { name: 'Done' }).click();

  await collectFromGroup('Pot 1');
  await collectFromGroup('Pot 3');
  await expect(group).toHaveAccessibleName(
    /^Pot \d \+2 more\. 3 gear here: Pot \d, Pot \d, Pot \d$/
  );
  expect(await othersBorder()).toBe('dashed');
});

test('collecting the gear that leads a group returns focus to the group, now led by other gear', async ({
  page
}) => {
  const map = mapArea(page);
  const sheet = page.getByRole('dialog');
  const group = map.getByRole('button', { name: /\+\d more\./ });
  await holdFixes(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  for (const number of [1, 2]) await dropAt(page, number);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(group).toHaveAccessibleName(/^Pot 2 \+1 more\./);

  await group.click();
  await sheet.getByRole('button', { name: /^Pot 2,/ }).click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(group).toHaveAccessibleName(/^Pot 1 \+1 more\./);
  await expect(group).toBeFocused();
});

test('my position north of small collected gear shows whole when the map opens and after Show all gear', async ({
  page
}) => {
  const map = mapArea(page);
  const sheet = page.getByRole('dialog');
  const meWhole = async () =>
    within(await boxOf(drawnView(page)))(await boxOf(myPosition(page)));
  await holdFixes(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await dropAt(page, 1);
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await deliverFix(page, {
    latitude: MADE_UP_SEA.latitude + 0.01,
    longitude: MADE_UP_SEA.longitude
  });

  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(myPosition(page)).toBeVisible();
  await expect.poll(meWhole, 'my position cut when the map opens').toBe(true);
  await map.getByRole('button', { name: 'Zoom in' }).click();
  await map.getByRole('button', { name: 'Show all gear' }).click();
  await expect.poll(meWhole, 'my position cut after Show all gear').toBe(true);
});

test('uncollected gear from past trips grouped at the east edge of the map shows whole, its mark and full count included, at +99 and at +100', async ({
  page
}) => {
  test.slow();
  const map = mapArea(page);
  const sheet = page.getByRole('dialog');
  const group = map.getByRole('button', { name: /^Pot \d+ \+\d+ more\./ });
  const endTrip = async () => {
    await page.getByRole('button', { name: 'End trip' }).click();
    await sheet.getByRole('button', { name: 'End trip' }).click();
    await expect(sheet).toBeHidden();
  };
  const shownWholeAtEdge = async (more: number, first: number) => {
    const names = Array.from(
      { length: more + 1 },
      (_, step) => `Pot ${String(first + step)}`
    ).join(', ');
    await expect(group).toHaveAccessibleName(
      new RegExp(
        `^Pot \\d+ \\+${String(more)} more\\. ${String(more + 1)} gear here: ${names}; all uncollected$`
      )
    );
    await expect(group).toContainText(`+${String(more)}`);
    await settled(group);
    const [drawn] = await group.evaluateAll(markerFootprints);
    const view = asFootprint(await boxOf(drawnView(page)));
    expect(view.right - drawn.right).toBeLessThan((view.right - view.left) / 4);
    expect(drawn).toEqual({
      left: Math.max(drawn.left, view.left),
      top: Math.max(drawn.top, view.top),
      right: Math.min(drawn.right, view.right),
      bottom: Math.min(drawn.bottom, view.bottom)
    });
    expect(await group.evaluateAll(takeTapsAtCentre)).toEqual([true]);
  };
  await holdFixes(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await dropAt(page, 1, 0, -0.01);
  for (let number = 2; number <= 101; number += 1) await dropAt(page, number);
  await endTrip();
  await map.getByRole('button', { name: /^Filter/ }).click();
  await sheet
    .getByRole('group', { name: 'Also show' })
    .getByRole('checkbox', { name: 'Past trips' })
    .setChecked(true);
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  await shownWholeAtEdge(99, 2);

  await dropAt(page, 1);
  await endTrip();
  await shownWholeAtEdge(100, 1);
  await expect(
    map.getByRole('button', { name: /^Pot 1, past trip/ })
  ).toHaveCount(1);
});

test('drops that share a spot stay in one group at every zoom, and a group that also takes in a nearby drop says it covers an area', async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const map = mapArea(page);
  const zoomIn = map.getByRole('button', { name: 'Zoom in' });
  const SHARED =
    /^(Pot 1\+Pot 2 3 gear here|Pot 1\+Pot 2\+Pot 4 4 gear in this area)$/;
  const sharedSpot = async () =>
    sharedSpotOf(
      await map.getByRole('button', { name: /^Pot \d/ }).evaluateAll(labelsOf)
    );
  await holdFixes(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await dropAt(page, 1);
  await dropAt(page, 2);
  await dropAt(page, 3, 0.00002, 0.00002);
  await dropAt(page, 4, 0.003, 0.003);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(map.getByRole('button', { name: /^Pot 4/ })).toBeVisible();

  expect(await sharedSpot()).toMatch(SHARED);
  const group = map.getByRole('button', { name: /^Pot 3/ });
  for (let step = 0; step < 30 && (await zoomIn.isEnabled()); step += 1) {
    await zoomIn.click();
    await expect.poll(sharedSpot).toMatch(SHARED);
    await settled(group);
  }
  await expect(zoomIn).toBeDisabled();
  await expect.poll(sharedSpot).toBe('Pot 1+Pot 2 3 gear here');
  await expect(map.getByRole('button', { name: /^Pot 4,/ })).toBeVisible();

  await map.getByRole('button', { name: 'Show all gear' }).click();
  await expect.poll(sharedSpot).toMatch(SHARED);
});

test('Show on map rings the gear it shows, alone or in its group, after focus moves on and after its sheet closes, until I move the map myself', async ({
  page
}) => {
  const map = mapArea(page);
  const sheet = page.getByRole('dialog');
  const shownOnMap = map.locator('[aria-current="true"]');
  const pot3 = map.getByRole('button', { name: /^Pot 3,/ });
  const ledByPot2 = map.getByRole('button', { name: /^Pot 2 \+/ });
  const ringed = (target: Locator) => target.evaluate(ringedInMagenta);
  const showFromGear = async (name: string) => {
    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await gearRow(page, name).click();
    await sheet.getByRole('button', { name: 'Show on map' }).click();
    await expect(sheet).toHaveCount(0);
  };
  await holdFixes(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await dropAt(page, 1);
  await dropAt(page, 2);
  await dropAt(page, 3, 0.003, 0.003);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(pot3).toBeVisible();
  await expect(shownOnMap).toHaveCount(0);
  expect(await ringed(pot3)).toBe(false);

  await showFromGear('Pot 3');
  await expect(pot3).toBeFocused();
  await expect(pot3).toHaveAttribute('aria-current', 'true');
  expect(await ringed(pot3)).toBe(true);
  await page.keyboard.press('Tab');
  await expect(pot3).not.toBeFocused();
  await expect(shownOnMap).toHaveCount(1);
  await expect(pot3).toHaveAttribute('aria-current', 'true');
  expect(await ringed(pot3)).toBe(true);

  await pot3.click();
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Pot 3');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(pot3).toBeFocused();
  await expect(pot3).toHaveAttribute('aria-current', 'true');
  expect(await ringed(pot3)).toBe(true);

  await showFromGear('Pot 2');
  await expect(ledByPot2).toBeFocused();
  await expect(ledByPot2).toHaveAccessibleName(
    /^Pot 2 \+1 more\. 2 gear here: /
  );
  await expect(ledByPot2).toHaveAttribute('aria-current', 'true');
  await expect(shownOnMap).toHaveCount(1);
  expect(await ringed(ledByPot2)).toBe(true);
  expect(await ringed(pot3)).toBe(false);

  await map.getByRole('button', { name: 'Zoom in' }).click();
  await expect(ledByPot2).toHaveAttribute('aria-current', 'true');
  await expect(shownOnMap).toHaveCount(1);

  await panAway(page, ledByPot2);
  await expect(shownOnMap).toHaveCount(0);
  expect(await ringed(ledByPot2)).toBe(false);
});

test('on a 320 by 640 screen, opening the Map tab and Show on map from the Gear list keep the map credits whole in every frame while the Undo toast shows', async ({
  page
}) => {
  const covered = () =>
    page.evaluate(() => (window as unknown as { covered: string[] }).covered);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.evaluate(watchCredits, 30);
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect
    .poll(() => page.evaluate(framesWatched))
    .toBeGreaterThanOrEqual(30);
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  expect(await covered(), 'map credits covered opening Map').toEqual([]);
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await page.evaluate(watchCredits, 90);
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Show on map' })
    .click();
  await expect(potOnMap(page)).toBeFocused();
  await expect
    .poll(() => page.evaluate(framesWatched))
    .toBeGreaterThanOrEqual(90);
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  expect(await covered(), 'map credits covered').toEqual([]);
});

const MAP_CONTROLS = [
  /^Filter/,
  'Street map',
  'Show all gear',
  'Centre on my position',
  'Zoom in',
  'Zoom out'
];

for (const [width, height] of [
  [393, 852],
  [402, 681],
  [320, 640],
  [320, 568]
] as const) {
  test(`on a ${String(width)} by ${String(height)} screen, a map notice that arrives after I pan, filter, Show on map and move my position, while a drop's Undo shows, sits outside the map view clear of every map control, keeps the shown gear centred and ringed, leaves every drop, the newest drop and my position whole and tappable${height < 600 ? ' once Undo goes' : ''}, leaves Undo and the credits whole, and leaves once a map tile arrives`, async ({
    context,
    page,
    providers
  }) => {
    await page.setViewportSize({ width, height });
    const map = mapArea(page);
    const notice = cannotLoad(page);
    await dropPotAndOpenMap(page);
    await expect(toastOf(page)).toBeHidden({ timeout: 10_000 });
    await drawnView(page).press('ArrowLeft');
    await expect
      .poll(() => offCentre(page, potOnMap(page)))
      .toBeGreaterThan(CENTRED_PX);

    await map.getByRole('button', { name: /^Filter/ }).click();
    const sheet = page.getByRole('dialog');
    await sheet.getByRole('checkbox', { name: 'Collected gear' }).uncheck();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await gearRow(page, 'Pot 1').click();
    await sheet.getByRole('button', { name: 'Show on map' }).click();
    await expect(potOnMap(page)).toBeFocused();
    await expect
      .poll(() => offCentre(page, potOnMap(page)))
      .toBeLessThan(CENTRED_PX);

    const before = await boxOf(drawnView(page));
    const centre = await centreOf(drawnView(page));
    const moveMeTo = async (x: number, y: number) => {
      await context.setGeolocation({
        ...shiftedOnScreen(MADE_UP_SEA, x - centre.x, y - centre.y),
        accuracy: 8
      });
      await expect
        .poll(async () => {
          const me = await centreOf(myPosition(page));
          return Math.hypot(me.x - x, me.y - y);
        })
        .toBeLessThan(CENTRED_PX);
    };
    await moveMeTo(before.x + 60, before.y + 60);
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText('Pot 2 dropped');
    const pot2 = map.getByRole('button', { name: /^Pot 2,/ });
    await moveMeTo(before.x + before.width - 70, before.y + 80);

    providers.refuseCors();
    await reconnect(context);
    await expect(notice).toBeVisible();
    await expect(toastOf(page)).toContainText('Pot 2 dropped');
    expect(await chromeOverView(page), 'chrome over the map view').toEqual([]);
    await expect
      .poll(() => offCentre(page, potOnMap(page)))
      .toBeLessThan(CENTRED_PX);
    await expect(potOnMap(page)).toHaveAttribute('aria-current', 'true');
    await expect
      .poll(async () => {
        const inView = within(await boxOf(drawnView(page)));
        const whole = [];
        for (const target of [potOnMap(page), pot2, myPosition(page)])
          whole.push(inView(await boxOf(target)));
        return whole;
      })
      .toEqual([true, true, true]);
    expect((await representedOn(map)).flat().toSorted()).toEqual([
      'Pot 1',
      'Pot 2'
    ]);
    await expectMapWhole(page, MAP_CONTROLS);
    await expect(toastOf(page)).toContainText('Pot 2 dropped');
    if (height < 600) {
      await expect(toastOf(page)).toBeHidden({ timeout: 10_000 });
    }
    await expect
      .poll(() =>
        map
          .getByRole('button', { name: /^Pot \d,/ })
          .evaluateAll(takeTapsAtCentre)
      )
      .toEqual([true, true]);

    providers.serve();
    await reconnect(context);
    await expect(notice).toBeHidden();
    expect(await chromeOverView(page)).toEqual([]);
  });
}

test.describe('with location denied', () => {
  test.use({ permissions: [] });

  for (const colorScheme of ['light', 'dark'] as const) {
    test(`on a 320 by 568 screen in ${colorScheme} mode with the Settings steps shown, a drop's Undo toast leaves the map credits, every map control and Undo whole`, async ({
      page
    }) => {
      await page.setViewportSize({ width: 320, height: 568 });
      await page.emulateMedia({ colorScheme });
      await page.goto('/');
      await page.getByRole('button', { name: 'Turn on location' }).click();
      await page
        .getByRole('region', { name: 'Location is off' })
        .getByRole('button', { name: 'How to turn on in Settings' })
        .click();
      await page.getByRole('button', { name: 'Drop pot' }).click();
      await expect(toastOf(page)).toContainText('Pot 1 dropped');

      await expectMapWhole(page, [
        /^Filter/,
        'Street map',
        'Zoom in',
        'Zoom out'
      ]);
    });
  }
});
