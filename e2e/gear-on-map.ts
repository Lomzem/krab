import type { Locator } from '@playwright/test';
import { expect } from './fixtures';

const GEAR = /^(?:Pot|Net) \d+\b/;
const GROUP = / \+\d+ more (?:here|in this area)/;

const buttonNames = async (area: Locator) =>
  [...(await area.ariaSnapshot()).matchAll(/- button "([^"]*)"/g)].map(
    ([, name]) => name
  );

const gearNames = async (map: Locator) =>
  (await buttonNames(map)).filter((name) => GEAR.test(name));

export type Spot = { name: string; gear: string[] };

const readSpots = async (map: Locator, names: string[]) => {
  const chooser = map.page().getByRole('dialog');
  const spots: Spot[] = [];
  for (const name of names) {
    if (!GROUP.test(name)) {
      spots.push({ name, gear: [GEAR.exec(name)?.[0] ?? name] });
      continue;
    }
    await map
      .getByRole('button', { name, exact: true })
      .dispatchEvent('click', undefined, { timeout: 1000 });
    const listed = await gearNames(chooser);
    spots.push({
      name,
      gear: listed.map((item) => GEAR.exec(item)?.[0] ?? item)
    });
    await chooser.getByRole('button', { name: 'Close' }).dispatchEvent('click');
    await expect(chooser).toHaveCount(0);
  }
  return spots;
};

const settledNames = async (map: Locator) => {
  let seen = '';
  let names: string[] = [];
  await expect
    .poll(async () => {
      names = await gearNames(map);
      const now = JSON.stringify(names);
      const same = now === seen;
      seen = now;
      return same;
    })
    .toBe(true);
  return names;
};

export const gearSpots = async (map: Locator) => {
  let spots: Spot[] = [];
  await expect(async () => {
    const names = await settledNames(map);
    const read = await readSpots(map, names);
    expect(await gearNames(map)).toEqual(names);
    spots = read;
  }).toPass({ timeout: 20000 });
  return spots;
};
