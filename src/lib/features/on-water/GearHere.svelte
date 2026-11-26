<script lang="ts">
  import { FOCUS_INSET, PRESS } from '#lib/shared/control-states.js';
  import { spokenItem, type HereItem } from './gear-here';
  import GearIcon from './GearIcon.svelte';
  import type { Layer } from './pin-chip';
  import Sheet from './Sheet.svelte';
  import UncollectedMark from './UncollectedMark.svelte';

  const TITLE_ID = 'gear-here-title';
  const LOOK: Record<Layer, string> = {
    'in-water': 'border-solid border-map-ink bg-map-ink text-map-paper',
    collected: 'border-dashed border-map-muted bg-map-paper text-map-muted',
    past: 'border-dotted border-map-muted bg-map-paper text-map-muted'
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
    <h2 id={TITLE_ID} class="text-title font-semibold">
      {items.length} gear {apart ? 'in this area' : 'here'}
    </h2>
  {/snippet}

  <ul class="-mx-4 mt-3 border-t border-border">
    {#each items as item (item.id)}
      <li class="border-b border-border">
        <button
          type="button"
          class="flex min-h-14 w-full touch-manipulation items-center gap-3 px-4 py-1.5 text-left {FOCUS_INSET} {PRESS} active:bg-muted"
          aria-label={spokenItem(item)}
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
            <span class="block text-control leading-snug font-medium"
              >{item.name}</span
            >{#if item.label}
              <span
                class="line-clamp-2 block text-base leading-snug [overflow-wrap:anywhere]"
                >{item.label}</span
              >
            {/if}
            <span
              class="block text-sm leading-snug [overflow-wrap:anywhere] text-muted-foreground"
              >{item.summary}</span
            >
          </span>
        </button>
      </li>
    {/each}
  </ul>
</Sheet>
