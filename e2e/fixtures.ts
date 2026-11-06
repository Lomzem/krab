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
  refuseCors: () => void;
  hold: () => void;
  held: () => number;
};

const fulfil = (
  route: Route,
  streetStyle: unknown,
  headers: Record<string, string> = CORS
) =>
  new URL(route.request().url()).pathname.endsWith('.png')
    ? route.fulfill({
        contentType: 'image/png',
        headers,
        body: CLEAR_PNG
      })
    : route.fulfill({ json: streetStyle, headers });

export const test = base.extend<{ providers: Providers }>({
  serviceWorkers: 'block',
  providers: [
    async ({ context }, use) => {
      let mode: 'serve' | 'cutOff' | 'refuseCors' | 'hold' = 'serve';
      let served: unknown = STREET_STYLE;
      const waiting: Route[] = [];
      const answer = async (route: Route) => {
        if (mode === 'hold') {
          waiting.push(route);
          return;
        }
        if (mode === 'serve') await fulfil(route, served);
        else if (mode === 'refuseCors')
          await fulfil(route, served, {
            'access-control-allow-origin': 'https://elsewhere.example'
          });
        else await route.abort('internetdisconnected');
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
        refuseCors: () => {
          mode = 'refuseCors';
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

type StoredCatch = { kept: number; released: number } | null;

type StoredTrip = {
  drops: { collectedAt: number | null; catch: StoredCatch }[];
};

const storedTrips = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<StoredTrip[]>((read, failed) => {
        const request = indexedDB.open('krab');
        request.onsuccess = () => {
          const db = request.result;
          const fail = (reason: string) => {
            db.close();
            failed(new Error(reason));
          };
          if (!db.objectStoreNames.contains('trips')) {
            fail('krab has no trips store');
            return;
          }
          const tx = db.transaction('trips', 'readonly');
          const all = tx.objectStore('trips').getAll();
          all.onsuccess = () => {
            db.close();
            read(all.result as StoredTrip[]);
          };
          all.onerror = () => {
            fail(`could not read trips: ${String(all.error?.name)}`);
          };
          tx.onabort = () => {
            fail(`trips read aborted: ${String(tx.error?.name)}`);
          };
        };
        request.onerror = () => {
          failed(new Error('could not open krab'));
        };
      })
  );

export const storedDrops = async (page: Page) =>
  (await storedTrips(page)).reduce((sum, trip) => sum + trip.drops.length, 0);

export const storedCollections = async (page: Page) =>
  (await storedTrips(page)).flatMap((trip) =>
    trip.drops.map((drop) => ({
      collected: drop.collectedAt !== null,
      catch: drop.catch
    }))
  );
