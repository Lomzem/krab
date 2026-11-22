import {
  dropsInDays,
  isMultiDay,
  type DaySelection,
  type Drop,
  type Trip
} from '#lib/features/trip/index.js';

export type MapFilter = {
  collected: boolean;
  past: boolean;
  timeInWater: boolean;
  days: DaySelection;
};

export const DEFAULT_MAP_FILTER: MapFilter = {
  collected: true,
  past: false,
  timeInWater: true,
  days: 'all'
};

export const filterToShow = (
  filter: MapFilter,
  trip: Trip,
  target: Drop,
  now: number
): MapFilter => ({
  ...filter,
  collected: filter.collected || target.collectedAt !== null,
  days: dropsInDays(trip, filter.days, now).some(
    (drop) => drop.id === target.id
  )
    ? filter.days
    : 'all'
});

export const filterHides = (filter: MapFilter, trip: Trip | null) =>
  trip !== null &&
  ((filter.days !== 'all' && isMultiDay(trip)) ||
    (!filter.collected &&
      trip.drops.some((drop) => drop.collectedAt !== null)));
