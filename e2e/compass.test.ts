import type { Locator, Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';

const MOTION_OFF = 'Motion access off';

const denyMotion = (page: Page) =>
  page.addInitScript(() => {
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      value: () => Promise.resolve('denied')
    });
    for (const field of ['webkitCompassHeading', 'webkitCompassAccuracy'])
      Object.defineProperty(DeviceOrientationEvent.prototype, field, {
        get: () => null
      });
  });

const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box ?? { x: 0, y: 0, width: 0, height: 0 };
};

const gapBetween = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) =>
  Math.hypot(
    Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)),
    Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height))
  );

for (const [width, height] of [
  [402, 681],
  [320, 568],
  [852, 340]
] as const) {
  test(`on a ${String(width)} by ${String(height)} screen, denied motion access shows Motion access off beside Compass, announces it once and moves no map control, the map or the Drop bar`, async ({
    page
  }) => {
    await denyMotion(page);
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();
    await expect(page.getByText('Finding position')).toBeHidden();
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText('Pot 1 dropped');
    await page.getByRole('button', { name: 'Map', exact: true }).click();

    const map = page.getByRole('region', { name: 'Map', exact: true });
    const compass = map.getByRole('button', { name: 'Compass', exact: true });
    const note = map.getByRole('status').filter({ hasText: MOTION_OFF });
    const fixed = [
      map.getByRole('region', { name: 'Map view' }),
      page.getByRole('button', { name: 'Drop pot' }),
      map.getByRole('radio', { name: 'Chart map' }),
      map.getByRole('radio', { name: 'Street map' }),
      map.getByRole('button', { name: /^Filter/ }),
      compass,
      map.getByRole('button', { name: 'Show all gear' }),
      map.getByRole('button', { name: 'Centre on my position' }),
      map.getByRole('button', { name: 'Zoom in' }),
      map.getByRole('button', { name: 'Zoom out' })
    ];
    const boxes = () => Promise.all(fixed.map(boxOf));
    await expect(compass).toHaveAttribute('aria-pressed', 'false');
    await expect(note).toHaveCount(0);
    const before = await boxes();

    await map.evaluate((region) => {
      const told: string[] = [];
      Object.assign(window, { motionTold: told });
      for (const live of region.querySelectorAll('[role="status"]')) {
        new MutationObserver(() => {
          const text = live.textContent.trim();
          if (text !== '' && text !== told.at(-1)) told.push(text);
        }).observe(live, {
          childList: true,
          characterData: true,
          subtree: true
        });
      }
    });
    const told = () =>
      page.evaluate(() => {
        const seen: unknown = Reflect.get(window, 'motionTold');
        return Array.isArray(seen) ? seen : null;
      });

    await compass.click();
    await expect(note).toBeVisible();
    await expect(note).toHaveText(MOTION_OFF);
    await expect(compass).toHaveAttribute('aria-pressed', 'false');
    await expect(compass).toHaveAccessibleDescription(MOTION_OFF);
    expect(await boxes()).toEqual(before);

    const shown = await boxOf(note);
    const view = await boxOf(fixed[0]);
    expect(gapBetween(shown, await boxOf(compass))).toBeLessThan(64);
    expect(shown.x).toBeGreaterThanOrEqual(view.x);
    expect(shown.x + shown.width).toBeLessThanOrEqual(view.x + view.width);
    expect(shown.y + shown.height).toBeLessThanOrEqual(view.y + view.height);
    for (const control of fixed.slice(2)) {
      const box = await boxOf(control);
      const overlap =
        Math.max(
          0,
          Math.min(shown.x + shown.width, box.x + box.width) -
            Math.max(shown.x, box.x)
        ) *
        Math.max(
          0,
          Math.min(shown.y + shown.height, box.y + box.height) -
            Math.max(shown.y, box.y)
        );
      expect(overlap).toBe(0);
    }

    await map.getByRole('button', { name: 'Zoom in' }).click();
    await map.getByRole('button', { name: 'Show all gear' }).click();
    await expect(note).toBeVisible();
    expect(await told()).toEqual([MOTION_OFF]);

    await compass.click();
    await expect(compass).toHaveAccessibleDescription('Compass off');
    await expect(note).toHaveCount(0);
    expect(await boxes()).toEqual(before);
  });
}
