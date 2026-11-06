# Placing a drop

Save a pot's location during a trip and find the same pot in the Gear list after reloading Krab. When location is off, the pot is still saved, without a position, and Krab explains how to turn location back on.

## Sub-features

- `drop-map`: place the first pot from Map.
- `drop-gear`: place the first pot from Gear.
- `drop-restore`: saved Pot 1 and its position survive reload.
- `location-status`: the screen says `Finding your position`, `Position ready`, or `Rough position, within about …` above the Drop control. It uses the same availability rule as Drop: denial wins over a cached fix, and `Position ready` lasts 5 s from the fix's timestamp. After that it falls back to `Finding your position`, rechecked at expiry, on a new fix and on resume.
- `drop-denied`: with location denied, `Location is off` guidance names Settings, and Drop pot saves Pot 1 without a position (reason `denied`).
- `getting-position`: with no fix up to 5 s old, Drop opens a `Getting position` panel with Cancel and Save without position; it saves without a position after 20 s.
- `saving-drop`: after a fix arrives or Save without position is chosen, a focused `Saving drop` panel reading "Saving it now." replaces the Getting position panel at once. A drop with a fresh fix shows that panel only if the save is still pending 500 ms after the tap; a quicker save never shows it and leaves focus where it was. Once the save settles, Drop has focus again if a panel replaced it.
- `tap-moment`: the tap is the moment. A drop takes its time and the fix ready at the tap, even while storage is slow. Another Drop tap while one is waiting or saving is ignored and saves nothing.
- `rough-distance`: rough positions and Gear distances show feet rounded to 10, at most `990 ft`. From 1000 ft they show miles (`0.2 mi`); never `1000 ft`.
- `load-failed`: if Krab can't read the trip when it opens, Map and Gear say `Couldn't load your trip.` with `Retry` instead of an empty trip, and Past trips says `Couldn't load past trips.`. Retry, or any later save, opens storage again and loads the running trip and past trips together.

## How to get to it (user POV)

- Open Krab on Map, acknowledge the location explanation, then choose Drop pot.
- Open Krab, acknowledge the explanation, choose Gear in the bottom navigation, then choose Drop pot.
- With location denied: open Krab, choose Turn on location, decline. Read the `Location is off` guidance, then choose Drop pot.
- Getting position: choose Drop pot before any fix arrives. Cancel or Save without position, or wait 20 s.

## Driving it with Playwright

Run `bun scripts/verify-krab/run.ts` through the parent skill's bounded lifecycle. [placing-drop.ts](../../../../scripts/verify-krab/placing-drop.ts) owns the exact actions, assertions and evidence filenames.

Covers placing a drop from Map and Gear, restoration with the same saved position, and saving without a position when location is denied. It also proves that reading evidence before first launch leaves IndexedDB absent.

## Gotchas

- The recipe proves a granted fix and a denied permission. It does not drive the 20 s wait, Cancel, Save without position, rough fixes or a storage failure: the trip module's tests own that policy with a fixed clock, and `e2e/position-problems.test.ts` checks the Getting position panel's targets and focus by stubbing `watchPosition` to never answer. Don't stub geolocation in this recipe; that would not be a real user journey.
- `clearPermissions()` makes WebKit report denied at once. It does not show an iOS prompt, and the Settings path in the guidance is unverified on a device.
- Without `Position ready`, a tap starts the Getting position panel instead of saving at once. Wait for the status rather than sleeping. A granted fix older than 5 s also shows `Finding your position`, so tap soon after `Position ready` appears.
- The ignored second tap, the tap's time and fix under slow storage, and `Couldn't load your trip.` with Retry are proven in `e2e/storage-problems.test.ts` by holding or failing IndexedDB from a Playwright init script; the live recipe doesn't inject storage faults. The 990 ft and 1000 ft boundary is proven in the trip module tests.
- `Saving drop` is usually too brief to capture. `e2e/position-problems.test.ts` holds it open with a competing IndexedDB readwrite transaction and drives readiness expiry and the 500 ms fresh-fix delay with a paused `page.clock` and a held `watchPosition` callback.
- Reload returns to Map, so choose Gear again before asserting restoration.
- The Gear list's navigation items are also list items; scope the pot row to main. Each row now wraps a button that opens its gear sheet (see [Drop details](drop-details.md)); the `listitem` locator still matches.
