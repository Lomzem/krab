import { Result } from 'effect';
import { AnotherTripActive, InvalidDepth, KindLocked } from './failures';
import type { Deletion, Drop, DropEdit, Fix, Gear, Kind, Trip } from './types';

export const FRESH_FIX_MS = 5000;

export const KINDS: readonly Kind[] = ['pot', 'net'];
export const KIND_NAMES: Record<Kind, string> = { pot: 'Pot', net: 'Net' };

export const activeOf = (trips: Trip[]) =>
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

const freshFix = (fix: Fix | null, tapAt: number) =>
  fix !== null && tapAt - fix.at <= FRESH_FIX_MS ? fix : null;

export const placeDrop = (
  active: Trip | null,
  kind: Kind,
  tapAt: number,
  latest: Fix | null
) => {
  const base = active ?? newTrip(tapAt);
  const gear: Gear = {
    id: crypto.randomUUID(),
    kind,
    number: base.next[kind]
  };
  const fix = freshFix(latest, tapAt);
  const drop: Drop = {
    id: crypto.randomUUID(),
    gearId: gear.id,
    placedAt: tapAt,
    position: fix && { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM },
    noPosition: fix ? null : 'no-fix',
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
  return { trip, drop, gear };
};

export const withoutDrop = (trip: Trip, dropId: string): Trip | null => {
  const drops = trip.drops.filter((drop) => drop.id !== dropId);
  const gear = trip.gear.filter((item) =>
    drops.some((drop) => drop.gearId === item.id)
  );
  return drops.length === 0 ? null : { ...trip, gear, drops };
};

export const locateDrop = (trips: Trip[], dropId: string) => {
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

const insertAt = <T>(items: T[], index: number, item: T) => [
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
  trips: Trip[],
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
