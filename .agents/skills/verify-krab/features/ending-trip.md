# Ending a trip

Finish the running trip from the Gear tab when the day's fishing is done. Krab asks first and says how much gear is still in the water. The ended trip moves to Past trips and can stay on the Map as a dotted Past trips layer.

## Sub-features

- `end-trip`: with a trip running, the Gear tab shows an `End trip` button under the running trip. It stays visible and is disabled while a drop is being placed. It opens the `End trip?` confirmation.
- `confirm`: the confirmation is a UI SDK `AlertDialog`. It says `{n} still in the water` only when gear is in the water, then `Kept in Past trips`. `Keep trip going` has focus first. An outside tap is ignored. `Keep trip going`, or Escape while no end is saving, closes it, stores nothing and refocuses `End trip`.
- `end-failed`: when the end cannot be stored, the open dialog says `Couldn't end the trip` and the trip keeps running.
- `ended`: confirming stores a numeric `endedAt` and leaves uncollected drops with `collectedAt: null`. The `Messages` toast says `Trip ended` for 4 s. Gear says `Nothing in the water`, focus moves to the Gear heading, and `View ended trip` opens that trip under Past trips. The screen wake lock is released.
- `past-layer`: when past trips exist, the Map `Filter` is available with no trip running and offers a `Past trips` checkbox, unchecked by default. Checked, it shows each past drop as a dotted icon pin named `{name}, past trip, {dates}, {status}`, below collected and in-water pins. Unchecked, those pins are gone.

## How to get to it (user POV)

Place gear to start a trip, then choose the Gear tab. Tap End trip under the running trip and confirm. To see old gear on the map, tap Filter and tick Past trips.

## Driving it with Playwright

Run `bun scripts/verify-krab/run.ts` through the parent skill's bounded lifecycle. [end-and-past-trips.ts](../../../../scripts/verify-krab/end-and-past-trips.ts) owns the exact actions, assertions and evidence filenames.

The ending-trip journey collects one pot and leaves a net in the water. It covers Keep trip going without mutation, confirming End with the saved uncollected state, the Gear heading focus and `View ended trip`, then toggling the Past trips map layer off and on.

## Gotchas

- The dialog's confirm is also named `End trip`. Scope the opener to `main` and the confirm to the `alertdialog`.
- `End trip` is disabled while a drop is being placed. Wait for the drop toast before choosing it.
- Wake-lock release on ending is proven in `e2e/wake-lock.test.ts` with the counting fake, not in this recipe. The failed end inside the open dialog is proven in `e2e/collect-and-catch.test.ts`, and the 4 s `Trip ended` lifetime in `e2e/undo.test.ts`; this recipe injects no storage fault.
- Do not seed an `endedAt`; end the trip through the confirmation.
