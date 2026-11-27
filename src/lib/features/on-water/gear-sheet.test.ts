import { IDBFactory } from 'fake-indexeddb';
import { afterEach, assert, expect, it, vi } from 'vitest';
import type { Drop, Trip } from '#lib/features/trip/index.js';
import { GearSheetSession, type SheetOrigin } from './gear-sheet.svelte';
import { OnWater, type SaveProblem } from './on-water.svelte';

const T0 = Date.UTC(2026, 5, 1, 13, 0, 0);

afterEach(() => {
  vi.unstubAllGlobals();
});

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

type SheetCommands = ConstructorParameters<typeof GearSheetSession>[0];

const sessionWith = (overrides: Partial<SheetCommands> = {}) => {
  const commands: SheetCommands = {
    trips: () => [TRIP],
    save: vi.fn(() => Promise.resolve(null)),
    collect: vi.fn(() => Promise.resolve()),
    remove: vi.fn(() => Promise.resolve(true)),
    undoCollect: vi.fn(() => Promise.resolve()),
    saving: () => false,
    observeStored: vi.fn(),
    dropAgain: vi.fn(),
    saveLost: vi.fn(),
    showOnMap: vi.fn(),
    ...overrides
  };
  return { session: new GearSheetSession(commands), commands };
};

const collectedOnWater = async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const water = new OnWater({
    latest: () => ({ lat: 0, lon: -140, accuracyM: 5, at: Date.now() }),
    denied: () => false,
    subscribe: () => () => undefined
  });
  await vi.waitFor(() => {
    expect(water.load).toBe('ready');
  });
  await water.drop('pot');
  const dropId = water.trip?.drops[0]?.id;
  assert(dropId);
  await water.collect(dropId);
  const session = new GearSheetSession({
    trips: () => (water.trip ? [water.trip, ...water.past] : water.past),
    save: (id, edit, kind) => water.save(id, edit, kind),
    collect: (id) => water.collect(id),
    remove: (id) => water.remove(id),
    undoCollect: (id, name) => water.undoCollect(id, name),
    saving: (id) => water.saving(id),
    observeStored: (observer) => {
      water.observeStored(observer);
    },
    dropAgain: vi.fn(),
    saveLost: vi.fn(),
    showOnMap: vi.fn()
  });
  const stored = () => water.trip?.drops.find((drop) => drop.id === dropId);
  return { water, session, dropId, stored };
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

it('refuses Save and Drop again in a reopened sheet while that drop has a pending Save, so the pending label is kept', async () => {
  const { session, dropId, stored } = await collectedOnWater();
  session.show(origin(dropId));
  assert(session.draft);
  session.draft.details.label = 'Ledge';
  session.save();
  expect(session.dismiss()).toBe('left');
  session.show(origin(dropId));

  assert(session.draft);
  expect(session.saving).toBe(true);
  session.draft.details.notes = 'early';
  session.save();
  session.dropAgain();
  expect(session.busy).toBe(false);
  expect(session.open).toBe(true);
  await vi.waitFor(() => {
    expect(session.saving).toBe(false);
  });
  expect(stored()).toMatchObject({ label: 'Ledge', notes: '' });

  expect(session.draft.details.label).toBe('Ledge');
  session.draft.details.notes = 'tangled';
  session.save();
  await vi.waitFor(() => {
    expect(session.open).toBe(false);
  });

  expect(stored()).toMatchObject({ label: 'Ledge', notes: 'tangled' });
});

it('refuses Undo collect in a reopened sheet while a catch Save of that drop is pending, then asks before clearing the saved catch', async () => {
  const { water, session, dropId, stored } = await collectedOnWater();
  session.show(origin(dropId));
  const subject = session.subject;
  assert(subject);
  session.draft?.typeCatch(subject.drop, { kept: '3', released: '1' });
  session.save();
  expect(session.dismiss()).toBe('left');
  session.show(origin(dropId));

  expect(session.saving).toBe(true);
  expect(water.undoBlocked).toBe(true);
  session.undoCollect();
  expect(session.asking).toBe(null);
  await vi.waitFor(() => {
    expect(session.saving).toBe(false);
  });
  await water.reload();
  expect(stored()?.collectedAt).not.toBe(null);
  expect(stored()?.catch).toEqual({ kept: 3, released: 1 });

  session.undoCollect();
  expect(session.asking).toBe('catch');
  session.discard();
  await vi.waitFor(() => {
    expect(stored()).toMatchObject({ collectedAt: null, catch: null });
  });
});

it('ends the sheet when a stored trip loses its drop, so restoring the drop reopens no draft or prompt', async () => {
  const { water, session, dropId, stored } = await collectedOnWater();
  session.show(origin(dropId));
  assert(session.draft);
  session.draft.details.notes = 'tangled';
  expect(session.dismiss()).toBe('asked');

  await water.remove(dropId);
  expect(stored()).toBe(undefined);
  expect(session.open).toBe(false);
  const offer = water.notice?.offer;
  assert(offer?.action === 'restore');
  await water.undo(offer);

  expect(stored()).toBeDefined();
  expect(session.open).toBe(false);
  expect(session.draft).toBe(null);
  expect(session.asking).toBe(null);
  expect(session.dirty).toBe(false);
});
