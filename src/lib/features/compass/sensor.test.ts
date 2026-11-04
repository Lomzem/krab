import { afterEach, expect, test, vi } from 'vitest';
import { Compass } from './compass';
import { deviceCompass } from './sensor';
import type { CompassState } from './types';

const NOAA_ARCTIC = { lat: 80, lon: 0 };
const NOAA_ARCTIC_D_2025 = 1.28;
const JAN_2025 = Date.UTC(2025, 0, 1);

type Permission =
  | { kind: 'answers'; answer: string }
  | { kind: 'rejects' }
  | { kind: 'no requestPermission' }
  | { kind: 'no DeviceOrientationEvent' };

const browser = ({
  visibility = 'visible',
  permission = { kind: 'answers', answer: 'granted' },
  screenAngleDeg = 0
}: {
  visibility?: DocumentVisibilityState;
  permission?: Permission;
  screenAngleDeg?: number;
} = {}) => {
  const world = { asked: 0 };
  const page = Object.assign(new EventTarget(), {
    visibilityState: visibility
  });
  const phone = new EventTarget();
  vi.stubGlobal('document', page);
  vi.stubGlobal('window', phone);
  vi.stubGlobal('screen', { orientation: { angle: screenAngleDeg } });
  if (permission.kind === 'answers' || permission.kind === 'rejects') {
    vi.stubGlobal('DeviceOrientationEvent', {
      requestPermission: () => {
        world.asked += 1;
        return permission.kind === 'rejects'
          ? Promise.reject(new DOMException('needs a tap', 'NotAllowedError'))
          : Promise.resolve(permission.answer);
      }
    });
  }
  if (permission.kind === 'no requestPermission') {
    vi.stubGlobal('DeviceOrientationEvent', {});
  }
  const turn = (to: DocumentVisibilityState) => {
    page.visibilityState = to;
    page.dispatchEvent(new Event('visibilitychange'));
  };
  const orient = (headingDeg: number) => {
    phone.dispatchEvent(
      Object.assign(new Event('deviceorientation'), {
        webkitCompassHeading: headingDeg,
        webkitCompassAccuracy: 5
      })
    );
  };
  return { world, turn, orient };
};

const watched = () => {
  const heard = { readings: 0, pauses: 0 };
  const stop = deviceCompass.watch({
    reading: () => {
      heard.readings += 1;
    },
    paused: () => {
      heard.pauses += 1;
    }
  });
  return { heard, stop };
};

const shownBy = (compass: Compass) => {
  let delivered: CompassState = { kind: 'off' };
  compass.subscribe((state) => {
    delivered = state;
  });
  return () => delivered;
};

const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

test('the phone listens for orientation only while the page is visible, and not after it stops', () => {
  const { turn, orient } = browser();
  const { heard, stop } = watched();
  const listening = () => {
    const before = heard.readings;
    orient(90);
    return heard.readings - before;
  };
  const seen = [listening()];
  turn('hidden');
  seen.push(listening());
  expect(heard.pauses).toBe(1);
  turn('hidden');
  seen.push(listening());
  turn('visible');
  seen.push(listening());
  stop();
  seen.push(listening());
  turn('visible');
  seen.push(listening());
  expect(seen).toEqual([1, 0, 0, 1, 0, 0]);
});

test('starting while the page is hidden listens once it becomes visible', () => {
  const { turn, orient } = browser({ visibility: 'hidden' });
  const { heard, stop } = watched();
  orient(90);
  expect(heard.readings).toBe(0);
  turn('visible');
  orient(90);
  expect(heard.readings).toBe(1);
  stop();
});

test.each<{ how: string; permission: Permission; state: CompassState }>([
  {
    how: 'answers denied',
    permission: { kind: 'answers', answer: 'denied' },
    state: { kind: 'unavailable', reason: 'denied' }
  },
  {
    how: 'rejects the request',
    permission: { kind: 'rejects' },
    state: { kind: 'unavailable', reason: 'denied' }
  },
  {
    how: 'has no permission request',
    permission: { kind: 'no requestPermission' },
    state: { kind: 'unavailable', reason: 'unsupported' }
  },
  {
    how: 'has no orientation events',
    permission: { kind: 'no DeviceOrientationEvent' },
    state: { kind: 'unavailable', reason: 'unsupported' }
  }
])(
  'when the phone $how, a tap leaves the compass $state.reason and not listening',
  async ({ permission, state }) => {
    const { orient } = browser({ permission });
    const compass = new Compass({
      sensor: deviceCompass,
      choice: { remembered: () => false, remember: () => undefined },
      position: () => NOAA_ARCTIC,
      now: () => JAN_2025
    });
    const shown = shownBy(compass);
    compass.toggle();
    await settle();
    orient(90);
    expect(shown()).toEqual(state);
  }
);

test.each([
  { screenAngleDeg: 0, headingDeg: 90, expected: 90 + NOAA_ARCTIC_D_2025 },
  { screenAngleDeg: 90, headingDeg: 270, expected: NOAA_ARCTIC_D_2025 }
])(
  'a tap asks the phone for permission during the tap, and granted points by the compass turned $screenAngleDeg° from portrait',
  async ({ screenAngleDeg, headingDeg, expected }) => {
    const { world, orient } = browser({ screenAngleDeg });
    let remembered = false;
    const compass = new Compass({
      sensor: deviceCompass,
      choice: {
        remembered: () => remembered,
        remember: (on) => {
          remembered = on;
        }
      },
      position: () => NOAA_ARCTIC,
      now: () => JAN_2025
    });
    const shown = shownBy(compass);
    compass.toggle();
    expect(world.asked).toBe(1);
    await settle();
    expect(remembered).toBe(true);
    orient(headingDeg);
    const state = shown();
    expect(state.kind).toBe('usable');
    if (state.kind !== 'usable') return;
    expect(state.trueHeadingDeg).toBeCloseTo(expected, 2);
    compass.stop();
  }
);
