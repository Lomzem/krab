import { Data } from 'effect';
import type { Catch } from './types';

export class DropNotFound extends Data.TaggedError('DropNotFound')<{
  readonly dropId: string;
}> {}

export class InvalidDepth extends Data.TaggedError('InvalidDepth')<{
  readonly depthFt: number;
}> {}

export class KindLocked extends Data.TaggedError('KindLocked')<{
  readonly dropId: string;
}> {}

export class AnotherTripActive extends Data.TaggedError('AnotherTripActive')<{
  readonly tripId: string;
}> {}

export class InvalidCatch extends Data.TaggedError('InvalidCatch')<{
  readonly catch: Catch;
}> {}

export class NotCollected extends Data.TaggedError('NotCollected')<{
  readonly dropId: string;
}> {}

export class DroppedAgain extends Data.TaggedError('DroppedAgain')<{
  readonly dropId: string;
}> {}

export class CannotDropAgain extends Data.TaggedError('CannotDropAgain')<{
  readonly dropId: string;
}> {}

export class TripNotFound extends Data.TaggedError('TripNotFound')<{
  readonly tripId: string;
}> {}

export class TripNotEnded extends Data.TaggedError('TripNotEnded')<{
  readonly tripId: string;
}> {}
