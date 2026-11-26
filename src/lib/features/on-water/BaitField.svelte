<script lang="ts">
  import { tick } from 'svelte';
  import * as Command from './bait-command/index.js';
  import {
    baitChips,
    baitKey,
    baitMatches,
    chosenBait,
    type BaitChoice,
    type BaitSearch
  } from './bait-options';
  import { CHOICE_FOCUS } from '#lib/shared/control-states.js';
  import { QUIET_BUTTON } from './controls';
  import SelectedCheck from './SelectedCheck.svelte';

  const ADD = ' add';

  let {
    bait = $bindable(''),
    search = $bindable({ query: '', refused: false }),
    choices,
    idPrefix
  }: {
    bait?: string;
    search?: BaitSearch;
    choices: readonly BaitChoice[];
    idPrefix: string;
  } = $props();

  let open = $state(false);
  let chipRow = $state<HTMLElement>();
  let toggle = $state<HTMLButtonElement>();

  const own = $derived(baitKey(bait));
  const chips = $derived(baitChips(choices, bait));
  const typed = $derived(baitKey(search.query));
  const found = $derived(baitMatches(choices, search.query));
  const listed = $derived(found.add !== null || found.matches.length > 0);
  const problem = $derived(search.refused && typed !== '');
  const panelId = $derived(`${idPrefix}-bait-panel`);
  const listId = $derived(`${idPrefix}-bait-options`);
  const problemId = $derived(`${idPrefix}-bait-problem`);

  const close = () => {
    open = false;
    search.query = '';
    search.refused = false;
  };

  const choose = (picked: string) => {
    bait = chosenBait(bait, picked);
    close();
  };

  const pick = (picked: string) => {
    choose(picked);
    void tick().then(() => {
      chipRow?.querySelector<HTMLInputElement>('input:checked')?.focus();
    });
  };

  const clear = () => {
    bait = '';
    close();
    void tick().then(() => toggle?.focus());
  };
</script>

<fieldset class="grid gap-2">
  <legend class="mb-2 text-sm font-medium text-muted-foreground">Bait</legend>
  {#if chips.length > 0}
    <div bind:this={chipRow} class="flex flex-wrap gap-2">
      {#each chips as chip (chip.key)}
        <label
          class="flex min-h-12 max-w-full min-w-0 cursor-pointer touch-manipulation items-center gap-2 rounded-control border border-input bg-card py-2 pr-2 pl-3 text-base font-medium break-words has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground {CHOICE_FOCUS}"
        >
          <input
            class="sr-only"
            type="radio"
            name="{idPrefix}-bait"
            value={chip.label}
            checked={chip.key === own}
            onchange={() => {
              choose(chip.label);
            }}
            onclick={() => {
              choose(chip.label);
            }}
          />
          <span class="min-w-0">{chip.label}</span>
          <SelectedCheck shown={chip.key === own} />
        </label>
      {/each}
    </div>
  {/if}
  <button
    bind:this={toggle}
    type="button"
    class="justify-self-start {QUIET_BUTTON}"
    aria-expanded={open}
    aria-controls={panelId}
    onclick={() => {
      if (open) close();
      else open = true;
    }}>{chips.length > 0 ? 'Other bait' : 'Add bait'}</button
  >
  <div id={panelId} hidden={!open}>
    {#if open}
      <Command.Root
        class="gap-2"
        shouldFilter={false}
        disableInitialScroll
        vimBindings={false}
      >
        {#if listed}
          <Command.List
            id={listId}
            aria-label="Saved baits"
            class="max-h-36 rounded-control border border-border bg-card"
          >
            {#if found.add !== null}
              {@const added = found.add}
              <Command.Item
                value={ADD}
                onSelect={() => {
                  pick(added);
                }}
                ><span>Add <strong class="font-semibold">{added}</strong></span
                ></Command.Item
              >
            {/if}
            {#each found.matches as match (match.key)}
              <Command.Item
                value={match.key}
                checked={match.key === own}
                onSelect={() => {
                  pick(match.label);
                }}>{match.label}</Command.Item
              >
            {/each}
          </Command.List>
        {/if}
        {#if typed === '' && own !== ''}
          <button
            type="button"
            class="self-start {QUIET_BUTTON}"
            onclick={clear}>Clear bait</button
          >
        {/if}
        <div class="grid gap-2">
          <label
            class="text-sm font-medium text-muted-foreground"
            for="{idPrefix}-bait-search">Find or add bait</label
          >
          <Command.Input
            id="{idPrefix}-bait-search"
            bind:value={search.query}
            controls={listed ? listId : null}
            enterkeyhint="done"
            aria-invalid={problem ? 'true' : undefined}
            aria-describedby={problem ? problemId : undefined}
          />
        </div>
        {#if problem}
          <p
            id={problemId}
            class="border-l-3 border-destructive pl-3 text-base"
          >
            Choose or add bait
          </p>
        {/if}
      </Command.Root>
    {/if}
  </div>
</fieldset>
