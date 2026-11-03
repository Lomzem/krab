const holdScreenAwake = () => {
  let wanted = true;
  let pending = false;
  let lock: WakeLockSentinel | null = null;

  const visible = () => document.visibilityState === 'visible';

  const release = () => {
    const current = lock;
    lock = null;
    void current?.release().catch(() => undefined);
  };

  const request = () => {
    if (!wanted || pending || !visible() || (lock && !lock.released)) return;
    pending = true;
    navigator.wakeLock.request('screen').then(
      (sentinel) => {
        pending = false;
        lock = sentinel;
        if (!wanted || !visible()) release();
      },
      () => {
        pending = false;
      }
    );
  };

  const onVisibilityChange = () => {
    if (visible()) request();
    else release();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  request();

  return () => {
    wanted = false;
    document.removeEventListener('visibilitychange', onVisibilityChange);
    release();
  };
};

export const keepScreenAwakeWhile = (needed: () => boolean) => {
  $effect(() => {
    if (!needed() || !('wakeLock' in navigator)) return;
    return holdScreenAwake();
  });
};
