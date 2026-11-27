<script lang="ts">
  import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogTitle,
    type DialogOpenChangeDetails
  } from '@ui-sdk/svelte/dialog';
  import Icon from '#lib/shared/Icon.svelte';
  import { FOCUS } from '#lib/shared/control-states.js';
  import { untrack, type Snippet } from 'svelte';
  import { doublePressGuard } from './double-press';
  import type { Notice } from './on-water.svelte';

  type Dismissal = 'outside-press' | 'swipe';

  let {
    open,
    title,
    subtitle,
    onclose,
    onbackdrop,
    returnFocus,
    notice = null,
    describedBy,
    children,
    footer
  }: {
    open: boolean;
    title: Snippet;
    subtitle?: Snippet;
    onclose: () => void;
    onbackdrop?: () => void;
    returnFocus: () => HTMLElement | null | undefined;
    notice?: Notice | null;
    describedBy?: string;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  let openedAt = $state(0);
  const said = $derived(notice && notice.key > openedAt ? notice.text : '');

  const backdropped = (reason: string): reason is Dismissal =>
    reason === 'outside-press' || reason === 'swipe';

  const presses = doublePressGuard();

  $effect(() => () => {
    presses.stop();
  });

  $effect.pre(() => {
    if (!open) return;
    untrack(() => {
      presses.stop();
      presses.forget();
      openedAt = notice?.key ?? 0;
    });
    return () => {
      presses.absorb();
      presses.forget();
    };
  });

  const changeOpen = (next: boolean, details: DialogOpenChangeDetails) => {
    if (next) return;
    details.cancel();
    if (backdropped(details.reason)) (onbackdrop ?? onclose)();
    else onclose();
  };
</script>

<Dialog {open} presentation="sheet" onOpenChange={changeOpen}>
  <DialogContent
    aria-describedby={describedBy}
    finalFocus={() => returnFocus() ?? undefined}
    class="flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-card text-foreground shadow-xl [--sheet-backdrop:color-mix(in_oklab,var(--color-scrim)_40%,transparent)]"
    onpointerdown={presses.note}
    onkeydown={presses.forget}
  >
    <header
      class="flex items-center gap-3 border-b border-border py-2 pr-2 pl-4"
    >
      <div class="min-w-0 flex-1">
        <DialogTitle class="flex items-center gap-2 text-title font-semibold"
          >{@render title()}</DialogTitle
        >
        {@render subtitle?.()}
      </div>
      <DialogClose
        class="flex size-11 flex-none touch-manipulation items-center justify-center rounded-control text-muted-foreground {FOCUS}"
      >
        <Icon name="close" />
        <span class="sr-only">Close</span>
      </DialogClose>
    </header>
    <div
      class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [&_:focus]:scroll-my-4"
    >
      {@render children()}
    </div>
    <p
      class={said &&
        'border-t border-border px-4 pt-3 text-base leading-snug font-medium'}
    >
      {said}
    </p>
    {#if footer}
      <footer
        class="flex flex-wrap gap-2 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      >
        {@render footer()}
      </footer>
    {/if}
  </DialogContent>
</Dialog>
