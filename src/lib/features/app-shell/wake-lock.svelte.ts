import { watchVisibility } from '#lib/page-visibility.js';

const holdScreenAwake = () => {
  let wanted = true;
  let visible = false;
  let pending = false;
  let lock: WakeLockSentinel | null = null;

  const release = () => {
    const current = lock;
    lock = null;
    void current?.release().catch(() => undefined);
  };

  const request = () => {
    if (!wanted || pending || !visible || (lock && !lock.released)) return;
    pending = true;
    navigator.wakeLock.request('screen').then(
      (sentinel) => {
        pending = false;
        lock = sentinel;
        sentinel.addEventListener('release', request, { once: true });
        if (!wanted || !visible) release();
      },
      () => {
        pending = false;
      }
    );
  };

  const unwatch = watchVisibility((now) => {
    visible = now;
    if (visible) request();
    else release();
  });

  return () => {
    wanted = false;
    unwatch();
    release();
  };
};

export const keepScreenAwakeWhile = (needed: () => boolean) => {
  $effect(() => {
    if (!needed() || !('wakeLock' in navigator)) return;
    return holdScreenAwake();
  });
};
