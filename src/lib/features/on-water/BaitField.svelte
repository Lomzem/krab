<script lang="ts">
  import { tick } from 'svelte';
  import { Button } from '@ui-sdk/svelte/button';
  import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger
  } from '@ui-sdk/svelte/collapsible';
  import {
    Command,
    CommandInput,
    CommandItem,
    CommandList
  } from '@ui-sdk/svelte/command';
  import {
    baitChips,
    baitKey,
    baitMatches,
    chosenBait,
    type BaitChoice,
    type BaitSearch
  } from './bait-options';
  import { CHOICE_FOCUS, FOCUS } from '#lib/shared/control-states.js';
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
  let highlighted = $state<string | null>(null);

  const own = $derived(baitKey(bait));
  const chips = $derived(baitChips(choices, bait));
  const typed = $derived(baitKey(search.query));
  const found = $derived(baitMatches(choices, search.query));
  const listed = $derived(found.add !== null || found.matches.length > 0);
  const problem = $derived(search.refused && typed !== '');
  const searchId = $derived(`${idPrefix}-bait-search`);
  const problemId = $derived(`${idPrefix}-bait-problem`);
  const legendId = $derived(`${idPrefix}-bait-legend`);
  const first = $derived(
    found.add === null ? (found.matches[0]?.key ?? null) : ADD
  );

  const ITEM =
    'flex min-h-12 cursor-pointer touch-manipulation items-center justify-between gap-2 rounded-control px-3 text-base break-words select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground';

  const fromKeyboard = (event: Event | undefined) =>
    event instanceof MouseEvent && event.detail === 0;

  const forget = () => {
    search.query = '';
    search.refused = false;
  };

  const close = () => {
    open = false;
    forget();
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
  };
</script>

<fieldset class="grid gap-2">
  <legend id={legendId} class="mb-2 text-sm font-medium text-muted-foreground"
    >Bait</legend
  >
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
  <Collapsible
    class="grid gap-2"
    bind:open
    onOpenChange={(next, { event }) => {
      if (!next) forget();
      else if (fromKeyboard(event))
        void tick().then(() => document.getElementById(searchId)?.focus());
    }}
  >
    <CollapsibleTrigger class="justify-self-start {QUIET_BUTTON}"
      >{chips.length > 0 ? 'Other bait' : 'Add bait'}</CollapsibleTrigger
    >
    <CollapsiblePanel>
      <div
        onkeydowncapture={(event) => {
          if (event.key === 'Escape' && search.query !== '')
            event.stopPropagation();
        }}
      >
        <Command
          class="flex flex-col gap-2"
          filter={false}
          bind:query={search.query}
          bind:value={highlighted}
          onQueryChange={() => {
            void tick().then(() => {
              highlighted = first;
            });
          }}
        >
          <CommandList
            aria-labelledby={legendId}
            hidden={!listed}
            class="max-h-36 overflow-x-hidden overflow-y-auto overscroll-contain rounded-control border border-border bg-card"
          >
            {#if found.add !== null}
              {@const added = found.add}
              <CommandItem
                value={ADD}
                class={ITEM}
                onSelect={() => {
                  pick(added);
                }}
              >
                <span class="min-w-0"
                  >Add <strong class="font-semibold">{added}</strong></span
                >
                <SelectedCheck shown={false} />
              </CommandItem>
            {/if}
            {#each found.matches as match (match.key)}
              <CommandItem
                value={match.key}
                class={ITEM}
                onSelect={() => {
                  pick(match.label);
                }}
              >
                <span class="min-w-0">{match.label}</span>
                <SelectedCheck shown={match.key === own} />
              </CommandItem>
            {/each}
          </CommandList>
          {#if typed === '' && own !== ''}
            <Button class="self-start {QUIET_BUTTON}" onclick={clear}
              >Clear bait</Button
            >
          {/if}
          <div class="grid gap-2">
            <label
              class="text-sm font-medium text-muted-foreground"
              for={searchId}>Find or add bait</label
            >
            <CommandInput
              id={searchId}
              class="min-h-12 w-full rounded-control border border-input bg-card px-3 text-base text-foreground aria-invalid:border-2 aria-invalid:border-destructive {FOCUS}"
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
        </Command>
      </div>
    </CollapsiblePanel>
  </Collapsible>
</fieldset>
