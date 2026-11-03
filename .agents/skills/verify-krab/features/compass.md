# Compass

Turn gear arrows from north-up into "which way from where I face" by tapping the arrow on the nearest-gear card or in a gear sheet. Ticket 10 built it. Every check of a working compass is manual on an iPhone: Playwright's Linux WebKit has no iOS compass, and the recipe never fakes `deviceorientation` events.

## Sub-features

- The arrow in the nearest-gear card and in a gear sheet is the toggle: a 44 px round button whose name says the state and the direction, for example "Compass off, gear to the north-east", "Compass on, gear at 2 o'clock", "Compass on, gear straight ahead".
- States: off, paused (waiting for a tap or for the page to show again), starting, needs calibrating, unavailable, on. Only needs calibrating shows the visible "Compass needs calibrating" note.
- While on: the card, Gear list and sheet arrows show the gear's bearing minus the phone's true heading. The map stays north-up and shows a soft heading cone at my position instead of the course wedge.
- Off, unavailable (iOS denied, no compass, a date outside WMM2025's 2025–2029 or no position fix), paused or needing calibration: every arrow is north-up.
- Krab remembers only on or off on this phone. Remembered on, it listens again on load without asking. If iOS wants permission again, it stays paused until a tap; Krab never asks on its own. A denial is remembered as off.
- Declination comes from the WMM2025 model on the phone. No position leaves the phone for it.

## How to get to it (user POV)

Turn on location and drop a pot. The nearest-gear card on the Map tab shows the arrow. Tap it; iOS asks for motion and orientation access once. Allow it and turn on the spot: the arrow turns to keep pointing at the gear and a cone shows on the map. Tap the arrow again to turn it off. The same arrow is in the gear sheet beside the time in the water.

## Driving it with Playwright

`scripts/verify-krab/compass.ts` runs through `bun scripts/verify-krab/run.ts` and covers only what Linux WebKit can show:

1. Drop Pot 1 at `MADE_UP_SEA`. Record whether this WebKit has `DeviceOrientationEvent` and `requestPermission` in `sensor.json`.
2. Find the button `/^Compass off, gear to the /` and check its box is at least 44 × 44.
3. Tap it. Without an iOS compass it reads `/^Compass unavailable, gear to the /`, shows no calibrating note, and `localStorage['krab.compass']` is `off`.
4. Reload. It reads Compass off again: Krab did not ask on its own.
5. Evidence: screenshots, ARIA snapshots and every request URL in `requests.json`. That list must hold only the preview origin, NOAA and OpenFreeMap, with no position in any URL.

Manual on an iPhone, Home Screen app:

- First tap: one iOS prompt. Allow: the label goes from starting to on and the arrow follows the phone. Deny: unavailable, north-up, and reopening the app shows off without a prompt.
- Turning on the spot keeps the card, Gear list and sheet arrows pointing at the gear. The map stays north-up with the cone.
- Landscape both ways: the heading still matches where the top of the screen points.
- Near a magnet: "Compass needs calibrating" shows and the arrows go north-up until it settles.
- Switch apps and come back: paused, then on again with no prompt.
- Reopen with it on: it listens again without asking. If iOS asks again, it waits paused until a tap.

## Gotchas

- Linux WebKit has no `webkitCompassHeading` or `requestPermission`, so a tap gives "Compass unavailable". That is the unsupported path, not a failure.
- Never dispatch synthetic `deviceorientation` events to claim the compass works. The heading, smoothing, declination and permission rules are proven by `src/lib/features/compass/compass.test.ts`.
- The relative arrows, the map cone, the calibrating note, landscape handling and the iOS permission prompt need a real iPhone.
- On iOS the permission prompt only shows from a tap. A remembered on that iOS no longer honours stays paused until a tap.
