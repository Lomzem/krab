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
- [Drop details](drop-details.md): driven by `drop-details.ts`, except the kind-locked refusal.
- [Finding gear](finding-gear.md): Map tab, gear sheets from the map, Show on map, street toggle and NOAA chart alignment driven by `finding-gear.ts`.
- [Days and the Map filter](days-and-map-filter.md): overnight grouping, day markers, the Map filter and Show on map restoring hidden gear, driven by `days-and-filter.ts`.
- [Collecting](collecting.md): collect, catch, reload, drop again and undo collect fully driven by `collecting.ts`.
- [Compass](compass.md): toggle, 44 px target, unavailable path and no re-ask driven by `compass.ts`; working-compass checks are manual on an iPhone.
- [Ending a trip](ending-trip.md): End trip with its confirmation, the stored end and the Past trips layer on the Map, driven by `end-and-past-trips.ts`.
- [Past trips](past-trips.md): list, trip detail with its map and gear sheets, reload and Delete trip, driven by `end-and-past-trips.ts`.
- [Offline and wake lock](offline-and-wake-lock.md): offline open, next-launch update and optional wake lock driven by the e2e recipes; device checks remain for ticket 11.
