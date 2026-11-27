const DOUBLE_TAP_MS = 350;
const DOUBLE_CLICK_MS = 500;
const DOUBLE_TAP_REACH_PX = 44;
const PRESS_EVENTS = [
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'dblclick',
  'pointercancel'
] as const;

type Press = { x: number; y: number; at: number };

const absorbDoublePress = (press: Press) => {
  const age = performance.now() - press.at;
  if (age >= DOUBLE_CLICK_MS) return () => {};
  let pressing = false;
  let tapping = age < DOUBLE_TAP_MS;
  let held = false;
  let expired = false;
  const absorb = (event: Event) => {
    const { type, detail, clientX, clientY } = event as MouseEvent;
    const touch =
      event instanceof PointerEvent && event.pointerType === 'touch';
    if (type === 'pointerdown' && touch) {
      pressing =
        tapping &&
        Math.hypot(clientX - press.x, clientY - press.y) <= DOUBLE_TAP_REACH_PX;
    } else if (type === 'pointerdown' || type === 'mousedown') {
      if (detail === 0) return;
      pressing = detail >= 2;
    } else if (type === 'click' && detail === 0) {
      pressing = false;
    }
    if (!pressing) {
      stop();
      return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    if (type.endsWith('down')) held = true;
    else if (type.endsWith('up') || type === 'pointercancel') release();
  };
  const release = () => {
    held = false;
    if (!expired) return;
    clearTimeout(ending);
    ending = setTimeout(stop, DOUBLE_CLICK_MS);
  };
  const stop = () => {
    clearTimeout(timer);
    clearTimeout(ending);
    for (const type of PRESS_EVENTS)
      window.removeEventListener(type, absorb, true);
  };
  for (const type of PRESS_EVENTS) window.addEventListener(type, absorb, true);
  const timer = setTimeout(() => {
    tapping = false;
  }, DOUBLE_TAP_MS - age);
  let ending = setTimeout(() => {
    expired = true;
    if (!held) stop();
  }, DOUBLE_CLICK_MS - age);
  return stop;
};

export const doublePressGuard = () => {
  let lastPress: Press | null = null;
  let stopAbsorbing = () => {};
  const stop = () => {
    stopAbsorbing();
    stopAbsorbing = () => {};
  };
  return {
    note: (event: PointerEvent) => {
      lastPress = { x: event.clientX, y: event.clientY, at: performance.now() };
    },
    forget: () => {
      lastPress = null;
    },
    absorb: () => {
      stop();
      if (lastPress) stopAbsorbing = absorbDoublePress(lastPress);
    },
    stop
  };
};
