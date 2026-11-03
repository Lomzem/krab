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

type Plan<A> = (trips: readonly Trip[]) => Change<A>;

type Started = { tx: IDBTransaction; store: IDBObjectStore; read: IDBRequest };

const readAll = (tx: IDBTransaction) =>
  Effect.try({
    try: (): Started => {
      const store = tx.objectStore(TRIPS);
      return { tx, store, read: store.getAll() };
    },
    catch: (cause) => {
      abortQuietly(tx);
      return failed(cause);
    }
  });

const begin = (db: IDBDatabase, mode: IDBTransactionMode) =>
  Effect.flatMap(
    Effect.try({ try: () => db.transaction(TRIPS, mode), catch: failed }),
    readAll
  );

const writeChange = <A>(store: IDBObjectStore, plan: Plan<A>, rows: unknown) =>
  Result.flatMap(parseTrips(rows), (trips) =>
    Result.try(() => {
      const change = plan(trips);
      for (const trip of change.put) store.put(trip);
      for (const id of change.remove) store.delete(id);
      return change.result;
    })
  );

const finish = <A>({ tx, store, read }: Started, plan: Plan<A>) =>
  Effect.callback<A, StorageFailed>((resume) => {
    let outcome: Result.Result<A, unknown> | null = null;
    read.onsuccess = () => {
      outcome = writeChange(store, plan, read.result);
      if (Result.isFailure(outcome)) abortQuietly(tx);
    };
    tx.oncomplete = () => {
      resume(
        outcome && Result.isSuccess(outcome)
          ? Effect.succeed(outcome.success)
          : Effect.fail(failed(outcome?.failure ?? tx.error))
      );
    };
    tx.onabort = () => {
      const cause =
        outcome && Result.isFailure(outcome) ? outcome.failure : tx.error;
      resume(Effect.fail(failed(cause)));
    };
  });

const isClosed = (cause: unknown) =>
  cause instanceof DOMException && cause.name === 'InvalidStateError';

export type TripStorage = {
  readModifyWrite: <A>(plan: Plan<A>) => Effect.Effect<A, StorageFailed>;
  readTrips: () => Effect.Effect<readonly Trip[], StorageFailed>;
};

const ownConnection = (idb: IDBFactory, first: IDBDatabase): TripStorage => {
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
  keep(first);
  const connection = Effect.suspend(() =>
    current ? Effect.succeed(current) : Effect.map(openConnection(idb), keep)
  );
  const forgetIfClosed = (db: IDBDatabase) => (failure: StorageFailed) =>
    Effect.sync(() => {
      if (isClosed(failure.cause)) forget(db);
    });
  const transact = <A>(mode: IDBTransactionMode, plan: Plan<A>) =>
    Effect.flatMap(connection, (db) =>
      begin(db, mode).pipe(
        Effect.flatMap((started) => finish(started, plan)),
        Effect.tapError(forgetIfClosed(db))
      )
    );
  return {
    readModifyWrite: (plan) => transact('readwrite', plan),
    readTrips: () =>
      transact('readonly', (trips) => ({ put: [], remove: [], result: trips }))
  };
};

export const openTripStorage = (idb: IDBFactory) =>
  Effect.map(openConnection(idb), (first) => ownConnection(idb, first));
