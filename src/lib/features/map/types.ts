import type { LatLon } from '#lib/shared/lat-lon.js';

export type Camera = { center: LatLon; zoom: number };

export type Box = { left: number; right: number; up: number; down: number };

export type MapPlace = {
  id: string;
  at: LatLon;
  priority: number;
  alone: Box;
  leading: (more: number) => Box;
};

export type MyPosition = {
  at: LatLon;
  accuracyM: number;
  rough: boolean;
  current: boolean;
  courseDeg: number | null;
  label: string;
};
