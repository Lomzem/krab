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

export type GearRow = {
  drop: Drop;
  gear: Gear;
  name: string;
  direction: Direction | null;
  rough: SpokenText | null;
  timeInWater: SpokenText;
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

const rowFor = (
  trip: Trip,
  drop: Drop,
  from: LatLon | null,
  at: number
): GearRow[] => {
  const gear = trip.gear.find((candidate) => candidate.id === drop.gearId);
  if (!gear) return [];
  return [
    {
      drop,
      gear,
      name: gearName(gear),
      direction: directionTo(from, drop),
      rough: roughness(drop.position),
      timeInWater: timeInWater(drop, at)
    }
  ];
};

const isInWater = (drop: Drop) => drop.collectedAt === null;

export const gearInWater = (trip: Trip, from: LatLon | null, at: number) =>
  trip.drops
    .filter(isInWater)
    .flatMap((drop) => rowFor(trip, drop, from, at))
    .sort(byDistance);

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
};

const collectedRow = (trip: Trip, drop: Drop): CollectedRow[] => {
  const gear = trip.gear.find((item) => item.id === drop.gearId);
  if (drop.collectedAt === null || !gear) return [];
  return [
    {
      drop,
      gear,
      name: gearName(gear),
      collectedAt: drop.collectedAt,
      catchText: catchText(drop.catch)
    }
  ];
};

export const collectedGear = (trip: Trip) =>
  trip.drops
    .flatMap((drop) => collectedRow(trip, drop))
    .sort((a, b) => b.collectedAt - a.collectedAt);

export const nearestGear = (
  trip: Trip,
  from: LatLon | null,
  at: number
): GearRow | null =>
  gearInWater(trip, from, at).find((row) => row.direction !== null) ?? null;
