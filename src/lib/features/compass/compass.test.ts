import { expect, test } from 'vitest';
import type { LatLon } from '#lib/features/trip/index.js';
import { Compass } from './compass';
import { arrowDeg } from './heading';
import type {
  Access,
  CompassState,
  HeadingSensor,
  SensorListener
} from './types';

const NOAA_ARCTIC = { lat: 80, lon: 0 };
const NOAA_ARCTIC_D_2025 = 1.28;
const JAN_2025 = Date.UTC(2025, 0, 1);

type PhoneOptions = {
  access?: Access;
  remembered?: boolean;
  position?: LatLon | null;
  now?: number;
};

const phone = ({
  access = 'granted',
  remembered = false,
  position = NOAA_ARCTIC,
  now = JAN_2025
}: PhoneOptions = {}) => {
  const world = { access, remembered, position, now, asked: 0, at: 0 };
  let listeners: SensorListener[] = [];
  let answers: ((access: Access) => void)[] = [];
  const sensor: HeadingSensor = {
    request: () => {
      world.asked += 1;
      if (subject.holding) {
        return new Promise((resolve) => {
          answers = [...answers, resolve];
        });
      }
      return subject.refuse
        ? Promise.reject(new DOMException('needs a tap', 'NotAllowedError'))
        : Promise.resolve(world.access);
    },
    watch: (listener) => {
      listeners = [...listeners, listener];
      return () => {
        listeners = listeners.filter((other) => other !== listener);
      };
    }
  };
  const compass = new Compass({
    sensor,
    choice: {
      remembered: () => world.remembered,
      remember: (on) => {
        world.remembered = on;
      }
    },
    position: () => world.position,
    now: () => world.now
  });
  const read = (
    headingDeg: number | null,
    {
      accuracyDeg = 5,
      screenAngleDeg = 0,
      afterMs = 16
    }: {
      accuracyDeg?: number | null;
      screenAngleDeg?: number;
      afterMs?: number;
    } = {}
  ) => {
    world.at += afterMs;
    for (const listener of listeners) {
      listener.reading({
        headingDeg,
        accuracyDeg,
        screenAngleDeg,
        at: world.at
      });
    }
    return compass.state;
  };
  const hide = () => {
    for (const listener of listeners) listener.paused();
  };
  const answer = async (access: Access) => {
    for (const resolve of answers) resolve(access);
    answers = [];
    await settle();
  };
  const subject = {
    compass,
    world,
    read,
    hide,
    answer,
    refuse: false,
    holding: false
  };
  return subject;
};

const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const turnedOn = async (options?: PhoneOptions) => {
  const subject = phone(options);
  subject.compass.start();
  subject.compass.toggle();
  await settle();
  return subject;
};

const circularGap = (a: number, b: number) =>
  Math.abs(((((a - b) % 360) + 540) % 360) - 180);

const expectHeading = (state: CompassState, deg: number) => {
  expect(state.kind).toBe('usable');
  if (state.kind !== 'usable') return;
  expect(circularGap(state.trueHeadingDeg, deg)).toBeLessThan(0.005);
};

test.each([
  { year: 2025.0, when: JAN_2025, lat: 80, lon: 0, d: 1.28 },
  { year: 2025.0, when: JAN_2025, lat: 0, lon: 120, d: -0.16 },
  { year: 2025.0, when: JAN_2025, lat: -80, lon: -120, d: 68.78 },
  { year: 2027.5, when: Date.UTC(2027, 6, 2, 12), lat: 80, lon: 0, d: 2.59 },
  { year: 2027.5, when: Date.UTC(2027, 6, 2, 12), lat: 0, lon: 120, d: -0.24 },
  {
    year: 2027.5,
    when: Date.UTC(2027, 6, 2, 12),
    lat: -80,
    lon: -120,
    d: 68.49
  }
])(
  'adds NOAA WMM2025 declination $d° east at $lat,$lon in $year to a magnetic heading',
  async ({ when, lat, lon, d }) => {
    const { read } = await turnedOn({ position: { lat, lon }, now: when });
    expectHeading(read(0), d);
  }
);

test('adds declination to a magnetic heading that is not north', async () => {
  const { read } = await turnedOn();
  expectHeading(read(90), 90 + NOAA_ARCTIC_D_2025);
});

test.each([
  { heading: 0, accuracy: -1, usable: false },
  { heading: 120, accuracy: -1, usable: false },
  { heading: 120, accuracy: 31, usable: false },
  { heading: 120, accuracy: 30, usable: true },
  { heading: 0, accuracy: 10, usable: true },
  { heading: null, accuracy: 10, usable: false },
  { heading: 120, accuracy: null, usable: false },
  { heading: -5, accuracy: 10, usable: false }
])(
  'a reading of $heading° at ±$accuracy° is usable: $usable',
  async ({ heading, accuracy, usable }) => {
    const { read } = await turnedOn();
    const state = read(heading, { accuracyDeg: accuracy });
    expect(state.kind).toBe(usable ? 'usable' : 'calibrating');
  }
);

test('smooths across north: true 359° then 1° averages to 0°, not 180°', async () => {
  const { read } = await turnedOn();
  read(359 - NOAA_ARCTIC_D_2025);
  expectHeading(read(361 - NOAA_ARCTIC_D_2025), 0);
});

test('readings that cancel out give the latest reading, not a made-up direction', async () => {
  const { read } = await turnedOn();
  read(90);
  expectHeading(read(270), 270 + NOAA_ARCTIC_D_2025);
});

test('a long gap between readings starts smoothing afresh', async () => {
  const { read } = await turnedOn();
  read(0);
  expectHeading(read(90, { afterMs: 5000 }), 90 + NOAA_ARCTIC_D_2025);
});

test.each([
  { screenAngleDeg: 0, heading: 45, expected: 46.28 },
  { screenAngleDeg: 90, heading: 270, expected: 1.28 },
  { screenAngleDeg: 270, heading: 100, expected: 11.28 },
  { screenAngleDeg: -90, heading: 100, expected: 11.28 }
])(
  'turned $screenAngleDeg° from portrait, a magnetic $heading° heads $expected° true',
  async ({ screenAngleDeg, heading, expected }) => {
    const { read } = await turnedOn();
    expectHeading(read(heading, { screenAngleDeg }), expected);
  }
);

test('turning the screen starts smoothing afresh', async () => {
  const { read } = await turnedOn();
  read(10);
  expectHeading(read(10, { screenAngleDeg: 90 }), 101.28);
});

test('an unusable reading starts smoothing afresh', async () => {
  const { read } = await turnedOn();
  read(10);
  read(10, { accuracyDeg: -1 });
  expectHeading(read(100), 101.28);
});

test.each([
  { bearing: 10, heading: 350, arrow: 20 },
  { bearing: 350, heading: 10, arrow: 340 },
  { bearing: 90, heading: 90, arrow: 0 }
])(
  'with a true heading of $heading°, gear at $bearing° shows its arrow at $arrow°',
  ({ bearing, heading, arrow }) => {
    expect(arrowDeg(bearing, { kind: 'usable', trueHeadingDeg: heading })).toBe(
      arrow
    );
  }
);

test.each<CompassState>([
  { kind: 'off' },
  { kind: 'waiting' },
  { kind: 'starting' },
  { kind: 'calibrating' },
  { kind: 'unavailable', reason: 'denied' }
])('without a usable heading ($kind) the arrow is north-up', (state) => {
  expect(arrowDeg(10, state)).toBe(10);
});

test('turning on asks once, remembers the choice and points by the compass', async () => {
  const { compass, world, read } = phone();
  compass.start();
  expect(compass.state.kind).toBe('off');
  compass.toggle();
  await settle();
  expect(world.asked).toBe(1);
  expect(world.remembered).toBe(true);
  expect(compass.state.kind).toBe('starting');
  expectHeading(read(90), 90 + NOAA_ARCTIC_D_2025);
});

test.each(
  (['denied', 'unsupported', 'refused'] as const).flatMap((access) =>
    [false, true].map((listening) => ({ access, listening }))
  )
)(
  'when access is $access (already listening: $listening) the arrows stay north-up and Krab never asks on its own',
  async ({ access, listening }) => {
    const subject = phone({ remembered: listening });
    subject.world.access = access === 'refused' ? 'granted' : access;
    subject.refuse = access === 'refused';
    subject.compass.start();
    subject.compass.toggle();
    await settle();
    const reason = access === 'unsupported' ? 'unsupported' : 'denied';
    expect(subject.compass.state).toEqual({ kind: 'unavailable', reason });
    expect(subject.read(90)).toEqual({ kind: 'unavailable', reason });
    const reloaded = phone({ remembered: subject.world.remembered });
    reloaded.compass.start();
    expect(reloaded.compass.state.kind).toBe('off');
    expect(reloaded.world.asked).toBe(0);
  }
);

test('remembered on, the compass listens again without asking', () => {
  const { compass, world, read } = phone({ remembered: true });
  compass.start();
  expect(compass.state.kind).toBe('waiting');
  expect(world.asked).toBe(0);
  expectHeading(read(90), 90 + NOAA_ARCTIC_D_2025);
});

test('remembered on but needing access again, it waits north-up until a tap', async () => {
  const { compass, world, read } = phone({ remembered: true });
  compass.start();
  await settle();
  expect(compass.state.kind).toBe('waiting');
  expect(world.asked).toBe(0);
  compass.toggle();
  await settle();
  expect(world.asked).toBe(1);
  expectHeading(read(90), 90 + NOAA_ARCTIC_D_2025);
});

test('a sensor pause waits north-up, and the next readings point again', async () => {
  const { read, hide, compass } = await turnedOn();
  read(90);
  hide();
  expect(compass.state.kind).toBe('waiting');
  expectHeading(read(180), 180 + NOAA_ARCTIC_D_2025);
});

test.each([
  { access: 'granted', remembered: false, after: 'off' },
  { access: 'denied', remembered: true, after: 'waiting' }
] as const)(
  'a $access answer that arrives after the compass stopped changes nothing (remembered on: $remembered)',
  async ({ access, remembered, after }) => {
    const subject = phone({ remembered });
    const { compass, world, read } = subject;
    subject.holding = true;
    compass.toggle();
    compass.stop();
    compass.start();
    await subject.answer(access);
    expect(compass.state.kind).toBe(after);
    expect(world.remembered).toBe(remembered);
    if (remembered) expectHeading(read(90), 90 + NOAA_ARCTIC_D_2025);
    else expect(read(90).kind).toBe('off');
  }
);

test('tapping again while the phone is asking asks once, and its answer turns the compass on', async () => {
  const subject = phone();
  const { compass, world, read } = subject;
  subject.holding = true;
  compass.start();
  compass.toggle();
  compass.toggle();
  compass.toggle();
  expect(world.asked).toBe(1);
  await subject.answer('granted');
  expect(world.remembered).toBe(true);
  expectHeading(read(90), 90 + NOAA_ARCTIC_D_2025);
  compass.toggle();
  expect(compass.state.kind).toBe('off');
});

test('tapping a working compass turns it off and forgets it', async () => {
  const { compass, world, read } = await turnedOn();
  read(90);
  compass.toggle();
  expect(compass.state.kind).toBe('off');
  expect(world.remembered).toBe(false);
  expect(read(180).kind).toBe('off');
});

test('turning the compass off and on starts smoothing afresh', async () => {
  const { compass, read } = await turnedOn();
  read(0);
  compass.toggle();
  compass.toggle();
  await settle();
  expectHeading(read(90), 90 + NOAA_ARCTIC_D_2025);
});

test.each([
  { when: '2024-12-31T23:59:59Z', usable: false },
  { when: '2025-01-01T00:00:00Z', usable: true },
  { when: '2029-12-31T23:59:59Z', usable: true },
  { when: '2030-01-01T00:00:00Z', usable: false }
])(
  'on $when the magnetic model is usable: $usable',
  async ({ when, usable }) => {
    const { read } = await turnedOn({ now: Date.parse(when) });
    expect(read(90)).toEqual(
      usable
        ? expect.objectContaining({ kind: 'usable' })
        : { kind: 'unavailable', reason: 'out-of-model' }
    );
  }
);

test('the compass stops when the clock passes the end of the magnetic model', async () => {
  const { read, world } = await turnedOn({
    now: Date.parse('2029-12-31T23:59:59Z')
  });
  expect(read(90).kind).toBe('usable');
  world.now = Date.parse('2030-01-01T00:00:01Z');
  expect(read(90)).toEqual({ kind: 'unavailable', reason: 'out-of-model' });
});

test('moving far uses the declination where the phone now is', async () => {
  const { read, world } = await turnedOn();
  expectHeading(read(0), 1.28);
  world.position = { lat: -80, lon: -120 };
  expectHeading(read(0, { afterMs: 5000 }), 68.78);
});

test('without a position fix the compass cannot point', async () => {
  const { read } = await turnedOn({ position: null });
  expect(read(90)).toEqual({ kind: 'unavailable', reason: 'no-position' });
});
