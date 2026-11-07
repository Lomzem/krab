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
  type Trip,
  type Trips
} from './types';

export const KINDS: readonly Kind[] = ['pot', 'net'];
export const KIND_NAMES: Record<Kind, string> = { pot: 'Pot', net: 'Net' };

export const activeOf = (trips: readonly Trip[]) =>
  trips.find((trip) => trip.endedAt === null) ?? null;

export const pastOf = (trips: readonly Trip[]) =>
  trips
    .filter((trip) => trip.endedAt !== null)
    .sort((a, b) => b.startedAt - a.startedAt);

export const tripsOf = (trips: readonly Trip[]): Trips => ({
  active: activeOf(trips),
  past: pastOf(trips)
});

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

export type FoundDrop = { trip: Trip; drop: Drop; gear: Gear };

export const findDrop = (
  trips: readonly Trip[],
  dropId: string
): FoundDrop | null => {
  for (const trip of trips) {
    const drop = trip.drops.find((item) => item.id === dropId);
    const gear = drop && trip.gear.find((item) => item.id === drop.gearId);
    if (drop) return gear ? { trip, drop, gear } : null;
  }
  return null;
};

const recorded = (trips: readonly Trip[], dropId: string): Placed | null => {
  const found = findDrop(trips, dropId);
  return found && { ...found, isNew: false };
};

const isLatest = (trip: Trip, drop: Drop) =>
  trip.drops.findLast((item) => item.gearId === drop.gearId)?.id === drop.id;

const inWater = (drop: Drop) => drop.collectedAt === null;

const dropsOf = (trip: Trip, gearId: string) =>
  trip.drops.filter((drop) => drop.gearId === gearId);

const hasInWater = (trip: Trip, gearId: string) =>
  dropsOf(trip, gearId).some(inWater);

const inWaterOnlyLast = (trip: Trip, gearId: string) => {
  const drops = dropsOf(trip, gearId);
  const wet = drops.filter(inWater);
  return wet.length === 0 || (wet.length === 1 && drops.at(-1) === wet[0]);
};

const isLatestCollected = (trip: Trip, drop: Drop) =>
  trip.endedAt === null &&
  !inWater(drop) &&
  isLatest(trip, drop) &&
  !hasInWater(trip, drop.gearId);

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
  const source = active && findDrop([active], sourceId);
  if (!source || !canDropAgain(source.trip, source.drop)) {
    return Result.fail(new CannotDropAgain({ dropId: sourceId }));
  }
  const { gear } = source;
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
  if (!isLatest(trip, drop) || hasInWater(trip, drop.gearId)) {
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
  if (gear?.kind === kind) return Result.succeed({ trip, gear });
  if (!gear || !canChangeKind(trip, gear.id)) {
    return Result.fail(new KindLocked({ dropId: drop.id }));
  }
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

export const deletionOf = (trip: Trip, drop: Drop, gear: Gear): Deletion => {
  const { id, startedAt, endedAt, next } = trip;
  return { trip: { id, startedAt, endedAt, next }, drop, gear };
};

const insertBefore = <T>(
  items: readonly T[],
  item: T,
  isLater: (other: T) => boolean
) => {
  const index = items.findIndex(isLater);
  return index < 0
    ? [...items, item]
    : [...items.slice(0, index), item, ...items.slice(index)];
};

const firstDroppedAt = (trip: Trip, gearId: string) =>
  Math.min(...dropsOf(trip, gearId).map((drop) => drop.placedAt));

const restoreIn = (
  trip: Trip,
  { drop, gear }: Deletion
): Result.Result<Trip, DroppedAgain> => {
  if (trip.drops.some((item) => item.id === drop.id)) {
    return Result.succeed(trip);
  }
  const hasGear = trip.gear.some((item) => item.id === gear.id);
  const restored: Trip = {
    ...trip,
    gear: hasGear
      ? trip.gear
      : insertBefore(
          trip.gear,
          gear,
          (other) => firstDroppedAt(trip, other.id) > drop.placedAt
        ),
    drops: insertBefore(
      trip.drops,
      drop,
      (other) => other.placedAt > drop.placedAt
    )
  };
  return inWaterOnlyLast(restored, gear.id)
    ? Result.succeed(restored)
    : Result.fail(new DroppedAgain({ dropId: drop.id }));
};

export const restoreDrop = (
  trips: readonly Trip[],
  deletion: Deletion
): Result.Result<Trip, AnotherTripActive | DroppedAgain> => {
  const existing = trips.find((trip) => trip.id === deletion.trip.id);
  if (existing) return restoreIn(existing, deletion);
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
