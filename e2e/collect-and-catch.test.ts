import type { Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';
import { expectAccessibleInBothThemes } from './accessibility';

const gearTab = (page: Page) =>
  page.getByRole('button', { name: 'Gear', exact: true });

const inWaterRow = (page: Page, name: string) =>
  page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: name })
    .filter({ hasText: 'in the water' });

const collectedRow = (page: Page, name: string) =>
  page
    .getByRole('region', { name: 'Collected' })
    .getByRole('button')
    .filter({ hasText: name });

const countOf = (page: Page, name: 'Kept' | 'Released') =>
  page.getByRole('dialog').getByRole('group', { name }).getByRole('status');

test('collecting keeps the sheet open for the catch, which stays a draft until Save and survives reload; Clear catch empties only the draft, and One fewer does nothing at not recorded or 0', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const step = (name: string) =>
    sheet.getByRole('button', { name, exact: true });

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await gearTab(page).click();

  await inWaterRow(page, 'Pot 1').click();
  await expect(
    sheet.getByRole('button', { name: 'Delete drop' })
  ).toBeVisible();
  await expectAccessibleInBothThemes(page);
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();

  await expect(sheet.getByRole('heading', { name: 'Catch' })).toBeFocused();
  await expect(
    sheet.getByRole('button', { name: 'Collect', exact: true })
  ).toHaveCount(0);
  await expect(
    sheet.getByRole('button', { name: 'Undo collect' })
  ).toBeVisible();
  await expect(countOf(page, 'Kept')).toContainText('Kept: not recorded');
  await expectAccessibleInBothThemes(page);

  await step('One more kept').click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await collectedRow(page, 'Pot 1').click();
  await expect(countOf(page, 'Kept')).toContainText('Kept: not recorded');

  await step('One more kept').click();
  await step('One more kept').click();
  await step('One more kept').click();
  await step('One fewer kept').click();
  await step('One more released').click();
  await expect(countOf(page, 'Kept')).toContainText('Kept: 2');
  await expect(countOf(page, 'Released')).toContainText('Released: 1');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();

  await page.reload();
  await gearTab(page).click();
  await expect(collectedRow(page, 'Pot 1')).toContainText('2 kept, 1 released');
  await expect(inWaterRow(page, 'Pot 1')).toHaveCount(0);

  await collectedRow(page, 'Pot 1').click();
  await step('Clear catch').click();
  await expect(countOf(page, 'Kept')).toContainText('Kept: not recorded');
  await expect(countOf(page, 'Released')).toContainText(
    'Released: not recorded'
  );
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await collectedRow(page, 'Pot 1').click();
  await expect(countOf(page, 'Kept')).toContainText('Kept: 2');
  await expect(countOf(page, 'Released')).toContainText('Released: 1');

  await step('Clear catch').click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await page.reload();
  await gearTab(page).click();
  await expect(collectedRow(page, 'Pot 1')).toContainText('Catch not recorded');

  await collectedRow(page, 'Pot 1').click();
  const fewerKept = step('One fewer kept');
  await fewerKept.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(fewerKept).toBeFocused();
  await expect(countOf(page, 'Kept')).toContainText('Kept: not recorded');
  await expect(countOf(page, 'Released')).toContainText(
    'Released: not recorded'
  );

  await sheet.getByRole('button', { name: 'Nothing caught' }).click();
  await fewerKept.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await expect(fewerKept).toBeFocused();
  await expect(countOf(page, 'Kept')).toContainText('Kept: 0');
  await expect(countOf(page, 'Released')).toContainText('Released: 0');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(collectedRow(page, 'Pot 1')).toContainText('Nothing caught');
});

test('Drop again puts the same gear back with its details, and Undo collect in the sheet puts gear back in the water', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const dropAgain = sheet.getByRole('button', { name: 'Drop pot again here' });

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await gearTab(page).click();

  await inWaterRow(page, 'Pot 1').click();
  await sheet.getByLabel('Bait').fill('herring');
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await dropAgain.click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');

  await expect(collectedRow(page, 'Pot 1')).toContainText('1 kept, 0 released');
  await collectedRow(page, 'Pot 1').click();
  await expect(sheet.getByLabel('Bait')).toHaveValue('herring');
  await expect(dropAgain).toHaveCount(0);
  await expect(sheet.getByRole('button', { name: 'Undo collect' })).toHaveCount(
    0
  );
  await expect(
    sheet.getByRole('button', { name: 'Delete drop' })
  ).toBeVisible();
  await page.keyboard.press('Escape');

  await inWaterRow(page, 'Pot 1').click();
  await expect(sheet.getByLabel('Bait')).toHaveValue('herring');
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await sheet.getByRole('button', { name: 'Nothing caught' }).click();
  await sheet.getByRole('button', { name: 'Undo collect' }).click();

  await expect(
    sheet.getByRole('button', { name: 'Collect', exact: true })
  ).toBeFocused();
  await expect(sheet.getByRole('heading', { name: 'Catch' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(inWaterRow(page, 'Pot 1')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Collected' })).toContainText(
    'Pot 1'
  );
});
