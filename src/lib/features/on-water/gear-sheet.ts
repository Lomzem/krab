import {
  gearName,
  type Drop,
  type Gear,
  type Trip
} from '#lib/features/trip/index.js';
import type { SaveProblem } from './on-water.svelte';

export type SheetSubject = {
  trip: Trip;
  drop: Drop;
  gear: Gear;
  name: string;
};

export type SheetOrigin = {
  dropId: string;
  from: 'list' | 'map';
  opener: HTMLElement;
};

export type SheetOperation = {
  sheet: SheetOrigin;
  pending: boolean;
  problem: SaveProblem | null;
};

export const sheetSubject = (
  trip: Trip | null,
  dropId: string | null
): SheetSubject | null => {
  if (!trip) return null;
  const drop = trip.drops.find((item) => item.id === dropId);
  const gear = drop && trip.gear.find((item) => item.id === drop.gearId);
  return drop && gear ? { trip, drop, gear, name: gearName(gear) } : null;
};
