import { Result, Schema } from 'effect';
import {
  AnotherTripActive,
  CannotDropAgain,
  DroppedAgain,
  InvalidCatch,
  InvalidDepth,
  KindLocked,
  NotCollected
} from './failures';
import {
  Catch,
  type Deletion,
  type Drop,
  type DropEdit,
  type Gear,
  type Kind,
  type Located,
  type Trip
} from './types';

export const KINDS: readonly Kind[] = ['pot', 'net'];
export const KIND_NAMES: Record<Kind, string> = { pot: 'Pot', net: 'Net' };

export const activeOf = (trips: readonly Trip[]) =>
  trips.find((trip) => trip.endedAt === null) ?? null;

export const pastOf = (trips: readonly Trip[]) =>
  trips
    .filter((trip) => trip.endedAt !== null)
    .sort((a, b) => b.startedAt - a.startedAt);

export const endTrip = (trip: Trip, at: number): Trip | null =>
  trip.endedAt === null ? { ...trip, endedAt: at } : null;

export const gearName = (gear: Gear) =>
  `${KIND_NAMES[gear.kind]} ${String(gear.number)}`;

const newTrip = (startedAt: number): Trip => ({
  id: crypto.randomUUID(),
  startedAt,
  endedAt: null,
  gear: [],
  drops: [],
  next: { pot: 1, net: 1 }
});

export type DropTarget = { kind: Kind } | { again: string };

export type DropCommand = {
  dropId: string;
  tapAt: number;
  target: { kind: Kind; gearId: string } | { again: string };
};

export const dropCommand = (
  target: DropTarget,
  tapAt: number
): DropCommand => ({
  dropId: crypto.randomUUID(),
  tapAt,
  target:
    'kind' in target
      ? { kind: target.kind, gearId: crypto.randomUUID() }
      : { again: target.again }
});

export type Placed = { trip: Trip; drop: Drop; gear: Gear; isNew: boolean };

const recorded = (trips: readonly Trip[], dropId: string): Placed | null => {
  const found = locateDrop(trips, dropId);
  const gear = found?.trip.gear.find((item) => item.id === found.drop.gearId);
  return found && gear
    ? { trip: found.trip, drop: found.drop, gear, isNew: false }
    : null;
};

const isLatest = (trip: Trip, drop: Drop) =>
  trip.drops.findLast((item) => item.gearId === drop.gearId)?.id === drop.id;

const isLatestCollected = (trip: Trip, drop: Drop) =>
  trip.endedAt === null && drop.collectedAt !== null && isLatest(trip, drop);

export const canDropAgain = isLatestCollected;

export const canUndoCollect = isLatestCollected;

const newDrop = (
  command: DropCommand,
  gear: Gear,
  where: Located,
  copied: Pick<Drop, 'label' | 'bait' | 'depthFt'>
): Drop => ({
  id: command.dropId,
  gearId: gear.id,
  placedAt: command.tapAt,
  ...where,
  ...copied,
  notes: '',
  collectedAt: null,
  catch: null
});

const NOTHING_COPIED = { label: '', bait: '', depthFt: null };

const placeNew = (
  trips: readonly Trip[],
  command: DropCommand,
  target: { kind: Kind; gearId: string },
  where: Located
): Placed => {
  const base = activeOf(trips) ?? newTrip(command.tapAt);
  const { kind } = target;
  const gear: Gear = { id: target.gearId, kind, number: base.next[kind] };
  const drop = newDrop(command, gear, where, NOTHING_COPIED);
  const trip: Trip = {
    ...base,
    gear: [...base.gear, gear],
    drops: [...base.drops, drop],
    next: { ...base.next, [kind]: gear.number + 1 }
  };
  return { trip, drop, gear, isNew: true };
};

const placeAgain = (
  trips: readonly Trip[],
  command: DropCommand,
  sourceId: string,
  where: Located
): Result.Result<Placed, CannotDropAgain> => {
  const active = activeOf(trips);
  const source = active && locateDrop([active], sourceId);
  const gear = source?.trip.gear.find((item) => item.id === source.drop.gearId);
  if (!source || !gear || !canDropAgain(source.trip, source.drop)) {
    return Result.fail(new CannotDropAgain({ dropId: sourceId }));
  }
  const { label, bait, depthFt } = source.drop;
  const drop = newDrop(command, gear, where, { label, bait, depthFt });
  const trip = { ...source.trip, drops: [...source.trip.drops, drop] };
  return Result.succeed({ trip, drop, gear, isNew: true });
};

export const placeDrop = (
  trips: readonly Trip[],
  command: DropCommand,
  where: Located
): Result.Result<Placed, CannotDropAgain> => {
  const done = recorded(trips, command.dropId);
  if (done) return Result.succeed(done);
  const { target } = command;
  return 'kind' in target
    ? Result.succeed(placeNew(trips, command, target, where))
    : placeAgain(trips, command, target.again, where);
};

export const withoutDrop = (trip: Trip, dropId: string): Trip | null => {
  const drops = trip.drops.filter((drop) => drop.id !== dropId);
  const gear = trip.gear.filter((item) =>
    drops.some((drop) => drop.gearId === item.id)
  );
  return drops.length === 0 ? null : { ...trip, gear, drops };
};

export const locateDrop = (trips: readonly Trip[], dropId: string) => {
  for (const trip of trips) {
    const index = trip.drops.findIndex((drop) => drop.id === dropId);
    if (index >= 0) return { trip, drop: trip.drops[index], index };
  }
  return null;
};

const badDepth = (depthFt: number | null): depthFt is number =>
  depthFt !== null && !(Number.isFinite(depthFt) && depthFt >= 0);

const isCatch = Schema.is(Catch);

const replaceDrop = (trip: Trip, changed: Drop): Trip => ({
  ...trip,
  drops: trip.drops.map((drop) => (drop.id === changed.id ? changed : drop))
});

export const editDrop = (
  trip: Trip,
  drop: Drop,
  edit: DropEdit
): Result.Result<Trip, InvalidDepth | InvalidCatch | NotCollected> => {
  const { details } = edit;
  if (badDepth(details.depthFt)) {
    return Result.fail(new InvalidDepth({ depthFt: details.depthFt }));
  }
  if (edit.catch && !isCatch(edit.catch)) {
    return Result.fail(new InvalidCatch({ catch: edit.catch }));
  }
  const trimmed = {
    label: details.label.trim(),
    bait: details.bait.trim(),
    depthFt: details.depthFt,
    notes: details.notes.trim()
  };
  if (drop.collectedAt === null) {
    return edit.catch
      ? Result.fail(new NotCollected({ dropId: drop.id }))
      : Result.succeed(replaceDrop(trip, { ...drop, ...trimmed }));
  }
  return Result.succeed(
    replaceDrop(trip, { ...drop, ...trimmed, catch: edit.catch })
  );
};

export const collectDrop = (trip: Trip, drop: Drop, at: number) =>
  drop.collectedAt === null
    ? replaceDrop(trip, { ...drop, collectedAt: at })
    : null;

export const uncollectDrop = (
  trip: Trip,
  drop: Drop
): Result.Result<Trip | null, DroppedAgain> => {
  if (drop.collectedAt === null) return Result.succeed(null);
  if (!isLatest(trip, drop)) {
    return Result.fail(new DroppedAgain({ dropId: drop.id }));
  }
  return Result.succeed(
    replaceDrop(trip, { ...drop, collectedAt: null, catch: null })
  );
};

export const canChangeKind = (trip: Trip, gearId: string) =>
  trip.drops.filter((drop) => drop.gearId === gearId).length === 1;

export const switchKind = (
  trip: Trip,
  drop: Drop,
  kind: Kind
): Result.Result<{ trip: Trip; gear: Gear }, KindLocked> => {
  const gear = trip.gear.find((item) => item.id === drop.gearId);
  if (!gear || !canChangeKind(trip, gear.id)) {
    return Result.fail(new KindLocked({ dropId: drop.id }));
  }
  if (gear.kind === kind) return Result.succeed({ trip, gear });
  const changed: Gear = { ...gear, kind, number: trip.next[kind] };
  return Result.succeed({
    trip: {
      ...trip,
      gear: trip.gear.map((item) => (item.id === gear.id ? changed : item)),
      next: { ...trip.next, [kind]: changed.number + 1 }
    },
    gear: changed
  });
};

export const deletionOf = (
  trip: Trip,
  dropIndex: number,
  drop: Drop
): Deletion | null => {
  const gearIndex = trip.gear.findIndex((item) => item.id === drop.gearId);
  if (gearIndex < 0) return null;
  const gear = trip.gear[gearIndex];
  const { id, startedAt, endedAt, next } = trip;
  return {
    trip: { id, startedAt, endedAt, next },
    drop,
    dropIndex,
    gear,
    gearIndex
  };
};

const insertAt = <T>(items: readonly T[], index: number, item: T) => [
  ...items.slice(0, index),
  item,
  ...items.slice(index)
];

const restoreIn = (trip: Trip, deletion: Deletion): Trip => {
  if (trip.drops.some((drop) => drop.id === deletion.drop.id)) return trip;
  const hasGear = trip.gear.some((gear) => gear.id === deletion.gear.id);
  return {
    ...trip,
    gear: hasGear
      ? trip.gear
      : insertAt(trip.gear, deletion.gearIndex, deletion.gear),
    drops: insertAt(trip.drops, deletion.dropIndex, deletion.drop)
  };
};

export const restoreDrop = (
  trips: readonly Trip[],
  deletion: Deletion
): Result.Result<Trip, AnotherTripActive> => {
  const existing = trips.find((trip) => trip.id === deletion.trip.id);
  if (existing) return Result.succeed(restoreIn(existing, deletion));
  const active = activeOf(trips);
  if (deletion.trip.endedAt === null && active) {
    return Result.fail(new AnotherTripActive({ tripId: active.id }));
  }
  return Result.succeed({
    ...deletion.trip,
    gear: [deletion.gear],
    drops: [deletion.drop]
  });
};
