<script lang="ts">
  import type { Trip } from '#lib/features/trip/index.js';
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
  const outcome = $derived.by(() => {
    if (uncollected === 0) {
      return 'Everything has been collected. The trip moves to past trips.';
    }
    if (uncollected === 1) {
      return "1 drop is still in the water. It'll be saved as uncollected.";
    }
    return `${String(uncollected)} drops are still in the water. They'll be saved as uncollected.`;
  });
</script>

<Sheet {open} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    <h2 id={TITLE_ID} class="text-[26px] leading-tight font-bold">
      End this trip?
    </h2>
  {/snippet}

  <p class="text-[18px]">{outcome}</p>

  {#snippet footer()}
    <button
      type="button"
      class="min-h-13 flex-1 rounded-control border-2 border-destructive px-4 text-[18px] font-bold text-destructive focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-60"
      aria-disabled={busy}
      onclick={() => {
        if (!busy) onend();
      }}>End trip</button
    >
    <button
      type="button"
      class="min-h-13 flex-1 rounded-control border-2 border-primary px-4 text-[18px] font-bold text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onclick={onclose}>Keep fishing</button
    >
  {/snippet}
</Sheet>
