<script lang="ts">
  import { tick, untrack, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import type { Drop, DropEdit, Kind } from '#lib/features/trip/index.js';
  import {
    ACTION_BUTTON,
    DESTRUCTIVE_BUTTON,
    PRIMARY_BUTTON,
    QUIET_BUTTON
  } from './controls';
  import type { SheetOperation, SheetSubject } from './gear-sheet';
  import DayMarker from './DayMarker.svelte';
  import GearDetailsForm from './GearDetailsForm.svelte';
  import GearIcon from './GearIcon.svelte';
  import Sheet from './Sheet.svelte';
  import type { Notice, SaveProblem } from './on-water.svelte';

  const PROBLEMS: Record<Exclude<SaveProblem, 'depth'>, string> = {
    catch: 'Catch needs whole numbers',
    uncollected: "Couldn't save, gear in water",
    kind: "Couldn't save, gear dropped again",
    gone: "Couldn't save, drop is gone",
    storage: "Couldn't save"
  };

  const TITLE_ID = 'gear-sheet-title';
  const FORM_ID = 'gear-sheet-form';
  const UNSAVED_ID = 'gear-sheet-unsaved';
  const CATCH_LOSS_ID = 'gear-sheet-catch-loss';

  type Loss = 'draft' | 'catch';
  const ASKS: Record<
    Loss,
    { id: string; text: string; keep: string; go: string }
  > = {
    draft: {
      id: UNSAVED_ID,
      text: 'Unsaved changes',
      keep: 'Keep editing',
      go: 'Discard changes'
    },
    catch: {
      id: CATCH_LOSS_ID,
      text: 'Clears the catch',
      keep: 'Keep catch',
      go: 'Undo collect'
    }
  };

  let {
    subject,
    now,
    operation,
    onclose,
    onsave,
    oncollect,
    ondropagain,
    returnFocus,
    notice,
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
    notice: Notice | null;
    actions?: Snippet<[Drop, (exit: () => void) => void]>;
    direction?: Snippet<[Drop]>;
    endAction?: Snippet<
      [Drop, (exit: () => void) => void, (exit: () => void) => void]
    >;
  } = $props();

  const failure = $derived.by(() => {
    const problem = operation?.problem ?? null;
    if (problem === null || problem === 'depth') return null;
    if (problem === 'catch' && subject?.drop.collectedAt !== null) return null;
    return PROBLEMS[problem];
  });

  const open = $derived(subject !== null);
  const busy = $derived(operation?.pending ?? false);
  let dirty = $state<boolean>(false);
  let asking = $state<{ exit: () => void; loss: Loss } | null>(null);
  let resets = $state(0);
  let waiting: (() => void) | null = null;
  let saving = $state<boolean>(false);
  let editingFocus: Element | null = null;
  let askGroup = $state<HTMLDivElement>();
  let keepButton = $state<HTMLButtonElement>();

  const ask = (exit: () => void, loss: Loss = 'draft') => {
    const active = document.activeElement;
    if (active && !askGroup?.contains(active)) editingFocus = active;
    asking = { exit, loss };
    void tick().then(() => keepButton?.focus());
  };

  const keepEditing = () => {
    asking = null;
    void tick().then(() => {
      if (editingFocus instanceof HTMLElement && editingFocus.isConnected) {
        editingFocus.focus({ preventScroll: true });
      }
    });
  };

  const discard = () => {
    const shown = asking;
    asking = null;
    if (shown?.loss === 'draft') resets += 1;
    shown?.exit();
  };

  const confirmCatchLoss = (exit: () => void) => {
    if (!busy) ask(exit, 'catch');
  };

  const storing =
    (send: (dropId: string, edit: DropEdit, kind: Kind | null) => void) =>
    (dropId: string, edit: DropEdit, kind: Kind | null) => {
      if (!busy) saving = true;
      send(dropId, edit, kind);
    };

  const leave = (exit: () => void) => {
    if (asking) keepEditing();
    else if (!dirty || (busy && saving)) exit();
    else if (busy) waiting = exit;
    else ask(exit);
  };

  const shownId = $derived(subject?.drop.id ?? null);
  let askedId: string | null = null;

  $effect(() => {
    if (shownId === askedId) return;
    askedId = shownId;
    untrack(() => {
      asking = null;
      waiting = null;
    });
  });

  $effect(() => {
    if (!busy) saving = false;
  });

  $effect(() => {
    if (busy || !waiting) return;
    const exit = waiting;
    waiting = null;
    if (untrack(() => open)) leave(exit);
  });

  let entered = false;
  let returning = false;

  const enter = () => {
    entered = true;
    void goto(resolve('/'), { state: { gearSheet: true }, shallow: true });
  };

  $effect(() => {
    if (open && !entered && !returning) enter();
    if (!open && entered) {
      entered = false;
      returning = true;
      history.back();
    }
  });

  $effect(() => {
    const onSheetEntry = page.state.gearSheet;
    untrack(() => {
      if (returning) {
        returning = false;
        if (open && !entered) enter();
        return;
      }
      if (onSheetEntry) return;
      if (!entered) return;
      entered = false;
      if (!open) return;
      if (asking || dirty) enter();
      leave(onclose);
    });
  });

  const collectLeads = $derived(
    oncollect !== undefined &&
      subject !== null &&
      subject.drop.collectedAt === null &&
      subject.trip.endedAt === null
  );
</script>

<Sheet
  {open}
  titleId={TITLE_ID}
  onclose={() => {
    leave(onclose);
  }}
  onbackdrop={() => {
    if (!dirty && !asking) onclose();
  }}
  {returnFocus}
  {notice}
  bodyInert={asking !== null}
>
  {#snippet heading()}
    {#if subject}
      <h2
        id={TITLE_ID}
        class="flex items-center gap-2 text-title font-semibold"
      >
        <GearIcon kind={subject.gear.kind} size={24} />
        {subject.name}
      </h2>
      {#if subject.day}
        <p class="mt-1 text-sm font-medium text-muted-foreground">
          <DayMarker day={subject.day} />
        </p>
      {/if}
    {/if}
  {/snippet}

  {#if subject}
    {#key `${subject.drop.id}/${String(resets)}`}
      <GearDetailsForm
        ondirty={(next: boolean) => {
          dirty = next;
        }}
        inert={asking !== null}
        {subject}
        formId={FORM_ID}
        {now}
        {operation}
        onsave={storing(onsave)}
        {oncollect}
        ondropagain={ondropagain && storing(ondropagain)}
        {direction}
      >
        {@render actions?.(subject.drop, leave)}
      </GearDetailsForm>
    {/key}
  {/if}

  {#snippet footer()}
    {#if asking}
      {@const shown = ASKS[asking.loss]}
      <div
        bind:this={askGroup}
        role="group"
        aria-labelledby={shown.id}
        class="flex basis-full flex-wrap gap-2"
      >
        <p id={shown.id} class="basis-full text-base font-medium">
          {shown.text}
        </p>
        <button
          bind:this={keepButton}
          type="button"
          class="flex-1 basis-36 {QUIET_BUTTON}"
          onclick={keepEditing}>{shown.keep}</button
        >
        <button
          type="button"
          class="flex-1 basis-36 {DESTRUCTIVE_BUTTON}"
          onclick={discard}>{shown.go}</button
        >
      </div>
    {/if}
    <div class={asking ? 'hidden' : 'contents'}>
      {#if failure}
        <p
          role="alert"
          class="mb-1 basis-full border-l-3 border-destructive pl-3 text-base"
        >
          {failure}
        </p>
      {/if}
      <button
        type="submit"
        form={FORM_ID}
        aria-disabled={busy}
        class="flex-[1_1_7rem] {collectLeads ? PRIMARY_BUTTON : ACTION_BUTTON}"
        >Save</button
      >
      {#if subject}
        {@render endAction?.(subject.drop, leave, confirmCatchLoss)}
      {/if}
    </div>
  {/snippet}
</Sheet>
