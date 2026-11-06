# Visual review captures

Use this capture mode when preparing or reviewing a UI refactor. Read [review-krab-ui](../review-krab-ui/SKILL.md) for the nine-category rubric and [its handoff](../review-krab-ui/handoff.md) for implementation and reviewer briefs. Capture the baseline before changing the UI, then capture the candidate with the same scenarios and variants.

```sh
bun scripts/verify-krab/run.ts --visual
```

This is a second bounded capture command, using the same build, doctor, lock, evidence retention and teardown as the normal command. Run them serially in a stable checkout. `--visual` selects `scripts/verify-krab.visual.config.ts` and the executable `scripts/verify-krab/visual-states.ts`. Playwright selection arguments are forwarded by the wrapper, for example:

```sh
bun scripts/verify-krab/run.ts --visual --project=phone-light --grep 'location denied'
```

A selected run covers only its selected journeys. The normal journey command remains the behavior and live-provider verification; visual captures supplement it.

## State coverage

[The visual config](../../../scripts/verify-krab.visual.config.ts) defines phone/narrow widths and light/dark variants. Narrow captures stress layout; they do not establish native browser zoom or text enlargement.

| Recipe                                                            | Coverage                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [visual-states.ts](../../../scripts/verify-krab/visual-states.ts) | First launch, position acquisition/denial, empty views, drops across midnight, dense Map/Gear, groups and members, details/validation, long labels, catch editing, collected gear, filters, ending and past-trip/delete states.                                                                                  |
| [ui-review.ts](../../../scripts/verify-krab/ui-review.ts)         | Live Chart/Street views and controls, compass unavailability, validation/long labels, contrast and axe observations, modal focus, CSS enlargement, newest-drop clearance during Undo/notices, single-drop switching, notice expiry, grouped gear, Show on map selection, filter Tab order and long catch counts. |

The recipes own exact state names, viewports, clock choices, assertions and supplemental evidence filenames. Records are created through the UI. Check each retained run's results and metadata for the states actually reached.

The inventory recipe uses the e2e provider fixture: placeholder tiles and blocked service workers make shell/control captures independent of provider availability. It does not establish real chart/street appearance, busy-map contrast, offline loading or update behavior. The supplemental recipe uses live providers and an unpaused clock. Neither wide maps nor open-ocean drops guarantee busy coastline imagery beneath markers; inspect retained PNGs before claiming that coverage.

Retained axe scans fail the journey on violations after saving JSON; incomplete results remain evidence gaps. CSS zoom is rendered enlargement. Screenshots show the reached scroll position; scroll long sheets/details in supplemental drives to inspect controls outside the frame. Add a concrete journey when a changed surface is absent. Loading captures include position acquisition, not every storage or network delay. Use the [device checklist](features/device-checks.md) for native keyboard, landscape, accessibility, permissions, sensors and installation behavior.

## Independent reviewer interaction

Shared captures are followed by each judge's own [independent interaction pass](../review-krab-ui/interaction.md). The coordinator schedules reviewers serially on one frozen candidate; each judge owns its bounded private session and reports actions, observations, follow-up and retained evidence before its first verdict. Reading or replaying coordinator results alone does not satisfy this pass. Native iPhone checks remain separate.

## Review package

Every wrapper run retains:

- `manifest.json`: source revision, dirty flag and SHA-256 source identity before/after capture, pinned browser image, mode, times and exit status. The identity hashes Git-tracked and nonignored untracked file paths/bytes; generated ignored build files are outside that identity. The wrapper exits unsuccessfully if the before/after identities differ. These endpoint samples cannot detect an edit restored between samples; a stable checkout is still required.
- `index.md`: links to actual retained screenshots, metadata, state evidence and logs. Visual inspection starts pending; each reviewer records the images they actually open in their own report.
- `artifacts/results.json`: Playwright's per-journey results, including project names and failures, when Playwright starts. Build/startup failures may leave only the manifest and `run.log`.
- Per manual capture, matching PNG, ARIA text and `.state.json`: scenario/state/project, browser version, actual viewport, theme, device pixel ratio and document/viewport widths. Capture waits for document fonts and disables animations for the screenshot. Toasts are captured intentionally, then the controlled clock expires them before dense-layout captures. These are rendered-state observations, not accessibility verdicts.
- Automatic failure screenshots, including when an assertion fails before the next manual capture. They may have no paired ARIA/state file; identify them through the failed result. Failure evidence survives the same cleanup as successful evidence.

Use matching state/project identities for baseline/candidate comparisons. The index is a navigation aid; reviewers open PNGs through their image-capable tools at sufficient resolution. Behavior assertions and screenshots never substitute for the visual rubric or interaction checks.

## Upkeep

When running `$maintain-verification-skill`, include this harness in reconciliation and re-drive any changed capture recipe. Check that it still reaches these user states and that changed product surfaces have representative evidence. Preserve baseline artifacts and explain selector/state adaptations in the handoff. Keep the rubric in review-krab-ui rather than duplicating it in feature files. Keep skill-owned helpers executable and document new invocation paths here.
