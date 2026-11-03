import { expect, test } from '@playwright/test';

const PHONES = [
  {
    phone: 'without Screen Wake Lock',
    setup: () => {
      Reflect.deleteProperty(Navigator.prototype, 'wakeLock');
    }
  },
  {
    phone: 'that refuses to keep the screen on',
    setup: () => undefined
  }
];

for (const { phone, setup } of PHONES) {
  test(`a phone ${phone} still drops gear with no error`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    await page.addInitScript(setup);

    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();
    await expect(page.getByText('Position ready')).toBeVisible();
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(page.getByRole('status')).toContainText('Pot 1 dropped');
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(page.getByRole('status')).toContainText('Pot 2 dropped');

    expect(errors).toEqual([]);
  });
}
