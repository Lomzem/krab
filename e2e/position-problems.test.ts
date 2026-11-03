import type { Locator, Page } from '@playwright/test';
import { expect, holdStorage, releaseStorage, test, toastOf } from './fixtures';
import { expectAccessibleInBothThemes } from './accessibility';

const MIN_TARGET_PX = 44;

const expectTouchTarget = async (target: Locator) => {
  const box = await target.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(box?.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
};

test.describe('with location denied', () => {
  test.use({ permissions: [] });

  test('a drop is saved without a position and Settings guidance shows', async ({
    page
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();

    const guidance = page.getByRole('region', { name: 'Location is off' });
    await expect(guidance).toContainText('Settings');
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

type HeldFix = { deliverFix?: PositionCallback };

const holdFixes = () => {
  const held = window as HeldFix;
  navigator.geolocation.watchPosition = (success) => {
    held.deliverFix = success;
    return 1;
  };
  navigator.geolocation.clearWatch = () => undefined;
};

const deliverFix = ({
  coords,
  timestamp
}: {
  coords: typeof MADE_UP_SEA;
  timestamp: number;
}) => {
  (window as HeldFix).deliverFix?.({
    coords,
    timestamp
  } as GeolocationPosition);
};

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
  await page.addInitScript(holdFixes);
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();
  await page.clock.pauseAt(PAUSED);

  await page.evaluate(deliverFix, {
    coords: MADE_UP_SEA,
    timestamp: PAUSED.getTime()
  });
  await expect(page.getByText('Position ready')).toBeVisible();

  await page.clock.runFor(5000);
  await page.evaluate(resume);
  await expect(page.getByText('Position ready')).toBeVisible();

  await page.clock.runFor(1);
  await expect(page.getByText('Finding your position')).toBeVisible();

  await page.evaluate(deliverFix, {
    coords: MADE_UP_SEA,
    timestamp: Date.parse('2031-03-04T06:00:05.001Z')
  });
  await expect(page.getByText('Position ready')).toBeVisible();

  await page.clock.setSystemTime(new Date('2031-03-04T06:01:00Z'));
  await page.evaluate(resume);
  await expect(page.getByText('Finding your position')).toBeVisible();

  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect.poll(() => gettingPositionShown(page)).toBe(1);
});

test('once a fix arrives, Cancel and Save without position give way to saving feedback until the drop is saved', async ({
  page
}) => {
  await page.addInitScript(holdFixes);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(
    page.getByRole('heading', { name: 'Getting position' })
  ).toBeFocused();

  await holdStorage(page);
  const fixTime = await page.evaluate(() => Date.now());
  await page.evaluate(deliverFix, { coords: MADE_UP_SEA, timestamp: fixTime });

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
