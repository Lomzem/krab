import { Data, Effect } from 'effect';
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

const runTransaction = <A>(
  tx: IDBTransaction,
  plan: (trips: Trip[]) => Change<A>
) =>
  Effect.callback<A, StorageFailed>((resume) => {
    const store = tx.objectStore(TRIPS);
    const read = store.getAll();
    const outcome: { value?: A } = {};
    read.onsuccess = () => {
      outcome.value = apply(store, plan(read.result as Trip[]));
    };
    tx.oncomplete = () => {
      resume(Effect.succeed(outcome.value as A));
    };
    tx.onabort = () => {
      resume(Effect.fail(new StorageFailed({ cause: tx.error })));
    };
  });

export const readModifyWrite = <A>(
  db: IDBDatabase,
  plan: (trips: Trip[]) => Change<A>
) =>
  Effect.flatMap(startTransaction(db, 'readwrite'), (tx) =>
    runTransaction(tx, plan)
  );

export const readTrips = (db: IDBDatabase) =>
  Effect.flatMap(startTransaction(db, 'readonly'), (tx) =>
    runTransaction(tx, (trips) => ({ put: [], remove: [], result: trips }))
  );
