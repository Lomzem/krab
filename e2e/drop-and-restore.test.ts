import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { MADE_UP_SEA } from '../playwright.config';

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const expectAccessibleInBothThemes = async (page: Page) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_22_AA)
      .analyze();
    expect(violations, `${colorScheme} theme`).toEqual([]);
  }
};

const coordinateText = [
  String(MADE_UP_SEA.latitude),
  String(MADE_UP_SEA.longitude),
  MADE_UP_SEA.latitude.toFixed(2),
  MADE_UP_SEA.longitude.toFixed(2)
];

const mentionsCoordinates = (text: string) =>
  coordinateText.some((value) => text.includes(value));

test('a pot dropped with a granted fix is listed under Gear and survives a reload', async ({
  page
}) => {
  const exposed: string[] = [];
  page.on('console', (message) => {
    exposed.push(message.text());
  });
  page.on('request', (request) => {
    exposed.push(request.url());
  });
  const gearRow = page
    .getByRole('main')
    .getByRole('listitem')
    .filter({ hasText: 'Pot 1' });
  const gearTab = page.getByRole('button', { name: 'Gear', exact: true });

  await page.goto('/');
  await expectAccessibleInBothThemes(page);

  await page.getByRole('button', { name: 'Turn on location' }).click();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(page.getByRole('status')).toContainText('Pot 1 dropped');
  await expectAccessibleInBothThemes(page);

  await gearTab.click();
  await expect(gearRow).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await page.reload();
  await gearTab.click();
  await expect(gearRow).toContainText('0 ft');

  exposed.push(page.url());
  expect(exposed.filter(mentionsCoordinates)).toEqual([]);
});
