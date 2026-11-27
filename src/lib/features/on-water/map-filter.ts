import type {
  ActiveGear,
  DaySelection,
  Drop
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
  inDays: ReadonlySet<string>,
  target: Drop
): MapFilter => ({
  ...filter,
  collected: filter.collected || target.collectedAt !== null,
  days: inDays.has(target.id) ? filter.days : 'all'
});

export const filterHides = (filter: MapFilter, gear: ActiveGear | null) =>
  gear !== null &&
  ((filter.days !== 'all' && gear.multiDay) ||
    (!filter.collected && gear.collectedCount > 0));
