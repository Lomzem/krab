import { Data } from 'effect';

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
