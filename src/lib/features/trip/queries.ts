import { compassPoint, distanceText, durationText } from './format';
import { bearingDeg, distanceFt, metresToFeet, type LatLon } from './geo';
import { gearName } from './rules';
import type { Catch, Drop, Gear, Position, Trip } from './types';

const ROUGH_ACCURACY_M = 50;

export type Direction = {
  feet: number;
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

export const tripDays = (trip: Trip) =>
  [...new Set(trip.drops.map((drop) => dayNumber(trip, drop.placedAt)))].sort(
    (a, b) => a - b
  );

export const isMultiDay = (trip: Trip) => tripDays(trip).length > 1;

const dayNamer = (trip: Trip) => {
  const multiDay = isMultiDay(trip);
  return (drop: Drop): Day | null => {
    if (!multiDay) return null;
    const number = dayNumber(trip, drop.placedAt);
    return { number, text: `Day ${String(number)}` };
  };
};

export const dayOf = (trip: Trip, drop: Drop) => dayNamer(trip)(drop);

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

export const dropsInDays = (
  trip: Trip,
  selection: DaySelection,
  now: number
) => {
  if (selection === 'all' || !isMultiDay(trip)) return trip.drops;
  const today = localDate(now);
  return trip.drops.filter((drop) =>
    selection === 'today'
      ? localDate(drop.placedAt) === today
      : localDate(drop.placedAt) < today
  );
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
  const bearing = bearingDeg(from, drop.position);
  const text = distanceText(feet);
  const [point, pointShort] = compassPoint(bearing);
  return {
    feet,
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

export const gearInWater = (trip: Trip, from: LatLon | null, at: number) => {
  const dayFor = dayNamer(trip);
  return trip.drops
    .filter(isInWater)
    .flatMap((drop): GearRow[] => {
      const gear = trip.gear.find((candidate) => candidate.id === drop.gearId);
      if (!gear) return [];
      return [
        {
          drop,
          gear,
          name: gearName(gear),
          direction: directionTo(from, drop),
          rough: roughness(drop.position),
          timeInWater: timeInWater(drop, at),
          day: dayFor(drop)
        }
      ];
    })
    .sort(byDistance);
};

export const gearCounts = (trip: Trip) => {
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

export const catchText = (recorded: Catch | null) => {
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

export const collectedGear = (trip: Trip) => {
  const dayFor = dayNamer(trip);
  return trip.drops
    .flatMap((drop): CollectedRow[] => {
      const gear = trip.gear.find((item) => item.id === drop.gearId);
      if (drop.collectedAt === null || !gear) return [];
      return [
        {
          drop,
          gear,
          name: gearName(gear),
          collectedAt: drop.collectedAt,
          catchText: catchText(drop.catch),
          day: dayFor(drop)
        }
      ];
    })
    .sort((a, b) => b.collectedAt - a.collectedAt);
};

export const nearestGear = (rows: readonly GearRow[]): GearRow | null =>
  rows.find((row) => row.direction !== null) ?? null;
