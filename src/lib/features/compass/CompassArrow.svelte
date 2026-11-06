<script lang="ts">
  import type { Snippet } from 'svelte';
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

  const CAPTIONS: Record<CompassState['kind'], string> = {
    usable: 'Compass on',
    off: 'Turn on compass',
    waiting: 'Paused',
    starting: 'Starting',
    calibrating: 'Compass needs calibrating',
    unavailable: 'No compass'
  };

  let {
    bearingDeg,
    point,
    compass,
    ontoggle,
    beside
  }: {
    bearingDeg: number;
    point: string;
    compass: CompassState;
    ontoggle: () => void;
    beside?: Snippet;
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

<div
  class={beside
    ? 'grid flex-none grid-cols-[auto_auto] items-center gap-x-2.5'
    : 'flex flex-none flex-col items-center'}
>
  <button
    type="button"
    class={[
      'grid size-11 touch-manipulation place-items-center rounded-full border focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring',
      compass.kind === 'usable'
        ? 'border-primary bg-accent text-accent-foreground'
        : 'border-input bg-card'
    ]}
    aria-label={label}
    onclick={ontoggle}
  >
    <BearingArrow degrees={shown} />
  </button>
  {@render beside?.()}
  <span
    class={[
      'text-center text-[12px] leading-tight font-medium text-muted-foreground',
      beside ? 'col-span-2 max-w-36 justify-self-center' : 'max-w-24'
    ]}
    aria-hidden="true">{CAPTIONS[compass.kind]}</span
  >
</div>
