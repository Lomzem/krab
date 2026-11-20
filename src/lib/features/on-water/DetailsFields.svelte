<script lang="ts">
  import { FOCUS } from './controls';
  import {
    depthAccepted,
    emptyDraft,
    type DetailsDraft
  } from './details-draft';

  const DEPTH_PROBLEM = 'Enter 0 or more feet';

  let {
    draft = $bindable(emptyDraft()),
    idPrefix
  }: {
    draft?: DetailsDraft;
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
      <input
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
    <input
      id="{idPrefix}-label"
      class={field}
      bind:value={draft.label}
      autocomplete="off"
      enterkeyhint="next"
    />
  </div>
  <div class="grid gap-2">
    <label class={label} for="{idPrefix}-bait">Bait</label>
    <input
      id="{idPrefix}-bait"
      class={field}
      bind:value={draft.bait}
      autocomplete="off"
      enterkeyhint="next"
    />
  </div>
  <div class="grid gap-2">
    <label class={label} for="{idPrefix}-notes">Notes</label>
    <textarea
      id="{idPrefix}-notes"
      class="{field} min-h-24 py-3"
      bind:value={draft.notes}
      rows="3"></textarea>
  </div>
</div>
