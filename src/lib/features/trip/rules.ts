import type { Drop, Gear, Kind, Located, Trip } from './types';

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

const recorded = (trips: Trip[], command: DropCommand) => {
  for (const trip of trips) {
    const drop = trip.drops.find((item) => item.id === command.dropId);
    const gear = drop && trip.gear.find((item) => item.id === drop.gearId);
    if (drop && gear) return { trip, drop, gear, isNew: false };
  }
  return null;
};

export const placeDrop = (
  trips: Trip[],
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

export const undoDrop = (active: Trip, dropId: string): Trip | null => {
  const drops = active.drops.filter((drop) => drop.id !== dropId);
  const gear = active.gear.filter((item) =>
    drops.some((drop) => drop.gearId === item.id)
  );
  return drops.length === 0 ? null : { ...active, gear, drops };
};
