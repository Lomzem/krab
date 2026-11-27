# Drop details

Open a dropped pot or net in its gear sheet to add a label, bait, depth and notes, switch it between pot and net, or delete it with Undo.

## Sub-features

- `details-sheet`: one `GearSheetSession` drives the sheet, a UI SDK `Dialog` with `presentation="sheet"`, and each gear sheet uses one history entry.
- `details-draft`: edits stay a draft. A clean sheet closes on Close, Escape, browser Back, a backdrop tap or a swipe down. With unsaved changes, a backdrop tap or swipe springs back silently, and Close, Escape, Back, Show on map, Delete drop and Undo collect ask `Unsaved changes` first. That `AlertDialog` gives `Keep editing` focus first, ignores an outside tap, and keeps editing on Escape; `Discard changes` closes and leaves the stored drop unchanged. A dismissal while a Save of the draft is pending closes the sheet at once, so the Undo hold stays reachable.
- `details-save`: Save in the footer stores label, bait, depth (ft) and notes, closes the sheet and survives reload.
- `details-bait`: bait is chosen from chips or found and added through `Other bait` (`Add bait` when no chips show), a UI SDK `Collapsible` holding a `Command` search labelled `Find or add bait`. Opened by keyboard, focus moves to the search; opened by touch, it does not. A typed search that is not picked blocks Save and marks the search. Escape with a typed query asks `Unsaved changes`. `Clear bait` removes the choice.
- `details-depth`: a negative or non-numeric depth keeps the sheet open, marks Depth invalid with `Enter 0 or more feet` and focuses it.
- `details-kind`: the selected kind shows a check like the Drop control's, with its space reserved so nothing shifts. Switching kind gives the next number of the new kind (Net 1 becomes Pot 2 after Pot 1) and is refused once the gear has been dropped again (`Can't change, dropped again`).
- `details-delete`: Delete drop removes the row at once, focuses the Gear heading when deleted from Gear, shows `{name} deleted`, and Undo restores the same record in its original position. Deleting a trip's only drop removes the trip; Undo brings back the same trip. Deleting a drop that is already gone, for example deleted in another tab, closes the sheet without an error.
- `details-restore-order`: a restored drop goes back among its gear's drops by drop time, and restored gear goes back among the other gear by when it was first dropped. Undo is refused with `Couldn't undo, {name} dropped again` when that gear has a drop in the water by then, so a gear is never in the water twice.
- `details-focus`: the sheet is a modal dialog: focus moves in, stays in while open, and returns to the opening row, or after a delete to the Gear heading on Gear and the Drop button on Map. While it is open the dock toast is inert.

## How to get to it (user POV)

Place a pot, choose the Gear tab at the top, then tap the pot's row. The sheet opens over the list with Save and Delete drop in its footer.

## Driving it with Playwright

Run `bun scripts/verify-krab/run.ts` through the parent skill's bounded lifecycle. [drop-details.ts](../../../../scripts/verify-krab/drop-details.ts) owns the exact actions, assertions and evidence filenames.

Covers discarding a draft through `Unsaved changes` with focus restoration, invalid depth, Save/reload, switching kind, Delete with the Gear heading focused, and Undo. Persisted reads establish that dismissed or refused edits store nothing and Undo restores the record. The kind-locked refusal remains outside this live recipe.

## Gotchas

- Check toasts with `toastOf(page)` from `e2e/fixtures.ts` (the toast item inside the `Messages` region). On the Map tab the map's outage notice (for example `Map offline`) is a second status region that can show at the same time.
- The kind radios are visually hidden; click their visible label text instead of calling `check()`.
- A row may carry a second line, `Rough position, within about …`, when the fix was rough; it is part of the row button's name, so filter rows by gear name rather than matching the whole name.
- Every list row is a button inside its list item. Scope rows to `main`, because the screen tabs and dock controls sit outside it.
- The kind-locked refusal needs a gear dropped twice: collect it and use `Drop pot again here` (see [Collecting](collecting.md)). Do not seed records to reach it; the trip module tests own that rule.
- The already-gone delete is proven in `e2e/gear-sheet.test.ts` with a second page in the same context. Restore order and the dropped-again refusal belong to the trip module tests: one page can't reach the refusal, because a newer notice replaces the Undo toast.
- `e2e/gear-sheet.test.ts` is a product test run by `bun run test:e2e:container`. It proves the unsaved-changes guard, the swipe, the pending-Save dismissal and the double-press guard; it is not verification evidence for this map. Bait choices are proven in `e2e/bait.test.ts`.
- Click `Delete drop` once. A double click can land its second click on whatever sits under the closed sheet.
- Press Escape after the reload check, before opening Net 1, so the row click reaches the list rather than the open sheet.
