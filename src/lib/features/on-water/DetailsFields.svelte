<script lang="ts">
  import { emptyDraft, type DetailsDraft } from './details-draft';

  let {
    draft = $bindable(emptyDraft()),
    idPrefix,
    depthError
  }: {
    draft?: DetailsDraft;
    idPrefix: string;
    depthError: string | null;
  } = $props();

  const field =
    'min-h-12 w-full rounded-control border border-input bg-card px-3 text-[17px] text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring aria-invalid:border-destructive aria-invalid:border-2';
  const label = 'text-[15px] font-semibold';
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
  <div class="grid gap-1.5">
    <label class={label} for="{idPrefix}-depth"
      >Depth <span class="font-normal text-muted-foreground">(ft)</span></label
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
      <span class="text-[17px] font-semibold" aria-hidden="true">ft</span>
    </div>
    {#if depthError}
      <p
        id="{idPrefix}-depth-error"
        class="border-l-4 border-destructive pl-3 text-[15px]"
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
