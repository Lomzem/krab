import type { Locator, Page } from '@playwright/test';
import { expect, holdStorage, releaseStorage, test, toastOf } from './fixtures';
import { expectAccessibleInBothThemes } from './accessibility';
import { deliverFix, holdFixes } from './held-geolocation';

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
    await expect(guidance).toContainText('Settings');
    const disclosure = guidance.getByRole('button', {
      name: 'How to turn on in Settings'
    });
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await disclosure.click();
    const hide = guidance.getByRole('button', { name: 'Hide steps' });
    await expect(hide).toHaveAttribute('aria-expanded', 'true');
    await expect(
      page.locator(`#${String(await hide.getAttribute('aria-controls'))}`)
    ).toContainText('Open Settings, then Privacy & Security');
    await expectAccessibleInBothThemes(page);
    await hide.click();
    await expect(disclosure).toHaveAttribute('aria-expanded', 'false');
    await expectAccessibleInBothThemes(page);

    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(
      'Pot 1 dropped without a position'
    );
    await expectAccessibleInBothThemes(page);

    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await expect(
      page.getByRole('main').getByRole('listitem').filter({ hasText: 'Pot 1' })
    ).toContainText('No position');
  });

  test('Settings steps shown on one tab are folded away on every other tab, and open again when asked, never asking for location by themselves', async ({
    page
  }) => {
    await page.addInitScript(countAsks);
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();
    const guidance = page.getByRole('region', { name: 'Location is off' });
    const show = guidance.getByRole('button', {
      name: 'How to turn on in Settings'
    });
    const hide = guidance.getByRole('button', { name: 'Hide steps' });
    const steps = page.getByText('Open Settings, then Privacy & Security');
    await expect(show).toBeVisible();
    const askedAtStart = await asks(page);

    for (const [from, ...away] of [
      ['Map', 'Gear'],
      ['Gear', 'Map'],
      ['Map', 'Past trips', 'Map']
    ] as const) {
      await expect(
        page.getByRole('button', { name: from, exact: true })
      ).toHaveAttribute('aria-current', 'page');
      await show.click();
      await expect(hide).toBeFocused();
      await expect(hide).toHaveAttribute('aria-expanded', 'true');
      await expect(steps).toBeVisible();

      for (const tab of away) {
        await page.getByRole('button', { name: tab, exact: true }).click();
      }
      const route = [from, ...away].join(' to ');
      await expect(show, `steps still open after ${route}`).toHaveAttribute(
        'aria-expanded',
        'false'
      );
      await expect(steps).toBeHidden();
      await expect(hide).toHaveCount(0);
    }
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(
      'Pot 1 dropped without a position'
    );
    expect(await asks(page), 'location asked for again').toBe(askedAtStart);
  });
});

test('while getting a position, Cancel and Save without position are reachable 44 px targets', async ({
  page
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = () => 1;
    navigator.geolocation.clearWatch = () => undefined;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();

  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(
    page.getByRole('heading', { name: 'Getting position' })
  ).toBeFocused();
  const cancel = page.getByRole('button', { name: 'Cancel' });
  const save = page.getByRole('button', { name: 'Save without position' });
  await expectTouchTarget(cancel);
  await expectTouchTarget(save);
  await expectAccessibleInBothThemes(page);

  await save.click();
  await expect(toastOf(page)).toContainText('dropped without a position');
  await expect(page.getByRole('button', { name: /^Drop / })).toBeFocused();
});

const START = new Date('2031-03-04T05:00:00Z');
const PAUSED = new Date('2031-03-04T06:00:00Z');
const MADE_UP_SEA = { latitude: -47.1, longitude: -128.6, accuracy: 5 };

const resume = () => {
  document.dispatchEvent(new Event('visibilitychange'));
};

const gettingPositionShown = async (page: Page) => {
  await page.clock.runFor(0);
  return page.getByRole('heading', { name: 'Getting position' }).count();
};

test('Position ready lasts 5 seconds from each fix, is rechecked on resume, then falls back to Finding your position and a drop waits', async ({
  page
}) => {
  await holdFixes(page);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();
  await page.clock.pauseAt(PAUSED);

  await deliverFix(page, MADE_UP_SEA, PAUSED);
  await expect(page.getByText('Position ready')).toBeVisible();

  await page.clock.runFor(5000);
  await page.evaluate(resume);
  await expect(page.getByText('Position ready')).toBeVisible();

  await page.clock.runFor(1);
  await expect(page.getByText('Finding your position')).toBeVisible();

  await deliverFix(page, MADE_UP_SEA, new Date('2031-03-04T06:00:05.001Z'));
  await expect(page.getByText('Position ready')).toBeVisible();

  await page.clock.setSystemTime(new Date('2031-03-04T06:01:00Z'));
  await page.evaluate(resume);
  await expect(page.getByText('Finding your position')).toBeVisible();

  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect.poll(() => gettingPositionShown(page)).toBe(1);
});

test('once a fix arrives, Cancel and Save without position give way to saving feedback at once, until the drop is saved', async ({
  page
}) => {
  await holdFixes(page);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();
  await page.clock.pauseAt(PAUSED);
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(
    page.getByRole('heading', { name: 'Getting position' })
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

test('a drop with a fresh fix shows saving feedback only once saving has taken half a second, a quick save leaves focus where it is, and End trip and the map stay in place but End trip waits while it saves', async ({
  page
}) => {
  await holdFixes(page);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();
  await page.clock.pauseAt(PAUSED);
  await deliverFix(page, MADE_UP_SEA, PAUSED);
  await expect(page.getByText('Position ready')).toBeVisible();
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
  const placed = async () => ({
    endTrip: await endTrip.boundingBox(),
    mapTop: (await mapView.boundingBox())?.y
  });
  const before = await placed();
  expect(before.endTrip).not.toBeNull();
  await dropPot.focus();
  await holdStorage(page);
  await page.keyboard.press('Enter');
  await page.clock.runFor(499);
  await expect(saving).toHaveCount(0);
  await expect(dropPot).toBeFocused();
  await expect(endTrip).toHaveAttribute('aria-disabled', 'true');
  expect(await placed()).toEqual(before);
  await page.clock.runFor(1);
  await expect(saving).toBeFocused();
  await expect(dropPot).toHaveCount(0);
  await expect(toastOf(page)).not.toContainText('Pot 3');
  expect(await placed()).toEqual(before);
  await endTrip.click({ force: true });
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await releaseStorage(page);
  await expect(toastOf(page)).toContainText('Pot 3 dropped');
  await expect(dropPot).toBeFocused();
  await expect(endTrip).not.toHaveAttribute('aria-disabled', 'true');
  expect(await placed()).toEqual(before);
  await gearTab.click();
  await expect(
    page.getByRole('main').getByRole('listitem').filter({ hasText: 'Pot' })
  ).toHaveCount(3);
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
  await expect(page.getByText('Position ready')).toBeVisible();
  expect(await watches(page)).toEqual({ active: 1, most: 1 });

  await setHidden(page, true);
  expect(await watches(page)).toEqual({ active: 0, most: 1 });
  await setHidden(page, true);
  expect(await watches(page)).toEqual({ active: 0, most: 1 });

  await setHidden(page, false);
  expect(await watches(page)).toEqual({ active: 1, most: 1 });
  await setHidden(page, false);
  expect(await watches(page)).toEqual({ active: 1, most: 1 });
  await expect(page.getByText('Position ready')).toBeVisible();
});
