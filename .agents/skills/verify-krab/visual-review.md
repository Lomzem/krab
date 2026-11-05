# Visual review captures

Use this capture mode when preparing or reviewing a UI refactor. Read [review-krab-ui](../review-krab-ui/SKILL.md) for the nine-category rubric and [its handoff](../review-krab-ui/handoff.md) for implementation and reviewer briefs. Capture the baseline before changing the UI, then capture the candidate with the same scenarios and variants.

```sh
bun scripts/verify-krab/run.ts --visual
```

This is a second bounded capture command, using the same build, doctor, lock, evidence retention and teardown as the normal command. Run them serially in a stable checkout. `--visual` selects `scripts/verify-krab.visual.config.ts` and the executable `scripts/verify-krab/visual-states.ts`. Playwright selection arguments are forwarded by the wrapper, for example:

```sh
bun scripts/verify-krab/run.ts --visual --project=phone-light --grep 'location denied'
```

A selected run covers only its selected journeys. The normal eleven-journey command remains the behavior and live-provider verification; visual captures supplement it.

## State coverage

Each of four variants runs the same two journeys: `phone-light`, `phone-dark` at 393 × 852 CSS pixels and `narrow-light`, `narrow-dark` at 320 × 640. They retain iPhone WebKit emulation; the narrow variant is a layout stress case, not a claim about a particular device or browser zoom.

The main journey uses a controlled New York clock and real UI actions to reach first-launch explanation, finding/getting position, empty Gear/Map/Past trips, drop toast, eight drops across midnight, dense Map and Gear, a gear sheet, invalid depth, a saved long label, catch editing, collected gear, multi-day Map filter, end confirmation, past-trip list/detail, and delete confirmation. The separate denied journey reaches location guidance, a drop without position and its Gear row. Records are created through the UI, never by seeding IndexedDB.

The visual suite uses the existing e2e provider fixture, which supplies placeholder tiles and blocks service workers. This makes shell/control captures independent of provider availability. It **does not establish real chart/street appearance, busy-map contrast, offline loading or update behavior**. Inspect the normal run's live-provider evidence for the maps and run the offline/wake-lock recipes in the feature map when relevant. Add a concrete supplemental journey when a changed surface is absent; loading capture currently covers location acquisition, not every storage or network delay.

The dense list includes separate captures near its top and collected section. Other captures show the viewport at the reached scroll position. Scroll through long sheets/details in supplemental drives when reviewing controls outside those captures. Native virtual keyboards, landscape, browser zoom/text enlargement and physical iPhone behavior require additional checks.

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
