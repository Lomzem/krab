import { Effect } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { expect, it } from 'vitest';
import { tripBook } from '#lib/features/trip/index.js';
import {
  depthAccepted,
  editOf,
  emptyDraft,
  type CatchDraft
} from './details-draft';

const T0 = Date.UTC(2026, 5, 1, 13, 0, 0);

const placedBook = async () => {
  const book = tripBook({
    clock: { now: () => T0, sleepUntil: () => Effect.succeed(undefined) },
    positions: {
      latest: () => null,
      denied: () => true,
      subscribe: () => () => undefined
    },
    idb: new IDBFactory(),
    stored: () => undefined
  });
  const placed = await Effect.runPromise(
    book.placeDrop({ kind: 'pot' }).result
  );
  return { book, dropId: placed.drop.id };
};

const saveDepth = async (typed: string) => {
  const { book, dropId } = await placedBook();
  const edit = editOf({ ...emptyDraft(), depth: typed }, null);
  const saved = await Effect.runPromise(
    Effect.result(book.saveDrop(dropId, edit, null))
  );
  const stored = (await Effect.runPromise(book.trips())).active;
  return {
    refused: saved._tag === 'Failure' ? saved.failure._tag : null,
    depthFt: stored?.drops[0]?.depthFt
  };
};

const saveCatch = async (typed: CatchDraft | null) => {
  const { book, dropId } = await placedBook();
  await Effect.runPromise(book.collect(dropId));
  const saved = await Effect.runPromise(
    Effect.result(book.saveDrop(dropId, editOf(emptyDraft(), typed), null))
  );
  const stored = (await Effect.runPromise(book.trips())).active;
  return {
    refused: saved._tag === 'Failure' ? saved.failure._tag : null,
    catch: stored?.drops[0]?.catch
  };
};

it.each([
  ['', null],
  ['   ', null],
  ['12,5', 12.5],
  [' 30.25 ', 30.25],
  ['0', 0]
])('a depth typed as %j is saved as %j', async (typed, depthFt) => {
  expect(await saveDepth(typed)).toEqual({ refused: null, depthFt });
  expect(depthAccepted(typed)).toBe(true);
});

it.each(['deep', '12 ft', '1,2,3', '-4'])(
  'a depth typed as %j is refused and not saved',
  async (typed) => {
    expect(await saveDepth(typed)).toEqual({
      refused: 'InvalidDepth',
      depthFt: null
    });
    expect(depthAccepted(typed)).toBe(false);
  }
);

it.each([
  [null, null],
  [
    { kept: '0', released: '0' },
    { kept: 0, released: 0 }
  ],
  [
    { kept: ' 12 ', released: '007' },
    { kept: 12, released: 7 }
  ],
  [
    { kept: '1400', released: '3' },
    { kept: 1400, released: 3 }
  ]
])('a catch typed as %j is saved as %j', async (typed, recorded) => {
  expect(await saveCatch(typed)).toEqual({ refused: null, catch: recorded });
});

it.each([
  { kept: '', released: '3' },
  { kept: '2.5', released: '0' },
  { kept: '-1', released: '0' },
  { kept: '1e3', released: '0' },
  { kept: '4', released: 'four' },
  { kept: '99999999999999999999', released: '0' }
])('a catch typed as %j is refused and not saved', async (typed) => {
  expect(await saveCatch(typed)).toEqual({
    refused: 'InvalidCatch',
    catch: null
  });
});
