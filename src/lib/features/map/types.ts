import type { LatLon } from '#lib/features/trip/index.js';

export type Camera = { center: LatLon; zoom: number };

export type Box = { left: number; right: number; up: number; down: number };

export type MapPlace = {
  id: string;
  at: LatLon;
  layer: 'in-water' | 'collected' | 'past';
  alone: Box;
  leading: (more: number) => Box;
};

export type MyPosition = {
  at: LatLon;
  accuracyM: number;
  rough: boolean;
  courseDeg: number | null;
  label: string;
};

export type Lane = {
  bottom: number;
  room: number | null;
  beside: { room: number; right: number } | null;
};
