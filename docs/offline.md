# Offline shell and updates

Krab keeps working with no signal after one online load. The service worker in `src/service-worker/index.ts` keeps a copy of the app shell on the phone. The trip itself lives in IndexedDB (see [the phone-only active-trip decision](adr/0001-phone-only-active-trip-data.md)), and the worker never reads or writes it.

## Caching contract

- Each build has one cache named `krab-shell-<version>`, where the version is the build's SvelteKit version (`_app/version.json`).
- Install fetches the shell `/`, every immutable build file and the static assets, bypassing the HTTP cache. Deployment metadata (paths starting with `_`, such as `_app/version.json`) is not cached. A missing file or an unexpected response type fails the install, so a broken deploy never replaces a working copy.
- The worker serves only same-origin `GET` requests. A precached path comes from the cache. A navigation gets the cached shell, which then restores the stored trip. Anything else, including map tiles and every third-party request, goes to the network untouched.
- There is no `skipWaiting`. A new build installs in the background and waits while any Krab page is open, so a skipper never has the app change under them mid-trip. It takes over on the next launch after every Krab page has closed.
- Activation deletes every other `krab-shell-` cache, then claims open pages.

SvelteKit registers `/service-worker.js` itself on page load. `bun run check` type-checks the worker with its own `src/service-worker/tsconfig.json`, which uses the WebWorker library.

iOS checks for a new worker when Krab is navigated to, not while it stays open in the foreground. A skipper who keeps Krab open for days may therefore need one extra launch before an update arrives.

## Screen wake lock

While a trip is active and Krab is visible, `src/lib/features/app-shell/` asks for a screen wake lock. The lock is released when the trip ends or Krab is hidden, and requested again when Krab comes back into view. On a phone without the Screen Wake Lock API, or when the request is refused, the screen follows its normal timeout and no error is shown.

## Hosting headers

Hosting lives in the Cloudflare dashboard, not in this repository. The dashboard build command writes both `wrangler.json` and `build/_headers`, overwriting any tracked copies. That's why the repository tracks neither file. The build command is:

```sh
bun run build && bun -e 'await Bun.write("wrangler.json", JSON.stringify({name:"krab",compatibility_date:"2026-11-02",assets:{directory:"./build",not_found_handling:"single-page-application"}})); await Bun.write("build/_headers", "/service-worker.js\n  Cache-Control: no-cache\n/_app/immutable/*\n  Cache-Control: public, max-age=31536000, immutable\n");'
```

The deploy command is `bunx wrangler deploy`. `Cache-Control: no-cache` on `/service-worker.js` makes the browser revalidate the worker script on every update check, so a new build is noticed. Change these headers in the dashboard, not here.

### Live check

On 2026-11-03 at 04:50:53 GMT, `curl -sI` against `https://krab.lomzem.dev` returned:

| Path                                      | Status | `Content-Type`     | `Cache-Control`                       |
| ----------------------------------------- | ------ | ------------------ | ------------------------------------- |
| `/`                                       | 200    | `text/html`        | `public, max-age=0, must-revalidate`  |
| `/service-worker.js`                      | 200    | `text/html`        | `no-cache`                            |
| `/_app/version.json`                      | 200    | `application/json` | `public, max-age=0, must-revalidate`  |
| `/_app/immutable/entry/start.vzboPR96.js` | 200    | `text/javascript`  | `public, max-age=31536000, immutable` |

The `no-cache` rule for the worker path is live. The deployed build was older than the worker, so `/service-worker.js` fell back to the single-page shell as HTML.

After the worker build is deployed (ticket 11), run these checks:

1. Run `curl -sI https://krab.lomzem.dev/service-worker.js`. It should return a JavaScript `Content-Type` and `Cache-Control: no-cache`. Then run `curl -s` on the same URL and confirm the body is the worker, not HTML.
2. On a physical iPhone, add Krab to the Home Screen and open it once online. Then try it in airplane mode: Krab should open and show the stored trip. Check that the screen stays on during an active trip.

## Kill switch

If a broken worker gets onto phones, ship the recovery worker in `src/service-worker/kill-switch.ts`. Nothing imports it day to day. It activates straight away, deletes every `krab-shell-` cache and unregisters itself. The next load then comes straight from the network. IndexedDB, and with it the active trip and past trips, is never touched.

To deploy it:

1. Replace the whole contents of `src/service-worker/index.ts` with `import './kill-switch';`.
2. In `vite.config.ts`, pass `serviceWorker: { register: false }` to `sveltekit({ ... })`, so the recovery build doesn't register a new worker.
3. Run the usual checks and `bun run build`. Confirm that `build/service-worker.js` contains the kill-switch code and that `build/index.html` doesn't register a worker. Then merge to `main` so the dashboard deploys it.

Keep the worker at the same URL with the same headers. Phones only replace a worker by fetching a new script from `/service-worker.js`. Deleting the file, or serving HTML there, leaves the broken worker in charge.

To verify, open Krab online once on an affected phone, then reload. `navigator.serviceWorker.getRegistration()` should resolve to `undefined`, `caches.keys()` should contain no `krab-shell-` entry, and the stored trip should still show. This procedure was checked once by hand in Playwright WebKit during ticket 07. It has no automated test.

To restore offline support, revert both changes and deploy normally.
