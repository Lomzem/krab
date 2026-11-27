<script lang="ts">
  import {
    createToaster,
    Toast,
    ToastAction,
    ToastRegion,
    ToastTitle
  } from '@ui-sdk/svelte/toast';
  import { untrack, type Snippet } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { watchVisibility } from '#lib/shared/page-visibility.js';
  import { FOCUS, FOCUS_INVERSE } from '#lib/shared/control-states.js';
  import { Countdown } from './countdown';
  import { coverRow } from './cover-row';
  import { modalOpen } from './modal.svelte';
  import type { Notice, Offer, Undo } from './on-water.svelte';

  const SHOWN_MS: Record<Offer['action'], number | null> = {
    none: 4000,
    'undo-drop': 8000,
    restore: 8000,
    'undo-collect': 8000,
    retry: null
  };
  const STEP_MS = 1000;
  const ACTION =
    'min-h-11 min-w-11 flex-none touch-manipulation rounded-control px-3 text-base font-semibold';

  let {
    notice,
    onundo,
    onretry,
    ondismiss,
    blocked = false,
    children
  }: {
    notice: Notice | null;
    onundo: (undo: Undo) => void;
    onretry: (key: number) => void;
    ondismiss: (key: number) => void;
    blocked?: boolean;
    children?: Snippet;
  } = $props();

  const toaster = createToaster({ duration: Infinity });
  let toastId: string | null = null;
  let toastsShown = 0;
  let toastShows: { key: number; text: string } | null = null;

  let countdown: Countdown | null = null;
  let row = $state<HTMLDivElement>();
  let item: HTMLElement | undefined;
  const held = new SvelteSet<string>();
  const touches = new SvelteSet<number>();
  let left = $state(1);
  const showing = $derived(notice !== null);
  const covered = $derived(modalOpen());

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  $effect.pre(() => {
    const next = notice;
    untrack(() => {
      if (!next) {
        if (toastId !== null) toaster.dismiss(toastId);
        toastId = null;
        toastShows = null;
        return;
      }
      if (next.key === toastShows?.key && next.text === toastShows.text) return;
      toastShows = { key: next.key, text: next.text };
      const shown = {
        title: next.text,
        duration: Infinity,
        dismissible: false
      };
      if (toastId !== null && toaster.update(toastId, shown)) return;
      toastId = toaster({ ...shown, id: `notice-${String(++toastsShown)}` });
    });
  });

  $effect(() => () => {
    toaster.dismiss();
  });

  $effect(() =>
    watchVisibility((visible) => {
      if (visible) release('hidden')();
      else hold('hidden')();
    })
  );

  $effect(() => {
    if (!notice) {
      untrack(() => {
        touches.clear();
        for (const reason of held) if (reason !== 'hidden') held.delete(reason);
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
      if (!item?.contains(document.activeElement)) held.delete('focus');
      for (const reason of held) current.hold(reason);
    });
    countdown = current;
    const stepped = reduced();
    let frame = 0;
    const draw = () => {
      const remaining = current.remaining();
      left =
        (stepped ? Math.ceil(remaining / STEP_MS) * STEP_MS : remaining) /
        shownMs;
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
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
  const touchStart = (event: TouchEvent) => {
    for (const touch of event.changedTouches) touches.add(touch.identifier);
    hold('touch')();
  };
  const touchEnd = (event: TouchEvent) => {
    for (const touch of event.changedTouches) touches.delete(touch.identifier);
    if (touches.size === 0) release('touch')();
  };
</script>

<div class="grid min-h-14 grid-cols-1 bg-card" bind:this={row}>
  <div
    class={[
      'col-start-1 row-start-1 flex min-w-0 items-center',
      notice && 'invisible'
    ]}
    inert={notice !== null}
  >
    {@render children?.()}
  </div>
</div>

<ToastRegion
  {toaster}
  aria-label="Messages"
  shortcut={covered ? null : 'F6'}
  inert={covered}
  class="pointer-events-none *:grid *:h-full {covered ? 'opacity-0' : ''}"
  {@attach showing && row ? coverRow(row) : undefined}
>
  <Toast
    class="pointer-events-auto relative flex min-w-0 items-center gap-1 bg-inverse py-1.5 pr-1 pl-4 text-inverse-foreground transition-[opacity,translate] duration-(--motion-receipt-in) ease-out data-starting-style:translate-y-1 data-starting-style:opacity-0 {FOCUS}"
    {@attach (element: HTMLElement) => {
      item = element;
      return () => {
        if (item === element) item = undefined;
      };
    }}
    onpointerenter={hold('pointer')}
    onpointerleave={release('pointer')}
    ontouchstart={touchStart}
    ontouchend={touchEnd}
    ontouchcancel={touchEnd}
    onfocusin={hold('focus')}
    onfocusout={release('focus')}
  >
    {#snippet render({ props })}
      <li {...props} tabindex="-1">
        <ToastTitle
          class="line-clamp-2 flex-1 text-base leading-snug font-medium"
        />
        {#if notice && notice.offer.action !== 'none' && notice.offer.action !== 'retry'}
          {@const undo = notice.offer}
          <ToastAction
            class="{ACTION} text-inverse-action underline underline-offset-4 {FOCUS_INVERSE} aria-disabled:text-inverse-foreground/70 aria-disabled:no-underline"
            aria-disabled={blocked ? 'true' : undefined}
            dismiss={false}
            onAction={() => {
              onundo(undo);
            }}>Undo</ToastAction
          >
        {:else if notice?.offer.action === 'retry'}
          {@const key = notice.key}
          <ToastAction
            class="{ACTION} text-inverse-action underline underline-offset-4 {FOCUS_INVERSE}"
            dismiss={false}
            onAction={() => {
              onretry(key);
            }}>Retry</ToastAction
          >
          <ToastAction
            class="{ACTION} font-medium text-inverse-foreground {FOCUS_INVERSE}"
            dismiss={false}
            onAction={() => {
              ondismiss(key);
            }}>Dismiss</ToastAction
          >
        {/if}
        {#if notice && SHOWN_MS[notice.offer.action] !== null}
          <span
            class="absolute inset-x-0 bottom-0 h-0.75 origin-left bg-inverse-action"
            style:transform="scaleX({left})"
            aria-hidden="true"
          ></span>
        {/if}
      </li>
    {/snippet}
  </Toast>
</ToastRegion>
