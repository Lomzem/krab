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

test('collecting keeps the sheet open for the catch, which stays a draft until Save and survives reload, and closing the sheet focuses that gear in Collected; Clear catch empties only the draft, and One fewer does nothing at not recorded or 0', async ({
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
  await expect(collectedRow(page, 'Pot 1')).toBeFocused();
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
  await expect(collectedRow(page, 'Pot 1')).toBeFocused();

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

test('Drop again puts the same gear back with its details, and Undo collect in the sheet puts gear back in the water, where closing the sheet focuses it', async ({
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
  await expect(inWaterRow(page, 'Pot 1')).toBeFocused();
  await expect(page.getByRole('region', { name: 'Collected' })).toContainText(
    'Pot 1'
  );
});

const collectPot = async (page: Page) => {
  const sheet = page.getByRole('dialog');
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await gearTab(page).click();
  await inWaterRow(page, 'Pot 1').click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await expect(sheet.getByRole('heading', { name: 'Catch' })).toBeFocused();
};

const catchLayout = (page: Page) =>
  page.getByRole('dialog').evaluate((dialog) => {
    const section = dialog.querySelector(
      'section[aria-labelledby$="-catch-title"]'
    );
    if (!section) return null;
    const origin = section.getBoundingClientRect();
    const box = (element: Element | null | undefined) => {
      if (!element) return null;
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x: x - origin.x, y: y - origin.y, width, height };
    };
    const step = (name: string) =>
      [...dialog.querySelectorAll('button')].find(
        (button) =>
          (button.getAttribute('aria-label') ?? button.textContent.trim()) ===
          name
      );
    const { x, y, width, height } = dialog.getBoundingClientRect();
    return {
      dialog: { x, y, width, height },
      section: { width: origin.width, height: origin.height },
      rows: [...section.querySelectorAll('[role="group"]')].map(box),
      steps: [
        'One fewer kept',
        'One more kept',
        'One fewer released',
        'One more released',
        'Nothing caught'
      ].map((name) => box(step(name))),
      next: box(section.nextElementSibling),
      scale: window.visualViewport?.scale ?? null
    };
  });

test('rapid taps on Kept and Released count every tap once, and neither those taps, Nothing caught nor Clear catch move the catch editor or what follows it', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const step = (name: string) =>
    sheet.getByRole('button', { name, exact: true });
  await collectPot(page);

  const moreKept = step('One more kept');
  const before = await catchLayout(page);
  expect(before?.scale).toBe(1);

  for (let tap = 0; tap < 12; tap += 1) await moreKept.tap();
  await expect(countOf(page, 'Kept')).toContainText('Kept: 12');
  await expect(countOf(page, 'Released')).toContainText('Released: 0');
  for (let tap = 0; tap < 3; tap += 1) await step('One fewer kept').tap();
  for (let tap = 0; tap < 5; tap += 1) await step('One more released').tap();
  await expect(countOf(page, 'Kept')).toContainText('Kept: 9');
  await expect(countOf(page, 'Released')).toContainText('Released: 5');
  expect(await catchLayout(page)).toEqual(before);

  for (let tap = 0; tap < 95; tap += 1) await moreKept.tap();
  await expect(countOf(page, 'Kept')).toContainText('Kept: 104');
  expect(await catchLayout(page)).toEqual(before);

  const nothing = step('Nothing caught');
  const fill = () =>
    nothing.evaluate((button) => getComputedStyle(button).backgroundColor);
  const unapplied = await fill();
  await nothing.tap();
  await expect(countOf(page, 'Kept')).toContainText('Kept: 0');
  await expect
    .poll(fill, 'Nothing caught shows it is applied')
    .not.toBe(unapplied);
  expect(await catchLayout(page)).toEqual(before);
  await moreKept.tap();
  await expect.poll(fill, 'a kept fish ends Nothing caught').toBe(unapplied);
  await nothing.tap();
  await expect.poll(fill).not.toBe(unapplied);

  await step('Clear catch').tap();
  await expect(countOf(page, 'Kept')).toContainText('Kept: not recorded');
  await expect
    .poll(fill, 'a cleared catch is not Nothing caught')
    .toBe(unapplied);
  expect(await catchLayout(page)).toEqual(before);
  for (const name of ['One more kept', 'One fewer kept']) {
    await expect(step(name)).toHaveCSS('touch-action', 'manipulation');
  }
});

test('Kept and Released take typed whole counts beside the steppers; a blank or fractional count refuses Save and Drop again at its field and leaves the stored catch alone', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const kept = sheet.getByRole('textbox', { name: 'Kept' });
  const released = sheet.getByRole('textbox', { name: 'Released' });
  const save = sheet.getByRole('button', { name: 'Save' });
  await collectPot(page);

  await expect(kept).toHaveValue('');
  await expect(released).toHaveValue('');
  await expect(kept).toHaveAttribute('inputmode', 'numeric');
  await expect(countOf(page, 'Kept')).toContainText('Kept: not recorded');
  const before = await catchLayout(page);
  expect(before?.section.height).toBeGreaterThan(0);

  await kept.fill('12');
  await expect(released).toHaveValue('0');
  await expect(countOf(page, 'Kept')).toContainText('Kept: 12');
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await expect(kept).toHaveValue('13');
  await released.fill('3');
  await expect(kept).toHaveValue('13');
  expect(await catchLayout(page)).toEqual(before);
  await save.click();
  await expect(sheet).toBeHidden();
  await page.reload();
  await gearTab(page).click();
  await expect(collectedRow(page, 'Pot 1')).toContainText(
    '13 kept, 3 released'
  );

  await collectedRow(page, 'Pot 1').click();
  await expect(kept).toHaveValue('13');
  for (const [keptText, releasedText, refused, guidance] of [
    ['13', '', [released], 'Enter Released too, or leave both empty.'],
    ['2.5', '3', [kept], 'Kept needs a whole number, 0 or more.'],
    [
      '',
      'x',
      [kept, released],
      'Kept and Released need whole numbers, 0 or more.'
    ]
  ] as const) {
    await kept.fill(keptText);
    await released.fill(releasedText);
    await save.click();
    await expect(sheet).toBeVisible();
    await expect(refused[0]).toBeFocused();
    for (const field of [kept, released]) {
      await expect(field).toHaveAccessibleDescription(guidance);
      if (refused.includes(field))
        await expect(field).toHaveAttribute('aria-invalid', 'true');
      else await expect(field).not.toHaveAttribute('aria-invalid');
    }
    await expect(kept).toHaveValue(keptText);
    await expect(released).toHaveValue(releasedText);
    expect(await catchLayout(page)).toEqual(before);
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await page.reload();
  await gearTab(page).click();
  await expect(collectedRow(page, 'Pot 1')).toContainText(
    '13 kept, 3 released'
  );

  await collectedRow(page, 'Pot 1').click();
  await kept.fill('');
  await kept.pressSequentially('1400');
  await released.fill(' 0 ');
  await save.click();
  await expect(sheet).toBeHidden();
  await expect(collectedRow(page, 'Pot 1')).toContainText(
    '1400 kept, 0 released'
  );

  await collectedRow(page, 'Pot 1').click();
  await released.fill('x');
  await sheet.getByRole('button', { name: 'Drop pot again here' }).click();
  await expect(released).toBeFocused();
  await expect(released).toHaveAttribute('aria-invalid', 'true');
  await expect(inWaterRow(page, 'Pot 1')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(collectedRow(page, 'Pot 1')).toContainText(
    '1400 kept, 0 released'
  );
});

test('leaving a fractional or one-sided count names the fix at once without storing anything, and emptying both counts saves the catch as not recorded, unlike Nothing caught', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const kept = sheet.getByRole('textbox', { name: 'Kept' });
  const released = sheet.getByRole('textbox', { name: 'Released' });
  const save = sheet.getByRole('button', { name: 'Save' });
  const notRecorded = "Not recorded. Leave both empty if you didn't count.";
  const reopen = async () => {
    await page.reload();
    await gearTab(page).click();
    await collectedRow(page, 'Pot 1').click();
  };
  await collectPot(page);
  const before = await catchLayout(page);

  await kept.focus();
  await page.keyboard.press('Tab');
  for (const field of [kept, released]) {
    await expect(field).not.toHaveAttribute('aria-invalid');
    await expect(field).toHaveAccessibleDescription(notRecorded);
  }

  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await save.click();
  await expect(sheet).toBeHidden();
  await reopen();
  await expect(released).toHaveValue('0');

  for (const [typed, guidance] of [
    ['2.5', 'Released needs a whole number, 0 or more.'],
    ['', 'Enter Released too, or leave both empty.']
  ] as const) {
    await released.fill(typed);
    await expect(released).not.toHaveAttribute('aria-invalid');
    await page.keyboard.press('Tab');
    await expect(released).not.toBeFocused();
    await expect(released).toHaveAttribute('aria-invalid', 'true');
    await expect(kept).not.toHaveAttribute('aria-invalid');
    for (const field of [kept, released]) {
      await expect(field).toHaveAccessibleDescription(guidance);
    }
    expect(await catchLayout(page)).toEqual(before);
    await released.fill('3');
    await expect(released).not.toHaveAttribute('aria-invalid');
    await expect(released).toHaveAccessibleDescription('');
  }

  await released.fill('');
  await save.click();
  await expect(sheet).toBeVisible();
  await expect(released).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(collectedRow(page, 'Pot 1')).toContainText('1 kept, 0 released');

  await reopen();
  await released.fill('');
  await kept.fill('');
  await expect(countOf(page, 'Kept')).toContainText('Kept: not recorded');
  await expect(countOf(page, 'Released')).toContainText(
    'Released: not recorded'
  );
  for (const field of [kept, released]) {
    await expect(field).not.toHaveAttribute('aria-invalid');
    await expect(field).toHaveAccessibleDescription(notRecorded);
  }
  expect(await catchLayout(page)).toEqual(before);
  await save.click();
  await expect(sheet).toBeHidden();
  await reopen();
  await expect(kept).toHaveValue('');
  await expect(countOf(page, 'Kept')).toContainText('Kept: not recorded');
  await page.keyboard.press('Escape');
  await expect(collectedRow(page, 'Pot 1')).toContainText('Catch not recorded');

  await collectedRow(page, 'Pot 1').click();
  await sheet.getByRole('button', { name: 'Nothing caught' }).click();
  await save.click();
  await expect(sheet).toBeHidden();
  await reopen();
  await expect(kept).toHaveValue('0');
  await expect(released).toHaveValue('0');
  await page.keyboard.press('Escape');
  await expect(collectedRow(page, 'Pot 1')).toContainText('Nothing caught');
});
