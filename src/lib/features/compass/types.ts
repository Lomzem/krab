export type Reading = {
  headingDeg: number | null;
  accuracyDeg: number | null;
  screenAngleDeg: number;
  at: number;
};

export type Access = 'granted' | 'denied' | 'unsupported';

export type SensorListener = {
  reading: (reading: Reading) => void;
  paused: () => void;
};

export type HeadingSensor = {
  request: () => Promise<Access>;
  watch: (listener: SensorListener) => () => void;
};

export type CompassChoice = {
  remembered: () => boolean;
  remember: (on: boolean) => void;
};

export type Unavailable =
  'denied' | 'unsupported' | 'out-of-model' | 'no-position';

export type CompassState =
  | { kind: 'off' }
  | { kind: 'waiting' }
  | { kind: 'starting' }
  | { kind: 'unavailable'; reason: Unavailable }
  | { kind: 'calibrating' }
  | { kind: 'usable'; trueHeadingDeg: number };
