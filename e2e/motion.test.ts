import type { Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';
import { animationsSettled } from './settled';

type Recorded = Window & { transitionRuns: string[]; sheetTops: number[] };

const recordMotion = (page: Page) =>
  page.addInitScript(() => {
    const recorded = window as unknown as Recorded;
    recorded.transitionRuns = [];
    recorded.sheetTops = [];
    document.addEventListener('transitionrun', (event) => {
      if (!(event.target instanceof Element)) return;
      const owner =
        event.target.getAttribute('role') ??
        event.target.getAttribute('data-slot') ??
        event.target.localName;
      recorded.transitionRuns.push(`${owner} ${event.propertyName}`);
    });
    const sample = () => {
      const sheet = document.querySelector('[role="dialog"]');
      if (sheet)
        recorded.sheetTops.push(Math.round(sheet.getBoundingClientRect().top));
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });

const toastRuns = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as Recorded).transitionRuns.filter((run) =>
      run.startsWith('group ')
    )
  );

function sheetMoving() {
  const sheet = document.querySelector('[role="dialog"]');
  if (!sheet) return true;
  return sheet
    .getAnimations()
    .some(
      (animation) =>
        animation.timeline === document.timeline &&
        animation.playState === 'running'
    );
}

const sheetAtRest = (page: Page) =>
  expect.poll(() => page.evaluate(sheetMoving)).toBe(false);

const sheetTops = (page: Page) =>
  page.evaluate(() => (window as unknown as Recorded).sheetTops);

const restingTop = (page: Page) =>
  page
    .getByRole('dialog')
    .evaluate((sheet) => Math.round(sheet.getBoundingClientRect().top));

const shownAfterDone = async () => {
  const sheet = document.querySelector('[role="dialog"]');
  const done = [...(sheet?.querySelectorAll('button') ?? [])].find(
    (button) => button.textContent.trim() === 'Done'
  );
  done?.click();
  for (let frame = 0; frame < 2; frame++)
    await new Promise(requestAnimationFrame);
  return sheet?.checkVisibility() ?? false;
};

const dropAndOpenFilter = async (page: Page) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  const mapArea = page.getByRole('region', { name: 'Map', exact: true });
  await mapArea.getByRole('button', { name: /^Filter/ }).click();
  await expect(
    page.getByRole('dialog').getByRole('heading', { name: 'Map filter' })
  ).toBeVisible();
};

test('the Drop toast rises as it fades in and the Filter sheet slides up', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await recordMotion(page);
  await dropAndOpenFilter(page);

  await expect
    .poll(() => toastRuns(page))
    .toEqual(expect.arrayContaining(['group translate', 'group opacity']));
  await sheetAtRest(page);
  const rest = await restingTop(page);
  const tops = await sheetTops(page);
  expect(tops[0]).toBeGreaterThan(rest);
  expect(tops.some((top) => top > rest && top < (tops[0] ?? rest))).toBe(true);
});

for (const reducedMotion of ['no-preference', 'reduce'] as const)
  test(`with reduced motion ${reducedMotion}, a closing Filter sheet leaves at once`, async ({
    page
  }) => {
    await page.emulateMedia({ reducedMotion });
    await dropAndOpenFilter(page);
    await animationsSettled(page);
    await sheetAtRest(page);

    const shownAfterClose = await page.evaluate(shownAfterDone);

    expect(shownAfterClose).toBe(false);
  });

test('under reduced motion the Drop toast and the Filter sheet appear at once', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordMotion(page);
  await dropAndOpenFilter(page);
  await sheetAtRest(page);

  expect(await toastRuns(page)).toEqual([]);
  const rest = await restingTop(page);
  expect(new Set(await sheetTops(page))).toEqual(new Set([rest]));
});
