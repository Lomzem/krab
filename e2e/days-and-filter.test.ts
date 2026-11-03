import type { Locator, Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';
import { MADE_UP_SEA } from '../playwright.config';
import { expectAccessibleInBothThemes } from './accessibility';
import { deliverFix, holdFixes } from './held-geolocation';

const MIN_TARGET_PX = 44;
const LATE_EVENING = new Date('2031-06-10T23:40:00-04:00');

const dropPotAt = async (page: Page, north: number, name: string) => {
  await deliverFix(page, {
    latitude: MADE_UP_SEA.latitude + north,
    longitude: MADE_UP_SEA.longitude
  });
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText(`${name} dropped`);
};

const expectTouchTarget = async (target: Locator) => {
  const box = await target.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(box?.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
};

test.use({ timezoneId: 'America/New_York' });

test('a drop after local midnight starts Day 2: the Gear list groups by day, Today hides the earlier pin, and Show on map brings back a collected Day 1 drop', async ({
  page
}) => {
  const tab = (name: string) => page.getByRole('button', { name, exact: true });
  const mapArea = page.getByRole('region', { name: 'Map', exact: true });
  const pin = (name: RegExp) => mapArea.getByRole('button', { name });
  const sheet = page.getByRole('dialog');
  const filter = sheet.getByRole('group', { name: 'Also show' });
  const days = sheet.getByRole('group', { name: 'Days on this trip' });
  const openFilter = async () => {
    await mapArea.getByRole('button', { name: /^Filter/ }).click();
    await expect(
      sheet.getByRole('heading', { name: 'Map filter' })
    ).toBeVisible();
  };
  const closeFilter = async () => {
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
  };

  await holdFixes(page);
  await page.clock.install({ time: LATE_EVENING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await dropPotAt(page, 0, 'Pot 1');

  await openFilter();
  await expect(filter).toBeVisible();
  await expect(days).toHaveCount(0);
  await closeFilter();

  await page.clock.fastForward('30:00');
  await dropPotAt(page, 0.0005, 'Pot 2');

  await tab('Gear').click();
  const day1 = page.getByRole('region', { name: 'Day 1' });
  const day2 = page.getByRole('region', { name: 'Day 2' });
  await expect(day1.getByRole('button')).toHaveText([/Pot 1/]);
  await expect(day2.getByRole('button')).toHaveText([/Pot 2/]);

  await tab('Map').click();
  await expect(pin(/^Pot 1, Day 1,/)).toBeVisible();
  await expect(pin(/^Pot 2, Day 2,/)).toBeVisible();
  for (const [name, day] of [
    [/^Pot 1,/, 'Day 1'],
    [/^Pot 2,/, 'Day 2']
  ] as const) {
    await expect(pin(name)).toContainText(day, { useInnerText: true });
  }
  await openFilter();
  await expectAccessibleInBothThemes(page);
  for (const toggle of [
    filter.getByRole('checkbox', { name: 'Collected gear' }),
    filter.getByRole('checkbox', { name: 'Time in the water' }),
    days.getByRole('radio', { name: 'Today' }),
    days.getByRole('radio', { name: 'Earlier days' }),
    days.getByRole('radio', { name: 'All' })
  ]) {
    await expectTouchTarget(toggle);
  }
  await days.getByRole('radio', { name: 'Today' }).check();
  await closeFilter();
  await expect(pin(/^Pot 1,/)).toHaveCount(0);
  await expect(pin(/^Pot 2,/)).toBeVisible();

  await tab('Gear').click();
  await day1.getByRole('button', { name: /Pot 1/ }).click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 collected');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();

  await tab('Map').click();
  await openFilter();
  await filter.getByRole('checkbox', { name: 'Collected gear' }).uncheck();
  await closeFilter();

  await tab('Gear').click();
  await page
    .getByRole('region', { name: 'Collected', exact: true })
    .getByRole('button', { name: /Pot 1/ })
    .click();
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  await expect(sheet).toBeHidden();
  const collected = pin(/^Pot 1, Day 1, collected/);
  await expect(collected).toBeVisible();
  await expect(collected).toBeFocused();

  await openFilter();
  await expect(
    filter.getByRole('checkbox', { name: 'Collected gear' })
  ).toBeChecked();
  await expect(days.getByRole('radio', { name: 'All' })).toBeChecked();
  await closeFilter();

  await tab('Gear').click();
  await day2.getByRole('button', { name: /Pot 2/ }).click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 2 collected');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  const collectedList = page.getByRole('region', {
    name: 'Collected',
    exact: true
  });
  await expect(collectedList.getByRole('heading', { level: 3 })).toHaveText([
    'Day 1',
    'Day 2'
  ]);
  for (const [day, name] of [
    ['Collected Day 1', /Pot 1/],
    ['Collected Day 2', /Pot 2/]
  ] as const) {
    await expect(
      collectedList.getByRole('region', { name: day }).getByRole('button')
    ).toHaveText([name]);
  }
});
