# Krab verification map

Read this index before driving the app. These files are the maintained user-journey source for the verification skill.

## Baseline preconditions

- Run the parent skill from the repo root with a clean build, Docker and the pinned image available.
- Each entry point uses a fresh iPhone 17 WebKit browser context, empty site data and only made-up mid-ocean geolocation.
- Require doctor success before driving. Never reuse a user's app instance or profile.

## Driving conventions

Use accessible roles and names. Pair every action with its observable outcome and evidence. Capture action logs, screenshots, ARIA snapshots and read-only persisted state. Evidence survives cleanup under the evidence root: by default the gitignored `.scratch/on-water-workflow/verify-evidence/` in this checkout, outside `test-results/verify-krab-lock`. Report a blocked or skipped path with its missing precondition; another path does not verify it.

## Features

- [Placing a drop](placing-drop.md): fully driven from Map, including restoration, plus a drop with location denied and its Turn on location steps.
- [Drop details](drop-details.md): draft discard through Unsaved changes, refused depth, Save and reload, kind switch, Delete drop and Undo driven by `drop-details.ts`; the kind-locked refusal, restore order and an already-gone delete stay with the e2e and trip tests.
- [Finding gear](finding-gear.md): Map tab, gear sheets from the map, Show on map, Chart and Street and NOAA chart alignment driven by `finding-gear.ts`. The scrollable map credits Popover is proven by the credits tests in `e2e/chart-map.test.ts`.
- [Days and the Map filter](days-and-map-filter.md): overnight grouping, day markers, the Map filter and Show on map restoring hidden gear, driven by `days-and-filter.ts`.
- [Collecting](collecting.md): collect, catch, reload, drop again and undo collect fully driven by `collecting.ts`.
- [Compass](compass.md): chip hidden without an iPhone compass, and with a denying stub its 44 px target, denied path and no re-ask, driven by `compass.ts`; working-compass checks are manual on an iPhone.
- [Ending a trip](ending-trip.md): End trip with its confirmation, the stored end and the Past trips layer on the Map, driven by `end-and-past-trips.ts`.
- [Past trips](past-trips.md): list, trip detail with its map and gear sheets, reload and Delete trip, driven by `end-and-past-trips.ts`.
- Screen tabs: Map, Gear and Past trips are manual tabs; arrow keys move focus and Enter or Space opens a tab. Proven by "the screen tabs take one Tab stop…" in `e2e/chart-map.test.ts`. The Gear list keeps its scroll position while Map and Past trips are visited, by tap or by keyboard, proven by "the Gear list keeps where I scrolled it…" in `e2e/undo.test.ts`; that test does not check scroll on the other tabs.
- Dock messages: the Messages toast takes F6 and its Undo, Retry and Dismiss buttons as its only Tab stops, and is inert while a sheet or confirmation is open. Proven by "the Undo toast is out of reach behind a gear sheet…" in `e2e/undo.test.ts`.
- [Offline and wake lock](offline-and-wake-lock.md): offline open, next-launch update and optional wake lock driven by the e2e recipes; physical-device coverage follows the [device checklist](device-checks.md).

Exact selectors, clocks, assertions and artifact filenames belong to the linked executable recipes. Feature files describe intent, coverage and constraints when extending those recipes.
