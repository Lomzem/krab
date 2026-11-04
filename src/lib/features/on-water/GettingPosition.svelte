<script lang="ts">
  import { KIND_NAMES, type Kind } from '#lib/features/trip/index.js';

  let {
    kind,
    oncancel,
    onskip
  }: { kind: Kind; oncancel: () => void; onskip: () => void } = $props();

  let heading = $state<HTMLHeadingElement>();

  $effect(() => {
    heading?.focus();
  });
</script>

<section
  class="grid gap-3 border-t border-border bg-card p-4"
  aria-labelledby="getting-position-title"
>
  <div class="flex items-center gap-3">
    <span
      class="size-5 shrink-0 animate-spin rounded-full border-3 border-primary border-t-transparent motion-reduce:animate-none"
      aria-hidden="true"
    ></span>
    <h2
      id="getting-position-title"
      bind:this={heading}
      tabindex="-1"
      class="text-[21px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      Getting position
    </h2>
  </div>
  <p class="text-[17px]">
    Hold still. If no position arrives within 20 seconds, the {KIND_NAMES[
      kind
    ].toLowerCase()} is saved without one.
  </p>
  <div class="grid grid-cols-2 gap-2">
    <button
      type="button"
      class="min-h-14 rounded-control border border-input px-3 text-[17px] font-semibold focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onclick={oncancel}>Cancel</button
    >
    <button
      type="button"
      class="min-h-14 rounded-control bg-primary px-3 text-[17px] font-bold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onclick={onskip}>Save without position</button
    >
  </div>
</section>
