import { expect, it } from 'vitest';
import type { Drop, Trip } from '#lib/features/trip/index.js';
import { DEFAULT_MAP_FILTER, filterHides } from './map-filter';

const DAY_1 = new Date(2031, 5, 10, 22).getTime();
const DAY_2 = new Date(2031, 5, 11, 1).getTime();

const drop = (id: string, placedAt: number, collectedAt: number | null) =>
  ({
    id,
    gearId: 'pot-1',
    placedAt,
    position: null,
    noPosition: 'skipped',
    label: '',
    bait: '',
    depthFt: null,
    notes: '',
    collectedAt,
    catch: null
  }) as Drop;

const tripOf = (...drops: Drop[]): Trip => ({
  id: 'trip',
  startedAt: DAY_1,
  endedAt: null,
  gear: [{ id: 'pot-1', kind: 'pot', number: 1 }],
  drops,
  next: { pot: 2, net: 1 }
});

it('hides gear when a day choice narrows a multi-day trip', () => {
  const trip = tripOf(drop('a', DAY_1, null), drop('b', DAY_2, null));

  expect(filterHides({ ...DEFAULT_MAP_FILTER, days: 'today' }, trip)).toBe(
    true
  );
  expect(filterHides(DEFAULT_MAP_FILTER, trip)).toBe(false);
});

it('hides nothing with a day choice on a one-day trip', () => {
  const trip = tripOf(drop('a', DAY_1, null));

  expect(filterHides({ ...DEFAULT_MAP_FILTER, days: 'earlier' }, trip)).toBe(
    false
  );
});

it('hides gear when collected gear exists and is turned off', () => {
  const off = { ...DEFAULT_MAP_FILTER, collected: false };

  expect(filterHides(off, tripOf(drop('a', DAY_1, DAY_1 + 1)))).toBe(true);
  expect(filterHides(off, tripOf(drop('a', DAY_1, null)))).toBe(false);
});

it('hides nothing without an active trip', () => {
  expect(
    filterHides(
      { ...DEFAULT_MAP_FILTER, collected: false, days: 'today' },
      null
    )
  ).toBe(false);
});
