<script lang="ts">
  import type { Trip } from '#lib/features/trip/index.js';
  import Confirm from './Confirm.svelte';
  import type { Notice } from './on-water.svelte';

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
</script>

<Confirm
  {open}
  title="End trip?"
  keep="Keep trip going"
  go="End trip"
  {busy}
  onkeep={onclose}
  ongo={onend}
  {returnFocus}
  {notice}
>
  {#if uncollected > 0}
    <p>{uncollected} still in the water</p>
  {/if}
  <p class="text-muted-foreground">Kept in Past trips</p>
</Confirm>
