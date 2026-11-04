<script lang="ts">
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
  <p class="text-[17px]">{text}</p>
  <button
    type="button"
    class="min-h-12 rounded-control border-2 border-primary px-5 text-[17px] font-bold text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-60"
    aria-disabled={retrying}
    onclick={() => void retry()}>Retry</button
  >
</div>
