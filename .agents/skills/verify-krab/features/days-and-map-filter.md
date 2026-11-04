# Days and the Map filter

An overnight trip stays one trip. Each drop belongs to the phone's local calendar date when it was placed, and days are numbered from the trip's start, so a drop at 00:10 after a drop at 23:40 starts Day 2. The Map filter narrows only the map: Collected gear, Time in the water and, on multi-day trips, Days on this trip. Ticket 08 built it.

## Sub-features

- Day is derived from `placedAt` and never stored. Day N counts calendar dates from the local date of `trip.startedAt`, so a quiet day leaves a gap (Day 1, Day 3).
- On multi-day trips:
  - the Gear list groups gear in the water under "Day 1", "Day 2" headings (regions with those names), keeping distance order within a day;
  - the Collected section groups collected rows under "Day 1", "Day 2" headings (regions "Collected Day 1", "Collected Day 2"), keeping collection order within a day;
  - one day indicator, a day marker shape followed by visible "Day N" text, labels the day headings, the gear sheet heading and every pin; each pin's name includes the day, for example "Pot 1, Day 1, …" or "Pot 1, Day 1, collected, …".
- Day marker shapes cycle circle, square, diamond, hexagon as outlines; the text carries the number. Colour never carries the day.
- One-day trips look as before: no day text, no grouping, no Days section.
- The Filter button sits at the top left of the map during a trip, and also when past trips exist without a running trip, and opens the "Map filter" sheet. Its name reads "Filter, showing …" with the current choices.
  - "Gear in the water always shows."
  - "Also show": the checkboxes Collected gear and Time in the water, both on by default. Collected gear draws collected drops that have a position as dashed, muted pins under gear in the water. Time in the water hides only the labels under pins.
  - "Days on this trip" (multi-day trips only): the radios Today, Earlier days and All, default All. On a one-day trip the map always shows all days.
  - Done closes the sheet. Every choice is a 44 px target.
- The filter lives in memory for this session's Map tab. It is not saved, reload restores the defaults, and the nearest-gear card and the Gear list ignore it.
- Show on map from a Gear list sheet turns Collected gear back on for a collected target, resets days to All when the target is outside the chosen days, then centres and focuses the target pin.

## How to get to it (user POV)

Drop gear late in the evening, then drop again after midnight. The Gear tab shows Day 1 and Day 2. On the Map tab, tap Filter at the top left. Choose Today to see only today's gear, or untick Collected gear to hide collected pins. From the Gear list, open a collected pot and tap Show on map: the map shows it again whatever the filter said.

## Driving it with Playwright

`scripts/verify-krab/days-and-filter.ts` runs through `bun scripts/verify-krab/run.ts` with `timezoneId: 'America/New_York'` and `page.clock` installed at 2031-06-10 23:40 local.

1. `holdFixes(page)` from `e2e/held-geolocation.ts` holds `watchPosition`, and `deliverFix(page, fix)` delivers made-up fixes stamped with the faked clock. Drop Pot 1 at `MADE_UP_SEA`.
2. Open Filter: group "Also show" shows and group "Days on this trip" does not. Capture `01-filter-one-day`. Done.
3. `page.clock.fastForward('30:00')` to 00:10, deliver a fix 0.001° north, drop Pot 2.
4. Gear tab: region "Day 1" holds only Pot 1 and region "Day 2" only Pot 2. Capture `02-gear-by-day`.
5. Map tab: pins `/^Pot 1, Day 1,/` and `/^Pot 2, Day 2,/`. Capture `03-map-two-days`.
6. Open Filter: All is checked. Capture `04-filter-sheet`. Check Today, Done: the Pot 1 pin is gone and Pot 2 stays. Capture `05-today-only`.
7. Gear tab, region Day 1, Pot 1, Collect, Escape. Map tab, Filter, untick Collected gear, Done.
8. Gear tab, region Collected, Pot 1, Show on map: `/^Pot 1, Day 1, collected/` is focused beside Pot 2. Capture `06-show-on-map-collected`.
9. Open Filter: Collected gear checked and All checked. Untick Collected gear, Done: with All days the collected Pot 1 pin is gone and Pot 2 stays. Capture `07-collected-off`. Tick it again: Pot 1 is back.
10. `page.clock.pauseAt` 01:09 then `runFor('00:59')`, so the next refresh shows the visible `59m` label under Pot 2. Untick Time in the water, capture `08-filter-time-off`, Done: the `59m` label is gone and the Pot 2 pin stays. Capture `09-no-time-labels`, then `page.clock.resume()`.
11. Reload, open Filter: Time in the water is checked again.
12. Evidence: `indexeddb-before.json`, `indexeddb-after.json` (two drops either side of local midnight and no stored day), `requests.json` (no position in any URL), screenshots and ARIA snapshots.

## Gotchas

- With `page.clock` installed, WebKit's emulated geolocation still stamps fixes with real time, so a fix looks stale after a clock jump and a drop waits for a position. Deliver fixes with `deliverFix` from `e2e/held-geolocation.ts`: without a time it stamps the page's `Date.now()`, and an explicit `Date` stamps exactly that. It is a plain module, separate from the e2e `providers` fixture, so live verify still reaches the real map providers.
- On a multi-day trip, match the Collected region with `exact: true`; a plain name match also finds its "Collected Day N" regions.
- Prove a filter toggle where nothing else hides the target: Collected gear over All days, and Time in the water on a visible label. The app re-reads the clock every 15 s, so `setFixedTime` leaves an old label; pause, then run the clock to a known time.
- Day boundaries follow the browser's time zone. Always set `timezoneId`; the container's default is UTC.
- Pins near each other overlap their time labels. Keep made-up drops about 0.001° apart: closer and labels overlap, farther and a pin can end up hidden under the map controls when Show on map centres the other one. The controls always stay above every pin and keep their taps (collected pins under own position under gear in the water); `e2e/chart-map.test.ts` proves a pin under Filter never takes its tap.
- The day numbering, gap days and DST cases are proven by `src/lib/features/trip/trip.test.ts` (Vitest pinned to America/New_York). The recipe only shows the screens.
