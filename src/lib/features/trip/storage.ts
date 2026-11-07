import { Data, Effect, Result, Schema } from 'effect';
import { Trip } from './types';

export class StorageFailed extends Data.TaggedError('StorageFailed')<{
  readonly cause: unknown;
}> {}

const DATABASE = 'krab';
const VERSION = 1;
const TRIPS = 'trips';

const parseTrips = Schema.decodeUnknownResult(Schema.Array(Trip));

const failed = (cause: unknown) => new StorageFailed({ cause });

const abortQuietly = (tx: IDBTransaction | null) => {
  Result.try(() => {
    tx?.abort();
  });
};

const upgrade = (request: IDBOpenDBRequest) =>
  Result.try(() => request.result.createObjectStore(TRIPS, { keyPath: 'id' }));

const awaitOpen = (request: IDBOpenDBRequest) =>
  Effect.callback<IDBDatabase, StorageFailed>((resume) => {
    let upgradeFailure: unknown = null;
    request.onupgradeneeded = () => {
      const upgraded = upgrade(request);
      if (Result.isSuccess(upgraded)) return;
      upgradeFailure = upgraded.failure;
      abortQuietly(request.transaction);
    };
    request.onsuccess = () => {
      resume(Effect.succeed(request.result));
    };
    request.onerror = () => {
      resume(Effect.fail(failed(upgradeFailure ?? request.error)));
    };
  });

const openConnection = (idb: IDBFactory) =>
  Effect.flatMap(
    Effect.try({ try: () => idb.open(DATABASE, VERSION), catch: failed }),
    awaitOpen
  );

export type Change<A> = {
  put: Trip[];
  remove: string[];
  result: A;
};

export type Plan<A, E> = (
  trips: readonly Trip[]
) => Result.Result<Change<A>, E>;

type Started = {
  tx: IDBTransaction;
  order: number;
  store: IDBObjectStore;
  read: IDBRequest;
};

type Created = Pick<Started, 'tx' | 'order'>;

type Committed = (order: number, trips: readonly Trip[]) => void;

type Written<A> = { result: A; trips: readonly Trip[] };

const readAll = ({ tx, order }: Created) =>
  Effect.try({
    try: (): Started => {
      const store = tx.objectStore(TRIPS);
      return { tx, order, store, read: store.getAll() };
    },
    catch: (cause) => {
      abortQuietly(tx);
      return failed(cause);
    }
  });

const begin = (
  db: IDBDatabase,
  mode: IDBTransactionMode,
  number: () => number
) =>
  Effect.flatMap(
    Effect.try({
      try: (): Created => ({
        tx: db.transaction(TRIPS, mode),
        order: number()
      }),
      catch: failed
    }),
    readAll
  );

const changed = <A>(trips: readonly Trip[], change: Change<A>) => {
  const replaced = new Set([
    ...change.remove,
    ...change.put.map((trip) => trip.id)
  ]);
  return [...trips.filter((trip) => !replaced.has(trip.id)), ...change.put];
};

const apply = <A>(
  store: IDBObjectStore,
  trips: readonly Trip[],
  change: Change<A>
) =>
  Result.try({
    try: (): Written<A> => {
      for (const trip of change.put) store.put(trip);
      for (const id of change.remove) store.delete(id);
      return { result: change.result, trips: changed(trips, change) };
    },
    catch: failed
  });

const decide = <A, E>(plan: Plan<A, E>, trips: readonly Trip[]) =>
  Result.flatMap(
    Result.try({ try: () => plan(trips), catch: failed }),
    (planned: Result.Result<Change<A>, E>) => planned
  );

const writeChange = <A, E>(
  store: IDBObjectStore,
  plan: Plan<A, E>,
  rows: unknown
): Result.Result<Written<A>, E | StorageFailed> =>
  Result.flatMap(Result.mapError(parseTrips(rows), failed), (trips) =>
    Result.flatMap(decide(plan, trips), (change) => apply(store, trips, change))
  );

const finish = <A, E>(
  { tx, order, store, read }: Started,
  plan: Plan<A, E>,
  committed: Committed
) =>
  Effect.callback<A, E | StorageFailed>((resume) => {
    let outcome: Result.Result<Written<A>, E | StorageFailed> | null = null;
    const watched = Result.try({
      try: () => {
        tx.oncomplete = () => {
          if (!outcome || Result.isFailure(outcome)) {
            resume(Effect.fail(outcome?.failure ?? failed(tx.error)));
            return;
          }
          committed(order, outcome.success.trips);
          resume(Effect.succeed(outcome.success.result));
        };
        tx.onabort = () => {
          resume(
            Effect.fail(
              outcome && Result.isFailure(outcome)
                ? outcome.failure
                : failed(tx.error)
            )
          );
        };
        read.onsuccess = () => {
          outcome = writeChange(store, plan, read.result);
          if (Result.isFailure(outcome)) abortQuietly(tx);
        };
      },
      catch: failed
    });
    if (Result.isFailure(watched)) resume(Effect.fail(watched.failure));
  });

const isClosed = (failure: unknown) =>
  failure instanceof StorageFailed &&
  failure.cause instanceof DOMException &&
  failure.cause.name === 'InvalidStateError';

export type TripStorage = {
  readModifyWrite: <A, E = never>(
    plan: Plan<A, E>
  ) => Effect.Effect<A, E | StorageFailed>;
  readTrips: () => Effect.Effect<readonly Trip[], StorageFailed>;
};

const isolated =
  (stored: (trips: readonly Trip[]) => void) => (trips: readonly Trip[]) => {
    const told = Result.try(() => {
      stored(trips);
    });
    if (Result.isFailure(told)) reportError(told.failure);
  };

export const tripStorage = (
  idb: IDBFactory,
  stored: (trips: readonly Trip[]) => void
): TripStorage => {
  const tell = isolated(stored);
  let created = 0;
  let shown = 0;
  const committed: Committed = (order, trips) => {
    if (order <= shown) return;
    shown = order;
    tell(trips);
  };
  const number = () => {
    created += 1;
    return created;
  };
  let current: IDBDatabase | null = null;
  const forget = (db: IDBDatabase) => {
    if (current === db) current = null;
  };
  const keep = (db: IDBDatabase) => {
    if (current) {
      db.close();
      return current;
    }
    db.onversionchange = () => {
      db.close();
      forget(db);
    };
    db.onclose = () => {
      forget(db);
    };
    current = db;
    return db;
  };
  const connection = Effect.suspend(() =>
    current ? Effect.succeed(current) : Effect.map(openConnection(idb), keep)
  );
  const forgetIfClosed = (db: IDBDatabase) => (failure: unknown) =>
    Effect.sync(() => {
      if (isClosed(failure)) forget(db);
    });
  const transact = <A, E>(mode: IDBTransactionMode, plan: Plan<A, E>) =>
    Effect.flatMap(connection, (db) =>
      begin(db, mode, number).pipe(
        Effect.flatMap((started) => finish(started, plan, committed)),
        Effect.tapError(forgetIfClosed(db))
      )
    );
  return {
    readModifyWrite: (plan) => transact('readwrite', plan),
    readTrips: () =>
      transact('readonly', (trips) =>
        Result.succeed({ put: [], remove: [], result: trips })
      )
  };
};
