#!/usr/bin/env bun
import { expect, test } from './recipe';
import { doctor } from './doctor';
import { toastOf } from '../../e2e/fixtures';
import { recorder } from './evidence';
import { MADE_UP_SEA } from '../../playwright.config';

const TOUCH_TARGET_PX = 44;

test('without an iPhone compass the map shows no Compass chip', async ({
  page,
  context
}, info) => {
  const { log, capture, keep } = recorder(page, info, 'compass', 'Map');
  const requested: string[] = [];
  context.on('request', (request) => requested.push(request.url()));
  keep('doctor.json', doctor());
  log('doctor passed: our preview process owns 4173');
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  log('fresh context; made-up mid-ocean fix; Pot 1 dropped');

  const sensor = await page.evaluate(() => ({
    deviceOrientationEvent: typeof DeviceOrientationEvent !== 'undefined',
    requestPermission:
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof Reflect.get(DeviceOrientationEvent, 'requestPermission') ===
        'function'
  }));
  keep('sensor.json', sensor);
  log(`this WebKit's compass API: ${JSON.stringify(sensor)}`);

  const map = page.getByRole('region', { name: 'Map', exact: true });
  const toggle = map.getByRole('button', { name: 'Compass', exact: true });
  await expect(
    map.getByRole('button', { name: 'Chart map', exact: true })
  ).toBeVisible();
  await expect(toggle).toHaveCount(0);
  log('no iPhone compass here, so the capsule has no Compass chip');
  await capture('01-no-compass-chip');

  keep('requests.json', requested);
  log('kept every request URL of this journey');
});

test('the compass chip on an iPhone that denies motion access stays north-up', async ({
  page,
  context
}, info) => {
  const { log, capture } = recorder(page, info, 'compass-denied', 'Map');
  await context.addInitScript(() => {
    const asks = { count: 0 };
    Object.assign(window, { compassAsks: asks });
    Object.defineProperty(DeviceOrientationEvent, 'requestPermission', {
      value: () => {
        asks.count += 1;
        return Promise.resolve('denied');
      }
    });
    for (const field of ['webkitCompassHeading', 'webkitCompassAccuracy'])
      Object.defineProperty(DeviceOrientationEvent.prototype, field, {
        get: () => null
      });
  });
  log(
    'iPhone compass API answered by a stub that denies; no orientation events'
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding position')).toBeHidden();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');

  const toggle = page
    .getByRole('region', { name: 'Map', exact: true })
    .getByRole('button', { name: 'Compass', exact: true });
  const asked = () =>
    page.evaluate(() => {
      const asks: unknown = Reflect.get(window, 'compassAsks');
      const count: unknown =
        asks && typeof asks === 'object' ? Reflect.get(asks, 'count') : null;
      return typeof count === 'number' ? count : null;
    });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(toggle).toHaveAccessibleDescription('Compass off');
  const box = await toggle.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
  expect(box?.height).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
  expect(await asked()).toBe(0);
  log(`capsule chip Compass, not pressed, never asked, ${JSON.stringify(box)}`);
  await capture('01-compass-off');

  await toggle.click();
  await expect(toggle).toHaveAccessibleDescription('Motion access off');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await asked()).toBe(1);
  const remembered = await page.evaluate(() =>
    localStorage.getItem('krab.compass')
  );
  expect(remembered).toBe('off');
  log(
    `tap asked once: Motion access off, north-up; remembered ${String(remembered)}`
  );
  await capture('02-motion-access-off');

  await page.reload();
  await expect(toggle).toHaveAccessibleDescription('Compass off');
  expect(await asked()).toBe(0);
  log('reload: Compass off again, Krab did not ask on its own');
});
