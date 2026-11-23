<script lang="ts">
  import { untrack, type Snippet } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { watchVisibility } from '#lib/page-visibility.js';
  import { FOCUS_INVERSE } from './controls';
  import { Countdown } from './countdown';
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

  let countdown: Countdown | null = null;
  let region: HTMLDivElement | undefined;
  const held = new SvelteSet<string>();
  let left = $state(1);
  let leaving = $state<{ key: number; text: string } | null>(null);

  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  $effect(() =>
    watchVisibility((visible) => {
      if (visible) release('hidden')();
      else hold('hidden')();
    })
  );

  $effect(() => {
    if (!notice) {
      untrack(() => {
        for (const reason of held) if (reason !== 'hidden') held.delete(reason);
      });
      return;
    }
    leaving = null;
    const shownMs = SHOWN_MS[notice.offer.action];
    if (shownMs === null) return;
    const { key, text } = notice;
    const current = new Countdown(shownMs, () => {
      leaving = { key, text };
      ondismiss(key);
    });
    untrack(() => {
      if (!region?.contains(document.activeElement)) held.delete('focus');
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
</script>

<div class="grid min-h-14 grid-cols-1 bg-card">
  <div
    class={[
      'col-start-1 row-start-1 flex min-w-0 items-center',
      notice && 'invisible'
    ]}
    inert={notice !== null}
  >
    {@render children?.()}
  </div>
  {#if leaving && !notice}
    <p
      class="pointer-events-none col-start-1 row-start-1 flex animate-[receipt-out_var(--motion-receipt-out)_ease-in_forwards] items-center bg-inverse px-4 text-base font-medium text-inverse-foreground"
      aria-hidden="true"
      onanimationend={() => {
        leaving = null;
      }}
    >
      <span class="line-clamp-2">{leaving.text}</span>
    </p>
  {/if}
  <div
    role="status"
    aria-label="Messages"
    class={[
      'col-start-1 row-start-1 grid grid-cols-1',
      !notice && 'pointer-events-none'
    ]}
    bind:this={region}
  >
    {#if notice}
      <div
        role="group"
        class="relative flex min-w-0 items-center gap-1 bg-inverse py-1.5 pr-1 pl-4 text-inverse-foreground transition-[opacity,translate] duration-(--motion-receipt-in) ease-out starting:[translate:0_0.25rem] starting:opacity-0"
        onpointerenter={hold('pointer')}
        onpointerleave={release('pointer')}
        ontouchstart={hold('touch')}
        ontouchend={release('touch')}
        ontouchcancel={release('touch')}
        onfocusin={hold('focus')}
        onfocusout={release('focus')}
      >
        <p class="line-clamp-2 flex-1 text-base leading-snug font-medium">
          {notice.text}
        </p>
        {#if notice.offer.action !== 'none' && notice.offer.action !== 'retry'}
          {@const undo = notice.offer}
          <button
            type="button"
            class="{ACTION} text-inverse-action underline underline-offset-4 {FOCUS_INVERSE} aria-disabled:text-inverse-foreground/70 aria-disabled:no-underline"
            aria-disabled={blocked ? 'true' : undefined}
            onclick={() => {
              onundo(undo);
            }}>Undo</button
          >
        {:else if notice.offer.action === 'retry'}
          {@const key = notice.key}
          <button
            type="button"
            class="{ACTION} text-inverse-action underline underline-offset-4 {FOCUS_INVERSE}"
            onclick={() => {
              onretry(key);
            }}>Retry</button
          >
          <button
            type="button"
            class="{ACTION} font-medium text-inverse-foreground {FOCUS_INVERSE}"
            onclick={() => {
              ondismiss(key);
            }}>Dismiss</button
          >
        {/if}
        {#if SHOWN_MS[notice.offer.action] !== null}
          <span
            class="absolute inset-x-0 bottom-0 h-0.75 origin-left bg-inverse-action"
            style:transform="scaleX({left})"
            aria-hidden="true"
          ></span>
        {/if}
      </div>
    {/if}
  </div>
</div>
