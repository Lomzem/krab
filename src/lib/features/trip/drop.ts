import { Data, Deferred, Effect, Fiber, Result } from 'effect';
import { availabilityForDrop, dropDeadline } from './availability';
import { CannotDropAgain } from './failures';
import {
  dropCommand,
  gearName,
  placeDrop,
  type DropCommand,
  type DropTarget
} from './rules';
import { roughness, type SpokenText } from './queries';
import type { StorageFailed, TripStorage } from './storage';
import type {
  Drop,
  Fix,
  Located,
  PositionSource,
  Trip,
  TripDeps
} from './types';

export type PlacedDrop = {
  trip: Trip;
  drop: Drop;
  name: string;
  rough: SpokenText | null;
};

export class DropCancelled extends Data.TaggedError('DropCancelled') {}

export class DropNotSaved extends Data.TaggedError('DropNotSaved')<{
  readonly cause: StorageFailed;
  readonly retry: Effect.Effect<PlacedDrop, DropNotSaved | CannotDropAgain>;
}> {}

export type DropPhase = 'acquiring' | 'saving' | 'settled';

export type DropAttempt = {
  readonly deadline: number;
  readonly phase: () => DropPhase;
  readonly subscribe: (listener: () => void) => () => void;
  readonly saveWithoutPosition: () => void;
  readonly cancel: () => void;
  readonly result: Effect.Effect<
    PlacedDrop,
    DropCancelled | DropNotSaved | CannotDropAgain
  >;
};

const located = (fix: Fix): Located => ({
  position: { lat: fix.lat, lon: fix.lon, accuracyM: fix.accuracyM },
  noPosition: null
});

const SKIPPED: Located = { position: null, noPosition: 'skipped' };
const NO_FIX: Located = { position: null, noPosition: 'no-fix' };
const DENIED: Located = { position: null, noPosition: 'denied' };

const settledAt = (positions: PositionSource, tapAt: number, now: number) => {
  const status = availabilityForDrop(
    { denied: positions.denied(), fix: positions.latest() },
    tapAt,
    now
  );
  if (status.kind === 'denied') return DENIED;
  if (status.kind === 'ready') return located(status.fix);
  return null;
};

const store = (
  storage: TripStorage,
  command: DropCommand,
  where: Located
): Effect.Effect<PlacedDrop, DropNotSaved | CannotDropAgain> =>
  storage
    .readModifyWrite((trips) =>
      Result.map(placeDrop(trips, command, where), (placed) => ({
        put: placed.isNew ? [placed.trip] : [],
        remove: [],
        result: {
          trip: placed.trip,
          drop: placed.drop,
          name: gearName(placed.gear),
          rough: roughness(placed.drop.position)
        }
      }))
    )
    .pipe(
      Effect.catchTag('StorageFailed', (cause) =>
        Effect.fail(
          new DropNotSaved({
            cause,
            retry: Effect.suspend(() => store(storage, command, where))
          })
        )
      )
    );

const listen = (
  deps: TripDeps,
  tapAt: number,
  choice: Deferred.Deferred<Located, DropCancelled>
) =>
  deps.positions.subscribe(() => {
    const found = settledAt(deps.positions, tapAt, deps.clock.now());
    if (found) Deferred.doneUnsafe(choice, Effect.succeed(found));
  });

const observedPhase = (initial: DropPhase) => {
  let phase = initial;
  let listeners: (() => void)[] = [];
  return {
    current: () => phase,
    enter: (next: DropPhase) =>
      Effect.sync(() => {
        phase = next;
        for (const listener of listeners) listener();
      }),
    subscribe: (listener: () => void) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((other) => other !== listener);
      };
    }
  };
};

export const startDrop = (
  deps: TripDeps,
  storage: TripStorage,
  target: DropTarget
): DropAttempt => {
  const tapAt = deps.clock.now();
  const deadline = dropDeadline(tapAt);
  const command = dropCommand(target, tapAt);
  const atTap = settledAt(deps.positions, tapAt, tapAt);
  const choice = Deferred.makeUnsafe<Located, DropCancelled>();
  if (atTap) Deferred.doneUnsafe(choice, Effect.succeed(atTap));
  const phase = observedPhase(atTap ? 'saving' : 'acquiring');
  const unsubscribe = atTap ? () => undefined : listen(deps, tapAt, choice);
  const where = Effect.raceFirst(
    Deferred.await(choice),
    Effect.as(deps.clock.sleepUntil(deadline), NO_FIX)
  ).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        unsubscribe();
      })
    )
  );
  const work = where.pipe(
    Effect.tap(() => phase.enter('saving')),
    Effect.flatMap((found) => store(storage, command, found)),
    Effect.ensuring(phase.enter('settled'))
  );
  const fiber = Effect.runFork(work);
  return {
    deadline,
    phase: phase.current,
    subscribe: phase.subscribe,
    saveWithoutPosition: () => {
      Deferred.doneUnsafe(choice, Effect.succeed(SKIPPED));
    },
    cancel: () => {
      Deferred.doneUnsafe(choice, Effect.fail(new DropCancelled()));
    },
    result: Fiber.join(fiber)
  };
};
