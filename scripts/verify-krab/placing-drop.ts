#!/usr/bin/env bun
import { expect, test } from '@playwright/test';
import { doctor } from './doctor';
import { readTrips, recorder } from './evidence';
import { MADE_UP_SEA } from '../../playwright.config';

for (const entry of ['Map', 'Gear']) {
  test(`placing a drop from ${entry} survives reload`, async ({
    page,
    context
  }, info) => {
    const { log, capture, keep } = recorder(page, info, 'placing-drop', entry);
    keep('doctor.json', doctor());
    log('doctor passed: our preview process owns 4173');
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Krab needs your location' })
    ).toBeVisible();
    await capture('01-location-explanation');
    log(
      'fresh iPhone WebKit context; grant geolocation with made-up mid-ocean position'
    );
    await context.grantPermissions(['geolocation']);
    await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
    await page.getByRole('button', { name: 'Turn on location' }).click();
    log('acknowledge location explanation');
    await expect(page.getByText('Position ready')).toBeVisible();
    log('location status shows Position ready');
    if (entry === 'Gear')
      await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await capture('02-before-drop');
    await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'dropped' })
    ).toContainText('Pot 1 dropped');
    log('tap Drop pot; saved toast visible');
    await capture('03-dropped');
    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    const row = page
      .getByRole('main')
      .getByRole('listitem')
      .filter({ hasText: 'Pot 1' });
    await expect(row).toContainText('0 ft');
    log('Gear lists Pot 1 at 0 ft');
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
    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await expect(row).toContainText('0 ft');
    const after = await readTrips(page);
    expect(after).toEqual(before);
    keep('indexeddb-after.json', after);
    log('reload; Pot 1 remains; read-only IndexedDB matches pre-reload state');
    await capture('05-restored');
  });
}

test('placing a drop with location denied saves it without a position', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(page, info, 'placing-drop', 'Denied');
  keep('doctor.json', doctor());
  log('doctor passed: our preview process owns 4173');
  await context.clearPermissions();
  log('fresh iPhone WebKit context; location permission cleared (denied)');
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  log('acknowledge location explanation');
  const off = page.getByRole('region', { name: 'Location is off' });
  await expect(off).toContainText('Settings');
  log('Location is off guidance names Settings');
  await capture('01-location-off');
  keep('indexeddb-before.json', await readTrips(page));
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'dropped' })
  ).toContainText('Pot 1 dropped without a position');
  log('tap Drop pot; toast says saved without a position');
  await capture('02-dropped');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
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
  await capture('03-gear');
});
