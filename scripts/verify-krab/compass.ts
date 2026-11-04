#!/usr/bin/env bun
import { expect, test } from '@playwright/test';
import { doctor } from './doctor';
import { toastOf } from '../../e2e/fixtures';
import { recorder } from './evidence';
import { MADE_UP_SEA } from '../../playwright.config';

const TOUCH_TARGET_PX = 44;

test('the compass toggle without an iPhone compass stays north-up', async ({
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
  await expect(page.getByText('Position ready')).toBeVisible();
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

  const toggle = page.getByRole('button', {
    name: /^Compass off, gear to the /
  });
  await expect(toggle).toBeVisible();
  const box = await toggle.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
  expect(box?.height).toBeGreaterThanOrEqual(TOUCH_TARGET_PX);
  log(`nearest card toggle reads Compass off, ${JSON.stringify(box)}`);
  await capture('01-compass-off');

  await toggle.click();
  const unavailable = page.getByRole('button', {
    name: /^Compass unavailable, gear to the /
  });
  await expect(unavailable).toBeVisible();
  await expect(page.getByText('Compass needs calibrating')).toHaveCount(0);
  const remembered = await page.evaluate(() =>
    localStorage.getItem('krab.compass')
  );
  expect(remembered).toBe('off');
  log(`tap: Compass unavailable, north-up; remembered ${String(remembered)}`);
  await capture('02-compass-unavailable');

  await page.reload();
  await expect(
    page.getByRole('button', { name: /^Compass off, gear to the / })
  ).toBeVisible();
  log('reload: Compass off again, Krab did not ask on its own');

  keep('requests.json', requested);
  log('kept every request URL of this journey');
});
