# Krab

A client-rendered SvelteKit app for keeping track of crab pots and nets on the water. It drops gear at the phone's location, records bait and depth for each drop and can record catch for collected drops, and lists gear in the water with distance, direction and time in the water. The Map tab shows drops on NOAA charts or OpenFreeMap streets. Ending a trip keeps it under Past trips, where its days and drops can be reviewed on the map or the trip deleted. After one online load, Krab launches and restores the active trip with no signal.

All trip data stays on the phone in IndexedDB. There is no account, cloud database or authentication, and clearing or evicting the site's data loses the active trip and past trips. Map provider requests carry no position. Read [GLOSSARY.md](GLOSSARY.md) before product work.

## Setup

Install [Bun](https://bun.sh/docs/installation) **1.4.4** and Node.js **26.13.0** (recorded in `.node-version`; the minimum is 22.18.0, which runs TypeScript files directly). No environment file, cloud account, API key or service credential is needed.

```sh
bun install --frozen-lockfile
bun run setup:security
bun run dev --host 127.0.0.1
```

Installation runs `prepare`, which synchronizes SvelteKit types and activates Lefthook. `setup:security` downloads the [official Gitleaks 8.30.1 release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1), verifies its pinned SHA-256, installs it in the ignored `.tools/gitleaks` and reinstalls the hook. Complete both steps before committing, and run setup again after moving the checkout.

## Checks

| Command                          | Behavior                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `bun run format`                 | Format source, configuration and Markdown; sort Tailwind classes                                             |
| `bun run format:check`           | Check formatting without rewriting files                                                                     |
| `bun run lint`                   | Run ESLint with strict type-aware rules and the `krab/*` policy rules                                        |
| `bun run check`                  | Synchronize SvelteKit and type-check the project and the service worker; any compiler warning fails          |
| `bun run test:unit`              | Run the Vitest suites under `src/**/*.test.ts` and `scripts/verify-krab/**/*.test.ts`                        |
| `bun run test:policy`            | Run paired valid and invalid probes through `lint`, `check` and `format:check` in a disposable copy          |
| `bun run test:security`          | Prove the commit hook and the staged and history secret scans in disposable repositories                     |
| `bun run ci`                     | Run `format:check`, `lint`, `check` and `test:unit` in order, beside `test:policy`, in under a minute        |
| `bun run build`                  | Write the static site, with its `index.html` fallback, to `build/`                                           |
| `bun run check:assets`           | Check the emitted manifest, icons and installation metadata in `build/`                                      |
| `bun run build:next`             | Keep the current `build/` as `.svelte-kit/previous-build`, then build a newer version for the update test    |
| `bun run test:e2e`               | Run the Playwright WebKit suite (iPhone emulation, axe WCAG 2.2 AA in both themes) against existing builds   |
| `bun run test:recipes`           | Run the verify-krab journey recipes against the built app with the e2e provider fixtures                     |
| `bun run test:e2e:container`     | Build twice, then run `test:e2e` in the `mcr.microsoft.com/playwright:v<version>-noble` image (needs Docker) |
| `bun run test:recipes:container` | Build once, then run `test:recipes` in the same image                                                        |

WebKit does not launch natively on every Linux host, so run the browser suites locally through the container commands. Test output goes to the ignored `test-results/`.

Every commit runs `secrets:staged`, `format:check`, `lint`, `check` and `test:unit` through Lefthook. Both secret scans pass `--redact=100` and print only path, line and rule. `bun run secrets:history` scans all fetched refs and rejects shallow clones.

## CI

[GitHub Actions](.github/workflows/ci.yml) runs on pushes to `main`, pull requests and manual dispatch, with read-only repository permission and no deployment. Every job sets `timeout-minutes` of at most 5 and starts at once:

- `checks` scans full history, then runs `format:check`, `lint`, `check`, `test:unit`, `build` and `check:assets`.
- `policy` runs `test:policy`.
- `security` runs `test:security`.
- `browser` builds inside the pinned Playwright container and runs `test:e2e` in 6 shards and `test:recipes` in 4 shards. Only the `test:e2e` shards run `build:next`, because only `e2e/offline-and-update.test.ts` reads the previous build.

CodeRabbit automatic reviews are off in `.coderabbit.yaml`. Request a manual review only when asked.

## Offline shell

The service worker in `src/service-worker/index.ts` keeps one `krab-shell-<version>` cache of the app shell, immutable build files and static assets. It serves only same-origin `GET` requests; map tiles and other third-party requests go to the network. It never touches IndexedDB. A new build installs in the background, has no `skipWaiting`, and takes over on the next launch after every Krab page has closed. While a trip is active and Krab is visible, Krab requests a screen wake lock, which the browser may not support or may refuse. Use the [device checklist](.agents/skills/verify-krab/features/device-checks.md) for Home Screen installation, offline launch, updates and wake lock on a real iPhone.

## Deploy

Cloudflare hosting is configured in the Cloudflare dashboard, which runs these commands on pushes to `main`. The repository tracks neither `wrangler.json` nor `build/_headers`.

Build command:

```sh
bun run build && bun -e 'await Bun.write("wrangler.json", JSON.stringify({name:"krab",compatibility_date:"2026-11-02",assets:{directory:"./build",not_found_handling:"single-page-application"}})); await Bun.write("build/_headers", "/service-worker.js\n  Cache-Control: no-cache\n/_app/immutable/*\n  Cache-Control: public, max-age=31536000, immutable\n");'
```

Deploy command:

```sh
bunx wrangler deploy
```

After a deploy, check the app shell, the worker headers and body, and one immutable asset:

```sh
curl -sI https://krab.lomzem.dev/
curl -sI https://krab.lomzem.dev/service-worker.js
curl -s https://krab.lomzem.dev/service-worker.js | head -c 200
asset="$(curl -s https://krab.lomzem.dev/ | grep -o '/_app/immutable/[^"]*\.js' | head -n 1)"
curl -sI "https://krab.lomzem.dev${asset:?no immutable script in the app shell}"
```

`/` must answer `200` directly with an HTML `Content-Type`, because the worker rejects a redirected app shell. The worker must have a JavaScript `Content-Type` and `Cache-Control: no-cache`, and its body must be the worker, not the HTML fallback. The immutable asset must have `Cache-Control: public, max-age=31536000, immutable`.

### Service worker kill switch

If a broken worker reaches phones, ship `src/service-worker/kill-switch.ts`. It activates at once, deletes every `krab-shell-` cache and unregisters itself. IndexedDB is never touched.

1. Replace the contents of `src/service-worker/index.ts` with `import './kill-switch';`.
2. In `vite.config.ts`, pass `serviceWorker: { register: false }` to `sveltekit({ ... })`.
3. Run the checks and `bun run build`. Confirm that `build/service-worker.js` contains the kill-switch code and that `build/index.html` does not register a worker.
4. Merge to `main` so the dashboard deploys it. Keep the worker at `/service-worker.js` with the same headers.

On an affected phone, open Krab online once, then reload. `navigator.serviceWorker.getRegistration()` must resolve to `undefined`, `caches.keys()` must have no `krab-shell-` entry, and the stored trip must still show. To restore offline support, revert both changes and deploy normally.

## Code organization

Feature code lives in `src/lib/features/<feature>/`, and code outside the feature, including routes, scripts and tests, reaches it only through its `index.ts`. Code that several features use lives in `src/lib/shared/`, which imports no feature. `src/routes/` stays thin. `#lib/*` resolves to `src/lib/*` through `package.json` imports. Tailwind theme tokens for light and dark live in `src/app.css`, and `krab/chrome-tokens` holds chrome to them. UI SDK is the rule for interactive controls while the migration away from the four `bits-ui` bait command wrappers is underway; see `AGENTS.md`. Third-party attributions live in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
