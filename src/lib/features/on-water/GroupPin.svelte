<script lang="ts">
  import { PIN_FOCUS } from '#lib/shared/control-states.js';
  import { groupChip, type HereItem } from './gear-here';
  import PinChip from './PinChip.svelte';
  import { MARK_SIZE, SELECTED_RING, type Layer } from './pin-chip';
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

  const SEGMENT: Record<Layer, string> = {
    'in-water': 'border-solid border-map-ink bg-map-paper text-map-ink shadow',
    collected: 'border-dashed border-map-muted bg-map-paper/85 text-map-muted',
    past: 'border-dotted border-map-muted bg-map-paper/85 text-map-muted'
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
        `absolute top-0 left-0 inline-flex rounded-md ${PIN_FOCUS}`,
        selected && SELECTED_RING
      ]}
    >
      <PinChip face={chip.face} ring={false} joined />
      <span
        class={[
          'inline-flex items-center rounded-r-md border-2 border-l-0 px-1 text-sm leading-none font-semibold whitespace-nowrap tabular-nums',
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
