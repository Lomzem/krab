# Collecting

Take gear out of the water from its gear sheet, record what it caught, and put the same gear back in with Drop again. Collecting can be undone from its toast for 8 seconds or from the sheet with no time limit.

## Sub-features

- `collect`: Collect in the in-water sheet stores `collectedAt` at the tap. The sheet stays open and turns into the Catch view with focus on the `Catch` heading. The toast reads `{name} collected` with Undo for 8 seconds. A successful Save that stores a recorded catch for that drop (0/0 included) retires that toast at once, so its Undo cannot clear the saved catch; a Save storing `catch: null`, a refused or failed Save, and another gear's Collect toast keep their Undo and remaining time. A repeated tap changes nothing and shows no error.
- `catch`: each of Kept and Released has a numeric text box (role `textbox`, named `Kept` or `Released`) between its steppers, labelled `One more kept`/`One fewer kept` and the released equivalents; these edit a draft. Typing into one side of a not-recorded catch sets the other side to `0`. Save stores `{ kept, released }` only when both boxes hold whole numbers from 0 (spaces around them are ignored). Emptying both boxes by hand or choosing Clear catch returns to not recorded (`catch: null`); Nothing caught sets 0/0. Escape discards. Steppers, rows and Nothing caught/Clear catch use `touch-action: manipulation`, and the editor targets stay in place through these transitions. A long count shrinks its font, never below 16 px, so up to five digits fit the unchanged box (12345 shows at 22 px). The selected Nothing caught shows a check, and the check's space is reserved, so the button does not resize.
- `catch-validation`: leaving an invalid field marks it `aria-invalid` and describes both boxes with guidance, without moving focus or storing the draft. A one-sided blank says `Enter Released too, or leave both empty.` (or Kept); fractional, negative and non-numeric counts get guidance such as `Released needs a whole number, 0 or more.`. Correcting the field clears its error. An untouched empty pair shows `Not recorded. Leave both empty if you didn't count.` without an error. Save and Drop again still refuse invalid or one-sided counts, focus the first refused box and store nothing. The blur, both-empty, geometry and reload proof belongs to `e2e/collect-and-catch.test.ts`; the bounded collecting recipe below exercises the normal saved-count path.
- `collected-list`: Gear shows `N in the water` and `N collected` under the title and a `Collected` region whose rows read `2 kept, 1 released`, `Nothing caught` or `Catch not recorded`.
- `drop-again`: the latest collected drop of a gear offers `Drop pot again here` (or net). It saves the sheet's draft, then stores a new drop of the same gear (same name and number; label, bait and depth copied) at the current fix.
- `undo-collect`: Undo collect in the sheet footer clears `collectedAt` and the catch, and focus moves to Collect. When it clears a recorded catch the toast reads `{name} back in the water. Its recorded catch was cleared.`; otherwise `{name} back in the water`. Older drops of re-dropped gear show Delete drop instead. Drop again and Undo collect are offered and stored only while the gear has no drop in the water, so a gear is never in the water twice.

## How to get to it (user POV)

Place a pot, choose Gear in the bottom navigation and tap the pot's row. Collect is the large button at the top of the sheet. Collected gear moves to the Collected section of Gear; tap its row to edit the catch, drop it again or undo the collect.

## Driving it with Playwright

Run `bun scripts/verify-krab/run.ts` through the parent skill's bounded lifecycle. [collecting.ts](../../../../scripts/verify-krab/collecting.ts) owns the exact actions, assertions and evidence filenames.

Covers Collect, saving a catch, reload, dropping the same gear again and Undo collect, with persisted records checked at each transition. Catch validation, rapid input, toast lifetime and refused operations have the separate proof owners listed below.

## Gotchas

- Each count also has a visually hidden `<output>` (role `status`) reading `Kept: 2`, `Kept: not recorded`, `Kept: empty` or `Kept: not a whole number`; check the visible value with `toHaveValue` on the text box. Check toasts with `toastOf(page)` from `e2e/fixtures.ts` (the group inside the status region named `Messages`), which never matches a count.
- Emulated WebKit cannot show iOS double-tap zoom or the iPhone keypad. `e2e/collect-and-catch.test.ts` proves tap counts, `visualViewport.scale` 1 and unchanged geometry under emulation; the native gesture and keypad stay a device check.
- `Collect` needs `exact: true`; otherwise it also matches `Undo collect`.
- Counts start from not recorded: empty boxes; the status text is `Kept: not recorded`. The first `One more kept` gives `Kept: 1` and `Released: 0`.
- The 8-second toast lifetime and its retirement by a saved catch are proven in `e2e/undo.test.ts` with a paused clock and stored IndexedDB reads, not in this recipe. The repeat-tap convergence and the refusals (`InvalidCatch`, `NotCollected`, `DroppedAgain`, `CannotDropAgain`) belong to the trip module tests and have no reachable UI path to drive.
- Do not seed collected drops; collect through the sheet.
