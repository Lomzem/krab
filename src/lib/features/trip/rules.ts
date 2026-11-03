import type { Drop, Fix, Gear, Kind, Trip } from './types';

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

export const undoDrop = (active: Trip, dropId: string): Trip | null => {
  const drops = active.drops.filter((drop) => drop.id !== dropId);
  const gear = active.gear.filter((item) =>
    drops.some((drop) => drop.gearId === item.id)
  );
  return drops.length === 0 ? null : { ...active, gear, drops };
};
