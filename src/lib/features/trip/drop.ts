import { Data, Deferred, Effect, Fiber, Result } from 'effect';
import { activeOf, gearName, placeDrop, type Located } from './rules';
import { roughness, type SpokenText } from './queries';
import { readModifyWrite, type StorageFailed } from './storage';
import type { Drop, Fix, Kind, PositionSource, Trip, TripDeps } from './types';

export const FRESH_FIX_MS = 5000;
export const FIX_WAIT_MS = 20_000;

export type PlacedDrop = {
  trip: Trip;
  drop: Drop;
  name: string;
  rough: SpokenText | null;
};

export class DropCancelled extends Data.TaggedError('DropCancelled') {}

export class DropNotSaved extends Data.TaggedError('DropNotSaved')<{
  readonly cause: StorageFailed;
  readonly retry: Effect.Effect<PlacedDrop, DropNotSaved>;
}> {}

export type DropAttempt = {
  readonly gettingPosition: () => boolean;
  readonly saveWithoutPosition: () => void;
  readonly cancel: () => void;
  readonly result: Effect.Effect<PlacedDrop, DropCancelled | DropNotSaved>;
};

const located = (fix: Fix): Located => ({
  position: { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM },
  noPosition: null
});

const SKIPPED: Located = { position: null, noPosition: 'skipped' };
const NO_FIX: Located = { position: null, noPosition: 'no-fix' };
const DENIED: Located = { position: null, noPosition: 'denied' };

const settledAt = (positions: PositionSource, tapAt: number) => {
  const fix = positions.latest();
  if (fix && fix.at >= tapAt - FRESH_FIX_MS) return located(fix);
  return positions.denied() ? DENIED : null;
};

const store = (
  db: IDBDatabase,
  kind: Kind,
  tapAt: number,
  where: Located
): Effect.Effect<PlacedDrop, DropNotSaved> =>
  Effect.mapError(
    readModifyWrite(db, (trips) => {
      const placed = placeDrop(activeOf(trips), kind, tapAt, where);
      return Result.succeed({
        put: [placed.trip],
        remove: [],
        result: {
          trip: placed.trip,
          drop: placed.drop,
          name: gearName(placed.gear),
          rough: roughness(placed.drop.position)
        }
      });
    }),
    (cause) =>
      new DropNotSaved({
        cause,
        retry: Effect.suspend(() => store(db, kind, tapAt, where))
      })
  );

const listen = (
  positions: PositionSource,
  tapAt: number,
  choice: Deferred.Deferred<Located, DropCancelled>
) =>
  positions.subscribe(() => {
    const found = settledAt(positions, tapAt);
    if (found) Deferred.doneUnsafe(choice, Effect.succeed(found));
  });

export const startDrop = (deps: TripDeps, db: IDBDatabase, kind: Kind) =>
  Effect.suspend(() => {
    const tapAt = deps.clock.now();
    const atTap = settledAt(deps.positions, tapAt);
    const choice = Deferred.makeUnsafe<Located, DropCancelled>();
    if (atTap) Deferred.doneUnsafe(choice, Effect.succeed(atTap));
    let waiting = atTap === null;
    const unsubscribe = waiting
      ? listen(deps.positions, tapAt, choice)
      : () => undefined;
    const where = Effect.raceFirst(
      Deferred.await(choice),
      Effect.as(deps.clock.sleepUntil(tapAt + FIX_WAIT_MS), NO_FIX)
    ).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          waiting = false;
          unsubscribe();
        })
      )
    );
    const work = Effect.flatMap(where, (found) =>
      store(db, kind, tapAt, found)
    );
    return Effect.map(Effect.forkDetach(work), (fiber): DropAttempt => ({
      gettingPosition: () => waiting,
      saveWithoutPosition: () => {
        Deferred.doneUnsafe(choice, Effect.succeed(SKIPPED));
      },
      cancel: () => {
        Deferred.doneUnsafe(choice, Effect.fail(new DropCancelled()));
      },
      result: Fiber.join(fiber)
    }));
  });
