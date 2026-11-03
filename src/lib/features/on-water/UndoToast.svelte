<script lang="ts">
  import { Countdown } from './countdown';
  import type { Notice, Offer, Retry, Undo } from './on-water.svelte';

  const SHOWN_MS: Record<Offer['action'], number | null> = {
    none: 4000,
    'undo-drop': 8000,
    restore: 8000,
    'undo-collect': 8000,
    retry: null
  };

  let {
    notice,
    onundo,
    onretry,
    ondismiss
  }: {
    notice: Notice | null;
    onundo: (undo: Undo) => void;
    onretry: (retry: Retry) => void;
    ondismiss: (key: number) => void;
  } = $props();

  let countdown: Countdown | null = null;

  $effect(() => {
    if (!notice) return;
    const shownMs = SHOWN_MS[notice.offer.action];
    if (shownMs === null) return;
    const { key } = notice;
    const current = new Countdown(shownMs, () => {
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
        {#if notice.offer.action !== 'none' && notice.offer.action !== 'retry'}
          {@const undo = notice.offer}
          <button
            type="button"
            class="min-h-11 min-w-11 rounded-control px-4 text-[17px] font-bold text-primary-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tab-mark"
            onclick={() => {
              onundo(undo);
            }}>Undo</button
          >
        {:else if notice.offer.action === 'retry'}
          {@const retry = notice.offer.retry}
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
