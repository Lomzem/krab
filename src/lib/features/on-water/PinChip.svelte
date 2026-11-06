<script lang="ts">
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
      'border-solid border-[#1a2e2b] bg-[#1a2e2b] text-[14px] text-white shadow',
    collected:
      'border-dashed border-[#55655f] bg-white/85 text-[13px] text-[#55655f]',
    past: 'border-dotted border-[#55655f] bg-white/85 text-[13px] text-[#55655f]'
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
    ring &&
      'group-focus-visible:outline-3 group-focus-visible:outline-offset-3 group-focus-visible:outline-[#1d4ed8]'
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
