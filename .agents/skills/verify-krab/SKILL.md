---
name: verify-krab
description: Drive Krab's built static web app with iPhone-emulated WebKit to verify user journeys, restore behavior, and capture persistent evidence.
---

# Verify Krab

Read [features/README.md](features/README.md), then the feature being verified. Run commands from the repository root. This harness uses Linux WebKit inside the pinned Playwright container. **WebKit on Linux is not iOS Safari.** Evidence proves app behavior under emulation; actual iOS permissions, sensors, compass, Home Screen installation, storage eviction and retention remain device checks. The stand-in supplies Ubuntu browser libraries and a preinstalled Linux WebKit from the image, bind-mounts the host build/dependencies, and uses the host UID/GID, `/tmp` HOME and host IPC. It does not prove provisioning a fresh Docker host/image or launching native WebKit on Arch, nor any setup or execution on a physical iPhone.

## Launch

Prerequisites: the Bun and Node versions in `package.json` and `.node-version`, Docker running, and the Playwright image already pulled: `mcr.microsoft.com/playwright:v<installed @playwright/test version>-noble`, resolved by `scripts/playwright-image.ts`. From a fresh checkout:

```sh
bun install --frozen-lockfile
bun run setup:security
bun scripts/verify-krab/run.ts
```

The executable helper reuses `scripts/e2e-container.ts`: build the static app once with `bun run build` (`--skip-next-build` skips `bun run build:next`, which only `e2e/offline-and-update.test.ts` needs), mount this checkout at `/work`, run as the host UID/GID, and use the checkout's dependencies. The custom Playwright config launches `vite preview --host 127.0.0.1 --port 4173 --strictPort`. The wrapper's readiness gate is the HTTP response from that preview; each recipe then waits for its own first UI state, such as the first-launch location explanation, before acting. Each journey starts with empty localStorage and IndexedDB in a fresh browser context. There is no account, backend, migration or seed step: Krab creates its IndexedDB schema on first use.

Launch, doctor, drive, evidence copy and cleanup are one bounded command. Success is every configured journey passing, exit 0, and `Evidence retained after cleanup: <absolute path>`. Build/test output is saved to `run.log` at that path.

Isolation: container network and fresh browser contexts isolate other checkouts. In one checkout, `test-results/verify-krab-lock` excludes another verification run. An occupied container preview port fails the run; Playwright never reuses another server. Avoid running another build in this checkout during verification.

## Doctor

The run first checks `docker info` and `docker image inspect` on that image without pulling or changing Docker. Before every journey, the read-only doctor in `scripts/verify-krab/doctor.ts` reads the preview PID receipt, `/proc/<pid>/cmdline`, its socket descriptors and TCP listener table. It requires that this run's strict-port Vite process owns the listener on 127.0.0.1:4173. A descriptor that closes during the scan is skipped; any other descriptor read failure fails the doctor, as `scripts/verify-krab/doctor.test.ts` checks. The auto `doctorReceipt` fixture of `test` and `testWithFixtureProviders` in `scripts/verify-krab/recipe.ts` runs it and writes `doctor.json` beside each journey's artifacts, so no recipe can skip it; `bun run lint` refuses a recipe that takes `test` from any other module.

While a run is active, invoke the same read-only checks from another terminal:

```sh
bun scripts/verify-krab/run.ts --doctor
```

This requires exactly one active container matching this checkout and the pinned image, then runs `node scripts/verify-krab/doctor.ts` inside it. It neither launches nor cleans up an instance. After the bounded run finishes there is intentionally no live instance to inspect. When anything looks off, run doctor first while the instance is still active; after inspecting and cleaning a failed run, relaunch with `bun scripts/verify-krab/run.ts`. A missing image, unreachable daemon, stale lock, foreign listener or failed readiness check is a blocker; report its exact output instead of driving a shared instance.

## Drive

[The journey config](../../../scripts/verify-krab.config.ts) selects the executable recipes; [the feature map](features/README.md) describes coverage and limitations. Invoke them through `bun scripts/verify-krab/run.ts` so build, Docker checks, evidence retention and teardown all run. The recipes use the iPhone WebKit project from [playwright.config.ts](../../../playwright.config.ts), grant geolocation, and supply only its fictional mid-ocean `MADE_UP_SEA` position. The chart alignment journey samples real NOAA tiles at named public landmarks without setting them as a position or drop, so it runs only under the wrapper.

Use the executable recipe's accessible roles and names when driving the documented journey. The screen tabs are manual tabs: a click opens one, but arrow keys only move focus and Enter or Space opens it, as "the screen tabs take one Tab stop…" in `e2e/chart-map.test.ts` proves. Drive real UI actions; use page evaluation for read-only observations of real browser IndexedDB and rendered evidence metadata. Never insert trip records or call component state setters to manufacture success.

For future permission/offline journeys in this recipe, use fresh contexts: `await context.clearPermissions()` denies location in this WebKit environment (it does not emulate an iOS prompt), `await context.grantPermissions(['geolocation'])` grants it, and `await context.setOffline(true)` / `await context.setOffline(false)` controls network access. The placing-drop recipe drives denied location with `clearPermissions()`; offline reload is not claimed by it. Add the owning ticket's observable requirements before treating them as verified. A missing precondition fails the journey; do not substitute a convenient path.

## Visual review preparation

For UI refactors, follow [visual-review.md](visual-review.md) for representative captures in both themes and two phone widths, baseline/candidate attribution, an evidence index and independent reviewer handoff. Run `bun scripts/verify-krab/run.ts --visual` in addition to the normal behavior pass. Both modes use the same bounded lifecycle and checkout lock.

## Evidence

Default persistent root:

`.scratch/on-water-workflow/verify-evidence/<timestamp>-<pid>/`, resolved from the repository root where the command runs. `.scratch/` is gitignored and lies outside `test-results/verify-krab-lock`, so the evidence survives cleanup inside the checkout.

Configure the parent directory before launch:

```sh
KRAB_VERIFY_EVIDENCE_ROOT=/absolute/ignored/evidence bun scripts/verify-krab/run.ts
```

Choose a gitignored location outside this run's scratch directory. Every artifact must contain only made-up coordinates, except the chart alignment journey's public-landmark tile samples in `alignment.json`; those landmarks are never a browser position or drop, and screenshots, IndexedDB snapshots and every other artifact still hold only made-up positions. Browser contexts never use host location. Do not attach real trip data or broaden this recipe to an existing browser profile.

Each journey records timestamped `actions.jsonl` and, through the auto `doctorReceipt` fixture, `doctor.json`. Each manual capture writes a PNG with matching `.aria.txt` and `.state.json` beside it. The other artifacts follow the claim each recipe makes:

| Claim                                           | Required artifacts                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A write is stored, survives reload or is undone | IndexedDB snapshots around the write, for example `indexeddb-before.json` and `indexeddb-after.json`, or a named snapshot such as `indexeddb-ended.json` |
| A refused or dismissed edit stores nothing      | A snapshot before the edit and an assertion that a later read equals it                                                                                  |
| A visual state only                             | The capture and its `.state.json`; a snapshot only when the recipe also reads the store                                                                  |
| NOAA chart alignment                            | `alignment.json` with the sampled tiles and landmarks                                                                                                    |
| Provider requests carry no position             | `requests.json`                                                                                                                                          |

Snapshots are read through the page from the real `krab` database's `trips` store in readonly transactions. The reader never creates or upgrades that database: it rejects when the database or its `trips` store is missing. Require the saved made-up fix and unchanged records after reload alongside the visible Pot 1 row; a toast or final screenshot alone is insufficient. Read each recipe for the snapshots it keeps. `run.log` records execution and failure output. The wrapper also retains `manifest.json`, `index.md` and, when Playwright starts, `artifacts/results.json`; manual screenshots have matching `.state.json` metadata and failed tests retain automatic failure screenshots. See [visual-review.md](visual-review.md) for attribution and review limits. On failure, keep partial evidence and report the failed action and unmet precondition. Do not claim another entry point's proof covers a skipped path.

## Cleanup

Playwright stops the preview process group it launched and closes its browser contexts. The existing Docker runner uses `--rm`. The wrapper copies artifacts out, removes only `test-results/verify-krab-lock`, and confirms the copied evidence directory still exists before returning. Confirm the named run directory contains screenshots, action logs, `doctor.json` per journey and each recipe's snapshots after exit.

Run no kill-by-name commands. After an interrupted wrapper, inspect `docker ps --filter volume="$PWD"` and the scratch receipt before acting. Stop only the container positively identified as this run's (matching checkout, command and launch time) with `docker stop <container-id>`. Copy `test-results/verify-krab-lock` to the chosen evidence root before removing that lock directory. If ownership is uncertain, report it and leave the process alone. Normal failed test iterations go through the same automatic cleanup as successful ones.

## Upkeep

The runner and its [journey config](../../../scripts/verify-krab.config.ts) own launch and recipe selection; [visual-review.md](visual-review.md) owns visual capture guidance. Playwright consumes the configs and recipes; for evidence, run the bounded wrapper rather than individual recipe files. Preview uses the image's Node because Bun is supplied by the host.

CI runs the same journey and visual recipes on every change through `bun run test:recipes`, with [its config](../../../scripts/verify-krab.fixtures.config.ts) answering NOAA and OpenFreeMap from the e2e `providers` fixture; `bun run test:recipes:container` runs it locally. That run retains no evidence and skips the NOAA alignment journey. Recipes import `test` from [recipe.ts](../../../scripts/verify-krab/recipe.ts); gate an assertion on `liveProviders` only when it needs real provider content, CORS or attribution, and cut off or serve `providers` around `context.setOffline` when it is present. Live provider behavior is proven only by the wrapper.

As features change, use `/maintain-verification-skill` in Claude Code or `$maintain-verification-skill` in Codex to reconcile the feature map and runnable recipes. Real-device coverage is recorded through the [device checklist](features/device-checks.md).
