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
  class="flex flex-col gap-1 compact:flex-row compact:items-center compact:gap-3"
  aria-labelledby="finding-drop-position-title"
>
  <div class="flex min-h-4 items-center gap-2 compact:flex-1">
    <span
      class="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
      aria-hidden="true"
    ></span>
    <h2
      id="finding-drop-position-title"
      bind:this={heading}
      tabindex="-1"
      class="text-base leading-4 font-semibold {FOCUS}"
    >
      Finding drop position
    </h2>
  </div>
  <div class="grid grid-cols-[auto_1fr] gap-2 compact:flex-none">
    <button
      type="button"
      class="min-h-11! px-3! text-base! {QUIET_BUTTON}"
      onclick={oncancel}>Cancel</button
    >
    <button
      type="button"
      class="min-h-11! px-3! text-base! {ACTION_BUTTON}"
      onclick={onskip}>Save without position</button
    >
  </div>
</section>
