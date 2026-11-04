import { self } from '$app/service-worker';
import { deleteCaches } from './caches';

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    deleteCaches(() => false).finally(() => self.registration.unregister())
  );
});
