import type { Page } from '@playwright/test';

export type StorageFault = 'reads' | 'writes' | 'open' | 'defect';

const FAULT = 'krab-e2e-storage-fault';

type Begin = (this: IDBDatabase, ...args: unknown[]) => IDBTransaction;
type Open = (this: IDBFactory, ...args: unknown[]) => IDBOpenDBRequest;
type Refused = { error: DOMException; onerror: (() => void) | null };
type Completed = ((this: IDBTransaction, event: Event) => void) | null;
type HeldRead = {
  holdNextRead?: boolean;
  releaseRead?: () => void;
  heldDelivered?: boolean;
};

export const injectStorageFaults = (page: Page) =>
  page.addInitScript((flag) => {
    const failing = (fault: StorageFault) =>
      sessionStorage.getItem(flag) === fault;
    const held = window as HeldRead;
    const database = IDBDatabase.prototype;
    const begin = Reflect.get(database, 'transaction') as Begin;
    const abort = (tx: IDBTransaction) => () => {
      tx.abort();
    };
    const holdCompletion = (tx: IDBTransaction) => {
      let handler: Completed = null;
      let completed: Event | null = null;
      let released = false;
      const deliver = (event: Event) => {
        handler?.call(tx, event);
        held.heldDelivered = true;
      };
      Object.defineProperty(tx, 'oncomplete', {
        configurable: true,
        get: () => handler,
        set: (next: Completed) => {
          handler = next;
        }
      });
      tx.addEventListener('complete', (event) => {
        completed = event;
        if (released) deliver(event);
      });
      held.releaseRead = () => {
        released = true;
        if (completed) deliver(completed);
      };
    };
    const refuseCompletion = (tx: IDBTransaction) => {
      Object.defineProperty(tx, 'oncomplete', {
        configurable: true,
        get: () => null,
        set: () => {
          tx.objectStore('outside-this-transaction');
        }
      });
      queueMicrotask(abort(tx));
    };
    const faultyBegin: Begin = function (...args) {
      const tx = Reflect.apply(begin, this, args);
      if (tx.mode !== 'readonly') {
        if (failing('writes')) queueMicrotask(abort(tx));
        if (failing('defect')) refuseCompletion(tx);
        return tx;
      }
      if (failing('reads')) queueMicrotask(abort(tx));
      if (held.holdNextRead) {
        held.holdNextRead = false;
        held.heldDelivered = false;
        holdCompletion(tx);
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

const OPEN_HELD = 'krab-e2e-open-held';

type HeldOpen = { releaseOpen?: () => void };

export const holdFirstOpen = (page: Page) =>
  page.addInitScript((flag) => {
    if (sessionStorage.getItem(flag)) return;
    sessionStorage.setItem(flag, 'held');
    const request = indexedDB.open('krab', 1);
    request.onupgradeneeded = () => {
      const upgrade = request.transaction;
      const held = request.result.createObjectStore('held');
      let released = false;
      (window as HeldOpen).releaseOpen = () => {
        released = true;
      };
      const keepBusy = () => {
        if (released) {
          upgrade?.abort();
          return;
        }
        held.count().onsuccess = keepBusy;
      };
      keepBusy();
    };
  }, OPEN_HELD);

export const holdNextRead = (page: Page) =>
  page.evaluate(() => {
    (window as HeldRead).holdNextRead = true;
  });

export const releaseHeldRead = async (page: Page) => {
  await page.evaluate(() => {
    (window as HeldRead).releaseRead?.();
  });
  await page.waitForFunction(() => (window as HeldRead).heldDelivered);
  await page.evaluate(
    () =>
      new Promise((settled) => {
        requestAnimationFrame(() => setTimeout(settled));
      })
  );
};

export const releaseFirstOpen = (page: Page) =>
  page.evaluate(() => {
    (window as HeldOpen).releaseOpen?.();
  });
