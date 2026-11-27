<script lang="ts">
  import Sheet from './Sheet.svelte';

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

<Sheet {open} {onclose} {returnFocus}>
  {#snippet title()}Turn on location{/snippet}

  <ol
    class="grid list-decimal gap-3 pb-2 pl-6 text-base marker:text-muted-foreground"
  >
    <li>Settings › Privacy &amp; Security › Location Services</li>
    <li>Location Services on</li>
    <li>Safari Websites › While Using</li>
    <li>Reopen Krab</li>
  </ol>
</Sheet>
