import { Effect, Result } from 'effect';
import {
  AnotherTripActive,
  DropNotFound,
  InvalidDepth,
  KindLocked
} from './failures';
import {
  activeOf,
  deletionOf,
  editDrop,
  gearName,
  locateDrop,
  placeDrop,
  restoreDrop,
  switchKind,
  withoutDrop
} from './rules';
import {
  openDatabase,
  readModifyWrite,
  readTrips,
  StorageFailed,
  type Change
} from './storage';
import type { Deletion, Drop, DropEdit, Kind, Trip, TripDeps } from './types';

export type {
  Clock,
  Deletion,
  Drop,
  DropDetails,
  DropEdit,
  Fix,
  Gear,
  Kind,
  NoPosition,
  Position,
  PositionSource,
  Trip,
  TripDeps
} from './types';
export {
  AnotherTripActive,
  DropNotFound,
  InvalidDepth,
  KindLocked,
  StorageFailed
};
export { canChangeKind, KIND_NAMES, KINDS } from './rules';
export { gearInWater, type Direction, type GearRow } from './queries';
export type { LatLon } from './geo';

export type PlacedDrop = { trip: Trip; drop: Drop; name: string };

export type NamedTrip = { trip: Trip; name: string };

export type DeletedDrop = {
  trip: Trip | null;
  name: string;
  deletion: Deletion;
};

export type TripBook = {
  activeTrip: () => Effect.Effect<Trip | null, StorageFailed>;
  placeDrop: (kind: Kind) => Effect.Effect<PlacedDrop, StorageFailed>;
  undoDrop: (dropId: string) => Effect.Effect<Trip | null, StorageFailed>;
  updateDrop: (
    dropId: string,
    edit: DropEdit
  ) => Effect.Effect<Trip, DropNotFound | InvalidDepth | StorageFailed>;
  changeKind: (
    dropId: string,
    kind: Kind
  ) => Effect.Effect<NamedTrip, DropNotFound | KindLocked | StorageFailed>;
  deleteDrop: (
    dropId: string
  ) => Effect.Effect<DeletedDrop, DropNotFound | StorageFailed>;
  restoreDrop: (
    deletion: Deletion
  ) => Effect.Effect<NamedTrip, AnotherTripActive | StorageFailed>;
};

const saved = (trip: Trip): Change<Trip> => ({
  put: [trip],
  remove: [],
  result: trip
});

const bookFor = (deps: TripDeps, db: IDBDatabase): TripBook => ({
  activeTrip: () => Effect.map(readTrips(db), activeOf),
  placeDrop: (kind) =>
    Effect.suspend(() => {
      const tapAt = deps.clock.now();
      const latest = deps.positions.latest();
      return readModifyWrite(db, (trips) => {
        const placed = placeDrop(activeOf(trips), kind, tapAt, latest);
        return Result.succeed({
          put: [placed.trip],
          remove: [],
          result: {
            trip: placed.trip,
            drop: placed.drop,
            name: gearName(placed.gear)
          }
        });
      });
    }),
  undoDrop: (dropId) =>
    readModifyWrite(db, (trips) => {
      const active = activeOf(trips);
      if (!active?.drops.some((drop) => drop.id === dropId)) {
        return Result.succeed({ put: [], remove: [], result: active });
      }
      const trip = withoutDrop(active, dropId);
      return Result.succeed(
        trip
          ? { put: [trip], remove: [], result: trip }
          : { put: [], remove: [active.id], result: null }
      );
    }),
  updateDrop: (dropId, edit) =>
    readModifyWrite<Trip, DropNotFound | InvalidDepth>(db, (trips) => {
      const found = locateDrop(trips, dropId);
      if (!found) return Result.fail(new DropNotFound({ dropId }));
      return Result.map(editDrop(found.trip, dropId, edit), saved);
    }),
  changeKind: (dropId, kind) =>
    readModifyWrite<NamedTrip, DropNotFound | KindLocked>(db, (trips) => {
      const active = activeOf(trips);
      const found = active && locateDrop([active], dropId);
      if (!found) return Result.fail(new DropNotFound({ dropId }));
      return Result.map(switchKind(found.trip, found.drop, kind), (next) => ({
        put: [next.trip],
        remove: [],
        result: { trip: next.trip, name: gearName(next.gear) }
      }));
    }),
  deleteDrop: (dropId) =>
    readModifyWrite<DeletedDrop, DropNotFound>(db, (trips) => {
      const found = locateDrop(trips, dropId);
      const deletion = found && deletionOf(found.trip, found.index, found.drop);
      if (!found || !deletion) {
        return Result.fail(new DropNotFound({ dropId }));
      }
      const trip = withoutDrop(found.trip, dropId);
      const result = { trip, name: gearName(deletion.gear), deletion };
      return Result.succeed(
        trip
          ? { put: [trip], remove: [], result }
          : { put: [], remove: [found.trip.id], result }
      );
    }),
  restoreDrop: (deletion) =>
    readModifyWrite<NamedTrip, AnotherTripActive>(db, (trips) =>
      Result.map(restoreDrop(trips, deletion), (trip) => ({
        put: [trip],
        remove: [],
        result: { trip, name: gearName(deletion.gear) }
      }))
    )
});

export const openTripBook = (deps: TripDeps) =>
  Effect.map(openDatabase(deps.idb), (db) => bookFor(deps, db));
