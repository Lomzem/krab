# Past trips

Look back at trips that have ended: when they were, what was dropped, what each pot or net caught, and where it was. A past trip can be deleted from the phone after a confirmation.

## Sub-features

- `list`: Past trips lists ended trips, newest first. Each row is a button reading the trip's dates (`Tuesday, June 10, 2031`, or a range for a trip over several days) and its counts (`2 drops, 1 uncollected`). Trips that share a date also show their start time. With none, the tab says `No past trips`. If storage can't be read when Krab opens, the tab says `Couldn't load past trips` with a `Retry` button instead of claiming there are none, and Map and Gear say `Couldn't load the trip`; Retry loads both. Ending, editing, deleting and restoring update the list from what was saved, without re-reading history.
- `detail`: tapping a row opens the trip with its dates as a focused heading and the counts, a map of its drops on the shared `GearMap` (dotted pins named `{name}, {day}, {status}`, and no position marker), and a `Gear` list whose rows read `{name} {status}`. Status is the catch (`2 kept, 0 released`, `Nothing caught`, `Catch not recorded`) or `Uncollected`. A trip over several days groups the list by day and adds a `Days on this trip` choice of Last day, Earlier days or All. `All past trips` goes back and refocuses the trip's row.
- `past-sheet`: tapping a row or pin opens the gear sheet. Uncollected gear says `Uncollected` with no Collect and no Catch. Collected gear shows its catch for editing but no `Drop … again here`; a saved edit shows in the trip's list as soon as the sheet closes. `Show on map` focuses the pin on the trip map.
- `delete-drop`: deleting a past trip's only drop removes the trip from the list until Undo restores it.
- `delete-trip`: `Delete trip` opens the `Delete trip?` `AlertDialog`, which names the trip and says `Can't be undone`. `Keep trip` has focus first and refocuses the button. An outside tap is ignored. Escape keeps the trip while no removal is saving. While the removal is saving, the dialog stays open: `Keep trip` reads as disabled, and it and Escape do nothing. Confirming removes the trip and its catches for good, toasts `Trip deleted` and returns to the list with the Past trips heading focused.

## How to get to it (user POV)

End a trip from the Gear tab, then choose the `Past trips` tab at the top and tap the trip. The screen tabs are manual: arrow keys move focus and Enter or Space opens a tab.

## Driving it with Playwright

Run `bun scripts/verify-krab/run.ts` through the parent skill's bounded lifecycle. [end-and-past-trips.ts](../../../../scripts/verify-krab/end-and-past-trips.ts) owns the exact actions, assertions and evidence filenames.

The past-trips journey covers list/detail, uncollected and collected sheets, Show on map, editing a saved catch, reload, cancelling Delete trip and confirming permanent deletion. It checks persisted state and focus transitions. Multi-day choices, storage faults and deleting the final drop have separate proof owners below.

## Gotchas

- Row names join the two lines with a space, so match with `exact: true` and the full name rather than `hasText`. Pins on the trip map use commas (`Pot 1, 2 kept, 0 released`); pins of the Past trips layer on the main Map add `past trip` and the dates.
- The trip detail and its delete dialog both have a `Delete trip` button. Scope the confirm to the `alertdialog`.
- Delete trip has no Undo; Undo after deleting a trip's last drop is proven in `e2e/end-and-past-trips.test.ts`. The day choice is shown only for trips over several days, and the recipe's trip is single-day, so it isn't driven here. Its calendar and DST cases are proven in the trip module tests. The radio binding is proven in `e2e/end-and-past-trips.test.ts` with a two-day trip from held fixes and the page clock: All starts checked, and Last day and Earlier days hide and show the named rows and pins (`Pot 2, Day 2, Uncollected`) together. To drive it live, hold fixes as in [Days and the Map filter](days-and-map-filter.md) and drop either side of local midnight before ending.
- Dates and day grouping use the browser's time zone at the moment they're shown; set `timezoneId` as in [Days and the Map filter](days-and-map-filter.md). A zone change while Krab stays open is proven in the trip module tests, not driven here.
- The trip map loads tiles like the main Map; a phone that can't show the map still lists the gear.
- Do not seed ended trips; end them through the Gear tab.
- The load failure and Retry are proven in `e2e/end-and-past-trips.test.ts` (Past trips) and `e2e/storage-problems.test.ts` (Map and Gear) by failing IndexedDB from a Playwright init script; the live recipe doesn't inject storage faults.
