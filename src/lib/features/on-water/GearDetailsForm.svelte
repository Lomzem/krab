<script lang="ts">
  import { Button } from '@ui-sdk/svelte/button';
  import { elementRef } from '#lib/shared/element-ref.js';
  import { tick, untrack, type Snippet } from 'svelte';
  import {
    canChangeKind,
    canDropAgain,
    KIND_NAMES,
    timeInWater,
    type Drop
  } from '#lib/features/trip/index.js';
  import CatchField from './CatchField.svelte';
  import { ACTION_BUTTON, PRIMARY_BUTTON, QUIET_BUTTON } from './controls';
  import DetailsFields from './DetailsFields.svelte';
  import type { CatchDraft, InvalidField } from './details-draft';
  import type { GearSheetSession, SheetDraft } from './gear-sheet.svelte';
  import KindField from './KindField.svelte';

  const FIELD_IDS: Record<InvalidField, string> = {
    bait: 'bait-search',
    depth: 'depth',
    kept: 'kept-count',
    released: 'released-count'
  };

  let {
    session,
    draft: opened,
    formId,
    now,
    denied = false,
    direction
  }: {
    session: GearSheetSession;
    draft: SheetDraft;
    formId: string;
    now: number;
    denied?: boolean;
    direction?: Snippet<[Drop]>;
  } = $props();

  const draft = untrack(() => opened);
  const subject = $derived(draft.subject);
  const drop = $derived(subject.drop);
  const stored = $derived(subject.gear.kind);
  const idPrefix = $derived(`gear-${drop.id}`);
  const collectedAt = $derived(drop.collectedAt);
  const inWater = $derived(timeInWater(drop, now));
  const baits = untrack(() => subject.baits);
  const busy = $derived(session.busy);
  const refused = $derived(session.refusal?.invalid ?? []);
  const catchRefused = $derived(
    refused.includes('kept') ||
      refused.includes('released') ||
      session.problem === 'catch'
  );
  let wasCollected = untrack(() => drop.collectedAt !== null);
  let collectButton = $state<HTMLButtonElement>();
  let catchHeading = $state<HTMLHeadingElement>();

  $effect(() => {
    const collected = collectedAt !== null;
    if (collected === wasCollected) return;
    wasCollected = collected;
    void tick().then(() => {
      (collected ? catchHeading : collectButton)?.focus();
    });
  });

  const shownOf = (field: InvalidField, input: HTMLElement | null) => {
    if (field === 'bait') return input;
    if (field === 'depth') {
      return document.getElementById(`${idPrefix}-depth-field`);
    }
    return document
      .getElementById(`${idPrefix}-catch-title`)
      ?.closest('section');
  };

  $effect(() => {
    const first = session.refusal?.invalid.at(0);
    if (!first) return;
    void tick().then(() => {
      const input = document.getElementById(`${idPrefix}-${FIELD_IDS[first]}`);
      input?.focus({ preventScroll: true });
      shownOf(first, input)?.scrollIntoView({ block: 'nearest' });
    });
  });

  const submit = (event: SubmitEvent) => {
    event.preventDefault();
    session.save();
  };
</script>

<form id={formId} class="grid gap-5" onsubmit={submit} novalidate>
  {#if collectedAt === null && subject.trip.endedAt !== null}
    <p class="text-base font-medium">Uncollected</p>
  {:else if collectedAt === null}
    <div class="grid gap-3">
      <div
        class="flex min-h-15 flex-wrap items-center justify-between gap-x-3 gap-y-2"
      >
        <p class="text-sm text-muted-foreground">
          <span aria-hidden="true">{inWater.short} in the water</span>
          <span class="sr-only">In the water for {inWater.spoken}</span>
        </p>
        {@render direction?.(drop)}
      </div>
      <Button
        {@attach elementRef<HTMLButtonElement>((element) => {
          collectButton = element;
        })}
        class="w-full {ACTION_BUTTON}"
        aria-disabled={busy}
        onclick={() => {
          session.collect();
        }}>Collect</Button
      >
    </div>
  {:else}
    <CatchField
      value={draft.catchOf(drop)}
      {idPrefix}
      invalid={catchRefused}
      bind:heading={catchHeading}
      onchange={(next: CatchDraft | null) => {
        draft.typeCatch(drop, next);
      }}
    />
    {#if canDropAgain(subject.trip, drop)}
      <Button
        class="w-full {PRIMARY_BUTTON}"
        aria-disabled={busy || session.saving}
        onclick={() => {
          session.dropAgain();
        }}
      >
        {#if denied}
          Drop {KIND_NAMES[stored].toLowerCase()} again without position
        {:else}
          Drop {KIND_NAMES[stored].toLowerCase()} again here
        {/if}
      </Button>
    {/if}
  {/if}
  {#if session.from === 'list' && drop.position}
    <Button
      class="w-full {QUIET_BUTTON}"
      aria-disabled={busy}
      onclick={() => {
        session.showOnMap();
      }}>Show on map</Button
    >
  {/if}
  <KindField
    bind:kind={draft.kind}
    {stored}
    locked={!canChangeKind(subject.trip, drop.gearId)}
    {idPrefix}
  />
  <DetailsFields
    bind:draft={draft.details}
    bind:baitSearch={draft.baitSearch}
    {baits}
    {idPrefix}
    onescape={() => {
      session.dismiss();
    }}
  />
</form>
