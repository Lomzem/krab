import {
  dayOf,
  gearName,
  type Day,
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
  day: Day | null;
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

const subjectIn = (trip: Trip, dropId: string): SheetSubject | null => {
  const drop = trip.drops.find((item) => item.id === dropId);
  const gear = drop && trip.gear.find((item) => item.id === drop.gearId);
  return drop && gear
    ? { trip, drop, gear, name: gearName(gear), day: dayOf(trip, drop) }
    : null;
};

export const sheetSubject = (
  trips: readonly Trip[],
  dropId: string | null
): SheetSubject | null => {
  if (dropId === null) return null;
  for (const trip of trips) {
    const subject = subjectIn(trip, dropId);
    if (subject) return subject;
  }
  return null;
};
