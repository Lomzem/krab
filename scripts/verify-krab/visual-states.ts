#!/usr/bin/env bun
import { test, expect, toastOf } from '../../e2e/fixtures';
import { holdFixes, deliverFix } from '../../e2e/held-geolocation';
import { MADE_UP_SEA } from '../../playwright.config';
import { doctor } from './doctor';
import { readTrips, recorder } from './evidence';

const EVENING = new Date('2031-06-10T23:40:00-04:00');

test('visual inventory through a dense overnight trip', async ({
  page
}, info) => {
  const { capture, keep, log } = recorder(page, info, 'visual-inventory', 'UI');
  keep('doctor.json', doctor());
  await holdFixes(page);
  await page.clock.install({ time: EVENING });
  await page.clock.pauseAt(EVENING);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Krab needs your location' })
  ).toBeVisible();
  await capture('01-location-explanation');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();
  await capture('02-finding-position');
  const tab = (name: string) => page.getByRole('button', { name, exact: true });
  const sheet = page.getByRole('dialog');
  const gear = page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: /\bPot 1\b/ });
  await tab('Gear').click();
  await capture('03-empty-gear');
  await tab('Past trips').click();
  await expect(page.getByText('No past trips yet.')).toBeVisible();
  await capture('04-empty-past-trips');
  await tab('Map').click();
  await capture('05-empty-map');
  await tab('Drop pot').click();
  await expect(
    page.getByRole('heading', { name: 'Getting position' })
  ).toBeVisible();
  await capture('05b-getting-position');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Getting position' })
  ).toBeHidden();
  log(
    'first-launch explanation, finding position, empty Gear, Past trips and Map'
  );

  for (let number = 1; number <= 8; number += 1) {
    if (number === 5) await page.clock.fastForward('30:00');
    await deliverFix(page, {
      latitude: MADE_UP_SEA.latitude + number * 0.001,
      longitude: MADE_UP_SEA.longitude
    });
    await expect(page.getByText('Position ready')).toBeVisible();
    await tab('Drop pot').click();
    await expect(toastOf(page)).toContainText(`Pot ${String(number)} dropped`);
    if (number === 1) await capture('06-drop-toast');
  }
  log(
    'eight real UI drops with made-up fixes; four each side of local midnight'
  );
  await page.clock.runFor(8001);
  await deliverFix(page, {
    latitude: MADE_UP_SEA.latitude + 0.008,
    longitude: MADE_UP_SEA.longitude
  });
  await capture('07-dense-map');
  await tab('Gear').click();
  await expect(page.getByRole('region', { name: 'Day 2' })).toBeVisible();
  await capture('08-dense-gear-top');
  await gear.click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  await capture('09-gear-sheet');
  await sheet
    .getByLabel('Label')
    .fill('Red float beside the northern channel marker');
  const depth = sheet.getByLabel('Depth');
  await depth.fill('-3');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await capture('10-invalid-depth');
  await depth.fill('125.5');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await gear.click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await expect(
    sheet.getByRole('heading', { name: 'Catch', exact: true })
  ).toBeVisible();
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'One more released' }).click();
  await page.clock.runFor(8001);
  await capture('11-catch-sheet');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await gear.scrollIntoViewIfNeeded();
  await capture('12-collected-and-long-label');
  log(
    'details validation, long saved label, collected catch and dense list bottom'
  );

  await tab('Map').click();
  const map = page.getByRole('region', { name: 'Map', exact: true });
  await map.getByRole('button', { name: /^Filter/ }).click();
  await expect(
    sheet.getByRole('group', { name: 'Days on this trip' })
  ).toBeVisible();
  await capture('13-map-filter');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await map.getByRole('button', { name: 'End trip' }).click();
  await expect(
    sheet.getByRole('heading', { name: 'End this trip?' })
  ).toBeVisible();
  await capture('14-end-confirmation');
  await sheet.getByRole('button', { name: 'End trip', exact: true }).click();
  await expect(sheet).toBeHidden();
  await page.clock.runFor(8001);
  await tab('Past trips').click();
  const past = page.getByRole('main').getByRole('listitem').getByRole('button');
  await expect(past).toHaveCount(1);
  await capture('15-past-trips');
  await past.click();
  await expect(
    page.getByRole('button', { name: 'Delete trip', exact: true })
  ).toBeVisible();
  await capture('16-past-trip-detail');
  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  await expect(
    sheet.getByRole('heading', { name: 'Delete this trip?' })
  ).toBeVisible();
  await capture('17-delete-confirmation');
  await sheet.getByRole('button', { name: 'Keep it' }).click();
  keep('indexeddb-after.json', await readTrips(page));
  log(
    'Map filter, end confirmation, past-trip list and detail, delete confirmation; keep trip'
  );
});

test('visual inventory with location denied', async ({
  page,
  context
}, info) => {
  const { capture, keep, log } = recorder(
    page,
    info,
    'visual-inventory',
    'Denied'
  );
  keep('doctor.json', doctor());
  await context.clearPermissions();
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(
    page.getByRole('region', { name: 'Location is off' })
  ).toBeVisible();
  await capture('01-location-denied');
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped without a position');
  await capture('02-no-position-toast');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await expect(page.getByRole('main')).toContainText('No position');
  await capture('03-no-position-gear');
  keep('indexeddb-after.json', await readTrips(page));
  log('location denied, drop without position, Gear guidance');
});
