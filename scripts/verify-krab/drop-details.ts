#!/usr/bin/env bun
import { expect, test, type Page } from '@playwright/test';
import { doctor } from './doctor';
import { toastOf } from '../../e2e/fixtures';
import { readTrips, recorder } from './evidence';
import { MADE_UP_SEA } from '../../playwright.config';

const gearTab = (page: Page) =>
  page.getByRole('button', { name: 'Gear', exact: true });

const gearRow = (page: Page, name: string) =>
  page.getByRole('main').getByRole('button').filter({ hasText: name });

test('drop details stay a draft until Save, refuse a bad depth, save and survive reload, switch kind, and delete with Undo', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(page, info, 'drop-details', 'Gear');
  const sheet = page.getByRole('dialog');
  const label = sheet.getByLabel('Label');
  const depth = sheet.getByLabel('Depth');
  const save = sheet.getByRole('button', { name: 'Save' });
  const pot1 = gearRow(page, 'Pot 1');
  const drop = async (kind: 'Pot' | 'Net', name: string) => {
    await page
      .getByRole('group', { name: 'Gear to drop' })
      .getByText(kind, { exact: true })
      .click();
    await expect(page.getByText('Position ready')).toBeVisible();
    await page
      .getByRole('button', { name: `Drop ${kind.toLowerCase()}`, exact: true })
      .click();
    await expect(toastOf(page)).toContainText(`${name} dropped`);
  };
  const storedPot1 = async () => {
    const trips = await readTrips(page);
    const gear = trips[0]?.gear.find((item) => item.kind === 'pot');
    return trips[0]?.drops.find((item) => item.gearId === gear?.id);
  };

  keep('doctor.json', doctor());
  log('doctor passed: our preview process owns 4173');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await drop('Pot', 'Pot 1');
  await drop('Net', 'Net 1');
  log('made-up mid-ocean fix; drop Pot 1, then choose Net and drop Net 1');

  await gearTab(page).click();
  const opened = await readTrips(page);
  keep('indexeddb-before-sheet.json', opened);
  await pot1.click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  expect(
    await sheet.evaluate((element) => element.contains(document.activeElement))
  ).toBe(true);
  await expect(depth).toHaveAttribute('inputmode', 'decimal');
  log('open Pot 1 from Gear; focus inside the dialog; Depth is decimal');
  await capture('01-open');

  await label.fill('red float');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(pot1).toBeFocused();
  expect(await readTrips(page)).toEqual(opened);
  log(
    'fill Label, press Escape; sheet closes, row focused, IndexedDB unchanged'
  );
  await capture('02-draft-discarded');

  await pot1.click();
  await depth.fill('-3');
  await save.click();
  await expect(sheet).toBeVisible();
  await expect(depth).toBeFocused();
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await expect(depth).not.toHaveAccessibleDescription('');
  expect(await readTrips(page)).toEqual(opened);
  log(
    'Depth -3 then Save; sheet stays open, Depth focused and invalid, nothing stored'
  );
  await capture('03-depth-refused');

  await label.fill('red float');
  await depth.fill('12.5');
  await save.click();
  await expect(sheet).toBeHidden();
  expect(await storedPot1()).toMatchObject({
    label: 'red float',
    depthFt: 12.5
  });
  const saved = await readTrips(page);
  keep('indexeddb-details-saved.json', saved);
  log('Label red float, Depth 12.5, Save; stored drop has both');
  await capture('04-saved');

  await page.reload();
  await gearTab(page).click();
  await pot1.click();
  await expect(label).toHaveValue('red float');
  await expect(depth).toHaveValue('12.5');
  expect(await readTrips(page)).toEqual(saved);
  await page.keyboard.press('Escape');
  log('reload, reopen Pot 1; same Label and Depth; IndexedDB unchanged');
  await capture('05-restored');

  await gearRow(page, 'Net 1').click();
  await sheet
    .getByRole('group', { name: 'Gear' })
    .getByText('Pot', { exact: true })
    .click();
  await save.click();
  await expect(sheet).toBeHidden();
  await expect(gearRow(page, 'Pot 2')).toBeVisible();
  await expect(gearRow(page, 'Net 1')).toHaveCount(0);
  const switched = await readTrips(page);
  keep('indexeddb-kind-switched.json', switched);
  log('open Net 1, choose Pot, Save; row becomes Pot 2 and Net 1 is gone');
  await capture('06-kind-switched');

  await pot1.click();
  await sheet.getByRole('button', { name: 'Delete drop' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('button', { name: /^Drop (pot|net)$/ })
  ).toBeFocused();
  await expect(toastOf(page)).toContainText('Pot 1 deleted');
  await expect(pot1).toHaveCount(0);
  log(
    'open Pot 1, Delete drop; row gone, Drop button focused, toast Pot 1 deleted'
  );
  await capture('07-deleted');

  await toastOf(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 restored');
  await expect(pot1).toBeVisible();
  const restored = await readTrips(page);
  expect(restored).toEqual(switched);
  keep('indexeddb-restored.json', restored);
  log(
    'Undo; toast Pot 1 restored; IndexedDB equals the snapshot before delete'
  );
  await capture('08-restored');
});
