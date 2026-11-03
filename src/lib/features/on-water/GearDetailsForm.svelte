<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import {
    canChangeKind,
    canDropAgain,
    KIND_NAMES,
    timeInWater,
    type Catch,
    type DropEdit,
    type Kind
  } from '#lib/features/trip/index.js';
  import CatchField from './CatchField.svelte';
  import DetailsFields from './DetailsFields.svelte';
  import { draftOf, editOf } from './details-draft';
  import type { SheetOperation, SheetSubject } from './gear-sheet';
  import KindField from './KindField.svelte';
  import type { SaveProblem } from './on-water.svelte';

  const DEPTH_PROBLEM = 'Enter the depth in feet as a number, 0 or more.';
  const PROBLEMS: Record<Exclude<SaveProblem, 'depth'>, string> = {
    catch:
      "Couldn't save the catch. It needs collected gear and whole numbers from 0.",
    kind: 'This gear has been dropped again, so it keeps its kind. Nothing was saved.',
    gone: "Couldn't save. That drop is gone.",
    storage: "Couldn't save. Try again."
  };

  let {
    subject,
    formId,
    editKind,
    now,
    operation,
    onsave,
    oncollect,
    ondropagain,
    children
  }: {
    subject: SheetSubject;
    formId: string;
    editKind: boolean;
    now: number;
    operation: SheetOperation | null;
    onsave: (dropId: string, edit: DropEdit, kind: Kind | null) => void;
    oncollect?: (dropId: string) => void;
    ondropagain?: (dropId: string, edit: DropEdit, kind: Kind | null) => void;
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
    collectedAt === null ? null : untrack(() => drop.catch)
  );
  const busy = $derived(operation?.pending ?? false);
  const problem = $derived(operation?.problem ?? null);
  let wasCollected = initial().collected;
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

  $effect(() => {
    if (operation?.problem !== 'depth') return;
    void tick().then(() => {
      document.getElementById(`${idPrefix}-depth`)?.focus();
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

<form id={formId} class="grid gap-6" onsubmit={submit} novalidate>
  {#if collectedAt === null}
    <div class="grid gap-3">
      <p class="text-[17px] text-muted-foreground">
        <span aria-hidden="true">{inWater.short} in the water</span>
        <span class="sr-only">In the water for {inWater.spoken}</span>
      </p>
      {#if oncollect}
        <button
          bind:this={collectButton}
          type="button"
          class="min-h-16 w-full rounded-control bg-signal text-[22px] font-bold text-signal-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary active:brightness-95 aria-disabled:opacity-60"
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
      bind:heading={catchHeading}
      onchange={(next: Catch | null) => {
        catchDraft = next;
      }}
    />
    {#if ondropagain && canDropAgain(subject.trip, drop)}
      <button
        type="button"
        class="min-h-14 w-full rounded-control border-2 border-primary text-[19px] font-bold text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring active:bg-muted aria-disabled:opacity-60"
        aria-disabled={busy}
        onclick={() => {
          save(ondropagain);
        }}>Drop {KIND_NAMES[stored].toLowerCase()} again here</button
      >
    {/if}
  {/if}
  {@render children?.()}
  {#if editKind}
    <KindField
      bind:kind
      {stored}
      name={subject.name}
      locked={!canChangeKind(subject.trip, drop.gearId)}
      {idPrefix}
    />
  {/if}
  <DetailsFields
    bind:draft
    {idPrefix}
    depthError={problem === 'depth' ? DEPTH_PROBLEM : null}
  />
  {#if problem && problem !== 'depth'}
    <p role="alert" class="border-l-4 border-destructive pl-3 text-[15px]">
      {PROBLEMS[problem]}
    </p>
  {/if}
</form>
