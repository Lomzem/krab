import type { LatLon } from '#lib/features/trip/index.js';
import {
  declinationFor,
  NO_SMOOTHING,
  smooth,
  type Declination,
  type Smoothing
} from './heading';
import type {
  Access,
  CompassChoice,
  CompassState,
  HeadingSensor,
  Reading,
  Unavailable
} from './types';

type Needs = {
  sensor: HeadingSensor;
  choice: CompassChoice;
  position: () => LatLon | null;
  now: () => number;
};

const OFF: CompassState = { kind: 'off' };
const WAITING: CompassState = { kind: 'waiting' };
const STARTING: CompassState = { kind: 'starting' };
const CALIBRATING: CompassState = { kind: 'calibrating' };

const unavailable = (reason: Unavailable): CompassState => ({
  kind: 'unavailable',
  reason
});

const shownKey = (state: CompassState) => {
  if (state.kind === 'usable') {
    return `usable ${String(Math.round(state.trueHeadingDeg) % 360)}`;
  }
  return state.kind === 'unavailable'
    ? `unavailable ${state.reason}`
    : state.kind;
};

export class Compass {
  #state: CompassState = OFF;
  #runs: ((state: CompassState) => void)[] = [];
  #detach: (() => void) | null = null;
  #asking: Promise<Access> | null = null;
  #smoothing: Smoothing = NO_SMOOTHING;
  #declination: Declination | null = null;
  #shown = shownKey(OFF);
  readonly #needs: Needs;

  constructor(needs: Needs) {
    this.#needs = needs;
  }

  get state() {
    return this.#state;
  }

  readonly subscribe = (run: (state: CompassState) => void) => {
    this.#runs = [...this.#runs, run];
    run(this.#state);
    return () => {
      this.#runs = this.#runs.filter((other) => other !== run);
    };
  };

  start() {
    if (this.#detach || !this.#needs.choice.remembered()) return;
    this.#attach();
    this.#set(WAITING);
  }

  stop() {
    this.#asking = null;
    this.#release();
    this.#set(OFF);
  }

  toggle() {
    const { kind } = this.#state;
    if (kind === 'off' || kind === 'waiting') {
      this.#ask();
      return;
    }
    this.#needs.choice.remember(false);
    this.stop();
  }

  #ask() {
    if (this.#asking) return;
    const asking = this.#needs.sensor.request();
    this.#asking = asking;
    const answered = (access: Access) => {
      if (this.#asking !== asking) return;
      this.#asking = null;
      this.#answered(access);
    };
    void asking.then(answered, () => {
      answered('denied');
    });
  }

  #answered(access: Access) {
    if (access !== 'granted') {
      this.#needs.choice.remember(false);
      this.#release();
      this.#set(unavailable(access));
      return;
    }
    this.#needs.choice.remember(true);
    this.#attach();
    const { kind } = this.#state;
    if (kind === 'off' || kind === 'waiting') this.#set(STARTING);
  }

  #attach() {
    this.#detach ??= this.#needs.sensor.watch({
      reading: this.#read,
      paused: this.#paused
    });
  }

  #release() {
    this.#detach?.();
    this.#detach = null;
    this.#smoothing = NO_SMOOTHING;
  }

  readonly #read = (reading: Reading) => {
    const where = this.#needs.position();
    if (!where) {
      this.#unusable(unavailable('no-position'));
      return;
    }
    this.#declination = declinationFor(
      this.#declination,
      where,
      this.#needs.now()
    );
    const declinationDeg = this.#declination.deg;
    if (declinationDeg === null) {
      this.#unusable(unavailable('out-of-model'));
      return;
    }
    const next = smooth(this.#smoothing, reading, declinationDeg);
    this.#smoothing = next.smoothing;
    this.#set(
      next.trueHeadingDeg === null
        ? CALIBRATING
        : { kind: 'usable', trueHeadingDeg: next.trueHeadingDeg }
    );
  };

  readonly #paused = () => {
    this.#unusable(WAITING);
  };

  #unusable(state: CompassState) {
    this.#smoothing = NO_SMOOTHING;
    this.#set(state);
  }

  #set(state: CompassState) {
    this.#state = state;
    const key = shownKey(state);
    if (key === this.#shown) return;
    this.#shown = key;
    for (const run of this.#runs) run(state);
  }
}
