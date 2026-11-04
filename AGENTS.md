# Agent instructions

## Code organization

- Organize application code by feature under `src/lib/features/<feature>/`, keeping each feature’s UI, logic, and private helpers together.
- Extract shared modules when multiple features need them.
- Keep framework routes thin; compose feature modules there.

## Rules

| Rule                                                                                                                                                                                                                 | Enforced by                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New maintained language or container surfaces accept legitimate data and reject comments through the existing policy owner: extend `scripts/policy.test.ts` rather than adding another policy suite.                 | `bun run test:policy` and `bun run lint` (`scripts/check-comments.ts`), both in CI                                                                                                                                                                                                                                                                                                                                               |
| Claimed independent contracts get sensitive proof at their primary boundary. UI timing such as Undo lifetime and holds is proven through the real toast with a controlled clock, without test-only production seams. | Undo lifetime and holds, and Retry/Dismiss persistence and dispatch: `e2e/undo.test.ts` under `bun run test:e2e` (CI) and `bun run test:e2e:container`. Compass sensor listening while visible and its permission outcomes: `src/lib/features/compass/sensor.test.ts` under `bun run test:unit` (CI); the real iPhone prompt and sensor delivery stay a manual device check. Other contracts: review applies the test-audit gate |
| Replaying a failed drop's Retry converges to one drop and one gear allocation.                                                                                                                                       | "replaying its Retry saves that drop once under one number" in `src/lib/features/trip/trip.test.ts` under `bun run test:unit` (CI)                                                                                                                                                                                                                                                                                               |
| Location acquisition and displayed readiness use one availability policy (`src/lib/features/trip/availability.ts`), including expiry and denial.                                                                     | "uses a fix exactly 5 s old" and "denied, even over a fresh fix" in `src/lib/features/trip/trip.test.ts` under `bun run test:unit` (CI); "Position ready lasts 5 seconds" in `e2e/position-problems.test.ts` under `bun run test:e2e` (CI) and `bun run test:e2e:container`                                                                                                                                                      |
| A drop Save stores its details, catch and kind together, or stores nothing.                                                                                                                                          | "a Save whose kind is locked because the gear was dropped again stores none of its details" in `src/lib/features/trip/trip.test.ts` under `bun run test:unit` (CI)                                                                                                                                                                                                                                                               |
| E2e suites answer NOAA and OpenFreeMap through the auto `providers` fixture in `e2e/fixtures.ts`; live provider checks stay in verify-krab.                                                                          | `no-restricted-imports` on `test` from `@playwright/test` in `e2e/**/*.test.ts` under `bun run lint` (CI)                                                                                                                                                                                                                                                                                                                        |
| Both base maps keep drop and position data on the phone: Chart and Street provider requests carry no position.                                                                                                       | "asks NOAA only for fixed-grid tiles" and "send no position to OpenFreeMap" in `e2e/chart-map.test.ts` under `bun run test:e2e` (CI) and `bun run test:e2e:container`                                                                                                                                                                                                                                                            |

## Agent skills

### Issue tracker

Track issues and specs locally under `.scratch/<feature>/`. Before creating, reading, or updating tickets, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. Before assigning or changing triage status, read `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`. Before exploring the codebase, read `docs/agents/domain.md`.
