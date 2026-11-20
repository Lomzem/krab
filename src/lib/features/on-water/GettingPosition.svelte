<script lang="ts">
  import { ACTION_BUTTON, FOCUS, QUIET_BUTTON } from './controls';

  const DEADLINE_ID = 'finding-drop-position-deadline';

  let {
    deadline,
    now,
    oncancel,
    onskip
  }: {
    deadline: number;
    now: number;
    oncancel: () => void;
    onskip: () => void;
  } = $props();

  let heading = $state<HTMLHeadingElement>();
  const seconds = $derived(Math.max(1, Math.ceil((deadline - now) / 1000)));

  $effect(() => {
    heading?.focus();
  });
</script>

<section
  class="-my-1.5 flex flex-col gap-0.5 compact:my-0 compact:flex-row compact:items-center compact:gap-3"
  aria-labelledby="finding-drop-position-title"
>
  <div class="flex items-center gap-2 compact:flex-1">
    <span
      class="size-4 shrink-0 animate-spin rounded-full border-2 border-primary border-t-transparent motion-reduce:animate-none"
      aria-hidden="true"
    ></span>
    <div class="min-w-0">
      <h2
        id="finding-drop-position-title"
        aria-describedby={DEADLINE_ID}
        bind:this={heading}
        tabindex="-1"
        class="text-base leading-4 font-semibold {FOCUS}"
      >
        Finding drop position
      </h2>
      <p
        aria-hidden="true"
        class="text-xs leading-3.5 text-muted-foreground tabular-nums"
      >
        Saves without position in {seconds}s
      </p>
      <span id={DEADLINE_ID} class="sr-only">Saves without position soon</span>
    </div>
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
