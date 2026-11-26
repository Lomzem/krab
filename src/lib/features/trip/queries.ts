import {
  compassPoint,
  distanceText,
  durationText,
  shortDateRange,
  shortTime
} from './format';
import type { LatLon } from '#lib/shared/lat-lon.js';
import { bearingDeg, distanceFt, metresToFeet } from './geo';
import { gearName } from './rules';
import type { Catch, Drop, Gear, Position, Trip } from './types';

const ROUGH_ACCURACY_M = 50;

export type Direction =
  | {
      feet: number;
      atGear: true;
      bearingDeg: null;
      distance: null;
      distanceSpoken: null;
      point: null;
      pointShort: null;
    }
  | {
      feet: number;
      atGear: false;
      bearingDeg: number;
      distance: string;
      distanceSpoken: string;
      point: string;
      pointShort: string;
    };

export type SpokenText = { short: string; spoken: string };

export type Day = { number: number; text: string };

export type DaySelection = 'today' | 'earlier' | 'all';

const CALENDAR_DAY_MS = 86_400_000;

const localDate = (at: number) => {
  const local = new Date(at);
  return Date.UTC(local.getFullYear(), local.getMonth(), local.getDate());
};

const dayNumber = (trip: Trip, at: number) =>
  (localDate(at) - localDate(trip.startedAt)) / CALENDAR_DAY_MS + 1;

const tripDays = (trip: Trip) =>
  [...new Set(trip.drops.map((drop) => dayNumber(trip, drop.placedAt)))].sort(
    (a, b) => a - b
  );

const isMultiDay = (trip: Trip) => tripDays(trip).length > 1;

const dayNamer =
  (trip: Trip, multiDay: boolean) =>
  (drop: Drop): Day | null => {
    if (!multiDay) return null;
    const number = dayNumber(trip, drop.placedAt);
    return { number, text: `Day ${String(number)}` };
  };

export const dayOf = (trip: Trip, drop: Drop): Day | null =>
  dayNamer(trip, isMultiDay(trip))(drop);

export const dayGroups = <Row extends { day: Day | null }>(
  rows: readonly Row[]
) => {
  const groups = new Map<number, { day: Day; rows: Row[] }>();
  for (const row of rows) {
    if (!row.day) continue;
    const group = groups.get(row.day.number);
    if (group) group.rows.push(row);
    else groups.set(row.day.number, { day: row.day, rows: [row] });
  }
  return [...groups.values()].sort((a, b) => a.day.number - b.day.number);
};

const dayFilter = (
  selection: DaySelection,
  multiDay: boolean,
  now: number
): ((drop: Drop) => boolean) => {
  if (selection === 'all' || !multiDay) return () => true;
  const today = localDate(now);
  return (drop: Drop) =>
    selection === 'today'
      ? localDate(drop.placedAt) === today
      : localDate(drop.placedAt) < today;
};

type Projected = { drop: Drop; gear: Gear; name: string; day: Day | null };

const projection = (trip: Trip) => {
  const gearById = new Map<string, Gear>();
  for (const gear of trip.gear) {
    if (!gearById.has(gear.id)) gearById.set(gear.id, gear);
  }
  const multiDay = isMultiDay(trip);
  const dayFor = dayNamer(trip, multiDay);
  const rows = trip.drops.flatMap((drop): Projected[] => {
    const gear = gearById.get(drop.gearId);
    return gear
      ? [{ drop, gear, name: gearName(gear), day: dayFor(drop) }]
      : [];
  });
  return { rows, multiDay };
};

export type GearRow = {
  drop: Drop;
  gear: Gear;
  name: string;
  direction: Direction | null;
  rough: SpokenText | null;
  timeInWater: SpokenText;
  day: Day | null;
};

export const roughness = (position: Position | null): SpokenText | null =>
  position && position.accuracyM > ROUGH_ACCURACY_M
    ? distanceText(metresToFeet(position.accuracyM))
    : null;

export const timeInWater = (drop: Drop, at: number) =>
  durationText(at - drop.placedAt);

const directionTo = (from: LatLon | null, drop: Drop): Direction | null => {
  if (!from || !drop.position) return null;
  const feet = distanceFt(from, drop.position);
  if (Math.round(feet) === 0) {
    return {
      feet,
      atGear: true,
      bearingDeg: null,
      distance: null,
      distanceSpoken: null,
      point: null,
      pointShort: null
    };
  }
  const bearing = bearingDeg(from, drop.position);
  const text = distanceText(feet);
  const [point, pointShort] = compassPoint(bearing);
  return {
    feet,
    atGear: false,
    bearingDeg: bearing,
    distance: text.short,
    distanceSpoken: text.spoken,
    point,
    pointShort
  };
};

const byDistance = (a: GearRow, b: GearRow) =>
  (a.direction?.feet ?? Number.POSITIVE_INFINITY) -
  (b.direction?.feet ?? Number.POSITIVE_INFINITY);

const isInWater = (drop: Drop) => drop.collectedAt === null;

const gearCounts = (trip: Trip) => {
  const inWater = trip.drops.filter(isInWater).length;
  const collected = trip.drops.length - inWater;
  return {
    inWater:
      inWater === 0
        ? 'Nothing in the water'
        : `${String(inWater)} in the water`,
    collected:
      collected === 0 ? 'Nothing collected' : `${String(collected)} collected`
  };
};

const catchText = (recorded: Catch | null) => {
  if (!recorded) return 'Catch not recorded';
  const { kept, released } = recorded;
  if (kept === 0 && released === 0) return 'Nothing caught';
  return `${String(kept)} kept, ${String(released)} released`;
};

export type CollectedRow = {
  drop: Drop;
  gear: Gear;
  name: string;
  collectedAt: number;
  catchText: string;
  day: Day | null;
};

export type ActiveGear = {
  inWater: GearRow[];
  collected: CollectedRow[];
  inDays: ReadonlySet<string>;
  nearest: GearRow | null;
  counts: { inWater: string; collected: string };
  multiDay: boolean;
};

export const activeGear = (
  trip: Trip,
  from: LatLon | null,
  at: number,
  days: DaySelection
): ActiveGear => {
  const { rows, multiDay } = projection(trip);
  const inWater = rows
    .flatMap(({ drop, ...row }): GearRow[] =>
      isInWater(drop)
        ? [
            {
              ...row,
              drop,
              direction: directionTo(from, drop),
              rough: roughness(drop.position),
              timeInWater: timeInWater(drop, at)
            }
          ]
        : []
    )
    .sort(byDistance);
  const collected = rows
    .flatMap(({ drop, ...row }): CollectedRow[] =>
      drop.collectedAt === null
        ? []
        : [
            {
              ...row,
              drop,
              collectedAt: drop.collectedAt,
              catchText: catchText(drop.catch)
            }
          ]
    )
    .sort((a, b) => b.collectedAt - a.collectedAt);
  const inDays = new Set(
    trip.drops.filter(dayFilter(days, multiDay, at)).map(({ id }) => id)
  );
  return {
    inWater,
    collected,
    inDays,
    nearest:
      inWater.find(
        (row) => row.direction !== null && inDays.has(row.drop.id)
      ) ?? null,
    counts: gearCounts(trip),
    multiDay
  };
};

const latestDrop = (trip: Trip) =>
  Math.max(trip.startedAt, ...trip.drops.map((drop) => drop.placedAt));

const earliestDrop = (trip: Trip) =>
  Math.min(latestDrop(trip), ...trip.drops.map((drop) => drop.placedAt));

const tripSpan = (trip: Trip) => ({
  first: earliestDrop(trip),
  last: latestDrop(trip)
});

const FULL_DATE: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric'
};

const DATE_IN_YEAR: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  month: 'long',
  day: 'numeric'
};

export const tripDates = (trip: Trip) => {
  const span = tripSpan(trip);
  const first = new Date(span.first);
  const last = new Date(span.last);
  if (localDate(first.getTime()) === localDate(last.getTime())) {
    return first.toLocaleDateString('en-US', FULL_DATE);
  }
  if (first.getFullYear() === last.getFullYear()) {
    return `${first.toLocaleDateString('en-US', DATE_IN_YEAR)} to ${last.toLocaleDateString('en-US', FULL_DATE)}`;
  }
  return `${first.toLocaleDateString('en-US', FULL_DATE)} to ${last.toLocaleDateString('en-US', FULL_DATE)}`;
};

const dropCount = (trip: Trip) => {
  const drops = trip.drops.length;
  return `${String(drops)} ${drops === 1 ? 'drop' : 'drops'}`;
};

const pastTripCounts = (trip: Trip) => {
  const uncollected = trip.drops.filter(isInWater).length;
  const total = dropCount(trip);
  return uncollected === 0
    ? total
    : `${total}, ${String(uncollected)} uncollected`;
};

export type PastTripSummary = {
  trip: Trip;
  dates: string;
  shortDates: string;
  startTime: string | null;
  counts: string;
  dropCount: string;
};

export const pastTripSummaries = (
  trips: readonly Trip[]
): PastTripSummary[] => {
  const rows = trips.map((trip) => {
    const span = tripSpan(trip);
    return {
      trip,
      dates: tripDates(trip),
      shortDates: shortDateRange(span.first, span.last),
      counts: pastTripCounts(trip),
      dropCount: dropCount(trip)
    };
  });
  const byDate = new Map<string, number>();
  for (const row of rows) {
    byDate.set(row.dates, (byDate.get(row.dates) ?? 0) + 1);
  }
  return rows.map((row) => ({
    ...row,
    startTime:
      (byDate.get(row.dates) ?? 0) > 1 ? shortTime(row.trip.startedAt) : null
  }));
};

export type PastDaySelection = 'last' | 'earlier' | 'all';

export type PastDropRow = {
  drop: Drop;
  gear: Gear;
  name: string;
  status: string;
  day: Day | null;
};

const DAY_OF_PAST: Record<PastDaySelection, DaySelection> = {
  last: 'today',
  earlier: 'earlier',
  all: 'all'
};

type PastGear = { rows: PastDropRow[]; multiDay: boolean };

export const pastGear = (trip: Trip, selection: PastDaySelection): PastGear => {
  const { rows, multiDay } = projection(trip);
  const shown = dayFilter(DAY_OF_PAST[selection], multiDay, latestDrop(trip));
  return {
    rows: rows
      .filter(({ drop }) => shown(drop))
      .map((row) => ({
        ...row,
        status:
          row.drop.collectedAt === null
            ? 'Uncollected'
            : catchText(row.drop.catch)
      })),
    multiDay
  };
};
