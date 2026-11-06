<script lang="ts">
  import type { DaySelection } from '#lib/features/trip/index.js';
  import { DAY_CHOICE, PRIMARY_BUTTON } from './controls';
  import GearIcon from './GearIcon.svelte';
  import UncollectedMark from './UncollectedMark.svelte';
  import { DEFAULT_MAP_FILTER, type MapFilter } from './map-filter';
  import SelectedCheck from './SelectedCheck.svelte';
  import Sheet from './Sheet.svelte';

  const TITLE_ID = 'map-filter-title';
  const DAY_CHOICES: readonly { days: DaySelection; name: string }[] = [
    { days: 'today', name: 'Today' },
    { days: 'earlier', name: 'Earlier days' },
    { days: 'all', name: 'All' }
  ];

  let {
    open,
    filter = $bindable({ ...DEFAULT_MAP_FILTER }),
    multiDay,
    hasPast,
    onclose,
    returnFocus
  }: {
    open: boolean;
    filter?: MapFilter;
    multiDay: boolean;
    hasPast: boolean;
    onclose: () => void;
    returnFocus: () => HTMLElement | null | undefined;
  } = $props();

  const choiceClass =
    'relative flex min-h-12 touch-manipulation items-center gap-3 rounded-control border border-input bg-card px-3 text-[16px] font-medium has-checked:border-primary';
  const inputClass =
    'peer absolute inset-0 size-full cursor-pointer appearance-none rounded-control focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';
</script>

<Sheet {open} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    <h2 id={TITLE_ID} class="text-[22px] leading-tight font-semibold">
      Map filter
    </h2>
  {/snippet}

  <p class="text-[15px] text-muted-foreground">
    {multiDay
      ? 'Gear in the water always shows for the days you pick.'
      : 'Gear in the water always shows.'}
  </p>

  <fieldset class="mt-4">
    <legend class="mb-2 text-[17px] font-semibold">Also show</legend>
    <div class="grid gap-2">
      <label class={choiceClass}>
        <input
          type="checkbox"
          class={inputClass}
          bind:checked={filter.collected}
          aria-labelledby="{TITLE_ID}-collected"
        />
        <span
          class="pointer-events-none inline-flex items-center gap-0.5 rounded-md border-2 border-dashed border-[#55655f] bg-white py-0.5 pr-1 pl-0.5 text-[13px] leading-none font-semibold text-[#55655f]"
          aria-hidden="true"><GearIcon kind="pot" size={14} />1</span
        >
        <span id="{TITLE_ID}-collected" class="pointer-events-none flex-1"
          >Collected gear</span
        >
        {@render check()}
      </label>
      {#if hasPast}
        <label class={choiceClass}>
          <input
            type="checkbox"
            class={inputClass}
            bind:checked={filter.past}
            aria-labelledby="{TITLE_ID}-past"
          />
          <span
            class="pointer-events-none inline-flex items-center rounded-md border-2 border-dotted border-[#55655f] bg-white p-0.5 text-[#55655f]"
            aria-hidden="true"><GearIcon kind="pot" size={14} /></span
          >
          <span class="pointer-events-none flex-1"
            ><span id="{TITLE_ID}-past">Past trips</span><span
              class="flex items-center gap-1.5 text-[15px] font-normal text-muted-foreground"
              aria-hidden="true"><UncollectedMark size={14} />Uncollected</span
            ></span
          >
          {@render check()}
        </label>
      {/if}
      <label class={choiceClass}>
        <input
          type="checkbox"
          class={inputClass}
          bind:checked={filter.timeInWater}
          aria-labelledby="{TITLE_ID}-time"
        />
        <span
          class="pointer-events-none rounded border border-border bg-white px-1 text-[12px] leading-tight font-semibold text-[#1a2e2b] tabular-nums"
          aria-hidden="true">2 h 5 min</span
        >
        <span id="{TITLE_ID}-time" class="pointer-events-none flex-1"
          >Time in the water</span
        >
        {@render check()}
      </label>
    </div>
  </fieldset>

  {#if multiDay}
    <fieldset class="mt-6">
      <legend class="mb-2 text-[17px] font-semibold">Days on this trip</legend>
      <div class="grid grid-cols-3 gap-2">
        {#each DAY_CHOICES as choice (choice.days)}
          <label class={DAY_CHOICE}>
            <input
              type="radio"
              name="map-filter-days"
              class={inputClass}
              value={choice.days}
              bind:group={filter.days}
            />
            <span class="pointer-events-none">{choice.name}</span>
            <SelectedCheck shown={filter.days === choice.days} />
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  {#snippet footer()}
    <button type="button" class="flex-1 {PRIMARY_BUTTON}" onclick={onclose}
      >Done</button
    >
  {/snippet}
</Sheet>

{#snippet check()}
  <span
    class="pointer-events-none flex size-7 items-center justify-center rounded-md border-2 border-input text-transparent peer-checked:border-primary peer-checked:bg-primary peer-checked:text-primary-foreground"
    aria-hidden="true"
  >
    <svg
      class="size-5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg
    >
  </span>
{/snippet}
