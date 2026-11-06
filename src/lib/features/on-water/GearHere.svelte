<script lang="ts">
  import type { MapPlace } from '#lib/features/map/index.js';
  import type { HereItem } from './gear-here';
  import GearIcon from './GearIcon.svelte';
  import Sheet from './Sheet.svelte';
  import UncollectedMark from './UncollectedMark.svelte';

  const TITLE_ID = 'gear-here-title';
  const LOOK: Record<MapPlace['layer'], string> = {
    'in-water': 'border-solid border-[#1a2e2b] bg-[#1a2e2b] text-white',
    collected: 'border-dashed border-[#55655f] bg-white text-[#55655f]',
    past: 'border-dotted border-[#55655f] bg-white text-[#55655f]'
  };

  let {
    items,
    apart,
    onpick,
    onclose,
    returnFocus
  }: {
    items: HereItem[];
    apart: boolean;
    onpick: (id: string) => void;
    onclose: () => void;
    returnFocus: () => HTMLElement | null | undefined;
  } = $props();
</script>

<Sheet open={items.length > 0} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    <h2 id={TITLE_ID} class="text-[22px] leading-tight font-semibold">
      {items.length} gear {apart ? 'in this area' : 'here'}
    </h2>
  {/snippet}

  <p class="text-[15px] text-muted-foreground">
    {apart
      ? 'Too close together to pick at this zoom. Zoom in to see them apart, or choose one to open it.'
      : 'Too close together to pick on the map. Choose one to open it.'}
  </p>

  <ul class="-mx-4 mt-3 border-t border-border">
    {#each items as item (item.id)}
      <li class="border-b border-border">
        <button
          type="button"
          class="flex min-h-14 w-full touch-manipulation items-center gap-3 px-4 py-1.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-muted"
          aria-label={[item.name, ...item.details].join(', ')}
          onclick={() => {
            onpick(item.id);
          }}
        >
          <span
            class={[
              'relative inline-flex flex-none items-center rounded-md border-2 p-0.5',
              LOOK[item.layer]
            ]}
          >
            <GearIcon kind={item.kind} size={22} />
            {#if item.uncollected}
              <span class="absolute -top-2 -right-2">
                <UncollectedMark size={14} />
              </span>
            {/if}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[17px] leading-snug font-medium"
              >{item.name}</span
            >
            <span
              class="block text-[15px] leading-snug [overflow-wrap:anywhere] text-muted-foreground"
              >{item.summary}</span
            >
          </span>
        </button>
      </li>
    {/each}
  </ul>
</Sheet>
