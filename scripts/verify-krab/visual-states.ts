#!/usr/bin/env bun
import { strict as assert } from 'node:assert';
import AxeBuilder from '@axe-core/playwright';
import type { Locator } from '@playwright/test';
import { test, expect, toastOf } from '../../e2e/fixtures';
import { holdFixes, deliverFix } from '../../e2e/held-geolocation';
import { MADE_UP_SEA } from '../../playwright.config';
import { doctor } from './doctor';
import { readTrips, recorder } from './evidence';

const EVENING = new Date('2031-06-10T23:40:00-04:00');

const catchGeometry = (sheet: Locator) =>
  sheet.evaluate((dialog, selector) => {
    const elements = [...dialog.querySelectorAll(selector)];
    const [first = dialog] = elements;
    const origin = first.getBoundingClientRect();
    return {
      scale: window.visualViewport?.scale ?? null,
      boxes: elements.map((element) => {
        const { x, y, width, height } = element.getBoundingClientRect();
        return {
          tag: element.tagName,
          x: x - origin.x,
          y: y - origin.y,
          width,
          height
        };
      })
    };
  }, 'section[aria-labelledby$="-catch-title"], section[aria-labelledby$="-catch-title"] > *, [role="group"] > *');

test('visual inventory through a dense overnight trip', async ({
  page
}, info) => {
  const { capture, keep, log } = recorder(page, info, 'visual-inventory', 'UI');
  keep('doctor.json', doctor());
  await holdFixes(page);
  await page.clock.install({ time: EVENING });
  await page.clock.pauseAt(EVENING);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Krab needs your location' })
  ).toBeVisible();
  await capture('01-location-explanation');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Finding your position')).toBeVisible();
  await capture('02-finding-position');
  const tab = (name: string) => page.getByRole('button', { name, exact: true });
  const sheet = page.getByRole('dialog');
  const checkFocus = async (name: string) => {
    const observations = [];
    for (const key of ['Tab', 'Shift+Tab']) {
      for (let step = 0; step < 16; step += 1) {
        await page.keyboard.press(key);
        const inside = await sheet.evaluate((element) =>
          element.contains(document.activeElement)
        );
        observations.push({ key, step, inside });
        keep(`focus-${name}.json`, observations);
        expect(inside).toBe(true);
      }
    }
  };
  const gear = page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: /\bPot 1\b/ });
  await tab('Gear').click();
  await capture('03-empty-gear');
  await tab('Past trips').click();
  await expect(page.getByText('No past trips yet.')).toBeVisible();
  await capture('04-empty-past-trips');
  await tab('Map').click();
  await capture('05-empty-map');
  await tab('Drop pot').click();
  await expect(
    page.getByRole('heading', { name: 'Getting position' })
  ).toBeVisible();
  await capture('05b-getting-position');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Getting position' })
  ).toBeHidden();
  log(
    'first-launch explanation, finding position, empty Gear, Past trips and Map'
  );

  for (let number = 1; number <= 8; number += 1) {
    if (number === 5) await page.clock.fastForward('30:00');
    await deliverFix(page, {
      latitude: MADE_UP_SEA.latitude + number * 0.001,
      longitude: MADE_UP_SEA.longitude
    });
    await expect(page.getByText('Position ready')).toBeVisible();
    await tab('Drop pot').click();
    await expect(toastOf(page)).toContainText(`Pot ${String(number)} dropped`);
    if (number === 1) await capture('06-drop-toast');
  }
  log(
    'eight real UI drops with made-up fixes; four each side of local midnight'
  );
  await page.clock.runFor(8001);
  await deliverFix(page, {
    latitude: MADE_UP_SEA.latitude + 0.008,
    longitude: MADE_UP_SEA.longitude
  });
  await page.clock.runFor(1500);
  await capture('07-dense-map');
  const mapRegion = page.getByRole('region', { name: 'Map', exact: true });
  const mixed = mapRegion.getByRole('button', {
    name: / gear in this area on Day 1 and Day 2: /
  });
  for (let outs = 0; outs < 8 && !(await mixed.isVisible()); outs += 1) {
    await mapRegion
      .getByRole('button', { name: 'Zoom out', exact: true })
      .click();
    await page.clock.runFor(1000);
  }
  await expect(mixed).toBeVisible();
  await capture('07b-mixed-day-group');
  await mixed.click();
  await expect(
    sheet.getByRole('button', { name: /Day 1/ }).first()
  ).toBeVisible();
  await expect(
    sheet.getByRole('button', { name: /Day 2/ }).first()
  ).toBeVisible();
  await capture('07c-mixed-day-group-list');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(mixed).toBeFocused();
  await mapRegion
    .getByRole('button', { name: 'Show all gear', exact: true })
    .click();
  await page.clock.runFor(1500);
  log(
    'zoomed out to a group holding Day 1 and Day 2 gear: its chip shows no single day, its name lists both days and its list shows each gear with its own day'
  );
  await tab('Gear').click();
  await expect(page.getByRole('region', { name: 'Day 2' })).toBeVisible();
  await capture('08-dense-gear-top');
  await gear.click();
  await expect(sheet.getByRole('heading', { name: 'Pot 1' })).toBeVisible();
  await capture('09-gear-sheet');
  await checkFocus('gear');
  await sheet
    .getByLabel('Label')
    .fill('Red float beside the northern channel marker');
  const depth = sheet.getByLabel('Depth');
  await depth.fill('-3');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(depth).toHaveAttribute('aria-invalid', 'true');
  await expect(depth).toBeFocused();
  const field = page.locator('[id$="-depth-field"]');
  const body = sheet.locator(':scope > div');
  const fieldBox = await field.boundingBox();
  const bodyBox = await body.boundingBox();
  assert.ok(fieldBox && bodyBox);
  expect(fieldBox.y).toBeGreaterThanOrEqual(bodyBox.y);
  expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual(
    bodyBox.y + bodyBox.height
  );
  keep('validation-geometry.json', { fieldBox, bodyBox });
  await capture('10-invalid-depth');
  await depth.fill('125.5');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await gear.click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  await expect(
    sheet.getByRole('heading', { name: 'Catch', exact: true })
  ).toBeVisible();
  await page.clock.runFor(8001);
  await capture('11a-catch-not-recorded');
  await sheet.getByRole('button', { name: 'One more kept' }).click();
  await sheet.getByRole('button', { name: 'One more released' }).click();
  await capture('11-catch-sheet');
  const kept = sheet.getByRole('textbox', { name: 'Kept' });
  const released = sheet.getByRole('textbox', { name: 'Released' });
  const beforeTaps = await catchGeometry(sheet);
  for (let tap = 0; tap < 12; tap += 1) {
    await sheet.getByRole('button', { name: 'One more kept' }).tap();
  }
  await expect(kept).toHaveValue('13');
  await released.fill('1400');
  const afterTaps = await catchGeometry(sheet);
  keep('catch-geometry.json', { beforeTaps, afterTaps });
  expect(afterTaps).toEqual(beforeTaps);
  await capture('11b-catch-multi-digit');
  await released.fill('');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(released).toBeFocused();
  await expect(released).toHaveAttribute('aria-invalid', 'true');
  await capture('11c-catch-invalid');
  await sheet.getByRole('button', { name: 'Nothing caught' }).click();
  await capture('11d-catch-nothing-caught');
  await kept.fill('1');
  await released.fill('1');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toBeHidden();
  await gear.scrollIntoViewIfNeeded();
  await capture('12-collected-and-long-label');
  log(
    'details validation, long saved label, collected catch (not recorded, stepped, 12 rapid taps plus a typed 1400, a refused blank count, Nothing caught) and dense list bottom'
  );

  await tab('Map').click();
  const map = page.getByRole('region', { name: 'Map', exact: true });
  await map.getByRole('button', { name: /^Filter/ }).click();
  await expect(
    sheet.getByRole('group', { name: 'Days on this trip' })
  ).toBeVisible();
  await capture('13-map-filter');
  await checkFocus('filter');
  await sheet.getByRole('button', { name: 'Done' }).click();
  await map.getByRole('button', { name: 'End trip' }).click();
  await expect(
    sheet.getByRole('heading', { name: 'End this trip?' })
  ).toBeVisible();
  await capture('14-end-confirmation');
  await checkFocus('end');
  await sheet.getByRole('button', { name: 'End trip', exact: true }).click();
  await expect(sheet).toBeHidden();
  await page.clock.runFor(8001);
  await tab('Past trips').click();
  const past = page.getByRole('main').getByRole('listitem').getByRole('button');
  await expect(past).toHaveCount(1);
  await capture('15-past-trips');
  await past.click();
  await expect(
    page.getByRole('button', { name: 'Delete trip', exact: true })
  ).toBeVisible();
  await capture('16-past-trip-detail');
  await page.getByRole('button', { name: 'Delete trip', exact: true }).click();
  await expect(
    sheet.getByRole('heading', { name: 'Delete this trip?' })
  ).toBeVisible();
  await capture('17-delete-confirmation');
  await checkFocus('delete');
  await sheet.getByRole('button', { name: 'Keep it' }).click();
  keep('indexeddb-after.json', await readTrips(page));
  log(
    'Map filter, end confirmation, past-trip list and detail, delete confirmation; keep trip'
  );
});

test('visual inventory with location denied', async ({
  page,
  context
}, info) => {
  const { capture, keep, log } = recorder(
    page,
    info,
    'visual-inventory',
    'Denied'
  );
  keep('doctor.json', doctor());
  await context.clearPermissions();
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(
    page.getByRole('region', { name: 'Location is off' })
  ).toBeVisible();
  await capture('01-location-denied');
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped without a position');
  await capture('02-no-position-toast');
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await expect(page.getByRole('main')).toContainText('No position');
  await capture('03-no-position-gear');
  await page
    .getByRole('button', { name: 'How to turn on in Settings' })
    .click();
  await expect(page.getByText(/Open Settings, then Privacy/)).toBeVisible();
  await capture('04-location-steps-expanded');
  await page.getByRole('button', { name: 'Hide steps' }).click();
  await expect(page.getByText(/Open Settings, then Privacy/)).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expect(toastOf(page)).toBeHidden({ timeout: 12000 });
  const row = page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: 'Pot 1' });
  await expect(row).toBeInViewport({ ratio: 1 });
  await capture('05-no-position-gear-toast-expired');
  const axe = await new AxeBuilder({ page }).analyze();
  keep('axe-denied-gear.json', axe);
  expect(axe.violations).toEqual([]);
  await row.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const focusObservations = [];
  for (let step = 0; step < 16; step += 1) {
    await page.keyboard.press('Tab');
    focusObservations.push(
      await page.getByRole('dialog').evaluate((element) => ({
        inside: element.contains(document.activeElement),
        tag: document.activeElement?.tagName
      }))
    );
  }
  keep('modal-tab-observations.json', focusObservations);
  expect(focusObservations.every((entry) => entry.inside)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  await capture('06-no-position-focus-restored');
  keep('indexeddb-after.json', await readTrips(page));
  log('location denied, drop without position, Gear guidance');
});
