<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import type { Lane } from '#lib/features/map/index.js';
  import { Countdown } from './countdown';
  import type { Notice, Offer, Retry, Undo } from './on-water.svelte';

  const TARGET_PX = 44;
  const LIFT_PX = 4;
  const LEAST_PX = TARGET_PX + LIFT_PX;

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
    overlay,
    cover = $bindable(0)
  }: {
    notice: Notice | null;
    onundo: (undo: Undo) => void;
    onretry: (retry: Retry) => void;
    ondismiss: (key: number) => void;
    overlay: Lane | null;
    cover?: number;
  } = $props();

  let inFlow = $state(0);

  const lane = $derived.by(() => {
    if (!overlay) return null;
    const { bottom, room, beside } = overlay;
    if (room === null || room + inFlow >= LEAST_PX) {
      return {
        bottom,
        room: room === null ? null : room + inFlow,
        right: null
      };
    }
    if (beside && beside.room + inFlow >= LEAST_PX) {
      return { bottom, room: beside.room + inFlow, right: beside.right };
    }
    return null;
  });

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

<div
  class={lane ? 'pointer-events-none relative h-0' : 'px-3'}
  bind:clientHeight={inFlow}
>
  <div
    role="status"
    aria-label="Messages"
    class={[
      'flex justify-center',
      lane && 'absolute left-3',
      notice && !lane && 'py-2'
    ]}
    style:right={lane ? `${String(lane.right ?? 12)}px` : null}
    style:bottom={lane ? `${String(lane.bottom)}px` : null}
    style:padding-bottom={lane && notice ? `${String(LIFT_PX)}px` : null}
    style:max-height={lane?.room ? `${String(lane.room)}px` : null}
    bind:this={region}
    bind:clientHeight={cover}
  >
    {#if notice}
      <div
        role="group"
        class={[
          'pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-control bg-inverse pr-1 pl-4 text-inverse-foreground shadow-md',
          lane ? 'py-0' : 'min-h-14 py-1.5'
        ]}
        style:min-height={lane ? `${String(TARGET_PX)}px` : null}
        onpointerenter={hold('pointer')}
        onpointerleave={release('pointer')}
        ontouchstart={hold('touch')}
        ontouchend={release('touch')}
        ontouchcancel={release('touch')}
        onfocusin={hold('focus')}
        onfocusout={release('focus')}
      >
        <p
          class={[
            'flex-1 py-1.5 text-[16px] font-medium',
            lane && 'self-stretch overflow-y-auto'
          ]}
        >
          {notice.text}
        </p>
        {#if notice.offer.action !== 'none' && notice.offer.action !== 'retry'}
          {@const undo = notice.offer}
          <button
            type="button"
            class="min-h-11 min-w-11 touch-manipulation rounded-control px-3 text-[16px] font-semibold text-inverse-action underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverse-action"
            onclick={() => {
              onundo(undo);
            }}>Undo</button
          >
        {:else if notice.offer.action === 'retry'}
          {@const retry = notice.offer.retry}
          {@const key = notice.key}
          <button
            type="button"
            class="min-h-11 min-w-11 touch-manipulation rounded-control px-3 text-[16px] font-semibold text-inverse-action underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverse-action"
            onclick={() => {
              onretry(retry);
            }}>Retry</button
          >
          <button
            type="button"
            class="min-h-11 min-w-11 touch-manipulation rounded-control px-3 text-[16px] font-medium text-inverse-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-inverse-action"
            onclick={() => {
              ondismiss(key);
            }}>Dismiss</button
          >
        {/if}
      </div>
    {/if}
  </div>
</div>
