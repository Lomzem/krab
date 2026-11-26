<script lang="ts">
  import { Button } from '@ui-sdk/svelte/button';
  import { elementRef } from '#lib/shared/element-ref.js';
  import { tick, untrack, type Snippet } from 'svelte';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { canUndoCollect, type Drop } from '#lib/features/trip/index.js';
  import {
    ACTION_BUTTON,
    DESTRUCTIVE_BUTTON,
    DESTRUCTIVE_TEXT_BUTTON,
    PRIMARY_BUTTON,
    QUIET_BUTTON
  } from './controls';
  import type { GearSheetSession, Loss } from './gear-sheet.svelte';
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

  const ASKS: Record<
    Loss,
    { id: string; text: string; keep: string; go: string }
  > = {
    draft: {
      id: 'gear-sheet-unsaved',
      text: 'Unsaved changes',
      keep: 'Keep editing',
      go: 'Discard changes'
    },
    catch: {
      id: 'gear-sheet-catch-loss',
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
    returnFocus: () => HTMLElement | null | undefined;
    notice: Notice | null;
    direction?: Snippet<[Drop]>;
  } = $props();

  const subject = $derived(session.subject);
  const open = $derived(session.open);
  const busy = $derived(session.busy);
  const asking = $derived(session.asking);

  const failure = $derived.by(() => {
    const problem = session.problem;
    if (problem === null || problem === 'depth') return null;
    if (problem === 'catch' && subject?.drop.collectedAt !== null) return null;
    return PROBLEMS[problem];
  });

  let editingFocus: Element | null = null;
  let askGroup = $state<HTMLDivElement>();
  let keepButton = $state<HTMLButtonElement>();
  let sheet = $state<{ absorbPress: () => void }>();

  const askShown = (loss: Loss) => {
    const active = document.activeElement;
    if (active && !askGroup?.contains(active)) editingFocus = active;
    if (loss === 'catch') sheet?.absorbPress();
    void tick().then(() => keepButton?.focus());
  };

  $effect.pre(() => {
    const loss = asking;
    if (loss !== null) {
      untrack(() => {
        askShown(loss);
      });
    }
  });

  const restoreEditing = () => {
    void tick().then(() => {
      if (editingFocus instanceof HTMLElement && editingFocus.isConnected) {
        editingFocus.focus({ preventScroll: true });
      }
    });
  };

  const keepEditing = () => {
    session.keepEditing();
    restoreEditing();
  };

  const dismiss = () => {
    if (session.dismiss() === 'kept') restoreEditing();
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
      if (asking !== null || session.dirty) enter();
      dismiss();
    });
  });

  const collectLeads = $derived(
    subject !== null &&
      subject.drop.collectedAt === null &&
      subject.trip.endedAt === null
  );
</script>

<Sheet
  bind:this={sheet}
  {open}
  titleId={TITLE_ID}
  onclose={dismiss}
  onbackdrop={() => {
    session.backdrop();
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
      {#if subject.drop.label}
        <p
          class="mt-1 line-clamp-2 text-base leading-snug [overflow-wrap:anywhere]"
        >
          {subject.drop.label}
        </p>
      {/if}
      {#if subject.day}
        <p class="mt-1 text-sm font-medium text-muted-foreground">
          <DayMarker day={subject.day} />
        </p>
      {/if}
    {/if}
  {/snippet}

  {#if subject && session.draft}
    {#key session.draft}
      <GearDetailsForm
        {session}
        {subject}
        draft={session.draft}
        formId={FORM_ID}
        {now}
        {denied}
        {direction}
        inert={asking !== null}
      />
    {/key}
  {/if}

  {#snippet footer()}
    {#if asking}
      {@const shown = ASKS[asking]}
      <div
        bind:this={askGroup}
        role="group"
        aria-labelledby={shown.id}
        class="flex basis-full flex-wrap gap-2"
      >
        <p id={shown.id} class="basis-full text-base font-medium">
          {shown.text}
        </p>
        <Button
          {@attach elementRef<HTMLButtonElement>((element) => {
            keepButton = element;
          })}
          class="flex-1 basis-36 {QUIET_BUTTON}"
          onclick={keepEditing}>{shown.keep}</Button
        >
        <Button
          class="flex-1 basis-36 {DESTRUCTIVE_BUTTON}"
          onclick={() => {
            session.discard();
          }}>{shown.go}</Button
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
      <Button
        type="submit"
        form={FORM_ID}
        aria-disabled={busy}
        class="flex-[1_1_7rem] {collectLeads ? PRIMARY_BUTTON : ACTION_BUTTON}"
        >Save</Button
      >
      {#if subject && canUndoCollect(subject.trip, subject.drop)}
        <Button
          class="grow {QUIET_BUTTON}"
          aria-disabled={busy || session.undoCollectBlocked}
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
    </div>
  {/snippet}
</Sheet>
