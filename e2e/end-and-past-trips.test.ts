import type { Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';
import { expectAccessibleInBothThemes } from './accessibility';

const MORNING = new Date('2031-06-10T07:30:00-04:00');
const TRIP_DATE = 'Tuesday, June 10, 2031';

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

test('collect Pot 1 with its catch, end the trip with Net 1 still in, and find both on the past trip, its map and the main map', async ({
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

  await mapArea.getByRole('button', { name: /^Filter/ }).click();
  const pastLayer = sheet
    .getByRole('group', { name: 'Also show' })
    .getByRole('checkbox', { name: 'Past trips' });
  await expect(pastLayer).not.toBeChecked();
  await pastLayer.check();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  const pastPin = mapArea.getByRole('button', {
    name: `Pot 1, past trip, ${TRIP_DATE}, 2 kept, 0 released`
  });
  await expect(pastPin).toBeVisible();
  await expect(
    mapArea.getByRole('button', {
      name: `Net 1, past trip, ${TRIP_DATE}, Uncollected`
    })
  ).toBeVisible();
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
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    detail.getByRole('button', { name: 'Pot 1, 2 kept, 0 released' })
  ).toBeFocused();

  await detail.getByRole('button', { name: 'All past trips' }).click();
  await expect(pastTrip).toBeFocused();
});

test('deleting the only drop of a past trip removes the trip until Undo brings it back, and Delete trip asks first and then removes it for good', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const main = page.getByRole('main');
  const listHeading = main.getByRole('heading', {
    level: 1,
    name: 'Past trips'
  });

  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await dropOf(page, 'Pot', 'Pot 1');
  await endTheTrip(
    page,
    "1 drop is still in the water. It'll be saved as uncollected."
  );

  await tab(page, 'Past trips').click();
  const pastTrip = main.getByRole('button', { name: new RegExp(TRIP_DATE) });
  await pastTrip.click();
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
  await sheet.getByRole('button', { name: 'Delete trip' }).click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Trip deleted');
  await expect(main).toContainText('No past trips yet.');
  await expect(listHeading).toBeFocused();

  await page.reload();
  await tab(page, 'Past trips').click();
  await expect(main).toContainText('No past trips yet.');
});

const FAIL_READS = 'krab-e2e-fail-trip-reads';

type Begin = (this: IDBDatabase, ...args: unknown[]) => IDBTransaction;

const injectReadFaults = (page: Page) =>
  page.addInitScript((flag) => {
    const database = IDBDatabase.prototype;
    const begin = Reflect.get(database, 'transaction') as Begin;
    const abort = (tx: IDBTransaction) => () => {
      tx.abort();
    };
    const faulty: Begin = function (...args) {
      const tx = Reflect.apply(begin, this, args);
      if (tx.mode === 'readonly' && sessionStorage.getItem(flag) === 'on') {
        queueMicrotask(abort(tx));
      }
      return tx;
    };
    Reflect.set(database, 'transaction', faulty);
  }, FAIL_READS);

const failReads = (page: Page, on: boolean) =>
  page.evaluate(
    ([flag, state]) => {
      if (state) sessionStorage.setItem(flag, 'on');
      else sessionStorage.removeItem(flag);
    },
    [FAIL_READS, on] as const
  );

test('past trips show what was just written even while storage reads fail, and history that fails to load offers Retry instead of reading as empty', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const main = page.getByRole('main');
  const pastTrip = main.getByRole('button', {
    name: `${TRIP_DATE} 1 drop, 1 uncollected`,
    exact: true
  });

  await injectReadFaults(page);
  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await dropOf(page, 'Pot', 'Pot 1');

  await failReads(page, true);
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

  await failReads(page, false);
  await main.getByRole('button', { name: 'Retry' }).click();
  await expect(pastTrip).toBeVisible();
  await expect(main).not.toContainText("Couldn't load past trips.");
});
