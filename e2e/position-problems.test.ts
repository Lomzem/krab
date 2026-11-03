import { expect, test, type Locator } from '@playwright/test';
import { expectAccessibleInBothThemes } from './accessibility';

const MIN_TARGET_PX = 44;

const expectTouchTarget = async (target: Locator) => {
  const box = await target.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(MIN_TARGET_PX);
  expect(box?.height).toBeGreaterThanOrEqual(MIN_TARGET_PX);
};

test.describe('with location denied', () => {
  test.use({ permissions: [] });

  test('a drop is saved without a position and Settings guidance shows', async ({
    page
  }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();

    const guidance = page.getByRole('region', { name: 'Location is off' });
    await expect(guidance).toContainText('Settings');
    await expectAccessibleInBothThemes(page);

    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(page.getByRole('status')).toContainText(
      'Pot 1 dropped without a position'
    );
    await expectAccessibleInBothThemes(page);

    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await expect(
      page.getByRole('main').getByRole('listitem').filter({ hasText: 'Pot 1' })
    ).toContainText('No position');
  });
});

test('while getting a position, Cancel and Save without position are reachable 44 px targets', async ({
  page
}) => {
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = () => 1;
    navigator.geolocation.clearWatch = () => undefined;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();

  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(
    page.getByRole('heading', { name: 'Getting position' })
  ).toBeFocused();
  const cancel = page.getByRole('button', { name: 'Cancel' });
  const save = page.getByRole('button', { name: 'Save without position' });
  await expectTouchTarget(cancel);
  await expectTouchTarget(save);
  await expectAccessibleInBothThemes(page);

  await save.click();
  await expect(page.getByRole('status')).toContainText(
    'dropped without a position'
  );
  await expect(page.getByRole('button', { name: /^Drop / })).toBeFocused();
});
