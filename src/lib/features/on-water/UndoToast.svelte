<script lang="ts">
  import { Countdown } from './countdown';
  import type { Notice, Retry } from './on-water.svelte';

  const UNDO_MS = 8000;
  const NOTE_MS = 4000;

  let {
    notice,
    onundo,
    onretry,
    ondismiss
  }: {
    notice: Notice | null;
    onundo: (undo: NonNullable<Notice['undo']>) => void;
    onretry: (retry: Retry) => void;
    ondismiss: (key: number) => void;
  } = $props();

  let countdown: Countdown | null = null;

  $effect(() => {
    if (!notice || notice.retry) return;
    const { key } = notice;
    const current = new Countdown(notice.undo ? UNDO_MS : NOTE_MS, () => {
      ondismiss(key);
    });
    countdown = current;
    return () => {
      current.cancel();
    };
  });

  const hold = (reason: string) => () => {
    countdown?.hold(reason);
  };
  const release = (reason: string) => () => {
    countdown?.release(reason);
  };
</script>

<div class="pointer-events-none relative h-0">
  <div role="status" class="absolute inset-x-3 bottom-3 flex justify-center">
    {#if notice}
      <div
        role="group"
        class="pointer-events-auto flex min-h-14 w-full max-w-md items-center gap-3 rounded-control bg-primary py-1.5 pr-1.5 pl-4 text-primary-foreground shadow-lg"
        onpointerenter={hold('pointer')}
        onpointerleave={release('pointer')}
        ontouchstart={hold('touch')}
        ontouchend={release('touch')}
        ontouchcancel={release('touch')}
        onfocusin={hold('focus')}
        onfocusout={release('focus')}
      >
        <p class="flex-1 py-1.5 text-[17px] font-semibold">{notice.text}</p>
        {#if notice.undo}
          {@const undo = notice.undo}
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-control px-4 text-[17px] font-bold text-primary-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tab-mark"
            onclick={() => {
              onundo(undo);
            }}>Undo</button
          >
        {/if}
        {#if notice.retry}
          {@const retry = notice.retry}
          {@const key = notice.key}
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-control px-4 text-[17px] font-bold text-primary-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tab-mark"
            onclick={() => {
              onretry(retry);
            }}>Retry</button
          >
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-control px-3 text-[17px] font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tab-mark"
            onclick={() => {
              ondismiss(key);
            }}>Dismiss</button
          >
        {/if}
      </div>
    {/if}
  </div>
</div>
