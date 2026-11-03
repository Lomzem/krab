# Past trips

Reopen a trip that has ended and review its drops. This is a placeholder; ticket 09 will fill this feature file.

## Sub-features

- Journey and proof requirements pending ticket 09.

## How to get to it (user POV)

Choose Past trips in the bottom navigation.

## Driving it with Playwright

Preconditions: launch and doctor from the parent skill; fresh context. The Past trips heading and No past trips yet. empty state are reachable; there is no ended-trip workflow yet.

Use `await page.getByRole('button', { name: 'Gear', exact: true }).click()` to reach Gear, or `await page.getByRole('button', { name: 'Past trips', exact: true }).click()` to reach Past trips. These are navigation checks only. The full feature is blocked on ticket 09; report it as unverified. Its owner must add exact actions, resulting state and evidence before claiming coverage.

## Gotchas

- A reachable placeholder does not prove the planned workflow.
- Do not seed internal state to bypass the missing feature or weaken the journey to pass.
