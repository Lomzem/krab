<script lang="ts">
  import { ACTION_BUTTON, FOCUS, QUIET_BUTTON } from './controls';

  let { oncancel, onskip }: { oncancel: () => void; onskip: () => void } =
    $props();

  let heading = $state<HTMLHeadingElement>();

  $effect(() => {
    heading?.focus();
  });
</script>

<section
  class="grid content-center gap-1"
  aria-labelledby="finding-drop-position-title"
>
  <div class="flex min-h-5 items-center gap-2">
    <span
      class="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
      aria-hidden="true"
    ></span>
    <h2
      id="finding-drop-position-title"
      bind:this={heading}
      tabindex="-1"
      class="text-base leading-5 font-semibold {FOCUS}"
    >
      Finding drop position
    </h2>
  </div>
  <div class="grid grid-cols-[auto_1fr] gap-2">
    <button type="button" class={QUIET_BUTTON} onclick={oncancel}>Cancel</button
    >
    <button type="button" class={ACTION_BUTTON} onclick={onskip}
      >Save without position</button
    >
  </div>
</section>
