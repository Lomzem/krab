import type { LatLon } from '#lib/features/trip/index.js';
import type { Accuracy } from './base-style';

const EARTH_RADIUS_M = 6_371_008.8;
const STEPS = 48;

export const accuracyArea = (
  at: LatLon | null,
  radiusM: number,
  rough: boolean
): Accuracy => {
  if (!at) return { type: 'FeatureCollection', features: [] };
  const latRad = (at.lat * Math.PI) / 180;
  const dLat = ((radiusM / EARTH_RADIUS_M) * 180) / Math.PI;
  const dLon = dLat / Math.max(Math.cos(latRad), 0.01);
  const ring = Array.from({ length: STEPS + 1 }, (_, step) => {
    const angle = (2 * Math.PI * step) / STEPS;
    return [
      at.lon + dLon * Math.sin(angle),
      at.lat + dLat * Math.cos(angle)
    ] satisfies [number, number];
  });
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { rough },
        geometry: { type: 'Polygon', coordinates: [ring] }
      }
    ]
  };
};
