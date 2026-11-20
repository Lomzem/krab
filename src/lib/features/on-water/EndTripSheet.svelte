<script lang="ts">
  import type { Trip } from '#lib/features/trip/index.js';
  import { DESTRUCTIVE_BUTTON, PRIMARY_BUTTON } from './controls';
  import Sheet from './Sheet.svelte';
  import type { Notice } from './on-water.svelte';

  const TITLE_ID = 'end-trip-title';
  const LEFT_ID = 'end-trip-left';

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
  describedBy={uncollected > 0 ? LEFT_ID : undefined}
  initialFocus={() => keep}
  {onclose}
  {returnFocus}
  {notice}
>
  {#snippet heading()}
    <h2 id={TITLE_ID} class="text-[22px] leading-tight font-semibold">
      End trip?
    </h2>
  {/snippet}

  {#if uncollected > 0}
    <p id={LEFT_ID} class="text-[16px] leading-normal">
      {uncollected} still in the water
    </p>
  {/if}

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
