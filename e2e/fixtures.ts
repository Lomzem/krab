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
  serve: (streetStyle?: unknown) => void;
  cutOff: () => void;
  hold: () => void;
  held: () => number;
};

const fulfil = (route: Route, streetStyle: unknown) =>
  new URL(route.request().url()).pathname.endsWith('.png')
    ? route.fulfill({
        contentType: 'image/png',
        headers: CORS,
        body: CLEAR_PNG
      })
    : route.fulfill({ json: streetStyle, headers: CORS });

export const test = base.extend<{ providers: Providers }>({
  serviceWorkers: 'block',
  providers: [
    async ({ context }, use) => {
      let mode: 'serve' | 'cutOff' | 'hold' = 'serve';
      let served: unknown = STREET_STYLE;
      const waiting: Route[] = [];
      const answer = async (route: Route) => {
        if (mode === 'hold') {
          waiting.push(route);
          return;
        }
        await (mode === 'serve'
          ? fulfil(route, served)
          : route.abort('internetdisconnected'));
      };
      await context.route(NOAA, answer);
      await context.route(OPEN_FREE_MAP, answer);
      await use({
        serve: (streetStyle = STREET_STYLE) => {
          mode = 'serve';
          served = streetStyle;
          for (const route of waiting.splice(0)) {
            fulfil(route, served).catch(() => undefined);
          }
        },
        cutOff: () => {
          mode = 'cutOff';
        },
        hold: () => {
          mode = 'hold';
        },
        held: () => waiting.length
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
