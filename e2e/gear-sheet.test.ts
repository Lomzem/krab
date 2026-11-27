import type { Locator, Page } from '@playwright/test';
import { animationsSettled } from './settled';
import {
  expect,
  holdStorage,
  releaseStorage,
  storedBaits,
  storedDrops,
  test,
  toastOf
} from './fixtures';
import {
  expectAccessibleInBothThemes,
  expectFocusTrapped
} from './accessibility';
import { failStorage, injectStorageFaults } from './storage-faults';
import { deliverFix, holdFixes, letFixAge } from './held-geolocation';
import { MADE_UP_SEA } from '../playwright.config';

const gearRow = (page: Page, name: string | RegExp) =>
  page.getByRole('main').getByRole('button').filter({ hasText: name });

const springing = (element: Element) =>
  element
    .getAnimations()
    .some(
      (animation) =>
        animation.timeline === document.timeline &&
        animation.playState === 'running'
    );

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
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page
    .getByRole('radiogroup', { name: 'Gear to drop' })
    .getByText('Net', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Drop net' }).click();
  await expect(toastOf(page)).toContainText('Net 1 dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();

  const pot1 = gearRow(page, 'Pot 1');
  await pot1.click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  expect(await focusIsInside(sheet)).toBe(true);
  await expect(depth).toHaveAttribute('inputmode', 'decimal');
  await expectAccessibleInBothThemes(page);

  await expectFocusTrapped(page, sheet);

  await label.fill('red float');
  await page.keyboard.press('Escape');
  const unsaved = page.getByRole('alertdialog', { name: 'Unsaved changes' });
  await expect(
    unsaved.getByRole('button', { name: 'Keep editing' })
  ).toBeFocused();
  await unsaved.getByRole('button', { name: 'Discard changes' }).click();
  await expect(sheet).toBeHidden();
  await expect(pot1).toBeFocused();
  await pot1.click();
  await expect(label).toHaveValue('');

  await label.fill('red float');
  await depth.fill('-3');
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await expect(depth).toHaveAccessibleDescription('Enter 0 or more feet');
  await depth.press('Tab');
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(depth).toBeFocused();
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await expect(depth).not.toHaveAccessibleDescription('');
  await depth.fill('4');
  await expect(depth).not.toHaveAttribute('aria-invalid');
  await expect(depth).toHaveAccessibleDescription('');
  await depth.fill('4 ft');
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await depth.fill('');
  await expect(depth).not.toHaveAttribute('aria-invalid');
  await expect(depth).toHaveAccessibleDescription('');
  await depth.fill('12.5');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();

  await gearRow(page, 'Net 1').click();
  await sheet
    .getByRole('radiogroup', { name: 'Gear' })
    .getByText('Pot', { exact: true })
    .click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(gearRow(page, 'Pot 2')).toBeVisible();

  await page.reload();
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await pot1.click();
  await expect(label).toHaveValue('red float');
  await expect(depth).toHaveValue('12.5');

  await sheet.getByRole('button', { name: 'Delete drop' }).dblclick();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Gear', level: 1 })
  ).toBeFocused();
  await expect(toastOf(page)).toContainText('Pot 1 deleted');
  await expect(pot1).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 restored');
  await pot1.click();
  await expect(label).toHaveValue('red float');
});

test('a gear sheet with unsaved changes ignores a backdrop tap and asks before Close, Escape, Back, Show on map, Delete drop or Undo collect discard them', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const label = sheet.getByLabel('Label');
  const unsaved = page.getByRole('alertdialog', { name: 'Unsaved changes' });
  const keepEditing = unsaved.getByRole('button', { name: 'Keep editing' });
  const discard = unsaved.getByRole('button', { name: 'Discard changes' });
  const save = sheet.getByRole('button', { name: 'Save' });
  const tapBackdrop = () => page.mouse.click(200, 12);
  const settle = () =>
    page.evaluate(async () => {
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  for (const name of ['Pot 1', 'Pot 2']) {
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(`${name} dropped`);
  }
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  const pot1 = gearRow(page, 'Pot 1');

  await pot1.click();
  await tapBackdrop();
  await expect(sheet).toBeHidden();
  await expect(pot1).toBeFocused();
  await pot1.click();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(pot1).toBeFocused();

  await pot1.click();
  await label.fill('red float');
  await tapBackdrop();
  await settle();
  await expect(sheet).toBeVisible();
  await expect(unsaved).toBeHidden();
  await expect(label).toHaveValue('red float');

  await label.focus();
  await page.keyboard.press('Escape');
  await expect(keepEditing).toBeFocused();
  await expect(unsaved).toHaveAccessibleName('Unsaved changes');
  await expectFocusTrapped(page, unsaved);
  await tapBackdrop();
  await settle();
  await expect(unsaved).toBeVisible();
  await keepEditing.click();
  await expect(unsaved).toBeHidden();
  await expect(label).toBeFocused();
  await expect(label).toHaveValue('red float');

  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(keepEditing).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(unsaved).toBeHidden();
  await expect(save).toBeVisible();

  await page.goBack();
  await expect(keepEditing).toBeFocused();
  await page.goBack();
  await expect(unsaved).toBeHidden();
  await expect(label).toHaveValue('red float');

  await holdStorage(page);
  await save.click();
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await releaseStorage(page);
  await expect(pot1).toContainText('red float');
  await pot1.click();
  await expect(label).toHaveValue('red float');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  const deleteDrop = sheet.getByRole('button', { name: 'Delete drop' });
  const undoCollect = sheet.getByRole('button', { name: 'Undo collect' });
  await gearRow(page, 'Pot 2').click();
  await label.fill('spare');
  await holdStorage(page);
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await settle();
  await expect(sheet).toBeVisible();
  await expect(unsaved).toBeHidden();
  await releaseStorage(page);
  await expect(keepEditing).toBeFocused();
  await keepEditing.click();

  await undoCollect.click();
  await expect(keepEditing).toBeFocused();
  await keepEditing.click();
  await expect(undoCollect).toBeFocused();
  await expect(sheet.getByRole('heading', { name: 'Catch' })).toBeVisible();
  await undoCollect.click();
  await discard.click();
  await expect(
    sheet.getByRole('button', { name: 'Collect', exact: true })
  ).toBeFocused();
  await expect(label).toHaveValue('');

  await label.fill('spare');
  await deleteDrop.click();
  await expect(keepEditing).toBeFocused();
  await keepEditing.click();
  await expect(label).toHaveValue('spare');
  await expect(gearRow(page, 'Pot 2')).toHaveCount(1);
  await deleteDrop.click();
  await discard.click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Pot 2 deleted');
  await expect(
    toastOf(page).getByRole('button', { name: 'Undo' })
  ).toBeVisible();

  await pot1.click();

  await label.fill('blue float');
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  await expect(keepEditing).toBeFocused();
  await discard.click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('main').getByRole('button', { name: /^Pot 1/ })
  ).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

test('on a 640 by 320 screen, the second press of a double press on Show on map over unsaved changes leaves Discard changes asking, while a later press there discards and opens Map', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const label = sheet.getByLabel('Label');
  const showOnMap = sheet.getByRole('button', { name: 'Show on map' });
  const unsaved = page.getByRole('alertdialog', { name: 'Unsaved changes' });
  const discard = unsaved.getByRole('button', { name: 'Discard changes' });
  const mapTab = page
    .getByRole('tablist', { name: 'Screens' })
    .getByRole('tab', { name: 'Map', exact: true });
  const center = async (control: Locator) => {
    const box = await control.boundingBox();
    expect(box, 'the control has a box').not.toBeNull();
    return {
      x: (box?.x ?? 0) + (box?.width ?? 0) / 2,
      y: (box?.y ?? 0) + (box?.height ?? 0) / 2
    };
  };
  const showOnMapUnder = async (y: number) => {
    await showOnMap.evaluate((button, target) => {
      let area = button.parentElement;
      while (area && area.scrollHeight <= area.clientHeight)
        area = area.parentElement;
      const box = button.getBoundingClientRect();
      if (area) area.scrollTop += box.top + box.height / 2 - target;
    }, y);
    await animationsSettled(page);
  };
  const editPot1 = async () => {
    await gearRow(page, 'Pot 1').click();
    await label.fill('blue float');
  };

  await page.setViewportSize({ width: 640, height: 320 });
  await page.clock.install({ time: new Date('2031-03-04T05:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.clock.pauseAt(new Date('2031-03-04T06:00:00Z'));
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();

  await editPot1();
  await showOnMap.focus();
  await page.keyboard.press('Enter');
  const point = await center(discard);
  await page.keyboard.press('Escape');
  await expect(unsaved).toBeHidden();

  for (const input of ['touch', 'mouse'] as const) {
    await showOnMapUnder(point.y);
    const shown = await showOnMap.boundingBox();
    expect(shown && point.y > shown.y && point.y < shown.y + shown.height).toBe(
      true
    );
    await press(page, input, point.x, point.y, 1);
    await expect(discard).toBeVisible();
    await press(page, input, point.x, point.y, 2);
    await page.clock.runFor(0);
    await expect(discard).toBeVisible();
    await expect(label).toHaveValue('blue float');
    await expect(mapTab).toHaveAttribute('aria-selected', 'false');

    await page.clock.runFor(500);
    await press(page, input, point.x, point.y, 1);
    await expect(unsaved).toBeHidden();
    await expect(sheet).toBeHidden();
    await expect(mapTab).toHaveAttribute('aria-selected', 'true');
    await page.getByRole('tab', { name: 'Gear', exact: true }).click();
    await expect(gearRow(page, 'Pot 1')).not.toContainText('blue float');
    if (input === 'touch') await editPot1();
  }
});

test('a swipe down closes a gear sheet with no changes, and springs back with no ask while it has unsaved changes', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const label = sheet.getByLabel('Label');
  const host = page.locator('[data-slot="dialog-viewport"]');
  const atRest = () => expect.poll(() => sheet.evaluate(springing)).toBe(false);
  const sheetTop = () =>
    sheet.evaluate((element) =>
      Math.round(element.getBoundingClientRect().top)
    );
  const swipeDown = async () => {
    await atRest();
    return host.evaluate(async (element) => {
      const content = element.querySelector('[role="dialog"]');
      const tops: number[] = [];
      element.scrollTo({ top: 0 });
      for (let frame = 0; frame < 120 && content?.isConnected; frame++) {
        await new Promise(requestAnimationFrame);
        tops.push(Math.round(content.getBoundingClientRect().top));
      }
      return tops;
    });
  };

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  const pot1 = gearRow(page, 'Pot 1');

  await pot1.click();
  await swipeDown();
  await expect(sheet).toBeHidden();
  await expect(pot1).toBeFocused();

  await pot1.click();
  await label.fill('red float');
  await atRest();
  const top = await sheetTop();
  const tops = await swipeDown();
  await atRest();
  await expect(sheet).toBeVisible();
  expect(await sheetTop()).toBe(top);
  const lowest = Math.max(...tops);
  expect(lowest).toBeGreaterThan(top);
  const springBack = tops.slice(tops.indexOf(lowest));
  expect(springBack.some((at) => at > top && at < lowest)).toBe(true);
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(label).toHaveValue('red float');

  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await expect(pot1).toContainText('red float');
  await page.goBack();
  await expect(page).toHaveURL('about:blank');
});

const followsMouseDrag = async ({ page }: { page: Page }) => {
  const sheet = page.getByRole('dialog');
  const sheetTop = () =>
    sheet.evaluate((element) =>
      Math.round(element.getBoundingClientRect().top)
    );

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await expect(sheet).toHaveAttribute('data-driver', 'pointer');
  await expect.poll(() => sheet.evaluate(springing)).toBe(false);
  const top = await sheetTop();
  const box = await sheet.getByRole('heading', { name: 'Pot 1' }).boundingBox();
  expect(box).not.toBeNull();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;

  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 60, { steps: 12 });
  await expect.poll(sheetTop).toBeGreaterThan(top + 30);
  await page.mouse.move(x, y, { steps: 12 });
  await page.mouse.up();

  await expect.poll(sheetTop).toBe(top);
  await expect(sheet).toBeVisible();
};

test.describe('with a mouse and no touch', () => {
  test.use({ hasTouch: false });

  test(
    'under reduced motion a gear sheet follows a mouse drag down, then rests where it was',
    followsMouseDrag
  );
});

test('when Delete drop over unsaved changes fails to store, the sheet stays open with focus back on Delete drop', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const deleteDrop = sheet.getByRole('button', { name: 'Delete drop' });

  await injectStorageFaults(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await sheet.getByLabel('Label').fill('red float');
  await failStorage(page, 'writes');

  await deleteDrop.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Discard changes' })
    .click();

  await expect(toastOf(page)).toContainText("Couldn't delete the drop");
  await expect(sheet).toBeVisible();
  await expect(deleteDrop).toBeFocused();
  expect(await storedDrops(page)).toBe(1);
});

test('deleting a drop right after closing another gear sheet returns focus to the Gear heading, not to the other gear', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();

  await gearRow(page, 'Pot 2').click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(gearRow(page, 'Pot 2')).toBeFocused();

  await gearRow(page, 'Pot 1').click();
  await sheet.getByRole('button', { name: 'Delete drop' }).dblclick();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Pot 1 deleted');
  await expect(
    page.getByRole('heading', { name: 'Gear', level: 1 })
  ).toBeFocused();
});

test('while Drop again for one gear waits for a position, closing another gear sheet returns focus to its row', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const paused = new Date('2031-03-04T06:00:00Z');

  await holdFixes(page);
  await letFixAge(page);
  await page.clock.install({ time: new Date('2031-03-04T05:00:00Z') });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await page.clock.pauseAt(paused);
  await deliverFix(page, MADE_UP_SEA, paused);
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();

  await gearRow(page, 'Pot 1').click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await page.clock.runFor(5001);
  await sheet.getByRole('button', { name: 'Drop pot again here' }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole('heading', { name: 'Finding drop position' })
  ).toBeFocused();

  await gearRow(page, 'Pot 2').click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(gearRow(page, 'Pot 2')).toBeFocused();
});

test('deleting a drop already deleted in another tab closes the sheet without an error and drops its row', async ({
  page,
  context
}) => {
  const sheet = page.getByRole('dialog');

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  for (const name of ['Pot 1', 'Pot 2']) {
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(`${name} dropped`);
  }
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();

  const other = await context.newPage();
  const otherSheet = other.getByRole('dialog');
  await other.goto('/');
  await other.getByRole('tab', { name: 'Gear', exact: true }).click();
  await gearRow(other, 'Pot 1').click();
  await otherSheet.getByRole('button', { name: 'Delete drop' }).dblclick();
  await expect(toastOf(other)).toContainText('Pot 1 deleted');
  await other.close();

  await sheet.getByRole('button', { name: 'Delete drop' }).dblclick();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).not.toContainText("Couldn't");
  await expect(gearRow(page, 'Pot 1')).toHaveCount(0);
  await expect(gearRow(page, 'Pot 2')).toBeVisible();
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
  await expect(page.getByText('Finding position')).toBeHidden();
  for (const name of ['Pot 1', 'Pot 2']) {
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(`${name} dropped`);
  }
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();

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

type LastWrite = { lastWrite?: IDBTransaction };

const recordWrites = (page: Page) =>
  page.addInitScript(() => {
    const database = IDBDatabase.prototype;
    const begin = Reflect.get(database, 'transaction') as (
      this: IDBDatabase,
      ...args: unknown[]
    ) => IDBTransaction;
    Reflect.set(
      database,
      'transaction',
      function (this: IDBDatabase, ...args: unknown[]) {
        const tx = Reflect.apply(begin, this, args);
        if (tx.mode === 'readwrite') (window as LastWrite).lastWrite = tx;
        return tx;
      }
    );
  });

test('a Save that fails after Escape closed its sheet says so in a message', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const save = sheet.getByRole('button', { name: 'Save' });

  await recordWrites(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();

  await gearRow(page, 'Pot 1').click();
  await sheet.getByLabel('Label').fill('red float');
  await holdStorage(page);
  await save.click();
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.evaluate(() => {
    (window as LastWrite).lastWrite?.abort();
  });
  await releaseStorage(page);

  await expect(toastOf(page)).toContainText("Couldn't save Pot 1");
});

test('a Save that fails after its sheet closed says so even while another sheet is saving', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const save = sheet.getByRole('button', { name: 'Save' });

  await recordWrites(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();

  await gearRow(page, 'Pot 1').click();
  await sheet.getByLabel('Label').fill('red float');
  await holdStorage(page);
  await save.click();
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await page.evaluate(() => {
    const writes = window as LastWrite & { firstWrite?: IDBTransaction };
    writes.firstWrite = writes.lastWrite;
  });
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await gearRow(page, 'Pot 2').click();
  await sheet.getByLabel('Label').fill('blue buoy');
  await save.click();
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await page.evaluate(() => {
    (window as { firstWrite?: IDBTransaction }).firstWrite?.abort();
  });
  await releaseStorage(page);

  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText("Couldn't save Pot 1");
});

test('on a 320 by 640 screen, tabbing from corrected Depth through Label and Bait after a refused Save shows all of Notes clear of the footer, and multiline notes save and reload intact', async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const sheet = page.getByRole('dialog');
  const depth = sheet.getByLabel('Depth');
  const notes = sheet.getByLabel('Notes', { exact: true });
  const written = 'First line.\nSecond line.\nThird line.';

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await sheet
    .getByLabel('Label')
    .fill(
      'Fictional northern float beside the long outer channel marker with orange rope'
    );
  await sheet.getByRole('button', { name: 'Add bait' }).click();
  await sheet.getByLabel('Find or add bait').fill('Fictional bait');
  await sheet.getByRole('option', { name: 'Add Fictional bait' }).click();
  await expect(
    sheet.getByRole('radio', { name: 'Fictional bait' })
  ).toBeChecked();
  await depth.fill('-2');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(depth).toBeFocused();
  await depth.fill('17.5');
  for (const field of [
    sheet.getByLabel('Label'),
    sheet.getByRole('radio', { name: 'Fictional bait' }),
    sheet.getByRole('button', { name: 'Other bait' }),
    notes
  ]) {
    await page.keyboard.press('Tab');
    await expect(field).toBeFocused();
  }

  const outsideBody = () =>
    notes.evaluate((field) => {
      const body = field.closest('[data-slot="dialog-content"] > div');
      if (!body) return 'no body';
      const shown = body.getBoundingClientRect();
      const box = field.getBoundingClientRect();
      return box.top >= shown.top && box.bottom <= shown.bottom
        ? null
        : `Notes ${String(box.top)}..${String(box.bottom)} in body ${String(shown.top)}..${String(shown.bottom)}`;
    });
  await expect.poll(outsideBody).toBeNull();

  await notes.fill(written);
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await page.reload();
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await expect(notes).toHaveValue(written);
});

for (const colorScheme of ['light', 'dark'] as const) {
  test(`on a 320 by 640 screen in ${colorScheme} mode, gear opened after scrolling another gear's sheet shows Collect at the top, from the Gear list and from a map group`, async ({
    page
  }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.emulateMedia({ colorScheme });
    const sheet = page.getByRole('dialog', { name: /^Pot \d$/ });
    const collect = sheet.getByRole('button', { name: 'Collect', exact: true });
    const collectHidden = async () => {
      await animationsSettled(page);
      return collect.evaluate((button) => {
        const body = button.closest('[data-slot="dialog-content"] > div');
        if (!body) return 'no body';
        const shown = body.getBoundingClientRect();
        const box = button.getBoundingClientRect();
        const centre = document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2
        );
        return box.top >= shown.top &&
          box.bottom <= shown.bottom &&
          button.contains(centre)
          ? null
          : `Collect ${String(box.top)}..${String(box.bottom)} in body ${String(shown.top)}..${String(shown.bottom)}`;
      });
    };

    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();
    await expect(page.getByText('Finding position')).toBeHidden();
    for (const name of ['Pot 1', 'Pot 2']) {
      await page.getByRole('button', { name: 'Drop pot' }).click();
      await expect(toastOf(page)).toContainText(`${name} dropped`);
    }
    await page.getByRole('tab', { name: 'Gear', exact: true }).click();

    await gearRow(page, 'Pot 2').click();
    await sheet
      .getByLabel('Notes', { exact: true })
      .fill('Fictional note about the outer float');
    await sheet.getByRole('button', { name: 'Close' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Discard changes' })
      .click();
    await expect(sheet).toBeHidden();
    await gearRow(page, 'Pot 1').click();
    await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
    expect(await collectHidden()).toBeNull();
    expect(await focusIsInside(sheet)).toBe(true);

    await collect.click();
    await expect(sheet.getByRole('heading', { name: 'Catch' })).toBeFocused();
    await sheet
      .getByRole('button', { name: /^One more / })
      .last()
      .click();
    await page.keyboard.press('Escape');
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Discard changes' })
      .click();
    await expect(sheet).toBeHidden();

    await page.getByRole('tab', { name: 'Map', exact: true }).click();
    await page
      .getByRole('region', { name: 'Map', exact: true })
      .getByRole('button', { name: /\+1 more/ })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /^Pot 2/ })
      .click();
    await expect(sheet.getByRole('heading', { name: 'Pot 2' })).toBeVisible();
    expect(await collectHidden()).toBeNull();
    await expect(sheet.getByLabel('Notes', { exact: true })).toHaveValue('');
  });
}

test('with the page zoomed up to 200% on 320 and 393 wide screens in both themes, the drop bar fits the width with whole, tappable Pot, Net and Drop controls of at least 44 px, and a zoomed Drop net stores one net', async ({
  page
}) => {
  const bar = page.getByRole('region', { name: 'Drop gear' });
  const kinds = bar.getByRole('radiogroup', { name: 'Gear to drop' });
  const dropButton = bar.getByRole('button', { name: /^Drop (pot|net)$/ });
  const zoomTo = (zoom: number) =>
    page.evaluate((value) => {
      document.documentElement.style.zoom = String(value);
    }, zoom);
  const misfits = (zoom: number) =>
    page.evaluate((scale) => {
      const width = document.documentElement.clientWidth;
      const found: string[] = [];
      if (document.documentElement.scrollWidth > width)
        found.push(`page ${String(document.documentElement.scrollWidth)} wide`);
      const bar = document.querySelector('[aria-label="Drop gear"]');
      const controls = [
        ...(bar?.querySelectorAll('label, button') ?? [])
      ] as HTMLElement[];
      for (const control of controls) {
        const name = control.textContent.trim();
        const box = control.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(control);
        const ink = range.getBoundingClientRect();
        if (box.left < 0 || box.right > width)
          found.push(`${name} ${String(box.left)}..${String(box.right)}`);
        if (ink.left < box.left || ink.right > box.right)
          found.push(`${name} content spills its box`);
        if (box.height / scale < 43.5 || box.width / scale < 43.5)
          found.push(`${name} smaller than 44 px`);
      }
      return found;
    }, zoom);

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  for (const [width, height] of [
    [320, 640],
    [393, 852]
  ] as const) {
    await page.setViewportSize({ width, height });
    await kinds.getByText('Pot', { exact: true }).click();
    await expect(dropButton).toHaveAccessibleName('Drop pot');
    const group = await kinds.boundingBox();
    const net = await kinds.getByText('Net', { exact: true }).boundingBox();
    expect(group).not.toBeNull();
    expect(net).not.toBeNull();
    expect((net?.y ?? 0) + (net?.height ?? 0)).toBeGreaterThanOrEqual(
      (group?.y ?? 0) + (group?.height ?? 0) - 5
    );
    await page.touchscreen.tap(
      (net?.x ?? 0) + (net?.width ?? 0) / 2,
      (net?.y ?? 0) + (net?.height ?? 0) - 6
    );
    await expect(dropButton).toHaveAccessibleName('Drop net');
  }
  await kinds.getByText('Pot', { exact: true }).click();
  const steps = [];
  for (const width of [320, 393])
    for (const colorScheme of ['light', 'dark'] as const)
      for (const zoom of [1, 1.25, 1.5, 1.75, 2])
        steps.push({ width, colorScheme, zoom });
  for (const { width, colorScheme, zoom } of steps) {
    await page.setViewportSize({ width, height: width === 320 ? 640 : 852 });
    await page.emulateMedia({ colorScheme });
    await zoomTo(zoom);
    await expect(kinds.getByText('Pot', { exact: true })).toBeVisible();
    expect(
      await misfits(zoom),
      `${String(width)} ${colorScheme} at ${String(zoom * 100)}%`
    ).toEqual([]);
    for (const control of [
      kinds.getByText('Pot', { exact: true }),
      kinds.getByText('Net', { exact: true }),
      dropButton
    ])
      await control.click({ trial: true });
  }

  await page.setViewportSize({ width: 320, height: 640 });
  await kinds.getByText('Net', { exact: true }).click();
  await expect(dropButton).toHaveAccessibleName('Drop net');
  await dropButton.click();
  await expect(toastOf(page)).toContainText('Net 1 dropped');
  await expect(dropButton).toHaveAccessibleName('Drop net');
  await page.reload();
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await expect(gearRow(page, 'Net 1')).toHaveCount(1);
  await expect(gearRow(page, /Pot \d/)).toHaveCount(0);
});

type Input = 'mouse' | 'touch';

type Reached = Window & { reached?: number };

function countClicksBeneath() {
  const counted = window as Reached;
  counted.reached = 0;
  document.body.addEventListener('click', ({ target }) => {
    if (
      target instanceof Element &&
      target.closest(
        '[data-slot="dialog-viewport"], [role="dialog"], [role="alertdialog"]'
      )
    )
      return;
    counted.reached = (counted.reached ?? 0) + 1;
  });
}

function clicksBeneath() {
  return (window as Reached).reached ?? 0;
}

const press = async (
  page: Page,
  input: Input,
  x: number,
  y: number,
  count: 1 | 2
) => {
  if (input === 'touch') {
    await page.touchscreen.tap(x, y);
    return;
  }
  await page.mouse.move(x, y);
  await page.mouse.down({ clickCount: count });
  await page.mouse.up({ clickCount: count });
};

const sheetShownAfterTimers = async (page: Page) => {
  await page.clock.runFor(0);
  return page.getByRole('dialog').isVisible();
};

const pressToClose = async (page: Page, input: Input, x: number, y: number) => {
  await animationsSettled(page);
  await press(page, input, x, y, 1);
  await expect.poll(() => sheetShownAfterTimers(page)).toBe(false);
};

const pressToCloseLate = async (
  page: Page,
  input: Input,
  x: number,
  y: number,
  ms: number
) => {
  await holdStorage(page);
  await animationsSettled(page);
  await press(page, input, x, y, 1);
  await expect(
    page.getByRole('dialog').getByRole('button', { name: 'Save' })
  ).toHaveAttribute('aria-disabled', 'true');
  await page.clock.runFor(ms);
  await releaseStorage(page);
  await expect.poll(() => sheetShownAfterTimers(page)).toBe(false);
};

const pressTwice = async (page: Page, target: Locator, input: Input) => {
  await animationsSettled(page);
  const box = await target.boundingBox();
  expect(box, 'the control has a box').not.toBeNull();
  const x = (box?.x ?? 0) + (box?.width ?? 0) / 2;
  const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;
  await pressToClose(page, input, x, y);
  await press(page, input, x, y, 2);
  return { x, y };
};

const droppedAfterTimers = async (page: Page, name: string) => {
  await page.clock.runFor(0);
  return toastOf(page)
    .filter({ hasText: `${name} dropped` })
    .count();
};

const dropPausedPot = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect.poll(() => droppedAfterTimers(page, name)).toBe(1);
};

test.describe('with the clock paused', () => {
  test.use({ permissions: [] });

  for (const [width, height] of [
    [393, 852],
    [320, 640]
  ] as const)
    for (const colorScheme of ['light', 'dark'] as const)
      test(`on a ${String(width)} by ${String(height)} screen in ${colorScheme} mode, the second press of a double press that closes a sheet reaches nothing beneath it: Delete removes only its drop with Undo and leaves the tab and focus, Close and Save leave the sheet shut, while Enter, a tap elsewhere, a single click there at once, a tap there after a double tap's time and a repeated click there after a double click's time all work, and a second click held past a double click's time still reaches nothing beneath it, and when a Save's storage finishes late a press there is held back only for what is left of that time since the Save press, so it works at once after a long wait`, async ({
        page
      }) => {
        const sheet = page.getByRole('dialog');
        const tab = (name: string) =>
          page
            .getByRole('tablist', { name: 'Screens' })
            .getByRole('tab', { name, exact: true });
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme });
        await page.clock.install({ time: new Date('2031-03-04T05:00:00Z') });
        await page.goto('/');
        await page.evaluate(countClicksBeneath);
        const reached = () => page.evaluate(clicksBeneath);
        await page.getByRole('button', { name: 'Turn on location' }).click();
        await expect(
          page.getByRole('button', { name: 'Drop pot' })
        ).toBeVisible();
        await page.clock.pauseAt(new Date('2031-03-04T06:00:00Z'));
        await dropPausedPot(page, 'Pot 1');
        await dropPausedPot(page, 'Pot 2');
        await tab('Gear').click();

        await gearRow(page, 'Pot 1').click();
        let mark = await reached();
        await pressTwice(
          page,
          sheet.getByRole('button', { name: 'Delete drop' }),
          'mouse'
        );
        await expect(toastOf(page)).toContainText('Pot 1 deleted');
        await expect(tab('Gear')).toHaveAttribute('aria-selected', 'true');
        await expect(
          page.getByRole('heading', { name: 'Gear', level: 1 })
        ).toBeFocused();
        await expect(gearRow(page, 'Pot 1')).toHaveCount(0);
        expect(await storedDrops(page)).toBe(1);
        expect(await reached()).toBe(mark);

        await gearRow(page, 'Pot 2').focus();
        await page.keyboard.press('Enter');
        await expect(
          sheet.getByRole('heading', { name: 'Pot 2' })
        ).toBeVisible();
        mark = await reached();
        await pressTwice(
          page,
          sheet.getByRole('button', { name: 'Close' }),
          'touch'
        );
        await expect(sheet).toBeHidden();
        await expect(gearRow(page, 'Pot 2')).toBeFocused();
        expect(await reached()).toBe(mark);

        await toastOf(page).getByRole('button', { name: 'Undo' }).tap();
        await expect(toastOf(page)).toContainText('Pot 1 restored');
        await expect(gearRow(page, 'Pot 1')).toHaveCount(1);
        expect(await storedDrops(page)).toBe(2);

        await gearRow(page, 'Pot 2').click();
        await sheet.getByLabel('Label').fill('blue buoy');
        mark = await reached();
        const saved = await pressTwice(
          page,
          sheet.getByRole('button', { name: 'Save' }),
          'touch'
        );
        await expect(sheet).toBeHidden();
        await expect(tab('Gear')).toHaveAttribute('aria-selected', 'true');
        await expect(gearRow(page, 'Pot 2')).toBeFocused();
        await expect(gearRow(page, 'Pot 2')).toContainText('blue buoy');
        expect(await storedDrops(page)).toBe(2);
        expect(await reached()).toBe(mark);

        await page.clock.runFor(350);
        mark = await reached();
        await press(page, 'touch', saved.x, saved.y, 1);
        await expect.poll(reached).toBeGreaterThan(mark);

        await tab('Gear').click();
        await gearRow(page, 'Pot 2').click();
        await pressToClose(page, 'mouse', saved.x, saved.y);
        mark = await reached();
        await press(page, 'mouse', saved.x, saved.y, 1);
        await expect.poll(reached).toBeGreaterThan(mark);

        await tab('Gear').click();
        await gearRow(page, 'Pot 2').click();
        await pressToClose(page, 'mouse', saved.x, saved.y);
        await page.clock.runFor(500);
        mark = await reached();
        await press(page, 'mouse', saved.x, saved.y, 2);
        await expect.poll(reached).toBeGreaterThan(mark);

        await tab('Gear').click();
        await gearRow(page, 'Pot 2').click();
        await pressToClose(page, 'mouse', saved.x, saved.y);
        mark = await reached();
        await page.mouse.down({ clickCount: 2 });
        await page.clock.runFor(500);
        await page.mouse.up({ clickCount: 2 });
        await page.clock.runFor(0);
        await expect(tab('Gear')).toHaveAttribute('aria-selected', 'true');
        expect(await reached()).toBe(mark);
        await expect(gearRow(page, 'Pot 2')).toBeFocused();
        await page.clock.runFor(500);
        mark = await reached();
        await press(page, 'mouse', saved.x, saved.y, 2);
        await expect.poll(reached).toBeGreaterThan(mark);

        const saveLate = async (input: Input, label: string, ms: number) => {
          await tab('Gear').click();
          await gearRow(page, 'Pot 2').click();
          await sheet.getByLabel('Label').fill(label);
          await pressToCloseLate(page, input, saved.x, saved.y, ms);
          await expect(gearRow(page, 'Pot 2')).toContainText(label);
          await expect(gearRow(page, 'Pot 2')).toBeFocused();
          expect(await storedDrops(page)).toBe(2);
        };

        await saveLate('touch', 'late float', 1000);
        mark = await reached();
        await press(page, 'touch', saved.x, saved.y, 1);
        await expect.poll(reached).toBeGreaterThan(mark);

        await saveLate('touch', 'slow float', 200);
        mark = await reached();
        await press(page, 'touch', saved.x, saved.y, 1);
        await page.clock.runFor(0);
        await expect(tab('Gear')).toHaveAttribute('aria-selected', 'true');
        expect(await reached()).toBe(mark);
        await expect(gearRow(page, 'Pot 2')).toBeFocused();
        await page.clock.runFor(150);
        mark = await reached();
        await press(page, 'touch', saved.x, saved.y, 1);
        await expect.poll(reached).toBeGreaterThan(mark);

        await saveLate('mouse', 'slow buoy', 300);
        mark = await reached();
        await press(page, 'mouse', saved.x, saved.y, 2);
        await page.clock.runFor(0);
        await expect(tab('Gear')).toHaveAttribute('aria-selected', 'true');
        expect(await reached()).toBe(mark);
        await expect(gearRow(page, 'Pot 2')).toBeFocused();
        await page.clock.runFor(200);
        mark = await reached();
        await press(page, 'mouse', saved.x, saved.y, 2);
        await expect.poll(reached).toBeGreaterThan(mark);
      });
});

const CHROME_RING = {
  light: 'rgb(29, 78, 216)',
  dark: 'rgb(127, 176, 255)'
} as const;

const keyboardRing = async (page: Page, control: Locator) => {
  await control.focus();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Tab');
  await expect(control).toBeFocused();
  return control.evaluate((focused) => {
    const style = getComputedStyle(focused);
    return {
      width: style.outlineWidth,
      offset: style.outlineOffset,
      color: style.outlineColor
    };
  });
};

const activeOptionText = (search: Locator) =>
  search.evaluate((input) => {
    const id = input.getAttribute('aria-activedescendant');
    const target = id ? document.getElementById(id) : null;
    return target?.getAttribute('role') === 'option'
      ? target.textContent.trim()
      : null;
  });

const controlsListbox = (search: Locator) =>
  search.evaluate((input) => {
    const id = input.getAttribute('aria-controls');
    const target = id ? document.getElementById(id) : null;
    return target?.getAttribute('role') === 'listbox';
  });

test('an open bait search with typed text keeps Save from closing and asks before Escape discards it', async ({
  page
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const sheet = page.getByRole('dialog');
  const search = sheet.getByLabel('Find or add bait');
  const other = sheet.getByRole('button', { name: 'Other bait' });
  const clear = sheet.getByRole('button', { name: 'Clear bait' });
  const notes = sheet.getByLabel('Notes', { exact: true });
  const save = sheet.getByRole('button', { name: 'Save' });
  const keepEditing = page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Keep editing' });
  const discard = page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Discard changes' });
  const pot1 = gearRow(page, 'Pot 1');
  const pot2 = gearRow(page, 'Pot 2');
  const addBait = async (name: string) => {
    await sheet.getByRole('button', { name: /^(Add|Other) bait$/ }).click();
    await search.fill(name);
    await sheet.getByRole('option', { name: `Add ${name}` }).click();
    await save.click();
    await expect(sheet).toBeHidden();
  };

  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  for (const name of ['Pot 1', 'Pot 2']) {
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText(`${name} dropped`);
  }
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await pot1.click();
  await addBait('Fish heads');
  await pot2.click();
  await addBait('Squid');

  await pot1.click();
  await other.click();
  await expect(other).toHaveAttribute('aria-expanded', 'true');
  await expect(other).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(pot1).toBeFocused();

  await pot1.click();
  await other.click();
  await expect(other).toBeFocused();
  const listBox = await sheet
    .getByRole('listbox', { name: 'Bait' })
    .boundingBox();
  const inputBox = await search.boundingBox();
  expect(listBox && inputBox).toBeTruthy();
  expect((listBox?.y ?? 0) + (listBox?.height ?? 0)).toBeLessThanOrEqual(
    inputBox?.y ?? 0
  );
  expect(await controlsListbox(search)).toBe(true);

  await page.keyboard.press('Tab');
  await expect(clear).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(search).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(notes).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(search).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(clear).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(other).toBeFocused();

  await expectAccessibleInBothThemes(page);

  await page.mouse.move(0, 0);
  await search.fill('fish');
  await expect(sheet.getByRole('listbox', { name: 'Bait' })).toBeVisible();
  expect(await controlsListbox(search)).toBe(true);
  await expect.poll(() => activeOptionText(search)).toBe('Add fish');
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => activeOptionText(search)).toBe('Fish heads');
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => activeOptionText(search)).toBe('Add fish');
  await expectAccessibleInBothThemes(page);

  await page.keyboard.press('Escape');
  await expect(keepEditing).toBeFocused();
  await keepEditing.click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('fish');

  await save.click();
  await expect(sheet).toBeVisible();
  await expect(search).toBeFocused();
  await expect(search).toHaveAttribute('aria-invalid', 'true');
  await expect(search).toHaveAccessibleDescription('Choose or add bait');

  await page.keyboard.press('Escape');
  await expect(keepEditing).toBeFocused();
  await keepEditing.click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue('fish');

  await page.keyboard.press('Escape');
  await expect(keepEditing).toBeFocused();
  await discard.click();
  await expect(sheet).toBeHidden();
  await expect(pot1).toBeFocused();
  expect(await storedBaits(page)).toEqual(['Fish heads', 'Squid']);
});

test('Close, Save, Depth, a kind choice and the bait controls show one 3 px focus ring 3 px out in both themes', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await page.getByRole('tab', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await sheet.getByRole('button', { name: 'Add bait' }).click();
  await sheet.getByLabel('Find or add bait').fill('Fish heads');
  await page.keyboard.press('Enter');
  await expect(sheet.getByRole('radio', { name: 'Fish heads' })).toBeChecked();
  await sheet.getByRole('button', { name: 'Other bait' }).click();
  const controls = [
    sheet.getByRole('button', { name: 'Close' }),
    sheet.getByRole('button', { name: 'Save' }),
    sheet.getByLabel('Depth'),
    sheet.getByRole('radio', { name: 'Pot' }),
    sheet.getByRole('radio', { name: 'Fish heads' }),
    sheet.getByRole('button', { name: 'Other bait' }),
    sheet.getByRole('button', { name: 'Clear bait' }),
    sheet.getByLabel('Find or add bait')
  ];
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    for (const control of controls) {
      expect(await keyboardRing(page, control)).toEqual({
        width: '3px',
        offset: '3px',
        color: CHROME_RING[colorScheme]
      });
    }
  }
});
