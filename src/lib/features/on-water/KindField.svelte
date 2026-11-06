<script lang="ts">
  import { KIND_NAMES, KINDS, type Kind } from '#lib/features/trip/index.js';
  import GearIcon from './GearIcon.svelte';
  import SelectedCheck from './SelectedCheck.svelte';

  let {
    kind = $bindable('pot'),
    stored,
    name,
    locked,
    idPrefix
  }: {
    kind?: Kind;
    stored: Kind;
    name: string;
    locked: boolean;
    idPrefix: string;
  } = $props();

  const word = (option: Kind) => KIND_NAMES[option].toLowerCase();

  const hint = $derived.by(() => {
    if (locked)
      return `${name} has been dropped again, so it stays a ${word(stored)}.`;
    if (kind !== stored)
      return `Saving gives it the next ${word(kind)} number.`;
    return null;
  });
</script>

<fieldset
  class="grid gap-1.5"
  aria-describedby={hint ? `${idPrefix}-kind-hint` : undefined}
>
  <legend class="mb-1.5 text-[15px] font-medium text-muted-foreground"
    >Gear</legend
  >
  <div class="grid grid-cols-2 gap-2">
    {#each KINDS as option (option)}
      <label
        class="flex min-h-12 cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-control border border-input text-[16px] font-medium has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring has-disabled:cursor-not-allowed has-disabled:border-border has-disabled:text-muted-foreground"
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
    <p id="{idPrefix}-kind-hint" class="text-[15px] text-muted-foreground">
      {hint}
    </p>
  {/if}
</fieldset>
