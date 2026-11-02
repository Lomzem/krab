# Krab

A minimal client-rendered SvelteKit shell for future crab gear tracking. It currently shows a title and a shadcn-svelte Badge.

## Setup

Install [Bun](https://bun.sh/docs/installation) **1.4.4** and Node.js **26.13.0** (recorded in `.node-version`). Bun manages packages and developer commands; the tooling also invokes Node. SvelteKit requires Node >=22.17.0. No environment file, cloud account, API key, or service credentials are needed.

From a fresh checkout:

```sh
bun install --frozen-lockfile
bun run dev --host 127.0.0.1
```

Open the local URL printed by Vite. Stop it with Ctrl-C. Installation runs `prepare` to synchronize SvelteKit types; it does not install commit hooks yet. Hook setup and policy enforcement belong to the following scaffold tickets.

## Verification and static output

```sh
bun run check
bun run build
bun run preview --host 127.0.0.1
```

`check` synchronizes framework types and runs strict Svelte/TypeScript checking. The static adapter writes the deployable site to `build/`, including the client-rendered `index.html` fallback. Configure a future static host to serve that fallback for application routes. Generated `.svelte-kit/` server intermediates are build tooling output; the shipped `build/` directory needs no SvelteKit application server. `preview` serves the production build locally and is not a hosting setup.

Formatting and lint commands are documented in [Code checks](docs/tooling.md). Hooks, installation metadata/icons, CI, and review configuration are subsequent tickets. There is no service worker or offline cache, product storage, geolocation, map, or authentication in this shell. No product test framework is installed; this foundation is verified through the real install, development, check, and build commands.

## Code organization

- `src/routes/` contains thin SvelteKit routes that compose feature UI. The scaffold placeholder lives directly in the route until a real feature exists.
- Future `src/lib/features/<feature>/` directories own each feature's UI, domain logic, and Effect services together. Consume another feature through its intended public boundary.
- Future `src/lib/platform/` holds browser integrations. Add adapters when real callers need them.
- `src/lib/utils.ts` and future shared helpers contain genuinely reusable, domain-independent code.
- `src/lib/components/ui/` contains maintained shadcn-svelte components; `components.json` configures their paths. They follow the same general coding policies as other owned code.

Do not create empty feature directories or speculative abstractions. SvelteKit 3 uses `#lib/*` package subpath imports, configured in `package.json`. Configuration lives in `vite.config.ts`, including Tailwind's Vite plugin and SvelteKit's static adapter. Global Tailwind theme tokens and the Badge's Nova styles live in `src/app.css`. The copied component's source and license are recorded in [the attribution](docs/third-party/shadcn-svelte.md).

See [GLOSSARY.md](GLOSSARY.md) and [the phone-only active-trip decision](docs/adr/0001-phone-only-active-trip-data.md) before product work. These record future direction; the scaffold does not implement it.

## Dependencies and documentation

Direct versions are pinned in `package.json`, with transitive resolutions in `bun.lock`. Current primary package metadata was checked during implementation rather than relying on historical research. SvelteKit 3.1.1, Svelte 5.57.3, Vite 8.3.5, Tailwind 4.3.4, and stable Effect 4.1.2 are installed. TypeScript is deliberately pinned to 6.0.3 because SvelteKit and svelte-check support TypeScript 6; the current TypeScript 7 latest tag is outside their peer ranges.

- [SvelteKit SPA configuration](https://svelte.dev/docs/kit/single-page-apps) and [Vite configuration](https://svelte.dev/docs/kit/configuration)
- [Tailwind with SvelteKit](https://tailwindcss.com/docs/installation/framework-guides/sveltekit)
- [shadcn-svelte manual installation](https://www.shadcn-svelte.com/docs/installation/manual)
- [Effect v4 documentation](https://effect.website/docs/v4/onboarding), matching installed stable v4
- Primary npm metadata: [SvelteKit](https://registry.npmjs.org/@sveltejs%2fkit), [svelte-check](https://registry.npmjs.org/svelte-check), [TypeScript](https://registry.npmjs.org/typescript), [Effect](https://registry.npmjs.org/effect)
