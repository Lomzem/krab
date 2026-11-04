import type { Locator, Page } from '@playwright/test';
import { expect, holdStorage, releaseStorage, test, toastOf } from './fixtures';
import { MADE_UP_SEA } from '../playwright.config';
import { expectAccessibleInBothThemes } from './accessibility';
import { deliverFix, holdFixes } from './held-geolocation';
import { failStorage, injectStorageFaults } from './storage-faults';

const MORNING = new Date('2031-06-10T07:30:00-04:00');
const LATE_EVENING = new Date('2031-06-10T23:40:00-04:00');
const TRIP_DATE = 'Tuesday, June 10, 2031';
const TWO_DAYS = 'Tuesday, June 10 to Wednesday, June 11, 2031';

test.use({ timezoneId: 'America/New_York' });

const tab = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

const dropOf = async (page: Page, kind: 'Pot' | 'Net', name: string) => {
  await page
    .getByRole('group', { name: 'Gear to drop' })
    .getByText(kind, { exact: true })
    .click();
  await page
    .getByRole('button', { name: `Drop ${kind.toLowerCase()}` })
    .click();
  await expect(toastOf(page)).toContainText(`${name} dropped`);
};

const dropPotAt = async (page: Page, north: number, name: string) => {
  await deliverFix(page, {
    latitude: MADE_UP_SEA.latitude + north,
    longitude: MADE_UP_SEA.longitude
  });
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText(`${name} dropped`);
};

const endTheTrip = async (page: Page, outcome: string) => {
  const sheet = page.getByRole('dialog');
  await page.getByRole('button', { name: 'End trip' }).click();
  await expect(
    sheet.getByRole('heading', { name: 'End this trip?' })
  ).toBeVisible();
  await expect(sheet).toContainText(outcome);
  await sheet.getByRole('button', { name: 'End trip' }).click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText(
    'Trip ended. It is under Past trips.'
  );
};

test('collect Pot 1 with its catch, end the trip with Net 1 still in, find both on the past trip, its map and the main map, and see a catch saved there in its list', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const main = page.getByRole('main');
  const mapArea = page.getByRole('region', { name: 'Map', exact: true });

  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await dropOf(page, 'Pot', 'Pot 1');
  await dropOf(page, 'Net', 'Net 1');

  await tab(page, 'Gear').click();
  await main.getByRole('button').filter({ hasText: 'Pot 1' }).click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();

  await tab(page, 'Map').click();
  const endButton = mapArea.getByRole('button', { name: 'End trip' });
  await endButton.click();
  await expect(sheet).toContainText(
    "1 drop is still in the water. It'll be saved as uncollected."
  );
  await sheet.getByRole('button', { name: 'Keep fishing' }).click();
  await expect(sheet).toBeHidden();
  await expect(endButton).toBeFocused();

  await endTheTrip(
    page,
    "1 drop is still in the water. It'll be saved as uncollected."
  );
  await expect(page.getByRole('button', { name: 'Drop net' })).toBeFocused();
  await expect(endButton).toHaveCount(0);
  await expect(mapArea).toContainText('No trip running');

  const pastLayer = sheet
    .getByRole('group', { name: 'Also show' })
    .getByRole('checkbox', { name: 'Past trips' });
  const pastPin = mapArea.getByRole('button', {
    name: `Pot 1, past trip, ${TRIP_DATE}, 2 kept, 0 released`
  });
  const pastPins = [
    pastPin,
    mapArea.getByRole('button', {
      name: `Net 1, past trip, ${TRIP_DATE}, Uncollected`
    })
  ];
  const showPastLayer = async (on: boolean) => {
    await mapArea.getByRole('button', { name: /^Filter/ }).click();
    await pastLayer.setChecked(on);
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    for (const pin of pastPins) {
      await expect(pin).toHaveCount(on ? 1 : 0);
    }
  };
  await expect(
    mapArea.getByRole('img', { name: /^Your position/ })
  ).toBeVisible();
  for (const pin of pastPins) await expect(pin).toHaveCount(0);
  await mapArea.getByRole('button', { name: /^Filter/ }).click();
  await expect(pastLayer).not.toBeChecked();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await showPastLayer(true);
  await showPastLayer(false);
  await showPastLayer(true);
  for (const pin of pastPins) await expect(pin).toBeVisible();
  await expect(pastPin.locator('span').first()).toHaveCSS(
    'border-top-style',
    'dotted'
  );

  await tab(page, 'Past trips').click();
  const pastTrip = main.getByRole('button', { name: new RegExp(TRIP_DATE) });
  await expect(pastTrip).toHaveAccessibleName(
    `${TRIP_DATE} 2 drops, 1 uncollected`
  );
  await expectAccessibleInBothThemes(page);
  await pastTrip.click();

  const detail = page.getByRole('region', { name: TRIP_DATE });
  await expect(
    detail.getByRole('heading', { level: 1, name: TRIP_DATE })
  ).toBeFocused();
  const pot1 = detail.getByRole('button', {
    name: 'Pot 1 2 kept, 0 released',
    exact: true
  });
  const net1 = detail.getByRole('button', {
    name: 'Net 1 Uncollected',
    exact: true
  });
  await expect(pot1).toBeVisible();
  await expect(net1).toBeVisible();
  await expect(
    detail.getByRole('button', { name: 'Pot 1, 2 kept, 0 released' })
  ).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await net1.click();
  await expect(sheet).toContainText('Uncollected.');
  await expect(
    sheet.getByRole('button', { name: 'Collect', exact: true })
  ).toHaveCount(0);
  await expect(sheet.getByRole('heading', { name: 'Catch' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(net1).toBeFocused();

  await pot1.click();
  await expect(
    sheet.getByRole('group', { name: 'Kept' }).getByRole('status')
  ).toContainText('Kept: 2');
  await expect(sheet.getByRole('button', { name: /again here/ })).toHaveCount(
    0
  );
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  const savedPot1 = detail.getByRole('button', {
    name: 'Pot 1 3 kept, 0 released',
    exact: true
  });
  await expect(savedPot1).toBeVisible();
  await expect(pot1).toHaveCount(0);

  await savedPot1.click();
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    detail.getByRole('button', { name: 'Pot 1, 3 kept, 0 released' })
  ).toBeFocused();

  await detail.getByRole('button', { name: 'All past trips' }).click();
  await expect(pastTrip).toBeFocused();
});

test('a past trip over two days opens on All, and Last day and Earlier days narrow its rows and pins together; deleting its only remaining drop removes the trip until Undo brings it back, and Delete trip asks first, stays open while removing, and then removes it for good', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const main = page.getByRole('main');
  const listHeading = main.getByRole('heading', {
    level: 1,
    name: 'Past trips'
  });
  const detail = page.getByRole('region', { name: TWO_DAYS });
  const days = detail.getByRole('group', { name: 'Days on this trip' });
  const named = (name: string) =>
    detail.getByRole('button', { name, exact: true });
  const pot1 = [named('Pot 1 Uncollected'), named('Pot 1, Day 1, Uncollected')];
  const pot2 = [named('Pot 2 Uncollected'), named('Pot 2, Day 2, Uncollected')];
  const expectShown = async (shown: Locator[], hidden: Locator[]) => {
    for (const target of shown) await expect(target).toBeVisible();
    for (const target of hidden) await expect(target).toHaveCount(0);
  };

  await holdFixes(page);
  await page.clock.install({ time: LATE_EVENING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await dropPotAt(page, 0, 'Pot 1');
  await page.clock.fastForward('30:00');
  await dropPotAt(page, 0.0005, 'Pot 2');
  await endTheTrip(
    page,
    "2 drops are still in the water. They'll be saved as uncollected."
  );

  await tab(page, 'Past trips').click();
  await main
    .getByRole('button', {
      name: `${TWO_DAYS} 2 drops, 2 uncollected`,
      exact: true
    })
    .click();
  await expect(days.getByRole('radio', { name: 'All' })).toBeChecked();
  await expectShown([...pot1, ...pot2], []);
  await days.getByRole('radio', { name: 'Last day' }).check();
  await expectShown(pot2, pot1);
  await days.getByRole('radio', { name: 'Earlier days' }).check();
  await expectShown(pot1, pot2);
  await days.getByRole('radio', { name: 'All' }).check();
  await expectShown([...pot1, ...pot2], []);

  await named('Pot 2 Uncollected').click();
  await sheet.getByRole('button', { name: 'Delete drop' }).click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Pot 2 deleted');
  const pastTrip = main.getByRole('button', { name: new RegExp(TRIP_DATE) });
  await expect(
    main.getByRole('heading', { level: 1, name: TRIP_DATE })
  ).toBeVisible();
  await main
    .getByRole('button', { name: 'Pot 1 Uncollected', exact: true })
    .click();
  await sheet.getByRole('button', { name: 'Delete drop' }).click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Pot 1 deleted');
  await expect(main).toContainText('No past trips yet.');
  await expect(listHeading).toBeFocused();

  await toastOf(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 restored');
  await expect(pastTrip).toHaveAccessibleName(
    `${TRIP_DATE} 1 drop, 1 uncollected`
  );
  await expect(listHeading).toBeFocused();

  await pastTrip.click();
  const deleteTrip = main.getByRole('button', { name: 'Delete trip' });
  await deleteTrip.click();
  await expect(
    sheet.getByRole('heading', { name: 'Delete this trip?' })
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'Keep it' }).click();
  await expect(sheet).toBeHidden();
  await expect(deleteTrip).toBeFocused();

  await deleteTrip.click();
  await holdStorage(page);
  await sheet.getByRole('button', { name: 'Delete trip' }).click();
  for (const leave of [
    () => sheet.getByRole('button', { name: 'Keep it' }).click({ force: true }),
    () => page.keyboard.press('Escape')
  ]) {
    await leave();
    await expect(
      sheet.getByRole('heading', { name: 'Delete this trip?' })
    ).toBeVisible();
  }
  await expect(toastOf(page)).not.toContainText('Trip deleted');

  await releaseStorage(page);
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Trip deleted');
  await expect(main).toContainText('No past trips yet.');
  await expect(listHeading).toBeFocused();

  await page.reload();
  await tab(page, 'Past trips').click();
  await expect(main).toContainText('No past trips yet.');
});

test('past trips show what was just written even while storage reads fail, and history that fails to load offers Retry instead of reading as empty', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const main = page.getByRole('main');
  const pastTrip = main.getByRole('button', {
    name: `${TRIP_DATE} 1 drop, 1 uncollected`,
    exact: true
  });

  await injectStorageFaults(page);
  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await dropOf(page, 'Pot', 'Pot 1');

  await failStorage(page, 'reads');
  await endTheTrip(
    page,
    "1 drop is still in the water. It'll be saved as uncollected."
  );
  await tab(page, 'Past trips').click();
  await expect(pastTrip).toBeVisible();
  await pastTrip.click();
  await main
    .getByRole('button', { name: 'Pot 1 Uncollected', exact: true })
    .click();
  await sheet.getByRole('button', { name: 'Delete drop' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 deleted');
  await expect(main).toContainText('No past trips yet.');
  await toastOf(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 restored');
  await expect(pastTrip).toBeVisible();

  await page.reload();
  await tab(page, 'Past trips').click();
  await expect(main).toContainText("Couldn't load past trips.");
  await expect(main).not.toContainText('No past trips yet.');
  await expect(pastTrip).toHaveCount(0);

  await failStorage(page, null);
  await main.getByRole('button', { name: 'Retry' }).click();
  await expect(pastTrip).toBeVisible();
  await expect(main).not.toContainText("Couldn't load past trips.");
});
