import { Effect } from 'effect';
import { IDBFactory } from 'fake-indexeddb';
import { assert, expect, it } from 'vitest';
import { tripBook, type DropEdit } from '#lib/features/trip/index.js';
import {
  checkDraft,
  depthAccepted,
  draftChanged,
  emptyDraft,
  type CatchDraft,
  type GearDraft
} from './details-draft';

const T0 = Date.UTC(2026, 5, 1, 13, 0, 0);

const typed = (changes: Partial<GearDraft> = {}): GearDraft => ({
  details: emptyDraft(),
  catch: null,
  kind: 'pot',
  baitQuery: '',
  ...changes
});

const editOf = (draft: GearDraft): DropEdit => {
  const checked = checkDraft(draft, 'pot');
  assert(checked.valid);
  return checked.edit;
};

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

const saved = async (draft: GearDraft, collected = false) => {
  const { book, dropId } = await placedBook();
  if (collected) await Effect.runPromise(book.collect(dropId));
  await Effect.runPromise(book.saveDrop(dropId, editOf(draft), null));
  return (await Effect.runPromise(book.trips())).active?.drops[0];
};

it.each([
  ['', null],
  ['   ', null],
  ['12,5', 12.5],
  [' 30.25 ', 30.25],
  ['0', 0]
])('a depth typed as %j is saved as %j', async (depth, depthFt) => {
  const draft = typed({ details: { ...emptyDraft(), depth } });
  expect((await saved(draft))?.depthFt).toBe(depthFt);
  expect(depthAccepted(depth)).toBe(true);
});

it.each(['deep', '12 ft', '1,2,3', '-4', 'Infinity'])(
  'a depth typed as %j is refused before it reaches the trip',
  (depth) => {
    expect(
      checkDraft(typed({ details: { ...emptyDraft(), depth } }), 'pot')
    ).toEqual({ valid: false, invalid: ['depth'] });
    expect(depthAccepted(depth)).toBe(false);
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
])('a catch typed as %j is saved as %j', async (recorded, expected) => {
  expect((await saved(typed({ catch: recorded }), true))?.catch).toEqual(
    expected
  );
});

it.each<[CatchDraft, string[]]>([
  [{ kept: '', released: '3' }, ['kept']],
  [{ kept: '2.5', released: '0' }, ['kept']],
  [{ kept: '-1', released: '0' }, ['kept']],
  [{ kept: '1e3', released: '0' }, ['kept']],
  [{ kept: '4', released: 'four' }, ['released']],
  [{ kept: '99999999999999999999', released: '0' }, ['kept']],
  [{ kept: '', released: '' }, ['kept', 'released']]
])('a catch typed as %j is refused on %j with no edit', (recorded, invalid) => {
  expect(checkDraft(typed({ catch: recorded }), 'pot')).toEqual({
    valid: false,
    invalid
  });
});

it('refuses unchosen bait search text first, then the depth and catch it also finds', () => {
  expect(
    checkDraft(
      typed({
        baitQuery: ' squid ',
        details: { ...emptyDraft(), depth: 'deep' },
        catch: { kept: 'x', released: '1' }
      }),
      'pot'
    )
  ).toEqual({ valid: false, invalid: ['bait', 'depth', 'kept'] });
  expect(checkDraft(typed({ baitQuery: '   ' }), 'pot').valid).toBe(true);
});

it('sends a kind only when it differs from the stored kind', () => {
  expect(checkDraft(typed({ kind: 'pot' }), 'pot')).toMatchObject({
    kind: null
  });
  expect(checkDraft(typed({ kind: 'net' }), 'pot')).toMatchObject({
    kind: 'net'
  });
});

it('counts kind, bait search text, details and catch as unsaved changes', async () => {
  const { book, dropId } = await placedBook();
  await Effect.runPromise(book.collect(dropId));
  const drop = (await Effect.runPromise(book.trips())).active?.drops[0];
  assert(drop);
  expect(draftChanged(drop, 'pot', typed())).toBe(false);
  expect(draftChanged(drop, 'pot', typed({ kind: 'net' }))).toBe(true);
  expect(draftChanged(drop, 'pot', typed({ baitQuery: 'squid' }))).toBe(true);
  expect(
    draftChanged(
      drop,
      'pot',
      typed({ details: { ...emptyDraft(), notes: 'tangled' } })
    )
  ).toBe(true);
  expect(
    draftChanged(drop, 'pot', typed({ catch: { kept: '0', released: '0' } }))
  ).toBe(true);
});
