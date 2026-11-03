<script lang="ts">
  import { KIND_NAMES, KINDS, type Kind } from '#lib/features/trip/index.js';
  import GearIcon from './GearIcon.svelte';

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

<div class="grid gap-3 border-t border-border bg-card p-3">
  <fieldset class="grid grid-cols-2 gap-2">
    <legend class="sr-only">Gear to drop</legend>
    {#each KINDS as option (option)}
      <label
        class="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-control border border-input text-[17px] font-semibold has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring"
      >
        <input
          class="sr-only"
          type="radio"
          name="drop-kind"
          value={option}
          bind:group={kind}
        />
        <GearIcon kind={option} />
        {KIND_NAMES[option]}
        {#if kind === option}
          <svg
            class="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg
          >
        {/if}
      </label>
    {/each}
  </fieldset>
  <button
    bind:this={button}
    type="button"
    class="flex min-h-18 w-full items-center justify-center gap-3 rounded-control bg-signal text-[24px] font-bold text-signal-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary active:brightness-95"
    onclick={ondrop}
  >
    <GearIcon {kind} size={30} />
    Drop {KIND_NAMES[kind].toLowerCase()}
  </button>
</div>
