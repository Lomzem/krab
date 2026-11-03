# Collecting

Record taking gear out of the water and its catch. This is a placeholder; ticket 05 will fill this feature file.

## Sub-features

- Journey and proof requirements pending ticket 05.

## How to get to it (user POV)

Choose Gear after placing a pot.

## Driving it with Playwright

Preconditions: launch and doctor from the parent skill; fresh context. The list is reachable, but its rows have no collect action yet.

Use `await page.getByRole('button', { name: 'Gear', exact: true }).click()` to reach Gear, or `await page.getByRole('button', { name: 'Past trips', exact: true }).click()` to reach Past trips. These are navigation checks only. The full feature is blocked on ticket 05; report it as unverified. Its owner must add exact actions, resulting state and evidence before claiming coverage.

## Gotchas

- A reachable placeholder does not prove the planned workflow.
- Do not seed internal state to bypass the missing feature or weaken the journey to pass.
