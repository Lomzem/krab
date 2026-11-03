# Placing a drop

Save a pot's location during a trip and find the same pot in the Gear list after reloading Krab. When location is off, the pot is still saved, without a position, and Krab explains how to turn location back on.

## Sub-features

- `drop-map`: place the first pot from Map.
- `drop-gear`: place the first pot from Gear.
- `drop-restore`: saved Pot 1 and its position survive reload.
- `location-status`: the screen says `Finding your position`, `Position ready`, or `Rough position, within about …` above the Drop control. It uses the same availability rule as Drop: denial wins over a cached fix, and `Position ready` lasts 5 s from the fix's timestamp. After that it falls back to `Finding your position`, rechecked at expiry, on a new fix and on resume.
- `drop-denied`: with location denied, `Location is off` guidance names Settings, and Drop pot saves Pot 1 without a position (reason `denied`).
- `getting-position`: with no fix up to 5 s old, Drop opens a `Getting position` panel with Cancel and Save without position; it saves without a position after 20 s.
- `saving-drop`: once a fix arrives or Save without position is chosen, Cancel and Save without position go away and a focused `Saving drop` panel shows until the save settles.

## How to get to it (user POV)

- Open Krab on Map, acknowledge the location explanation, then choose Drop pot.
- Open Krab, acknowledge the explanation, choose Gear in the bottom navigation, then choose Drop pot.
- With location denied: open Krab, choose Turn on location, decline. Read the `Location is off` guidance, then choose Drop pot.
- Getting position: choose Drop pot before any fix arrives. Cancel or Save without position, or wait 20 s.

## Driving it with Playwright

Preconditions: fresh context, empty site data, granted emulated location, made-up position and a healthy preview owned by this run. Execute all three journeys (Map, Gear, Denied) with `bun scripts/verify-krab/run.ts`.

- **Explain:** `await page.goto('/')`; require heading `Krab needs your location` and capture it. Grant via `await context.grantPermissions(['geolocation'])`, set `MADE_UP_SEA` with accuracy 8, then click `page.getByRole('button', { name: 'Turn on location' })`. Require `page.getByText('Position ready')` before any tap on Drop.
- **Choose entry:** stay on Map, or click `page.getByRole('button', { name: 'Gear', exact: true })` in the fresh Gear journey. Capture the pre-drop screen.
- **Drop:** click `page.getByRole('button', { name: 'Drop pot', exact: true })`; require `toastOf(page)` from `e2e/fixtures.ts` (the group inside the status region named `Messages`) to contain `Pot 1 dropped`. Capture the action/result and log it.
- **Find:** click the Gear button. Require `page.getByRole('main').getByRole('listitem').filter({ hasText: 'Pot 1' })` to show `0 ft`. Read the actual IndexedDB record and require the made-up position. Capture Gear.
- **Restore:** `await page.reload()`, click Gear, require the same row and `0 ft`. Read IndexedDB again and require identical records. Capture the restored screen, ARIA snapshot and action log. Both entry points must pass and their evidence must survive cleanup.
- **Denied:** in a fresh context, `await context.clearPermissions()`, `page.goto('/')`, click `Turn on location`. Require `page.getByRole('region', { name: 'Location is off' })` to contain `Settings` and capture it. Click `Drop pot`; require `toastOf(page)` to contain `Pot 1 dropped without a position`. Click Gear; require the Pot 1 row to show `No position`. Read IndexedDB and require `position: null`, `noPosition: 'denied'`.

## Gotchas

- The recipe proves a granted fix and a denied permission. It does not drive the 20 s wait, Cancel, Save without position, rough fixes or a storage failure: the trip module's tests own that policy with a fixed clock, and `e2e/position-problems.test.ts` checks the Getting position panel's targets and focus by stubbing `watchPosition` to never answer. Don't stub geolocation in this recipe; that would not be a real user journey.
- `clearPermissions()` makes WebKit report denied at once. It does not show an iOS prompt, and the Settings path in the guidance is unverified on a device.
- Without `Position ready`, a tap starts the Getting position panel instead of saving at once. Wait for the status rather than sleeping. A granted fix older than 5 s also shows `Finding your position`, so tap soon after `Position ready` appears.
- `Saving drop` is usually too brief to capture. `e2e/position-problems.test.ts` holds it open with a competing IndexedDB readwrite transaction and drives readiness expiry with a paused `page.clock` and a held `watchPosition` callback.
- Reload returns to Map, so choose Gear again before asserting restoration.
- The Gear list's navigation items are also list items; scope the pot row to main. Each row now wraps a button that opens its gear sheet (see [Drop details](drop-details.md)); the `listitem` locator still matches.
