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

Each of four variants runs the same two inventory journeys and the supplemental `ui-review.ts` journey: `phone-light`, `phone-dark` at 393 × 852 CSS pixels and `narrow-light`, `narrow-dark` at 320 × 640. They retain iPhone WebKit emulation; the narrow variant is a layout stress case, not a claim about a particular device or browser zoom.

The main journey uses a controlled New York clock and real UI actions to reach first-launch explanation, finding/getting position, empty Gear/Map/Past trips, drop toast, eight drops across midnight, dense Map and Gear, a zoomed-out group holding Day 1 and Day 2 gear and its member list, a gear sheet, invalid depth, a saved long label, catch editing (not recorded, stepped, rapid taps with typed multi-digit counts, a refused blank count, Nothing caught), collected gear, multi-day Map filter, end confirmation, past-trip list/detail, and delete confirmation. The separate denied journey reaches location guidance, a drop without position and its Gear row. Records are created through the UI, never by seeding IndexedDB.

The visual suite uses the existing e2e provider fixture, which supplies placeholder tiles and blocks service workers. This makes shell/control captures independent of provider availability. It **does not establish real chart/street appearance, busy-map contrast, offline loading or update behavior**. Inspect the normal run's live-provider evidence for the maps and run the offline/wake-lock recipes in the feature map when relevant. Add a concrete supplemental journey when a changed surface is absent; loading capture currently covers location acquisition, not every storage or network delay.

The dense list includes separate captures near its top and collected section. Other captures show the viewport at the reached scroll position. Scroll through long sheets/details in supplemental drives when reviewing controls outside those captures. Native virtual keyboards, landscape, browser zoom/text enlargement and physical iPhone behavior require additional checks.

The supplemental journey uses Playwright's base test with live providers and an unpaused clock. It creates eight drops through the UI at fictional mid-ocean positions, captures dense and wide Chart/Street views, compass unavailability, validation and saved long labels, and retains axe results plus modal Tab containment/restoration observations. Each retained axe scan (dense map, group of 8, invalid depth, denied Gear row) fails its journey on any violation after the JSON is kept; incomplete results stay in the JSON for review and are not treated as approval. Its CSS zoom capture is rendered enlargement, not native browser zoom or iPhone text sizing. Wide maps and open-ocean drops do not guarantee busy coastline imagery beneath markers; inspect the retained PNGs before claiming that coverage. The denied inventory also captures expanded recovery steps and the post-toast row. Validation captures assert the full field and guidance fit inside the sheet body. The Street controls journey keeps per-control close-ups (`<state>-control-N.png`, boxes in `<state>-controls.json`) for its immediate, settled and after-pan states, so glyph presence can be judged at native pixels. The newest-drop journey drops Pot 2 offline on Street, at 320 × 640 on narrow variants and 402 × 681 on phone variants. While the Undo toast and Offline notice both show, it captures the map and asserts that Pot 2's marker and time label stay clear of the toast, notice and credits, and that its tap area hit-tests to it. After the toast expires it captures again and asserts the marker has not moved. The single-drop journey starts a fresh page at the same sizes, drops Pot 1 on Chart and switches to Street while Undo shows; on Chart, right away on Street and once settled it asserts Pot 1's marker and time label stay clear of the toast and credits with its tap area hitting it, and that it has not moved once Undo expires. The Street controls journey's 402 × 681 frames follow its own drag at 393 × 852, so their camera is kept from that pan and is not a fresh newest-drop transition; `street-controls.json` records which. The Trip ended journey runs on the real clock and asserts the notice leaves on its own between 3 and 6 s.

The six-in-a-line journey runs at the variant's size and theme: 393 × 852, or 320 × 640 on narrow variants. It drops five pots and then a net through the UI, each 0.0012° N and 0.0004° E of the last. It captures `six-1` to `six-6`: during Undo, settled, zoomed in, back, further out and after Show all gear. At each capture it asserts that every drop is drawn once, alone or in a group, with no empty marker (`six-in-a-line.json`).

It then uses Show on map for Pot 3 and captures `selected-1` (focused) and `selected-2` (after Tab, still ringed). It drops Pot 6 at Pot 1's spot and captures `selected-3`, the ringed group led by Pot 6. A keyboard pan clears the ring, captured as `selected-4` (`show-on-map-selection.json`).

Next it walks Tab through the Map filter sheet from its initial Close focus (`filter-sheet-tab-order.json`). Last, it collects Pot 2 with Released 12345 and checks it in `catch-1` (blurred) and `catch-2` (reopened). It asserts that the count fits its box, the font stays at 16 px or more, the box and steppers do not move, and the stored catch is `{ kept: 0, released: 12345 }` (`five-digit-count.json`).

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
