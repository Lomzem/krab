<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
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
    ondismiss,
    covers = $bindable(0)
  }: {
    notice: Notice | null;
    onundo: (undo: Undo) => void;
    onretry: (retry: Retry) => void;
    ondismiss: (key: number) => void;
    covers?: number;
  } = $props();

  let countdown: Countdown | null = null;
  let region: HTMLDivElement | undefined;
  const held = new SvelteSet<string>();

  $effect(() => {
    if (!notice) {
      untrack(() => {
        held.clear();
      });
      return;
    }
    const shownMs = SHOWN_MS[notice.offer.action];
    if (shownMs === null) return;
    const { key } = notice;
    const current = new Countdown(shownMs, () => {
      ondismiss(key);
    });
    untrack(() => {
      if (!region?.contains(document.activeElement)) held.delete('focus');
      for (const reason of held) current.hold(reason);
    });
    countdown = current;
    return () => {
      current.cancel();
    };
  });

  const hold = (reason: string) => () => {
    held.add(reason);
    countdown?.hold(reason);
  };
  const release = (reason: string) => () => {
    held.delete(reason);
    countdown?.release(reason);
  };
</script>

<div class="pointer-events-none relative h-0">
  <div
    role="status"
    aria-label="Messages"
    class="absolute inset-x-3 bottom-0 flex justify-center"
    class:pb-3={notice}
    bind:clientHeight={covers}
    bind:this={region}
  >
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
