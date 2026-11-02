# Agent instructions

## Code organization

- Organize application code by feature under `src/lib/features/<feature>/`, keeping each feature’s UI, logic, and private helpers together.
- Extract shared modules when multiple features need them.
- Keep framework routes thin; compose feature modules there.

## Agent skills

### Issue tracker

Track issues and specs locally under `.scratch/<feature>/`. Before creating, reading, or updating tickets, read `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. Before assigning or changing triage status, read `docs/agents/triage-labels.md`.

### Domain docs

Use a single-context layout: root `GLOSSARY.md` and `docs/adr/`. Before exploring the codebase, read `docs/agents/domain.md`.
