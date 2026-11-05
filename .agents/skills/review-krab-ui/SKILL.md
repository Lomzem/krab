---
name: review-krab-ui
description: Review Krab UI changes from retained visual evidence and direct interaction checks; use when assessing a redesign or preparing its reviewers.
---

# Review Krab UI

Review the interface as a person recording and finding crabbing gear on a phone. Use [the glossary](../../../GLOSSARY.md) for domain language. For team setup and ready-to-use briefs, read [handoff.md](handoff.md).

## Establish the evidence

1. Read the supplied design intent, changed-file scope, and baseline and candidate evidence directories. Open each run's `index.md`, `manifest.json`, and `artifacts/results.json`. Confirm the candidate identifies the source being reviewed; flag a source change during capture. Record any dirty-tree identity, failed journeys, missing states, or differing capture conditions before drawing comparisons.
2. Open the actual PNGs with an image-capable tool. An index, accessibility snapshot, source reading, or another reviewer's description does not constitute visual inspection. Compare matching state and variant names, viewport sizes, and themes. Keep a list of the exact image paths inspected. Read text-heavy screens at their original resolution when needed.
3. Apply every rubric row below across the inspected states. Assess the candidate both against the stated intent and on its own. A baseline defect can remain a candidate defect; an intentional change can improve the interface despite differing from the baseline. Separate an observed usability problem from a preference.
4. Consult ARIA snapshots, action logs, and stored-state evidence for context. When a conclusion needs interaction or a missing screen, request a concrete supplemental check from the coordinator: state, entry route, viewport/theme, action, and expected observation. Mark that conclusion pending until its evidence arrives.
5. Report findings, rubric coverage, inspected paths, checks actually performed, and limitations using the completion contract below. A failed journey still permits review of its retained images, with that coverage limit stated.

Completion requires an explicit disposition for all nine categories and every supplied state/variant: inspected, not inspected with reason, or unavailable with its prerequisite. For a large package, work in batches and retain the coverage ledger between batches.

## Rubric

| Category               | Inspect and explain                                                                                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography             | Legibility at phone size; type scale, weight and line height; wrapping and truncation of labels, counts, distances and long content; whether emphasis helps scanning.                                                            |
| Hierarchy              | Whether the current task, primary action and important gear state are apparent; competing headings, actions and map overlays; sheet and page relationships.                                                                      |
| Spacing and density    | Grouping, alignment and rhythm; usable control separation; crowded versus wasteful areas; long lists, multi-day content, narrow viewports and sheet scrolling.                                                                   |
| Color and contrast     | Text, control and state distinction in each supplied theme; busy map backgrounds; reliance on color alone. Treat screenshot impressions as observations and measured ratios as separate evidence.                                |
| Iconography            | Recognizability, consistent size and stroke, alignment and meaning; ambiguous or unlabeled actions; direction, day and gear symbols; target size independent of icon size.                                                       |
| Consistency and polish | Shared control treatments and spacing; repeated states across Map, Gear and sheets; borders, radii and overlays; accidental clipping, overlap, misalignment and inconsistent wording.                                            |
| Clarity                | Whether action labels, field units, status, errors, empty states and confirmations explain what happens; saving versus saved; reversible versus destructive actions; domain vocabulary.                                          |
| Accessibility          | Visible focus, readable text, non-color cues and apparent target separation. Separately verify keyboard operation, focus order/restoration, accessible names, measured contrast, and zoom/reflow when claiming those properties. |
| Overall                | Whether the screens form one coherent, usable tool; whether a person can quickly drop, find, collect and understand gear; consequential tradeoffs and the highest-impact remaining problem.                                      |

## Evidence limits and supplemental checks

The coordinator follows [verify-krab](../verify-krab/SKILL.md) for capture, doctor, isolation, evidence retention and cleanup. One coordinator drives serially; reviewers read the retained package independently. Additional exploration needs a coordinator-owned isolated session with a documented launch and cleanup path. The bounded verification command leaves no running browser to share.

Screenshots show captured appearance. They do not establish keyboard behavior, screen-reader announcements, focus movement, touch accuracy, contrast ratios, browser zoom, reduced-motion behavior, or an error's recovery. For each relevant interaction claim, name the command or manual procedure actually performed and its result. An accessibility scan is useful evidence within its scope, not a complete accessibility verdict.

Narrow viewport captures exercise layout width; they do not prove browser zoom or text enlargement. Linux WebKit emulation does not establish real iOS permissions, sensors, compass, virtual-keyboard behavior, Home Screen installation or storage retention. Record outstanding device checks explicitly.

## Completion contract

Return a standalone report containing:

- **Source and coverage:** candidate revision/source identity; baseline identity when supplied; exact image paths opened; supplied states/variants not inspected and why; journey failures and supplemental checks still pending.
- **Findings:** ordered by user impact. Each has a category, severity, state/variant and screenshot path, the concrete observation, its consequence for the person using Krab, and a suggested direction. Add source locations only when inspected; include reproduction steps for interaction defects. Label subjective suggestions as such. Group duplicate symptoms under their shared problem.
- **Rubric disposition:** all nine categories marked `finding`, `no issue observed in inspected evidence`, or `insufficient evidence`, with a brief explanation. Use no numeric scores.
- **Interaction evidence:** checks actually run and their results, followed by checks still needed. Keep these distinct from visual observations.
- **Overall judgment:** ready for the stated scope, needs changes, or incomplete, with the reasons and remaining device limitations.

Example finding: “Spacing and density · major · narrow-dark / invalid-depth · `<image path>`: the validation message overlaps Save, hiding the action needed to recover. Reserve space for wrapped validation text and keep the sheet actions reachable.” Report this only if the opened image shows it.

Reviewers are read-only. Preserve the package and deliver findings to the coordinator; the implementation owner makes fixes. Each reviewer completes an independent first report before seeing the others' conclusions.
