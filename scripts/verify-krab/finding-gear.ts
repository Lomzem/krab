#!/usr/bin/env bun
import { expect, test, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { doctor } from './doctor';
import { toastOf } from '../../e2e/fixtures';
import { readTrips, recorder } from './evidence';
import { MADE_UP_SEA } from '../../playwright.config';
import {
  chartSource,
  chartTileUrl
} from '../../src/lib/features/map/chart-tiles';

const TILE_PX = 256;

const PUBLIC_COASTLINE = [
  {
    name: 'Golden Gate Park, San Francisco',
    lat: 37.7694,
    lon: -122.4862,
    surface: 'land'
  },
  {
    name: 'Pacific west of Ocean Beach, San Francisco',
    lat: 37.76,
    lon: -122.56,
    surface: 'water'
  }
] as const;

const ALIGNMENT_ZOOMS = [10, 14];

const slippyPixel = (lat: number, lon: number, zoom: number) => {
  const world = TILE_PX * 2 ** zoom;
  const sin = Math.sin((lat * Math.PI) / 180);
  const x = ((lon + 180) / 360) * world;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world;
  return {
    tileX: Math.floor(x / TILE_PX),
    tileY: Math.floor(y / TILE_PX),
    px: Math.floor(x % TILE_PX),
    py: Math.floor(y % TILE_PX)
  };
};

const chartTile = (zoom: number, x: number, y: number) =>
  chartTileUrl(
    (chartSource.tiles?.[0] ?? '')
      .replace('{z}', String(zoom))
      .replace('{x}', String(x))
      .replace('{y}', String(y))
  );

const sampleTile = (page: Page, url: string, px: number, py: number) =>
  page.evaluate(
    async ({ url, px, py }) => {
      const response = await fetch(url, { mode: 'cors' });
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const drawing = canvas.getContext('2d');
      drawing?.drawImage(bitmap, 0, 0);
      const data = drawing?.getImageData(
        Math.max(0, px - 2),
        Math.max(0, py - 2),
        5,
        5
      ).data;
      const channel = (pixels: Uint8ClampedArray, offset: number) =>
        Array.from(
          { length: 25 },
          (_, index) => pixels[index * 4 + offset] ?? 0
        )
          .sort((a, b) => a - b)
          .at(12) ?? 0;
      return {
        status: response.status,
        mode: response.type,
        rgba: data ? [0, 1, 2, 3].map((offset) => channel(data, offset)) : null
      };
    },
    { url, px, py }
  );

const surfaceOf = (rgba: number[] | null) => {
  const [red = 0, , blue = 0, alpha = 0] = rgba ?? [];
  if (alpha !== 255) return 'unreadable';
  return red - blue > 25 ? 'land' : 'water';
};

test('finding gear on the Map tab and from the Gear list', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(page, info, 'finding-gear', 'Map');
  const requested: string[] = [];
  context.on('request', (request) => requested.push(request.url()));
  keep('doctor.json', doctor());
  log('doctor passed: our preview process owns 4173');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  log('fresh context; made-up mid-ocean fix; Position ready');
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  log('tap Drop pot on the Map tab; saved toast visible');

  const map = page.getByRole('region', { name: 'Map', exact: true });
  const pot = map.getByRole('button', { name: /^Pot 1,/ });
  await expect(pot).toBeVisible();
  await expect(map.getByRole('img', { name: /^Your position/ })).toBeVisible();
  await expect(map.getByRole('heading', { name: /Nearest gear/ })).toHaveText(
    /Pot 1/
  );
  await expect(map).toContainText('Not to be used for navigation');
  log('Map shows Pot 1, my position, the nearest card and NOAA attribution');
  await capture('01-map');

  await pot.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Show on map' })).toHaveCount(
    0
  );
  log('tap Pot 1 on the map; its sheet opens without Show on map');
  await capture('02-sheet-from-map');
  await page.keyboard.press('Escape');
  await expect(pot).toBeFocused();
  log('Escape closes the sheet; focus returns to Pot 1 on the map');

  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: 'Pot 1' })
    .click();
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  await expect(pot).toBeFocused();
  await expect(pot).toBeInViewport();
  log('Gear > Pot 1 > Show on map returns to the Map focused on Pot 1');
  await capture('03-shown-on-map');

  const street = map.getByRole('button', { name: 'Street map' });
  await street.click();
  await expect(street).toHaveAttribute('aria-pressed', 'true');
  await expect(map).toContainText('OpenStreetMap');
  await map.getByRole('button', { name: 'Centre on my position' }).click();
  await expect(pot).toBeInViewport();
  log(
    'Street map on with OpenStreetMap attribution; Centre on my position keeps Pot 1 in view'
  );
  await capture('04-street');

  keep('indexeddb-after.json', await readTrips(page));
  keep('requests.json', requested);
  log('kept read-only IndexedDB and every request URL of this journey');
});

test('NOAA chart tiles line up with a public coastline at two zooms', async ({
  page
}, info) => {
  const { log, keep } = recorder(page, info, 'finding-gear', 'Alignment');
  keep('doctor.json', doctor());
  await page.goto('/');
  const samples = [];
  for (const zoom of ALIGNMENT_ZOOMS) {
    for (const place of PUBLIC_COASTLINE) {
      const { tileX, tileY, px, py } = slippyPixel(place.lat, place.lon, zoom);
      const url = chartTile(zoom, tileX, tileY);
      const sample = await sampleTile(page, url, px, py);
      const tile = await page.request.get(url);
      writeFileSync(
        info.outputPath(`tile-z${String(zoom)}-${place.surface}.png`),
        await tile.body()
      );
      samples.push({ zoom, ...place, url, px, py, ...sample });
      log(
        `z${String(zoom)} ${place.name}: rgba ${String(sample.rgba)} reads as ${surfaceOf(sample.rgba)}`
      );
    }
  }
  keep('alignment.json', samples);
  const blank = await page.evaluate((size) => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas.toDataURL('image/png');
  }, TILE_PX);
  const control = await sampleTile(page, blank, TILE_PX / 2, TILE_PX / 2);
  log(
    `transparent tile control: rgba ${String(control.rgba)} reads as ${surfaceOf(control.rgba)}`
  );
  expect(surfaceOf(control.rgba), 'a transparent tile is not water').toBe(
    'unreadable'
  );
  for (const sample of samples) {
    expect(sample.status).toBe(200);
    expect(sample.mode).toBe('cors');
    expect(
      surfaceOf(sample.rgba),
      `${sample.name} at z${String(sample.zoom)}`
    ).toBe(sample.surface);
  }
});
