<script lang="ts">
  import { Input } from '@ui-sdk/svelte/input';
  import { Textarea } from '@ui-sdk/svelte/textarea';
  import BaitField from './BaitField.svelte';
  import type { BaitChoice, BaitSearch } from './bait-options';
  import { FOCUS } from '#lib/shared/control-states.js';
  import {
    depthAccepted,
    emptyDraft,
    type DetailsDraft
  } from './details-draft';

  const DEPTH_PROBLEM = 'Enter 0 or more feet';

  let {
    draft = $bindable(emptyDraft()),
    baitSearch = $bindable({ query: '', refused: false }),
    baits,
    idPrefix
  }: {
    draft?: DetailsDraft;
    baitSearch?: BaitSearch;
    baits: readonly BaitChoice[];
    idPrefix: string;
  } = $props();

  const depthError = $derived(
    depthAccepted(draft.depth) ? null : DEPTH_PROBLEM
  );

  const field = `min-h-12 w-full rounded-control border border-input bg-card px-3 text-base text-foreground ${FOCUS} aria-invalid:border-destructive aria-invalid:border-2`;
  const label = 'text-sm font-medium text-muted-foreground';
</script>

<div class="grid gap-4">
  <div id="{idPrefix}-depth-field" class="grid scroll-my-3 gap-2">
    <label class={label} for="{idPrefix}-depth"
      >Depth<span class="sr-only"> (ft)</span></label
    >
    <div class="flex items-center gap-2">
      <Input
        id="{idPrefix}-depth"
        class="{field} max-w-36 tabular-nums"
        bind:value={draft.depth}
        inputmode="decimal"
        autocomplete="off"
        enterkeyhint="next"
        aria-invalid={depthError ? 'true' : undefined}
        aria-describedby={depthError ? `${idPrefix}-depth-error` : undefined}
      />
      <span class="text-base text-muted-foreground" aria-hidden="true">ft</span>
    </div>
    {#if depthError}
      <p
        id="{idPrefix}-depth-error"
        class="border-l-3 border-destructive pl-3 text-base"
      >
        {depthError}
      </p>
    {/if}
  </div>
  <div class="grid gap-2">
    <label class={label} for="{idPrefix}-label">Label</label>
    <Input
      id="{idPrefix}-label"
      class={field}
      bind:value={draft.label}
      autocomplete="off"
      enterkeyhint="next"
    />
  </div>
  <BaitField
    bind:bait={draft.bait}
    bind:search={baitSearch}
    choices={baits}
    {idPrefix}
  />
  <div class="grid gap-2">
    <label class={label} for="{idPrefix}-notes">Notes</label>
    <Textarea
      id="{idPrefix}-notes"
      class="{field} min-h-24 py-3"
      bind:value={draft.notes}
      rows={3}
    />
  </div>
</div>
