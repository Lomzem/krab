export const CACHE_PREFIX = 'krab-shell-';

export const deleteCaches = (keep: (key: string) => boolean) =>
  caches
    .keys()
    .then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && !keep(key))
          .map((key) => caches.delete(key))
      )
    );
