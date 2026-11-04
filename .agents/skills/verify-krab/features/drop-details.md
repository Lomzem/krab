# Drop details

Open a dropped pot or net in its gear sheet to add a label, bait, depth and notes, switch it between pot and net, or delete it with Undo.

## Sub-features

- `details-draft`: edits stay a draft; Escape or Close leaves the stored drop unchanged.
- `details-save`: Save in the footer stores label, bait, depth (ft) and notes, closes the sheet and survives reload.
- `details-depth`: a negative or non-numeric depth keeps the sheet open, marks Depth invalid and focuses it.
- `details-kind`: switching kind gives the next number of the new kind (Net 1 becomes Pot 2 after Pot 1) and is refused once the gear has been dropped again.
- `details-delete`: Delete drop removes the row at once, shows `{name} deleted`, and Undo restores the same record in its original position. Deleting a trip's only drop removes the trip; Undo brings back the same trip. Deleting a drop that is already gone, for example deleted in another tab, closes the sheet without an error.
- `details-restore-order`: a restored drop goes back among its gear's drops by drop time, and restored gear goes back among the other gear by when it was first dropped. Undo is refused with `Couldn't undo. {name} has been dropped again since.` when that gear has a drop in the water by then, so a gear is never in the water twice.
- `details-focus`: the sheet is a modal dialog: focus moves in, stays in while open, and returns to the opening row (or to the Drop button after a delete).

## How to get to it (user POV)

Place a pot, choose Gear in the bottom navigation, then tap the pot's row. The sheet opens over the list with Save and Delete drop in its footer.

## Driving it with Playwright

Preconditions: launch and doctor from the parent skill; fresh context; complete the placing-drop Explain and Drop steps first, including the `Position ready` wait before each tap on Drop. `scripts/verify-krab/drop-details.ts` drives every step below except the kind-locked refusal, under `bun scripts/verify-krab/run.ts`. Its evidence is `actions.jsonl`, `01-open` to `08-restored` screenshots with ARIA snapshots, and the IndexedDB snapshots `indexeddb-before-sheet.json`, `indexeddb-details-saved.json`, `indexeddb-kind-switched.json` and `indexeddb-restored.json`. The recipe compares each read against the earlier snapshot: unchanged after Escape and after a refused depth, equal after reload, and equal to the pre-delete snapshot after Undo.

- **Drop:** drop Pot 1, then choose `Net` in group `Gear to drop`, wait for `Position ready` and drop Net 1.
- **Open:** click Gear, then `page.getByRole('main').getByRole('button').filter({ hasText: 'Pot 1' })`. Require `page.getByRole('dialog')` with heading `Pot 1`, focus inside the dialog, and `getByLabel('Depth')` with `inputmode="decimal"`. Capture the sheet and its ARIA snapshot.
- **Draft:** fill `getByLabel('Label')`, press Escape. Require the dialog hidden, the Pot 1 row focused, and IndexedDB unchanged from before the sheet opened.
- **Depth:** reopen, fill Depth with `-3` and click `Save`. Require the dialog still open, Depth focused with `aria-invalid="true"` and a non-empty accessible description.
- **Save:** fill Label `red float` and Depth `12.5`, click `Save`. Require the dialog hidden; read IndexedDB and require the drop's `label: 'red float'` and `depthFt: 12.5`. Reload, choose Gear, reopen Pot 1 and require the same values.
- **Kind:** after dropping a net, open Net 1, click the visible `Pot` text in group `Gear`, click `Save`. Require a `Pot 2` row and no Net 1 row.
- **Delete:** open Pot 1, click `Delete drop` once. Require the dialog hidden, the `Drop pot` or `Drop net` button focused, the toast containing `Pot 1 deleted` and no Pot 1 row. Click `Undo`; require the toast to contain `Pot 1 restored` and IndexedDB equal to the snapshot taken before the delete.

## Gotchas

- Check toasts with `toastOf(page)` from `e2e/fixtures.ts` (the group inside the status region named `Messages`). Other status regions (No signal, catch counts) can be present at the same time.
- The kind radios are visually hidden; click their visible label text instead of calling `check()`.
- A row may carry a second line, `Rough position, within about …`, when the fix was rough; it is part of the row button's name, so filter rows by gear name rather than matching the whole name.
- Every list row is now a button inside its list item. Scope rows to `main`, because the navigation buttons are also buttons.
- The kind-locked refusal needs a gear dropped twice: collect it and use `Drop pot again here` (see [Collecting](collecting.md)). Do not seed records to reach it; the trip module tests own that rule.
- The already-gone delete is proven in `e2e/gear-sheet.test.ts` with a second page in the same context. Restore order and the dropped-again refusal belong to the trip module tests: one page can't reach the refusal, because a newer notice replaces the Undo toast.
- `e2e/gear-sheet.test.ts` is a product test run by `bun run test:e2e:container`. It is not verification evidence for this map.
- Click `Delete drop` once. A double click can land its second click on whatever sits under the closed sheet.
- Press Escape after the reload check, before opening Net 1, so the row click reaches the list rather than the open sheet.
