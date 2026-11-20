<script lang="ts">
  import { CHOICE_FOCUS_INSET, FOCUS, PRESS } from './controls';
  import { KIND_NAMES, KINDS, type Kind } from '#lib/features/trip/index.js';
  import GearIcon from './GearIcon.svelte';
  import SelectedCheck from './SelectedCheck.svelte';

  let {
    kind = $bindable('pot'),
    button = $bindable(),
    denied,
    ondrop
  }: {
    kind?: Kind;
    button?: HTMLButtonElement;
    denied: boolean;
    ondrop: () => void;
  } = $props();

  const name = $derived(KIND_NAMES[kind].toLowerCase());
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
        class="flex min-h-11 min-w-16 grow cursor-pointer touch-manipulation items-center justify-center gap-1 rounded-[0.3125rem] px-2 text-base font-medium whitespace-nowrap text-muted-foreground has-checked:bg-accent has-checked:text-accent-foreground {CHOICE_FOCUS_INSET}"
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
    class="flex min-h-13 grow-999 touch-manipulation items-center justify-center gap-2 rounded-control bg-action px-3 py-1 text-control leading-tight font-semibold text-action-foreground {FOCUS} {PRESS} active:brightness-95"
    onclick={ondrop}
  >
    <GearIcon {kind} size={22} />
    <span class="grid text-center">
      <span
        class={[
          'col-start-1 row-start-1 whitespace-nowrap',
          denied && 'invisible'
        ]}
        aria-hidden={denied}>Drop {name}</span
      >
      <span
        class={[
          'col-start-1 row-start-1 w-0 min-w-full',
          !denied && 'invisible'
        ]}
        aria-hidden={!denied}>Drop {name} without position</span
      >
    </span>
  </button>
</div>
