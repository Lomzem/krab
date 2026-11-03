import { Effect } from 'effect';
import { IDBDatabase, IDBFactory, IDBTransaction } from 'fake-indexeddb';
import { afterEach, assert, expect, expectTypeOf, it, vi } from 'vitest';
import {
  gearInWater,
  openTripBook,
  type Drop,
  type Fix,
  type NoPosition,
  type Position,
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
  return { state, idb, open, advance, report, deny };
};

type Harness = ReturnType<typeof harness>;

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

const closeConnectionAtNextTransaction = () => {
  const spy = vi.spyOn(IDBDatabase.prototype, 'transaction');
  spy.mockImplementationOnce(function (
    this: IDBDatabase,
    ...args: Parameters<IDBDatabase['transaction']>
  ) {
    spy.mockRestore();
    this.close();
    return this.transaction(...args);
  });
};

const request = <A>(make: () => IDBRequest<A>) =>
  new Promise<A>((resolve, reject) => {
    const pending = make();
    pending.onsuccess = () => {
      resolve(pending.result);
    };
    pending.onerror = () => {
      reject(pending.error ?? new Error('IndexedDB request failed'));
    };
  });

const withStoredTrips = async <A>(
  idb: IDBFactory,
  mode: IDBTransactionMode,
  use: (trips: IDBObjectStore) => IDBRequest<A>
) => {
  const db = await request(() => idb.open('krab', 1));
  const result = await request(() =>
    use(db.transaction('trips', mode).objectStore('trips'))
  );
  db.close();
  return result;
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

it('records the denied reason as soon as location is denied during the wait', async () => {
  const { state, open, advance, deny } = harness();
  state.fix = null;
  const book = await open();

  const attempt = await run(book.placeDrop('pot'));
  advance(2000);
  deny();
  const placed = await run(attempt.result);

  expect(placed.drop.placedAt).toBe(T0);
  expect(placed.drop.position).toBeNull();
  expect(placed.drop.noPosition).toBe('denied');
});

it('records the denied reason without waiting when location is denied, even over a fresh fix', async () => {
  const { state, open, report, deny } = harness();
  const book = await open();
  report({ ...SEA, accuracyM: 5, at: state.now });
  deny();

  const attempt = await run(book.placeDrop('net'));
  const waitedAtTap = attempt.gettingPosition();
  const placed = await run(attempt.result);

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

it('stores nothing when a save fails, and replaying its Retry saves that drop once under one number', async () => {
  const { state, open, advance, report } = harness();
  state.fix = { ...SEA, accuracyM: 7, at: T0 - 1000 };
  const book = await open();
  abortNextTransaction();

  const attempt = await run(book.placeDrop('pot'));
  const failure = await run(Effect.flip(attempt.result));
  const afterFailure = await run(book.activeTrip());
  assert(failure._tag === 'DropNotSaved');
  advance(30_000);
  report({ lat: 0.01, lon: -140, accuracyM: 4, at: state.now });
  const first = await run(failure.retry);
  const unrelated = await place(book, 'pot');
  const again = await run(failure.retry);
  const concurrent = await run(
    Effect.all([failure.retry, failure.retry], { concurrency: 'unbounded' })
  );
  const reopened = await run((await open()).activeTrip());
  const next = await place(book, 'pot');

  expect(afterFailure).toBeNull();
  expect(first.name).toBe('Pot 1');
  expect(first.drop.placedAt).toBe(T0);
  expect(first.drop.position).toEqual({ lat: 0, lon: -140, accuracyM: 7 });
  expect(
    [again, ...concurrent].map((replay) => [replay.drop.id, replay.name])
  ).toEqual([
    [first.drop.id, 'Pot 1'],
    [first.drop.id, 'Pot 1'],
    [first.drop.id, 'Pot 1']
  ]);
  expect(unrelated.name).toBe('Pot 2');
  expect(reopened?.drops).toEqual([first.drop, unrelated.drop]);
  expect(reopened?.gear.map((gear) => gear.number)).toEqual([1, 2]);
  expect(next.name).toBe('Pot 3');
});

it('types a drop location as a position or a reason, never both or neither', () => {
  type Placed<L> = Omit<Drop, 'position' | 'noPosition'> & L;

  expectTypeOf<
    Placed<{ position: Position; noPosition: null }>
  >().toExtend<Drop>();
  expectTypeOf<
    Placed<{ position: null; noPosition: NoPosition }>
  >().toExtend<Drop>();
  expectTypeOf<
    Placed<{ position: Position; noPosition: NoPosition }>
  >().not.toExtend<Drop>();
  expectTypeOf<
    Placed<{ position: null; noPosition: null }>
  >().not.toExtend<Drop>();
});

it('fails a save on a connection that closed as not saved, and Retry saves it once on a fresh connection', async () => {
  const { open } = harness();
  const book = await open();
  closeConnectionAtNextTransaction();

  const attempt = await run(book.placeDrop('pot'));
  const failure = await run(Effect.flip(attempt.result));
  assert(failure._tag === 'DropNotSaved');
  const retried = await run(failure.retry);
  const reopened = await run((await open()).activeTrip());

  expect(retried.name).toBe('Pot 1');
  expect(reopened?.drops).toEqual([retried.drop]);
});

it('lets another connection delete the database, then saves the next drop on a fresh connection', async () => {
  const { idb, open } = harness();
  const book = await open();
  await place(book, 'pot');

  await request(() => idb.deleteDatabase('krab'));
  const next = await place(book, 'net');
  const reopened = await run((await open()).activeTrip());

  expect(next.name).toBe('Net 1');
  expect(reopened?.drops).toEqual([next.drop]);
});

it('reports a storage error thrown while starting a save as not saved, and leaves nothing behind', async () => {
  const { open } = harness();
  const book = await open();
  const spy = vi.spyOn(IDBTransaction.prototype, 'objectStore');
  spy.mockImplementationOnce(function (this: IDBTransaction) {
    spy.mockRestore();
    return this.objectStore('a-store-that-was-never-created');
  });

  const attempt = await run(book.placeDrop('pot'));
  const failure = await run(Effect.flip(attempt.result));
  const active = await run(book.activeTrip());

  expect(failure._tag).toBe('DropNotSaved');
  expect(active).toBeNull();
});

it('refuses a stored trip whose drop has both a position and a reason, and writes nothing', async () => {
  const { idb, open } = harness();
  const book = await open();
  const contradictory = {
    id: 'stored-trip',
    startedAt: T0,
    endedAt: null,
    gear: [{ id: 'stored-gear', kind: 'pot', number: 1 }],
    drops: [
      {
        id: 'stored-drop',
        gearId: 'stored-gear',
        placedAt: T0,
        position: { ...SEA, accuracyM: 5 },
        noPosition: 'denied',
        label: '',
        bait: '',
        depthFt: null,
        notes: '',
        collectedAt: null,
        kept: null,
        released: null
      }
    ],
    next: { pot: 2, net: 1 }
  };
  await withStoredTrips(idb, 'readwrite', (trips) => trips.put(contradictory));

  const read = await run(Effect.flip(book.activeTrip()));
  const attempt = await run(book.placeDrop('pot'));
  const failure = await run(Effect.flip(attempt.result));
  const stored = await withStoredTrips(idb, 'readonly', (trips) =>
    trips.getAll()
  );

  expect(read._tag).toBe('StorageFailed');
  expect(failure._tag).toBe('DropNotSaved');
  expect(stored).toEqual([contradictory]);
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

it('numbers each kind separately and never reuses an undone number', async () => {
  const { open } = harness();
  const book = await open();

  const names = [];
  names.push((await place(book, 'pot')).name);
  const second = await place(book, 'pot');
  names.push(second.name);
  names.push((await place(book, 'net')).name);
  await run(book.undoDrop(second.drop.id));
  names.push((await place(book, 'pot')).name);

  expect(names).toEqual(['Pot 1', 'Pot 2', 'Net 1', 'Pot 3']);
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
