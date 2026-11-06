<script lang="ts">
  import {
    depthAccepted,
    emptyDraft,
    type DetailsDraft
  } from './details-draft';

  const DEPTH_PROBLEM = 'Enter the depth in feet as a number, 0 or more.';

  let {
    draft = $bindable(emptyDraft()),
    idPrefix,
    refused
  }: {
    draft?: DetailsDraft;
    idPrefix: string;
    refused: boolean;
  } = $props();

  let left = $state(false);

  const depthError = $derived(
    !depthAccepted(draft.depth) && (refused || left) ? DEPTH_PROBLEM : null
  );

  const field =
    'min-h-12 w-full rounded-control border border-input bg-card px-3 text-[16px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-invalid:border-destructive aria-invalid:border-2';
  const label = 'text-[15px] font-medium text-muted-foreground';
</script>

<div class="grid gap-4">
  <div class="grid gap-1.5">
    <label class={label} for="{idPrefix}-label">Label</label>
    <input
      id="{idPrefix}-label"
      class={field}
      bind:value={draft.label}
      autocomplete="off"
      enterkeyhint="next"
    />
  </div>
  <div class="grid gap-1.5">
    <label class={label} for="{idPrefix}-bait">Bait</label>
    <input
      id="{idPrefix}-bait"
      class={field}
      bind:value={draft.bait}
      autocomplete="off"
      enterkeyhint="next"
    />
  </div>
  <div id="{idPrefix}-depth-field" class="grid scroll-my-3 gap-1.5">
    <label class={label} for="{idPrefix}-depth"
      >Depth<span class="sr-only"> (ft)</span></label
    >
    <div class="flex items-center gap-2">
      <input
        id="{idPrefix}-depth"
        class="{field} max-w-36 tabular-nums"
        bind:value={draft.depth}
        oninput={() => {
          if (depthAccepted(draft.depth)) left = false;
        }}
        onblur={() => {
          left = !depthAccepted(draft.depth);
        }}
        inputmode="decimal"
        autocomplete="off"
        enterkeyhint="next"
        aria-invalid={depthError ? 'true' : undefined}
        aria-describedby={depthError ? `${idPrefix}-depth-error` : undefined}
      />
      <span class="text-[16px] text-muted-foreground" aria-hidden="true"
        >ft</span
      >
    </div>
    {#if depthError}
      <p
        id="{idPrefix}-depth-error"
        class="border-l-3 border-destructive pl-3 text-[15px]"
      >
        {depthError}
      </p>
    {/if}
  </div>
  <div class="grid gap-1.5">
    <label class={label} for="{idPrefix}-notes">Notes</label>
    <textarea
      id="{idPrefix}-notes"
      class="{field} min-h-24 py-2.5"
      bind:value={draft.notes}
      rows="3"></textarea>
  </div>
</div>
