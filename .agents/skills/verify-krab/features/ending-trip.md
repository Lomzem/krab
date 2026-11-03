# Ending a trip

Finish the active trip while retaining its records on the phone. This is a placeholder; ticket 09 will fill this feature file.

## Sub-features

- Journey and proof requirements pending ticket 09.

## How to get to it (user POV)

Open Krab and place a pot to start an active trip.

## Driving it with Playwright

Preconditions: launch and doctor from the parent skill; fresh context. An active trip can be created, but there is no end-trip control yet.

Use `await page.getByRole('button', { name: 'Gear', exact: true }).click()` to reach Gear, or `await page.getByRole('button', { name: 'Past trips', exact: true }).click()` to reach Past trips. These are navigation checks only. The full feature is blocked on ticket 09; report it as unverified. Its owner must add exact actions, resulting state and evidence before claiming coverage.

## Gotchas

- A reachable placeholder does not prove the planned workflow.
- Do not seed internal state to bypass the missing feature or weaken the journey to pass.
