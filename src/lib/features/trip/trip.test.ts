import { Effect } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { expect, it } from 'vitest';
import { gearInWater, openTripBook, type Fix, type TripBook } from './index';

const T0 = Date.UTC(2026, 5, 1, 13, 0, 0);
const SEA = { lat: 0, lon: -140 };

const harness = () => {
  const state: { now: number; fix: Fix | null } = { now: T0, fix: null };
  const idb = new IDBFactory();
  const deps = {
    clock: { now: () => state.now },
    positions: { latest: () => state.fix },
    idb
  };
  const open = () => Effect.runPromise(openTripBook(deps));
  return { state, open };
};

type Harness = ReturnType<typeof harness>;

const dropAt = async (
  book: TripBook,
  state: Harness['state'],
  kind: 'pot' | 'net',
  offset: { north: number; east: number } | null
) => {
  state.fix = offset
    ? {
        lat: SEA.lat + offset.north,
        lon: SEA.lon + offset.east,
        accuracyM: 5,
        at: state.now
      }
    : null;
  return run(book.placeDrop(kind));
};

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

it('records gear number, tap time and a fresh fix', async () => {
  const { state, open } = harness();
  state.fix = { ...SEA, accuracyM: 6, at: T0 - 3000 };
  const book = await open();

  const placed = await run(book.placeDrop('pot'));

  expect(placed.name).toBe('Pot 1');
  expect(placed.drop.placedAt).toBe(T0);
  expect(placed.drop.position).toEqual({ lat: 0, lon: -140, accuracyM: 6 });
  expect(placed.drop.noPosition).toBeNull();
  expect(placed.trip.startedAt).toBe(T0);
});

it('numbers each kind separately and never reuses an undone number', async () => {
  const { open } = harness();
  const book = await open();

  const names = [];
  names.push((await run(book.placeDrop('pot'))).name);
  const second = await run(book.placeDrop('pot'));
  names.push(second.name);
  names.push((await run(book.placeDrop('net'))).name);
  await run(book.undoDrop(second.drop.id));
  names.push((await run(book.placeDrop('pot'))).name);

  expect(names).toEqual(['Pot 1', 'Pot 2', 'Net 1', 'Pot 3']);
});

it('uses a fix exactly 5 s old but not one older than 5 s', async () => {
  const { state, open } = harness();
  const book = await open();

  state.fix = { ...SEA, accuracyM: 8, at: T0 - 5000 };
  const fresh = await run(book.placeDrop('pot'));
  state.fix = { ...SEA, accuracyM: 8, at: T0 - 5001 };
  const stale = await run(book.placeDrop('net'));

  expect(fresh.drop.position).toEqual({ lat: 0, lon: -140, accuracyM: 8 });
  expect(stale.drop.position).toBeNull();
  expect(stale.drop.noPosition).toBe('no-fix');
});

it('removes the drop but keeps the trip while other drops remain', async () => {
  const { open } = harness();
  const book = await open();
  const first = await run(book.placeDrop('pot'));
  const second = await run(book.placeDrop('net'));

  await run(book.undoDrop(second.drop.id));
  const active = await run(book.activeTrip());

  expect(active?.id).toBe(first.trip.id);
  expect(active?.drops.map((drop) => drop.id)).toEqual([first.drop.id]);
});

it('removes the trip with its only drop, so the next drop starts a new trip', async () => {
  const { open } = harness();
  const book = await open();
  const only = await run(book.placeDrop('pot'));

  await run(book.undoDrop(only.drop.id));
  const afterUndo = await run(book.activeTrip());
  const next = await run(book.placeDrop('pot'));

  expect(afterUndo).toBeNull();
  expect(next.trip.id).not.toBe(only.trip.id);
  expect(next.name).toBe('Pot 1');
});

it('restores the active trip from the same database', async () => {
  const { state, open } = harness();
  state.fix = { ...SEA, accuracyM: 5, at: T0 };
  const before = await open();
  const pot = await run(before.placeDrop('pot'));
  const net = await run(before.placeDrop('net'));

  const after = await open();
  const restored = await run(after.activeTrip());

  expect(restored).toEqual(net.trip);
  expect(restored?.drops.map((drop) => drop.id)).toEqual([
    pot.drop.id,
    net.drop.id
  ]);
});

it('sorts by great-circle distance with bearing, compass point and distance text', async () => {
  const { state, open } = harness();
  const book = await open();
  await dropAt(book, state, 'pot', { north: 0.001, east: -0.00005 });
  await dropAt(book, state, 'pot', { north: 0, east: 0.0002 });
  await dropAt(book, state, 'net', { north: -0.02, east: 0 });
  await dropAt(book, state, 'pot', { north: 0.001, east: 0.001 });
  await dropAt(book, state, 'net', { north: -0.0004, east: -0.001 });
  const last = await dropAt(book, state, 'net', null);

  const rows = gearInWater(last.trip, SEA, state.now);

  expect(
    rows.map((row) => [
      row.name,
      row.direction?.distance,
      row.direction?.distanceSpoken,
      row.direction?.point
    ])
  ).toEqual([
    ['Pot 2', '73 ft', '73 feet', 'east'],
    ['Pot 1', '370 ft', '370 feet', 'north'],
    ['Net 2', '390 ft', '390 feet', 'west-south-west'],
    ['Pot 3', '520 ft', '520 feet', 'north-east'],
    ['Net 1', '1.4 mi', '1.4 miles', 'south'],
    ['Net 3', undefined, undefined, undefined]
  ]);
  const bearings = rows.map((row) => row.direction?.bearingDeg ?? -1);
  expect(bearings[0]).toBeCloseTo(90, 3);
  expect(bearings[1]).toBeCloseTo(357.1, 1);
  expect(bearings[2]).toBeCloseTo(248.2, 1);
  expect(bearings[3]).toBeCloseTo(45, 3);
  expect(bearings[4]).toBeCloseTo(180, 3);
  expect(rows[2]?.direction?.feet).toBeCloseTo(392.9, 1);
});

it('formats time in the water as minutes, hours and days', async () => {
  const { state, open } = harness();
  const book = await open();
  const query = T0 + 27 * 60 * 60_000;
  await run(book.placeDrop('pot'));
  state.now = query - (2 * 60 + 20) * 60_000;
  await run(book.placeDrop('pot'));
  state.now = query - 45 * 60_000 - 30_000;
  const last = await run(book.placeDrop('pot'));

  const rows = gearInWater(last.trip, null, query);

  expect(
    rows.map((row) => [row.name, row.timeInWater.short, row.timeInWater.spoken])
  ).toEqual([
    ['Pot 1', '1d 3h', '1 day 3 hours'],
    ['Pot 2', '2h 20m', '2 hours 20 minutes'],
    ['Pot 3', '45m', '45 minutes']
  ]);
});
