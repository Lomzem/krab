import type { Locator, Page } from '@playwright/test';
import { expect, holdStorage, releaseStorage, test, toastOf } from './fixtures';
import {
  expectAccessibleInBothThemes,
  expectFocusTrapped
} from './accessibility';

const gearRow = (page: Page, name: string) =>
  page.getByRole('main').getByRole('button').filter({ hasText: name });

const focusIsInside = (dialog: Locator) =>
  dialog.evaluate((element) => element.contains(document.activeElement));

test('the gear sheet keeps edits as a draft, saves details and kind, and deletes once with undo', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const label = sheet.getByLabel('Label');
  const depth = sheet.getByLabel('Depth');

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page
    .getByRole('group', { name: 'Gear to drop' })
    .getByText('Net', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Drop net' }).click();
  await expect(toastOf(page)).toContainText('Net 1 dropped');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();

  const pot1 = gearRow(page, 'Pot 1');
  await pot1.click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  expect(await focusIsInside(sheet)).toBe(true);
  await expect(depth).toHaveAttribute('inputmode', 'decimal');
  await expectAccessibleInBothThemes(page);

  await expectFocusTrapped(page, sheet);

  await label.fill('red float');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(pot1).toBeFocused();
  await pot1.click();
  await expect(label).toHaveValue('');

  await label.fill('red float');
  await depth.fill('-3');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(depth).toBeFocused();
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await expect(depth).not.toHaveAccessibleDescription('');
  await depth.fill('12.5');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();

  await gearRow(page, 'Net 1').click();
  await sheet
    .getByRole('group', { name: 'Gear' })
    .getByText('Pot', { exact: true })
    .click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(gearRow(page, 'Pot 2')).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await pot1.click();
  await expect(label).toHaveValue('red float');
  await expect(depth).toHaveValue('12.5');

  await sheet.getByRole('button', { name: 'Delete drop' }).dblclick();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('button', { name: /^Drop (pot|net)$/ })
  ).toBeFocused();
  await expect(toastOf(page)).toContainText('Pot 1 deleted');
  await expect(pot1).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 restored');
  await pot1.click();
  await expect(label).toHaveValue('red float');
});

test('deleting a drop already deleted in another tab closes the sheet without an error', async ({
  page,
  context
}) => {
  const sheet = page.getByRole('dialog');

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  for (const name of ['Pot 1', 'Pot 2']) {
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(`${name} dropped`);
  }
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();

  const other = await context.newPage();
  const otherSheet = other.getByRole('dialog');
  await other.goto('/');
  await other.getByRole('button', { name: 'Gear', exact: true }).click();
  await gearRow(other, 'Pot 1').click();
  await otherSheet.getByRole('button', { name: 'Delete drop' }).dblclick();
  await expect(toastOf(other)).toContainText('Pot 1 deleted');
  await other.close();

  await sheet.getByRole('button', { name: 'Delete drop' }).dblclick();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).not.toContainText("Couldn't");
});

test('while a sheet action is storing, the sheet ignores its other actions, and finishing after another gear opens leaves that sheet and its draft alone', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const heading = (name: string) => sheet.getByRole('heading', { name });
  const label = sheet.getByLabel('Label');
  const save = sheet.getByRole('button', { name: 'Save' });
  const deleteDrop = sheet.getByRole('button', { name: 'Delete drop' });

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  for (const name of ['Pot 1', 'Pot 2']) {
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(`${name} dropped`);
  }
  await page.getByRole('button', { name: 'Gear', exact: true }).click();

  await gearRow(page, 'Pot 1').click();
  await label.fill('red float');
  await holdStorage(page);
  await save.click();
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(deleteDrop).toHaveAttribute('aria-disabled', 'true');
  await deleteDrop.click({ force: true });
  await releaseStorage(page);
  await expect(sheet).toBeHidden();
  await gearRow(page, 'Pot 1').click();
  await expect(heading('Pot 1')).toBeVisible();
  await expect(label).toHaveValue('red float');

  await holdStorage(page);
  await deleteDrop.click();
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await gearRow(page, 'Pot 2').click();
  await expect(heading('Pot 2')).toBeVisible();
  await expect(save).not.toHaveAttribute('aria-disabled', 'true');
  await label.fill('blue buoy');
  await releaseStorage(page);

  await expect(toastOf(page)).toContainText('Pot 1 deleted');
  await expect(heading('Pot 2')).toBeVisible();
  await expect(label).toHaveValue('blue buoy');
});
