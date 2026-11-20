import type { Locator, Page } from '@playwright/test';
import { expect, holdStorage, releaseStorage, test, toastOf } from './fixtures';
import { expectAccessibleInBothThemes } from './accessibility';
import { deliverFix, denyLocation, holdFixes } from './held-geolocation';

const MIN_TARGET_PX = 44;

const expectTouchTarget = async (target: Locator) => {
  const box = await target.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(box?.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
};

type AskingWindow = { asks?: number };

function countAsks() {
  const asking = window as AskingWindow;
  asking.asks = 0;
  const geolocation = navigator.geolocation;
  const watch = geolocation.watchPosition.bind(geolocation);
  geolocation.watchPosition = (success, error, options) => {
    asking.asks = (asking.asks ?? 0) + 1;
    return watch(success, error, options);
  };
}

const asks = (page: Page) => page.evaluate(() => (window as AskingWindow).asks);

test.describe('with location denied', () => {
  test.use({ permissions: [] });

  test('a drop is saved without a position and Settings guidance shows', async ({
    page
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();

    const guidance = page.getByRole('region', { name: 'Location is off' });
    const show = guidance.getByRole('button', { name: 'Show steps' });
    await show.click();
    const steps = page.getByRole('dialog', { name: 'Turn on location' });
    await expect(steps).toContainText(
      'Settings › Privacy & Security › Location Services'
    );
    await expectAccessibleInBothThemes(page);
    await steps.getByRole('button', { name: 'Close' }).click();
    await expect(steps).toBeHidden();
    await expect(show).toBeFocused();
    await expectAccessibleInBothThemes(page);

    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText('Pot 1 dropped, no position');
    await expectAccessibleInBothThemes(page);

    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await expect(
      page.getByRole('main').getByRole('listitem').filter({ hasText: 'Pot 1' })
    ).toContainText('No position');
  });

  test('Settings steps open from Map and Gear, return focus to Show steps on close, and never ask for location by themselves', async ({
    page
  }) => {
    await page.addInitScript(countAsks);
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();
    const show = page
      .getByRole('region', { name: 'Location is off' })
      .getByRole('button', { name: 'Show steps' });
    const steps = page.getByRole('dialog', { name: 'Turn on location' });
    await expect(show).toBeVisible();
    const askedAtStart = await asks(page);

    for (const screen of ['Map', 'Gear', 'Map'] as const) {
      await page.getByRole('button', { name: screen, exact: true }).click();
      await show.click();
      await expect(steps).toContainText('Reopen Krab');
      await page.keyboard.press('Escape');
      await expect(steps, `steps closed on ${screen}`).toBeHidden();
      await expect(show).toBeFocused();
    }
    await page
      .getByRole('button', { name: 'Drop pot without position' })
      .click();
    await expect(toastOf(page)).toContainText('Pot 1 dropped, no position');
    expect(await asks(page), 'location asked for again').toBe(askedAtStart);
  });
});

test('while getting a position, Cancel and Save without position are reachable 44 px targets and the row above stops repeating Finding position', async ({
  page
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = () => 1;
    navigator.geolocation.clearWatch = () => undefined;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeVisible();

  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(
    page.getByRole('heading', { name: 'Finding drop position' })
  ).toBeFocused();
  await expect(page.getByText('Finding position')).toBeHidden();
  const cancel = page.getByRole('button', { name: 'Cancel' });
  const save = page.getByRole('button', { name: 'Save without position' });
  await expectTouchTarget(cancel);
  await expectTouchTarget(save);
  await expectAccessibleInBothThemes(page);

  await save.click();
  await expect(toastOf(page)).toContainText('dropped, no position');
  await expect(page.getByRole('button', { name: /^Drop / })).toBeFocused();
});

const START = new Date('2031-03-04T05:00:00Z');
const PAUSED = new Date('2031-03-04T06:00:00Z');
const MADE_UP_SEA = { latitude: -47.1, longitude: -128.6, accuracy: 5 };

const resume = () => {
  document.dispatchEvent(new Event('visibilitychange'));
};

const findingDropPositionShown = async (page: Page) => {
  await page.clock.runFor(0);
  return page.getByRole('heading', { name: 'Finding drop position' }).count();
};

test('Finding position returns just after 5 seconds or on resume with a stale fix, and a drop waits', async ({
  page
}) => {
  const finding = page.getByText('Finding position');
  await holdFixes(page);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(finding).toBeVisible();
  await page.clock.pauseAt(PAUSED);

  await deliverFix(page, MADE_UP_SEA, PAUSED);
  await expect(finding).toBeHidden();

  await page.clock.runFor(5000);
  await page.evaluate(resume);
  await expect(finding).toBeHidden();

  await page.clock.runFor(1);
  await expect(finding).toBeVisible();

  await deliverFix(page, MADE_UP_SEA, new Date('2031-03-04T06:00:05.001Z'));
  await expect(finding).toBeHidden();

  await page.clock.setSystemTime(new Date('2031-03-04T06:01:00Z'));
  await page.evaluate(resume);
  await expect(finding).toBeVisible();

  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect.poll(() => findingDropPositionShown(page)).toBe(1);
});

test('a stale fix shows as Last position with no distances, and Centre on my position waits for a fresh fix', async ({
  page
}) => {
  const map = page.getByRole('region', { name: 'Map' });
  const current = map.getByRole('img', { name: /^Current position/ });
  const last = map.getByRole('img', { name: 'Last position' });
  const nearest = page.getByRole('button', { name: /^Nearest gear: / });
  const centre = map.getByRole('button', { name: 'Centre on my position' });
  const away = { ...MADE_UP_SEA, latitude: MADE_UP_SEA.latitude + 0.001 };
  await holdFixes(page);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await page.clock.pauseAt(PAUSED);
  await expect(centre).toHaveAttribute('aria-disabled', 'true');

  await deliverFix(page, MADE_UP_SEA, PAUSED);
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.clock.runFor(8001);
  await expect(toastOf(page)).toBeHidden();
  const later = new Date(PAUSED.getTime() + 8001);
  await deliverFix(page, away, later);
  await expect(current).toBeVisible();
  await expect(nearest).toBeVisible();
  await expect(centre).not.toHaveAttribute('aria-disabled');
  const view = map.getByRole('region', { name: 'Map view' });
  const viewBox = await view.boundingBox();

  await page.clock.runFor(5001);
  await expect(last).toBeVisible();
  expect(await view.boundingBox()).toEqual(viewBox);
  await expect(current).toHaveCount(0);
  await expect(nearest).toHaveCount(0);
  await expect(centre).toHaveAttribute('aria-disabled', 'true');
  await expect(centre).toBeVisible();

  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  const row = page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ hasText: 'Pot 1' });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText('ft');
  await expect(row).not.toContainText('Waiting for location');

  await deliverFix(page, away, new Date(later.getTime() + 5001));
  await expect(row).toContainText('ft');
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await expect(current).toBeVisible();
  await expect(last).toHaveCount(0);
  await expect(centre).not.toHaveAttribute('aria-disabled');
});

for (const width of [320, 393]) {
  test(`at ${String(width)} px wide, location turned off after a fix hides my position, and Drop says it saves without one in the same box`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 700 });
    await holdFixes(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();
    await deliverFix(page, MADE_UP_SEA);
    const map = page.getByRole('region', { name: 'Map' });
    await expect(
      map.getByRole('img', { name: /^Current position/ })
    ).toBeVisible();
    const ready = page.getByRole('button', { name: 'Drop pot', exact: true });
    const readyBox = await ready.boundingBox();

    await denyLocation(page);
    const denied = page.getByRole('button', {
      name: 'Drop pot without position'
    });
    await expect(denied).toBeVisible();
    await expect(ready).toHaveCount(0);
    expect(await denied.boundingBox()).toEqual(readyBox);
    await expect(map.getByRole('img', { name: /position/ })).toHaveCount(0);
    await expect(
      map.getByRole('button', { name: 'Centre on my position' })
    ).toHaveAttribute('aria-disabled', 'true');

    await denied.click();
    await expect(toastOf(page)).toContainText('Pot 1 dropped, no position');
  });
}

test('a drop with no fix within 5 seconds saves without a position by itself, and a later fix never moves it', async ({
  page
}) => {
  await holdFixes(page);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeVisible();
  await page.clock.pauseAt(PAUSED);
  const dropPot = page.getByRole('button', { name: 'Drop pot' });
  const waiting = page.getByRole('heading', { name: 'Finding drop position' });

  await dropPot.click();
  await expect(waiting).toBeFocused();
  await page.clock.runFor(4999);
  await expect(waiting).toBeVisible();
  await expect(toastOf(page)).toBeHidden();

  await page.clock.runFor(1);
  await expect(toastOf(page)).toContainText('Pot 1 dropped, no position');
  await expect(waiting).toHaveCount(0);
  await expect(dropPot).toBeFocused();

  await deliverFix(page, MADE_UP_SEA, new Date('2031-03-04T06:00:05.500Z'));
  await expect(page.getByText('Finding position')).toBeHidden();
  await dropPot.click();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  await expect(toastOf(page)).not.toContainText('no position');

  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  const row = (name: string) =>
    page.getByRole('main').getByRole('listitem').filter({ hasText: name });
  await expect(row('Pot 1')).toContainText('No position');
  await expect(row('Pot 2')).not.toContainText('No position');
});

test('a fix taken just inside 5 seconds after the tap places the drop', async ({
  page
}) => {
  await holdFixes(page);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeVisible();
  await page.clock.pauseAt(PAUSED);

  await page.getByRole('button', { name: 'Drop pot' }).click();
  await page.clock.runFor(4999);
  await deliverFix(page, MADE_UP_SEA, new Date('2031-03-04T06:00:04.999Z'));

  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await expect(toastOf(page)).not.toContainText('no position');
});

test('once a fix arrives, Cancel and Save without position give way to saving feedback at once, until the drop is saved', async ({
  page
}) => {
  await holdFixes(page);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeVisible();
  await page.clock.pauseAt(PAUSED);
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(
    page.getByRole('heading', { name: 'Finding drop position' })
  ).toBeFocused();

  await holdStorage(page);
  await deliverFix(page, MADE_UP_SEA, PAUSED);

  await expect(
    page.getByRole('heading', { name: 'Saving drop' })
  ).toBeFocused();
  await expect(page.getByRole('button', { name: 'Cancel' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Save without position' })
  ).toHaveCount(0);
  await expect(toastOf(page)).toBeHidden();

  await releaseStorage(page);
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await expect(page.getByRole('button', { name: 'Drop pot' })).toBeFocused();
});

test('a drop with a fresh fix shows saving feedback only once saving has taken half a second, a quick save leaves focus where it is, the map stays in place, and End trip on Gear waits while it saves', async ({
  page
}) => {
  await holdFixes(page);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeVisible();
  await page.clock.pauseAt(PAUSED);
  await deliverFix(page, MADE_UP_SEA, PAUSED);
  await expect(page.getByText('Finding position')).toBeHidden();
  const dropPot = page.getByRole('button', { name: 'Drop pot' });
  const saving = page.getByRole('heading', { name: 'Saving drop' });

  await holdStorage(page);
  await dropPot.focus();
  await page.keyboard.press('Enter');
  await page.clock.runFor(499);
  await expect(saving).toHaveCount(0);
  await releaseStorage(page);
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.clock.runFor(1000);
  await expect(saving).toHaveCount(0);
  await expect(dropPot).toBeFocused();

  const gearTab = page.getByRole('button', { name: 'Gear', exact: true });
  await holdStorage(page);
  await page.keyboard.press('Enter');
  await gearTab.focus();
  await releaseStorage(page);
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  await page.clock.runFor(1000);
  await expect(gearTab).toBeFocused();

  const endTrip = page.getByRole('button', { name: 'End trip' });
  const mapView = page.getByRole('region', { name: 'Map view' });
  const placed = () => mapView.boundingBox();
  const before = await placed();
  expect(before).not.toBeNull();
  await page.getByRole('button', { name: 'Map', exact: true }).click();
  await dropPot.focus();
  await holdStorage(page);
  await page.keyboard.press('Enter');
  await page.clock.runFor(499);
  await expect(saving).toHaveCount(0);
  await expect(dropPot).toBeFocused();
  expect(await placed()).toEqual(before);
  await page.clock.runFor(1);
  await expect(saving).toBeFocused();
  await expect(dropPot).toHaveCount(0);
  await expect(toastOf(page)).not.toContainText('Pot 3');
  expect(await placed()).toEqual(before);
  await releaseStorage(page);
  await expect(toastOf(page)).toContainText('Pot 3 dropped');
  await expect(dropPot).toBeFocused();
  expect(await placed()).toEqual(before);

  await holdStorage(page);
  await dropPot.click();
  await gearTab.click();
  await expect(endTrip).toHaveAttribute('aria-disabled', 'true');
  await endTrip.click({ force: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await releaseStorage(page);
  await expect(toastOf(page)).toContainText('Pot 4 dropped');
  await expect(endTrip).not.toHaveAttribute('aria-disabled', 'true');
  await expect(
    page.getByRole('main').getByRole('listitem').filter({ hasText: 'Pot' })
  ).toHaveCount(4);
});

type Watching = { hidden: boolean; active: number[]; most: number };
type WatchingWindow = { watching?: Watching };

const countWatches = () => {
  const watching: Watching = { hidden: false, active: [], most: 0 };
  (window as WatchingWindow).watching = watching;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (watching.hidden ? 'hidden' : 'visible')
  });
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => watching.hidden
  });
  const geolocation = navigator.geolocation;
  const watch = geolocation.watchPosition.bind(geolocation);
  const clear = geolocation.clearWatch.bind(geolocation);
  geolocation.watchPosition = (success, error, options) => {
    const id = watch(success, error, options);
    watching.active = [...watching.active, id];
    watching.most = Math.max(watching.most, watching.active.length);
    return id;
  };
  geolocation.clearWatch = (id) => {
    watching.active = watching.active.filter((other) => other !== id);
    clear(id);
  };
};

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((next) => {
    const { watching } = window as WatchingWindow;
    if (watching) watching.hidden = next;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

const watches = (page: Page) =>
  page.evaluate(() => {
    const { watching } = window as WatchingWindow;
    return { active: watching?.active.length, most: watching?.most };
  });

test('the position watch stops while Krab is hidden and resumes as one watch when it is shown again', async ({
  page
}) => {
  await page.addInitScript(countWatches);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  expect(await watches(page)).toEqual({ active: 1, most: 1 });

  await setHidden(page, true);
  expect(await watches(page)).toEqual({ active: 0, most: 1 });
  await setHidden(page, true);
  expect(await watches(page)).toEqual({ active: 0, most: 1 });

  await setHidden(page, false);
  expect(await watches(page)).toEqual({ active: 1, most: 1 });
  await setHidden(page, false);
  expect(await watches(page)).toEqual({ active: 1, most: 1 });
  await expect(page.getByText('Finding position')).toBeHidden();
});
