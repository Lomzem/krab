<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Drop, DropEdit, Kind } from '#lib/features/trip/index.js';
  import type { SheetOperation, SheetSubject } from './gear-sheet';
  import DayMarker from './DayMarker.svelte';
  import GearDetailsForm from './GearDetailsForm.svelte';
  import GearIcon from './GearIcon.svelte';
  import Sheet from './Sheet.svelte';

  const TITLE_ID = 'gear-sheet-title';
  const FORM_ID = 'gear-sheet-form';

  let {
    subject,
    now,
    operation,
    onclose,
    onsave,
    oncollect,
    ondropagain,
    returnFocus,
    actions,
    direction,
    endAction
  }: {
    subject: SheetSubject | null;
    now: number;
    operation: SheetOperation | null;
    onclose: () => void;
    onsave: (dropId: string, edit: DropEdit, kind: Kind | null) => void;
    oncollect?: (dropId: string) => void;
    ondropagain?: (dropId: string, edit: DropEdit, kind: Kind | null) => void;
    returnFocus: () => HTMLElement | null | undefined;
    actions?: Snippet<[Drop]>;
    direction?: Snippet<[Drop]>;
    endAction?: Snippet<[Drop]>;
  } = $props();
</script>

<Sheet open={subject !== null} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    {#if subject}
      <h2
        id={TITLE_ID}
        class="flex items-center gap-2.5 text-[26px] leading-tight font-bold"
      >
        <GearIcon kind={subject.gear.kind} size={28} />
        {subject.name}
      </h2>
      {#if subject.day}
        <p class="mt-0.5 text-[17px] font-semibold">
          <DayMarker day={subject.day} />
        </p>
      {/if}
    {/if}
  {/snippet}

  {#if subject}
    {#key subject.drop.id}
      <GearDetailsForm
        {subject}
        formId={FORM_ID}
        {now}
        {operation}
        {onsave}
        {oncollect}
        {ondropagain}
        {direction}
      >
        {@render actions?.(subject.drop)}
      </GearDetailsForm>
    {/key}
  {/if}

  {#snippet footer()}
    <button
      type="submit"
      form={FORM_ID}
      aria-disabled={operation?.pending ?? false}
      class="min-h-13 flex-1 rounded-control bg-primary px-4 text-[18px] font-bold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-60"
      >Save</button
    >
    {#if subject}
      {@render endAction?.(subject.drop)}
    {/if}
  {/snippet}
</Sheet>
