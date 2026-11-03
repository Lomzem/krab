import { Effect } from 'effect';
import {
  DropCancelled,
  DropNotSaved,
  startDrop,
  type DropAttempt,
  type PlacedDrop
} from './drop';
import { activeOf, undoDrop } from './rules';
import { openTripStorage, StorageFailed, type TripStorage } from './storage';
import type { Kind, Trip, TripDeps } from './types';

export type {
  Clock,
  Drop,
  Fix,
  Gear,
  Kind,
  NoPosition,
  Position,
  PositionSource,
  Trip,
  TripDeps
} from './types';
export { DropCancelled, DropNotSaved, StorageFailed };
export type { DropAttempt, PlacedDrop };
export { KIND_NAMES, KINDS } from './rules';
export {
  gearInWater,
  roughness,
  type Direction,
  type GearRow,
  type SpokenText
} from './queries';
export type { LatLon } from './geo';

export type TripBook = {
  activeTrip: () => Effect.Effect<Trip | null, StorageFailed>;
  placeDrop: (kind: Kind) => Effect.Effect<DropAttempt>;
  undoDrop: (dropId: string) => Effect.Effect<Trip | null, StorageFailed>;
};

const bookFor = (deps: TripDeps, storage: TripStorage): TripBook => ({
  activeTrip: () => Effect.map(storage.readTrips(), activeOf),
  placeDrop: (kind) => startDrop(deps, storage, kind),
  undoDrop: (dropId) =>
    storage.readModifyWrite((trips) => {
      const active = activeOf(trips);
      if (!active?.drops.some((drop) => drop.id === dropId)) {
        return { put: [], remove: [], result: active };
      }
      const trip = undoDrop(active, dropId);
      return trip
        ? { put: [trip], remove: [], result: trip }
        : { put: [], remove: [active.id], result: null };
    })
});

export const openTripBook = (deps: TripDeps) =>
  Effect.map(openTripStorage(deps.idb), (storage) => bookFor(deps, storage));
