# CI and manual reviews

## GitHub Actions

`.github/workflows/ci.yml` runs on push, pull request, or manual dispatch using `ubuntu-24.04`, a 20-minute timeout, and `contents: read`. It does not deploy. Checkout fetches all branch/tag history (`fetch-depth: 0`) and disables persisted credentials. The history scanner rejects shallow clones and scans all fetched refs; it cannot inspect unfetched history. The staged scan is normally empty in CI; the existing security scenario proves index behavior.

Action pins checked against official release tags and dereferenced Git objects on 2026-11-02:

| Action                                                                  | Release | Immutable commit                           |
| ----------------------------------------------------------------------- | ------- | ------------------------------------------ |
| [checkout](https://github.com/actions/checkout/releases/tag/v7.0.1)     | 7.0.1   | `3d3c42e5aac5ba805825da76410c181273ba90b1` |
| [setup-node](https://github.com/actions/setup-node/releases/tag/v7.1.0) | 7.1.0   | `949feb2413d6458794dcd2491c4babbbce0c15c1` |
| [setup-bun](https://github.com/oven-sh/setup-bun/releases/tag/v2.2.0)   | 2.2.0   | `0c5077e51419868618aeaa5fe8019c62421857d6` |

These Actions use Node 24 internally and require a compatible runner (checkout/setup-node document >=2.327.1); the hosted Ubuntu runner supplies it. Application tooling uses Node 26.13.0 from `.node-version` and Bun 1.4.4 from `package.json`. Automatic npm caching is disabled. The runner image receives upstream updates; its OS label is fixed, not its image digest.

Run the same sequence locally from the repository root:

```sh
bun install --frozen-lockfile
bun run setup:security
bun run secrets:history
bun run secrets:staged
bun run format:check
bun run lint
bun run check
bun run test:policy
bun run test:security
bun run build
bun run check:assets
```

Frozen installation runs prepare to synchronize framework types and activate Lefthook. Security setup installs official native Gitleaks 8.30.1 with pinned archive SHA-256 verification. Both scanner commands fully redact findings and report only path/line/rule. No Gitleaks Action, license key, cloud-service credential, or paid scanner is required. Policy commands, the disposable hook/index/history scenarios, and the emitted-asset checker retain their existing proof ownership; CI introduces no duplicate suite.

## CodeRabbit

`.coderabbit.yaml` disables automatic initial reviews (`enabled: false`), push reviews (`auto_incremental_review: false`), and draft reviews (`drafts: false`). Empty `description_keyword` and `labels` prevent keyword/label opt-ins. Path filters exclude lockfile and generated/local output. The [official automatic review controls](https://docs.coderabbit.ai/configuration/auto-review) document these semantics. Manual requests can still trigger reviews regardless of automatic settings.

Do not request any scaffold review, including the completed integration PR, through comments, CLI, review re-requests, or integrations. Reserve manual reviews for later product work when explicitly requested. Recheck current public-repository eligibility, plan quotas, rate limits, and file limits then; this configuration promises no unlimited allowance.

Configuration was validated locally against the [official v2 JSON Schema](https://storage.googleapis.com/coderabbit_public_assets/schema.v2.json) (Draft 2020-12), using Python jsonschema 4.26.0 and PyYAML 6.0.3 in a disposable environment. The schema is downloaded, not vendored; its validation-time digest is recorded in the local implementation record. It checks supported fields and values. The [configuration reference](https://docs.coderabbit.ai/reference/configuration) and trigger documentation supply the behavioral interpretation. No schema directive comment is needed in YAML.

Local schema validation does not establish that the hosted service loaded the file or skipped an event. No real CodeRabbit request or service skip test was performed. Local workflow validation and execution of its commands do not establish remote runner success; the parent must inspect an actual Actions run after pushing. No push or PR was created for validation.
