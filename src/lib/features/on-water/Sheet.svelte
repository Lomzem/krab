<script lang="ts">
  import { tick, type Snippet } from 'svelte';

  let {
    open,
    titleId,
    onclose,
    returnFocus,
    heading,
    children,
    footer
  }: {
    open: boolean;
    titleId: string;
    onclose: () => void;
    returnFocus: () => HTMLElement | null | undefined;
    heading: Snippet;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  let dialog = $state<HTMLDialogElement>();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      void tick().then(() => returnFocus()?.focus());
    }
  });
</script>

<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  class="m-0 mt-auto max-h-[88dvh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl bg-card p-0 text-foreground shadow-xl backdrop:bg-black/55 open:flex"
  oncancel={(event) => {
    event.preventDefault();
    onclose();
  }}
  onclick={(event) => {
    if (event.target === dialog) onclose();
  }}
>
  <header class="flex items-center gap-3 border-b border-border py-2 pr-2 pl-4">
    <div class="min-w-0 flex-1">{@render heading()}</div>
    <button
      type="button"
      class="flex size-11 flex-none items-center justify-center rounded-control focus-visible:outline-2 focus-visible:outline-ring"
      onclick={onclose}
    >
      <svg
        class="size-6"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.25"
        stroke-linecap="round"
        aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg
      >
      <span class="sr-only">Close</span>
    </button>
  </header>
  <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
    {@render children()}
  </div>
  {#if footer}
    <footer
      class="flex gap-2 border-t border-border bg-background px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      {@render footer()}
    </footer>
  {/if}
</dialog>
