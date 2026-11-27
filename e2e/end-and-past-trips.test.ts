import type { Locator, Page } from '@playwright/test';
import { expect, holdStorage, releaseStorage, test, toastOf } from './fixtures';
import { MADE_UP_SEA } from '../playwright.config';
import { expectAccessibleInBothThemes } from './accessibility';
import { chooseDays } from './day-choices';
import { deliverFix, holdFixes, letFixAge } from './held-geolocation';
import { failStorage, injectStorageFaults } from './storage-faults';

const MORNING = new Date('2031-06-10T07:30:00-04:00');
const LATE_EVENING = new Date('2031-06-10T23:40:00-04:00');
const TRIP_DATE = 'Tuesday, June 10, 2031';
const TWO_DAYS = 'Tuesday, June 10 to Wednesday, June 11, 2031';

test.use({ timezoneId: 'America/New_York' });

const tab = (page: Page, name: string) =>
  page.getByRole('tab', { name, exact: true });

const dropOf = async (page: Page, kind: 'Pot' | 'Net', name: string) => {
  await page
    .getByRole('radiogroup', { name: 'Gear to drop' })
    .getByText(kind, { exact: true })
    .click();
  await page
    .getByRole('button', { name: `Drop ${kind.toLowerCase()}` })
    .click();
  await expect(toastOf(page)).toContainText(`${name} dropped`);
};

const dropPotAt = async (page: Page, north: number, name: string) => {
  await deliverFix(page, {
    latitude: MADE_UP_SEA.latitude + north,
    longitude: MADE_UP_SEA.longitude
  });
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText(`${name} dropped`);
};

const endTheTrip = async (page: Page, outcome: string) => {
  const ask = page.getByRole('alertdialog');
  await tab(page, 'Gear').click();
  await page.getByRole('button', { name: 'End trip' }).click();
  await expect(ask.getByRole('heading', { name: 'End trip?' })).toBeVisible();
  await expect(ask).toContainText(outcome);
  await ask.getByRole('button', { name: 'End trip' }).click();
  await expect(ask).toBeHidden();
  await expect(toastOf(page)).toContainText('Trip ended');
};

const startMixedTrip = async (page: Page, afterAllow?: () => Promise<void>) => {
  const sheet = page.getByRole('dialog');
  const main = page.getByRole('main');
  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await afterAllow?.();
  await expect(page.getByText('Finding position')).toBeHidden();
  await dropOf(page, 'Pot', 'Pot 1');
  await dropOf(page, 'Net', 'Net 1');

  await tab(page, 'Gear').click();
  await main.getByRole('button').filter({ hasText: 'Pot 1' }).click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();

  await tab(page, 'Map').click();
};

test('ending a mixed trip preserves collected and uncollected gear on the main map past layer and restores group focus, while its End trip ask ignores a tap outside and keeps the trip on Escape', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const ask = page.getByRole('alertdialog');
  const mapArea = page.getByRole('region', { name: 'Map', exact: true });

  await startMixedTrip(page);
  await tab(page, 'Gear').click();
  const endButton = page.getByRole('main').getByRole('button', {
    name: 'End trip'
  });
  await endButton.click();
  await expect(ask).toHaveAccessibleDescription(
    '1 still in the water Kept in Past trips'
  );
  await expect(
    ask.getByRole('button', { name: 'Keep trip going' })
  ).toBeFocused();
  await expect(
    ask.getByRole('button', { name: /^(Keep trip going|End trip)$/ })
  ).toHaveText(['Keep trip going', 'End trip']);
  await page.mouse.click(8, 8);
  await expect(ask).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ask).toBeHidden();
  await expect(endButton).toBeFocused();
  await endButton.click();
  await ask.getByRole('button', { name: 'Keep trip going' }).click();
  await expect(ask).toBeHidden();
  await expect(endButton).toBeFocused();

  await endTheTrip(page, '1 still in the water');
  await expect(
    page.getByRole('heading', { name: 'Gear', level: 1 })
  ).toBeFocused();
  await expect(endButton).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('Nothing in the water');
  await tab(page, 'Map').click();

  const pastLayer = sheet
    .getByRole('group', { name: 'Also show' })
    .getByRole('checkbox', { name: 'Past trips' });
  const pastGroup = mapArea.getByRole('button', {
    name: 'Pot 1 +1 more here; 1 of 2 uncollected',
    exact: true
  });
  const showPastLayer = async (on: boolean) => {
    await mapArea.getByRole('button', { name: /^Filter/ }).click();
    await pastLayer.setChecked(on);
    await sheet.getByRole('button', { name: 'Done' }).click();
    await expect(sheet).toBeHidden();
    await expect(pastGroup).toHaveCount(on ? 1 : 0);
  };
  await expect(
    mapArea.getByRole('img', { name: /^Current position/ })
  ).toBeVisible();
  await expect(pastGroup).toHaveCount(0);
  await mapArea.getByRole('button', { name: /^Filter/ }).click();
  await expect(pastLayer).not.toBeChecked();
  await sheet.getByRole('button', { name: 'Done' }).click();
  await showPastLayer(true);
  await showPastLayer(false);
  await showPastLayer(true);
  await expect(pastGroup).toBeVisible();
  await expect(
    pastGroup.locator('span').filter({ visible: true }).nth(2)
  ).toHaveCSS('border-top-style', 'dotted');
  await pastGroup.click();
  await expect(
    sheet.getByRole('heading', { name: '2 gear here' })
  ).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: /^(Pot|Net) 1, / })
  ).toHaveText([/Net 1 past trip/, /Pot 1 past trip/]);
  for (const name of [
    `Net 1, past trip, ${TRIP_DATE}, Uncollected`,
    `Pot 1, past trip, ${TRIP_DATE}, 2 kept, 0 released`
  ]) {
    await expect(
      sheet.getByRole('button', { name, exact: true })
    ).toBeVisible();
  }
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(pastGroup).toBeFocused();
});

const hasSelectedRing = (pin: Locator) =>
  pin.evaluate((button) =>
    [...button.querySelectorAll('span')].some((element) =>
      getComputedStyle(element).boxShadow.includes(
        'rgb(163, 37, 111) 0px 0px 0px 5px'
      )
    )
  );

test('a past trip lists its collected and uncollected gear, saves an edited catch, and identifies Show on map with restored focus', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const main = page.getByRole('main');
  await holdFixes(page);
  await startMixedTrip(page, () => deliverFix(page, MADE_UP_SEA));
  await letFixAge(page);
  await page.clock.fastForward('00:06');
  await page.getByRole('button', { name: 'Drop net' }).click();
  await page.getByRole('button', { name: 'Save without position' }).click();
  await expect(toastOf(page)).toContainText('Net 2 dropped');
  await endTheTrip(page, '2 still in the water');
  await tab(page, 'Past trips').click();
  const pastTrip = main.getByRole('button', { name: new RegExp(TRIP_DATE) });
  await expect(pastTrip).toHaveAccessibleName(
    `${TRIP_DATE} 3 drops, 2 uncollected`
  );
  await expectAccessibleInBothThemes(page);
  await pastTrip.click();

  const detail = page.getByRole('region', { name: TRIP_DATE });
  await expect(
    detail.getByRole('heading', { level: 1, name: TRIP_DATE })
  ).toBeFocused();
  await expect(
    detail.getByRole('button', { name: 'Centre on my position' })
  ).toHaveCount(0);
  const pot1 = detail.getByRole('button', {
    name: 'Pot 1 2 kept, 0 released',
    exact: true
  });
  const net1 = detail.getByRole('button', {
    name: 'Net 1 Uncollected',
    exact: true
  });
  const net2 = detail.getByRole('button', {
    name: 'Net 2 Uncollected No position',
    exact: true
  });
  await expect(pot1).toBeVisible();
  await expect(net1).toBeVisible();
  await expect(net2).toBeVisible();
  const detailGroup = detail.getByRole('button', {
    name: 'Pot 1 +1 more here; 1 of 2 uncollected',
    exact: true
  });
  await expect(detailGroup).toBeVisible();
  await detailGroup.click();
  await expect(
    sheet.getByRole('button', {
      name: 'Pot 1, 2 kept, 0 released',
      exact: true
    })
  ).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: 'Net 1, Uncollected', exact: true })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detailGroup).toBeFocused();
  await expectAccessibleInBothThemes(page);

  await net1.click();
  await expect(sheet).toContainText('Uncollected');
  await expect(
    sheet.getByRole('button', { name: 'Collect', exact: true })
  ).toHaveCount(0);
  await expect(sheet.getByRole('heading', { name: 'Catch' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(net1).toBeFocused();

  await pot1.click();
  await expect(
    sheet.getByRole('group', { name: 'Kept' }).getByRole('status')
  ).toContainText('Kept: 2');
  await expect(sheet.getByRole('button', { name: /again here/ })).toHaveCount(
    0
  );
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  const savedPot1 = detail.getByRole('button', {
    name: 'Pot 1 3 kept, 0 released',
    exact: true
  });
  await expect(savedPot1).toBeVisible();
  await expect(pot1).toHaveCount(0);

  await savedPot1.click();
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  await expect(sheet).toBeHidden();
  await expect(detailGroup).toBeFocused();
  await detail.getByRole('button', { name: 'All past trips' }).focus();
  await expect(detailGroup).toHaveAttribute('aria-current', 'true');
  expect(await hasSelectedRing(detailGroup)).toBe(true);
  await detailGroup.click();
  await expect(
    sheet.getByRole('button', {
      name: 'Pot 1, 3 kept, 0 released',
      exact: true
    })
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detailGroup).toBeFocused();

  await detail.getByRole('button', { name: 'All past trips' }).click();
  await expect(pastTrip).toBeFocused();
});

test('a past trip over two days opens on All, and Last day and Earlier days narrow its rows and pins together, the chosen one marked with a check that moves no choice; deleting its only remaining drop removes the trip until Undo brings it back, and Delete trip asks first, stays open while removing, and then removes it for good', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const ask = page.getByRole('alertdialog');
  const main = page.getByRole('main');
  const listHeading = main.getByRole('heading', {
    level: 1,
    name: 'Past trips'
  });
  const detail = page.getByRole('region', { name: TWO_DAYS });
  const days = detail.getByRole('radiogroup', { name: 'Days on this trip' });
  const named = (name: string) =>
    detail.getByRole('button', { name, exact: true });
  const pot1 = [named('Pot 1 Uncollected'), named('Pot 1, Day 1, Uncollected')];
  const pot2 = [named('Pot 2 Uncollected'), named('Pot 2, Day 2, Uncollected')];
  const expectShown = async (shown: Locator[], hidden: Locator[]) => {
    for (const target of shown) await expect(target).toBeVisible();
    for (const target of hidden) await expect(target).toHaveCount(0);
  };

  await holdFixes(page);
  await page.clock.install({ time: LATE_EVENING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await dropPotAt(page, 0, 'Pot 1');
  await page.clock.fastForward('30:00');
  await dropPotAt(page, 0.0005, 'Pot 2');
  await endTheTrip(page, '2 still in the water');

  await tab(page, 'Past trips').click();
  await main
    .getByRole('button', {
      name: `${TWO_DAYS} 2 drops, 2 uncollected`,
      exact: true
    })
    .click();
  await expect(days.getByRole('radio', { name: 'All' })).toBeChecked();
  await expectShown([...pot1, ...pot2], []);
  await expect(pot1[1]).toHaveAttribute('aria-haspopup', 'dialog');
  await chooseDays(days, 'Last day');
  await expectShown(pot2, pot1);
  await chooseDays(days, 'Earlier days');
  await expectShown(pot1, pot2);
  await chooseDays(days, 'All');
  await expectShown([...pot1, ...pot2], []);

  await named('Pot 2 Uncollected').click();
  await sheet.getByRole('button', { name: 'Show on map' }).click();
  await expect(sheet).toBeHidden();
  await expect(pot2[1]).toBeFocused();
  await detail.getByRole('button', { name: 'All past trips' }).focus();
  await expect(pot2[1]).toHaveAttribute('aria-current', 'true');
  expect(await hasSelectedRing(pot2[1])).toBe(true);
  await pot2[1].click();
  await sheet.getByRole('button', { name: 'Delete drop' }).click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Pot 2 deleted');
  const pastTrip = main.getByRole('button', { name: new RegExp(TRIP_DATE) });
  await expect(
    main.getByRole('heading', { level: 1, name: TRIP_DATE })
  ).toBeVisible();
  await main
    .getByRole('button', { name: 'Pot 1 Uncollected', exact: true })
    .click();
  await sheet.getByRole('button', { name: 'Delete drop' }).click();
  await expect(sheet).toBeHidden();
  await expect(toastOf(page)).toContainText('Pot 1 deleted');
  await expect(main).toContainText('No past trips');
  await expect(listHeading).toBeFocused();

  await toastOf(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 restored');
  await expect(pastTrip).toHaveAccessibleName(
    `${TRIP_DATE} 1 drop, 1 uncollected`
  );
  await expect(listHeading).toBeFocused();

  await pastTrip.click();
  const deleteTrip = main.getByRole('button', { name: 'Delete trip' });
  await deleteTrip.click();
  await expect(
    ask.getByRole('heading', { name: 'Delete trip?' })
  ).toBeVisible();
  await expect(ask).toHaveAccessibleDescription(
    `${TRIP_DATE}, 1 drop Can't be undone`
  );
  await expect(ask.getByRole('button', { name: 'Keep trip' })).toBeFocused();
  await expect(
    ask.getByRole('button', { name: /^(Keep trip|Delete trip)$/ })
  ).toHaveText(['Keep trip', 'Delete trip']);
  await ask.getByRole('button', { name: 'Keep trip' }).click();
  await expect(ask).toBeHidden();
  await expect(deleteTrip).toBeFocused();

  await deleteTrip.click();
  await holdStorage(page);
  await ask.getByRole('button', { name: 'Delete trip' }).click();
  for (const leave of [
    () => ask.getByRole('button', { name: 'Keep trip' }).click({ force: true }),
    () => page.keyboard.press('Escape')
  ]) {
    await leave();
    await expect(
      ask.getByRole('heading', { name: 'Delete trip?' })
    ).toBeVisible();
  }
  await expect(toastOf(page)).not.toContainText('Trip deleted');

  await releaseStorage(page);
  await expect(ask).toBeHidden();
  await expect(toastOf(page)).toContainText('Trip deleted');
  await expect(main).toContainText('No past trips');
  await expect(listHeading).toBeFocused();

  await page.reload();
  await tab(page, 'Past trips').click();
  await expect(main).toContainText('No past trips');
});

test('past trips show what was just written even while storage reads fail, and history that fails to load offers Retry instead of reading as empty', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const main = page.getByRole('main');
  const pastTrip = main.getByRole('button', {
    name: `${TRIP_DATE} 1 drop, 1 uncollected`,
    exact: true
  });

  await injectStorageFaults(page);
  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await dropOf(page, 'Pot', 'Pot 1');

  await failStorage(page, 'reads');
  await endTheTrip(page, '1 still in the water');
  await tab(page, 'Past trips').click();
  await expect(pastTrip).toBeVisible();
  await pastTrip.click();
  await main
    .getByRole('button', { name: 'Pot 1 Uncollected', exact: true })
    .click();
  await sheet.getByRole('button', { name: 'Delete drop' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 deleted');
  await expect(main).toContainText('No past trips');
  await toastOf(page).getByRole('button', { name: 'Undo' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 restored');
  await expect(pastTrip).toBeVisible();

  await page.reload();
  await tab(page, 'Past trips').click();
  await expect(main).toContainText("Couldn't load past trips");
  await expect(main).not.toContainText('No past trips');
  await expect(pastTrip).toHaveCount(0);

  await failStorage(page, null);
  await main.getByRole('button', { name: 'Retry' }).click();
  await expect(pastTrip).toBeVisible();
  await expect(main).not.toContainText("Couldn't load past trips");
});

test('ending a trip with gear in the water says it is kept in Past trips and View ended trip opens that trip', async ({
  page
}) => {
  const sheet = page.getByRole('dialog');
  const ask = page.getByRole('alertdialog');
  const main = page.getByRole('main');
  const viewEnded = main.getByRole('button', { name: 'View ended trip' });

  await startMixedTrip(page);
  await tab(page, 'Gear').click();
  await main.getByRole('button', { name: 'End trip' }).click();
  await expect(ask).toHaveAccessibleDescription(
    '1 still in the water Kept in Past trips'
  );
  await ask.getByRole('button', { name: 'End trip' }).click();
  await expect(ask).toBeHidden();
  await expect(main).toContainText('Nothing in the water');
  await expect(viewEnded).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await viewEnded.click();
  const detail = page.getByRole('region', { name: TRIP_DATE });
  await expect(
    detail.getByRole('heading', { level: 1, name: TRIP_DATE })
  ).toBeFocused();
  await expect(
    detail.getByRole('button', { name: 'Net 1 Uncollected', exact: true })
  ).toBeVisible();

  await detail.getByRole('button', { name: 'Delete trip' }).click();
  await ask.getByRole('button', { name: 'Delete trip' }).click();
  await expect(ask).toBeHidden();
  await tab(page, 'Gear').click();
  await expect(viewEnded).toHaveCount(0);

  await tab(page, 'Map').click();
  await dropOf(page, 'Pot', 'Pot 1');
  await tab(page, 'Gear').click();
  await main.getByRole('button').filter({ hasText: 'Pot 1' }).click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await main.getByRole('button', { name: 'End trip' }).click();
  await expect(ask).toHaveAccessibleDescription('Kept in Past trips');
  await ask.getByRole('button', { name: 'End trip' }).click();
  await expect(ask).toBeHidden();
  await expect(viewEnded).toBeVisible();

  await tab(page, 'Map').click();
  await dropOf(page, 'Pot', 'Pot 1');
  await toastOf(page).getByRole('button', { name: 'Undo' }).click();
  await tab(page, 'Gear').click();
  await expect(viewEnded).toHaveCount(0);
});

test('two past trips on the same day show their start times, and Delete trip names the trip it removes', async ({
  page
}) => {
  const ask = page.getByRole('alertdialog');
  const main = page.getByRole('main');
  await page.clock.install({ time: MORNING });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await dropOf(page, 'Pot', 'Pot 1');
  await dropOf(page, 'Net', 'Net 1');
  await endTheTrip(page, '2 still in the water');

  await page.clock.fastForward('05:45:00');
  await tab(page, 'Map').click();
  await dropOf(page, 'Pot', 'Pot 1');
  await endTheTrip(page, '1 still in the water');

  await tab(page, 'Past trips').click();
  const afternoon = main.getByRole('button', {
    name: `${TRIP_DATE}, 1:15 PM 1 drop, 1 uncollected`,
    exact: true
  });
  const morning = main.getByRole('button', {
    name: `${TRIP_DATE}, 7:30 AM 2 drops, 2 uncollected`,
    exact: true
  });
  await expect(afternoon).toBeVisible();
  await expect(afternoon).toContainText('Jun 10, 2031 · 1:15 PM');
  await expect(morning).toBeVisible();
  await expect(morning).toContainText('Jun 10, 2031 · 7:30 AM');
  await expectAccessibleInBothThemes(page);

  await morning.click();
  const morningDetail = page.getByRole('region', {
    name: `${TRIP_DATE}, 7:30 AM`
  });
  await expect(
    morningDetail.getByRole('heading', {
      level: 1,
      name: `${TRIP_DATE}, 7:30 AM`
    })
  ).toContainText('Jun 10, 2031 · 7:30 AM');
  await morningDetail.getByRole('button', { name: 'Delete trip' }).click();
  await expect(
    ask.getByRole('heading', { name: 'Delete trip?' })
  ).toBeVisible();
  await expect(ask).toContainText('Jun 10, 2031 · 7:30 AM · 2 drops');
  await expect(ask).toContainText("Can't be undone");
  await expect(ask).toHaveAccessibleDescription(
    `${TRIP_DATE}, 7:30 AM, 2 drops Can't be undone`
  );
  await expect(ask.getByRole('button', { name: 'Keep trip' })).toBeFocused();
  await ask.getByRole('button', { name: 'Delete trip' }).click();
  await expect(ask).toBeHidden();
  await expect(toastOf(page)).toContainText('Trip deleted');

  const remaining = main.getByRole('button', {
    name: `${TRIP_DATE} 1 drop, 1 uncollected`,
    exact: true
  });
  await expect(remaining).toBeVisible();
  await expect(remaining).not.toContainText('1:15 PM');
  await remaining.click();
  const remainingDetail = page.getByRole('region', { name: TRIP_DATE });
  await remainingDetail.getByRole('button', { name: 'Delete trip' }).click();
  await expect(ask).toContainText('Jun 10, 2031 · 1 drop');
  await expect(ask).not.toContainText('1:15 PM');
  await expect(ask).toHaveAccessibleDescription(
    `${TRIP_DATE}, 1 drop Can't be undone`
  );
  await ask.getByRole('button', { name: 'Keep trip' }).click();
  await expect(ask).toBeHidden();
});

test('on a 640 by 320 screen with doubled text, the End trip ask fits the screen and scrolls to its title and both actions', async ({
  page
}) => {
  const ask = page.getByRole('alertdialog');

  await page.setViewportSize({ width: 640, height: 320 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await dropOf(page, 'Pot', 'Pot 1');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await tab(page, 'Gear').click();
  await page.getByRole('button', { name: 'End trip' }).click();
  await expect(ask).toBeVisible();

  const box = await ask.boundingBox();
  expect(box && box.y >= 0 && box.y + box.height <= 320).toBe(true);
  for (const part of [
    ask.getByRole('heading', { name: 'End trip?' }),
    ask.getByRole('button', { name: 'Keep trip going' }),
    ask.getByRole('button', { name: 'End trip' })
  ]) {
    await part.scrollIntoViewIfNeeded();
    await expect(part).toBeInViewport({ ratio: 1 });
  }
  await ask.getByRole('button', { name: 'End trip' }).click();
  await expect(ask).toBeHidden();
  await expect(toastOf(page)).toContainText('Trip ended');
});
