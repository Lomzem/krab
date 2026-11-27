import { availability } from '#lib/features/trip/index.js';
import { watchVisibility } from '#lib/shared/page-visibility.js';
import type { PositionWatch } from './position-watch.svelte';

const LONGEST_TIMER_MS = 2 ** 31 - 1;

export const readiness = (watch: PositionWatch) => {
  let checkedAt = $state(Date.now());
  const status = $derived(
    availability({ denied: watch.denied(), fix: watch.fix }, checkedAt)
  );
  const fix = $derived(status.kind === 'ready' ? status.fix : null);
  const lastFix = $derived(status.kind === 'finding' ? watch.fix : null);

  const recheck = () => {
    checkedAt = Date.now();
  };

  $effect(() => {
    if (status.kind !== 'ready') return;
    const timer = setTimeout(
      recheck,
      Math.min(status.staleAt - Date.now(), LONGEST_TIMER_MS)
    );
    return () => {
      clearTimeout(timer);
    };
  });
  $effect(() => watchVisibility(recheck));

  return {
    get status() {
      return status;
    },
    get fix() {
      return fix;
    },
    get lastFix() {
      return lastFix;
    }
  };
};
