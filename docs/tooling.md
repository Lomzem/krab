# Code checks

Use Bun 1.4.4 and the Node version in `.node-version`. Install the pinned tools with `bun install --frozen-lockfile`.

| Command                      | Behavior                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `bun run format`             | Format supported source, configuration, and Markdown; sort Tailwind classes using `src/app.css`                            |
| `bun run format:check`       | Check formatting without rewriting files                                                                                   |
| `bun run lint`               | Run the absolute comment check and then ESLint                                                                             |
| `bun run check`              | Synchronize SvelteKit and check the whole TypeScript/Svelte project, including tooling, then type-check the service worker |
| `bun run test:policy`        | Exercise paired valid/invalid inputs through those real commands in a disposable checkout                                  |
| `bun run test:unit`          | Run the Vitest suites under `src/**/*.test.ts` and `scripts/verify-krab/**/*.test.ts`                                      |
| `bun run build:next`         | Keep the current `build/` as `.svelte-kit/previous-build`, then build again as a newer version                             |
| `bun run test:e2e`           | Run the Playwright suite in `e2e/` against existing builds                                                                 |
| `bun run test:e2e:container` | Run `build` and `build:next`, then run `test:e2e` inside the pinned Playwright Docker image                                |

ESLint uses the official Svelte parser with the TypeScript script parser, project service, and consistent `.svelte` extensions. Strict type-aware TypeScript rules reject explicit and unsafe any; the whole-project check rejects implicit any. Code blocks have maximum depth three, nested callbacks maximum depth two, and nested ternaries are forbidden. Throw and try statements are forbidden; Effect failure and recovery APIs remain valid.

`@shadcn/lint` enforces `no-restyle` on TypeScript and Svelte consumers, recognizing the project's `#lib/components/ui` imports. Layout utilities are allowed. Component implementation files disable only that design-system rule so they can define their own styles. They retain all general rules. Dynamic Svelte elements have reduced upstream design-system coverage; the plugin does not inspect CSS.

The independent comment check inspects parser comment tokens/nodes for script code, Svelte markup and scripts, CSS (including embedded styles), HTML (including embedded scripts/styles), JSON/JSONC, YAML, and TOML. Ignore files use their line grammar: a leading unescaped `#` denotes a comment; `\#` is a literal pattern. Strings and URLs remain data. ESLint inline configuration and Svelte comment directives cannot disable the check. No suppression comments are permitted, including TypeScript directives. Markdown prose is allowed. Dependencies, Git internals, `.scratch`, `.svelte-kit`, and `build` are excluded; copied UI and these tooling/test files are maintained source.

The policy table is the primary proof owner for project rule wiring and comment coverage. Each row records its observable contract, intended diagnostic, and credible wiring regression. Paired controls share the real command and disposable tree. Invalid programs exist only as string data and temporary files. Hook lifecycle, staged/history secret scans, and emitted installation assets have separate owners because they exercise different boundaries. This is not a copy of upstream parser/rule test suites, a product test framework, or device verification.

## Product tests

Vitest 5.1.0 runs in the Node environment. Trip storage tests use `fake-indexeddb` 6.2.7 with a fresh `IDBFactory` per test, passed through the trip module's public interface, so no global is patched.

Playwright 1.64.1 runs one WebKit project with the `iPhone 17` descriptor, a granted geolocation permission and a made-up mid-ocean position. `@axe-core/playwright` 4.14.0 scans with the `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` and `wcag22aa` tags in both colour schemes. The suite uses the list reporter and writes only to the ignored `test-results/`; traces, screenshots and videos are off so no position can leak into artifacts. Undo toast timing is proven through the real toast with Playwright's page clock installed before navigation and paused before the drop, so no test waits real time; touch holds are dispatched as DOM touch events because Playwright's touchscreen only taps. Screen-level tests run against `vite preview` of `build/`. Service worker tests serve the real `build/` output from a small static host in `e2e/static-host.ts`, which falls back to `index.html` like the live host and can be taken down to go offline. The update test deploys `.svelte-kit/previous-build` first and then `build/`, so it needs `bun run build:next` after `bun run build`. Wake lock tests cover a phone without the API and WebKit's own refusal. Whether a real phone's screen stays on is checked by hand on a device. The container runner derives its image, `mcr.microsoft.com/playwright:v<version>-noble`, from the installed `@playwright/test` version and fails if it can't resolve one. It mounts the checkout, runs as the current user and uses the checkout's own `node_modules`.

## Primary references

Checked during ticket02 implementation on 2026-11-02, alongside installed package metadata and peer requirements:

- [Svelte ESLint setup](https://sveltejs.github.io/eslint-plugin-svelte/user-guide/)
- [Type-aware TypeScript linting](https://typescript-eslint.io/getting-started/typed-linting/)
- [Official shadcn Svelte integration](https://github.com/shadcn-ui/lint/blob/main/docs/svelte.md) and [configuration](https://github.com/shadcn-ui/lint/blob/main/README.md)
- [Prettier plugins](https://prettier.io/docs/plugins) and [Tailwind plugin](https://github.com/tailwindlabs/prettier-plugin-tailwindcss)
- [CSS Tree comment parsing](https://github.com/csstree/csstree/blob/master/docs/parsing.md#oncomment)
- [JSONC parser](https://github.com/ota-meshi/jsonc-eslint-parser) and [Git ignore grammar](https://git-scm.com/docs/gitignore)
