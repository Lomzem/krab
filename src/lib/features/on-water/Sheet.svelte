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

  const FOCUSABLE =
    'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex], [contenteditable]:not([contenteditable="false"])';

  let dialog = $state<HTMLDialogElement>();
  let body = $state<HTMLDivElement>();

  const reachable = (element: HTMLElement) =>
    element.tabIndex >= 0 &&
    !element.matches(':disabled') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== 'hidden';

  const tabStops = (root: HTMLElement) => {
    const candidates = [
      ...root.querySelectorAll<HTMLElement>(FOCUSABLE)
    ].filter(reachable);
    const grouped = (element: HTMLElement): element is HTMLInputElement =>
      element instanceof HTMLInputElement &&
      element.type === 'radio' &&
      element.name !== '';
    const groupStop = (radio: HTMLInputElement) => {
      const group = candidates
        .filter(grouped)
        .filter((other) => other.name === radio.name);
      return group.find((other) => other.checked) ?? group[0];
    };
    return candidates.filter(
      (element) => !grouped(element) || groupStop(element) === element
    );
  };

  const cycleFocus = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey)
      return;
    if (!dialog?.open || event.defaultPrevented) return;
    const from = document.activeElement;
    if (from && from !== document.body && !dialog.contains(from)) return;
    event.preventDefault();
    const stops = tabStops(dialog);
    const after = (element: HTMLElement) =>
      from instanceof Node &&
      element !== from &&
      Boolean(
        from.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    const before = (element: HTMLElement) =>
      from instanceof Node &&
      element !== from &&
      !element.contains(from) &&
      Boolean(
        from.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_PRECEDING
      );
    const next = event.shiftKey
      ? (stops.findLast(before) ?? stops.at(-1))
      : (stops.find(after) ?? stops[0]);
    next?.focus();
  };

  const revealFocused = (event: FocusEvent) => {
    const field = event.target;
    if (!(field instanceof HTMLElement)) return;
    requestAnimationFrame(() => {
      if (document.activeElement === field) {
        field.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  };

  const DOUBLE_TAP_MS = 350;
  const DOUBLE_CLICK_MS = 500;
  const DOUBLE_TAP_REACH_PX = 44;
  const PRESS_EVENTS = [
    'pointerdown',
    'mousedown',
    'pointerup',
    'mouseup',
    'click',
    'dblclick'
  ] as const;

  let lastPress: { x: number; y: number } | null = null;
  let endDoublePress = () => {};

  const notePress = (event: PointerEvent) => {
    lastPress = { x: event.clientX, y: event.clientY };
  };

  const noteKey = () => {
    lastPress = null;
  };

  const absorbDoublePress = (press: { x: number; y: number }) => {
    let pressing = false;
    let tapping = true;
    const absorb = (event: Event) => {
      const { type, detail, clientX, clientY } = event as MouseEvent;
      const touch =
        event instanceof PointerEvent && event.pointerType === 'touch';
      if (type === 'pointerdown' && touch) {
        pressing =
          tapping &&
          Math.hypot(clientX - press.x, clientY - press.y) <=
            DOUBLE_TAP_REACH_PX;
      } else if (type === 'pointerdown' || type === 'mousedown') {
        if (detail === 0) return;
        pressing = detail >= 2;
      } else if (type === 'click' && detail === 0) {
        pressing = false;
      }
      if (!pressing) {
        stop();
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const stop = () => {
      clearTimeout(timer);
      clearTimeout(ending);
      for (const type of PRESS_EVENTS)
        window.removeEventListener(type, absorb, true);
    };
    for (const type of PRESS_EVENTS)
      window.addEventListener(type, absorb, true);
    const timer = setTimeout(() => {
      tapping = false;
    }, DOUBLE_TAP_MS);
    const ending = setTimeout(stop, DOUBLE_CLICK_MS);
    return stop;
  };

  $effect(() => () => {
    endDoublePress();
  });

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) {
      endDoublePress();
      lastPress = null;
      dialog.showModal();
      if (body) body.scrollTop = 0;
    } else if (!open && dialog.open) {
      endDoublePress();
      if (lastPress) endDoublePress = absorbDoublePress(lastPress);
      lastPress = null;
      dialog.close();
      void tick().then(() => returnFocus()?.focus());
    }
  });
</script>

<svelte:document onkeydown={cycleFocus} />

<dialog
  bind:this={dialog}
  aria-labelledby={titleId}
  class="m-0 mt-auto max-h-[88dvh] w-full max-w-none flex-col overflow-hidden rounded-t-2xl bg-card p-0 text-foreground shadow-xl backdrop:bg-black/40 open:flex"
  onpointerdown={notePress}
  onkeydown={noteKey}
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
      class="flex size-11 flex-none touch-manipulation items-center justify-center rounded-control text-muted-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onclick={onclose}
    >
      <svg
        class="size-5.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
        aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg
      >
      <span class="sr-only">Close</span>
    </button>
  </header>
  <div
    bind:this={body}
    class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [&_:focus]:scroll-my-4"
    onfocusin={revealFocused}
  >
    {@render children()}
  </div>
  {#if footer}
    <footer
      class="flex flex-wrap gap-2 border-t border-border bg-card px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      {@render footer()}
    </footer>
  {/if}
</dialog>
