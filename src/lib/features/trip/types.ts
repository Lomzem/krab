import { Schema, Tuple, type Effect } from 'effect';

const Kind = Schema.Literals(['pot', 'net']);
export type Kind = typeof Kind.Type;

const NoPosition = Schema.Literals(['denied', 'no-fix', 'skipped']);
export type NoPosition = typeof NoPosition.Type;

const Position = Schema.Struct({
  lat: Schema.Finite,
  lon: Schema.Finite,
  accuracyM: Schema.Finite
});
export type Position = typeof Position.Type;

const Located = Schema.Union([
  Schema.Struct({ position: Position, noPosition: Schema.Null }),
  Schema.Struct({ position: Schema.Null, noPosition: NoPosition })
]);
export type Located = typeof Located.Type;

const Gear = Schema.Struct({
  id: Schema.String,
  kind: Kind,
  number: Schema.Int
});
export type Gear = typeof Gear.Type;

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

export const Catch = Schema.Struct({ kept: Count, released: Count });
export type Catch = typeof Catch.Type;

const Collection = Schema.Union([
  Schema.Struct({ collectedAt: Schema.Null, catch: Schema.Null }),
  Schema.Struct({ collectedAt: Schema.Finite, catch: Schema.NullOr(Catch) })
]);

const dropLocated = <const Fields extends Schema.Struct.Fields>(
  located: Fields
) =>
  Collection.mapMembers(
    Tuple.map(
      Schema.fieldsAssign({
        id: Schema.String,
        gearId: Schema.String,
        placedAt: Schema.Finite,
        ...located,
        label: Schema.String,
        bait: Schema.String,
        depthFt: Schema.NullOr(Schema.Finite),
        notes: Schema.String
      })
    )
  );

const [Placed, Unplaced] = Located.members;

const Drop = Schema.Union([
  dropLocated(Placed.fields),
  dropLocated(Unplaced.fields)
]);
export type Drop = typeof Drop.Type;

export const Trip = Schema.Struct({
  id: Schema.String,
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
  gear: Schema.Array(Gear),
  drops: Schema.Array(Drop),
  next: Schema.Struct({ pot: Schema.Int, net: Schema.Int })
});
export type Trip = typeof Trip.Type;

export type Fix = Position & { at: number };

export type Clock = {
  now: () => number;
  sleepUntil: (at: number) => Effect.Effect<void>;
};

export type PositionSource = {
  latest: () => Fix | null;
  denied: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

export type Trips = { active: Trip | null; past: readonly Trip[] };

export type TripDeps = {
  clock: Clock;
  positions: PositionSource;
  idb: IDBFactory;
  stored: (trips: Trips) => void;
};

export type DropDetails = Pick<Drop, 'label' | 'bait' | 'depthFt' | 'notes'>;

export type DropEdit = { details: DropDetails; catch: Catch | null };

export type Deletion = {
  trip: Omit<Trip, 'gear' | 'drops'>;
  drop: Drop;
  gear: Gear;
};
