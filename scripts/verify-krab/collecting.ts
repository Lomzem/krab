#!/usr/bin/env bun
import { expect, test, type Page } from '@playwright/test';
import { doctor } from './doctor';
import { readTrips, recorder } from './evidence';
import { MADE_UP_SEA } from '../../playwright.config';

const gearTab = (page: Page) =>
  page.getByRole('button', { name: 'Gear', exact: true });

const inWaterRow = (page: Page) =>
  page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: 'Pot 1' })
    .filter({ hasText: 'in the water' });

const collectedRow = (page: Page) =>
  page
    .getByRole('region', { name: 'Collected' })
    .getByRole('button')
    .filter({ hasText: 'Pot 1' });

test('collecting a pot records its catch, survives reload, and drops it again', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(page, info, 'collecting', 'Gear');
  const sheet = page.getByRole('dialog');
  const collect = sheet.getByRole('button', { name: 'Collect', exact: true });
  const latest = async () => {
    const trips = await readTrips(page);
    return trips[0]?.drops.at(-1);
  };

  keep('doctor.json', doctor());
  log('doctor passed: our preview process owns 4173');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Pot 1 dropped' })
  ).toBeVisible();
  log('made-up mid-ocean fix; tap Drop pot; Pot 1 dropped');
  await capture('01-dropped');

  await gearTab(page).click();
  await inWaterRow(page).click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  await expect(sheet).toContainText('in the water');
  await expect(collect).toBeVisible();
  keep('indexeddb-before.json', await readTrips(page));
  log('open Pot 1 from Gear; sheet shows time in the water and Collect');
  await capture('02-sheet-in-water');

  await collect.click();
  await expect(sheet.getByRole('heading', { name: 'Catch' })).toBeFocused();
  await expect(page.getByRole('status').getByRole('group')).toContainText(
    'Pot 1 collected'
  );
  await expect(
    sheet.getByRole('button', { name: 'Undo collect' })
  ).toBeVisible();
  expect(await latest()).toMatchObject({ catch: null });
  expect((await latest())?.collectedAt).toEqual(expect.any(Number));
  log(
    'tap Collect; sheet morphs to Catch with focus on its heading; toast Pot 1 collected; stored collectedAt set, catch null'
  );
  await capture('03-collected');

  const step = (name: string) =>
    sheet.getByRole('button', { name, exact: true });
  await step('One more kept').click();
  await step('One more kept').click();
  await step('One more released').click();
  expect(await latest()).toMatchObject({ catch: null });
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  expect(await latest()).toMatchObject({ catch: { kept: 2, released: 1 } });
  await expect(collectedRow(page)).toContainText('2 kept, 1 released');
  await expect(page.getByRole('main')).toContainText('1 collected');
  await expect(page.getByRole('main')).toContainText('Nothing in the water');
  const saved = await readTrips(page);
  keep('indexeddb-catch-saved.json', saved);
  log(
    'step kept to 2 and released to 1 (store unchanged until Save); Save stores the catch; Collected row reads 2 kept, 1 released'
  );
  await capture('04-catch-saved');

  await page.reload();
  await gearTab(page).click();
  await expect(collectedRow(page)).toContainText('2 kept, 1 released');
  expect(await readTrips(page)).toEqual(saved);
  log('reload; Collected row and read-only IndexedDB unchanged');
  await capture('05-restored');

  await collectedRow(page).click();
  await sheet.getByRole('button', { name: 'Drop pot again here' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('status').filter({ hasText: 'Pot 1 dropped' })
  ).toBeVisible();
  await expect(inWaterRow(page)).toBeVisible();
  const again = await readTrips(page);
  const drops = again[0]?.drops ?? [];
  expect(drops).toHaveLength(2);
  expect(new Set(drops.map((drop) => drop.gearId)).size).toBe(1);
  expect(drops[1]).toMatchObject({
    collectedAt: null,
    catch: null,
    position: {
      lat: MADE_UP_SEA.latitude,
      lon: MADE_UP_SEA.longitude,
      accuracyM: 8
    }
  });
  keep('indexeddb-dropped-again.json', again);
  log(
    'open collected Pot 1; Drop pot again here; second drop of the same gear stored in the water at the made-up fix'
  );
  await capture('06-dropped-again');

  await inWaterRow(page).click();
  await collect.click();
  await sheet.getByRole('button', { name: 'Undo collect' }).click();
  await expect(collect).toBeFocused();
  expect(await latest()).toMatchObject({ collectedAt: null, catch: null });
  keep('indexeddb-after.json', await readTrips(page));
  log(
    'collect the new drop, then Undo collect in the sheet; Collect regains focus; stored drop back in the water'
  );
  await capture('07-undo-collect');
});
