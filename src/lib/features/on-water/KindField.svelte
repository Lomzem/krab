<script lang="ts">
  import { CHOICE_FOCUS } from './controls';
  import { KIND_NAMES, KINDS, type Kind } from '#lib/features/trip/index.js';
  import GearIcon from './GearIcon.svelte';
  import SelectedCheck from './SelectedCheck.svelte';

  let {
    kind = $bindable('pot'),
    stored,
    locked,
    idPrefix
  }: {
    kind?: Kind;
    stored: Kind;
    locked: boolean;
    idPrefix: string;
  } = $props();

  const word = (option: Kind) => KIND_NAMES[option].toLowerCase();

  const hint = $derived.by(() => {
    if (locked) return "Can't change, dropped again";
    if (kind !== stored) return `Saves as the next ${word(kind)}`;
    return null;
  });
</script>

<fieldset
  class="grid gap-2"
  aria-describedby={hint ? `${idPrefix}-kind-hint` : undefined}
>
  <legend class="mb-2 text-sm font-medium text-muted-foreground">Gear</legend>
  <div class="grid grid-cols-2 gap-2">
    {#each KINDS as option (option)}
      <label
        class="flex min-h-12 cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-control border border-input text-base font-medium has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground {CHOICE_FOCUS} has-disabled:cursor-not-allowed has-disabled:border-border has-disabled:text-muted-foreground"
      >
        <input
          class="sr-only"
          type="radio"
          name="{idPrefix}-kind"
          value={option}
          disabled={locked && option !== stored}
          bind:group={kind}
        />
        <GearIcon kind={option} />
        {KIND_NAMES[option]}
        <SelectedCheck shown={kind === option} />
      </label>
    {/each}
  </div>
  {#if hint}
    <p id="{idPrefix}-kind-hint" class="text-sm text-muted-foreground">
      {hint}
    </p>
  {/if}
</fieldset>
