<script lang="ts">
  import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogTitle
  } from '@ui-sdk/svelte/alert-dialog';
  import { Button } from '@ui-sdk/svelte/button';
  import { elementRef } from '#lib/shared/element-ref.js';
  import { untrack, type Snippet } from 'svelte';
  import { DESTRUCTIVE_BUTTON, PRIMARY_BUTTON } from './controls';
  import { doublePressGuard } from './double-press';
  import { openModal } from './modal.svelte';
  import type { Notice } from './on-water.svelte';

  let {
    open,
    title,
    keep,
    go,
    busy = false,
    onkeep,
    ongo,
    returnFocus,
    notice = null,
    children
  }: {
    open: boolean;
    title: string;
    keep: string;
    go: string;
    busy?: boolean;
    onkeep: () => void;
    ongo: () => void;
    returnFocus: (() => HTMLElement | null | undefined) | 'none';
    notice?: Notice | null;
    children?: Snippet;
  } = $props();

  let keepButton = $state<HTMLButtonElement>();
  let openedAt = $state(0);
  const said = $derived(notice && notice.key > openedAt ? notice.text : '');

  const presses = doublePressGuard();

  $effect(() => () => {
    presses.stop();
  });

  $effect(() => (open ? openModal() : undefined));

  const keepUnlessBusy = () => {
    if (!busy) onkeep();
  };

  const asked = $derived(open ? title : null);

  $effect.pre(() => {
    if (asked === null) return;
    untrack(() => {
      presses.absorb();
      presses.forget();
      openedAt = notice?.key ?? 0;
    });
    return () => {
      presses.absorb();
      presses.forget();
    };
  });
</script>

<svelte:window
  onpointerdowncapture={presses.note}
  onkeydowncapture={presses.forget}
/>

<AlertDialog
  {open}
  onOpenChange={(next, details) => {
    if (next) return;
    details.cancel();
    keepUnlessBusy();
  }}
>
  <AlertDialogContent
    initialFocus={() => keepButton}
    finalFocus={returnFocus === 'none'
      ? 'none'
      : () => returnFocus() ?? undefined}
    class="fixed inset-0 m-auto h-fit w-[min(24rem,calc(100%-2rem))] rounded-2xl bg-card p-4 text-foreground shadow-xl backdrop:bg-scrim/40"
  >
    <AlertDialogTitle class="text-title font-semibold">{title}</AlertDialogTitle
    >
    {#if children}
      <AlertDialogDescription>
        {#snippet render({ props })}
          <div {...props} class="mt-2 space-y-1 text-base leading-normal">
            {@render children?.()}
          </div>
        {/snippet}
      </AlertDialogDescription>
    {/if}
    <p class={said && 'mt-3 text-base leading-snug font-medium'}>
      {said}
    </p>
    <div class="mt-4 flex flex-wrap gap-2">
      <Button
        {@attach elementRef<HTMLButtonElement>((element) => {
          keepButton = element;
        })}
        class="flex-1 basis-36 {PRIMARY_BUTTON}"
        aria-disabled={busy}
        onclick={keepUnlessBusy}>{keep}</Button
      >
      <Button
        class="flex-1 basis-36 {DESTRUCTIVE_BUTTON}"
        aria-disabled={busy}
        onclick={() => {
          if (!busy) ongo();
        }}>{go}</Button
      >
    </div>
  </AlertDialogContent>
</AlertDialog>
