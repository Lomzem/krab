<script lang="ts">
  import Sheet from './Sheet.svelte';

  const TITLE_ID = 'location-steps-title';

  let {
    open,
    onclose,
    returnFocus
  }: {
    open: boolean;
    onclose: () => void;
    returnFocus: () => HTMLElement | null | undefined;
  } = $props();
</script>

<Sheet {open} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    <h2 id={TITLE_ID} class="text-title font-semibold">Turn on location</h2>
  {/snippet}

  <ol
    class="grid list-decimal gap-3 pb-2 pl-6 text-base marker:text-muted-foreground"
  >
    <li>Settings › Privacy &amp; Security › Location Services</li>
    <li>Location Services on</li>
    <li>Safari Websites › While Using</li>
    <li>Reopen Krab</li>
  </ol>
</Sheet>
