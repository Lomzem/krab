# Independent interaction pass

Every judge completes image review and its own app interaction before its first verdict. Use the same frozen candidate and shared evidence, but separate fictional data and reviewer-owned recipes. Reading or replaying the coordinator's scripts alone does not count as independent exploration.

## Exclusive session

The coordinator releases implementation/build ownership, freezes the candidate and captures the shared normal/visual evidence first. It then dispatches the three fresh reviewer tasks sequentially. Each judge owns app driving/builds only during its slot; the next starts after the bounded runs exit, containers/lock are gone, and the coordinator confirms the source identity is unchanged. A product change invalidates the round.

Keep product code, shared capture contracts/evidence and other reports read-only. Write only:

- `.scratch/ui-review-sessions/round-NN/JUDGE/` in the checkout for private ignored recipes/configs;
- your assigned durable interaction evidence directory outside disposable worktrees;
- your standalone report.

Use the [verify-krab lifecycle](../verify-krab/SKILL.md): existing lock, strict-port ownership doctor, pinned Docker image, fresh browser contexts, retention and cleanup. No shared user profile, real coordinates, seeded records, state setters or out-of-band app APIs. Drive real UI with fictional positions. No extra agents or delegation.

## Bounded launch

From the repository root, create `review.config.ts` in the private four-level directory above:

```ts
import { defineConfig } from '@playwright/test';
import base from '../../../../scripts/verify-krab.config';
import { resolve } from 'node:path';

export default defineConfig({
  ...base,
  testDir: resolve('.scratch/ui-review-sessions/round-NN/JUDGE'),
  testMatch: '*.review.ts',
  outputDir: resolve('test-results/verify-krab-lock/artifacts'),
  workers: 1,
  retries: 0
});
```

Write your own `*.review.ts` scenarios there. Import Playwright's base test, `doctor`, `recorder`, `readTrips` and `MADE_UP_SEA` through the corresponding paths. Preserve the inherited strict server, result/report paths, screenshot-on-failure and teardown. The runner forwards the final config override:

```sh
KRAB_VERIFY_EVIDENCE_ROOT=/absolute/durable/round-NN/JUDGE-interaction bun scripts/verify-krab/run.ts --config .scratch/ui-review-sessions/round-NN/JUDGE/review.config.ts
```

Before the first round using this path, the coordinator smoke-tests real UI action/capture and cleanup through it. A `--list` probe alone proves only recipe selection.

Use the recorder for timestamped actions, full-frame PNGs with ARIA/state companions, and doctor output before driving. Retain recipe/config copies and SHA-256 values with each run so ignored scripts remain auditable. Read actual IndexedDB only in readonly transactions when claiming persistence. Keep failed runs and logs as well as successful runs. Never edit a recipe during its run; an adaptive follow-up run gets its own recorded recipe identity. The app-source manifest must remain the frozen identity throughout.

## Explore independently

Create each scenario in a fresh context/site store. Choose your own concrete tasks and expectations within these common workflows, then follow at least one question prompted by observing the app:

- Drop, find/open, collect, type catch counts, rapidly use plus/minus, correct an invalid value, and check Save/reopen or cancel. Observe controls/sheet geometry as well as values.
- Find grouped gear, choose a non-leading member, use Show on map, change a filter and deliberately pan/recenter. Assess identities, day/status and control clarity.
- Use Undo and a modal's keyboard/close/focus path. Explore a recovery or edge state you choose, such as denied location, invalid catch, long saved labels or a map notice.
- Inspect both themes and exercise the narrow viewport during the pass.

Iterate private recipes, inspect actual resulting PNGs, and choose follow-up actions before the first verdict. Record actions, expectations, observed results, friction and follow-up. A failed prerequisite stays a failure; do not substitute a convenient path. Request unavailable states/device checks from the coordinator with route, conditions, action and expected observation.

Linux WebKit is not iOS Safari. Emulated taps, viewport scale and target geometry do not prove native double-tap, pinch, virtual keyboard, VoiceOver/Dynamic Type, permission/sensor, installation/storage or glare behavior. Keep those device limits separate.

## Evidence and verdict gate

The report is incomplete until both image review and this interaction pass are done. Include:

- app source before/after, recipe/config identities, exact commands and durable run paths;
- environment, viewport/theme, actual actions/expectations/results, errors and self-chosen follow-up;
- screenshots actually opened, action logs, persistence reads where claimed, and unavailable/device checks;
- all nine rubric dispositions plus interaction findings, incorporated into the overall judgment and any user-requested score.

Distinguish your interactions from retained coordinator checks and visual observations. A material usability/accessibility defect or missing required interaction evidence cannot be approved. An unavailable environment is an evidence blocker, not an automatic pass. Keep first verdicts independent of other judges, prior scores and implementation feedback. Only the same candidate and same round can satisfy the user's completion gate; a new candidate needs entirely fresh judges and new interaction evidence.
