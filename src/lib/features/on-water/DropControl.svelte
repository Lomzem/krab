<script lang="ts">
  import { KIND_NAMES, KINDS, type Kind } from '#lib/features/trip/index.js';
  import GearIcon from './GearIcon.svelte';
  import SelectedCheck from './SelectedCheck.svelte';

  let {
    kind = $bindable('pot'),
    button = $bindable(),
    ondrop
  }: {
    kind?: Kind;
    button?: HTMLButtonElement;
    ondrop: () => void;
  } = $props();
</script>

<div
  class="flex flex-wrap items-stretch gap-2 border-t border-border bg-card px-3 py-2"
>
  <fieldset
    class="flex grow flex-wrap gap-0.5 rounded-control border border-input p-0.75"
  >
    <legend class="sr-only">Gear to drop</legend>
    {#each KINDS as option (option)}
      <label
        class="flex min-h-11 min-w-16 grow cursor-pointer touch-manipulation items-center justify-center gap-1 rounded-[0.3125rem] px-2 text-[16px] font-medium whitespace-nowrap text-muted-foreground has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline-3 has-focus-visible:outline-offset-1 has-focus-visible:outline-ring"
      >
        <input
          class="sr-only"
          type="radio"
          name="drop-kind"
          value={option}
          bind:group={kind}
        />
        {KIND_NAMES[option]}
        <SelectedCheck shown={kind === option} />
      </label>
    {/each}
  </fieldset>
  <button
    bind:this={button}
    type="button"
    class="flex min-h-13 grow-999 touch-manipulation items-center justify-center gap-2 rounded-control bg-action px-3 text-[18px] font-semibold whitespace-nowrap text-action-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:brightness-95"
    onclick={ondrop}
  >
    <GearIcon {kind} size={22} />
    Drop {KIND_NAMES[kind].toLowerCase()}
  </button>
</div>
