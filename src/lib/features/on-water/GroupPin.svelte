<script lang="ts">
  import type { MapPlace } from '#lib/features/map/index.js';
  import { groupChip, type HereItem } from './gear-here';
  import PinChip from './PinChip.svelte';
  import { MARK_SIZE, SELECTED_RING } from './pin-chip';
  import UncollectedMark from './UncollectedMark.svelte';

  let {
    lead,
    items,
    apart,
    selected = false,
    onopen
  }: {
    lead: HereItem;
    items: HereItem[];
    apart: boolean;
    selected?: boolean;
    onopen: (opener: HTMLElement) => void;
  } = $props();

  const SEGMENT: Record<MapPlace['layer'], string> = {
    'in-water': 'border-solid border-[#1a2e2b] bg-white text-[#1a2e2b] shadow',
    collected: 'border-dashed border-[#55655f] bg-white/85 text-[#55655f]',
    past: 'border-dotted border-[#55655f] bg-white/85 text-[#55655f]'
  };

  const chip = $derived(groupChip(lead, items, apart));
</script>

<button
  type="button"
  class="group grid size-11 place-items-center focus-visible:outline-none"
  aria-label={chip.label}
  aria-haspopup="dialog"
  aria-current={selected || undefined}
  data-drops={items.map(({ id }) => id).join(' ')}
  onclick={(event) => {
    onopen(event.currentTarget);
  }}
>
  <span class="relative grid place-items-center">
    <span class="invisible" aria-hidden="true">
      <PinChip face={chip.face} ring={false} />
    </span>
    <span
      class={[
        'absolute top-0 left-0 inline-flex rounded-md group-focus-visible:outline-3 group-focus-visible:outline-offset-3 group-focus-visible:outline-[#1d4ed8]',
        selected && SELECTED_RING
      ]}
    >
      <PinChip face={chip.face} ring={false} joined />
      <span
        class={[
          'inline-flex items-center rounded-r-md border-2 border-l-0 px-1 text-[13px] leading-none font-semibold whitespace-nowrap tabular-nums',
          SEGMENT[chip.others]
        ]}>+{chip.more}</span
      >
      {#if chip.uncollected}
        <span class="absolute -top-2 -right-2 z-1">
          <UncollectedMark size={MARK_SIZE} />
        </span>
      {/if}
    </span>
  </span>
</button>
