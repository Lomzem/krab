# Prepare a Krab UI refactor review

Choose reviewers and the completion gate for the task, following the user's model preferences and repository ownership rules. Each reviewer uses the same [review skill](SKILL.md). This handoff describes preparation; execute delegation only within the task's authorized scope.

## Coordinator sequence

1. Record the approved design intent, scope, preserved user journeys and acceptance criteria. Capture the unchanged baseline before implementation. Keep its retained evidence directory outside any checkout that will be removed.
2. Follow [verify-krab](../verify-krab/SKILL.md). Run the normal behavior command and `bun scripts/verify-krab/run.ts --visual` serially in a stable checkout. Retain both evidence directories and note any existing failures. These commands serve different purposes: behavior proof and representative visual states.
3. Give the implementation owner the brief below, the baseline paths and the approved design intent. The owner may read the review rubric to anticipate the acceptance criteria. Preserve the baseline and capture contract; if a changed UI requires new selectors or scenarios, explain the adaptation and retain comparable user states.
4. After implementation reaches a stable source state, rerun both commands serially. Inspect the retained candidate `index.md`, `manifest.json` and `artifacts/results.json`; resolve failed captures or name their blockers. Keep baseline and candidate conditions matched. Differences in time, map-provider content or unsupported states must be reported rather than treated as design changes.
5. Give each reviewer the same immutable evidence directories and reviewer brief. Start independent reviews using the permitted delegation tools. Each reviewer completes image review and its own [independent interaction pass](interaction.md). Dispatch the reviewer tasks sequentially so each owns an exclusive app/build slot; verify source identity and cleanup before starting the next. Keep first verdicts independent of other reviewers' conclusions, including when earlier reports already exist. If a requested model or vision tool is unavailable, report the limitation and use the operator's next direction rather than substituting silently.
6. Collect all first reports before sharing their conclusions. Deduplicate findings by underlying problem while retaining material disagreements. Reproduce disputed interaction defects and capture requested missing states. Route production/UI fixes to the implementation owner, then capture the affected states again. Record which findings and review coverage must be reassessed against the new source identity; apply the task's completion gate to that candidate.
7. Hand back the final revision, evidence paths, reviewer reports, resolved and unresolved findings, behavior results and remaining device checks. A visually approved package does not replace the repository's required checks. Shipping requires its own authorization and PR workflow.

## Implementation brief

Fill in the bracketed inputs before dispatch:

> Implement the approved Krab UI refactor within [scope] using [design intent and acceptance criteria]. Read AGENTS.md, the applicable engineering principles, `.agents/skills/verify-krab/SKILL.md` and `.agents/skills/review-krab-ui/SKILL.md`. Baseline behavior evidence: [path]. Baseline visual evidence: [path]. Preserve [user-facing contracts] and phone-local data behavior. Use the nine-category rubric to check your work. Coordinate capture and builds with [coordinator]; the shared checkout must remain stable during each run. Return changed files, decisions, checks and terminal results, evidence for the implemented revision, known gaps and remaining work. Request explicit clarification when a design choice exceeds the approved scope. Do not delegate further unless the coordinator authorizes it.

## Reviewer brief

Send this unchanged to each reviewer after filling the inputs:

> Review [candidate revision/source identity] against [design intent and scope] using `.agents/skills/review-krab-ui/SKILL.md`. Baseline behavior evidence: [path]. Baseline visual evidence: [path]. Candidate behavior evidence: [path]. Candidate visual evidence: [path]. Open the actual screenshots using your image-capable tool and record their paths. Apply all nine rubric categories independently and return the skill's completion contract. Complete your own independent interaction pass using interaction.md during your exclusive slot. Product code, shared capture scripts/evidence and other reports are read-only; write only your private ignored recipes, retained interaction artifacts and report. Include commands, source/recipe identities, actual actions/results and follow-up exploration before scoring. Send unavailable-state or physical-device requests to [coordinator] with the required route and conditions. Report unavailable image access or missing evidence explicitly. Keep your first conclusions independent of other reviewers. Return your report to the coordinator; do not delegate further.

## Maintaining this preparation

Use `$maintain-verification-skill` when user-facing changes affect the feature map or capture recipes. During its source reconciliation and live pass, include the visual-state recipe and check whether it still reaches its documented user states. A redesigned route can require recipe maintenance; an unchanged contract that the app breaks remains a product finding. Keep the review rubric here as its single source of truth.
