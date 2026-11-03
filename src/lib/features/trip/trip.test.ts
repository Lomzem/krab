import { Effect } from 'effect';
import { IDBDatabase, IDBFactory, IDBTransaction } from 'fake-indexeddb';
import { afterEach, assert, expect, expectTypeOf, it, vi } from 'vitest';
import {
  canDropAgain,
  canUndoCollect,
  collectedGear,
  dayGroups,
  dayOf,
  dropsInDays,
  gearCounts,
  gearName,
  gearInWater,
  isMultiDay,
  nearestGear,
  openTripBook,
  tripDays,
  type DaySelection,
  type Drop,
  type DropEdit,
  type Fix,
  type NoPosition,
  type Position,
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
  return { state, idb, open, advance, report, deny };
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
  run((await run(book.placeDrop({ kind }))).result);

const dropAgain = async (book: TripBook, dropId: string) =>
  run((await run(book.placeDrop({ again: dropId }))).result);

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

  const attempt = await run(book.placeDrop({ kind: 'pot' }));
  const phaseAtTap = attempt.phase();
  advance(12_000);
  report({ lat: 0.0001, lon: -140, accuracyM: 9, at: state.now });
  const placed = await run(attempt.result);

  expect(phaseAtTap).toBe('acquiring');
  expect(attempt.phase()).toBe('settled');
  expect(placed.drop.placedAt).toBe(T0);
  expect(placed.drop.position).toEqual({
    lat: 0.0001,
    lon: -140,
    accuracyM: 9
  });
  expect(placed.drop.noPosition).toBeNull();
});

const drain = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 10);
  });

it('saves nothing until 20 s after the tap, then saves without a position', async () => {
  const { state, open, advance } = harness();
  state.fix = null;
  const book = await open();

  const attempt = await run(book.placeDrop({ kind: 'net' }));
  advance(19_999);
  await drain();
  expect(await run(book.activeTrip())).toBeNull();

  advance(1);
  await drain();
  const saved = await run(book.activeTrip());
  expect(saved?.gear).toMatchObject([{ kind: 'net', number: 1 }]);
  expect(saved?.drops).toMatchObject([
    { placedAt: T0, position: null, noPosition: 'no-fix' }
  ]);

  const placed = await run(attempt.result);
  expect(placed.name).toBe('Net 1');
});

it('stores nothing when the wait is cancelled, even if a fix arrives later', async () => {
  const { state, open, advance, report } = harness();
  state.fix = null;
  const book = await open();

  const attempt = await run(book.placeDrop({ kind: 'pot' }));
  advance(4000);
  attempt.cancel();
  const failure = await run(Effect.flip(attempt.result));
  report({ ...SEA, accuracyM: 5, at: state.now });
  advance(20_000);
  const active = await run(book.activeTrip());

  expect(failure._tag).toBe('DropCancelled');
  expect(attempt.phase()).toBe('settled');
  expect(active).toBeNull();
});

it('records the skipped reason when saved without a position during the wait', async () => {
  const { state, open, advance } = harness();
  state.fix = null;
  const book = await open();

  const attempt = await run(book.placeDrop({ kind: 'pot' }));
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

  const attempt = await run(book.placeDrop({ kind: 'pot' }));
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

  const attempt = await run(book.placeDrop({ kind: 'net' }));
  const phaseAtTap = attempt.phase();
  const placed = await run(attempt.result);

  expect(phaseAtTap).toBe('saving');
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

  const attempt = await run(book.placeDrop({ kind: 'pot' }));
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

type DropFields = Pick<
  Drop,
  'id' | 'gearId' | 'placedAt' | 'label' | 'bait' | 'depthFt' | 'notes'
>;

it('types a drop location as a position or a reason, never both or neither', () => {
  type Placed<L> = DropFields & { collectedAt: null; catch: null } & L;

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

it('types a catch as not recorded or both counts, never one count alone', () => {
  expectTypeOf<null>().toExtend<Drop['catch']>();
  expectTypeOf<{ kept: number; released: number }>().toExtend<Drop['catch']>();
  expectTypeOf<{ kept: number; released: null }>().not.toExtend<
    Drop['catch']
  >();
  expectTypeOf<{ kept: null; released: number }>().not.toExtend<
    DropEdit['catch']
  >();
  expectTypeOf<{ kept: number }>().not.toExtend<DropEdit['catch']>();
});

it('types a catch as belonging only to a collected drop', () => {
  type Pulled<C> = DropFields & { position: null; noPosition: 'skipped' } & C;
  type Counted = { kept: number; released: number };

  expectTypeOf<Pulled<{ collectedAt: null; catch: null }>>().toExtend<Drop>();
  expectTypeOf<Pulled<{ collectedAt: number; catch: null }>>().toExtend<Drop>();
  expectTypeOf<
    Pulled<{ collectedAt: number; catch: Counted }>
  >().toExtend<Drop>();
  expectTypeOf<
    Pulled<{ collectedAt: null; catch: Counted }>
  >().not.toExtend<Drop>();
});

it('fails a save on a connection that closed as not saved, and Retry saves it once on a fresh connection', async () => {
  const { open } = harness();
  const book = await open();
  closeConnectionAtNextTransaction();

  const attempt = await run(book.placeDrop({ kind: 'pot' }));
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

  const attempt = await run(book.placeDrop({ kind: 'pot' }));
  const failure = await run(Effect.flip(attempt.result));
  const active = await run(book.activeTrip());

  expect(failure._tag).toBe('DropNotSaved');
  expect(active).toBeNull();
});

it.each([
  [
    'both a position and a reason',
    { position: { ...SEA, accuracyM: 5 }, noPosition: 'denied' }
  ],
  [
    'a catch while its gear is in the water',
    { collectedAt: null, catch: { kept: 2, released: 1 } }
  ],
  ['a half-recorded catch', { catch: { kept: 2, released: null } }],
  ['a negative count', { catch: { kept: 0, released: -1 } }],
  ['a fractional count', { catch: { kept: 1.5, released: 0 } }]
])(
  'refuses a stored trip whose drop has %s, and writes nothing',
  async (_, broken) => {
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
          position: null,
          noPosition: 'skipped',
          label: '',
          bait: '',
          depthFt: null,
          notes: '',
          collectedAt: T0 + 60_000,
          catch: null,
          ...broken
        }
      ],
      next: { pot: 2, net: 1 }
    };
    await withStoredTrips(idb, 'readwrite', (trips) =>
      trips.put(contradictory)
    );

    const read = await run(Effect.flip(book.activeTrip()));
    const attempt = await run(book.placeDrop({ kind: 'pot' }));
    const failure = await run(Effect.flip(attempt.result));
    const stored = await withStoredTrips(idb, 'readonly', (trips) =>
      trips.getAll()
    );

    expect(read._tag).toBe('StorageFailed');
    expect(failure._tag).toBe('DropNotSaved');
    expect(stored).toEqual([contradictory]);
  }
);

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
  const fresh = await run(book.placeDrop({ kind: 'pot' }));
  const freshPhase = fresh.phase();
  const placed = await run(fresh.result);
  state.fix = { ...SEA, accuracyM: 8, at: T0 - 5001 };
  const stale = await run(book.placeDrop({ kind: 'net' }));

  expect(freshPhase).toBe('saving');
  expect(placed.drop.position).toEqual({ lat: 0, lon: -140, accuracyM: 8 });
  expect(stale.phase()).toBe('acquiring');
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

it('finds the nearest gear in the water with a position, skipping a closer collected drop even once its gear is dropped again, or none without my position', async () => {
  const { state, open } = harness();
  const book = await open();
  const pulled = await dropAt(book, state, 'pot', { north: 0.0001, east: 0 });
  await dropAt(book, state, 'pot', { north: 0.0005, east: 0 });
  await dropAt(book, state, 'net', null);
  await dropAt(book, state, 'net', { north: 0, east: 0.0003 });
  await run(book.collect(pulled.drop.id));
  state.fix = {
    lat: SEA.lat + 0.002,
    lon: SEA.lon,
    accuracyM: 5,
    at: state.now
  };
  const { trip } = await dropAgain(book, pulled.drop.id);

  const nearest = nearestGear(gearInWater(trip, SEA, state.now));

  expect(nearest?.name).toBe('Net 2');
  expect(nearest?.direction?.feet).toBeCloseTo(109.44, 1);
  expect(nearest?.direction?.bearingDeg).toBeCloseTo(90, 3);
  expect(nearestGear(gearInWater(trip, null, state.now))).toBeNull();
});

it('has no nearest gear when no gear in the water has a position', async () => {
  const { state, open } = harness();
  const book = await open();
  const last = await dropAt(book, state, 'pot', null);

  expect(nearestGear(gearInWater(last.trip, SEA, state.now))).toBeNull();
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
    book.saveDrop(
      placed.drop.id,
      {
        details: {
          label: '  red float ',
          bait: 'chicken',
          depthFt: 12.5,
          notes: ' by the buoy\n'
        },
        catch: null
      },
      null
    )
  );
  const rejected = await Promise.all(
    [-1, Number.NaN, Number.POSITIVE_INFINITY].map((depthFt) =>
      Effect.runPromise(
        Effect.flip(
          book.saveDrop(
            placed.drop.id,
            {
              details: { label: 'x', bait: 'x', depthFt, notes: 'x' },
              catch: null
            },
            null
          )
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

const NO_DETAILS: DropEdit = {
  details: { label: '', bait: '', depthFt: null, notes: '' },
  catch: null
};

it('changes kind to the next number of the new kind and never reuses the old one', async () => {
  const { open } = withoutLocation();
  const book = await open();
  await place(book, 'pot');
  const pot2 = await place(book, 'pot');
  await place(book, 'net');

  const names = [];
  names.push((await run(book.saveDrop(pot2.drop.id, NO_DETAILS, 'net'))).name);
  names.push((await place(book, 'pot')).name);
  names.push((await place(book, 'net')).name);
  names.push((await run(book.saveDrop(pot2.drop.id, NO_DETAILS, 'pot'))).name);

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
  catch: null
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

it('a Save whose kind is locked because the gear was dropped again stores none of its details', async () => {
  const { open } = withoutLocation();
  const book = await open();
  const first = await place(book, 'pot');
  await run(book.collect(first.drop.id));
  const second = await dropAgain(book, first.drop.id);
  const details = { label: 'red float', bait: 'squid', depthFt: 18, notes: '' };
  const edits: [string, DropEdit][] = [
    [first.drop.id, { details, catch: { kept: 2, released: 0 } }],
    [second.drop.id, { details, catch: null }]
  ];

  const refusals = await Promise.all(
    edits.map(([dropId, edit]) =>
      Effect.runPromise(Effect.flip(book.saveDrop(dropId, edit, 'net')))
    )
  );

  expect(refusals.map((failure) => failure._tag)).toEqual([
    'KindLocked',
    'KindLocked'
  ]);
  expect(await run(book.activeTrip())).toEqual(second.trip);
});

it('restores a deleted drop exactly once, in its original list position', async () => {
  const { open } = withoutLocation();
  const book = await open();
  const first = await place(book, 'pot');
  const middle = await place(book, 'net');
  await place(book, 'pot');
  const details = { label: 'blue', bait: 'squid', depthFt: 30, notes: '' };
  const { trip: before } = await run(
    book.saveDrop(middle.drop.id, { details, catch: null }, null)
  );

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

it('deletes and restores the only drop of a past trip, and the restored trip is stored', async () => {
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

  const stored: unknown = await withStoredTrips(idb, 'readonly', (trips) =>
    trips.get('trip-past')
  );

  expect([deleted.name, deleted.trip]).toEqual(['Net 4', null]);
  expect(restored.trip).toEqual(past);
  expect(stored).toEqual(past);
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

it('collects at the tap time once, and undo collect puts it back with no catch', async () => {
  const { state, open, advance } = withoutLocation();
  const book = await open();
  const pot = await place(book, 'pot');
  await place(book, 'net');

  advance(90 * 60_000);
  const collected = await run(book.collect(pot.drop.id));
  advance(5000);
  const again = await run(book.collect(pot.drop.id));
  await run(
    book.saveDrop(
      pot.drop.id,
      {
        details: { label: '', bait: '', depthFt: null, notes: '' },
        catch: { kept: 3, released: 1 }
      },
      null
    )
  );
  const undone = await run(book.undoCollect(pot.drop.id));
  const undoneAgain = await run(book.undoCollect(pot.drop.id));
  const stored = (await run(book.activeTrip()))?.drops[0];

  expect([collected.name, collected.changed, again.changed]).toEqual([
    'Pot 1',
    true,
    false
  ]);
  expect(again.trip.drops[0]?.collectedAt).toBe(T0 + 90 * 60_000);
  expect(
    gearInWater(again.trip, null, state.now).map((row) => row.name)
  ).toEqual(['Net 1']);
  expect([undone.changed, undoneAgain.changed]).toEqual([true, false]);
  expect(stored).toMatchObject({ collectedAt: null, catch: null });
  expect(
    gearInWater(undone.trip, null, state.now).map((row) => row.name)
  ).toEqual(['Pot 1', 'Net 1']);
});

it('records nothing caught as 0 and 0, apart from not recorded, and only whole counts from 0 up', async () => {
  const { open } = withoutLocation();
  const book = await open();
  const recorded = await place(book, 'pot');
  const skipped = await place(book, 'pot');
  const inWater = await place(book, 'net');
  await run(book.collect(recorded.drop.id));
  await run(book.collect(skipped.drop.id));
  const details = { label: 'red', bait: '', depthFt: null, notes: '' };
  const edit = (kept: number, released: number) =>
    Effect.runPromise(
      Effect.flip(
        book.saveDrop(
          recorded.drop.id,
          {
            details,
            catch: { kept, released }
          },
          null
        )
      )
    );

  await run(
    book.saveDrop(
      recorded.drop.id,
      {
        details,
        catch: { kept: 0, released: 0 }
      },
      null
    )
  );
  await run(book.saveDrop(skipped.drop.id, { details, catch: null }, null));
  const refusals = await Promise.all([
    edit(-1, 0),
    edit(0, 1.5),
    edit(Number.NaN, 0),
    edit(2, Number.POSITIVE_INFINITY)
  ]);
  const inWaterRefusal = await Effect.runPromise(
    Effect.flip(
      book.saveDrop(
        inWater.drop.id,
        {
          details,
          catch: { kept: 1, released: 0 }
        },
        null
      )
    )
  );
  const drops = (await run(book.activeTrip()))?.drops;

  expect(refusals.map((failure) => failure._tag)).toEqual([
    'InvalidCatch',
    'InvalidCatch',
    'InvalidCatch',
    'InvalidCatch'
  ]);
  expect(inWaterRefusal._tag).toBe('NotCollected');
  expect(drops?.map((drop) => [drop.label, drop.catch])).toEqual([
    ['red', { kept: 0, released: 0 }],
    ['red', null],
    ['', null]
  ]);
});

it('drops the same gear again from its latest collected drop with its number, label, bait and depth', async () => {
  const { open, advance } = withoutLocation();
  const book = await open();
  const pot = await place(book, 'pot');
  const net = await place(book, 'net');
  await run(book.collect(pot.drop.id));
  await run(
    book.saveDrop(
      pot.drop.id,
      {
        details: {
          label: 'red float',
          bait: 'squid',
          depthFt: 18,
          notes: 'ledge'
        },
        catch: { kept: 2, released: 0 }
      },
      null
    )
  );
  const collected = await run(book.activeTrip());
  const offeredWhenCollected = collected?.drops.map((drop) =>
    canDropAgain(collected, drop)
  );

  advance(10 * 60_000);
  const again = await dropAgain(book, pot.drop.id);
  const fromOlder = await Effect.runPromise(
    Effect.flip((await run(book.placeDrop({ again: pot.drop.id }))).result)
  );
  const fromInWater = await Effect.runPromise(
    Effect.flip((await run(book.placeDrop({ again: net.drop.id }))).result)
  );
  const next = await place(book, 'pot');
  const trip = next.trip;

  expect(again.name).toBe('Pot 1');
  expect(again.drop).toEqual({
    id: again.drop.id,
    gearId: pot.drop.gearId,
    placedAt: T0 + 10 * 60_000,
    position: null,
    noPosition: 'denied',
    label: 'red float',
    bait: 'squid',
    depthFt: 18,
    notes: '',
    collectedAt: null,
    catch: null
  });
  expect(again.drop.id).not.toBe(pot.drop.id);
  expect([fromOlder._tag, fromInWater._tag]).toEqual([
    'CannotDropAgain',
    'CannotDropAgain'
  ]);
  expect(next.name).toBe('Pot 2');
  expect(trip.gear).toHaveLength(3);
  expect(trip.drops.map((drop) => canDropAgain(trip, drop))).toEqual([
    false,
    false,
    false,
    false
  ]);
  expect(offeredWhenCollected).toEqual([true, false]);
});

it('offers drop again and undo collect only on the latest drop of the gear once it is collected', async () => {
  const { open } = withoutLocation();
  const book = await open();
  const first = await place(book, 'net');
  await run(book.collect(first.drop.id));
  const second = await dropAgain(book, first.drop.id);
  const collected = await run(book.collect(second.drop.id));

  const offered = collected.trip.drops.map((drop) => [
    canDropAgain(collected.trip, drop),
    canUndoCollect(collected.trip, drop)
  ]);
  const undoOlder = await Effect.runPromise(
    Effect.flip(book.undoCollect(first.drop.id))
  );

  expect(offered).toEqual([
    [false, false],
    [true, true]
  ]);
  expect(undoOlder._tag).toBe('DroppedAgain');
});

it('retries a failed drop again into exactly one new drop of the same gear', async () => {
  const { open } = withoutLocation();
  const book = await open();
  const first = await place(book, 'pot');
  await run(book.collect(first.drop.id));
  abortNextTransaction();

  const attempt = await run(book.placeDrop({ again: first.drop.id }));
  const failure = await run(Effect.flip(attempt.result));
  const retries =
    failure._tag === 'DropNotSaved'
      ? await Promise.all([run(failure.retry), run(failure.retry)])
      : [];
  const active = await run(book.activeTrip());

  expect(failure._tag).toBe('DropNotSaved');
  expect(retries.map((placed) => placed.name)).toEqual(['Pot 1', 'Pot 1']);
  expect(retries[1]?.drop).toEqual(retries[0]?.drop);
  expect(active?.drops.map((drop) => drop.gearId)).toEqual([
    first.drop.gearId,
    first.drop.gearId
  ]);
  expect(active?.drops[1]).toEqual(retries[0]?.drop);
});

it('counts gear in the water and collected drops from the records, newest collected first', async () => {
  const { open, advance } = withoutLocation();
  const book = await open();
  const nothing = { label: '', bait: '', depthFt: null, notes: '' };
  await place(book, 'pot');
  const pot2 = await place(book, 'pot');
  const net1 = await place(book, 'net');
  const net2 = await place(book, 'net');
  const undone = await place(book, 'pot');
  await run(book.undoDrop(undone.drop.id));
  const deleted = await place(book, 'pot');
  await run(book.collect(deleted.drop.id));
  await run(book.deleteDrop(deleted.drop.id));
  const single = gearCounts(net2.trip);
  advance(60_000);
  await run(book.collect(pot2.drop.id));
  await run(
    book.saveDrop(
      pot2.drop.id,
      {
        details: nothing,
        catch: { kept: 0, released: 0 }
      },
      null
    )
  );
  advance(60_000);
  await run(book.collect(net1.drop.id));
  await run(
    book.saveDrop(
      net1.drop.id,
      {
        details: nothing,
        catch: { kept: 4, released: 1 }
      },
      null
    )
  );
  await dropAgain(book, net1.drop.id);
  advance(60_000);
  const last = await run(book.collect(net2.drop.id));

  expect(single).toEqual({
    inWater: '4 in the water',
    collected: 'Nothing collected'
  });
  expect(gearCounts(last.trip)).toEqual({
    inWater: '2 in the water',
    collected: '3 collected'
  });
  expect(
    collectedGear(last.trip).map((row) => [row.name, row.catchText])
  ).toEqual([
    ['Net 2', 'Catch not recorded'],
    ['Net 1', '4 kept, 1 released'],
    ['Pot 2', 'Nothing caught']
  ]);
});

const nameOf = (trip: Trip, drop: Drop) => {
  const gear = trip.gear.find((item) => item.id === drop.gearId);
  return gear ? gearName(gear) : null;
};

const placeAt = async (
  book: TripBook,
  state: Harness['state'],
  localTime: string
) => {
  state.now = Date.parse(localTime);
  return place(book, 'pot');
};

it('gives a drop the local calendar date it was placed, so a drop just after local midnight starts Day 2', async () => {
  const { state, open } = withoutLocation();
  const book = await open();

  await placeAt(book, state, '2026-06-01T20:00:00-04:00');
  const lateEvening = await placeAt(book, state, '2026-06-01T23:50:00-04:00');
  const oneDay = lateEvening.trip;
  const afterMidnight = await placeAt(book, state, '2026-06-02T00:30:00-04:00');
  const { trip } = afterMidnight;

  expect(isMultiDay(oneDay)).toBe(false);
  expect(dayOf(oneDay, lateEvening.drop)).toBeNull();
  expect(tripDays(trip)).toEqual([1, 2]);
  expect(isMultiDay(trip)).toBe(true);
  expect(dayOf(trip, lateEvening.drop)).toEqual({ number: 1, text: 'Day 1' });
  expect(dayOf(trip, afterMidnight.drop)).toEqual({
    number: 2,
    text: 'Day 2'
  });
});

it.each([
  {
    change: 'clocks go forward',
    startedAt: '2026-03-07T09:00:00-05:00',
    placedAt: '2026-03-09T00:30:00-04:00',
    day: 3
  },
  {
    change: 'clocks go back',
    startedAt: '2026-10-31T00:30:00-04:00',
    placedAt: '2026-11-01T23:30:00-05:00',
    day: 2
  }
])(
  'counts calendar dates, not 24-hour spans, across the night the $change',
  async ({ startedAt, placedAt, day }) => {
    const { state, open } = withoutLocation();
    const book = await open();

    await placeAt(book, state, startedAt);
    const later = await placeAt(book, state, placedAt);

    expect(dayOf(later.trip, later.drop)?.number).toBe(day);
  }
);

it('numbers days from the date the trip started, keeping a gap day and a deleted first day, and a trip back to one date through Undo is one-day again', async () => {
  const { state, open } = withoutLocation();
  const book = await open();

  const first = await placeAt(book, state, '2026-07-10T06:00:00-04:00');
  const dayThree = await placeAt(book, state, '2026-07-12T07:00:00-04:00');
  const gap = dayThree.trip;
  const dayFour = await placeAt(book, state, '2026-07-13T05:00:00-04:00');
  const deleted = await run(book.deleteDrop(first.drop.id));
  const withoutFirst = deleted.trip;
  const undoneTo = await run(book.undoDrop(dayFour.drop.id));

  expect(tripDays(gap)).toEqual([1, 3]);
  expect(dayOf(gap, dayThree.drop)?.text).toBe('Day 3');
  assert(withoutFirst);
  expect(tripDays(withoutFirst)).toEqual([3, 4]);
  expect(dayOf(withoutFirst, dayFour.drop)?.text).toBe('Day 4');
  assert(undoneTo);
  expect(tripDays(undoneTo)).toEqual([3]);
  expect(isMultiDay(undoneTo)).toBe(false);
});

it('gear rows and collected rows carry the day of their drop on a multi-day trip', async () => {
  const { state, open } = withoutLocation();
  const book = await open();

  const pot1 = await placeAt(book, state, '2026-08-20T18:00:00-04:00');
  await placeAt(book, state, '2026-08-21T08:00:00-04:00');
  await placeAt(book, state, '2026-08-21T09:00:00-04:00');
  const { trip } = await run(book.collect(pot1.drop.id));
  const at = state.now;

  expect(
    gearInWater(trip, null, at).map((row) => [row.name, row.day?.text])
  ).toEqual([
    ['Pot 2', 'Day 2'],
    ['Pot 3', 'Day 2']
  ]);
  expect(collectedGear(trip).map((row) => [row.name, row.day?.text])).toEqual([
    ['Pot 1', 'Day 1']
  ]);
});

it('groups rows by day, oldest day first, keeping the order they came in within a day', async () => {
  const { state, open } = withoutLocation();
  const book = await open();

  const pot1 = await placeAt(book, state, '2026-08-20T18:00:00-04:00');
  const pot2 = await placeAt(book, state, '2026-08-20T19:00:00-04:00');
  const pot3 = await placeAt(book, state, '2026-08-21T08:00:00-04:00');
  const collectAt = async (id: string, localTime: string) => {
    state.now = Date.parse(localTime);
    return run(book.collect(id));
  };
  await collectAt(pot1.drop.id, '2026-08-21T09:00:00-04:00');
  await collectAt(pot2.drop.id, '2026-08-21T09:10:00-04:00');
  const { trip } = await collectAt(pot3.drop.id, '2026-08-21T09:20:00-04:00');

  const names = (rows: readonly { name: string }[]) =>
    rows.map(({ name }) => name);

  expect(
    dayGroups(collectedGear(trip)).map(({ day, rows }) => [
      day.text,
      names(rows)
    ])
  ).toEqual([
    ['Day 1', ['Pot 2', 'Pot 1']],
    ['Day 2', ['Pot 3']]
  ]);
});

it.each<{ selection: DaySelection; now: string; names: string[] }>([
  { selection: 'today', now: '2026-09-05T15:00:00-04:00', names: ['Pot 3'] },
  {
    selection: 'earlier',
    now: '2026-09-05T15:00:00-04:00',
    names: ['Pot 1', 'Pot 2']
  },
  {
    selection: 'all',
    now: '2026-09-05T15:00:00-04:00',
    names: ['Pot 1', 'Pot 2', 'Pot 3']
  },
  { selection: 'today', now: '2026-09-06T00:10:00-04:00', names: [] },
  {
    selection: 'earlier',
    now: '2026-09-06T00:10:00-04:00',
    names: ['Pot 1', 'Pot 2', 'Pot 3']
  }
])(
  'selects the drops placed $selection as of $now on a multi-day trip',
  async ({ selection, now, names }) => {
    const { state, open } = withoutLocation();
    const book = await open();
    await placeAt(book, state, '2026-09-04T10:00:00-04:00');
    await placeAt(book, state, '2026-09-04T23:59:00-04:00');
    const { trip } = await placeAt(book, state, '2026-09-05T00:00:00-04:00');

    const selected = dropsInDays(trip, selection, Date.parse(now));

    expect(selected.map((drop) => nameOf(trip, drop))).toEqual(names);
  }
);

it('selects every drop of a one-day trip whatever day is chosen, even when that day was yesterday', async () => {
  const { state, open } = withoutLocation();
  const book = await open();
  await placeAt(book, state, '2026-09-04T10:00:00-04:00');
  const { trip } = await placeAt(book, state, '2026-09-04T11:00:00-04:00');
  const nextMorning = Date.parse('2026-09-05T07:00:00-04:00');

  expect(dropsInDays(trip, 'today', nextMorning)).toHaveLength(2);
  expect(dropsInDays(trip, 'earlier', nextMorning)).toHaveLength(2);
});
