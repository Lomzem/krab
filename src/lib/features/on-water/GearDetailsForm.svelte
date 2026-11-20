<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import {
    canChangeKind,
    canDropAgain,
    KIND_NAMES,
    timeInWater,
    type Drop,
    type DropEdit,
    type Kind
  } from '#lib/features/trip/index.js';
  import CatchField from './CatchField.svelte';
  import { ACTION_BUTTON, PRIMARY_BUTTON } from './controls';
  import DetailsFields from './DetailsFields.svelte';
  import {
    catchDraftOf,
    countOf,
    draftChanged,
    draftOf,
    editOf,
    type CatchDraft
  } from './details-draft';
  import type { SheetOperation, SheetSubject } from './gear-sheet';
  import KindField from './KindField.svelte';

  let {
    subject,
    formId,
    now,
    operation,
    onsave,
    oncollect,
    ondropagain,
    denied = false,
    direction,
    ondirty,
    inert = false,
    children
  }: {
    subject: SheetSubject;
    formId: string;
    now: number;
    operation: SheetOperation | null;
    onsave: (dropId: string, edit: DropEdit, kind: Kind | null) => void;
    oncollect?: (dropId: string) => void;
    ondropagain?: (dropId: string, edit: DropEdit, kind: Kind | null) => void;
    denied?: boolean;
    direction?: Snippet<[Drop]>;
    ondirty?: (dirty: boolean) => void;
    inert?: boolean;
    children?: Snippet;
  } = $props();

  const drop = $derived(subject.drop);
  const stored = $derived(subject.gear.kind);
  const idPrefix = $derived(`gear-${drop.id}`);
  const collectedAt = $derived(drop.collectedAt);
  const inWater = $derived(timeInWater(drop, now));
  const initial = () => ({
    draft: draftOf(drop),
    kind: stored,
    collected: drop.collectedAt !== null
  });
  let draft = $state(initial().draft);
  let kind = $state(initial().kind);
  let catchDraft = $derived(
    collectedAt === null ? null : untrack(() => catchDraftOf(drop.catch))
  );
  const busy = $derived(operation?.pending ?? false);
  const problem = $derived(operation?.problem ?? null);
  let wasCollected = initial().collected;
  let collectButton = $state<HTMLButtonElement>();
  let catchHeading = $state<HTMLHeadingElement>();

  $effect(() => {
    ondirty?.(kind !== stored || draftChanged(drop, draft, catchDraft));
  });

  $effect(() => {
    const collected = collectedAt !== null;
    if (collected === wasCollected) return;
    wasCollected = collected;
    void tick().then(() => {
      (collected ? catchHeading : collectButton)?.focus();
    });
  });

  $effect(() => {
    if (operation?.problem !== 'depth') return;
    void tick().then(() => {
      document
        .getElementById(`${idPrefix}-depth`)
        ?.focus({ preventScroll: true });
      document
        .getElementById(`${idPrefix}-depth-field`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  });

  $effect(() => {
    if (operation?.problem !== 'catch') return;
    const typed = untrack(() => catchDraft);
    const refused = (['kept', 'released'] as const).find(
      (side) => typed && countOf(typed[side]) === null
    );
    if (!refused) return;
    void tick().then(() => {
      document
        .getElementById(`${idPrefix}-${refused}-count`)
        ?.focus({ preventScroll: true });
      document
        .getElementById(`${idPrefix}-catch-title`)
        ?.closest('section')
        ?.scrollIntoView({ block: 'nearest' });
    });
  });

  const save = (
    send: (dropId: string, edit: DropEdit, kind: Kind | null) => void
  ) => {
    send(drop.id, editOf(draft, catchDraft), kind === stored ? null : kind);
  };

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    save(onsave);
  };
</script>

<form id={formId} class="grid gap-5" {inert} onsubmit={submit} novalidate>
  {#if collectedAt === null && subject.trip.endedAt !== null}
    <p class="text-base font-medium">Uncollected</p>
  {:else if collectedAt === null}
    <div class="grid gap-3">
      <div
        class="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-2"
      >
        <p class="text-sm text-muted-foreground">
          <span aria-hidden="true">{inWater.short} in the water</span>
          <span class="sr-only">In the water for {inWater.spoken}</span>
        </p>
        {@render direction?.(drop)}
      </div>
      {#if oncollect}
        <button
          bind:this={collectButton}
          type="button"
          class="w-full {ACTION_BUTTON}"
          aria-disabled={busy}
          onclick={() => {
            oncollect(drop.id);
          }}>Collect</button
        >
      {/if}
    </div>
  {:else}
    <CatchField
      value={catchDraft}
      {idPrefix}
      invalid={problem === 'catch'}
      bind:heading={catchHeading}
      onchange={(next: CatchDraft | null) => {
        catchDraft = next;
      }}
    />
    {#if ondropagain && canDropAgain(subject.trip, drop)}
      <button
        type="button"
        class="w-full {PRIMARY_BUTTON}"
        aria-disabled={busy}
        onclick={() => {
          save(ondropagain);
        }}
      >
        {#if denied}
          Drop {KIND_NAMES[stored].toLowerCase()} again without position
        {:else}
          Drop {KIND_NAMES[stored].toLowerCase()} again here
        {/if}
      </button>
    {/if}
  {/if}
  {@render children?.()}
  <KindField
    bind:kind
    {stored}
    locked={!canChangeKind(subject.trip, drop.gearId)}
    {idPrefix}
  />
  <DetailsFields bind:draft {idPrefix} />
</form>
