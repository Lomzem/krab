import { Effect } from 'effect';
import { activeOf, gearName, placeDrop, undoDrop } from './rules';
import {
  openDatabase,
  readModifyWrite,
  readTrips,
  StorageFailed
} from './storage';
import type { Drop, Kind, Trip, TripDeps } from './types';

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
export { StorageFailed };
export { KIND_NAMES, KINDS } from './rules';
export { gearInWater, type Direction, type GearRow } from './queries';
export type { LatLon } from './geo';

export type PlacedDrop = { trip: Trip; drop: Drop; name: string };

export type TripBook = {
  activeTrip: () => Effect.Effect<Trip | null, StorageFailed>;
  placeDrop: (kind: Kind) => Effect.Effect<PlacedDrop, StorageFailed>;
  undoDrop: (dropId: string) => Effect.Effect<Trip | null, StorageFailed>;
};

const bookFor = (deps: TripDeps, db: IDBDatabase): TripBook => ({
  activeTrip: () => Effect.map(readTrips(db), activeOf),
  placeDrop: (kind) =>
    Effect.suspend(() => {
      const tapAt = deps.clock.now();
      const latest = deps.positions.latest();
      return readModifyWrite(db, (trips) => {
        const placed = placeDrop(activeOf(trips), kind, tapAt, latest);
        return {
          put: [placed.trip],
          remove: [],
          result: {
            trip: placed.trip,
            drop: placed.drop,
            name: gearName(placed.gear)
          }
        };
      });
    }),
  undoDrop: (dropId) =>
    readModifyWrite(db, (trips) => {
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
  Effect.map(openDatabase(deps.idb), (db) => bookFor(deps, db));
