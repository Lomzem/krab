# Offline and wake lock

Open Krab with no signal after one online load and still see the stored trip. Get a new build on the next launch rather than mid-trip, and keep the screen on during an active trip where the phone allows it.

## Sub-features

- `offline-open`: after one online load, a new launch with the network off shows the stored Pot 1 on the map and in Gear.
- `third-party-untouched`: requests to another origin, such as map tiles, always go to the network, so offline they fail instead of being served from Krab's cache.
- `update-next-launch`: a newly deployed build waits while any Krab page is open, so open pages and new tabs keep the old build. After every page closes, the next launch runs the new build with the stored trip and only one `krab-shell-` cache. That launch also works offline.
- `update-redirect-refused`: a deploy whose shell `/` redirects never installs, so after every page closes the previous build still opens offline with the stored trip.
- `wake-lock-optional`: with no Screen Wake Lock API, or when the request is refused, dropping gear works with no page error.

## How to get to it (user POV)

- Open Krab online, turn on location and drop a pot. Close Krab, lose signal and open it again. Choose Gear to see Pot 1.
- After an update is deployed, keep using the open Krab with no change. Close it and open it again to get the new version.
- During an active trip, the screen stays on while Krab is visible.

## Driving it with Playwright

Preconditions: a fresh context and made-up position as in the parent skill, plus two builds. `bun run scripts/e2e-container.ts` runs `bun run build` and `bun run build:next`, so `.svelte-kit/previous-build` holds the older version and `build/` the newer one. Run the executable recipes with:

```sh
bun run scripts/e2e-container.ts e2e/offline-and-update.test.ts e2e/wake-lock.test.ts
```

- **Host:** the service worker tests don't use `vite preview`. `siteAt(port)` in `e2e/static-host.ts` serves a build directory with the live host's single-page fallback. `deploy(build, redirects)` swaps the served build, answering each path in the optional `redirects` map with a 302 to its target, and `takeDown()` stops the server. Going offline means `takeDown()` plus `await context.setOffline(true)`.
- **Offline open:** deploy `build/`, `page.goto(origin)`, click `Turn on location`, wait for the text `Position ready`, then click `Drop pot`; require the toast (`toastOf(page)`) to contain `Pot 1 dropped`. Wait for `navigator.serviceWorker.ready`. Go offline, open `context.newPage()` at the same origin, click the Map button and require the `Map view` region and the `Pot 1,` pin in the `Map` region, then click the Gear button and require the main-scoped `Pot 1` list item.
- **Update:** deploy `.svelte-kit/previous-build`, drop a pot and wait for the worker. Deploy `build/` and `page.reload()`, then poll `registration.waiting.state` until it is `installed`. Require the shell HTML to contain the previous `_app/version.json` version in that page and in a new tab. Close every page, then relaunch until a page serves the new version. Require exactly one open page, the stored Pot 1 and `caches.keys()` length 1. Finally go offline and launch again.
- **Redirected update:** deploy `.svelte-kit/previous-build`, drop a pot and wait for the worker. Watch the registration's next installing worker from that page, then deploy `build/` with `{ '/': '/maintenance' }` and open a second tab to trigger the update check. Require the installing worker to end `redundant`, never `installed`. Close every page, go offline and launch: require the previous version and the stored Pot 1.
- **Wake lock:** the "without Screen Wake Lock" case removes `wakeLock` from `Navigator.prototype` in an init script. The refusal case relies on headless WebKit rejecting the request with `NotAllowedError`. Both drop two pots and require no `pageerror`. The supported case replaces `navigator.wakeLock` with a counting fake that, like the platform, rejects requests while hidden and releases its locks on hide. It fakes `document.visibilityState`, then checks one lock held during a trip, none while hidden (twice), and one again on return (twice).

## Gotchas

- Linux WebKit is not iOS Safari. Home Screen launch, actual screen-on behaviour and iOS update timing need a physical iPhone (ticket 11). Headless WebKit always refuses the real wake lock, so the supported path runs only against the e2e fake; a physical iPhone still has to confirm the screen stays on.
- In container WebKit, `page.goto` hung on port 4190, while ports 4174–4178 worked. Keep new hosts in that range.
- Close every page before expecting the new build. Reload alone keeps the waiting worker waiting, which is the intended behaviour.
- The visually hidden Net radio didn't respond to `check()` in time before the toast expired; the wake lock recipe drops a second pot instead.
- The kill switch in `docs/offline.md` has no browser recipe; it was checked by hand once. `src/service-worker/worker.test.ts` runs its activation.
