import type { Page } from '@playwright/test';

export type Fix = { latitude: number; longitude: number; accuracy?: number };

type HeldFix = {
  deliverFix?: PositionCallback;
  denyLocation?: PositionErrorCallback;
  fixAges?: boolean;
};

export const holdFixes = (page: Page) =>
  page.addInitScript(() => {
    const held = window as HeldFix;
    let last: GeolocationCoordinates | null = null;
    let report: PositionCallback | null = null;
    let renewal: ReturnType<typeof setInterval> | undefined;
    const renew = () => {
      if (last && report && !held.fixAges)
        report({ coords: last, timestamp: Date.now() } as GeolocationPosition);
    };
    navigator.geolocation.watchPosition = (success, error) => {
      report = success;
      held.deliverFix = (position) => {
        last = position.coords;
        success(position);
      };
      held.denyLocation = (denial) => {
        last = null;
        error?.(denial);
      };
      clearInterval(renewal);
      renewal = setInterval(renew, 4000);
      return 1;
    };
    navigator.geolocation.clearWatch = () => {
      report = null;
      clearInterval(renewal);
    };
  });

export const letFixAge = async (page: Page) => {
  const ages = () => {
    (window as HeldFix).fixAges = true;
  };
  await page.addInitScript(ages);
  await page.evaluate(ages);
};

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
