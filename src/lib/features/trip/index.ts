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
  NotCollected,
  TripNotEnded,
  TripNotFound
} from './failures';
import {
  activeOf,
  collectDrop,
  deletionOf,
  editDrop,
  endTrip,
  gearName,
  findDrop,
  restoreDrop,
  switchKind,
  tripsOf,
  uncollectDrop,
  withoutDrop
} from './rules';
import {
  StorageFailed,
  tripStorage,
  type Change,
  type TripStorage
} from './storage';
import type { DropTarget, FoundDrop } from './rules';
import type { Deletion, DropEdit, Kind, Trip, TripDeps, Trips } from './types';

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
  TripDeps,
  Trips
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
  StorageFailed,
  TripNotEnded,
  TripNotFound
};
export type { DropAttempt, DropPhase, PlacedDrop };
export {
  canChangeKind,
  canDropAgain,
  canUndoCollect,
  findDrop,
  gearName,
  KIND_NAMES,
  KINDS,
  type DropTarget,
  type FoundDrop
} from './rules';
export { compassPoint, shortDateRange } from './format';
export { availability, type Availability } from './availability';
export {
  catchText,
  collectedGear,
  dayGroups,
  dayOf,
  dropsInDays,
  gearCounts,
  gearInWater,
  isMultiDay,
  nearestGear,
  pastDrops,
  pastTripCounts,
  roughness,
  timeInWater,
  tripDates,
  tripDays,
  tripSpan,
  type CollectedRow,
  type Day,
  type DaySelection,
  type Direction,
  type GearRow,
  type PastDaySelection,
  type PastDropRow,
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
  trips: () => Effect.Effect<Trips, StorageFailed>;
  placeDrop: (target: DropTarget) => DropAttempt;
  undoDrop: (dropId: string) => Effect.Effect<Trip | null, StorageFailed>;
  saveDrop: (
    dropId: string,
    edit: DropEdit,
    kind: Kind | null
  ) => Effect.Effect<
    NamedTrip,
    | DropNotFound
    | InvalidDepth
    | InvalidCatch
    | NotCollected
    | KindLocked
    | StorageFailed
  >;
  collect: (
    dropId: string
  ) => Effect.Effect<Collection, DropNotFound | StorageFailed>;
  undoCollect: (
    dropId: string
  ) => Effect.Effect<Collection, DropNotFound | DroppedAgain | StorageFailed>;
  deleteDrop: (
    dropId: string
  ) => Effect.Effect<DeletedDrop, DropNotFound | StorageFailed>;
  restoreDrop: (
    deletion: Deletion
  ) => Effect.Effect<
    NamedTrip,
    AnotherTripActive | DroppedAgain | StorageFailed
  >;
  endTrip: (
    tripId: string
  ) => Effect.Effect<Trip, TripNotFound | StorageFailed>;
  deleteTrip: (
    tripId: string
  ) => Effect.Effect<void, TripNotEnded | StorageFailed>;
};

const tripIn = (trips: readonly Trip[], tripId: string) =>
  trips.find((trip) => trip.id === tripId) ?? null;

const activeDrop = (trips: readonly Trip[], dropId: string) => {
  const active = activeOf(trips);
  return active ? findDrop([active], dropId) : null;
};

const collection = (
  found: FoundDrop,
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
  trips: () => Effect.map(storage.readTrips(), tripsOf),
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
  saveDrop: (dropId, edit, kind) =>
    storage.readModifyWrite<
      NamedTrip,
      DropNotFound | InvalidDepth | InvalidCatch | NotCollected | KindLocked
    >((trips) => {
      const found = findDrop(trips, dropId);
      if (!found) return Result.fail(new DropNotFound({ dropId }));
      const edited = Result.flatMap(
        editDrop(found.trip, found.drop, edit),
        (trip) =>
          kind === null
            ? Result.succeed({ trip, gear: found.gear })
            : switchKind(trip, found.drop, kind)
      );
      return Result.map(edited, (next) => ({
        put: [next.trip],
        remove: [],
        result: { trip: next.trip, name: gearName(next.gear) }
      }));
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
  deleteDrop: (dropId) =>
    storage.readModifyWrite<DeletedDrop, DropNotFound>((trips) => {
      const found = findDrop(trips, dropId);
      if (!found) return Result.fail(new DropNotFound({ dropId }));
      const deletion = deletionOf(found.trip, found.drop, found.gear);
      const trip = withoutDrop(found.trip, dropId);
      const result = { trip, name: gearName(deletion.gear), deletion };
      return Result.succeed(
        trip
          ? { put: [trip], remove: [], result }
          : { put: [], remove: [found.trip.id], result }
      );
    }),
  restoreDrop: (deletion) =>
    storage.readModifyWrite<NamedTrip, AnotherTripActive | DroppedAgain>(
      (trips) =>
        Result.map(restoreDrop(trips, deletion), (trip) => ({
          put: [trip],
          remove: [],
          result: { trip, name: gearName(deletion.gear) }
        }))
    ),
  endTrip: (tripId) =>
    Effect.suspend(() => {
      const at = deps.clock.now();
      return storage.readModifyWrite<Trip, TripNotFound>((trips) => {
        const trip = tripIn(trips, tripId);
        if (!trip) return Result.fail(new TripNotFound({ tripId }));
        const ended = endTrip(trip, at);
        return Result.succeed(
          ended
            ? { put: [ended], remove: [], result: ended }
            : { put: [], remove: [], result: trip }
        );
      });
    }),
  deleteTrip: (tripId) =>
    storage.readModifyWrite<undefined, TripNotEnded>((trips) => {
      const trip = tripIn(trips, tripId);
      if (trip?.endedAt === null) {
        return Result.fail(new TripNotEnded({ tripId }));
      }
      return Result.succeed({
        put: [],
        remove: trip ? [trip.id] : [],
        result: undefined
      });
    })
});

export const tripBook = (deps: TripDeps): TripBook =>
  bookFor(
    deps,
    tripStorage(deps.idb, (trips) => {
      deps.stored(tripsOf(trips));
    })
  );
