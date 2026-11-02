import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { resolve, relative, sep } from "node:path";
declare class HTMLRewriter {
  on(
    selector: string,
    handler: {
      element(element: { getAttribute(name: string): string | null }): void;
    },
  ): HTMLRewriter;
  transform(response: Response): Response;
}

const output = resolve("build");
const origin = new URL("https://krab.invalid/");

function emittedFile(reference: string, base: URL): { path: string; url: URL } {
  const url = new URL(reference, base);
  assert.equal(url.origin, origin.origin, `Asset must be local: ${reference}`);
  const path = resolve(output, `.${decodeURIComponent(url.pathname)}`);
  const location = relative(output, path);
  assert(
    location !== ".." && !location.startsWith(`..${sep}`),
    "Asset escapes build",
  );
  const file = statSync(path).isDirectory()
    ? resolve(path, "index.html")
    : path;
  assert(statSync(file).isFile(), `Missing emitted file: ${reference}`);
  return { path: file, url };
}

function record(value: unknown): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  assert(typeof value === "string" && value.trim().length > 0);
  return value;
}

function png(reference: string, base: URL): { width: number; height: number } {
  const { path } = emittedFile(reference, base);
  const bytes = readFileSync(path);
  assert(
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  assert.equal(bytes.toString("ascii", 12, 16), "IHDR");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

const links = new Map<string, string>();
const metadata = new Map<string, string>();
const shell = readFileSync(resolve(output, "index.html"), "utf8");
await new HTMLRewriter()
  .on("head link", {
    element(element) {
      const href = element.getAttribute("href");
      const relations = element.getAttribute("rel")?.split(/\s+/) ?? [];
      for (const relation of relations) {
        if (href) links.set(relation, href);
      }
    },
  })
  .on("head meta", {
    element(element) {
      const name = element.getAttribute("name");
      const content = element.getAttribute("content");
      if (name && content) metadata.set(name, content);
    },
  })
  .transform(new Response(shell))
  .text();

assert(links.has("manifest"), "Emitted shell must link an app manifest");
const manifestFile = emittedFile(text(links.get("manifest")), origin);
const manifest = record(
  JSON.parse(readFileSync(manifestFile.path, "utf8")) as unknown,
);
const name = text(manifest.name);
text(manifest.short_name);
assert.equal(manifest.display, "standalone");
const start = emittedFile(text(manifest.start_url), manifestFile.url);
assert.equal(
  start.path,
  resolve(output, "index.html"),
  "Start URL must open the SPA shell",
);
const scope = new URL(text(manifest.scope), manifestFile.url);
assert.equal(scope.origin, origin.origin);
assert(
  start.url.pathname.startsWith(scope.pathname),
  "Start URL must be inside app scope",
);
assert.equal(metadata.get("apple-mobile-web-app-capable"), "yes");
assert.equal(metadata.get("mobile-web-app-capable"), "yes");
assert.equal(metadata.get("apple-mobile-web-app-title"), name);
assert(
  ["default", "black", "black-translucent"].includes(
    text(metadata.get("apple-mobile-web-app-status-bar-style")),
  ),
);
assert.equal(text(metadata.get("theme-color")), text(manifest.theme_color));
text(manifest.background_color);
const touch = png(text(links.get("apple-touch-icon")), origin);
assert.equal(touch.width, 180);
assert.equal(touch.height, 180);
assert(
  Array.isArray(manifest.icons) && manifest.icons.length > 0,
  "Manifest must include icons",
);
const sizes = new Set<string>();
for (const entry of manifest.icons) {
  const icon = record(entry);
  assert.equal(icon.type, "image/png");
  const dimensions = png(text(icon.src), manifestFile.url);
  const size = `${dimensions.width}x${dimensions.height}`;
  assert(
    text(icon.sizes).split(/\s+/).includes(size),
    "Icon dimensions must match declared sizes",
  );
  sizes.add(size);
}
assert(
  sizes.has("192x192") && sizes.has("512x512"),
  "Installation needs 192px and 512px icons",
);
console.log("Built installation assets resolve correctly.");
