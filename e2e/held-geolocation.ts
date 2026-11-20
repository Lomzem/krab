import type { Page } from '@playwright/test';

export type Fix = { latitude: number; longitude: number; accuracy?: number };

type HeldFix = {
  deliverFix?: PositionCallback;
  denyLocation?: PositionErrorCallback | null;
};

export const holdFixes = (page: Page, { steady = false } = {}) =>
  page.addInitScript(
    ({ steady }) => {
      const held = window as HeldFix;
      navigator.geolocation.watchPosition = (success, error) => {
        let last: GeolocationCoordinates | null = null;
        held.deliverFix = (position) => {
          last = position.coords;
          success(position);
        };
        held.denyLocation = error;
        if (steady) {
          setInterval(() => {
            if (last) {
              success({
                coords: last,
                timestamp: Date.now()
              } as GeolocationPosition);
            }
          }, 1000);
        }
        return 1;
      };
      navigator.geolocation.clearWatch = () => undefined;
    },
    { steady }
  );

export const deliverFix = (page: Page, fix: Fix, at?: Date) =>
  page.evaluate(
    ({ coords, timestamp }) => {
      (window as HeldFix).deliverFix?.({
        coords,
        timestamp: timestamp ?? Date.now()
      } as GeolocationPosition);
    },
    {
      coords: { accuracy: 5, ...fix },
      timestamp: at?.getTime()
    }
  );

export const denyLocation = (page: Page) =>
  page.evaluate(() => {
    (window as HeldFix).denyLocation?.({
      code: 1,
      message: 'denied',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3
    });
  });
