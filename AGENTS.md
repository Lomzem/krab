# Agent instructions

## Code organization

- Organize application code by feature under `src/lib/features/<feature>/`, keeping each feature’s UI, logic, and private helpers together.
- Extract shared modules when multiple features need them.
- Keep framework routes thin; compose feature modules there.

## Rules

| Rule                                                                                                                                                                                                                 | Enforced by                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| New maintained language or container surfaces accept legitimate data and reject comments through the existing policy owner: extend `scripts/policy.test.ts` rather than adding another policy suite.                 | `bun run test:policy` and `bun run lint` (`scripts/check-comments.ts`), both in CI                                    |
| Claimed independent contracts get sensitive proof at their primary boundary. UI timing such as Undo lifetime and holds is proven through the real toast with a controlled clock, without test-only production seams. | `e2e/undo.test.ts` under `bun run test:e2e` (CI) and `bun run test:e2e:container`; review applies the test-audit gate |

## Agent skills

### Issue tracker

Track issues and specs locally under `.scratch/<feature>/`. Before creating, reading, or updating tickets, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. Before assigning or changing triage status, read `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`. Before exploring the codebase, read `docs/agents/domain.md`.
