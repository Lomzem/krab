import type { LatLon } from '#lib/features/trip/index.js';

export type Camera = { center: LatLon; zoom: number };

export type MapPlace = { id: string; at: LatLon };

export type MyPosition = {
  at: LatLon;
  accuracyM: number;
  rough: boolean;
  courseDeg: number | null;
  label: string;
};
