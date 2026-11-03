import type { Drop, Gear, Kind, NoPosition, Position, Trip } from './types';

export type Located = {
  position: Position | null;
  noPosition: NoPosition | null;
};

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

export const placeDrop = (
  active: Trip | null,
  kind: Kind,
  tapAt: number,
  where: Located
) => {
  const base = active ?? newTrip(tapAt);
  const gear: Gear = {
    id: crypto.randomUUID(),
    kind,
    number: base.next[kind]
  };
  const drop: Drop = {
    id: crypto.randomUUID(),
    gearId: gear.id,
    placedAt: tapAt,
    position: where.position,
    noPosition: where.noPosition,
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

export const undoDrop = (active: Trip, dropId: string): Trip | null => {
  const drops = active.drops.filter((drop) => drop.id !== dropId);
  const gear = active.gear.filter((item) =>
    drops.some((drop) => drop.gearId === item.id)
  );
  return drops.length === 0 ? null : { ...active, gear, drops };
};
