# Ending a trip

Finish the running trip from the Map when the day's fishing is done. Krab asks first and says what happens to gear still in the water. The ended trip moves to Past trips and can stay on the Map as a dotted Past trips layer.

## Sub-features

- `end-trip`: with a trip running and no drop being placed, the Map shows a bar `Trip running. N in the water.` with an `End trip` button. It opens `End this trip?`.
- `confirm`: the sheet names the outcome: `Everything has been collected. The trip moves to past trips.`, `1 drop is still in the water. It'll be saved as uncollected.` or `N drops are still in the water. They'll be saved as uncollected.` `Keep fishing` (or Escape) closes it, stores nothing and refocuses `End trip`.
- `ended`: confirming stores a numeric `endedAt` and leaves uncollected drops with `collectedAt: null`. The toast reads `Trip ended. It is under Past trips.`, the bar goes, the Map says `No trip running`, and focus moves to the Drop button. The screen wake lock is released.
- `past-layer`: when past trips exist, the Map `Filter` is available with no trip running and offers a `Past trips` checkbox, unchecked by default. Checked, it shows each past drop as a dotted icon pin named `{name}, past trip, {dates}, {status}`, below collected and in-water pins. Unchecked, those pins are gone.

## How to get to it (user POV)

Place gear to start a trip, then choose Map. Tap End trip in the bar above the map and confirm. To see old gear on the map, tap Filter and tick Past trips.

## Driving it with Playwright

Run `bun scripts/verify-krab/run.ts` through the parent skill's bounded lifecycle. [end-and-past-trips.ts](../../../../scripts/verify-krab/end-and-past-trips.ts) owns the exact actions, assertions and evidence filenames.

The ending-trip journey collects one pot and leaves a net in the water. It covers Keep fishing without mutation, confirming End with the saved uncollected state and focus restoration, then toggling the Past trips map layer off and on.

## Gotchas

- The dialog's confirm is also named `End trip`. Scope the first click to the `Map` region and the confirm to the dialog.
- `End trip` is hidden while a drop is being placed. Wait for the drop toast before choosing Map.
- The focus target after ending is the Drop button for the kind last chosen: `Drop net` here because Net was chosen last.
- Wake-lock release on ending is proven in `e2e/wake-lock.test.ts` with the counting fake, not in this recipe. A failed end (storage error) toasts `Couldn't end the trip. Try again.` and has no reachable UI path to drive.
- Do not seed an `endedAt`; end the trip through the sheet.
