# Compass

Turn gear arrows from north-up into "which way from where I face" by tapping the arrow on the nearest-gear card or in a gear sheet. Every check of a working compass is manual on an iPhone: Playwright's Linux WebKit has no iOS compass, and the recipe never fakes `deviceorientation` events.

## Sub-features

- The arrow in the nearest-gear card and in a gear sheet is the toggle: a 44 px round button whose name says the state and the direction, for example "Compass off, gear to the north-east", "Compass on, gear at 2 o'clock", "Compass on, gear straight ahead". The caption under it is decorative and, while off, reads `Turn on compass` so the tap is discoverable; other captions state the compass state.
- States: off, paused (waiting for a tap or for the page to show again), starting, needs calibrating, unavailable, on. Only needs calibrating shows the visible "Compass needs calibrating" note.
- While on: the card, Gear list and sheet arrows show the gear's bearing minus the phone's true heading. The map stays north-up and shows a soft heading cone at my position instead of the course wedge.
- Off, unavailable (iOS denied, no compass, a date outside WMM2025's 2025–2029 or no position fix), paused or needing calibration: every arrow is north-up.
- Krab remembers only on or off on this phone. Remembered on, it listens again on load without asking. If iOS wants permission again, it stays paused until a tap; Krab never asks on its own. A denial is remembered as off.
- Declination comes from the WMM2025 model on the phone. No position leaves the phone for it.

## How to get to it (user POV)

Turn on location and drop a pot. The nearest-gear card on the Map tab shows the arrow. Tap it; iOS asks for motion and orientation access once. Allow it and turn on the spot: the arrow turns to keep pointing at the gear and a cone shows on the map. Tap the arrow again to turn it off. The same arrow is in the gear sheet beside the time in the water.

## Driving it with Playwright

Run `bun scripts/verify-krab/run.ts`. [compass.ts](../../../../scripts/verify-krab/compass.ts) owns the exact actions and evidence. It checks the toggle's minimum target, unsupported-compass outcome, remembered off state after reload and request privacy. It records sensor availability without manufacturing sensor events.

For permission prompts, heading delivery, calibration, landscape and resume behavior, complete the [device checklist](device-checks.md).

## Gotchas

- Linux WebKit has no `webkitCompassHeading` or `requestPermission`, so a tap gives "Compass unavailable". That is the unsupported path, not a failure.
- Never dispatch synthetic `deviceorientation` events to claim the compass works. The heading, smoothing, declination and permission rules are proven by `src/lib/features/compass/compass.test.ts`.
- The relative arrows, the map cone, the calibrating note, landscape handling and the iOS permission prompt need a real iPhone.
- On iOS the permission prompt only shows from a tap. A remembered on that iOS no longer honours stays paused until a tap.
