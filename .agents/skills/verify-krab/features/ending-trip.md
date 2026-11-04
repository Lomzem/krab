# Ending a trip

Finish the running trip from the Map when the day's fishing is done. Krab asks first and says what happens to gear still in the water. The ended trip moves to Past trips and can stay on the Map as a dotted Past trips layer.

## Sub-features

- `end-trip`: with a trip running and no drop being placed, the Map shows a bar `Trip running. N in the water.` with an `End trip` button. It opens `End this trip?`.
- `confirm`: the sheet names the outcome: `Everything has been collected. The trip moves to past trips.`, `1 drop is still in the water. It'll be saved as uncollected.` or `N drops are still in the water. They'll be saved as uncollected.` `Keep fishing` (or Escape) closes it, stores nothing and refocuses `End trip`.
- `ended`: confirming stores a numeric `endedAt` and leaves uncollected drops with `collectedAt: null`. The toast reads `Trip ended. It is under Past trips.`, the bar goes, the Map says `No trip running`, and focus moves to the Drop button. The screen wake lock is released.
- `past-layer`: when past trips exist, the Map `Filter` is available with no trip running and offers a `Past trips` checkbox. It shows each past drop as a dotted icon pin named `{name}, past trip, {dates}, {status}`, below collected and in-water pins.

## How to get to it (user POV)

Place gear to start a trip, then choose Map. Tap End trip in the bar above the map and confirm. To see old gear on the map, tap Filter and tick Past trips.

## Driving it with Playwright

Preconditions: launch and doctor from the parent skill; fresh context; made-up fix granted and `Position ready` visible before Drop. The recipe installs `page.clock` at 07:30 on 10 June 2031 in `America/New_York`, so the trip is named `Tuesday, June 10, 2031`. `bun scripts/verify-krab/run.ts` runs the first journey in `scripts/verify-krab/end-and-past-trips.ts`, which drives every step below and writes `actions.jsonl`, screenshots `01`–`04` with ARIA snapshots, `doctor.json` and the IndexedDB snapshots named here.

- **Set up:** click `Drop pot`; choose `Net` in the `Gear to drop` group and click `Drop net`. Open Pot 1 from Gear, click `Collect`, `One more kept` twice, then `Save`.
- **Running:** choose Map. Require the `Map` region to contain `Trip running. 1 in the water.` and the button `End trip`. Keep `indexeddb-before.json`.
- **Keep fishing:** click `End trip`. Require the dialog heading `End this trip?` and the text `1 drop is still in the water. It'll be saved as uncollected.` Click `Keep fishing`; require the dialog hidden, `End trip` focused and stored `endedAt: null`.
- **End:** click `End trip`, then the dialog's `End trip`. Require the dialog hidden, `toastOf(page)` containing `Trip ended. It is under Past trips.`, `Drop net` focused, no `End trip` in the Map region and the text `No trip running`. Require one stored trip with a numeric `endedAt`, Pot 1 collected and Net 1 `collectedAt: null`. Keep `indexeddb-ended.json`.
- **Past layer:** click the Map region's button named `/^Filter/`, check `Past trips` in the dialog's `Also show` group and click `Done`. Require the Map buttons `Pot 1, past trip, Tuesday, June 10, 2031, 2 kept, 0 released` and `Net 1, past trip, Tuesday, June 10, 2031, Uncollected`. Keep `indexeddb-after.json`.

## Gotchas

- The dialog's confirm is also named `End trip`. Scope the first click to the `Map` region and the confirm to the dialog.
- `End trip` is hidden while a drop is being placed. Wait for the drop toast before choosing Map.
- The focus target after ending is the Drop button for the kind last chosen: `Drop net` here because Net was chosen last.
- Wake-lock release on ending is proven in `e2e/wake-lock.test.ts` with the counting fake, not in this recipe. A failed end (storage error) toasts `Couldn't end the trip. Try again.` and has no reachable UI path to drive.
- Do not seed an `endedAt`; end the trip through the sheet.
