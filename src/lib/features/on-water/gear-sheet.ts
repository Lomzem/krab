import {
  dayOf,
  findDrop,
  gearName,
  type Day,
  type Drop,
  type Gear,
  type Trip
} from '#lib/features/trip/index.js';
import { baitChoices, type BaitChoice } from './bait-options';
import type { SaveProblem } from './on-water.svelte';

export type SheetSubject = {
  trip: Trip;
  drop: Drop;
  gear: Gear;
  name: string;
  day: Day | null;
  baits: BaitChoice[];
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
  trips: readonly Trip[],
  dropId: string | null
): SheetSubject | null => {
  const found = dropId === null ? null : findDrop(trips, dropId);
  return (
    found && {
      ...found,
      name: gearName(found.gear),
      day: dayOf(found.trip, found.drop),
      baits: baitChoices(trips, found.trip.id)
    }
  );
};
