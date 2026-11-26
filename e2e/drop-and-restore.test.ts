import { expect, tapsDuring, test, toastOf } from './fixtures';
import { MADE_UP_SEA } from '../playwright.config';
import { expectAccessibleInBothThemes } from './accessibility';

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
  const turnOnLocation = page.getByRole('button', { name: 'Turn on location' });

  await page.goto('/');
  await expect(turnOnLocation).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await turnOnLocation.click();
  await expect(page.getByText('Finding position')).toBeHidden();
  const dropTaps = await tapsDuring(page, async () => {
    await page.getByRole('button', { name: 'Drop pot' }).tap();
    await expect(toastOf(page)).toContainText('Pot 1 dropped');
  });
  expect(dropTaps, 'taps to drop with a fresh fix').toBe(1);
  await expectAccessibleInBothThemes(page);

  await gearTab.click();
  await expect(gearRow).toBeVisible();
  await expectAccessibleInBothThemes(page);

  await page.reload();
  await gearTab.click();
  await expect(gearRow).toContainText('At gear');

  exposed.push(page.url());
  expect(exposed.filter(mentionsCoordinates)).toEqual([]);
});
