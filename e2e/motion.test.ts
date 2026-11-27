import type { Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';
import { animationsSettled } from './settled';

const recordTransitions = (page: Page) =>
  page.addInitScript(() => {
    const runs: string[] = [];
    Object.assign(window, { transitionRuns: runs });
    document.addEventListener('transitionrun', (event) => {
      if (!(event.target instanceof Element)) return;
      const owner =
        event.target.getAttribute('role') ??
        event.target.getAttribute('data-slot') ??
        event.target.localName;
      runs.push(`${owner} ${event.propertyName}`);
    });
  });

const transitionRuns = (page: Page) =>
  page.evaluate(() =>
    (window as unknown as { transitionRuns: string[] }).transitionRuns.filter(
      (run) => run.startsWith('dialog-viewport ') || run.startsWith('group ')
    )
  );

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
  await recordTransitions(page);
  await dropAndOpenFilter(page);

  await expect
    .poll(() => transitionRuns(page))
    .toEqual(
      expect.arrayContaining([
        'group translate',
        'group opacity',
        'dialog-viewport transform'
      ])
    );
});

test('a closing Filter sheet leaves at once', async ({ page }) => {
  await dropAndOpenFilter(page);
  await animationsSettled(page);

  const shownAfterClose = await page.evaluate(shownAfterDone);

  expect(shownAfterClose).toBe(false);
});

test('under reduced motion the Drop toast and the Filter sheet appear at once', async ({
  page
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordTransitions(page);
  await dropAndOpenFilter(page);

  expect(await transitionRuns(page)).toEqual([]);
});
