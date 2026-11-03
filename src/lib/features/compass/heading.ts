import { magvar } from 'magvar';
import type { LatLon } from '#lib/features/trip/index.js';
import type { CompassState, Reading } from './types';

const MODEL_FROM_YEAR = 2025;
const MODEL_UNTIL_YEAR = 2030;
const SEA_LEVEL_KM = 0;
const WORST_ACCURACY_DEG = 30;
const SMOOTHING_WINDOW_MS = 500;
const AMBIGUOUS_LENGTH = 0.05;
const MEANINGFUL_MOVE_DEG = 0.05;
const DAY_MS = 86_400_000;

export const norm = (deg: number) => ((deg % 360) + 360) % 360;

const radians = (deg: number) => (deg * Math.PI) / 180;
const degrees = (rad: number) => (rad * 180) / Math.PI;

const decimalYear = (ms: number) => {
  const year = new Date(ms).getUTCFullYear();
  const start = Date.UTC(year, 0, 1);
  return year + (ms - start) / (Date.UTC(year + 1, 0, 1) - start);
};

export type Declination = { at: LatLon; day: number; deg: number | null };

const stillValid = (cached: Declination, where: LatLon, day: number) =>
  cached.day === day &&
  Math.abs(cached.at.lat - where.lat) < MEANINGFUL_MOVE_DEG &&
  Math.abs(cached.at.lon - where.lon) < MEANINGFUL_MOVE_DEG;

export const declinationFor = (
  cached: Declination | null,
  where: LatLon,
  now: number
): Declination => {
  const day = Math.floor(now / DAY_MS);
  if (cached && stillValid(cached, where, day)) return cached;
  const year = decimalYear(now);
  const modelled = year >= MODEL_FROM_YEAR && year < MODEL_UNTIL_YEAR;
  return {
    at: { lat: where.lat, lon: where.lon },
    day,
    deg: modelled ? magvar(where.lat, where.lon, SEA_LEVEL_KM, year) : null
  };
};

type Sample = { at: number; sin: number; cos: number };

export type Smoothing = { screenAngleDeg: number; samples: readonly Sample[] };

export const NO_SMOOTHING: Smoothing = { screenAngleDeg: 0, samples: [] };

const measured = (value: number | null): value is number =>
  value !== null && Number.isFinite(value) && value >= 0;

const magneticOf = ({ headingDeg, accuracyDeg }: Reading) =>
  measured(headingDeg) &&
  measured(accuracyDeg) &&
  accuracyDeg <= WORST_ACCURACY_DEG
    ? headingDeg
    : null;

export const smooth = (
  previous: Smoothing,
  reading: Reading,
  declinationDeg: number
): { smoothing: Smoothing; trueHeadingDeg: number | null } => {
  const magnetic = magneticOf(reading);
  if (magnetic === null)
    return { smoothing: NO_SMOOTHING, trueHeadingDeg: null };
  const screenAngleDeg = norm(reading.screenAngleDeg);
  const trueDeg = norm(magnetic + screenAngleDeg + declinationDeg);
  const sample = {
    at: reading.at,
    sin: Math.sin(radians(trueDeg)),
    cos: Math.cos(radians(trueDeg))
  };
  const kept =
    previous.screenAngleDeg === screenAngleDeg
      ? previous.samples.filter(
          (old) => reading.at - old.at < SMOOTHING_WINDOW_MS
        )
      : [];
  const samples = [...kept, sample];
  const sin = samples.reduce((sum, item) => sum + item.sin, 0);
  const cos = samples.reduce((sum, item) => sum + item.cos, 0);
  if (Math.hypot(sin, cos) / samples.length < AMBIGUOUS_LENGTH) {
    return {
      smoothing: { screenAngleDeg, samples: [sample] },
      trueHeadingDeg: trueDeg
    };
  }
  return {
    smoothing: { screenAngleDeg, samples },
    trueHeadingDeg: norm(degrees(Math.atan2(sin, cos)))
  };
};

export const arrowDeg = (bearingDeg: number, compass: CompassState) =>
  norm(
    compass.kind === 'usable' ? bearingDeg - compass.trueHeadingDeg : bearingDeg
  );
