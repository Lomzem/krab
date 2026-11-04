<script lang="ts">
  import type { DaySelection } from '#lib/features/trip/index.js';
  import GearIcon from './GearIcon.svelte';
  import { DEFAULT_MAP_FILTER, type MapFilter } from './map-filter';
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
    'relative flex min-h-13 items-center gap-3 rounded-control border-2 border-border bg-card px-3 text-[18px] font-semibold has-checked:border-primary';
  const inputClass =
    'peer absolute inset-0 size-full cursor-pointer appearance-none rounded-control focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';
</script>

<Sheet {open} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    <h2 id={TITLE_ID} class="text-[26px] leading-tight font-bold">
      Map filter
    </h2>
  {/snippet}

  <p class="text-[17px] text-muted-foreground">
    Gear in the water always shows.
  </p>

  <fieldset class="mt-4">
    <legend class="mb-2 text-[20px] font-bold">Also show</legend>
    <div class="grid gap-2">
      <label class={choiceClass}>
        <input
          type="checkbox"
          class={inputClass}
          bind:checked={filter.collected}
        />
        <span
          class="pointer-events-none inline-flex items-center gap-0.5 rounded-md border-2 border-dashed border-[#4b5b6c] bg-white py-0.5 pr-1 pl-0.5 text-[13px] leading-none font-bold text-[#4b5b6c]"
          aria-hidden="true"><GearIcon kind="pot" size={14} />1</span
        >
        <span class="pointer-events-none flex-1">Collected gear</span>
        {@render check()}
      </label>
      {#if hasPast}
        <label class={choiceClass}>
          <input
            type="checkbox"
            class={inputClass}
            bind:checked={filter.past}
          />
          <span
            class="pointer-events-none inline-flex items-center rounded-md border-2 border-dotted border-[#4b5b6c] bg-white p-0.5 text-[#4b5b6c]"
            aria-hidden="true"><GearIcon kind="pot" size={14} /></span
          >
          <span class="pointer-events-none flex-1">Past trips</span>
          {@render check()}
        </label>
      {/if}
      <label class={choiceClass}>
        <input
          type="checkbox"
          class={inputClass}
          bind:checked={filter.timeInWater}
        />
        <span
          class="pointer-events-none rounded border border-border bg-white px-1 text-[12px] leading-tight font-bold text-[#0f2a44] tabular-nums"
          aria-hidden="true">2h 5m</span
        >
        <span class="pointer-events-none flex-1">Time in the water</span>
        {@render check()}
      </label>
    </div>
  </fieldset>

  {#if multiDay}
    <fieldset class="mt-6">
      <legend class="mb-2 text-[20px] font-bold">Days on this trip</legend>
      <div class="grid grid-cols-3 gap-2">
        {#each DAY_CHOICES as choice (choice.days)}
          <label
            class="{choiceClass} justify-center text-center has-checked:bg-primary has-checked:text-primary-foreground"
          >
            <input
              type="radio"
              name="map-filter-days"
              class={inputClass}
              value={choice.days}
              bind:group={filter.days}
            />
            <span class="pointer-events-none">{choice.name}</span>
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  {#snippet footer()}
    <button
      type="button"
      class="min-h-13 flex-1 rounded-control bg-primary px-4 text-[18px] font-bold text-primary-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onclick={onclose}>Done</button
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
