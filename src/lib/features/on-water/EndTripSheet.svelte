<script lang="ts">
  import type { Trip } from '#lib/features/trip/index.js';
  import { DESTRUCTIVE_BUTTON, PRIMARY_BUTTON } from './controls';
  import Sheet from './Sheet.svelte';

  const TITLE_ID = 'end-trip-title';

  let {
    trip,
    open,
    busy,
    onend,
    onclose,
    returnFocus
  }: {
    trip: Trip | null;
    open: boolean;
    busy: boolean;
    onend: () => void;
    onclose: () => void;
    returnFocus: () => HTMLElement | null | undefined;
  } = $props();

  const uncollected = $derived(
    trip ? trip.drops.filter((drop) => drop.collectedAt === null).length : 0
  );
</script>

<Sheet {open} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    <h2 id={TITLE_ID} class="text-[22px] leading-tight font-semibold">
      End this trip?
    </h2>
  {/snippet}

  {#if uncollected > 0}
    <p class="text-[16px] leading-normal">{uncollected} still in the water</p>
  {/if}

  {#snippet footer()}
    <button
      type="button"
      class="flex-1 {DESTRUCTIVE_BUTTON}"
      aria-disabled={busy}
      onclick={() => {
        if (!busy) onend();
      }}>End trip</button
    >
    <button type="button" class="flex-1 {PRIMARY_BUTTON}" onclick={onclose}
      >Keep fishing</button
    >
  {/snippet}
</Sheet>
