import { Effect, Result } from 'effect';
import {
  DropCancelled,
  DropNotSaved,
  startDrop,
  type DropAttempt,
  type DropPhase,
  type PlacedDrop
} from './drop';
import {
  AnotherTripActive,
  CannotDropAgain,
  DropNotFound,
  DroppedAgain,
  InvalidCatch,
  InvalidDepth,
  KindLocked,
  NotCollected
} from './failures';
import {
  activeOf,
  collectDrop,
  deletionOf,
  editDrop,
  gearName,
  locateDrop,
  restoreDrop,
  switchKind,
  uncollectDrop,
  withoutDrop
} from './rules';
import {
  openTripStorage,
  StorageFailed,
  type Change,
  type TripStorage
} from './storage';
import type { DropTarget } from './rules';
import type { Deletion, DropEdit, Kind, Trip, TripDeps } from './types';

export type {
  Catch,
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
  CannotDropAgain,
  DropCancelled,
  DropNotFound,
  DropNotSaved,
  DroppedAgain,
  InvalidCatch,
  InvalidDepth,
  KindLocked,
  NotCollected,
  StorageFailed
};
export type { DropAttempt, DropPhase, PlacedDrop };
export {
  canChangeKind,
  canDropAgain,
  canUndoCollect,
  gearName,
  KIND_NAMES,
  KINDS,
  type DropTarget
} from './rules';
export { compassPoint } from './format';
export { availability, type Availability } from './availability';
export {
  catchText,
  collectedGear,
  gearCounts,
  gearInWater,
  nearestGear,
  roughness,
  timeInWater,
  type CollectedRow,
  type Direction,
  type GearRow,
  type SpokenText
} from './queries';
export type { LatLon } from './geo';

export type NamedTrip = { trip: Trip; name: string };

export type Collection = NamedTrip & { changed: boolean };

export type DeletedDrop = {
  trip: Trip | null;
  name: string;
  deletion: Deletion;
};

export type TripBook = {
  activeTrip: () => Effect.Effect<Trip | null, StorageFailed>;
  placeDrop: (target: DropTarget) => Effect.Effect<DropAttempt>;
  undoDrop: (dropId: string) => Effect.Effect<Trip | null, StorageFailed>;
  updateDrop: (
    dropId: string,
    edit: DropEdit
  ) => Effect.Effect<
    Trip,
    DropNotFound | InvalidDepth | InvalidCatch | NotCollected | StorageFailed
  >;
  collect: (
    dropId: string
  ) => Effect.Effect<Collection, DropNotFound | StorageFailed>;
  undoCollect: (
    dropId: string
  ) => Effect.Effect<Collection, DropNotFound | DroppedAgain | StorageFailed>;
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

const activeDrop = (trips: readonly Trip[], dropId: string) => {
  const active = activeOf(trips);
  const found = active && locateDrop([active], dropId);
  const gear = found?.trip.gear.find((item) => item.id === found.drop.gearId);
  return found && gear ? { ...found, gear } : null;
};

type ActiveDrop = NonNullable<ReturnType<typeof activeDrop>>;

const collection = (
  found: ActiveDrop,
  changed: Trip | null
): Change<Collection> => {
  const name = gearName(found.gear);
  return changed
    ? {
        put: [changed],
        remove: [],
        result: { trip: changed, name, changed: true }
      }
    : {
        put: [],
        remove: [],
        result: { trip: found.trip, name, changed: false }
      };
};

const bookFor = (deps: TripDeps, storage: TripStorage): TripBook => ({
  activeTrip: () => Effect.map(storage.readTrips(), activeOf),
  placeDrop: (target) => startDrop(deps, storage, target),
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
    storage.readModifyWrite<
      Trip,
      DropNotFound | InvalidDepth | InvalidCatch | NotCollected
    >((trips) => {
      const found = locateDrop(trips, dropId);
      if (!found) return Result.fail(new DropNotFound({ dropId }));
      return Result.map(editDrop(found.trip, found.drop, edit), saved);
    }),
  collect: (dropId) =>
    Effect.suspend(() => {
      const at = deps.clock.now();
      return storage.readModifyWrite<Collection, DropNotFound>((trips) => {
        const found = activeDrop(trips, dropId);
        if (!found) return Result.fail(new DropNotFound({ dropId }));
        return Result.succeed(
          collection(found, collectDrop(found.trip, found.drop, at))
        );
      });
    }),
  undoCollect: (dropId) =>
    storage.readModifyWrite<Collection, DropNotFound | DroppedAgain>(
      (trips) => {
        const found = activeDrop(trips, dropId);
        if (!found) return Result.fail(new DropNotFound({ dropId }));
        return Result.map(uncollectDrop(found.trip, found.drop), (changed) =>
          collection(found, changed)
        );
      }
    ),
  changeKind: (dropId, kind) =>
    storage.readModifyWrite<NamedTrip, DropNotFound | KindLocked>((trips) => {
      const found = activeDrop(trips, dropId);
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
