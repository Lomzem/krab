import type { Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';
import { expectAccessibleInBothThemes } from './accessibility';
import { MADE_UP_SEA } from '../playwright.config';
import { deliverFix, holdFixes } from './held-geolocation';
import {
  failStorage,
  holdFirstOpen,
  holdNextRead,
  injectStorageFaults,
  releaseFirstOpen,
  releaseHeldRead
} from './storage-faults';

const MORNING = new Date('2031-06-10T07:30:00-04:00');
const TRIP_LOAD_FAILED = "Couldn't load your trip.";
const PAST_LOAD_FAILED = "Couldn't load past trips.";
const NO_TRIP = 'No trip running';

test.use({ timezoneId: 'America/New_York' });

const tab = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

const inWaterRow = (page: Page, name: string) =>
  page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: name })
    .filter({ hasText: 'in the water' });

const dropPot = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText(`${name} dropped`);
};

const startWithLocation = async (page: Page) => {
  await injectStorageFaults(page);
  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
};

const endTheTrip = async (page: Page) => {
  const sheet = page.getByRole('dialog');
  await page.getByRole('button', { name: 'End trip' }).click();
  await sheet.getByRole('button', { name: 'End trip' }).click();
  await expect(sheet).toBeHidden();
};

test('a trip whose stored records fail to read shows that it could not load, not an empty trip, and Retry loads the running trip and past trips', async ({
  page
}) => {
  const main = page.getByRole('main');
  const pastTrip = main.getByRole('button', {
    name: 'Tuesday, June 10, 2031 1 drop, 1 uncollected',
    exact: true
  });

  await startWithLocation(page);
  await dropPot(page, 'Pot 1');
  await endTheTrip(page);
  await dropPot(page, 'Pot 1');

  await failStorage(page, 'reads');
  await page.reload();
  await expect(main).toContainText(TRIP_LOAD_FAILED);
  await expect(main).not.toContainText(NO_TRIP);
  await expect(page.getByRole('button', { name: 'Drop pot' })).toBeVisible();
  await expectAccessibleInBothThemes(page);
  await tab(page, 'Gear').click();
  await expect(main).toContainText(TRIP_LOAD_FAILED);
  await expect(main).not.toContainText(NO_TRIP);
  await tab(page, 'Past trips').click();
  await expect(main).toContainText(PAST_LOAD_FAILED);
  await expect(main).not.toContainText('No past trips yet.');

  await tab(page, 'Gear').click();
  await failStorage(page, null);
  await main.getByRole('button', { name: 'Retry' }).click();
  await expect(inWaterRow(page, 'Pot 1')).toBeVisible();
  await expect(main).not.toContainText(TRIP_LOAD_FAILED);
  await tab(page, 'Past trips').click();
  await expect(pastTrip).toBeVisible();
  await expect(main).not.toContainText(PAST_LOAD_FAILED);
});

test('storage that fails to open says the trip could not load, Retry opens it again, and a drop while it could not load opens it and shows the whole trip', async ({
  page
}) => {
  const main = page.getByRole('main');

  await startWithLocation(page);
  await dropPot(page, 'Pot 1');

  await failStorage(page, 'open');
  await page.reload();
  await tab(page, 'Gear').click();
  await expect(main).toContainText(TRIP_LOAD_FAILED);
  await expect(main).not.toContainText(NO_TRIP);
  await failStorage(page, null);
  await main.getByRole('button', { name: 'Retry' }).click();
  await expect(inWaterRow(page, 'Pot 1')).toBeVisible();

  await failStorage(page, 'open');
  await page.reload();
  await tab(page, 'Gear').click();
  await expect(main).toContainText(TRIP_LOAD_FAILED);
  await failStorage(page, null);
  await expect(page.getByText('Position ready')).toBeVisible();
  await dropPot(page, 'Pot 2');
  await expect(inWaterRow(page, 'Pot 1')).toBeVisible();
  await expect(inWaterRow(page, 'Pot 2')).toBeVisible();
  await expect(main).not.toContainText(TRIP_LOAD_FAILED);
});

test('a double tap while storage is still opening makes one drop attempt, and its Cancel saves nothing', async ({
  page
}) => {
  const main = page.getByRole('main');

  await holdFixes(page);
  await holdFirstOpen(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();
  await page
    .getByRole('button', { name: 'Drop pot' })
    .evaluate((button: HTMLElement) => {
      button.click();
      button.click();
    });
  await expect(
    page.getByRole('heading', { name: 'Getting position' })
  ).toBeFocused();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(toastOf(page)).toContainText(
    'Drop cancelled. Nothing was saved.'
  );
  await releaseFirstOpen(page);

  await deliverFix(page, MADE_UP_SEA);
  await expect(page.getByText('Position ready')).toBeVisible();
  await dropPot(page, 'Pot 1');
  await tab(page, 'Gear').click();
  await expect(main).toContainText('1 in the water');
  await expect(inWaterRow(page, 'Pot 1')).toHaveCount(1);
});

test('a drop tapped while storage is still opening keeps the tap time and the fix at the tap', async ({
  page
}) => {
  const pot = inWaterRow(page, 'Pot 1');

  await holdFixes(page);
  await holdFirstOpen(page);
  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await deliverFix(page, MADE_UP_SEA);
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();

  await page.clock.fastForward('10:00');
  await deliverFix(page, {
    latitude: MADE_UP_SEA.latitude + 0.01,
    longitude: MADE_UP_SEA.longitude
  });
  await releaseFirstOpen(page);
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.clock.fastForward(15_000);
  await tab(page, 'Gear').click();
  await expect(pot).toContainText('10 min');
  await expect(pot).toContainText('0.7 mi');
});

test('a drop saved while an older reload is still reading stays on the Gear list after that reload finishes', async ({
  page,
  context
}) => {
  const sheet = page.getByRole('dialog');
  const inWater = page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: 'in the water' });

  await startWithLocation(page);
  await dropPot(page, 'Pot 1');
  await dropPot(page, 'Pot 2');
  await tab(page, 'Gear').click();
  await expect(inWater).toHaveCount(2);

  const other = await context.newPage();
  await other.goto('/');
  await tab(other, 'Gear').click();
  await inWaterRow(other, 'Pot 1').click();
  await other
    .getByRole('dialog')
    .getByRole('button', { name: 'Delete drop' })
    .dblclick();
  await expect(toastOf(other)).toContainText('Pot 1 deleted');
  await other.close();

  await inWaterRow(page, 'Pot 1').click();
  await holdNextRead(page);
  await sheet.getByRole('button', { name: 'Delete drop' }).dblclick();
  await expect(sheet).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 3 dropped');
  await expect(inWaterRow(page, 'Pot 3')).toHaveCount(1);

  await releaseHeldRead(page);
  await expect(inWaterRow(page, 'Pot 3')).toHaveCount(1);
  await expect(inWaterRow(page, 'Pot 2')).toHaveCount(1);
  await expect(inWater).toHaveCount(2);
});
