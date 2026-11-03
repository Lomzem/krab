import { compassPoint, distanceText, durationText } from './format';
import { bearingDeg, distanceFt, metresToFeet, type LatLon } from './geo';
import { gearName } from './rules';
import type { Drop, Gear, Position, Trip } from './types';

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
      timeInWater: durationText(at - drop.placedAt)
    }
  ];
};

export const gearInWater = (trip: Trip, from: LatLon | null, at: number) =>
  trip.drops
    .filter((drop) => drop.collectedAt === null)
    .flatMap((drop) => rowFor(trip, drop, from, at))
    .sort(byDistance);

export const nearestGear = (
  trip: Trip,
  from: LatLon | null,
  at: number
): GearRow | null =>
  gearInWater(trip, from, at).find((row) => row.direction !== null) ?? null;
