<script lang="ts">
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
  <p class="text-[16px]">{text}</p>
  <button
    type="button"
    class={PRIMARY_BUTTON}
    aria-disabled={retrying}
    onclick={() => void retry()}>Retry</button
  >
</div>
