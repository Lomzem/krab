import { self } from '$app/service-worker';
import { deleteCaches } from './caches';

const unregister = () => self.registration.unregister();

const recover = () => {
  const cleared = deleteCaches(() => false);
  return cleared.then(unregister, () => unregister().finally(() => cleared));
};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(recover());
});
