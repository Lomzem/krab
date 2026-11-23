<script lang="ts">
  import type { Trip } from '#lib/features/trip/index.js';
  import { DESTRUCTIVE_BUTTON, PRIMARY_BUTTON } from './controls';
  import Sheet from './Sheet.svelte';
  import type { Notice } from './on-water.svelte';

  const TITLE_ID = 'end-trip-title';
  const NOTE_ID = 'end-trip-note';

  let {
    trip,
    open,
    busy,
    onend,
    onclose,
    returnFocus,
    notice
  }: {
    trip: Trip | null;
    open: boolean;
    busy: boolean;
    onend: () => void;
    onclose: () => void;
    returnFocus: () => HTMLElement | null | undefined;
    notice: Notice | null;
  } = $props();

  const uncollected = $derived(
    trip ? trip.drops.filter((drop) => drop.collectedAt === null).length : 0
  );

  let keep = $state<HTMLButtonElement>();
</script>

<Sheet
  {open}
  titleId={TITLE_ID}
  describedBy={NOTE_ID}
  initialFocus={() => keep}
  {onclose}
  {returnFocus}
  {notice}
>
  {#snippet heading()}
    <h2 id={TITLE_ID} class="text-title font-semibold">End trip?</h2>
  {/snippet}

  <div id={NOTE_ID} class="space-y-1 text-base leading-normal">
    {#if uncollected > 0}
      <p>{uncollected} still in the water</p>
    {/if}
    <p class="text-muted-foreground">Kept in Past trips</p>
  </div>

  {#snippet footer()}
    <button
      bind:this={keep}
      type="button"
      class="flex-1 basis-36 {PRIMARY_BUTTON}"
      onclick={onclose}>Keep trip going</button
    >
    <button
      type="button"
      class="flex-1 basis-36 {DESTRUCTIVE_BUTTON}"
      aria-disabled={busy}
      onclick={() => {
        if (!busy) onend();
      }}>End trip</button
    >
  {/snippet}
</Sheet>
