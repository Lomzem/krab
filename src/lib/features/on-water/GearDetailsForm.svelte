<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import {
    canChangeKind,
    type Drop,
    type DropEdit,
    type Kind,
    type Trip
  } from '#lib/features/trip/index.js';
  import DetailsFields from './DetailsFields.svelte';
  import { draftOf, editOf } from './details-draft';
  import KindField from './KindField.svelte';
  import type { SaveProblem } from './on-water.svelte';

  const DEPTH_PROBLEM = 'Enter the depth in feet as a number, 0 or more.';
  const PROBLEMS: Record<Exclude<SaveProblem, 'depth'>, string> = {
    kind: 'This gear has been dropped again, so it keeps its kind. The details were saved.',
    storage: "Couldn't save. Try again."
  };

  let {
    trip,
    drop,
    stored,
    name,
    formId,
    editKind,
    onsave,
    onsaved,
    children
  }: {
    trip: Trip;
    drop: Drop;
    stored: Kind;
    name: string;
    formId: string;
    editKind: boolean;
    onsave: (
      dropId: string,
      edit: DropEdit,
      kind: Kind | null
    ) => Promise<SaveProblem | null>;
    onsaved: () => void;
    children?: Snippet;
  } = $props();

  const idPrefix = $derived(`gear-${drop.id}`);
  const initial = () => ({ draft: draftOf(drop), kind: stored });
  let draft = $state(initial().draft);
  let kind = $state(initial().kind);
  let problem = $state<SaveProblem | null>(null);
  let saving = false;

  const submit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (saving) return;
    saving = true;
    problem = await onsave(
      drop.id,
      editOf(draft),
      kind === stored ? null : kind
    );
    saving = false;
    if (problem === null) onsaved();
    else if (problem === 'depth') {
      await tick();
      document.getElementById(`${idPrefix}-depth`)?.focus();
    }
  };
</script>

<form id={formId} class="grid gap-6" onsubmit={submit} novalidate>
  {@render children?.()}
  {#if editKind}
    <KindField
      bind:kind
      {stored}
      {name}
      locked={!canChangeKind(trip, drop.gearId)}
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
