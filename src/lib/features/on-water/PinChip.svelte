<script lang="ts">
  import { PIN_FOCUS } from './controls';
  import type { MapPlace } from '#lib/features/map/index.js';
  import DayMarker from './DayMarker.svelte';
  import GearIcon from './GearIcon.svelte';
  import {
    CHIP_METRICS,
    MARK_SIZE,
    SELECTED_RING,
    type ChipFace
  } from './pin-chip';
  import UncollectedMark from './UncollectedMark.svelte';

  let {
    face,
    ring = true,
    joined = false,
    selected = false
  }: {
    face: ChipFace;
    ring?: boolean;
    joined?: boolean;
    selected?: boolean;
  } = $props();

  const LOOK: Record<MapPlace['layer'], string> = {
    'in-water':
      'border-solid border-map-ink bg-map-ink text-sm text-map-paper shadow',
    collected:
      'border-dashed border-map-muted bg-map-paper/85 text-sm text-map-muted',
    past: 'border-dotted border-map-muted bg-map-paper/85 text-sm text-map-muted'
  };
  const PAD: Record<MapPlace['layer'], string> = {
    'in-water': 'p-1',
    collected: 'py-0.5 pr-1 pl-0.5',
    past: 'py-0.5 pr-1 pl-0.5'
  };

  const metrics = $derived(CHIP_METRICS[face.layer]);
</script>

<span
  class={[
    'relative inline-flex items-center gap-0.5 rounded-md border-2 leading-none font-semibold whitespace-nowrap tabular-nums',
    LOOK[face.layer],
    face.number === null ? 'p-0.5' : PAD[face.layer],
    joined && 'rounded-r-none',
    selected && SELECTED_RING,
    ring && PIN_FOCUS
  ]}
>
  <GearIcon kind={face.kind} size={metrics.icon} />{face.number ?? ''}
  {#if face.day}
    <DayMarker day={face.day} size={metrics.day} class="ml-1 gap-0.5" />
  {/if}
  {#if face.uncollected}
    <span class="absolute -top-2 -right-2 z-1">
      <UncollectedMark size={MARK_SIZE} />
    </span>
  {/if}
</span>
