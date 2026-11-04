import type { Page } from '@playwright/test';

export type Fix = { latitude: number; longitude: number; accuracy?: number };

type HeldFix = { deliverFix?: PositionCallback };

export const holdFixes = (page: Page) =>
  page.addInitScript(() => {
    const held = window as HeldFix;
    navigator.geolocation.watchPosition = (success) => {
      held.deliverFix = success;
      return 1;
    };
    navigator.geolocation.clearWatch = () => undefined;
  });

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
