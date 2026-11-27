import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

export type Spot = { place: string; chooser: string | null; gear: string[] };

export const markerAt = (map: Locator, place: string) =>
  map.locator(`[data-place="${place}"]`).getByRole('button');

const press = (target: Locator) =>
  target.dispatchEvent('click', undefined, { timeout: 1000 });

const readSpot = async (map: Locator, place: string): Promise<Spot> => {
  const dialog = map.page().getByRole('dialog');
  const title = dialog.getByRole('heading', { level: 2 });
  await press(markerAt(map, place));
  await title.waitFor();
  const heading = (await title.innerText()).trim();
  const gear = await dialog
    .getByRole('list')
    .getByRole('button')
    .evaluateAll((choices) =>
      choices.map(
        (choice) =>
          (choice instanceof HTMLElement ? choice.innerText : '')
            .trim()
            .split('\n')[0] ?? ''
      )
    );
  await press(dialog.getByRole('button', { name: 'Close', exact: true }));
  await dialog.waitFor({ state: 'detached' });
  return gear.length === 0
    ? { place, chooser: null, gear: [heading] }
    : { place, chooser: heading, gear };
};

const placesOf = (map: Locator) =>
  map
    .locator('[data-place]')
    .evaluateAll((markers) =>
      markers.map((marker) => marker.getAttribute('data-place') ?? '')
    );

const settledPlaces = async (map: Locator) => {
  let seen = '';
  let places: string[] = [];
  await expect
    .poll(async () => {
      places = await placesOf(map);
      const now = JSON.stringify(places);
      const same = now === seen;
      seen = now;
      return same;
    })
    .toBe(true);
  return places;
};

const keepFocus = async (page: Page) => {
  const before = await page.evaluateHandle(() => document.activeElement);
  return () =>
    before.evaluate((element) => {
      if (
        element instanceof HTMLElement &&
        element !== document.body &&
        element.isConnected
      )
        element.focus();
      else if (document.activeElement instanceof HTMLElement)
        document.activeElement.blur();
    });
};

export const gearSpots = async (map: Locator) => {
  const restoreFocus = await keepFocus(map.page());
  let spots: Spot[] = [];
  await expect(async () => {
    const places = await settledPlaces(map);
    const read: Spot[] = [];
    for (const place of places) read.push(await readSpot(map, place));
    expect(await placesOf(map)).toEqual(places);
    expect(
      await map.locator('[data-place] button').count(),
      'one marker button for each place'
    ).toBe(places.length);
    spots = read;
  }).toPass({ timeout: 20000 });
  await restoreFocus();
  return spots;
};
