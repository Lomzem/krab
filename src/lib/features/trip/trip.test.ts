import { Effect } from 'effect';
import { IDBDatabase, IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import {
  gearInWater,
  nearestGear,
  openTripBook,
  type Drop,
  type Fix,
  type Trip,
  type TripBook
} from './index';

const T0 = Date.UTC(2026, 5, 1, 13, 0, 0);

afterEach(() => {
  vi.restoreAllMocks();
});
const SEA = { lat: 0, lon: -140 };

type Timer = { at: number; wake: () => void };

const harness = () => {
  const state: { now: number; fix: Fix | null; denied: boolean } = {
    now: T0,
    fix: { ...SEA, accuracyM: 5, at: T0 },
    denied: false
  };
  const timers = new Set<Timer>();
  const listeners = new Set<() => void>();
  const idb = new IDBFactory();
  const deps = {
    clock: {
      now: () => state.now,
      sleepUntil: (at: number) =>
        Effect.callback<undefined>((resume) => {
          const wake = () => {
            resume(Effect.succeed(undefined));
          };
          if (state.now >= at) {
            wake();
            return;
          }
          const timer = { at, wake };
          timers.add(timer);
          return Effect.sync(() => timers.delete(timer));
        })
    },
    positions: {
      latest: () => state.fix,
      denied: () => state.denied,
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }
    },
    idb
  };
  const tell = () => {
    for (const listener of [...listeners]) listener();
  };
  const advance = (ms: number) => {
    state.now += ms;
    for (const timer of [...timers]) {
      if (timer.at <= state.now) {
        timers.delete(timer);
        timer.wake();
      }
    }
  };
  const report = (fix: Fix) => {
    state.fix = fix;
    tell();
  };
  const deny = () => {
    state.denied = true;
    tell();
  };
  const open = () => Effect.runPromise(openTripBook(deps));
  return { state, open, advance, report, deny, idb };
};

type Harness = ReturnType<typeof harness>;

const withoutLocation = () => {
  const setup = harness();
  setup.state.fix = null;
  setup.state.denied = true;
  return setup;
};

const abortNextTransaction = () => {
  const spy = vi.spyOn(IDBDatabase.prototype, 'transaction');
  spy.mockImplementationOnce(function (
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    spy.mockRestore();
    const tx = this.transaction(...args);
    queueMicrotask(() => {
      tx.abort();
    });
    return tx;
  });
};

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const place = async (book: TripBook, kind: 'pot' | 'net') =>
  run((await run(book.placeDrop(kind))).result);

const dropAt = async (
  book: TripBook,
  state: Harness['state'],
  kind: 'pot' | 'net',
  offset: { north: number; east: number } | null
) => {
  state.denied = offset === null;
  state.fix = offset && {
    lat: SEA.lat + offset.north,
    lon: SEA.lon + offset.east,
    accuracyM: 5,
    at: state.now
  };
  return place(book, kind);
};

it('waits for a late fix and stores it with the tap time', async () => {
  const { state, open, advance, report } = harness();
  state.fix = null;
  const book = await open();

  const attempt = await run(book.placeDrop('pot'));
  const waitingAtTap = attempt.gettingPosition();
  advance(12_000);
  report({ lat: 0.0001, lon: -140, accuracyM: 9, at: state.now });
  const placed = await run(attempt.result);

  expect(waitingAtTap).toBe(true);
  expect(attempt.gettingPosition()).toBe(false);
  expect(placed.drop.placedAt).toBe(T0);
  expect(placed.drop.position).toEqual({
    lat: 0.0001,
    lon: -140,
    accuracyM: 9
  });
  expect(placed.drop.noPosition).toBeNull();
});

it('saves without a position 20 s after the tap when no fix arrives', async () => {
  const { state, open, advance } = harness();
  state.fix = null;
  const book = await open();

  const attempt = await run(book.placeDrop('net'));
  advance(19_999);
  const waitingJustBefore = attempt.gettingPosition();
  advance(1);
  const placed = await run(attempt.result);

  expect(waitingJustBefore).toBe(true);
  expect(placed.name).toBe('Net 1');
  expect(placed.drop.placedAt).toBe(T0);
  expect(placed.drop.position).toBeNull();
  expect(placed.drop.noPosition).toBe('no-fix');
});

it('stores nothing when the wait is cancelled, even if a fix arrives later', async () => {
  const { state, open, advance, report } = harness();
  state.fix = null;
  const book = await open();

  const attempt = await run(book.placeDrop('pot'));
  advance(4000);
  attempt.cancel();
  const failure = await run(Effect.flip(attempt.result));
  report({ ...SEA, accuracyM: 5, at: state.now });
  advance(20_000);
  const active = await run(book.activeTrip());

  expect(failure._tag).toBe('DropCancelled');
  expect(attempt.gettingPosition()).toBe(false);
  expect(active).toBeNull();
});

it('records the skipped reason when saved without a position during the wait', async () => {
  const { state, open, advance } = harness();
  state.fix = null;
  const book = await open();

  const attempt = await run(book.placeDrop('pot'));
  advance(3000);
  attempt.saveWithoutPosition();
  const placed = await run(attempt.result);
  const active = await run(book.activeTrip());

  expect(placed.drop.placedAt).toBe(T0);
  expect(placed.drop.position).toBeNull();
  expect(placed.drop.noPosition).toBe('skipped');
  expect(active?.drops).toEqual([placed.drop]);
});

it('records the denied reason without waiting, or as soon as location is denied', async () => {
  const { state, open, advance, deny } = harness();
  state.fix = null;
  const book = await open();

  const waiting = await run(book.placeDrop('pot'));
  advance(2000);
  deny();
  const deniedDuringWait = await run(waiting.result);
  const deniedAtTap = await run(book.placeDrop('net'));
  const waitedAtTap = deniedAtTap.gettingPosition();
  const placed = await run(deniedAtTap.result);

  expect(deniedDuringWait.drop.placedAt).toBe(T0);
  expect(deniedDuringWait.drop.noPosition).toBe('denied');
  expect(waitedAtTap).toBe(false);
  expect(placed.drop.position).toBeNull();
  expect(placed.drop.noPosition).toBe('denied');
});

it('flags a fix worse than 50 m as rough, in feet, on the drop and its gear row', async () => {
  const { state, open } = harness();
  const book = await open();

  state.fix = { ...SEA, accuracyM: 50, at: T0 };
  const exact = await place(book, 'pot');
  state.fix = { ...SEA, accuracyM: 51, at: T0 };
  const rough = await place(book, 'net');
  const rows = gearInWater(rough.trip, SEA, T0);

  expect(exact.rough).toBeNull();
  expect(rough.rough).toEqual({ short: '170 ft', spoken: '170 feet' });
  expect(rough.drop.position).toEqual({ lat: 0, lon: -140, accuracyM: 51 });
  expect(rows.map((row) => [row.name, row.rough?.short ?? null])).toEqual([
    ['Pot 1', null],
    ['Net 1', '170 ft']
  ]);
});

it('reports a failed save as not saved, stores nothing, and retries the same drop', async () => {
  const { state, open, advance, report } = harness();
  state.fix = { ...SEA, accuracyM: 7, at: T0 - 1000 };
  const book = await open();
  abortNextTransaction();

  const attempt = await run(book.placeDrop('pot'));
  const failure = await run(Effect.flip(attempt.result));
  const afterFailure = await run(book.activeTrip());
  advance(30_000);
  report({ lat: 0.01, lon: -140, accuracyM: 4, at: state.now });
  const retried =
    failure._tag === 'DropNotSaved' ? await run(failure.retry) : null;
  const active = await run(book.activeTrip());

  expect(failure._tag).toBe('DropNotSaved');
  expect(afterFailure).toBeNull();
  expect(retried?.name).toBe('Pot 1');
  expect(retried?.drop.placedAt).toBe(T0);
  expect(retried?.drop.position).toEqual({ lat: 0, lon: -140, accuracyM: 7 });
  expect(active?.drops).toEqual([retried?.drop]);
});

it('records gear number, tap time and a fresh fix', async () => {
  const { state, open } = harness();
  state.fix = { ...SEA, accuracyM: 6, at: T0 - 3000 };
  const book = await open();

  const placed = await place(book, 'pot');

  expect(placed.name).toBe('Pot 1');
  expect(placed.drop.placedAt).toBe(T0);
  expect(placed.drop.position).toEqual({ lat: 0, lon: -140, accuracyM: 6 });
  expect(placed.drop.noPosition).toBeNull();
  expect(placed.trip.startedAt).toBe(T0);
});

it('numbers each kind separately and never reuses an undone or deleted number', async () => {
  const { open } = harness();
  const book = await open();

  const names = [];
  names.push((await place(book, 'pot')).name);
  const second = await place(book, 'pot');
  names.push(second.name);
  const net = await place(book, 'net');
  names.push(net.name);
  await run(book.undoDrop(second.drop.id));
  names.push((await place(book, 'pot')).name);
  await run(book.deleteDrop(net.drop.id));
  names.push((await place(book, 'net')).name);

  expect(names).toEqual(['Pot 1', 'Pot 2', 'Net 1', 'Pot 3', 'Net 2']);
});

it('uses a fix exactly 5 s old at once, but waits when the fix is older', async () => {
  const { state, open } = harness();
  const book = await open();

  state.fix = { ...SEA, accuracyM: 8, at: T0 - 5000 };
  const fresh = await run(book.placeDrop('pot'));
  const freshWaits = fresh.gettingPosition();
  const placed = await run(fresh.result);
  state.fix = { ...SEA, accuracyM: 8, at: T0 - 5001 };
  const stale = await run(book.placeDrop('net'));

  expect(freshWaits).toBe(false);
  expect(placed.drop.position).toEqual({ lat: 0, lon: -140, accuracyM: 8 });
  expect(stale.gettingPosition()).toBe(true);
});

it('removes the drop but keeps the trip while other drops remain', async () => {
  const { open } = harness();
  const book = await open();
  const first = await place(book, 'pot');
  const second = await place(book, 'net');

  await run(book.undoDrop(second.drop.id));
  const active = await run(book.activeTrip());

  expect(active?.id).toBe(first.trip.id);
  expect(active?.drops.map((drop) => drop.id)).toEqual([first.drop.id]);
});

it('removes the trip with its only drop, so the next drop starts a new trip', async () => {
  const { open } = harness();
  const book = await open();
  const only = await place(book, 'pot');

  await run(book.undoDrop(only.drop.id));
  const afterUndo = await run(book.activeTrip());
  const next = await place(book, 'pot');

  expect(afterUndo).toBeNull();
  expect(next.trip.id).not.toBe(only.trip.id);
  expect(next.name).toBe('Pot 1');
});

it('restores the active trip from the same database', async () => {
  const { state, open } = harness();
  state.fix = { ...SEA, accuracyM: 5, at: T0 };
  const before = await open();
  const pot = await place(before, 'pot');
  const net = await place(before, 'net');

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

it('finds the nearest gear with a position, or none without my position', async () => {
  const { state, open } = harness();
  const book = await open();
  await dropAt(book, state, 'pot', { north: 0.0005, east: 0 });
  await dropAt(book, state, 'net', null);
  const last = await dropAt(book, state, 'net', { north: 0, east: 0.0003 });

  const nearest = nearestGear(last.trip, SEA, state.now);

  expect(nearest?.name).toBe('Net 2');
  expect(nearest?.direction?.feet).toBeCloseTo(109.44, 1);
  expect(nearest?.direction?.bearingDeg).toBeCloseTo(90, 3);
  expect(nearestGear(last.trip, null, state.now)).toBeNull();
});

it('has no nearest gear when no gear in the water has a position', async () => {
  const { state, open } = harness();
  const book = await open();
  const last = await dropAt(book, state, 'pot', null);

  expect(nearestGear(last.trip, SEA, state.now)).toBeNull();
});

it('formats time in the water as minutes, hours and days', async () => {
  const { state, open } = harness();
  const book = await open();
  const query = T0 + 27 * 60 * 60_000;
  state.denied = true;
  await place(book, 'pot');
  state.now = query - (2 * 60 + 20) * 60_000;
  await place(book, 'pot');
  state.now = query - 45 * 60_000 - 30_000;
  const last = await place(book, 'pot');

  const rows = gearInWater(last.trip, null, query);

  expect(
    rows.map((row) => [row.name, row.timeInWater.short, row.timeInWater.spoken])
  ).toEqual([
    ['Pot 1', '1d 3h', '1 day 3 hours'],
    ['Pot 2', '2h 20m', '2 hours 20 minutes'],
    ['Pot 3', '45m', '45 minutes']
  ]);
});

it('saves trimmed details and rejects a negative or non-numeric depth', async () => {
  const { open } = withoutLocation();
  const book = await open();
  const placed = await place(book, 'pot');

  await run(
    book.updateDrop(placed.drop.id, {
      details: {
        label: '  red float ',
        bait: 'chicken',
        depthFt: 12.5,
        notes: ' by the buoy\n'
      }
    })
  );
  const rejected = await Promise.all(
    [-1, Number.NaN, Number.POSITIVE_INFINITY].map((depthFt) =>
      Effect.runPromise(
        Effect.flip(
          book.updateDrop(placed.drop.id, {
            details: { label: 'x', bait: 'x', depthFt, notes: 'x' }
          })
        )
      )
    )
  );
  const stored = (await run(book.activeTrip()))?.drops[0];

  expect(rejected.map((failure) => failure._tag)).toEqual([
    'InvalidDepth',
    'InvalidDepth',
    'InvalidDepth'
  ]);
  expect(stored).toMatchObject({
    label: 'red float',
    bait: 'chicken',
    depthFt: 12.5,
    notes: 'by the buoy'
  });
});

it('changes kind to the next number of the new kind and never reuses the old one', async () => {
  const { open } = withoutLocation();
  const book = await open();
  await place(book, 'pot');
  const pot2 = await place(book, 'pot');
  await place(book, 'net');

  const names = [];
  names.push((await run(book.changeKind(pot2.drop.id, 'net'))).name);
  names.push((await place(book, 'pot')).name);
  names.push((await place(book, 'net')).name);
  names.push((await run(book.changeKind(pot2.drop.id, 'pot'))).name);

  expect(names).toEqual(['Net 2', 'Pot 3', 'Net 3', 'Pot 4']);
});

const storedDrop = (id: string, gearId: string, placedAt: number): Drop => ({
  id,
  gearId,
  placedAt,
  position: null,
  noPosition: 'skipped',
  label: '',
  bait: '',
  depthFt: null,
  notes: '',
  collectedAt: placedAt + 60_000,
  kept: null,
  released: null
});

const storeTrip = (idb: IDBFactory, trip: Trip) =>
  new Promise<void>((resolve, reject) => {
    const request = idb.open('krab');
    request.onsuccess = () => {
      const tx = request.result.transaction('trips', 'readwrite');
      tx.objectStore('trips').put(trip);
      tx.oncomplete = () => {
        request.result.close();
        resolve();
      };
      tx.onabort = () => {
        reject(tx.error ?? new Error('aborted'));
      };
    };
    request.onerror = () => {
      reject(request.error ?? new Error('not opened'));
    };
  });

it('blocks changing kind once the gear has been dropped again', async () => {
  const { open, idb } = withoutLocation();
  const book = await open();
  const trip: Trip = {
    id: 'trip-a',
    startedAt: T0,
    endedAt: null,
    gear: [{ id: 'gear-a', kind: 'pot', number: 1 }],
    drops: [
      storedDrop('drop-a', 'gear-a', T0),
      storedDrop('drop-b', 'gear-a', T0 + 3_600_000)
    ],
    next: { pot: 2, net: 1 }
  };
  await storeTrip(idb, trip);

  const refusals = await Promise.all(
    ['drop-a', 'drop-b'].map((dropId) =>
      Effect.runPromise(Effect.flip(book.changeKind(dropId, 'net')))
    )
  );

  expect(refusals.map((failure) => failure._tag)).toEqual([
    'KindLocked',
    'KindLocked'
  ]);
  expect(await run(book.activeTrip())).toEqual(trip);
});

it('restores a deleted drop exactly once, in its original list position', async () => {
  const { open } = withoutLocation();
  const book = await open();
  const first = await place(book, 'pot');
  const middle = await place(book, 'net');
  await place(book, 'pot');
  const details = { label: 'blue', bait: 'squid', depthFt: 30, notes: '' };
  const before = await run(book.updateDrop(middle.drop.id, { details }));

  const deleted = await run(book.deleteDrop(middle.drop.id));
  const during = await run(book.activeTrip());
  const restored = await run(book.restoreDrop(deleted.deletion));
  await run(book.restoreDrop(deleted.deletion));

  expect(deleted.name).toBe('Net 1');
  expect(during?.drops.map((drop) => drop.id)).toEqual([
    first.drop.id,
    before.drops[2]?.id
  ]);
  expect(during?.gear.map((gear) => gear.kind)).toEqual(['pot', 'pot']);
  expect(restored.name).toBe('Net 1');
  expect(await run(book.activeTrip())).toEqual(before);
});

it('removes the trip with its only drop, and restoring brings back the same trip', async () => {
  const { open } = withoutLocation();
  const book = await open();
  const pot1 = await place(book, 'pot');
  const pot2 = await place(book, 'pot');

  const second = await run(book.deleteDrop(pot2.drop.id));
  const only = await run(book.deleteDrop(pot1.drop.id));
  const emptied = await run(book.activeTrip());
  await run(book.restoreDrop(only.deletion));
  await run(book.restoreDrop(second.deletion));
  const next = await place(book, 'pot');

  expect(only.trip).toBeNull();
  expect(emptied).toBeNull();
  expect(next.trip.id).toBe(pot2.trip.id);
  expect(next.trip.drops.slice(0, 2)).toEqual(pot2.trip.drops);
  expect(next.name).toBe('Pot 3');
});

it('deletes and restores the only drop of a past trip', async () => {
  const { open, idb } = withoutLocation();
  const book = await open();
  const past: Trip = {
    id: 'trip-past',
    startedAt: T0 - 86_400_000,
    endedAt: T0 - 80_000_000,
    gear: [{ id: 'gear-p', kind: 'net', number: 4 }],
    drops: [storedDrop('drop-p', 'gear-p', T0 - 86_400_000)],
    next: { pot: 3, net: 5 }
  };
  await storeTrip(idb, past);
  const active = await place(book, 'pot');

  const deleted = await run(book.deleteDrop('drop-p'));
  const restored = await run(book.restoreDrop(deleted.deletion));
  await run(book.restoreDrop(deleted.deletion));

  expect([deleted.name, deleted.trip]).toEqual(['Net 4', null]);
  expect(restored.trip).toEqual(past);
  expect(await run(book.activeTrip())).toEqual(active.trip);
});

it('refuses to restore an emptied active trip after another trip has started', async () => {
  const { open } = withoutLocation();
  const book = await open();
  const only = await place(book, 'pot');
  const deleted = await run(book.deleteDrop(only.drop.id));
  const started = await place(book, 'net');

  const refusal = await Effect.runPromise(
    Effect.flip(book.restoreDrop(deleted.deletion))
  );

  expect(refusal._tag).toBe('AnotherTripActive');
  expect(await run(book.activeTrip())).toEqual(started.trip);
});
