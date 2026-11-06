import type { Locator, Page } from '@playwright/test';
import {
  expect,
  holdStorage,
  releaseStorage,
  storedCollections,
  test,
  toastOf
} from './fixtures';
import { failStorage, injectStorageFaults } from './storage-faults';

const START = new Date('2031-03-04T05:00:00Z');
const PAUSED = new Date('2031-03-04T06:00:00Z');

test.use({ permissions: [] });

const undoOf = (page: Page) =>
  toastOf(page).getByRole('button', { name: 'Undo' });

const dropPot = async (page: Page, name: string) => {
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect
    .poll(
      async () => {
        await page.clock.runFor(0);
        return toastOf(page)
          .filter({ hasText: `${name} dropped` })
          .count();
      },
      { message: `${name} was not saved while the clock was paused` }
    )
    .toBe(1);
  await page.mouse.move(0, 0);
};

const openWithPausedClock = async (page: Page) => {
  await page.clock.install({ time: START });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByRole('button', { name: 'Drop pot' })).toBeVisible();
  await page.clock.pauseAt(PAUSED);
};

const touchesAt = async (target: Locator) => {
  const box = await target.boundingBox();
  expect(box, 'toast has a touchable area').not.toBeNull();
  const point = {
    identifier: 0,
    clientX: (box?.x ?? 0) + (box?.width ?? 0) / 2,
    clientY: (box?.y ?? 0) + (box?.height ?? 0) / 2
  };
  return { touches: [point], targetTouches: [point], changedTouches: [point] };
};

const expectExpiresAfter = async (page: Page, remaining: number) => {
  await page.clock.runFor(remaining - 1);
  await expect(
    undoOf(page),
    'Undo expired early; use the shared UndoToast/Countdown lifetime.'
  ).toBeVisible();
  await page.clock.runFor(1);
  await expect(
    toastOf(page),
    'Undo remained after 8 seconds of unheld time; use the shared UndoToast/Countdown lifetime.'
  ).toBeHidden();
};

test('an unheld Undo toast lasts 8 seconds and Undo within it removes only that drop', async ({
  page
}) => {
  const gearTab = page.getByRole('button', { name: 'Gear', exact: true });
  const gearRow = (name: string) =>
    page.getByRole('main').getByRole('listitem').filter({ hasText: name });

  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await expectExpiresAfter(page, 8000);

  await dropPot(page, 'Pot 2');
  await page.clock.runFor(7999);
  await undoOf(page).click();
  await expect(toastOf(page)).toContainText('Pot 2 removed');

  await gearTab.click();
  await expect(gearRow('Pot 1')).toBeVisible();
  await expect(gearRow('Pot 2')).toHaveCount(0);

  await page.reload();
  await gearTab.click();
  await expect(gearRow('Pot 1')).toBeVisible();
  await expect(gearRow('Pot 2')).toHaveCount(0);
});

test('focus inside the Undo toast holds it past 8 seconds and keeps the remaining time', async ({
  page
}) => {
  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await page.clock.runFor(3000);

  await undoOf(page).focus();
  await page.clock.runFor(20_000);
  await expect(
    undoOf(page),
    'Undo expired while focused; preserve remaining time through UndoToast/Countdown instead of adding a second timer.'
  ).toBeEnabled();

  await undoOf(page).blur();
  await expectExpiresAfter(page, 5000);
});

test('a touch held on the Undo toast holds it past 8 seconds and keeps the remaining time', async ({
  page
}) => {
  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await page.clock.runFor(2000);

  const touch = await touchesAt(toastOf(page));
  await toastOf(page).dispatchEvent('touchstart', touch);
  await page.clock.runFor(20_000);
  await expect(
    undoOf(page),
    'Undo expired while touched; preserve remaining time through UndoToast/Countdown instead of adding a second timer.'
  ).toBeEnabled();

  await toastOf(page).dispatchEvent('touchend', {
    touches: [],
    targetTouches: [],
    changedTouches: touch.changedTouches
  });
  await expectExpiresAfter(page, 6000);
});

test('a touch held on the Undo toast also holds the notice that replaces it, and a notice after Undo from the keyboard starts unheld', async ({
  page
}) => {
  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await page.clock.runFor(2000);

  const touch = await touchesAt(toastOf(page));
  await toastOf(page).dispatchEvent('touchstart', touch);
  await dropPot(page, 'Pot 2');
  await page.clock.runFor(20_000);
  await expect(
    undoOf(page),
    'The replacing notice expired while the touch was still held; carry held reasons over to its countdown.'
  ).toBeEnabled();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');

  await toastOf(page).dispatchEvent('touchend', {
    touches: [],
    targetTouches: [],
    changedTouches: touch.changedTouches
  });
  await expectExpiresAfter(page, 8000);

  await dropPot(page, 'Pot 3');
  await undoOf(page).focus();
  await page.keyboard.press('Enter');
  await expect(toastOf(page)).toContainText('Pot 3 removed');
  await page.clock.runFor(3999);
  await expect(toastOf(page)).toContainText('Pot 3 removed');
  await page.clock.runFor(1);
  await expect(
    toastOf(page),
    'A hold from the removed Undo button outlived it.'
  ).toBeHidden();
});

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

const collectInSheet = async (page: Page, name: string) => {
  await inWaterRow(page, name).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Collect', exact: true })
    .click();
  await expect
    .poll(async () => {
      await page.clock.runFor(0);
      return toastOf(page)
        .filter({ hasText: `${name} collected` })
        .count();
    })
    .toBe(1);
};

const expectFailureInSight = async (page: Page) => {
  const sheet = page.getByRole('dialog');
  const alert = sheet.getByRole('alert');
  const save = sheet.getByRole('button', { name: 'Save', exact: true });
  const shown = await alert.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const points = [
      [box.left + 2, box.top + 2],
      [box.right - 2, box.top + 2],
      [box.left + box.width / 2, box.top + box.height / 2],
      [box.left + 2, box.bottom - 2],
      [box.right - 2, box.bottom - 2]
    ] as const;
    return {
      inViewport:
        box.top >= 0 &&
        box.left >= 0 &&
        box.bottom <= innerHeight &&
        box.right <= innerWidth,
      uncovered: points.every(([x, y]) => {
        const hit = document.elementFromPoint(x, y);
        return hit !== null && node.contains(hit);
      }),
      bottom: box.bottom
    };
  });
  expect(
    shown,
    'A failed Save shows its whole message without scrolling, unclipped and uncovered.'
  ).toMatchObject({ inViewport: true, uncovered: true });
  const saveBox = await save.boundingBox();
  expect(
    shown.bottom,
    'The message sits above the Save that retries it.'
  ).toBeLessThanOrEqual(saveBox?.y ?? 0);
  await expect(save).not.toHaveAttribute('aria-disabled', 'true');
};

const closeSheet = async (page: Page, how: 'Escape' | 'Save') => {
  const sheet = page.getByRole('dialog');
  if (how === 'Escape') await page.keyboard.press('Escape');
  else await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toBeHidden();
  await page.mouse.move(0, 0);
};

test('a Collect toast lasts 8 seconds and Undo within it puts only that gear back in the water', async ({
  page
}) => {
  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await dropPot(page, 'Pot 2');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();

  await collectInSheet(page, 'Pot 1');
  await closeSheet(page, 'Escape');
  await expectExpiresAfter(page, 8000);

  await collectInSheet(page, 'Pot 2');
  await closeSheet(page, 'Escape');
  await page.clock.runFor(7999);
  await undoOf(page).click();
  await expect(toastOf(page)).toContainText('Pot 2 back in the water');
  await expect(inWaterRow(page, 'Pot 2')).toBeVisible();
  await expect(inWaterRow(page, 'Pot 1')).toHaveCount(0);
});

test("saving a recorded catch retires that gear's Collect Undo so it cannot clear the catch, while a save without a catch and another gear's Collect toast keep their Undo and time", async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const notCollected = { collected: false, catch: null };

  await openWithPausedClock(page);
  for (const name of ['Pot 1', 'Pot 2', 'Pot 3', 'Pot 4']) {
    await dropPot(page, name);
  }
  await page.getByRole('button', { name: 'Gear', exact: true }).click();

  await collectInSheet(page, 'Pot 1');
  await page.clock.runFor(2000);
  await closeSheet(page, 'Save');
  await expect(
    toastOf(page),
    'A save that records no catch commits nothing Undo would clear; keep its offer.'
  ).toContainText('Pot 1 collected');
  await expectExpiresAfter(page, 6000);

  await collectInSheet(page, 'Pot 2');
  await sheet.getByRole('textbox', { name: 'Kept' }).fill('4');
  await sheet.getByRole('textbox', { name: 'Released' }).fill('-1');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet.getByRole('textbox', { name: 'Released' })).toBeFocused();
  await expect(
    toastOf(page),
    'A refused Save commits nothing; keep the Collect Undo.'
  ).toContainText('Pot 2 collected');
  await sheet.getByRole('textbox', { name: 'Released' }).fill('2');
  await page.clock.runFor(1000);
  await closeSheet(page, 'Save');
  await expect(
    toastOf(page),
    'The Collect Undo outlived the catch it would clear.'
  ).toBeHidden();
  await expect(collectedRow(page, 'Pot 2')).toContainText('4 kept, 2 released');

  await collectInSheet(page, 'Pot 3');
  await closeSheet(page, 'Escape');
  await collectedRow(page, 'Pot 2').click();
  await sheet.getByLabel('Label').fill('red float');
  await page.clock.runFor(3000);
  await closeSheet(page, 'Save');
  await page.clock.runFor(4999);
  await expect(toastOf(page)).toContainText('Pot 3 collected');
  await undoOf(page).click();
  await expect(toastOf(page)).toContainText('Pot 3 back in the water');
  await expect(toastOf(page)).not.toContainText('catch');

  await collectInSheet(page, 'Pot 4');
  await sheet.getByRole('button', { name: 'Nothing caught' }).click();
  await closeSheet(page, 'Save');
  await expect(
    toastOf(page),
    'Nothing caught is a recorded catch; its Collect Undo must retire too.'
  ).toBeHidden();
  await collectedRow(page, 'Pot 4').click();
  await sheet.getByRole('button', { name: 'Undo collect' }).click();
  await expect(toastOf(page)).toContainText(
    'Pot 4 back in the water. Its recorded catch was cleared.'
  );
  await closeSheet(page, 'Escape');

  const expected = [
    { collected: true, catch: null },
    { collected: true, catch: { kept: 4, released: 2 } },
    notCollected,
    notCollected
  ];
  expect(await storedCollections(page)).toEqual(expected);
  await page.reload();
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await expect(collectedRow(page, 'Pot 2')).toContainText('4 kept, 2 released');
  await expect(collectedRow(page, 'Pot 1')).toContainText('Catch not recorded');
  expect(await storedCollections(page)).toEqual(expected);
});

test("a Collect Undo cannot clear a catch whose Save is still storing, even from the toast after the sheet closes, while another gear's Undo stays live", async ({
  page
}) => {
  const sheet = page.getByRole('dialog');

  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await dropPot(page, 'Pot 2');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();

  await collectInSheet(page, 'Pot 1');
  await sheet.getByRole('textbox', { name: 'Kept' }).fill('4');
  await sheet.getByRole('textbox', { name: 'Released' }).fill('2');
  await holdStorage(page);
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    sheet.getByRole('button', { name: 'Save', exact: true })
  ).toHaveAttribute('aria-disabled', 'true');
  await closeSheet(page, 'Escape');
  await expect(toastOf(page)).toContainText('Pot 1 collected');
  await expect(
    undoOf(page),
    'Undo must not be offered while the catch it would clear is being stored.'
  ).toHaveAttribute('aria-disabled', 'true');
  await undoOf(page).focus();
  await page.keyboard.press('Enter');
  await expect(
    undoOf(page),
    'A refused Undo leaves focus where the press was.'
  ).toBeFocused();
  await undoOf(page).click({ force: true });
  await releaseStorage(page);
  await expect
    .poll(async () => {
      await page.clock.runFor(0);
      return toastOf(page).count();
    }, 'The saved catch retires its Collect Undo.')
    .toBe(0);
  await expect(collectedRow(page, 'Pot 1')).toContainText('4 kept, 2 released');
  expect(await storedCollections(page)).toEqual([
    { collected: true, catch: { kept: 4, released: 2 } },
    { collected: false, catch: null }
  ]);

  await collectInSheet(page, 'Pot 2');
  await closeSheet(page, 'Escape');
  await collectedRow(page, 'Pot 1').click();
  await sheet.getByRole('textbox', { name: 'Kept' }).fill('5');
  await holdStorage(page);
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await closeSheet(page, 'Escape');
  await expect(toastOf(page)).toContainText('Pot 2 collected');
  await expect(
    undoOf(page),
    "Another gear's catch Save leaves this Undo usable."
  ).not.toHaveAttribute('aria-disabled', 'true');
  await releaseStorage(page);
  await expect(collectedRow(page, 'Pot 1')).toContainText('5 kept, 2 released');
  await expect(toastOf(page)).toContainText('Pot 2 collected');
  await undoOf(page).click();
  await expect(toastOf(page)).toContainText('Pot 2 back in the water');
  expect(await storedCollections(page)).toEqual([
    { collected: true, catch: { kept: 5, released: 2 } },
    { collected: false, catch: null }
  ]);
});

test('a catch Save that fails to store keeps its Collect Undo for the remaining time', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');

  await injectStorageFaults(page);
  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();

  await collectInSheet(page, 'Pot 1');
  await sheet.getByRole('textbox', { name: 'Kept' }).fill('4');
  await sheet.getByRole('textbox', { name: 'Released' }).fill('2');
  await page.clock.runFor(2000);
  await failStorage(page, 'writes');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => {
      await page.clock.runFor(0);
      return sheet.getByRole('alert').textContent();
    })
    .toContain("Couldn't save. Try again.");
  await expectFailureInSight(page);

  await page.setViewportSize({ width: 320, height: 640 });
  await sheet.evaluate((dialog) => {
    for (const box of dialog.querySelectorAll('*')) box.scrollTop = 0;
  });
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect
    .poll(async () => {
      await page.clock.runFor(0);
      return sheet.getByRole('alert').textContent();
    }, 'Saving again while storage still fails says so again.')
    .toContain("Couldn't save. Try again.");
  await expectFailureInSight(page);
  await expect(sheet.getByRole('textbox', { name: 'Kept' })).toHaveValue('4');
  await expect(sheet.getByRole('textbox', { name: 'Released' })).toHaveValue(
    '2'
  );
  await failStorage(page, null);
  expect(await storedCollections(page)).toEqual([
    { collected: true, catch: null }
  ]);
  await closeSheet(page, 'Escape');
  await expect(toastOf(page)).toContainText('Pot 1 collected');
  await expectExpiresAfter(page, 6000);
  expect(await storedCollections(page)).toEqual([
    { collected: true, catch: null }
  ]);
});

test('a catch Save that stops on an unexpected storage error leaves its Collect Undo live, and Undo puts that gear back in the water', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');

  await injectStorageFaults(page);
  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();

  await collectInSheet(page, 'Pot 1');
  await sheet.getByRole('textbox', { name: 'Kept' }).fill('4');
  await failStorage(page, 'defect');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await failStorage(page, null);
  await closeSheet(page, 'Escape');
  await expect(toastOf(page)).toContainText('Pot 1 collected');
  await expect(
    undoOf(page),
    'A Save that ended without storing must not keep blocking Undo.'
  ).not.toHaveAttribute('aria-disabled', 'true');
  await undoOf(page).click();
  await expect(toastOf(page)).toContainText('Pot 1 back in the water');
  expect(await storedCollections(page)).toEqual([
    { collected: false, catch: null }
  ]);
});

test('a catch Save that stops on an unexpected storage error says so in the sheet and stores nothing, and Save again stores that catch, which retires its Collect Undo', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const save = sheet.getByRole('button', { name: 'Save', exact: true });
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));

  await injectStorageFaults(page);
  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();

  await collectInSheet(page, 'Pot 1');
  await sheet.getByRole('textbox', { name: 'Kept' }).fill('4');
  await sheet.getByRole('textbox', { name: 'Released' }).fill('2');
  await failStorage(page, 'defect');
  await save.click();
  await expect
    .poll(
      async () => {
        await page.clock.runFor(0);
        return sheet.getByRole('alert').textContent();
      },
      {
        message: 'A Save that ended without storing must say so in the sheet.'
      }
    )
    .toBe("Couldn't save. Try again.");
  await expectFailureInSight(page);
  await expect(
    save,
    'A Save that ended without storing must leave Save usable.'
  ).not.toHaveAttribute('aria-disabled', 'true');
  await expect(sheet.getByRole('textbox', { name: 'Kept' })).toHaveValue('4');
  await expect(sheet.getByRole('textbox', { name: 'Released' })).toHaveValue(
    '2'
  );
  await expect(toastOf(page)).toContainText('Pot 1 collected');
  expect(await storedCollections(page)).toEqual([
    { collected: true, catch: null }
  ]);
  expect(
    errors,
    'The handled storage error must not reach the page as an unhandled error.'
  ).toEqual([]);

  await failStorage(page, null);
  await save.click();
  await expect
    .poll(async () => {
      await page.clock.runFor(0);
      return sheet.count();
    })
    .toBe(0);
  await expect(
    toastOf(page),
    'The saved catch retires its Collect Undo.'
  ).toHaveCount(0);
  expect(await storedCollections(page)).toEqual([
    { collected: true, catch: { kept: 4, released: 2 } }
  ]);
  await page.reload();
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await collectedRow(page, 'Pot 1').click();
  await expect(sheet.getByRole('textbox', { name: 'Kept' })).toHaveValue('4');
  await expect(sheet.getByRole('textbox', { name: 'Released' })).toHaveValue(
    '2'
  );
  expect(errors).toEqual([]);
});

test('a toast never hides the end of the Gear list: its last row scrolls clear when focused and opens while the toast shows', async ({
  page
}) => {
  await openWithPausedClock(page);
  for (let number = 1; number <= 8; number += 1) {
    await dropPot(page, `Pot ${String(number)}`);
  }
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  const list = page.getByRole('main');
  const lastRow = list.getByRole('button').last();
  const edgesOf = async (target: Locator) => {
    const box = await target.boundingBox();
    expect(box).not.toBeNull();
    return { top: box?.y ?? 0, bottom: (box?.y ?? 0) + (box?.height ?? 0) };
  };

  await list.evaluate((main) => {
    main.scrollTop = main.scrollHeight;
  });
  const under =
    (await edgesOf(lastRow)).bottom - (await edgesOf(toastOf(page))).bottom;
  await list.evaluate((main, by) => {
    main.scrollBy(0, by);
  }, under);
  expect(
    (await edgesOf(lastRow)).bottom,
    'the last row starts under the toast'
  ).toBeGreaterThan((await edgesOf(toastOf(page))).top);
  await lastRow.focus();
  expect(
    (await edgesOf(lastRow)).bottom,
    'focus scrolls the row clear of the toast'
  ).toBeLessThanOrEqual((await edgesOf(toastOf(page))).top);

  await lastRow.click({ timeout: 5000 });
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(toastOf(page)).toContainText('Pot 8 dropped');
});

const openNewerStorageVersion = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((opened, failed) => {
        const request = indexedDB.open('krab', 2);
        request.onsuccess = () => {
          request.result.close();
          opened();
        };
        request.onerror = () => {
          failed(new Error('could not open krab at version 2'));
        };
      })
  );

const deleteStorage = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((deleted, failed) => {
        const request = indexedDB.deleteDatabase('krab');
        request.onsuccess = () => {
          deleted();
        };
        request.onerror = () => {
          failed(new Error('could not delete krab'));
        };
      })
  );

test('a failed save offers Retry and Dismiss until one is chosen, and Retry saves the drop once storage works again', async ({
  page
}) => {
  const failedSave = toastOf(page).filter({ hasText: "Couldn't save" });
  const retry = failedSave.getByRole('button', { name: 'Retry' });
  const failDrop = async () => {
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect
      .poll(async () => {
        await page.clock.runFor(0);
        return failedSave.count();
      })
      .toBe(1);
    await page.mouse.move(0, 0);
    await page.clock.runFor(60_000);
    await expect(retry).toBeVisible();
  };

  await openWithPausedClock(page);
  await openNewerStorageVersion(page);

  await failDrop();
  await failedSave.getByRole('button', { name: 'Dismiss' }).click();
  await expect(toastOf(page)).toBeHidden();

  await failDrop();
  await deleteStorage(page);
  await retry.click();
  await expect
    .poll(async () => {
      await page.clock.runFor(0);
      return toastOf(page).filter({ hasText: 'Pot 1 dropped' }).count();
    })
    .toBe(1);

  await page.reload();
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  const rows = page.getByRole('main').getByRole('listitem');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText('Pot 1');
});
