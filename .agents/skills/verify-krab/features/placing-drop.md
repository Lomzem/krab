# Placing a drop

Save a pot's location during a trip and find the same pot in the Gear list after reloading Krab.

## Sub-features

- `drop-map`: place the first pot from Map.
- `drop-gear`: place the first pot from Gear.
- `drop-restore`: saved Pot 1 and its position survive reload.

## How to get to it (user POV)

- Open Krab on Map, acknowledge the location explanation, then choose Drop pot.
- Open Krab, acknowledge the explanation, choose Gear in the bottom navigation, then choose Drop pot.

## Driving it with Playwright

Preconditions: fresh context, empty site data, granted emulated location, made-up position and a healthy preview owned by this run. Execute both entry points with `bun scripts/verify-krab/run.ts`.

- **Explain:** `await page.goto('/')`; require heading `Krab needs your location` and capture it. Grant via `await context.grantPermissions(['geolocation'])`, set `MADE_UP_SEA` with accuracy 8, then click `page.getByRole('button', { name: 'Turn on location' })`. The Drop control appears.
- **Choose entry:** stay on Map, or click `page.getByRole('button', { name: 'Gear', exact: true })` in the fresh Gear journey. Capture the pre-drop screen.
- **Drop:** click `page.getByRole('button', { name: 'Drop pot', exact: true })`; require `page.getByRole('status')` to contain `Pot 1 dropped`. Capture the action/result and log it.
- **Find:** click the Gear button. Require `page.getByRole('main').getByRole('listitem').filter({ hasText: 'Pot 1' })` to show `0 ft`. Read the actual IndexedDB record and require the made-up position. Capture Gear.
- **Restore:** `await page.reload()`, click Gear, require the same row and `0 ft`. Read IndexedDB again and require identical records. Capture the restored screen, ARIA snapshot and action log. Both entry points must pass and their evidence must survive cleanup.

## Gotchas

- This flow proves a pot with a granted fix, not net selection, Undo, permission denial or no-fix handling; the existing trip tests own numbering and freshness policy. Extend the map when another journey is required.
- Ticket 02 has no location-ready indicator. If the emulated fix does not arrive before the tap, the saved-position assertion fails. Report that failure rather than inserting a position. Ticket 03 owns explicit location status.
- Reload returns to Map, so choose Gear again before asserting restoration.
- The Gear list's navigation items are also list items; scope the pot row to main.
