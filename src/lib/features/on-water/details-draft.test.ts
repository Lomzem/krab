import { Effect } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { expect, it } from 'vitest';
import { tripBook } from '#lib/features/trip/index.js';
import { editOf, emptyDraft } from './details-draft';

const T0 = Date.UTC(2026, 5, 1, 13, 0, 0);

const saveDepth = async (typed: string) => {
  const book = tripBook({
    clock: { now: () => T0, sleepUntil: () => Effect.succeed(undefined) },
    positions: {
      latest: () => null,
      denied: () => true,
      subscribe: () => () => undefined
    },
    idb: new IDBFactory()
  });
  const attempt = book.placeDrop({ kind: 'pot' });
  const placed = await Effect.runPromise(attempt.result);
  const edit = editOf({ ...emptyDraft(), depth: typed }, null);
  const saved = await Effect.runPromise(
    Effect.result(book.saveDrop(placed.drop.id, edit, null))
  );
  const stored = await Effect.runPromise(book.activeTrip());
  return {
    refused: saved._tag === 'Failure' ? saved.failure._tag : null,
    depthFt: stored?.drops[0]?.depthFt
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
});

it.each(['deep', '12 ft', '1,2,3', '-4'])(
  'a depth typed as %j is refused and not saved',
  async (typed) => {
    expect(await saveDepth(typed)).toEqual({
      refused: 'InvalidDepth',
      depthFt: null
    });
  }
);
