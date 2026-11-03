import { expect, test, type Locator, type Page } from '@playwright/test';

const START = new Date('2031-03-04T05:00:00Z');
const PAUSED = new Date('2031-03-04T06:00:00Z');

test.use({ permissions: [] });

const toastOf = (page: Page) => page.getByRole('status').getByRole('group');
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

test('a Collect toast lasts 8 seconds and Undo within it puts only that gear back in the water', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const inWater = (name: string) =>
    page
      .getByRole('main')
      .getByRole('button')
      .filter({ hasText: name })
      .filter({ hasText: 'in the water' });
  const collect = async (name: string) => {
    await inWater(name).click();
    await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
    await expect
      .poll(async () => {
        await page.clock.runFor(0);
        return toastOf(page)
          .filter({ hasText: `${name} collected` })
          .count();
      })
      .toBe(1);
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await page.mouse.move(0, 0);
  };

  await openWithPausedClock(page);
  await dropPot(page, 'Pot 1');
  await dropPot(page, 'Pot 2');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();

  await collect('Pot 1');
  await expectExpiresAfter(page, 8000);

  await collect('Pot 2');
  await page.clock.runFor(7999);
  await undoOf(page).click();
  await expect(toastOf(page)).toContainText('Pot 2 back in the water');
  await expect(inWater('Pot 2')).toBeVisible();
  await expect(inWater('Pot 1')).toHaveCount(0);
});
