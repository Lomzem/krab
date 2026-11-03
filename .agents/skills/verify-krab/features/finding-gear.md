# Finding gear

Find gear still in the water on a north-up chart map or in the Gear list. The Map tab shows gear in the water, my position and the nearest gear's distance and direction. Ticket 06 built the map; ticket 08 owns the dedicated finding workflow.

## Sub-features

- Map tab (the default tab): NOAA chart tiles by default from the fixed `default028mm` grid, with an OpenFreeMap street toggle. Rotation and pitch are off, and the attribution includes "Not to be used for navigation".
- Gear in the water shows as buttons with the kind icon and number, and a time-in-the-water label underneath. Each button's name reads the gear name, distance and point, time in the water, and rough position when applicable.
- My position: a dot named "Your position", with an accuracy area. It reads "rough, within about …" when worse than 50 m, and "heading …" while moving at 0.5 m/s or more when the fix reports a heading.
- Nearest-gear card above the map: "Nearest gear: <name>" with distance and direction.
- Buttons, so dragging is never needed: Street map (toggle), Zoom in, Zoom out (unavailable at the limits), and Centre on my position (Show all gear when there is no fix).
- Tapping gear on the map opens its gear sheet without Show on map. Show on map appears in a sheet opened from the Gear list, switches to the Map tab and focuses that gear.
- No signal: "No signal, so the map can't load. Your gear and position still show." Gear and position still render. The notice clears when the phone comes back online.
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
- The Map tab is the default, so the map is mounted before any fix exists. Two `role="status"` regions can coexist (the drop toast and No signal); filter by text.
- MapLibre's canvas is a region named "Map view"; the tab's region is "Map". Use `exact: true`.
- Rapid Zoom in presses interrupt each other's animation and never reach the limit. Press once and wait for the button to become unavailable before pressing again.
- Both journeys use the real network: NOAA and OpenFreeMap must be reachable from the container. Mid-ocean NOAA tiles are blank (no coverage), so the chart looks like plain sea at `MADE_UP_SEA`.
- Page JavaScript cannot read `Access-Control-Allow-Origin`. A successful `getImageData` on a `mode: 'cors'` fetch is the WebGL-relevant CORS proof.
- Course and rough labels, the zoom cap, privacy and no signal are owned by `e2e/chart-map.test.ts` with routed tiles. This recipe gathers evidence and does not replace that proof.
