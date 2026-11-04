import type { Page } from '@playwright/test';

export type StorageFault = 'reads' | 'open';

const FAULT = 'krab-e2e-storage-fault';

type Begin = (this: IDBDatabase, ...args: unknown[]) => IDBTransaction;
type Open = (this: IDBFactory, ...args: unknown[]) => IDBOpenDBRequest;
type Refused = { error: DOMException; onerror: (() => void) | null };

export const injectStorageFaults = (page: Page) =>
  page.addInitScript((flag) => {
    const failing = (fault: StorageFault) =>
      sessionStorage.getItem(flag) === fault;
    const database = IDBDatabase.prototype;
    const begin = Reflect.get(database, 'transaction') as Begin;
    const abort = (tx: IDBTransaction) => () => {
      tx.abort();
    };
    const faultyBegin: Begin = function (...args) {
      const tx = Reflect.apply(begin, this, args);
      if (tx.mode === 'readonly' && failing('reads')) {
        queueMicrotask(abort(tx));
      }
      return tx;
    };
    Reflect.set(database, 'transaction', faultyBegin);
    const factory = IDBFactory.prototype;
    const open = Reflect.get(factory, 'open') as Open;
    const refuse = () => {
      const refused: Refused = {
        error: new DOMException('Storage is unavailable', 'UnknownError'),
        onerror: null
      };
      setTimeout(() => {
        refused.onerror?.();
      });
      return refused as unknown as IDBOpenDBRequest;
    };
    const faultyOpen: Open = function (...args) {
      return failing('open') ? refuse() : Reflect.apply(open, this, args);
    };
    Reflect.set(factory, 'open', faultyOpen);
  }, FAULT);

export const failStorage = (page: Page, fault: StorageFault | null) =>
  page.evaluate(
    ([flag, state]) => {
      if (state) sessionStorage.setItem(flag, state);
      else sessionStorage.removeItem(flag);
    },
    [FAULT, fault] as const
  );
