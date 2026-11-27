<script lang="ts">
  import { Button } from '@ui-sdk/svelte/button';
  import { tick, untrack, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { canUndoCollect, type Drop } from '#lib/features/trip/index.js';
  import {
    ACTION_BUTTON,
    DESTRUCTIVE_TEXT_BUTTON,
    PRIMARY_BUTTON,
    QUIET_BUTTON
  } from './controls';
  import type { GearSheetSession, Loss } from './gear-sheet.svelte';
  import Confirm from './Confirm.svelte';
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

  const FORM_ID = 'gear-sheet-form';

  const ASKS: Record<Loss, { text: string; keep: string; go: string }> = {
    draft: {
      text: 'Unsaved changes',
      keep: 'Keep editing',
      go: 'Discard changes'
    },
    catch: {
      text: 'Clears the catch',
      keep: 'Keep catch',
      go: 'Undo collect'
    }
  };

  let {
    session,
    now,
    denied = false,
    returnFocus,
    notice,
    direction
  }: {
    session: GearSheetSession;
    now: number;
    denied?: boolean;
    returnFocus: (() => HTMLElement | null | undefined) | 'none';
    notice: Notice | null;
    direction?: Snippet<[Drop]>;
  } = $props();

  const subject = $derived(session.subject);
  const open = $derived(session.open);
  const busy = $derived(session.busy);
  const asking = $derived(session.asking);
  const shown = $derived(asking && ASKS[asking]);

  const failure = $derived.by(() => {
    const problem = session.problem;
    if (problem === null || problem === 'depth') return null;
    if (problem === 'catch' && subject?.drop.collectedAt !== null) return null;
    return PROBLEMS[problem];
  });

  let editingFocus: Element | null = null;

  const askShown = () => {
    const active = document.activeElement;
    if (active?.closest('[role="dialog"]')) editingFocus = active;
  };

  const editing = () =>
    editingFocus instanceof HTMLElement && editingFocus.isConnected
      ? editingFocus
      : null;

  $effect.pre(() => {
    if (asking !== null) untrack(askShown);
  });

  const dismiss = () => {
    session.dismiss();
  };

  let discarding = $state(false);

  const discard = async () => {
    discarding = true;
    await tick();
    discarding = false;
    session.discard();
  };

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
      if (session.dismiss() !== 'left') enter();
    });
  });

  const collectLeads = $derived(
    subject !== null &&
      subject.drop.collectedAt === null &&
      subject.trip.endedAt === null
  );
</script>

<Sheet
  {open}
  onclose={dismiss}
  onbackdrop={() => {
    session.backdrop();
  }}
  {returnFocus}
  {notice}
>
  {#snippet title()}
    {#if subject}
      <GearIcon kind={subject.gear.kind} size={24} />
      {subject.name}
    {/if}
  {/snippet}

  {#snippet subtitle()}
    {#if subject?.drop.label}
      <p
        class="mt-1 line-clamp-2 text-base leading-snug [overflow-wrap:anywhere]"
      >
        {subject.drop.label}
      </p>
    {/if}
    {#if subject?.day}
      <p class="mt-1 text-sm font-medium text-muted-foreground">
        <DayMarker day={subject.day} />
      </p>
    {/if}
  {/snippet}

  {#if subject && session.draft}
    {#key session.draft}
      <GearDetailsForm
        {session}
        draft={session.draft}
        formId={FORM_ID}
        {now}
        {denied}
        {direction}
      />
    {/key}
  {/if}

  <Confirm
    open={shown !== null && !discarding}
    title={shown?.text ?? ''}
    keep={shown?.keep ?? ''}
    go={shown?.go ?? ''}
    onkeep={() => {
      session.keepEditing();
    }}
    ongo={() => void discard()}
    returnFocus={open && !discarding ? editing : 'none'}
  />

  {#snippet footer()}
    {#if failure}
      <p
        role="alert"
        class="mb-1 basis-full border-l-3 border-destructive pl-3 text-base"
      >
        {failure}
      </p>
    {/if}
    <Button
      type="submit"
      form={FORM_ID}
      aria-disabled={busy || session.saving}
      class="flex-[1_1_7rem] {collectLeads ? PRIMARY_BUTTON : ACTION_BUTTON}"
      >Save</Button
    >
    {#if subject && canUndoCollect(subject.trip, subject.drop)}
      <Button
        class="grow {QUIET_BUTTON}"
        aria-disabled={busy || session.saving}
        onclick={() => {
          session.undoCollect();
        }}>Undo collect</Button
      >
    {:else if subject}
      <Button
        class="grow {DESTRUCTIVE_TEXT_BUTTON}"
        aria-disabled={busy}
        onclick={() => {
          session.deleteDrop();
        }}>Delete drop</Button
      >
    {/if}
  {/snippet}
</Sheet>
