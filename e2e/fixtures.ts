import { test as base, type Page, type Route } from '@playwright/test';

export { expect } from '@playwright/test';

const NOAA = 'https://gis.charttools.noaa.gov/**';
const OPEN_FREE_MAP = 'https://tiles.openfreemap.org/**';

const CLEAR_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==',
  'base64'
);

const STREET_TILES = 'https://tiles.openfreemap.org/krab-e2e/{z}/{x}/{y}.png';

const STREET_STYLE = {
  version: 8,
  sources: {
    street: { type: 'raster', tiles: [STREET_TILES], tileSize: 256 }
  },
  layers: [{ id: 'street', type: 'raster', source: 'street' }]
};

const CORS = { 'access-control-allow-origin': '*' };

export type Providers = {
  serve: () => void;
  cutOff: () => void;
};

const fulfil = (route: Route) =>
  new URL(route.request().url()).pathname.endsWith('.png')
    ? route.fulfill({
        contentType: 'image/png',
        headers: CORS,
        body: CLEAR_PNG
      })
    : route.fulfill({ json: STREET_STYLE, headers: CORS });

export const test = base.extend<{ providers: Providers }>({
  serviceWorkers: 'block',
  providers: [
    async ({ context }, use) => {
      let reachable = true;
      const answer = (route: Route) =>
        reachable ? fulfil(route) : route.abort('internetdisconnected');
      await context.route(NOAA, answer);
      await context.route(OPEN_FREE_MAP, answer);
      await use({
        serve: () => {
          reachable = true;
        },
        cutOff: () => {
          reachable = false;
        }
      });
    },
    { auto: true }
  ]
});

export const toastOf = (page: Page) =>
  page.getByRole('status', { name: 'Messages' }).getByRole('group');

type HeldStorage = { releaseStorage?: boolean };

export const holdStorage = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((held) => {
        const request = indexedDB.open('krab');
        request.onsuccess = () => {
          const trips = request.result
            .transaction('trips', 'readwrite')
            .objectStore('trips');
          const keepBusy = () => {
            if ((window as HeldStorage).releaseStorage) return;
            trips.count().onsuccess = keepBusy;
          };
          (window as HeldStorage).releaseStorage = false;
          keepBusy();
          held();
        };
      })
  );

export const releaseStorage = (page: Page) =>
  page.evaluate(() => {
    (window as HeldStorage).releaseStorage = true;
  });
