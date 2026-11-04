# Past trips

Look back at trips that have ended: when they were, what was dropped, what each pot or net caught, and where it was. A past trip can be deleted from the phone after a confirmation.

## Sub-features

- `list`: Past trips lists ended trips, newest first. Each row is a button reading the trip's dates (`Tuesday, June 10, 2031`, or a range for a trip over several days) and its counts (`2 drops, 1 uncollected`). With none, the tab says `No past trips yet.` If history can't be read when Krab opens, the tab says `Couldn't load past trips.` with a `Retry` button instead of claiming there are none. Ending, editing, deleting and restoring update the list from what was saved, without re-reading history.
- `detail`: tapping a row opens the trip with its dates as a focused heading and the counts, a map of its drops (dotted pins named `{name}, {day}, {status}`, no own position), and a `Gear` list whose rows read `{name} {status}`. Status is the catch (`2 kept, 0 released`, `Nothing caught`, `Catch not recorded`) or `Uncollected`. A trip over several days groups the list by day and adds a `Days on this trip` choice of Last day, Earlier days or All. `All past trips` goes back and refocuses the trip's row.
- `past-sheet`: tapping a row or pin opens the gear sheet. Uncollected gear says `Uncollected. The trip ended with this gear in the water.` with no Collect and no Catch. Collected gear shows its catch for editing but no `Drop … again here`. `Show on map` focuses the pin on the trip map.
- `delete-drop`: deleting a past trip's only drop removes the trip from the list until Undo restores it.
- `delete-trip`: `Delete trip` asks `Delete this trip?`. `Keep it` refocuses the button. Confirming removes the trip and its catches for good, toasts `Trip deleted` and returns to the list with its heading focused.

## How to get to it (user POV)

End a trip from the Map, then choose Past trips in the bottom navigation and tap the trip.

## Driving it with Playwright

Preconditions: launch and doctor from the parent skill; fresh context; made-up fix granted. The recipe uses the same clock and set-up as [Ending a trip](ending-trip.md): Pot 1 collected with 2 kept and Net 1 left in, then `End trip` in the Map region and the dialog's `End trip`. `bun scripts/verify-krab/run.ts` runs the second journey in `scripts/verify-krab/end-and-past-trips.ts`, which drives every step below and writes `actions.jsonl`, screenshots `01`–`06` with ARIA snapshots, `doctor.json` and the IndexedDB snapshots named here.

- **List:** click `Past trips`. Require the `main` button matching `Tuesday, June 10, 2031` to have the accessible name `Tuesday, June 10, 2031 2 drops, 1 uncollected`. Keep `indexeddb-before.json`.
- **Detail:** click it. In the region named `Tuesday, June 10, 2031`, require the level-1 heading of that name focused, the buttons `Pot 1 2 kept, 0 released` and `Net 1 Uncollected` (exact), and the map pin `Pot 1, 2 kept, 0 released`.
- **Sheets:** click `Net 1 Uncollected`; require the dialog text `Uncollected. The trip ended with this gear in the water.` and no `Collect` (exact). Press Escape; require the row focused. Click `Pot 1 2 kept, 0 released`; require `Kept: 2` in the `Kept` group's status and no button matching `/again here/`. Click `Show on map`; require the dialog hidden and the pin `Pot 1, 2 kept, 0 released` focused.
- **Reload:** reload, choose Past trips; require the same row name and IndexedDB unchanged.
- **Delete trip:** open the trip and click `Delete trip`. Require the dialog heading `Delete this trip?`. Click `Keep it`; require `Delete trip` focused and one stored trip. Click `Delete trip`, then the dialog's `Delete trip`. Require `toastOf(page)` containing `Trip deleted`, `No past trips yet.` in main, the level-1 heading `Past trips` focused and an empty store. Keep `indexeddb-after.json`.

## Gotchas

- Row names join the two lines with a space, so match with `exact: true` and the full name rather than `hasText`. Pins on the trip map use commas (`Pot 1, 2 kept, 0 released`); pins of the Past trips layer on the main Map add `past trip` and the dates.
- The trip detail and its delete dialog both have a `Delete trip` button. Scope the confirm to the dialog.
- Delete trip has no Undo; Undo after deleting a trip's last drop is proven in `e2e/end-and-past-trips.test.ts`. The day choice is shown only for trips over several days, and the recipe's trip is single-day, so it isn't driven here. Its calendar and DST cases are proven in the trip module tests. The radio binding is proven in `e2e/end-and-past-trips.test.ts` with a two-day trip from held fixes and the page clock: All starts checked, and Last day and Earlier days hide and show the named rows and pins (`Pot 2, Day 2, Uncollected`) together. To drive it live, hold fixes as in [Days and the Map filter](days-and-map-filter.md) and drop either side of local midnight before ending.
- The trip map loads tiles like the main Map; a phone that can't show the map still lists the gear.
- Do not seed ended trips; end them through the Map.
- The history-load failure and Retry are proven in `e2e/end-and-past-trips.test.ts` by aborting read-only IndexedDB transactions from a Playwright init script; the live recipe doesn't inject storage faults.
