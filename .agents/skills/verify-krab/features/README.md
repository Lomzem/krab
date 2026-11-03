# Krab verification map

Read this index before driving the app. These files are the maintained user-journey source for the verification skill.

## Baseline preconditions

- Run the parent skill from the repo root with a clean build, Docker and the pinned image available.
- Each entry point uses a fresh iPhone 17 WebKit browser context, empty site data and only made-up mid-ocean geolocation.
- Require doctor success before driving. Never reuse a user's app instance or profile.

## Driving conventions

Use accessible roles and names. Pair every action with its observable outcome and evidence. Capture action logs, screenshots, ARIA snapshots and read-only persisted state. Evidence survives cleanup outside the worktree. Report a blocked or skipped path with its missing precondition; another path does not verify it.

## Feature entry contract

Each file has a user-facing introduction and exactly four H2s: Sub-features, How to get to it (user POV), Driving it with Playwright, Gotchas. Later tickets replace their placeholders with reachable journeys and evidence requirements.

## Features

- [Placing a drop](placing-drop.md): fully driven from both Map and Gear, including restoration, plus a drop with location denied.
- [Drop details](drop-details.md): journey mapped for ticket 04; not yet driven by the bounded recipe.
- [Finding gear](finding-gear.md): Gear list reachable; tickets 06/08 own map and finding gear.
- [Collecting](collecting.md): placeholder owned by ticket 05.
- [Ending a trip](ending-trip.md): placeholder owned by ticket 09.
- [Past trips](past-trips.md): empty tab reachable; ticket 09 owns the workflow.
- [Offline and wake lock](offline-and-wake-lock.md): offline open, next-launch update and optional wake lock driven by the e2e recipes; device checks remain for ticket 11.
