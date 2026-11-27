<script lang="ts">
  import { Button } from '@ui-sdk/svelte/button';
  import type { Attachment } from 'svelte/attachments';
  import { Radio, RadioGroup } from '@ui-sdk/svelte/radio';
  import { FOCUS, FOCUS_INSET, PRESS } from '#lib/shared/control-states.js';
  import { KIND_NAMES, KINDS, type Kind } from '#lib/features/trip/index.js';
  import GearIcon from './GearIcon.svelte';
  import SelectedCheck from './SelectedCheck.svelte';

  let {
    kind = $bindable('pot'),
    attachButton,
    denied,
    finding = false,
    busy = false,
    ondrop
  }: {
    kind?: Kind;
    attachButton: Attachment<HTMLButtonElement>;
    denied: boolean;
    finding?: boolean;
    busy?: boolean;
    ondrop: () => void;
  } = $props();

  const name = $derived(KIND_NAMES[kind].toLowerCase());
</script>

<div class="flex flex-wrap items-stretch gap-2">
  <RadioGroup
    aria-label="Gear to drop"
    name="drop-kind"
    class="flex min-h-16 grow gap-1 rounded-control bg-muted p-1 compact:min-h-14"
    bind:value={() => kind, (next) => (kind = next as Kind)}
  >
    {#each KINDS as option (option)}
      <Radio
        value={option}
        class="flex min-h-14 min-w-16 flex-1 cursor-pointer touch-manipulation items-center justify-center gap-1 self-stretch rounded-[0.3125rem] px-2 text-base font-medium whitespace-nowrap text-muted-foreground data-checked:bg-card data-checked:text-foreground data-checked:shadow-sm compact:min-h-12 {FOCUS_INSET}"
      >
        {KIND_NAMES[option]}
        <SelectedCheck shown={kind === option} />
      </Radio>
    {/each}
  </RadioGroup>
  <Button
    {@attach attachButton}
    aria-disabled={busy || undefined}
    class="flex min-h-16 min-w-0 grow-999 basis-32 touch-manipulation flex-col items-center justify-center rounded-control bg-action px-3 py-2 text-control leading-tight font-semibold text-action-foreground compact:min-h-14 compact:py-1 {FOCUS} {PRESS} active:brightness-95 aria-disabled:opacity-60"
    onclick={ondrop}
  >
    <span class="flex items-center gap-2">
      <GearIcon {kind} size={22} />
      Drop {name}
    </span>
    {#if denied}
      <span class="text-sm font-medium">without position</span>
    {:else if finding}
      <span class="text-sm font-medium">Finding position</span>
    {/if}
  </Button>
</div>
