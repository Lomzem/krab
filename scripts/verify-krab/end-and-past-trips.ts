#!/usr/bin/env bun
import { expect, test, type Page } from '@playwright/test';
import { doctor } from './doctor';
import { toastOf } from '../../e2e/fixtures';
import { readTrips, recorder } from './evidence';
import { MADE_UP_SEA } from '../../playwright.config';

const MORNING = new Date('2031-06-10T07:30:00-04:00');
const TRIP_DATE = 'Tuesday, June 10, 2031';
const STILL_IN = "1 drop is still in the water. It'll be saved as uncollected.";

test.use({ timezoneId: 'America/New_York' });

const tab = (page: Page, name: string) =>
  page.getByRole('button', { name, exact: true });

const fishOneMorning = async (page: Page) => {
  const sheet = page.getByRole('dialog');
  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page
    .getByRole('group', { name: 'Gear to drop' })
    .getByText('Net', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Drop net', exact: true }).click();
  await expect(toastOf(page)).toContainText('Net 1 dropped');

  await tab(page, 'Gear').click();
  await page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: 'Pot 1' })
    .click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
};

const confirmEnd = async (page: Page) => {
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'End trip' }).click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText(
    'Trip ended. It is under Past trips.'
  );
};

test('ending a trip asks first, keeps Net 1 as uncollected, and leaves the trip on the map as a past layer', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(page, info, 'ending-trip', 'Map');
  const sheet = page.getByRole('dialog');
  const mapArea = page.getByRole('region', { name: 'Map', exact: true });
  const endButton = mapArea.getByRole('button', { name: 'End trip' });

  keep('doctor.json', doctor());
  log('doctor passed: our preview process owns 4173');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  await fishOneMorning(page);
  log(
    'made-up mid-ocean fix at a fixed June morning; drop Pot 1 and Net 1; collect Pot 1 with 2 kept and Save'
  );

  await tab(page, 'Map').click();
  await expect(mapArea).toContainText('Trip running. 1 in the water.');
  await expect(endButton).toBeVisible();
  keep('indexeddb-before.json', await readTrips(page));
  log('Map shows the running trip bar with End trip');
  await capture('01-trip-running');

  await endButton.click();
  await expect(
    sheet.getByRole('heading', { name: 'End this trip?' })
  ).toBeVisible();
  await expect(sheet).toContainText(STILL_IN);
  await capture('02-confirm');
  await sheet.getByRole('button', { name: 'Keep fishing' }).click();
  await expect(sheet).toBeHidden();
  await expect(endButton).toBeFocused();
  expect((await readTrips(page))[0]?.endedAt).toBeNull();
  log(
    'End trip opens End this trip? naming the drop still in; Keep fishing closes it, refocuses End trip, stored endedAt stays null'
  );

  await endButton.click();
  await confirmEnd(page);
  await expect(page.getByRole('button', { name: 'Drop net' })).toBeFocused();
  await expect(endButton).toHaveCount(0);
  await expect(mapArea).toContainText('No trip running');
  const ended = await readTrips(page);
  expect(ended).toHaveLength(1);
  expect(ended[0]?.endedAt).toEqual(expect.any(Number));
  expect(ended[0]?.drops.map((drop) => drop.collectedAt === null)).toEqual([
    false,
    true
  ]);
  keep('indexeddb-ended.json', ended);
  log(
    'End trip in the sheet; toast Trip ended; focus on Drop net; Map says No trip running; stored endedAt set, Net 1 still uncollected'
  );
  await capture('03-ended');

  const pastLayer = sheet
    .getByRole('group', { name: 'Also show' })
    .getByRole('checkbox', { name: 'Past trips' });
  const pastGroup = mapArea.getByRole('button', {
    name: 'Pot 1 +1 more. 2 gear here: Net 1, Pot 1; 1 of 2 uncollected',
    exact: true
  });
  const showPastLayer = async (on: boolean) => {
    await mapArea.getByRole('button', { name: /^Filter/ }).click();
    await pastLayer.setChecked(on);
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    await expect(pastGroup).toHaveCount(on ? 1 : 0);
  };
  await expect(
    mapArea.getByRole('img', { name: /^Your position/ })
  ).toBeVisible();
  await expect(pastGroup).toHaveCount(0);
  await mapArea.getByRole('button', { name: /^Filter/ }).click();
  await expect(pastLayer).not.toBeChecked();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await expect(sheet).toBeHidden();
  await showPastLayer(true);
  await showPastLayer(false);
  await showPastLayer(true);
  await expect(pastGroup).toBeVisible();
  await pastGroup.click();
  for (const name of [
    `Net 1, past trip, ${TRIP_DATE}, Uncollected`,
    `Pot 1, past trip, ${TRIP_DATE}, 2 kept, 0 released`
  ]) {
    await expect(
      sheet.getByRole('button', { name, exact: true })
    ).toBeVisible();
  }
  await capture('04-past-group-list');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(pastGroup).toBeFocused();
  keep('indexeddb-after.json', await readTrips(page));
  log(
    'with no trip running and own position drawn, the past pins are absent and Past trips is unticked; ticking it shows one dotted group of 2 at their shared position, unticking hides it, ticking again shows it; its list names Net 1 and Pot 1 for the past trip and Escape returns focus to the group'
  );
  await capture('04-past-layer');
});

test('past trips list an ended trip, open its gear and map, survive reload, and delete it after asking', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(
    page,
    info,
    'past-trips',
    'Past trips'
  );
  const sheet = page.getByRole('dialog');
  const main = page.getByRole('main');
  const pastTrip = main.getByRole('button', { name: new RegExp(TRIP_DATE) });
  const detail = page.getByRole('region', { name: TRIP_DATE });
  const pot1 = detail.getByRole('button', {
    name: 'Pot 1 2 kept, 0 released',
    exact: true
  });
  const net1 = detail.getByRole('button', {
    name: 'Net 1 Uncollected',
    exact: true
  });

  keep('doctor.json', doctor());
  log('doctor passed: our preview process owns 4173');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  await fishOneMorning(page);
  await tab(page, 'Map').click();
  await page
    .getByRole('region', { name: 'Map', exact: true })
    .getByRole('button', { name: 'End trip' })
    .click();
  await expect(page.getByRole('dialog')).toContainText(STILL_IN);
  await confirmEnd(page);
  log(
    'made-up fix; drop Pot 1 and Net 1, collect Pot 1 with 2 kept, End trip from the Map and confirm'
  );

  await tab(page, 'Past trips').click();
  await expect(pastTrip).toHaveAccessibleName(
    `${TRIP_DATE} 2 drops, 1 uncollected`
  );
  keep('indexeddb-before.json', await readTrips(page));
  log('Past trips lists the trip by date with 2 drops, 1 uncollected');
  await capture('01-list');

  await pastTrip.click();
  await expect(
    detail.getByRole('heading', { level: 1, name: TRIP_DATE })
  ).toBeFocused();
  await expect(pot1).toBeVisible();
  await expect(net1).toBeVisible();
  const detailGroup = detail.getByRole('button', {
    name: 'Pot 1 +1 more. 2 gear here: Net 1, Pot 1; 1 of 2 uncollected',
    exact: true
  });
  await expect(detailGroup).toBeVisible();
  log(
    'open the trip; its date heading takes focus; rows Pot 1 2 kept, 0 released and Net 1 Uncollected; one group of 2 for Net 1 and Pot 1 on the trip map, since they share a position'
  );
  await capture('02-detail');

  await net1.click();
  await expect(sheet).toContainText(
    'Uncollected. The trip ended with this gear in the water.'
  );
  await expect(
    sheet.getByRole('button', { name: 'Collect', exact: true })
  ).toHaveCount(0);
  await capture('03-uncollected-sheet');
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
  await expect(detailGroup).toBeFocused();
  log(
    'Net 1 sheet says Uncollected with no Collect; Escape refocuses its row; Pot 1 sheet shows Kept: 2 and no drop again; Show on map focuses the group holding it'
  );
  await capture('04-show-on-map');

  await pot1.click();
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    detail.getByRole('button', {
      name: 'Pot 1 3 kept, 0 released',
      exact: true
    })
  ).toBeVisible();
  await expect(pot1).toHaveCount(0);
  const edited = await readTrips(page);
  expect(edited).toMatchObject([
    { drops: [{ catch: { kept: 3, released: 0 } }, { catch: null }] }
  ]);
  keep('indexeddb-catch-edited.json', edited);
  log(
    'edit the past Pot 1 catch to 3 kept and Save; the trip list shows Pot 1 3 kept, 0 released once the sheet closes, and the store holds it'
  );
  await capture('05-catch-edited');

  const before = await readTrips(page);
  await page.reload();
  await tab(page, 'Past trips').click();
  await expect(pastTrip).toHaveAccessibleName(
    `${TRIP_DATE} 2 drops, 1 uncollected`
  );
  expect(await readTrips(page)).toEqual(before);
  log('reload; the past trip and read-only IndexedDB are unchanged');

  await pastTrip.click();
  const deleteTrip = main.getByRole('button', { name: 'Delete trip' });
  await deleteTrip.click();
  await expect(
    sheet.getByRole('heading', { name: 'Delete this trip?' })
  ).toBeVisible();
  await capture('06-delete-confirm');
  await sheet.getByRole('button', { name: 'Keep it' }).click();
  await expect(deleteTrip).toBeFocused();
  expect(await readTrips(page)).toHaveLength(1);
  await deleteTrip.click();
  await sheet.getByRole('button', { name: 'Delete trip' }).click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Trip deleted');
  await expect(main).toContainText('No past trips yet.');
  await expect(
    main.getByRole('heading', { level: 1, name: 'Past trips' })
  ).toBeFocused();
  const after = await readTrips(page);
  expect(after).toEqual([]);
  keep('indexeddb-after.json', after);
  log(
    'Delete trip asks first; Keep it refocuses the button and stores nothing; confirming deletes it, toast Trip deleted, empty list with its heading focused, store empty'
  );
  await capture('07-deleted');
});
