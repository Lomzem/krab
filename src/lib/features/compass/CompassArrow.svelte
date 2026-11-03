<script lang="ts">
  import BearingArrow from './BearingArrow.svelte';
  import { arrowDeg } from './heading';
  import type { CompassState } from './types';

  const STATES: Record<Exclude<CompassState['kind'], 'usable'>, string> = {
    off: 'Compass off',
    waiting: 'Compass paused',
    starting: 'Compass starting',
    calibrating: 'Compass needs calibrating',
    unavailable: 'Compass unavailable'
  };

  let {
    bearingDeg,
    point,
    compass,
    ontoggle
  }: {
    bearingDeg: number;
    point: string;
    compass: CompassState;
    ontoggle: () => void;
  } = $props();

  const shown = $derived(arrowDeg(bearingDeg, compass));

  const clockOf = (deg: number) => {
    const hour = Math.round(deg / 30) % 12;
    return hour === 0 ? 'straight ahead' : `at ${String(hour)} o'clock`;
  };

  const label = $derived(
    compass.kind === 'usable'
      ? `Compass on, gear ${clockOf(shown)}`
      : `${STATES[compass.kind]}, gear to the ${point}`
  );
</script>

<div class="flex flex-none flex-col items-center">
  <button
    type="button"
    class={[
      'grid size-11 place-items-center rounded-full focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
      compass.kind === 'usable' && 'bg-muted'
    ]}
    aria-label={label}
    onclick={ontoggle}
  >
    <BearingArrow degrees={shown} />
  </button>
  {#if compass.kind === 'calibrating'}
    <span
      class="max-w-24 text-center text-[13px] leading-tight font-semibold text-muted-foreground"
      aria-hidden="true">Compass needs calibrating</span
    >
  {/if}
</div>
