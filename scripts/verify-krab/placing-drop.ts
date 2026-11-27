#!/usr/bin/env bun
import { expect, test } from './recipe';
import { toastOf } from '../../e2e/fixtures';
import { readTrips, recorder } from './evidence';
import { MADE_UP_SEA } from '../../playwright.config';

test('placing a drop from Map survives reload', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(page, info, 'placing-drop', 'Map');
  await page.goto('/licenses/atkinson-hyperlegible-next-OFL.txt');
  await expect(readTrips(page)).rejects.toThrow('Cannot read Krab IndexedDB');
  expect(
    await page.evaluate(() => indexedDB.databases()),
    'reading evidence before Krab starts creates no database'
  ).toEqual([]);
  log('evidence read before Krab starts rejects and creates no database');
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Mark and find gear' })
  ).toBeVisible();
  await capture('01-location-explanation');
  log(
    'fresh iPhone WebKit context; grant geolocation with made-up mid-ocean position'
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  await page.getByRole('button', { name: 'Turn on location' }).click();
  log('acknowledge location explanation');
  await expect(page.getByText('Finding position')).toBeHidden();
  log('Finding position clears');
  await capture('02-before-drop');
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  log('tap Drop pot; saved toast visible');
  await capture('03-dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  const row = page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ hasText: 'Pot 1' });
  await expect(row).toContainText('At gear');
  log('Gear lists Pot 1 at gear');
  const before = await readTrips(page);
  expect(before).toHaveLength(1);
  expect(before[0]?.drops[0]?.position).toEqual({
    lat: MADE_UP_SEA.latitude,
    lon: MADE_UP_SEA.longitude,
    accuracyM: 8
  });
  keep('indexeddb-before.json', before);
  await capture('04-gear');
  await page.reload();
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await expect(row).toContainText('At gear');
  const after = await readTrips(page);
  expect(after).toEqual(before);
  keep('indexeddb-after.json', after);
  log('reload; Pot 1 remains; read-only IndexedDB matches pre-reload state');
  await capture('05-restored');
});

test('placing a drop with location denied saves it without a position', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(page, info, 'placing-drop', 'Denied');
  await context.clearPermissions();
  log('fresh iPhone WebKit context; location permission cleared (denied)');
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  log('acknowledge location explanation');
  const off = page.getByRole('region', { name: 'Location is off' });
  await off.getByRole('button', { name: 'Show steps' }).click();
  const steps = page.getByRole('dialog', { name: 'Turn on location' });
  await expect(steps).toContainText(
    'Settings › Privacy & Security › Location Services'
  );
  log('Show steps opens Turn on location naming the Settings path');
  await capture('01-location-steps');
  await steps.getByRole('button', { name: 'Close' }).click();
  await expect(steps).toBeHidden();
  log('Close leaves the Location is off guidance under the map');
  await capture('02-location-off');
  keep('indexeddb-before.json', await readTrips(page));
  await page
    .getByRole('button', { name: 'Drop pot without position', exact: true })
    .click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped, no position');
  log('tap Drop pot without position; toast says saved without a position');
  await capture('03-dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await expect(
    page.getByRole('main').getByRole('listitem').filter({ hasText: 'Pot 1' })
  ).toContainText('No position');
  log('Gear lists Pot 1 with No position');
  const after = await readTrips(page);
  expect(after).toHaveLength(1);
  expect(after[0]?.drops[0]).toMatchObject({
    position: null,
    noPosition: 'denied'
  });
  keep('indexeddb-after.json', after);
  log('read-only IndexedDB holds Pot 1 with no position, reason denied');
  await capture('04-gear');
});
