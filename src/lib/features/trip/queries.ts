import { compassPoint, distanceText, durationText } from './format';
import { bearingDeg, distanceFt, type LatLon } from './geo';
import { gearName } from './rules';
import type { Drop, Gear, Trip } from './types';

export type Direction = {
  feet: number;
  bearingDeg: number;
  distance: string;
  distanceSpoken: string;
  point: string;
  pointShort: string;
};

export type GearRow = {
  drop: Drop;
  gear: Gear;
  name: string;
  direction: Direction | null;
  timeInWater: { short: string; spoken: string };
};

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
      timeInWater: durationText(at - drop.placedAt)
    }
  ];
};

export const gearInWater = (trip: Trip, from: LatLon | null, at: number) =>
  trip.drops
    .filter((drop) => drop.collectedAt === null)
    .flatMap((drop) => rowFor(trip, drop, from, at))
    .sort(byDistance);
