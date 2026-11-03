import { Result } from 'effect';
import { AnotherTripActive, InvalidDepth, KindLocked } from './failures';
import type {
  Deletion,
  Drop,
  DropEdit,
  Gear,
  Kind,
  Located,
  Trip
} from './types';

export const KINDS: readonly Kind[] = ['pot', 'net'];
export const KIND_NAMES: Record<Kind, string> = { pot: 'Pot', net: 'Net' };

export const activeOf = (trips: readonly Trip[]) =>
  trips.find((trip) => trip.endedAt === null) ?? null;

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

export type DropCommand = {
  dropId: string;
  gearId: string;
  kind: Kind;
  tapAt: number;
};

export const dropCommand = (kind: Kind, tapAt: number): DropCommand => ({
  dropId: crypto.randomUUID(),
  gearId: crypto.randomUUID(),
  kind,
  tapAt
});

const recorded = (trips: readonly Trip[], command: DropCommand) => {
  for (const trip of trips) {
    const drop = trip.drops.find((item) => item.id === command.dropId);
    const gear = drop && trip.gear.find((item) => item.id === drop.gearId);
    if (drop && gear) return { trip, drop, gear, isNew: false };
  }
  return null;
};

export const placeDrop = (
  trips: readonly Trip[],
  command: DropCommand,
  where: Located
) => {
  const done = recorded(trips, command);
  if (done) return done;
  const { kind, tapAt } = command;
  const base = activeOf(trips) ?? newTrip(tapAt);
  const gear: Gear = { id: command.gearId, kind, number: base.next[kind] };
  const drop: Drop = {
    id: command.dropId,
    gearId: gear.id,
    placedAt: tapAt,
    ...where,
    label: '',
    bait: '',
    depthFt: null,
    notes: '',
    collectedAt: null,
    kept: null,
    released: null
  };
  const trip: Trip = {
    ...base,
    gear: [...base.gear, gear],
    drops: [...base.drops, drop],
    next: { ...base.next, [kind]: gear.number + 1 }
  };
  return { trip, drop, gear, isNew: true };
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

export const editDrop = (
  trip: Trip,
  dropId: string,
  edit: DropEdit
): Result.Result<Trip, InvalidDepth> => {
  const { details } = edit;
  if (badDepth(details.depthFt)) {
    return Result.fail(new InvalidDepth({ depthFt: details.depthFt }));
  }
  const drops = trip.drops.map((drop) =>
    drop.id === dropId
      ? {
          ...drop,
          label: details.label.trim(),
          bait: details.bait.trim(),
          depthFt: details.depthFt,
          notes: details.notes.trim()
        }
      : drop
  );
  return Result.succeed({ ...trip, drops });
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
