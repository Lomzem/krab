#!/usr/bin/env bun
import { expect, test, type Page } from '@playwright/test';
import { doctor } from './doctor';
import { toastOf } from '../../e2e/fixtures';
import { readTrips, recorder } from './evidence';
import { MADE_UP_SEA } from '../../playwright.config';
import { deliverFix, holdFixes } from '../../e2e/held-geolocation';

const LATE_EVENING = new Date('2031-06-10T23:40:00-04:00');

const dropPotAt = async (page: Page, north: number, name: string) => {
  await deliverFix(page, {
    latitude: MADE_UP_SEA.latitude + north,
    longitude: MADE_UP_SEA.longitude
  });
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText(`${name} dropped`);
};

test.use({ timezoneId: 'America/New_York' });

test('an overnight trip groups gear by day and the Map filter narrows only the map', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(
    page,
    info,
    'days-and-map-filter',
    'Map'
  );
  const requested: string[] = [];
  context.on('request', (request) => requested.push(request.url()));
  const tab = (name: string) => page.getByRole('button', { name, exact: true });
  const mapArea = page.getByRole('region', { name: 'Map', exact: true });
  const pin = (name: RegExp) => mapArea.getByRole('button', { name });
  const sheet = page.getByRole('dialog');
  const alsoShow = sheet.getByRole('group', { name: 'Also show' });
  const days = sheet.getByRole('group', { name: 'Days on this trip' });
  const openFilter = async () => {
    await mapArea.getByRole('button', { name: /^Filter/ }).click();
    await expect(
      sheet.getByRole('heading', { name: 'Map filter' })
    ).toBeVisible();
  };
  const closeFilter = async () => {
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
  };

  keep('doctor.json', doctor());
  log('doctor passed: our preview process owns 4173');
  await context.grantPermissions(['geolocation']);
  await holdFixes(page);
  await page.clock.install({ time: LATE_EVENING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  keep('indexeddb-before.json', await readTrips(page));
  await dropPotAt(page, 0, 'Pot 1');
  log('New York 23:40; made-up mid-ocean fix; Pot 1 dropped');

  await openFilter();
  await expect(alsoShow).toBeVisible();
  await expect(days).toHaveCount(0);
  log('one-day trip: Map filter has Also show and no Days on this trip');
  await capture('01-filter-one-day');
  await closeFilter();

  await page.clock.fastForward('30:00');
  await dropPotAt(page, 0.001, 'Pot 2');
  log('clock past local midnight (00:10); Pot 2 dropped a little north');

  await tab('Gear').click();
  await expect(
    page.getByRole('region', { name: 'Day 1' }).getByRole('button')
  ).toHaveText([/Pot 1/]);
  await expect(
    page.getByRole('region', { name: 'Day 2' }).getByRole('button')
  ).toHaveText([/Pot 2/]);
  log('Gear list: Day 1 holds Pot 1, Day 2 holds Pot 2');
  await capture('02-gear-by-day');

  await tab('Map').click();
  await expect(pin(/^Pot 1, Day 1,/)).toBeVisible();
  await expect(pin(/^Pot 2, Day 2,/)).toBeVisible();
  log('Map: pins named Pot 1, Day 1 and Pot 2, Day 2');
  await capture('03-map-two-days');

  await openFilter();
  await expect(days.getByRole('radio', { name: 'All' })).toBeChecked();
  log('multi-day: Days on this trip shows, All chosen');
  await capture('04-filter-sheet');
  await days.getByRole('radio', { name: 'Today' }).check();
  await closeFilter();
  await expect(pin(/^Pot 1,/)).toHaveCount(0);
  await expect(pin(/^Pot 2,/)).toBeVisible();
  log('Today: Pot 1 pin gone, Pot 2 stays');
  await capture('05-today-only');

  await tab('Gear').click();
  await page
    .getByRole('region', { name: 'Day 1' })
    .getByRole('button', { name: /Pot 1/ })
    .click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 collected');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  log('Gear list still lists Day 1 under Today; Pot 1 collected from it');

  await tab('Map').click();
  await openFilter();
  await alsoShow.getByRole('checkbox', { name: 'Collected gear' }).uncheck();
  await closeFilter();
  log('Collected gear turned off; days still Today');

  await tab('Gear').click();
  await page
    .getByRole('region', { name: 'Collected' })
    .getByRole('button', { name: /Pot 1/ })
    .click();
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  const collected = pin(/^Pot 1, Day 1, collected/);
  await expect(collected).toBeFocused();
  await expect(pin(/^Pot 2, Day 2,/)).toBeVisible();
  log('Show on map: collected Pot 1 dashed pin focused beside Pot 2');
  await capture('06-show-on-map-collected');

  await openFilter();
  await expect(
    alsoShow.getByRole('checkbox', { name: 'Collected gear' })
  ).toBeChecked();
  await expect(days.getByRole('radio', { name: 'All' })).toBeChecked();
  log('filter after Show on map: Collected gear on, All days');
  await alsoShow.getByRole('checkbox', { name: 'Time in the water' }).uncheck();
  await capture('07-filter-after-show');
  await closeFilter();
  await capture('08-no-time-labels');

  await page.reload();
  await openFilter();
  await expect(
    alsoShow.getByRole('checkbox', { name: 'Time in the water' })
  ).toBeChecked();
  log('reload: the filter is back to its defaults, nothing stored');

  keep('indexeddb-after.json', await readTrips(page));
  keep('requests.json', requested);
  log('kept trips and every request URL of this journey');
});
