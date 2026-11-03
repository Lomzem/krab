import { Effect, Result } from 'effect';
import {
  DropCancelled,
  DropNotSaved,
  startDrop,
  type DropAttempt,
  type PlacedDrop
} from './drop';
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
  restoreDrop,
  switchKind,
  withoutDrop
} from './rules';
import {
  openTripStorage,
  StorageFailed,
  type Change,
  type TripStorage
} from './storage';
import type { Deletion, DropEdit, Kind, Trip, TripDeps } from './types';

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
  DropCancelled,
  DropNotFound,
  DropNotSaved,
  InvalidDepth,
  KindLocked,
  StorageFailed
};
export type { DropAttempt, PlacedDrop };
export { canChangeKind, gearName, KIND_NAMES, KINDS } from './rules';
export { availability, type Availability } from './availability';
export {
  gearInWater,
  roughness,
  type Direction,
  type GearRow,
  type SpokenText
} from './queries';
export type { LatLon } from './geo';

export type NamedTrip = { trip: Trip; name: string };

export type DeletedDrop = {
  trip: Trip | null;
  name: string;
  deletion: Deletion;
};

export type TripBook = {
  activeTrip: () => Effect.Effect<Trip | null, StorageFailed>;
  placeDrop: (kind: Kind) => Effect.Effect<DropAttempt>;
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

const bookFor = (deps: TripDeps, storage: TripStorage): TripBook => ({
  activeTrip: () => Effect.map(storage.readTrips(), activeOf),
  placeDrop: (kind) => startDrop(deps, storage, kind),
  undoDrop: (dropId) =>
    storage.readModifyWrite((trips) => {
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
    storage.readModifyWrite<Trip, DropNotFound | InvalidDepth>((trips) => {
      const found = locateDrop(trips, dropId);
      if (!found) return Result.fail(new DropNotFound({ dropId }));
      return Result.map(editDrop(found.trip, dropId, edit), saved);
    }),
  changeKind: (dropId, kind) =>
    storage.readModifyWrite<NamedTrip, DropNotFound | KindLocked>((trips) => {
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
    storage.readModifyWrite<DeletedDrop, DropNotFound>((trips) => {
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
    storage.readModifyWrite<NamedTrip, AnotherTripActive>((trips) =>
      Result.map(restoreDrop(trips, deletion), (trip) => ({
        put: [trip],
        remove: [],
        result: { trip, name: gearName(deletion.gear) }
      }))
    )
});

export const openTripBook = (deps: TripDeps) =>
  Effect.map(openTripStorage(deps.idb), (storage) => bookFor(deps, storage));
