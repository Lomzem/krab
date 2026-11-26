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

type Box = { x: number; y: number; width: number; height: number };

const boxOf = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  return box ?? { x: 0, y: 0, width: 0, height: 0 };
};

const overlapOf = (a: Box, b: Box) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

const centreOf = ({ x, y, width, height }: Box) => ({
  x: x + width / 2,
  y: y + height / 2
});

const openMapDenied = async (page: Page, width: number, height: number) => {
  await denyMotion(page);
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  const map = page.getByRole('region', { name: 'Map', exact: true });
  return {
    map,
    compass: map.getByRole('button', { name: 'Compass', exact: true }),
    note: map.getByRole('status').filter({ hasText: MOTION_OFF })
  };
};

const gapBetween = (a: Box, b: Box) =>
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
    const { map, compass, note } = await openMapDenied(page, width, height);
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

    await page.evaluate(() => {
      const told: string[] = [];
      Object.assign(window, { motionTold: told });
      const LIVE = '[role="status"], [role="alert"], [aria-live]';
      new MutationObserver((records) => {
        const changed = new Set<Element>();
        for (const record of records) {
          const around = (
            record.target instanceof Element
              ? record.target
              : record.target.parentElement
          )?.closest(LIVE);
          if (around) changed.add(around);
          for (const added of record.addedNodes) {
            if (!(added instanceof Element)) continue;
            if (added.matches(LIVE)) changed.add(added);
            for (const live of added.querySelectorAll(LIVE)) changed.add(live);
          }
        }
        for (const live of changed) {
          const text = live.textContent.trim();
          if (live.isConnected && text !== '') told.push(text);
        }
      }).observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true
      });
    });
    const told = async () => {
      const seen = await page.evaluate((): unknown =>
        Reflect.get(window, 'motionTold')
      );
      return Array.isArray(seen)
        ? seen.filter((text) => String(text).includes(MOTION_OFF))
        : null;
    };

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
      expect(overlapOf(shown, await boxOf(control))).toBe(0);
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

for (const [width, height] of [
  [402, 681],
  [852, 340]
] as const) {
  test(`on a ${String(width)} by ${String(height)} screen, gear panned to where Motion access off shows moves clear of it when motion access is denied, staying in the map view`, async ({
    page
  }) => {
    const { map, compass, note } = await openMapDenied(page, width, height);
    const view = map.getByRole('region', { name: 'Map view' });
    const pot = map.getByRole('button', { name: /^Pot 1,/ });
    await compass.click();
    await expect(note).toBeVisible();
    const spot = await boxOf(note);
    await compass.click();
    await expect(note).toHaveCount(0);

    const from = centreOf(await boxOf(pot));
    const to = centreOf(spot);
    const grab = { x: (from.x + to.x) / 2 - 24, y: (from.y + to.y) / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + to.x - from.x, grab.y + to.y - from.y, {
      steps: 10
    });
    let last = centreOf(await boxOf(pot));
    await expect
      .poll(async () => {
        const now = centreOf(await boxOf(pot));
        const still = now.x === last.x && now.y === last.y;
        last = now;
        return still;
      })
      .toBe(true);
    await page.mouse.up();
    await expect
      .poll(
        async () => overlapOf(await boxOf(pot), spot),
        'Pot 1 is drawn where Motion access off shows'
      )
      .toBeGreaterThan(0);

    await compass.click();
    await expect(note).toBeVisible();
    await expect
      .poll(async () => overlapOf(await boxOf(pot), await boxOf(note)))
      .toBe(0);
    const shownIn = await boxOf(view);
    const potAt = await boxOf(pot);
    expect(potAt.x).toBeGreaterThanOrEqual(shownIn.x);
    expect(potAt.y).toBeGreaterThanOrEqual(shownIn.y);
    expect(potAt.x + potAt.width).toBeLessThanOrEqual(
      shownIn.x + shownIn.width
    );
    expect(potAt.y + potAt.height).toBeLessThanOrEqual(
      shownIn.y + shownIn.height
    );
  });
}
