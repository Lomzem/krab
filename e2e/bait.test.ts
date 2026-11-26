import type { Page } from '@playwright/test';
import { expect, storedBaits, tapsDuring, test, toastOf } from './fixtures';

const tab = (page: Page, name: string) =>
  page.getByRole('tab', { name, exact: true });

const gearRow = (page: Page, name: string) =>
  page.getByRole('main').getByRole('button').filter({ hasText: name });

const dropPot = async (page: Page, name: string) => {
  await tab(page, 'Map').click();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText(`${name} dropped`);
  await tab(page, 'Gear').click();
};

const start = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
};

test('a saved custom bait is a one-tap choice after reload and on a new trip while new drops start blank', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const search = sheet.getByLabel('Find or add bait');
  const fishHeads = sheet.getByRole('radio', { name: 'Fish heads' });
  const addBait = async () => {
    await sheet.getByRole('button', { name: 'Add bait' }).click();
    await search.fill('Fish heads');
    await sheet.getByRole('option', { name: 'Add Fish heads' }).click();
    await expect(fishHeads).toBeChecked();
  };
  const reuseFishHeads = () =>
    tapsDuring(page, async () => {
      await sheet.getByText('Fish heads', { exact: true }).tap();
      await expect(fishHeads).toBeChecked();
    });

  await start(page);
  await dropPot(page, 'Pot 1');
  await gearRow(page, 'Pot 1').click();
  await addBait();
  await sheet.getByLabel('Depth').fill('-3');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet.getByLabel('Depth')).toBeFocused();
  await page.keyboard.press('Escape');
  await sheet.getByRole('button', { name: 'Discard changes' }).click();
  await expect(sheet).toBeHidden();
  expect(await storedBaits(page)).toEqual(['']);

  await gearRow(page, 'Pot 1').click();
  await expect(
    sheet.getByRole('group', { name: 'Bait' }).getByRole('radio')
  ).toHaveCount(0);
  await addBait();
  await sheet.getByLabel('Depth').fill('12');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  expect(await storedBaits(page)).toEqual(['Fish heads']);

  await dropPot(page, 'Pot 2');
  expect(await storedBaits(page)).toEqual(['Fish heads', '']);

  await page.reload();
  await tab(page, 'Gear').click();
  await gearRow(page, 'Pot 2').click();
  await expect(fishHeads).not.toBeChecked();
  await expect(reuseFishHeads()).resolves.toBe(1);
  await expect(search).toBeHidden();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  expect(await storedBaits(page)).toEqual(['Fish heads', 'Fish heads']);

  await page.getByRole('button', { name: 'End trip' }).click();
  await sheet.getByRole('button', { name: 'End trip' }).click();
  await expect(toastOf(page)).toContainText('Trip ended');
  await dropPot(page, 'Pot 1');
  expect(await storedBaits(page)).toEqual(['Fish heads', 'Fish heads', '']);
  await gearRow(page, 'Pot 1').click();
  await expect(fishHeads).not.toBeChecked();
  await expect(reuseFishHeads()).resolves.toBe(1);
});

test('typing a saved bait in another case picks the saved spelling and Enter adds new text over a partial match', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const search = sheet.getByLabel('Find or add bait');
  const other = sheet.getByRole('button', { name: 'Other bait' });

  await start(page);
  await dropPot(page, 'Pot 1');
  await gearRow(page, 'Pot 1').click();
  await sheet.getByRole('button', { name: 'Add bait' }).click();
  await search.fill('Fish heads');
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('radio', { name: 'Fish heads' })).toBeFocused();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();

  await dropPot(page, 'Pot 2');
  await gearRow(page, 'Pot 2').click();
  await other.click();
  await expect(other).toBeFocused();
  await search.fill('FISH  HEADS');
  await expect(sheet.getByRole('option')).toHaveText(['Fish heads']);
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('radio', { name: 'Fish heads' })).toBeFocused();
  await expect(sheet.getByRole('radio', { name: 'Fish heads' })).toBeChecked();

  await other.click();
  await search.fill('fish');
  await expect(sheet.getByRole('option')).toHaveText([
    'Add fish',
    'Fish heads'
  ]);
  await page.keyboard.press('Enter');
  await expect(sheet).toBeVisible();
  await expect(
    sheet.getByRole('radio', { name: 'fish', exact: true })
  ).toBeFocused();
  await expect(
    sheet.getByRole('radio', { name: 'fish', exact: true })
  ).toBeChecked();
  expect(await storedBaits(page)).toEqual(['Fish heads', '']);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  expect(await storedBaits(page)).toEqual(['Fish heads', 'fish']);

  await gearRow(page, 'Pot 2').click();
  await other.click();
  await sheet.getByRole('button', { name: 'Clear bait' }).click();
  await expect(other).toBeFocused();
  await expect(
    sheet
      .getByRole('group', { name: 'Bait' })
      .getByRole('radio', { checked: true })
  ).toHaveCount(0);
  expect(await storedBaits(page)).toEqual(['Fish heads', 'fish']);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  expect(await storedBaits(page)).toEqual(['Fish heads', '']);
});

test('opening the bait search from the keyboard focuses it and a tap leaves focus on Add bait', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const search = sheet.getByLabel('Find or add bait');
  const addBait = sheet.getByRole('button', { name: 'Add bait' });

  await start(page);
  await dropPot(page, 'Pot 1');
  await gearRow(page, 'Pot 1').click();

  await addBait.tap();
  await expect(search).toBeVisible();
  await expect(addBait).toBeFocused();
  await addBait.tap();
  await expect(search).toBeHidden();

  await addBait.focus();
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(addBait).toBeFocused();
  await page.keyboard.press('Space');
  await expect(search).toBeHidden();
  await expect(addBait).toBeFocused();
  await page.keyboard.press('Space');
  await expect(search).toBeFocused();
});

test('an empty bait search lets Enter save the sheet while ArrowDown then Enter picks a saved bait', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const search = sheet.getByLabel('Find or add bait');
  const label = sheet.getByLabel('Label', { exact: true });
  const other = sheet.getByRole('button', { name: 'Other bait' });

  await start(page);
  await dropPot(page, 'Pot 1');
  await gearRow(page, 'Pot 1').click();
  await sheet.getByRole('button', { name: 'Add bait' }).click();
  await expect(search).toHaveAttribute('aria-expanded', 'false');
  await search.fill('Fish heads');
  await expect(search).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Enter');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();

  await dropPot(page, 'Pot 2');
  await gearRow(page, 'Pot 2').click();
  await label.fill('North buoy');
  await other.click();
  await search.focus();
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(gearRow(page, 'Pot 2')).toContainText('North buoy');
  expect(await storedBaits(page)).toEqual(['Fish heads', '']);

  await gearRow(page, 'Pot 2').click();
  await label.fill('South buoy');
  await other.click();
  await search.fill('Fish');
  await expect(
    sheet.getByRole('status').filter({ hasText: '2 results' })
  ).toHaveCount(1);
  await search.fill('');
  await page.keyboard.press('Enter');
  await expect(sheet).toBeHidden();
  await expect(gearRow(page, 'Pot 2')).toContainText('South buoy');
  expect(await storedBaits(page)).toEqual(['Fish heads', '']);

  await gearRow(page, 'Pot 2').click();
  await other.click();
  await search.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('radio', { name: 'Fish heads' })).toBeChecked();
  await expect(sheet).toBeVisible();
});
