import type { Locator, Page } from '@playwright/test';
import {
  expect,
  holdStorage,
  releaseStorage,
  storedDrops,
  test,
  toastOf
} from './fixtures';
import {
  expectAccessibleInBothThemes,
  expectFocusTrapped
} from './accessibility';

const gearRow = (page: Page, name: string | RegExp) =>
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
  await expect(depth).not.toHaveAttribute('aria-invalid');
  await depth.press('Tab');
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await expect(depth).not.toHaveAccessibleDescription('');
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

test('deleting a drop already deleted in another tab closes the sheet without an error and drops its row', async ({
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

test('on a 320 by 640 screen, tabbing from a corrected Depth after a refused Save shows all of Notes clear of the footer, and multiline notes save and reload intact', async ({
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
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await gearRow(page, 'Pot 1').click();
  await sheet
    .getByLabel('Label')
    .fill(
      'Fictional northern float beside the long outer channel marker with orange rope'
    );
  await sheet.getByLabel('Bait').fill('Fictional bait');
  await depth.fill('-2');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(depth).toBeFocused();
  await depth.fill('17.5');
  await page.keyboard.press('Tab');
  await expect(notes).toBeFocused();

  const outsideBody = () =>
    notes.evaluate((field) => {
      const body = field.closest('dialog > div');
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
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
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
    const collectHidden = () =>
      collect.evaluate((button) => {
        const body = button.closest('dialog > div');
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

    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();
    await expect(page.getByText('Position ready')).toBeVisible();
    for (const name of ['Pot 1', 'Pot 2']) {
      await page.getByRole('button', { name: 'Drop pot' }).click();
      await expect(toastOf(page)).toContainText(`${name} dropped`);
    }
    await page.getByRole('button', { name: 'Gear', exact: true }).click();

    await gearRow(page, 'Pot 2').click();
    await sheet
      .getByLabel('Notes', { exact: true })
      .fill('Fictional note about the outer float');
    await sheet.getByRole('button', { name: 'Close' }).click();
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
    await expect(sheet).toBeHidden();

    await page.getByRole('button', { name: 'Map', exact: true }).click();
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
  const kinds = bar.getByRole('group', { name: 'Gear to drop' });
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
  await expect(page.getByText('Position ready')).toBeVisible();
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
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await expect(gearRow(page, 'Net 1')).toHaveCount(1);
  await expect(gearRow(page, /Pot \d/)).toHaveCount(0);
});

type Input = 'mouse' | 'touch';

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
  await press(page, input, x, y, 1);
  await expect.poll(() => sheetShownAfterTimers(page)).toBe(false);
};

const pressTwice = async (page: Page, target: Locator, input: Input) => {
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
      test(`on a ${String(width)} by ${String(height)} screen in ${colorScheme} mode, the second press of a double press that closes a sheet reaches nothing beneath it: Delete removes only its drop with Undo and leaves the tab and focus, Close and Save leave the sheet shut, while Enter, a tap elsewhere, a single click there at once, a tap there after a double tap's time and a repeated click there after a double click's time all work, and a second click held past a double click's time still reaches nothing beneath it`, async ({
        page
      }) => {
        const sheet = page.getByRole('dialog');
        const tab = (name: string) =>
          page
            .getByRole('navigation', { name: 'Screens' })
            .getByRole('button', { name, exact: true });
        await page.setViewportSize({ width, height });
        await page.emulateMedia({ colorScheme });
        await page.clock.install({ time: new Date('2031-03-04T05:00:00Z') });
        await page.goto('/');
        await page.getByRole('button', { name: 'Turn on location' }).click();
        await expect(
          page.getByRole('button', { name: 'Drop pot' })
        ).toBeVisible();
        await page.clock.pauseAt(new Date('2031-03-04T06:00:00Z'));
        await dropPausedPot(page, 'Pot 1');
        await dropPausedPot(page, 'Pot 2');
        await tab('Gear').click();

        await gearRow(page, 'Pot 1').click();
        await pressTwice(
          page,
          sheet.getByRole('button', { name: 'Delete drop' }),
          'mouse'
        );
        await expect(toastOf(page)).toContainText('Pot 1 deleted');
        await expect(tab('Gear')).toHaveAttribute('aria-current', 'page');
        await expect(
          page.getByRole('button', { name: /^Drop (pot|net)$/ })
        ).toBeFocused();
        await expect(gearRow(page, 'Pot 1')).toHaveCount(0);
        expect(await storedDrops(page)).toBe(1);

        await gearRow(page, 'Pot 2').focus();
        await page.keyboard.press('Enter');
        await expect(
          sheet.getByRole('heading', { name: 'Pot 2' })
        ).toBeVisible();
        await pressTwice(
          page,
          sheet.getByRole('button', { name: 'Close' }),
          'touch'
        );
        await expect(sheet).toBeHidden();
        await expect(gearRow(page, 'Pot 2')).toBeFocused();

        await toastOf(page).getByRole('button', { name: 'Undo' }).tap();
        await expect(toastOf(page)).toContainText('Pot 1 restored');
        await expect(gearRow(page, 'Pot 1')).toHaveCount(1);
        expect(await storedDrops(page)).toBe(2);

        await gearRow(page, 'Pot 2').click();
        await sheet.getByLabel('Label').fill('blue buoy');
        const saved = await pressTwice(
          page,
          sheet.getByRole('button', { name: 'Save' }),
          'touch'
        );
        await expect(sheet).toBeHidden();
        await expect(tab('Gear')).toHaveAttribute('aria-current', 'page');
        await expect(gearRow(page, 'Pot 2')).toBeFocused();
        await expect(gearRow(page, 'Pot 2')).toContainText('blue buoy');
        expect(await storedDrops(page)).toBe(2);

        await page.clock.runFor(350);
        await press(page, 'touch', saved.x, saved.y, 1);
        await expect(tab('Map')).toHaveAttribute('aria-current', 'page');

        await tab('Gear').click();
        await gearRow(page, 'Pot 2').click();
        await pressToClose(page, 'mouse', saved.x, saved.y);
        await press(page, 'mouse', saved.x, saved.y, 1);
        await expect(tab('Map')).toHaveAttribute('aria-current', 'page');

        await tab('Gear').click();
        await gearRow(page, 'Pot 2').click();
        await pressToClose(page, 'mouse', saved.x, saved.y);
        await page.clock.runFor(500);
        await press(page, 'mouse', saved.x, saved.y, 2);
        await expect(tab('Map')).toHaveAttribute('aria-current', 'page');

        await tab('Gear').click();
        await gearRow(page, 'Pot 2').click();
        await pressToClose(page, 'mouse', saved.x, saved.y);
        await page.mouse.down({ clickCount: 2 });
        await page.clock.runFor(500);
        await page.mouse.up({ clickCount: 2 });
        await page.clock.runFor(0);
        await expect(tab('Gear')).toHaveAttribute('aria-current', 'page');
        await expect(gearRow(page, 'Pot 2')).toBeFocused();
        await page.clock.runFor(500);
        await press(page, 'mouse', saved.x, saved.y, 2);
        await expect(tab('Map')).toHaveAttribute('aria-current', 'page');
      });
});
