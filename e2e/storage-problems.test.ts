import type { Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';
import { expectAccessibleInBothThemes } from './accessibility';
import { failStorage, injectStorageFaults } from './storage-faults';

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
