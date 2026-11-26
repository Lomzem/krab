<script lang="ts">
  import Icon from '#lib/shared/Icon.svelte';
  import type { DaySelection } from '#lib/features/trip/index.js';
  import { FOCUS } from '#lib/shared/control-states.js';
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
    'relative flex min-h-12 touch-manipulation items-center gap-3 rounded-control border border-input bg-card px-3 text-base font-medium has-checked:border-primary';
  const inputClass = `peer absolute inset-0 size-full cursor-pointer appearance-none rounded-control ${FOCUS}`;
</script>

<Sheet {open} titleId={TITLE_ID} {onclose} {returnFocus}>
  {#snippet heading()}
    <h2 id={TITLE_ID} class="text-title font-semibold">Map filter</h2>
  {/snippet}

  <fieldset class="mt-4">
    <legend class="mb-2 text-control font-semibold">Also show</legend>
    <div class="grid gap-2">
      <label class={choiceClass}>
        <input
          type="checkbox"
          class={inputClass}
          bind:checked={filter.collected}
          aria-labelledby="{TITLE_ID}-collected"
        />
        <span
          class="pointer-events-none inline-flex items-center gap-0.5 rounded-md border-2 border-dashed border-map-muted bg-map-paper py-0.5 pr-1 pl-0.5 text-sm leading-none font-semibold text-map-muted"
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
            class="pointer-events-none inline-flex items-center rounded-md border-2 border-dotted border-map-muted bg-map-paper p-0.5 text-map-muted"
            aria-hidden="true"><GearIcon kind="pot" size={14} /></span
          >
          <span class="pointer-events-none flex-1"
            ><span id="{TITLE_ID}-past">Past trips</span><span
              class="flex items-center gap-2 text-sm font-normal text-muted-foreground"
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
          class="pointer-events-none rounded border border-border bg-map-paper px-1 text-xs leading-tight font-semibold text-map-ink tabular-nums"
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
      <legend class="mb-2 text-control font-semibold">Days on this trip</legend>
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
    <Icon name="check" size={20} />
  </span>
{/snippet}
