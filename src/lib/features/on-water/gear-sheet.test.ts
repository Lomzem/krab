import { assert, expect, it, vi } from 'vitest';
import type { Drop, Trip } from '#lib/features/trip/index.js';
import {
  GearSheetSession,
  type SheetCommands,
  type SheetOrigin
} from './gear-sheet.svelte';
import type { SaveProblem } from './on-water.svelte';

const T0 = Date.UTC(2026, 5, 1, 13, 0, 0);

const dropOf = (id: string, gearId: string, collectedAt: number | null) =>
  ({
    id,
    gearId,
    placedAt: T0,
    position: null,
    noPosition: 'skipped',
    label: '',
    bait: '',
    depthFt: null,
    notes: '',
    collectedAt,
    catch: null
  }) as Drop;

const TRIP: Trip = {
  id: 'trip',
  startedAt: T0,
  endedAt: null,
  gear: [
    { id: 'g1', kind: 'pot', number: 1 },
    { id: 'g2', kind: 'pot', number: 2 }
  ],
  drops: [dropOf('d1', 'g1', T0 + 60_000), dropOf('d2', 'g2', null)],
  next: { pot: 3, net: 1 }
};

const deferred = <A>() => {
  let resolve: (value: A) => void = () => {};
  const promise = new Promise<A>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const settled = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const origin = (dropId: string): SheetOrigin => ({
  dropId,
  from: 'list',
  returnFocus: () => null
});

const sessionWith = (overrides: Partial<SheetCommands> = {}) => {
  const commands: SheetCommands = {
    trips: () => [TRIP],
    save: vi.fn(() => Promise.resolve(null)),
    collect: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve(true)),
    undoCollect: vi.fn(() => Promise.resolve()),
    dropAgain: vi.fn(),
    saveLost: vi.fn(),
    showOnMap: vi.fn(),
    ...overrides
  };
  return { session: new GearSheetSession(commands), commands };
};

it('refuses a Save while the bait search has unchosen text and sends nothing to the trip', () => {
  const { session, commands } = sessionWith();
  session.show(origin('d1'));
  const draft = session.draft;
  assert(draft);
  draft.baitSearch.query = 'squid';
  draft.details.depth = 'deep';

  session.save();
  session.dropAgain();

  expect(commands.save).not.toHaveBeenCalled();
  expect(session.refusal?.invalid).toEqual(['bait', 'depth']);
  expect(draft.baitSearch.refused).toBe(true);
  expect(session.busy).toBe(false);
  expect(session.open).toBe(true);
});

it('saves a blank catch as none and a typed 0 and 0 as a recorded empty catch', async () => {
  const { session, commands } = sessionWith();
  session.show(origin('d1'));
  session.save();
  session.show(origin('d1'));
  const subject = session.subject;
  assert(subject);
  session.draft?.typeCatch(subject.drop, { kept: '0', released: '0' });
  await settled();
  session.save();

  expect(
    vi.mocked(commands.save).mock.calls.map(([, edit]) => edit.catch)
  ).toEqual([null, { kept: 0, released: 0 }]);
});

it('ignores a late Save of a closed sheet in the newer sheet and reports it lost', async () => {
  const late = deferred<SaveProblem | null>();
  const { session, commands } = sessionWith({
    save: vi.fn(() => late.promise)
  });
  session.show(origin('d1'));
  if (session.draft) session.draft.details.notes = 'tangled';
  session.save();

  expect(session.dismiss()).toBe('left');
  expect(session.open).toBe(false);
  session.show(origin('d2'));
  late.resolve('storage');
  await settled();

  expect(session.subject?.drop.id).toBe('d2');
  expect(session.busy).toBe(false);
  expect(session.problem).toBe(null);
  expect(commands.saveLost).toHaveBeenCalledWith('Pot 1');
});

it('closes at once when dismissed during a pending Save of unsaved changes', () => {
  const { session } = sessionWith({
    save: vi.fn(() => deferred<SaveProblem | null>().promise)
  });
  session.show(origin('d1'));
  if (session.draft) session.draft.details.label = 'Ledge';
  session.save();

  expect(session.busy).toBe(true);
  expect(session.dirty).toBe(true);
  expect(session.dismiss()).toBe('left');
  expect(session.open).toBe(false);
});

it('saves the edits before Drop again starts placing, and places nothing when the save is refused', async () => {
  const saving = deferred<SaveProblem | null>();
  const { session, commands } = sessionWith({
    save: vi.fn(() => saving.promise)
  });
  session.show(origin('d1'));
  if (session.draft) session.draft.details.bait = 'Squid';
  session.dropAgain();

  const [[dropId, edit]] = vi.mocked(commands.save).mock.calls;
  expect(dropId).toBe('d1');
  expect(edit.details.bait).toBe('Squid');
  expect(commands.dropAgain).not.toHaveBeenCalled();
  saving.resolve(null);
  await settled();
  expect(commands.dropAgain).toHaveBeenCalledWith('d1');
  expect(session.open).toBe(false);

  const refusing = sessionWith({
    save: vi.fn(() => Promise.resolve('kind' as const))
  });
  refusing.session.show(origin('d1'));
  refusing.session.dropAgain();
  await settled();
  expect(refusing.commands.dropAgain).not.toHaveBeenCalled();
  expect(refusing.session.problem).toBe('kind');
});

it('asks before unsaved changes are lost, ignores a backdrop tap, and asks after a pending Collect ends', async () => {
  const collecting = deferred<undefined>();
  const { session, commands } = sessionWith({
    collect: vi.fn(() => collecting.promise)
  });
  session.show(origin('d2'));
  if (session.draft) session.draft.details.notes = 'tangled';

  session.backdrop();
  expect(session.open).toBe(true);
  expect(session.dismiss()).toBe('asked');
  expect(session.dismiss()).toBe('kept');
  expect(session.asking).toBe(null);

  session.collect();
  expect(session.dismiss()).toBe('waiting');
  collecting.resolve(undefined);
  await settled();
  expect(session.asking).toBe('draft');
  session.discard();
  expect(session.open).toBe(false);

  session.show(origin('d2'));
  if (session.draft) session.draft.details.notes = 'tangled';
  session.deleteDrop();
  expect(session.asking).toBe('draft');
  expect(commands.remove).not.toHaveBeenCalled();
  session.discard();
  expect(commands.remove).toHaveBeenCalledWith('d2');
});
