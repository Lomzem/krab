# Collecting

Take gear out of the water from its gear sheet, record what it caught, and put the same gear back in with Drop again. Collecting can be undone from its toast for 8 seconds or from the sheet with no time limit.

## Sub-features

- `collect`: Collect in the in-water sheet stores `collectedAt` at the tap. The sheet stays open and turns into the Catch view with focus on the `Catch` heading. The toast reads `{name} collected` with Undo for 8 seconds. A repeated tap changes nothing and shows no error.
- `catch`: the Kept and Released steppers, labelled `One more kept`/`One fewer kept` and the released equivalents, and the `Nothing caught` button edit a draft. Save stores `{ kept, released }`; Escape discards. Clear catch returns to not recorded (`catch: null`). A one-sided catch cannot be stored.
- `collected-list`: Gear shows `N in the water` and `N collected` under the title and a `Collected` region whose rows read `2 kept, 1 released`, `Nothing caught` or `Catch not recorded`.
- `drop-again`: the latest collected drop of a gear offers `Drop pot again here` (or net). It saves the sheet's draft, then stores a new drop of the same gear (same name and number; label, bait and depth copied) at the current fix.
- `undo-collect`: Undo collect in the sheet footer clears `collectedAt` and the catch, and focus moves to Collect. Older drops of re-dropped gear show Delete drop instead.

## How to get to it (user POV)

Place a pot, choose Gear in the bottom navigation and tap the pot's row. Collect is the large button at the top of the sheet. Collected gear moves to the Collected section of Gear; tap its row to edit the catch, drop it again or undo the collect.

## Driving it with Playwright

Preconditions: launch and doctor from the parent skill; fresh context; made-up fix granted and `Position ready` visible before Drop. `bun scripts/verify-krab/run.ts` runs `scripts/verify-krab/collecting.ts`, which drives every step below and writes `actions.jsonl`, screenshots `01`–`07` with ARIA snapshots, `doctor.json` and the IndexedDB snapshots named here.

- **Open:** click Gear, then the `main` button filtered by `Pot 1` and `in the water`. Require the dialog heading `Pot 1`, the text `in the water` and the button `Collect` (exact). Keep `indexeddb-before.json`.
- **Collect:** click `Collect`. Require the `Catch` heading focused, `Undo collect` in the footer, `toastOf(page)` containing `Pot 1 collected`, and the stored latest drop with a numeric `collectedAt` and `catch: null`.
- **Catch:** click `One more kept` twice and `One more released` once; require the stored catch still null. Click `Save`; require the dialog hidden, stored `catch: { kept: 2, released: 1 }`, the Collected row `2 kept, 1 released`, and `1 collected` and `Nothing in the water` in main. Keep `indexeddb-catch-saved.json`.
- **Reload:** reload, choose Gear; require the same row text and IndexedDB equal to `indexeddb-catch-saved.json`.
- **Drop again:** open the Collected Pot 1 row, click `Drop pot again here`. Require the dialog hidden, toast `Pot 1 dropped`, an in-water Pot 1 row, and two stored drops sharing one `gearId`, the second with `collectedAt: null`, `catch: null` and the made-up position. Keep `indexeddb-dropped-again.json`.
- **Undo collect:** open the in-water Pot 1, click `Collect`, then `Undo collect`. Require `Collect` focused and the stored latest drop back to `collectedAt: null`, `catch: null`. Keep `indexeddb-after.json`.

## Gotchas

- Each stepper count is an `<output>`, which has the `status` role. Check toasts with `toastOf(page)` from `e2e/fixtures.ts` (the group inside the status region named `Messages`), which never matches a count.
- `Collect` needs `exact: true`; otherwise it also matches `Undo collect`.
- Steppers start from not recorded and show `–`; the accessible text is `Kept: not recorded`. The first `One more kept` gives `Kept: 1` and `Released: 0`.
- The 8-second toast lifetime is proven in `e2e/undo.test.ts` with a paused clock, not in this recipe. The repeat-tap convergence and the refusals (`InvalidCatch`, `NotCollected`, `DroppedAgain`, `CannotDropAgain`) belong to the trip module tests and have no reachable UI path to drive.
- Do not seed collected drops; collect through the sheet.
