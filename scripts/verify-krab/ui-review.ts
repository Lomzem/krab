#!/usr/bin/env bun
import { expect, test, type Locator, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { MADE_UP_SEA } from '../../playwright.config';
import { toastOf } from '../../e2e/fixtures';
import { deliverFix, holdFixes } from '../../e2e/held-geolocation';
import { doctor } from './doctor';
import { readTrips, recorder } from './evidence';

function measureCredits() {
  function channels(value: string) {
    return (value.match(/[\d.]+/g) ?? []).map(Number);
  }
  function linear(c: number) {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  function luminance([r = 0, g = 0, b = 0]: number[]) {
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  }
  function backdrop(element: Element) {
    const layers: number[][] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const colour = channels(getComputedStyle(node).backgroundColor);
      const alpha = colour.length > 3 ? (colour[3] ?? 1) : 1;
      if (alpha > 0) layers.unshift(colour.slice(0, 3).concat(alpha));
      if (alpha === 1) break;
    }
    let under = [255, 255, 255];
    for (const [r = 0, g = 0, b = 0, a = 1] of layers) {
      under = [
        r * a + (under[0] ?? 0) * (1 - a),
        g * a + (under[1] ?? 0) * (1 - a),
        b * a + (under[2] ?? 0) * (1 - a)
      ];
    }
    return under;
  }
  function ownText(element: Element) {
    let text = '';
    for (const node of element.childNodes)
      if (node.nodeType === 3) text += node.textContent ?? '';
    return text.trim();
  }
  const strip = document.querySelector('.maplibregl-ctrl-attrib');
  const parts = [];
  if (strip) {
    for (const element of [strip, ...strip.querySelectorAll('*')]) {
      const text = ownText(element);
      if (!text) continue;
      const style = getComputedStyle(element);
      const fg = luminance(channels(style.color));
      const bg = backdrop(element);
      const back = luminance(bg);
      parts.push({
        tag: element.tagName,
        text: text.slice(0, 60),
        color: style.color,
        background: `rgb(${bg.map(Math.round).join(', ')})`,
        ratio:
          Math.round(
            ((Math.max(fg, back) + 0.05) / (Math.min(fg, back) + 0.05)) * 100
          ) / 100
      });
    }
  }
  return { found: strip !== null, parts };
}

const creditsContrast = (page: Page) => page.evaluate(measureCredits);

function measureSheet(dialog: Element) {
  const paint = document.createElement('canvas').getContext('2d', {
    willReadFrequently: true
  });
  function rgba(value: string) {
    if (!paint) return [0, 0, 0, 0];
    paint.clearRect(0, 0, 1, 1);
    paint.fillStyle = '#000';
    paint.fillStyle = value;
    paint.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0, a = 0] = paint.getImageData(0, 0, 1, 1).data;
    return a === 0 ? [0, 0, 0, 0] : [r, g, b, a / 255];
  }
  function over(top: number[], under: number[]) {
    const a = top[3] ?? 0;
    return [0, 1, 2].map((i) => (top[i] ?? 0) * a + (under[i] ?? 0) * (1 - a));
  }
  function backdrop(element: Element) {
    const layers: number[][] = [];
    let opaque = false;
    for (let node: Element | null = element; node; node = node.parentElement) {
      const colour = rgba(getComputedStyle(node).backgroundColor);
      if ((colour[3] ?? 0) > 0) layers.unshift(colour);
      if (colour[3] === 1) {
        opaque = true;
        break;
      }
    }
    return {
      opaque,
      colour: layers.reduce((under, top) => over(top, under), [255, 255, 255])
    };
  }
  function linear(c: number) {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }
  function luminance([r = 0, g = 0, b = 0]: number[]) {
    return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  }
  function ratio(a: number[], b: number[]) {
    const hi = Math.max(luminance(a), luminance(b));
    const lo = Math.min(luminance(a), luminance(b));
    return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
  }
  function hue([r = 0, g = 0, b = 0]: number[]) {
    const hi = Math.max(r, g, b);
    const span = hi - Math.min(r, g, b);
    if (span === 0) return 0;
    if (hi === r) return (((g - b) / span) * 60 + 360) % 360;
    if (hi === g) return ((b - r) / span + 2) * 60;
    return ((r - g) / span + 4) * 60;
  }
  const show = (colour: number[]) =>
    `rgb(${colour.map((c) => Math.round(c)).join(', ')})`;
  const actions = [...dialog.querySelectorAll('button')]
    .filter((button) => /^(Save|Delete)\b/.test(button.textContent.trim()))
    .map((button) => {
      const style = getComputedStyle(button);
      const fill = backdrop(button);
      const around = backdrop(button.parentElement ?? dialog);
      const border =
        parseFloat(style.borderTopWidth) > 0
          ? over(rgba(style.borderTopColor), around.colour)
          : null;
      const text = over(rgba(style.color), fill.colour);
      return {
        name: button.textContent.trim(),
        bordered: border !== null,
        opaque: fill.opaque && around.opaque,
        text: show(text),
        fill: show(fill.colour),
        around: show(around.colour),
        textRatio: ratio(text, fill.colour),
        edgeRatio: border
          ? ratio(border, around.colour)
          : ratio(fill.colour, around.colour)
      };
    });
  const depth = dialog.querySelector<HTMLInputElement>(
    'input[inputmode="decimal"]'
  );
  const field = depth
    ? (() => {
        const style = getComputedStyle(depth);
        const card = backdrop(depth.parentElement ?? dialog).colour;
        const border = over(rgba(style.borderTopColor), card);
        const focus = over(rgba(style.outlineColor), card);
        return {
          focused: document.activeElement === depth,
          invalid: depth.getAttribute('aria-invalid'),
          borderWidth: style.borderTopWidth,
          outlineWidth: style.outlineWidth,
          outlineOffset: style.outlineOffset,
          outlineStyle: style.outlineStyle,
          border: show(border),
          focus: show(focus),
          card: show(card),
          borderRatio: ratio(border, card),
          focusRatio: ratio(focus, card),
          focusAgainstBorder: ratio(focus, border),
          hueApart: Math.round(
            180 - Math.abs(180 - Math.abs(hue(focus) - hue(border)))
          )
        };
      })()
    : null;
  return { actions, field };
}

function labelsOf(buttons: Element[]) {
  return buttons.map((button) => button.getAttribute('aria-label') ?? '');
}

function boxesOf(buttons: Element[]) {
  return buttons.map((button) => {
    const { x, y, width, height } = button.getBoundingClientRect();
    const top = document.elementFromPoint(x + width / 2, y + height / 2);
    return {
      name: button.getAttribute('aria-label'),
      x,
      y,
      width,
      height,
      uncovered: top?.closest('button') === button,
      onTop:
        top?.closest('[aria-label]')?.getAttribute('aria-label') ??
        top?.className.toString() ??
        null
    };
  });
}

const controlColours = (page: Page) =>
  page.getByRole('region', { name: 'Map', exact: true }).evaluate((region) =>
    [...region.querySelectorAll('button')]
      .filter((button) => button.closest('.maplibregl-marker') === null)
      .map((button) => {
        const style = getComputedStyle(button);
        const icon = button.querySelector('svg');
        const iconStyle = icon ? getComputedStyle(icon) : null;
        const { x, y, width, height } = button.getBoundingClientRect();
        return {
          name: button.getAttribute('aria-label') ?? button.textContent.trim(),
          box: { x, y, width, height },
          color: style.color,
          background: style.backgroundColor,
          opacity: style.opacity,
          visibility: style.visibility,
          iconStroke: iconStyle?.stroke ?? null,
          iconFill: iconStyle?.fill ?? null,
          iconOpacity: iconStyle?.opacity ?? null,
          onTop:
            document
              .elementFromPoint(x + width / 2, y + height / 2)
              ?.closest('button') === button
        };
      })
  );

const overlap = (
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null
) =>
  a !== null &&
  b !== null &&
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height;

const settledObservation = async <T>(observe: () => Promise<T>) => {
  let observed = await observe();
  let previous = '';
  await expect
    .poll(async () => {
      observed = await observe();
      const current = JSON.stringify(observed);
      const unchanged = current === previous;
      previous = current;
      return unchanged;
    })
    .toBe(true);
  return observed;
};

test('supplemental UI review with live maps and accessibility observations', async ({
  page,
  context
}, info) => {
  test.setTimeout(90000);
  const { capture, keep, log } = recorder(page, info, 'ui-review', 'Map');
  keep('doctor.json', doctor());
  await context.grantPermissions(['geolocation']);
  page.on('pageerror', (error) => {
    log(`pageerror: ${error.message}`);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') log(`console: ${message.text()}`);
  });
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  for (let number = 1; number <= 8; number += 1) {
    await context.setGeolocation({
      ...MADE_UP_SEA,
      latitude: MADE_UP_SEA.latitude + number * 0.001,
      accuracy: 8
    });
    await expect(page.getByText('Position ready')).toBeVisible();
    await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
    await expect(toastOf(page)).toContainText(`Pot ${String(number)} dropped`);
  }
  const credits = page.locator('.maplibregl-ctrl-attrib');
  const toastBox = await toastOf(page).boundingBox();
  const creditsBox = await credits.boundingBox();
  keep('toast-and-credits.json', {
    viewport: page.viewportSize(),
    toast: toastBox,
    credits: creditsBox
  });
  expect(overlap(toastBox, creditsBox)).toBe(false);
  await expect(credits).toBeInViewport();
  await capture('01a-toast-above-credits');
  await page.mouse.move(0, 0);
  await expect(toastOf(page)).toBeHidden({ timeout: 12000 });
  const map = page.getByRole('region', { name: 'Map', exact: true });
  const spots = map.getByRole('button', { name: /^Pot \d+[ ,]/ });
  const drawn = async () => {
    const names = await spots.evaluateAll(labelsOf);
    return names
      .map(
        (name) =>
          /gear (?:here|in this area)[^:]*: ([^;]*)/.exec(name)?.[1] ?? name
      )
      .flatMap((name) => name.match(/^Pot \d+|(?<=, )Pot \d+/g) ?? [])
      .toSorted((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  };
  await expect
    .poll(drawn)
    .toEqual(
      Array.from({ length: 8 }, (_, index) => `Pot ${String(index + 1)}`)
    );
  for (const spot of await spots.all()) await expect(spot).toBeInViewport();
  const overview = await settledObservation(() => spots.evaluateAll(boxesOf));
  keep('overview-spots.json', { viewport: page.viewportSize(), overview });
  for (const spot of overview)
    expect(spot.uncovered, spot.name ?? '').toBe(true);
  await capture('01-live-dense-chart');
  const compass = page.getByRole('button', { name: /^Compass off,/ });
  await compass.click();
  await expect(
    page.getByRole('button', { name: /^Compass unavailable,/ })
  ).toBeVisible();
  await capture('02-compass-unavailable');
  const axeMap = await new AxeBuilder({ page }).analyze();
  keep('axe-map.json', axeMap);
  expect(axeMap.violations).toEqual([]);
  const chartCredits = await creditsContrast(page);
  keep('credits-contrast-chart.json', chartCredits);
  expect(chartCredits.parts.length).toBeGreaterThan(0);
  for (const part of chartCredits.parts)
    expect(part.ratio, part.text).toBeGreaterThanOrEqual(4.5);
  const group = map.getByRole('button', { name: /\. 8 gear in this area: / });
  const zoomOut = map.getByRole('button', { name: 'Zoom out', exact: true });
  let outs = 0;
  await expect(async () => {
    if (!(await group.isVisible())) {
      await zoomOut.click();
      outs += 1;
    }
    await expect(group).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 30000 });
  await capture('03a-live-chart-group');
  const axeGroup = await new AxeBuilder({ page }).analyze();
  keep('axe-group.json', axeGroup);
  expect(axeGroup.violations).toEqual([]);
  await group.click();
  const sheet = page.getByRole('dialog');
  await expect(
    sheet.getByRole('heading', { name: '8 gear in this area' })
  ).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Pot \d+, / })).toHaveCount(
    8
  );
  await capture('03b-group-list');
  await sheet.getByRole('button', { name: /^Pot 5, / }).click();
  await expect(sheet.getByRole('heading', { level: 2 })).toHaveText('Pot 5');
  await capture('03c-group-member-sheet');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(group).toBeFocused();
  log(
    `Zoom out ${String(outs)} times: the eight pots become one group of 8 named in order; its list opens Pot 5's own sheet and Escape returns focus to the group`
  );
  for (let step = outs; step < 9; step += 1) await zoomOut.click();
  await capture('03-live-chart-wide');
  await map.getByRole('button', { name: 'Street map', exact: true }).click();
  await expect(map).toContainText('OpenStreetMap');
  await capture('04-live-street-wide');
  const streetCredits = await creditsContrast(page);
  keep('credits-contrast-street.json', streetCredits);
  expect(streetCredits.parts.length).toBeGreaterThan(0);
  for (const part of streetCredits.parts)
    expect(part.ratio, part.text).toBeGreaterThanOrEqual(4.5);
  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  const row = page
    .getByRole('main')
    .getByRole('button')
    .filter({ hasText: /\bPot 1\b/ });
  await row.click();
  const depth = sheet.getByLabel('Depth');
  await depth.fill('-3');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(depth).toBeFocused();
  const axeDepth = await new AxeBuilder({ page }).analyze();
  keep('axe-invalid-depth.json', axeDepth);
  expect(axeDepth.violations).toEqual([]);
  await capture('05-invalid-depth');
  const invalidSheet = await sheet.evaluate(measureSheet);
  keep('invalid-depth-sheet-contrast.json', invalidSheet);
  expect(
    invalidSheet.actions.map((action) => action.name.split(' ')[0]).sort()
  ).toEqual(['Delete', 'Save']);
  for (const action of invalidSheet.actions) {
    expect(action.opaque, action.name).toBe(true);
    expect(action.textRatio, action.name).toBeGreaterThanOrEqual(4.5);
    if (action.bordered)
      expect(action.edgeRatio, action.name).toBeGreaterThanOrEqual(3);
  }
  expect(invalidSheet.field).toMatchObject({
    focused: true,
    invalid: 'true'
  });
  expect(invalidSheet.field?.borderRatio).toBeGreaterThanOrEqual(3);
  expect(invalidSheet.field?.focusRatio).toBeGreaterThanOrEqual(3);
  expect(invalidSheet.field?.hueApart).toBeGreaterThanOrEqual(90);
  await sheet
    .getByLabel('Label')
    .fill('Red float beside the northern channel marker');
  await depth.fill('12.5');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(sheet).toBeHidden();
  await expect(row).toContainText(
    'Red float beside the northern channel marker'
  );
  await capture('06-long-label');
  await row.click();
  const focus = [];
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let step = 0; step < 18; step += 1) {
      await page.keyboard.press(key);
      const observation = await sheet.evaluate((element) => ({
        inside: element.contains(document.activeElement),
        tag: document.activeElement?.tagName,
        text: document.activeElement?.textContent,
        name: document.activeElement?.getAttribute('aria-label')
      }));
      focus.push({ key, step, ...observation });
      keep('keyboard-focus.json', focus);
      expect(observation.inside).toBe(true);
    }
  }
  keep('keyboard-focus.json', focus);
  await page.keyboard.press('Escape');
  await expect(row).toBeFocused();
  keep('enlargement.json', {
    method: 'CSS zoom on the root; not native iOS page zoom or Dynamic Type',
    captures: [1.5, 2],
    geometryProof: 'e2e/gear-sheet.test.ts'
  });
  await page.evaluate(() => {
    document.documentElement.style.zoom = '1.5';
  });
  await capture('07-css-zoom-150-percent');
  await page.evaluate(() => {
    document.documentElement.style.zoom = '2';
  });
  await row.scrollIntoViewIfNeeded();
  await capture('07-css-zoom-200-percent');
  await row.click();
  await expect(sheet).toBeVisible();
  await depth.fill('-3');
  await sheet.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(depth).toBeFocused();
  await capture('08-css-zoom-validation');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    document.documentElement.style.zoom = '';
  });
  keep('indexeddb-after.json', await readTrips(page));
  log(
    'Eight UI drops with fictional positions; live providers, compass unavailable, axe, validation, long label and modal Tab containment/restoration checked; CSS zoom at 150% and 200% captured. Drop-bar zoom geometry is owned by e2e/gear-sheet.test.ts. Native iPhone and native browser zoom remain separate limits.'
  );
});

test('Street controls after switching from Chart, right away, settled and after a pan', async ({
  page,
  context
}, info) => {
  test.setTimeout(90000);
  const { capture, keep, log } = recorder(
    page,
    info,
    'ui-review-street-controls',
    'Map'
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  const sizes = info.project.name.startsWith('narrow')
    ? [{ width: 320, height: 640 }]
    : [
        { width: 393, height: 852 },
        { width: 402, height: 681 }
      ];
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  const map = page.getByRole('region', { name: 'Map', exact: true });
  const observations = [];
  const controls = map.locator('button:not(.maplibregl-marker *)');
  const closeUps = async (state: string) => {
    const names = [];
    for (const [index, control] of (await controls.all()).entries()) {
      const name = `${state}-control-${String(index + 1)}.png`;
      await control.screenshot({
        path: info.outputPath(name),
        animations: 'disabled'
      });
      names.push({
        file: name,
        control:
          (await control.getAttribute('aria-label')) ??
          (await control.innerText())
      });
    }
    keep(`${state}-controls.json`, names);
  };
  for (const size of sizes) {
    await page.setViewportSize(size);
    const tag = `${String(size.width)}x${String(size.height)}`;
    const street = map.getByRole('button', { name: 'Street map', exact: true });
    if ((await street.getAttribute('aria-pressed')) === 'true') {
      await street.click();
      await expect(street).toHaveAttribute('aria-pressed', 'false');
      await expect(map).not.toContainText('OpenStreetMap');
    }
    await street.click();
    await capture(`street-${tag}-1-immediate`);
    await closeUps(`street-${tag}-1-immediate`);
    observations.push({
      size,
      camera:
        size === sizes[0]
          ? 'fresh page'
          : 'kept from the drag at the previous size, so no newest-drop reveal',
      when: 'immediate',
      controls: await controlColours(page)
    });
    await expect(map).toContainText('OpenStreetMap');
    await expect(street).toHaveAttribute('aria-pressed', 'true');
    await capture(`street-${tag}-2-settled`);
    await closeUps(`street-${tag}-2-settled`);
    observations.push({
      size,
      when: 'settled',
      controls: await controlColours(page)
    });
    const box = await map.locator('canvas').first().boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 - 90,
        box.y + box.height / 2 + 60,
        { steps: 8 }
      );
      await page.mouse.up();
    }
    await capture(`street-${tag}-3-after-pan`);
    await closeUps(`street-${tag}-3-after-pan`);
    observations.push({
      size,
      when: 'after pan',
      controls: await controlColours(page)
    });
    keep('street-controls.json', observations);
    for (const control of observations.flatMap((entry) => entry.controls)) {
      expect(control.visibility, control.name).toBe('visible');
      expect(control.opacity, control.name).toBe('1');
    }
  }
  log(
    `Chart then Street at ${sizes.map((size) => `${String(size.width)}x${String(size.height)}`).join(' and ')}: controls captured right away, after the street style settled and after a drag; each control also captured on its own at device pixels just after each full capture; computed colours kept in street-controls.json`
  );
});

function footprintOf(button: Element) {
  const marker = button.parentElement ?? button;
  let { left, top, right, bottom } = marker.getBoundingClientRect();
  for (const part of marker.querySelectorAll('*')) {
    const drawn = part.getBoundingClientRect();
    if (
      getComputedStyle(part).visibility !== 'visible' ||
      part.closest('.sr-only') ||
      drawn.width === 0 ||
      drawn.height === 0
    )
      continue;
    left = Math.min(left, drawn.left);
    top = Math.min(top, drawn.top);
    right = Math.max(right, drawn.right);
    bottom = Math.max(bottom, drawn.bottom);
  }
  const inset = 3;
  const tap = button.getBoundingClientRect();
  const probes = [
    [(tap.left + tap.right) / 2, (tap.top + tap.bottom) / 2],
    [tap.left + inset, tap.top + inset],
    [tap.right - inset, tap.top + inset],
    [tap.left + inset, tap.bottom - inset],
    [tap.right - inset, tap.bottom - inset]
  ].map(([x = 0, y = 0]) => {
    const hit = document.elementFromPoint(x, y);
    return {
      x,
      y,
      mine: hit !== null && marker.contains(hit),
      hit:
        hit?.closest('[aria-label]')?.getAttribute('aria-label') ??
        hit?.tagName ??
        null
    };
  });
  return { left, top, right, bottom, probes };
}

const rectOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  return box
    ? {
        left: box.x,
        top: box.y,
        right: box.x + box.width,
        bottom: box.y + box.height
      }
    : null;
};

type Rect = { left: number; top: number; right: number; bottom: number };

const touches = (a: Rect, b: Rect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

test('the newest drop stays drawn and tappable during Undo while the Offline notice shows', async ({
  page,
  context
}, info) => {
  test.setTimeout(90000);
  const { capture, keep, log } = recorder(
    page,
    info,
    'ui-review-newest-during-undo',
    'Map'
  );
  await context.grantPermissions(['geolocation']);
  await holdFixes(page);
  const size = info.project.name.startsWith('narrow')
    ? { width: 320, height: 640 }
    : { width: 402, height: 681 };
  const map = page.getByRole('region', { name: 'Map', exact: true });
  await page.setViewportSize(size);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  const ready = page.getByText('Position ready');
  await deliverFix(page, MADE_UP_SEA);
  await expect(ready).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await expect(map.getByRole('region', { name: 'Map view' })).toBeVisible();
  await context.setOffline(true);
  await map.getByRole('button', { name: 'Street map', exact: true }).click();
  const notice = map
    .getByRole('status')
    .filter({ hasText: "Offline. The map can't load." });
  await expect(notice).toBeVisible({ timeout: 15000 });
  await deliverFix(page, {
    ...MADE_UP_SEA,
    latitude: MADE_UP_SEA.latitude - 0.02
  });
  await expect(ready).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  const newest = map.getByRole('button', {
    name: /^(Pot 2,|Pot \d+ .*gear (?:here|in this area)[^:]*: .*\bPot 2\b)/
  });
  const during = await settledObservation(() => newest.evaluate(footprintOf));
  const tag = `${String(size.width)}x${String(size.height)}`;
  const covers = {
    toast: await rectOf(toastOf(page)),
    notice: await rectOf(notice),
    credits: await rectOf(page.locator('.maplibregl-ctrl-attrib'))
  };
  const view = await rectOf(map.getByRole('region', { name: 'Map view' }));
  await capture(`newest-${tag}-1-during-undo-and-notice`);
  await expect(toastOf(page)).toContainText('Pot 2 dropped');
  await expect(toastOf(page)).toBeHidden({ timeout: 12000 });
  const expired = await newest.evaluate(footprintOf);
  await capture(`newest-${tag}-2-after-undo-expires`);
  keep('newest-during-undo.json', { size, view, covers, during, expired });
  await context.setOffline(false);
  expect(covers.toast).not.toBeNull();
  expect(covers.notice).not.toBeNull();
  for (const [name, cover] of Object.entries(covers))
    if (cover)
      expect(touches(during, cover), `Pot 2 under ${name}`).toBe(false);
  expect(view).not.toBeNull();
  if (view) {
    expect(during.top).toBeGreaterThanOrEqual(view.top);
    expect(during.bottom).toBeLessThanOrEqual(view.bottom);
  }
  for (const probe of during.probes)
    expect(
      probe.mine,
      `${String(probe.x)},${String(probe.y)} hits ${String(probe.hit)}`
    ).toBe(true);
  expect(expired.left).toBe(during.left);
  expect(expired.top).toBe(during.top);
  log(
    `At ${tag}, offline Street shows the Offline notice; Pot 2, dropped south of Pot 1, is captured while its Undo toast shows, its whole marker and time label clear of toast, notice and credits, with the centre and four inset corners of its tap area all hitting it; after the toast expires it has not moved. Kept in newest-during-undo.json`
  );
});

test('a single newest drop and its time label stay clear of Undo on a fresh Chart to Street switch', async ({
  page,
  context
}, info) => {
  test.setTimeout(90000);
  const { capture, keep, log } = recorder(
    page,
    info,
    'ui-review-single-newest-street',
    'Map'
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ ...MADE_UP_SEA, accuracy: 8 });
  const size = info.project.name.startsWith('narrow')
    ? { width: 320, height: 640 }
    : { width: 402, height: 681 };
  const tag = `${String(size.width)}x${String(size.height)}`;
  const map = page.getByRole('region', { name: 'Map', exact: true });
  await page.setViewportSize(size);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  const pin = map.getByRole('button', { name: /^Pot 1,/ });
  await expect(pin).toBeVisible();
  const street = map.getByRole('button', { name: 'Street map', exact: true });
  const measure = async () => ({
    pin: await pin.evaluate(footprintOf),
    label: await rectOf(pin.locator('xpath=..').getByText(/\bmin\b|\bh\b|now/)),
    toast: await rectOf(toastOf(page)),
    credits: await rectOf(page.locator('.maplibregl-ctrl-attrib'))
  });
  await settledObservation(() => pin.evaluate(footprintOf));
  const chart = await measure();
  await capture(`single-${tag}-0-chart`);
  await street.click();
  const immediate = await measure();
  await capture(`single-${tag}-1-immediate`);
  await expect(map).toContainText('OpenStreetMap');
  await settledObservation(() => pin.evaluate(footprintOf));
  const settled = await measure();
  await capture(`single-${tag}-2-settled`);
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await expect(toastOf(page)).toBeHidden({ timeout: 12000 });
  const expired = { pin: await pin.evaluate(footprintOf) };
  await capture(`single-${tag}-3-after-undo-expires`);
  keep('single-newest-street.json', {
    size,
    chart,
    immediate,
    settled,
    expired
  });
  for (const [when, seen] of Object.entries({ chart, immediate, settled })) {
    expect(seen.label, `${when} time label`).not.toBeNull();
    for (const cover of ['toast', 'credits'] as const) {
      const box = seen[cover];
      if (box)
        expect(touches(seen.pin, box), `${when}: Pot 1 under ${cover}`).toBe(
          false
        );
    }
    for (const probe of seen.pin.probes)
      expect(
        probe.mine,
        `${when} ${String(probe.x)},${String(probe.y)} hits ${String(probe.hit)}`
      ).toBe(true);
  }
  expect(expired.pin.left).toBe(settled.pin.left);
  expect(expired.pin.top).toBe(settled.pin.top);
  log(
    `At ${tag}, a fresh page drops Pot 1 on Chart and switches to Street while Undo shows; right away and once settled, Pot 1's whole marker and time label stay clear of the toast and credits and its tap area hits it; after Undo expires the marker has not moved. Kept in single-newest-street.json`
  );
});

test('Trip ended leaves on its own with the real clock running', async ({
  page,
  context
}, info) => {
  const { capture, log } = recorder(
    page,
    info,
    'ui-review-trip-ended-expiry',
    'Map'
  );
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(MADE_UP_SEA);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  await page.getByRole('button', { name: 'Drop pot', exact: true }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await page.getByRole('button', { name: 'End trip' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: 'End trip' }).click();
  await expect(sheet).toBeHidden();
  const ended = toastOf(page).getByText('Trip ended. It is under Past trips.');
  await expect(ended).toBeVisible();
  const shownAt = Date.now();
  await capture('1-trip-ended-shown');
  await expect(ended).toBeHidden({ timeout: 10000 });
  const lasted = Date.now() - shownAt;
  await capture('2-trip-ended-gone');
  expect(lasted).toBeGreaterThan(3000);
  expect(lasted).toBeLessThan(6000);
  log(
    `With no fake clock, Trip ended showed then left by itself after about ${String(Math.round(lasted / 100) / 10)} s`
  );
});

function spotsOf(markers: Element[]) {
  return markers.map((marker) => {
    const button = marker.querySelector('button');
    const name = button?.getAttribute('aria-label') ?? '';
    const single = /^((?:Pot|Net) \d+),/.exec(name)?.[1];
    const listed = /gear (?:here|in this area)[^:]*: ([^;]*)/.exec(name)?.[1];
    return {
      key: marker.getAttribute('data-place'),
      gear: single ? [single] : (listed?.split(', ') ?? []),
      current: button?.getAttribute('aria-current') ?? null,
      focused: button !== null && button === document.activeElement
    };
  });
}

function nameOfFocused() {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return null;
  const named = focused.getAttribute('aria-label');
  if (named !== null) return named;
  const labelled = focused.getAttribute('aria-labelledby');
  let text = focused.textContent;
  if (labelled !== null) {
    text = '';
    for (const id of labelled.split(' '))
      text += ` ${document.getElementById(id)?.textContent ?? ''}`;
  }
  return text.replace(/\s+/g, ' ').trim();
}

function rectsOf(elements: Element[]) {
  return elements.map((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  });
}

function countFit(input: Element) {
  const field = input as HTMLInputElement;
  const { width, height } = field.getBoundingClientRect();
  return {
    value: field.value,
    fontSize: getComputedStyle(field).fontSize,
    scrollWidth: field.scrollWidth,
    clientWidth: field.clientWidth,
    scrollLeft: field.scrollLeft,
    width,
    height
  };
}

test('six drops in a line, the gear Show on map rings alone and in a group, and a five-digit released count', async ({
  page,
  context
}, info) => {
  test.setTimeout(120000);
  const { capture, keep, log } = recorder(
    page,
    info,
    'ui-review-six-in-a-line',
    'Map'
  );
  await context.grantPermissions(['geolocation']);
  await holdFixes(page);
  const map = page.getByRole('region', { name: 'Map', exact: true });
  const sheet = page.getByRole('dialog');
  const ready = page.getByText('Position ready');
  const names = ['Pot 1', 'Pot 2', 'Pot 3', 'Pot 4', 'Pot 5', 'Net 1'];
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  for (const [index, name] of names.entries()) {
    await deliverFix(page, {
      latitude: MADE_UP_SEA.latitude + index * 0.0012,
      longitude: MADE_UP_SEA.longitude + index * 0.0004
    });
    await expect(ready).toBeVisible();
    const kind = name.startsWith('Net') ? 'Net' : 'Pot';
    await page
      .getByRole('group', { name: 'Gear to drop' })
      .getByText(kind, { exact: true })
      .click();
    await page
      .getByRole('button', { name: `Drop ${kind.toLowerCase()}` })
      .click();
    await expect(toastOf(page)).toContainText(`${name} dropped`);
  }
  await expect
    .poll(async () => (await readTrips(page))[0]?.drops.length)
    .toBe(6);
  const markers = map.locator('.maplibregl-marker[data-place]');
  const settledSpots = () =>
    settledObservation(() => markers.evaluateAll(spotsOf));
  const chain: Record<string, ReturnType<typeof spotsOf>> = {};
  const expectEveryDropOnce = async (state: string) => {
    const spots = await settledSpots();
    chain[state] = spots;
    await capture(state);
    expect(spots.filter(({ gear }) => gear.length === 0)).toEqual([]);
    expect(spots.flatMap(({ gear }) => gear).toSorted()).toEqual(
      names.toSorted()
    );
  };
  await expectEveryDropOnce('six-1-during-undo');
  await expect(toastOf(page)).toBeHidden({ timeout: 12000 });
  await expectEveryDropOnce('six-2-settled');
  const zoomIn = map.getByRole('button', { name: 'Zoom in' });
  const zoomOut = map.getByRole('button', { name: 'Zoom out' });
  await zoomIn.click();
  await expectEveryDropOnce('six-3-zoomed-in');
  await zoomOut.click();
  await expectEveryDropOnce('six-4-zoomed-back');
  await zoomOut.click();
  await expectEveryDropOnce('six-5-zoomed-out');
  await map.getByRole('button', { name: 'Show all gear' }).click();
  await expectEveryDropOnce('six-6-show-all');
  keep('six-in-a-line.json', chain);

  const gearRow = (name: string) =>
    page.getByRole('main').getByRole('button').filter({ hasText: name });
  const showFromGear = async (name: string) => {
    await page.getByRole('button', { name: 'Gear', exact: true }).click();
    await gearRow(name).click();
    await sheet.getByRole('button', { name: 'Show on map' }).click();
    await expect(sheet).toHaveCount(0);
  };
  const selection: Record<string, ReturnType<typeof spotsOf>> = {};
  const pot3 = map.getByRole('button', { name: /^Pot 3,/ });
  await showFromGear('Pot 3');
  await expect(pot3).toBeFocused();
  selection['selected-1-single-focused'] = await settledSpots();
  await capture('selected-1-single-focused');
  await page.keyboard.press('Tab');
  await expect(pot3).not.toBeFocused();
  await expect(pot3).toHaveAttribute('aria-current', 'true');
  selection['selected-2-single-focus-moved'] = await settledSpots();
  await capture('selected-2-single-focus-moved');

  await deliverFix(page, MADE_UP_SEA);
  await expect(ready).toBeVisible();
  await page
    .getByRole('group', { name: 'Gear to drop' })
    .getByText('Pot', { exact: true })
    .click();
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 6 dropped');
  await expect(toastOf(page)).toBeHidden({ timeout: 12000 });
  const ledByPot6 = map.getByRole('button', { name: /^Pot 6 \+/ });
  await showFromGear('Pot 6');
  await expect(ledByPot6).toBeFocused();
  await expect(ledByPot6).toHaveAttribute('aria-current', 'true');
  selection['selected-3-group-focused'] = await settledSpots();
  await capture('selected-3-group-focused');
  const mapView = map.getByRole('region', { name: 'Map view' });
  for (const key of ['ArrowRight', 'ArrowDown']) await mapView.press(key);
  await expect(map.locator('[aria-current="true"]')).toHaveCount(0);
  selection['selected-4-cleared-after-pan'] = await settledSpots();
  await capture('selected-4-cleared-after-pan');
  keep('show-on-map-selection.json', selection);

  await map.getByRole('button', { name: /^Filter/ }).click();
  const focusedName = () => page.evaluate(nameOfFocused);
  const tabOrder = [await focusedName()];
  for (let press = 0; press < 12; press += 1) {
    await page.keyboard.press('Tab');
    tabOrder.push(await focusedName());
    if (tabOrder.at(-1) === tabOrder[0]) break;
  }
  await page.keyboard.press('Shift+Tab');
  const shiftTabFromClose = await focusedName();
  keep('filter-sheet-tab-order.json', { tabOrder, shiftTabFromClose });
  await capture('filter-sheet');
  expect(tabOrder[0]).toBe('Close');
  expect(tabOrder.at(-1)).toBe('Close');
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);

  await page.getByRole('button', { name: 'Gear', exact: true }).click();
  await gearRow('Pot 2').click();
  await sheet.getByRole('button', { name: 'Collect', exact: true }).click();
  const released = sheet.getByRole('textbox', { name: 'Released' });
  await sheet.getByRole('button', { name: 'One more released' }).click();
  const one = await released.evaluate(countFit);
  const stepsOf = () =>
    sheet
      .getByRole('button', { name: /^One (more|fewer) released$/ })
      .evaluateAll(rectsOf);
  const stepsAtOne = await stepsOf();
  await released.fill('12345');
  await page.keyboard.press('Tab');
  const five = await released.evaluate(countFit);
  const stepsAtFive = await stepsOf();
  await capture('catch-1-five-digit-released-blurred');
  await sheet.getByRole('button', { name: 'Save' }).click();
  await expect(sheet).toHaveCount(0);
  const [trip] = await readTrips(page);
  const pot2 = trip.gear.find(
    ({ kind, number }) => kind === 'pot' && number === 2
  );
  const stored = trip.drops.find(({ gearId }) => gearId === pot2?.id)?.catch;
  await gearRow('Pot 2').click();
  await expect(released).toHaveValue('12345');
  const reopened = await released.evaluate(countFit);
  await capture('catch-2-reopened');
  keep('five-digit-count.json', {
    one,
    five,
    reopened,
    stepsAtOne,
    stepsAtFive,
    stored: stored ?? null
  });
  expect(five.scrollWidth).toBeLessThanOrEqual(five.clientWidth);
  expect(reopened.scrollWidth).toBeLessThanOrEqual(reopened.clientWidth);
  expect(Number.parseFloat(five.fontSize)).toBeGreaterThanOrEqual(16);
  expect({ width: five.width, height: five.height }).toEqual({
    width: one.width,
    height: one.height
  });
  expect(stepsAtFive).toEqual(stepsAtOne);
  expect(stored).toEqual({ kept: 0, released: 12345 });
  log(
    'Six drops created through the UI 0.0012 N and 0.0004 E apart (five pots then a net) are each drawn once, alone or in a group of several, with no empty marker, while Undo shows, once settled, zoomed in, back, further out and after Show all gear (six-in-a-line.json). Show on map rings Pot 3 alone while focused and after focus moves on, then a group led by Pot 6 sharing Pot 1 position; a keyboard pan clears the ring (show-on-map-selection.json). Released 12345 fits its unchanged field with steppers unmoved, is saved and reads back on reopening (five-digit-count.json).'
  );
});
