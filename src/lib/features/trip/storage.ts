import { Data, Effect, Result } from 'effect';
import type { Trip } from './types';

export class StorageFailed extends Data.TaggedError('StorageFailed')<{
  readonly cause: unknown;
}> {}

const DATABASE = 'krab';
const VERSION = 1;
const TRIPS = 'trips';

const upgrade = (request: IDBOpenDBRequest) => {
  request.result.createObjectStore(TRIPS, { keyPath: 'id' });
};

const closeOnVersionChange = (db: IDBDatabase) => {
  db.onversionchange = () => {
    db.close();
  };
  return db;
};

const openRequest = (idb: IDBFactory) =>
  Effect.try({
    try: () => idb.open(DATABASE, VERSION),
    catch: (cause) => new StorageFailed({ cause })
  });

const awaitOpen = (request: IDBOpenDBRequest) =>
  Effect.callback<IDBDatabase, StorageFailed>((resume) => {
    request.onupgradeneeded = () => {
      upgrade(request);
    };
    request.onsuccess = () => {
      resume(Effect.succeed(closeOnVersionChange(request.result)));
    };
    request.onerror = () => {
      resume(Effect.fail(new StorageFailed({ cause: request.error })));
    };
  });

export const openDatabase = (idb: IDBFactory) =>
  Effect.flatMap(openRequest(idb), awaitOpen);

export type Change<A> = {
  put: Trip[];
  remove: string[];
  result: A;
};

const startTransaction = (db: IDBDatabase, mode: IDBTransactionMode) =>
  Effect.try({
    try: () => db.transaction(TRIPS, mode),
    catch: (cause) => new StorageFailed({ cause })
  });

const apply = <A>(store: IDBObjectStore, change: Change<A>) => {
  for (const trip of change.put) store.put(trip);
  for (const id of change.remove) store.delete(id);
  return change.result;
};

export type Plan<A, E> = (trips: Trip[]) => Result.Result<Change<A>, E>;

const runTransaction = <A, E>(tx: IDBTransaction, plan: Plan<A, E>) =>
  Effect.callback<A, E | StorageFailed>((resume) => {
    const store = tx.objectStore(TRIPS);
    const read = store.getAll();
    const outcome: { value?: Result.Result<A, E> } = {};
    read.onsuccess = () => {
      outcome.value = Result.map(plan(read.result as Trip[]), (change) =>
        apply(store, change)
      );
    };
    tx.oncomplete = () => {
      resume(Effect.fromResult(outcome.value as Result.Result<A, E>));
    };
    tx.onabort = () => {
      resume(Effect.fail(new StorageFailed({ cause: tx.error })));
    };
  });

export const readModifyWrite = <A, E = never>(
  db: IDBDatabase,
  plan: Plan<A, E>
) =>
  Effect.flatMap(startTransaction(db, 'readwrite'), (tx) =>
    runTransaction(tx, plan)
  );

export const readTrips = (db: IDBDatabase) =>
  Effect.flatMap(startTransaction(db, 'readonly'), (tx) =>
    runTransaction(tx, (trips) =>
      Result.succeed({ put: [], remove: [], result: trips })
    )
  );
