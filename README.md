# Krab

A client-rendered SvelteKit app for keeping track of crab pots and nets on the water. It currently drops gear at the phone's location, lists gear in the water with distance, direction and time in the water, and restores the active trip from IndexedDB after a reload.

## Setup

Install [Bun](https://bun.sh/docs/installation) **1.4.4** and Node.js **26.13.0** (recorded in `.node-version`). Bun manages packages and developer commands; the tooling also invokes Node. The minimum is Node >=22.18.0: SvelteKit needs 22.17.0, and the verification helpers run TypeScript files directly with `node`, which Node 22 does by default from 22.18.0. No environment file, cloud account, API key, or service credentials are needed.

From a fresh checkout:

```sh
bun install --frozen-lockfile
bun run setup:security
bun run dev --host 127.0.0.1
```

Open the local URL printed by Vite. Stop it with Ctrl-C. Installation runs `prepare` to synchronize SvelteKit types and activate Lefthook. `setup:security` installs the pinned native scanner and reinstalls the hook. Complete both steps before committing. Code policy commands are available below.

## Verification and static output

```sh
bun run check
bun run build
bun run check:assets
bun run preview --host 127.0.0.1
```

`check` synchronizes framework types and runs strict Svelte/TypeScript checking. The static adapter writes the deployable site to `build/`, including the client-rendered `index.html` fallback. Configure a future static host to serve that fallback for application routes. Generated `.svelte-kit/` server intermediates are build tooling output; the shipped `build/` directory needs no SvelteKit application server. `preview` serves the production build locally and is not a hosting setup.

Formatting, lint and test commands are documented in [Code checks](docs/tooling.md). Commit hooks and CI use the shared commands below. After one online load the service worker keeps the app shell for offline use; see [Offline shell and updates](docs/offline.md) for the caching contract, hosting headers and kill switch. There is no map or authentication yet.

## Tests

```sh
bun run test:unit
bun run test:e2e:container
```

`test:unit` runs Vitest against the trip module's public interface over `fake-indexeddb`, with a fixed clock and position source. `test:e2e:container` builds the site twice (the second build stands in for an update) and runs the Playwright WebKit suite with iPhone emulation, an emulated made-up position and axe (WCAG 2.2 AA, light and dark) inside the official `mcr.microsoft.com/playwright:v<version>-noble` image whose version matches the installed `@playwright/test`, because WebKit does not launch natively on every Linux host. It needs Docker. Where WebKit runs natively (as in CI), `bun run build && bun run build:next && bun run test:e2e` runs the same suite directly. Test output goes to the ignored `test-results/`.

## Installation assets

The static shell links a standalone web app manifest and a 180px Apple touch icon, with 192px and 512px manifest icons. These are original placeholder crab drawings generated with ImageMagick. The manifest assumes hosting at the origin root; update its URLs and scope when adopting a subpath host.

After each build, run `bun run check:assets` from the repository root. This single check parses the emitted HTML and manifest, resolves the start URL and icon references inside `build/`, verifies PNG dimensions, and checks the shell's installation presentation metadata. It uses Bun's HTMLRewriter and requires no running server. A suitable HTTPS origin is needed for installation; hosting is deferred.

Offline startup comes from the service worker described in [Offline shell and updates](docs/offline.md). Automated asset verification does not establish actual iPhone installation or launch behavior; no manual device check is required for the scaffold.

## Code organization

- `src/routes/` contains thin SvelteKit routes that compose feature UI.
- `src/lib/features/<feature>/` directories own each feature's UI, domain logic, Effect services, and private browser integrations together. Consume another feature through its `index.ts`.
  - `trip/` owns the trip record, the drop rules, the GPS freshness policy and IndexedDB storage. Its interface takes a clock, a position source and an `IDBFactory`, and returns Effect values with typed storage failures.
  - `location/` wraps `watchPosition` as the production position source and stops watching while the page is hidden.
  - `on-water/` is the on-water UI: bottom tabs, the first-launch location explanation, the Drop control, the Gear list and the Undo toast. It never touches IndexedDB directly.
- Extract shared browser integrations when multiple features need them.
- `src/lib/utils.ts` and future shared helpers contain genuinely reusable, domain-independent code.
- `src/lib/components/ui/` contains maintained shadcn-svelte components; `components.json` configures their paths. They follow the same general coding policies as other owned code.

Do not create empty feature directories or speculative abstractions. SvelteKit 3 uses `#lib/*` package subpath imports, configured in `package.json`. Configuration lives in `vite.config.ts`, including Tailwind's Vite plugin and SvelteKit's static adapter. Global Tailwind theme tokens (light and dark, following the system setting) and the Badge's Nova styles live in `src/app.css`. The copied component's source and license are recorded in [the attribution](docs/third-party/shadcn-svelte.md). The Barlow font is self-hosted from `@fontsource/barlow` under the SIL Open Font License; see [the Barlow attribution](docs/third-party/barlow.md).

See [GLOSSARY.md](GLOSSARY.md), [the phone-only active-trip decision](docs/adr/0001-phone-only-active-trip-data.md) and [keeping past trips on the phone](docs/adr/0002-keep-past-trips-on-the-phone.md) before product work.

## Dependencies and documentation

Direct versions are pinned in `package.json`, with transitive resolutions in `bun.lock`. Current primary package metadata was checked during implementation rather than relying on historical research. SvelteKit 3.1.1, Svelte 5.57.3, Vite 8.3.5, Tailwind 4.3.4, and stable Effect 4.1.2 are installed. TypeScript is deliberately pinned to 6.0.3 because SvelteKit and svelte-check support TypeScript 6; the current TypeScript 7 latest tag is outside their peer ranges.

- [SvelteKit SPA configuration](https://svelte.dev/docs/kit/single-page-apps) and [Vite configuration](https://svelte.dev/docs/kit/configuration)
- [Tailwind with SvelteKit](https://tailwindcss.com/docs/installation/framework-guides/sveltekit)
- [shadcn-svelte manual installation](https://www.shadcn-svelte.com/docs/installation/manual)
- [Effect v4 documentation](https://effect.website/docs/v4/onboarding), matching installed stable v4
- Primary npm metadata: [SvelteKit](https://registry.npmjs.org/@sveltejs%2fkit), [svelte-check](https://registry.npmjs.org/svelte-check), [TypeScript](https://registry.npmjs.org/typescript), [Effect](https://registry.npmjs.org/effect)

## Commit and secret protection

Setup requires Git, tar, and HTTPS access to GitHub releases. `bun run setup:security` downloads the [official Gitleaks 8.30.1 release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1) for Linux/macOS x64/arm64, verifies its archive against the pinned upstream SHA-256, and installs it in ignored `.tools/gitleaks`. It does not use the system Gitleaks or an npm scanner wrapper. Bun installs the pinned Lefthook package from the frozen lockfile. The installed hook uses Bun on PATH; run setup again after moving the checkout or replacing hooks. Do not set a competing Git `core.hooksPath`.

Every normal commit runs these non-mutating commands in order and stops on failure:

```sh
bun run secrets:staged
bun run format:check
bun run lint
bun run check
bun run test:unit
```

The end-to-end suite is too slow for the hook and runs in CI. The scanner reads the staged Git diff, including index content that differs from the working copy. It runs before policy checks to prevent their diagnostics from printing a detected staged value. Fix a finding in the index and rerun the commit; checks never rewrite or stage files. Gitleaks uses its upstream detection rules; a passing scan is limited to those rules.

```sh
bun run secrets:history
bun run test:security
```

The history command runs the same native scanner over **all fetched refs** with `--log-opts=--all`, including older commits whose files were deleted. It rejects shallow repositories. CI must use a full-history checkout (`fetch-depth: 0`) and run `bun run setup:security` before scanning; unfetched history is outside its scope. The CI workflow runs this command before code checks.

Both scan commands require version 8.30.1 and pass `--redact=100`. Native output is suppressed; a private temporary JSON report is reduced to path, line, and rule, then deleted on process exit. No finding snippets, values, authors, commit messages, or fingerprints are printed. Scanner/setup errors block commits. No credentials or service keys are required.

`test:security` uses disposable repositories and synthetic non-secret material: one hook lifecycle/policy scenario, staged/index mismatch security proof, and a distinct removed historical finding on another branch. It checks native redaction and hook diagnostics without displaying the synthetic material. Historical fixtures are created before hook activation in that isolated repository. It neither changes this checkout's index/history nor bypasses its hooks.

## CI and review configuration

[CI and manual review documentation](docs/ci.md) records pinned Actions, the shared verification sequence, CodeRabbit skip settings, and local validation limits. CI runs on pushes, pull requests, and manual dispatch with read-only repository permission. No deployment or paid scanner integration is configured.

CodeRabbit automatic initial, incremental, and draft reviews are disabled. Do not request a CodeRabbit review for scaffolding, including its completed integration PR, through comments, CLI, or integrations. Reviews are reserved for later product work when explicitly requested; check current public-repository eligibility and limits then.
