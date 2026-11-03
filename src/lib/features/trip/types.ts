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

const Drop = Located.mapMembers(
  Tuple.map(
    Schema.fieldsAssign({
      id: Schema.String,
      gearId: Schema.String,
      placedAt: Schema.Finite,
      label: Schema.String,
      bait: Schema.String,
      depthFt: Schema.NullOr(Schema.Finite),
      notes: Schema.String,
      collectedAt: Schema.NullOr(Schema.Finite),
      kept: Schema.NullOr(Schema.Int),
      released: Schema.NullOr(Schema.Int)
    })
  )
);
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

export type TripDeps = {
  clock: Clock;
  positions: PositionSource;
  idb: IDBFactory;
};

export type DropDetails = Pick<Drop, 'label' | 'bait' | 'depthFt' | 'notes'>;

export type DropEdit = { details: DropDetails };

export type Deletion = {
  trip: Omit<Trip, 'gear' | 'drops'>;
  drop: Drop;
  dropIndex: number;
  gear: Gear;
  gearIndex: number;
};
