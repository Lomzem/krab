<script lang="ts">
  import { Radio, RadioGroup } from '@ui-sdk/svelte/radio';
  import { FOCUS } from '#lib/shared/control-states.js';
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

<div class="grid gap-2">
  <span
    id="{idPrefix}-kind-label"
    class="text-sm font-medium text-muted-foreground">Gear</span
  >
  <RadioGroup
    class="grid grid-cols-2 gap-2"
    aria-labelledby="{idPrefix}-kind-label"
    aria-describedby={hint ? `${idPrefix}-kind-hint` : undefined}
    name="{idPrefix}-kind"
    bind:value={() => kind, (next) => (kind = next as Kind)}
  >
    {#each KINDS as option (option)}
      <Radio
        value={option}
        disabled={locked && option !== stored}
        class="flex min-h-12 cursor-pointer touch-manipulation items-center justify-center gap-2 rounded-control border border-input text-base font-medium data-checked:border-primary data-checked:bg-accent data-checked:text-accent-foreground {FOCUS} data-disabled:cursor-not-allowed data-disabled:border-border data-disabled:text-muted-foreground"
      >
        <GearIcon kind={option} />
        {KIND_NAMES[option]}
        <SelectedCheck shown={kind === option} />
      </Radio>
    {/each}
  </RadioGroup>
  {#if hint}
    <p id="{idPrefix}-kind-hint" class="text-sm text-muted-foreground">
      {hint}
    </p>
  {/if}
</div>
