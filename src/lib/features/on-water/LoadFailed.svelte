<script lang="ts">
  import { Button } from '@ui-sdk/svelte/button';
  import { PRIMARY_BUTTON } from './controls';

  let { text, onretry }: { text: string; onretry: () => Promise<void> } =
    $props();

  let retrying = $state(false);

  const retry = async () => {
    if (retrying) return;
    retrying = true;
    await onretry();
    retrying = false;
  };
</script>

<div class="flex flex-col items-start gap-3 px-4 pt-3 pb-4">
  <p class="text-base">{text}</p>
  <Button
    class={PRIMARY_BUTTON}
    aria-disabled={retrying}
    onclick={() => void retry()}>{retrying ? 'Loading trip' : 'Retry'}</Button
  >
</div>
