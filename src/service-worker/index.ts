import { version } from '$app/env';
import { assets, immutable } from '$app/manifest';
import { self } from '$app/service-worker';
import { CACHE_PREFIX, deleteCaches } from './caches';

const CACHE = `${CACHE_PREFIX}${version}`;
const SHELL = '/';

const isDeploymentMetadata = (path: string) => path.startsWith('_');

const files = [
  ...immutable.map(({ path }) => `/${path}`),
  ...assets
    .map(({ path }) => path)
    .filter((path) => !isDeploymentMetadata(path))
    .map((path) => `/${path}`)
];
const precached = new Set(files);

const isHtml = (response: Response) =>
  (response.headers.get('content-type') ?? '').startsWith('text/html');

const fits = (path: string, response: Response) =>
  response.ok &&
  response.url !== '' &&
  new URL(response.url).origin === self.location.origin &&
  isHtml(response) === (path === SHELL);

const store = (cache: Cache, path: string) =>
  fetch(new Request(path, { cache: 'no-cache' })).then((response) =>
    fits(path, response)
      ? cache.put(path, response)
      : Promise.reject(new Error(`Unexpected response for ${path}`))
  );

const precache = () =>
  caches
    .open(CACHE)
    .then((cache) =>
      Promise.all([SHELL, ...files].map((path) => store(cache, path)))
    );

const fromCache = (path: string, request: Request) =>
  caches
    .open(CACHE)
    .then((cache) => cache.match(path))
    .then((cached) => cached ?? fetch(request));

const cachedPath = (request: Request) => {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return null;
  if (precached.has(url.pathname)) return url.pathname;
  return request.mode === 'navigate' ? SHELL : null;
};

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    deleteCaches((key) => key === CACHE).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const path = cachedPath(event.request);
  if (path !== null) event.respondWith(fromCache(path, event.request));
});
