<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Drop, DropEdit, Kind } from '#lib/features/trip/index.js';
  import { ACTION_BUTTON, PRIMARY_BUTTON } from './controls';
  import type { SheetOperation, SheetSubject } from './gear-sheet';
  import DayMarker from './DayMarker.svelte';
  import GearDetailsForm from './GearDetailsForm.svelte';
  import GearIcon from './GearIcon.svelte';
  import Sheet from './Sheet.svelte';
  import type { SaveProblem } from './on-water.svelte';

  const PROBLEMS: Record<Exclude<SaveProblem, 'depth'>, string> = {
    catch: "Couldn't save the catch. It needs whole numbers from 0.",
    uncollected:
      "Couldn't save the catch. This gear is back in the water, so nothing was saved.",
    kind: 'This gear has been dropped again, so it keeps its kind. Nothing was saved.',
    gone: "Couldn't save. That drop is gone.",
    storage: "Couldn't save. Try again."
  };

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

  const failure = $derived.by(() => {
    const problem = operation?.problem ?? null;
    if (problem === null || problem === 'depth') return null;
    if (problem === 'catch' && subject?.drop.collectedAt !== null) return null;
    return PROBLEMS[problem];
  });

  const collectLeads = $derived(
    oncollect !== undefined &&
      subject !== null &&
      subject.drop.collectedAt === null &&
      subject.trip.endedAt === null
  );
</script>

<Sheet open={subject !== null} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    {#if subject}
      <h2
        id={TITLE_ID}
        class="flex items-center gap-2 text-[22px] leading-tight font-semibold"
      >
        <GearIcon kind={subject.gear.kind} size={24} />
        {subject.name}
      </h2>
      {#if subject.day}
        <p class="mt-0.5 text-[15px] font-medium text-muted-foreground">
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
    {#if failure}
      <p
        role="alert"
        class="mb-1 basis-full border-l-3 border-destructive pl-3 text-[15px]"
      >
        {failure}
      </p>
    {/if}
    <button
      type="submit"
      form={FORM_ID}
      aria-disabled={operation?.pending ?? false}
      class="flex-[1_1_7rem] {collectLeads ? PRIMARY_BUTTON : ACTION_BUTTON}"
      >Save</button
    >
    {#if subject}
      {@render endAction?.(subject.drop)}
    {/if}
  {/snippet}
</Sheet>
