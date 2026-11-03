# Finding gear

Find gear still in the water using its list and, later, its map location. This is a placeholder; ticket 06/08 will fill this feature file.

## Sub-features

- Journey and proof requirements pending ticket 06/08.

## How to get to it (user POV)

Choose Gear in the bottom navigation. Map is also reachable but currently displays a placeholder.

## Driving it with Playwright

Preconditions: launch and doctor from the parent skill; fresh context. Gear lists Pot 1 after the placing-drop recipe, with distance and direction. There is no map or dedicated finding workflow yet.

Use `await page.getByRole('button', { name: 'Gear', exact: true }).click()` to reach Gear, or `await page.getByRole('button', { name: 'Past trips', exact: true }).click()` to reach Past trips. These are navigation checks only. The full feature is blocked on ticket 06/08; report it as unverified. Its owner must add exact actions, resulting state and evidence before claiming coverage.

## Gotchas

- A reachable placeholder does not prove the planned workflow.
- Do not seed internal state to bypass the missing feature or weaken the journey to pass.
