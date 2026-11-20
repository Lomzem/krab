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

<div class="flex flex-wrap items-stretch gap-2">
  <fieldset
    class="flex min-h-16 grow gap-1 rounded-control bg-muted p-1 compact:min-h-14"
  >
    <legend class="sr-only">Gear to drop</legend>
    {#each KINDS as option (option)}
      <label
        class="flex min-w-16 flex-1 cursor-pointer touch-manipulation items-center justify-center gap-1 rounded-[0.3125rem] px-2 text-base font-medium whitespace-nowrap text-muted-foreground has-checked:bg-card has-checked:text-foreground has-checked:shadow-sm {CHOICE_FOCUS_INSET}"
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
    class="grid min-h-16 min-w-0 grow-999 basis-32 touch-manipulation rounded-control bg-action px-3 py-2 text-control leading-tight font-semibold text-action-foreground compact:min-h-14 compact:py-1 {FOCUS} {PRESS} active:brightness-95"
    onclick={ondrop}
  >
    {#each [false, true] as without (without)}
      <span
        class={[
          'col-start-1 row-start-1 flex items-center gap-2 place-self-center text-left',
          denied !== without && 'invisible'
        ]}
        aria-hidden={denied !== without}
      >
        <GearIcon {kind} size={22} />
        {without ? `Drop ${name} without position` : `Drop ${name}`}
      </span>
    {/each}
  </button>
</div>
