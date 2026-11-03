export type LatLon = { lat: number; lon: number };

const EARTH_RADIUS_M = 6_371_008.8;
const FEET_PER_METRE = 1 / 0.3048;

const radians = (deg: number) => (deg * Math.PI) / 180;
const degrees = (rad: number) => (rad * 180) / Math.PI;

export const distanceFt = (from: LatLon, to: LatLon) => {
  const dLat = radians(to.lat - from.lat);
  const dLon = radians(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(radians(from.lat)) *
      Math.cos(radians(to.lat)) *
      Math.sin(dLon / 2) ** 2;
  const central = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return central * EARTH_RADIUS_M * FEET_PER_METRE;
};

export const bearingDeg = (from: LatLon, to: LatLon) => {
  const lat1 = radians(from.lat);
  const lat2 = radians(to.lat);
  const dLon = radians(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (degrees(Math.atan2(y, x)) + 360) % 360;
};
