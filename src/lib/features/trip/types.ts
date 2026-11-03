export type Kind = 'pot' | 'net';

export type NoPosition = 'denied' | 'no-fix' | 'skipped';

export type Position = { lat: number; lon: number; accuracyM: number };

export type Gear = { id: string; kind: Kind; number: number };

export type Drop = {
  id: string;
  gearId: string;
  placedAt: number;
  position: Position | null;
  noPosition: NoPosition | null;
  label: string;
  bait: string;
  depthFt: number | null;
  notes: string;
  collectedAt: number | null;
  kept: number | null;
  released: number | null;
};

export type Trip = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  gear: Gear[];
  drops: Drop[];
  next: Record<Kind, number>;
};

export type Fix = Position & { at: number };

export type Clock = { now: () => number };

export type PositionSource = { latest: () => Fix | null };

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
