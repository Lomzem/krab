<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    gearName,
    type Drop,
    type DropEdit,
    type Kind,
    type Trip
  } from '#lib/features/trip/index.js';
  import GearDetailsForm from './GearDetailsForm.svelte';
  import GearIcon from './GearIcon.svelte';
  import type { SaveProblem } from './on-water.svelte';
  import Sheet from './Sheet.svelte';

  const TITLE_ID = 'gear-sheet-title';
  const FORM_ID = 'gear-sheet-form';

  let {
    trip,
    drop,
    editKind = true,
    onclose,
    onsave,
    returnFocus,
    actions,
    endAction
  }: {
    trip: Trip | null;
    drop: Drop | null;
    editKind?: boolean;
    onclose: () => void;
    onsave: (
      dropId: string,
      edit: DropEdit,
      kind: Kind | null
    ) => Promise<SaveProblem | null>;
    returnFocus: () => HTMLElement | null | undefined;
    actions?: Snippet<[Drop]>;
    endAction?: Snippet<[Drop]>;
  } = $props();

  const gear = $derived(
    drop ? trip?.gear.find((item) => item.id === drop.gearId) : undefined
  );
</script>

<Sheet open={Boolean(gear)} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    {#if gear}
      <h2
        id={TITLE_ID}
        class="flex items-center gap-2.5 text-[26px] leading-tight font-bold"
      >
        <GearIcon kind={gear.kind} size={28} />
        {gearName(gear)}
      </h2>
    {/if}
  {/snippet}

  {#if trip && drop && gear}
    {#key drop.id}
      <GearDetailsForm
        {trip}
        {drop}
        stored={gear.kind}
        name={gearName(gear)}
        formId={FORM_ID}
        {editKind}
        {onsave}
        onsaved={onclose}
      >
        {@render actions?.(drop)}
      </GearDetailsForm>
    {/key}
  {/if}

  {#snippet footer()}
    <button
      type="submit"
      form={FORM_ID}
      class="min-h-13 flex-1 rounded-control bg-primary px-4 text-[18px] font-bold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >Save</button
    >
    {#if drop}
      {@render endAction?.(drop)}
    {/if}
  {/snippet}
</Sheet>
