import type { Access, HeadingSensor, Reading, SensorListener } from './types';

type CompassEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number | null;
  webkitCompassAccuracy?: number | null;
};

type AskingEvent = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<string>;
};

const finite = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const modernAngle = () =>
  'orientation' in screen ? finite(screen.orientation.angle) : null;

const screenAngle = () =>
  modernAngle() ?? finite(Reflect.get(window, 'orientation')) ?? 0;

const readingOf = (event: CompassEvent): Reading => ({
  headingDeg: event.webkitCompassHeading ?? null,
  accuracyDeg: event.webkitCompassAccuracy ?? null,
  screenAngleDeg: screenAngle(),
  at: event.timeStamp
});

const request = (): Promise<Access> => {
  if (typeof DeviceOrientationEvent === 'undefined') {
    return Promise.resolve('unsupported');
  }
  const asking = DeviceOrientationEvent as AskingEvent;
  if (typeof asking.requestPermission !== 'function') {
    return Promise.resolve('unsupported');
  }
  return asking
    .requestPermission()
    .then((answer) => (answer === 'granted' ? 'granted' : 'denied'));
};

const watch = (listener: SensorListener) => {
  let listening = false;
  const onOrientation = (event: DeviceOrientationEvent) => {
    listener.reading(readingOf(event));
  };
  const listen = (on: boolean) => {
    if (on === listening) return;
    listening = on;
    if (on) window.addEventListener('deviceorientation', onOrientation);
    else window.removeEventListener('deviceorientation', onOrientation);
  };
  const onVisibility = () => {
    const visible = document.visibilityState === 'visible';
    listen(visible);
    if (!visible) listener.paused();
  };
  document.addEventListener('visibilitychange', onVisibility);
  listen(document.visibilityState === 'visible');
  return () => {
    document.removeEventListener('visibilitychange', onVisibility);
    listen(false);
  };
};

export const deviceCompass: HeadingSensor = { request, watch };
