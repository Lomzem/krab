# Finding gear

Find gear still in the water on a north-up chart map or in the Gear list. The Map tab shows gear in the water, my position and the nearest gear's distance and direction. Ticket 06 built the map. Days, day markers, the Map filter and the collected layer are in [Days and the Map filter](days-and-map-filter.md).

## Sub-features

- Map tab (the default tab): NOAA chart tiles by default from the fixed `default028mm` grid, with an OpenFreeMap street toggle. Rotation and pitch are off, and the attribution includes "Not to be used for navigation".
- Gear in the water shows as buttons with the kind icon and number, and a time-in-the-water label underneath. Each button's name reads the gear name, distance and point, time in the water, and rough position when applicable.
- Gear whose drawn markers would touch shows as one group button: the lead gear's chip, its day only when every gear in the group went in that day, and a `+N` segment bordered like the layer of the other gear (in the water first), with one `!` when any of it is past gear left uncollected. Its name starts with that visible text, then the total, the days when they differ, every gear, the count in each layer when the layers mix, and how many are uncollected, for example "Pot 2 +2 more. 3 gear here: Pot 1, Pot 3, Pot 2; 2 in the water, 1 collected". Gear at one spot never splits at any zoom. A group that also takes in gear at another spot says "gear in this area" instead of "gear here", and its list says to zoom in to see them apart. Tapping it lists every gear with its own day and status. A group draws no time label, so it takes no room below its chip. Every drop the filter shows is drawn exactly once: as its own marker, or as a member of a group of two or more. No marker is empty, and there is no group of one. A chain of drops spaced so that one's time label reaches the next, but a group chip would not, still groups. `e2e/chart-map.test.ts` proves this for six drops in a line at 393 × 852 (both themes), 402 × 681 and 320 × 640, and `src/lib/features/map/groups.test.ts` proves the partition across zooms, orders and featured leads.
- While the map shows all gear, it shifts so drawn gear clears the map controls, a map notice and the credits where the map has room, and shifts again when a notice appears or leaves. While Undo shows, the newest drop's marker and time label also clear the toast, measured from the real credits height. If the newest drop is in a group that can't be shown clear of them, the map zooms in just enough to draw it on its own. At 320 × 640 with a map notice showing this still holds. When the camera can't move (after I pan, zoom or Show on map), a notice that appears draws beneath gear, time labels and my position, and moves no gear or control; `e2e/chart-map.test.ts` owns that proof.
- The Undo toast sits above the credits, or beside the zoom column when the map is too short for it, or in its own row below the map when neither fits; the map's height, the credits and the control column are measured synchronously before the toast is placed, so no frame covers the credits or a control. `e2e/chart-map.test.ts` owns that proof at 320 × 640 and 320 × 568.
- My position: a dot inside a ring wide enough to show above and below a gear chip at the same place, named "Your position", with an accuracy area. It reads "rough, within about …" when worse than 50 m, and "heading …" while moving at 0.5 m/s or more when the fix reports a heading.
- Nearest-gear card above the map: "Nearest gear: <name>" with distance and direction.
- Buttons, so dragging is never needed: Street map (toggle; while on it reads "✓ Street" with a check, keeps the name Street map and the same width), Zoom in, Zoom out (unavailable at the limits), and Centre on my position (Show all gear when there is no fix).
- Tapping gear on the map opens its gear sheet without Show on map. Show on map appears in a sheet opened from the Gear list, switches to the Map tab and focuses that gear. It also rings that gear's marker, or the group holding it, in magenta and marks it `aria-current="true"`. The ring is separate from focus: it stays when focus moves on and when the gear's sheet opens and closes, and the zoom buttons keep it. It clears when you move the map yourself (drag, pinch, wheel or arrow keys), when you press Show all gear, or when the map closes. It is never saved.
- Map notices. When base tiles or the Street style fail to load, or the Street style has not fully arrived after 10 seconds, the notice names no cause unless the browser reports it is offline: "The map can't load right now." while online, "Offline. The map can't load." while offline (screen readers also hear "Your gear and position still show.") When the map service answers base tiles busy or failing (HTTP 429 or 5xx), or refuses or sends an unusable Street style: "The map service isn't answering." (screen readers also hear "The map can't load. Your gear and position still show.") Missing tiles (404) show no notice. Gear and position still render either way, and the notice clears once a map tile arrives.
- Chart zoom is capped at XYZ z16, which is NOAA service level 14. The map overscales beyond that, up to z19.

## How to get to it (user POV)

Open Krab. The Map tab is the first tab. Turn on location and drop a pot or net; the gear appears on the map at your position. Tap the gear to open its sheet. Choose Gear in the bottom navigation, tap a row, then tap Show on map to return to the map at that gear.

## Driving it with Playwright

`scripts/verify-krab/finding-gear.ts` runs through `bun scripts/verify-krab/run.ts` with two journeys.

- **Finding gear on the Map tab and from the Gear list:**
  1. Drop Pot 1 at `MADE_UP_SEA`.
  2. On `getByRole('region', { name: 'Map', exact: true })`, expect:
     - the button `/^Pot 1,/`;
     - the img `/^Your position/`;
     - the heading `/Nearest gear/` with text Pot 1;
     - the NOAA attribution.
  3. Tap Pot 1, so the dialog shows heading Pot 1 and no Show on map button. Press Escape; Pot 1 is focused.
  4. Gear > Pot 1 row > Show on map. Pot 1 on the map is focused and in the viewport.
  5. Street map: `aria-pressed="true"` and the OpenStreetMap attribution. Centre on my position keeps Pot 1 in view.
  6. Evidence: screenshots, ARIA snapshots, read-only IndexedDB in `indexeddb-after.json`, and every request URL in `requests.json`.
- **NOAA chart alignment:**
  - For z10 and z14, compute the slippy tile and in-tile pixel of two public landmarks (Golden Gate Park as land, the Pacific west of Ocean Beach as water).
  - Build the URL with the app's `chartSource` and `chartTileUrl`, fetch it from the page with `mode: 'cors'`, draw it to a canvas and read a 5×5 median pixel.
  - Land must read tan (red − blue > 25) and water blue or white, with `response.type === 'cors'`.
  - Tiles and samples go to the journey evidence (`tile-z*.png`, `alignment.json`).

## Gotchas

- MapLibre's unlayered `.maplibregl-map { position: relative }` beats Tailwind's layered utilities. Keep the map container `size-full` inside a separately positioned wrapper, or it collapses to 0 px, which hides the chart and makes gear untappable even though Playwright reports it visible.
- The map takes the height its caller gives it and sets no minimum of its own. A minimum taller than the Map tab's slot on a 320 × 640 screen pushed the map under the panel below, clipping the credits and misplacing the Undo clearance.
- The Map tab is the default, so the map is mounted before any fix exists. The map notice (can't load right now, Offline, or not answering) is a second status region beside the toast; check toasts with `toastOf(page)` from `e2e/fixtures.ts` (the group inside the status region named `Messages`) rather than any `role="status"`.
- MapLibre's canvas is a region named "Map view"; the tab's region is "Map". Use `exact: true`.
- Rapid Zoom in presses interrupt each other's animation and never reach the limit. Press once and wait for the button to become unavailable before pressing again.
- Both journeys use the real network: NOAA and OpenFreeMap must be reachable from the container. Mid-ocean NOAA tiles are blank (no coverage), so the chart looks like plain sea at `MADE_UP_SEA`.
- Page JavaScript cannot read `Access-Control-Allow-Origin`. A successful `getImageData` on a `mode: 'cors'` fetch is the WebGL-relevant CORS proof.
- Course and rough labels, the zoom cap, privacy and both map notices are owned by `e2e/chart-map.test.ts` with routed tiles. This recipe gathers evidence and does not replace that proof.
