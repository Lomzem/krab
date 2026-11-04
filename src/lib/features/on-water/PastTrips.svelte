<script lang="ts">
  import { tick } from 'svelte';
  import type { MapPlace } from '#lib/features/map/index.js';
  import {
    dayGroups,
    isMultiDay,
    pastDrops,
    pastTripCounts,
    tripDates,
    type PastDaySelection,
    type PastDropRow,
    type Trip
  } from '#lib/features/trip/index.js';
  import DayMarker from './DayMarker.svelte';
  import GearIcon from './GearIcon.svelte';
  import LoadFailed from './LoadFailed.svelte';
  import Sheet from './Sheet.svelte';

  const DELETE_TITLE_ID = 'delete-trip-title';
  const DAY_CHOICES: readonly { days: PastDaySelection; name: string }[] = [
    { days: 'last', name: 'Last day' },
    { days: 'earlier', name: 'Earlier days' },
    { days: 'all', name: 'All' }
  ];

  let {
    past,
    failed,
    selected = $bindable(null),
    titleHeading = $bindable(),
    show,
    onshown,
    onopen,
    ondelete,
    onretry
  }: {
    past: readonly Trip[];
    failed: boolean;
    selected?: string | null;
    titleHeading?: HTMLHeadingElement;
    show: string | null;
    onshown: () => void;
    onopen: (dropId: string, opener: HTMLElement, from: 'list' | 'map') => void;
    ondelete: (tripId: string) => Promise<boolean>;
    onretry: () => Promise<void>;
  } = $props();

  let selection = $state<PastDaySelection>('all');
  let deleteOpen = $state(false);
  let deleting = $state(false);
  let deleteButton = $state<HTMLButtonElement>();
  let list = $state<HTMLUListElement>();

  const trip = $derived(past.find((item) => item.id === selected) ?? null);
  const multiDay = $derived(trip !== null && isMultiDay(trip));
  const rows = $derived(
    trip ? pastDrops(trip, multiDay ? selection : 'all') : []
  );
  const rowsById = $derived(new Map(rows.map((row) => [row.drop.id, row])));
  const byDay = $derived(dayGroups(rows));
  const places = $derived(
    rows.flatMap(({ drop }): MapPlace[] =>
      drop.position ? [{ id: drop.id, at: drop.position, layer: 'past' }] : []
    )
  );
  const mapShow = $derived(show !== null && rowsById.has(show) ? show : null);

  $effect(() => {
    if (selected !== null && !trip) {
      selected = null;
      deleteOpen = false;
    }
  });

  $effect(() => {
    if (show === null || rowsById.has(show)) return;
    if (trip?.drops.some((drop) => drop.id === show)) selection = 'all';
    else onshown();
  });

  const focusHeading = async () => {
    await tick();
    titleHeading?.focus();
  };

  const openTrip = (tripId: string) => {
    selected = tripId;
    selection = 'all';
    void focusHeading();
  };

  const backToList = async () => {
    const from = selected;
    selected = null;
    await tick();
    const row = from
      ? list?.querySelector<HTMLElement>(`[data-trip="${from}"]`)
      : null;
    (row ?? titleHeading)?.focus();
  };

  const confirmDelete = async () => {
    if (deleting || !trip) return;
    deleting = true;
    const deleted = await ondelete(trip.id);
    deleting = false;
    if (deleted) deleteOpen = false;
  };

  const pinLabel = (row: PastDropRow) =>
    [row.name, row.day?.text, row.status].filter(Boolean).join(', ');

  const rowClass =
    'flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-muted';
  const choiceClass =
    'relative flex min-h-13 items-center justify-center gap-3 rounded-control border-2 border-border bg-card px-3 text-center text-[17px] font-semibold has-checked:border-primary has-checked:bg-primary has-checked:text-primary-foreground';
  const inputClass =
    'peer absolute inset-0 size-full cursor-pointer appearance-none rounded-control focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring';
</script>

{#snippet dropRows(shown: PastDropRow[])}
  <ul class="border-t border-border bg-card">
    {#each shown as row (row.drop.id)}
      <li class="border-b border-border">
        <button
          type="button"
          class={rowClass}
          onclick={(event) => {
            onopen(row.drop.id, event.currentTarget, 'list');
          }}
        >
          <GearIcon kind={row.gear.kind} size={28} />
          <div class="min-w-0 flex-1">
            <p class="text-[19px] leading-snug font-semibold">{row.name}</p>
            <p class="text-[15px] text-muted-foreground">{row.status}</p>
          </div>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

{#if trip}
  <section aria-labelledby="past-trip-title" class="pb-6">
    <div class="px-4 pt-3">
      <button
        type="button"
        class="-ml-2 flex min-h-12 items-center gap-1 rounded-control px-2 text-[17px] font-semibold text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onclick={() => void backToList()}
      >
        <svg
          class="size-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg
        >All past trips
      </button>
      <h1
        id="past-trip-title"
        bind:this={titleHeading}
        tabindex="-1"
        class="mt-1 text-[28px] leading-tight font-bold focus:outline-none"
      >
        {tripDates(trip)}
      </h1>
      <p class="pb-3 text-[17px] text-muted-foreground">
        {pastTripCounts(trip)}
      </p>
    </div>

    <div class="h-[45dvh]">
      {#await import('#lib/features/map/ChartMap.svelte')}
        <p class="px-4 pt-4 text-[17px] text-muted-foreground">Loading map</p>
      {:then { default: ChartMap }}
        <ChartMap {places} me={null} show={mapShow} {onshown}>
          {#snippet pin(id: string)}
            {@const row = rowsById.get(id)}
            {#if row}
              <button
                type="button"
                class="group grid size-11 place-items-center focus-visible:outline-none"
                aria-label={pinLabel(row)}
                onclick={(event) => {
                  onopen(id, event.currentTarget, 'map');
                }}
              >
                <span
                  class="inline-flex items-center gap-0.5 rounded-md border-2 border-dotted border-[#4b5b6c] bg-white/85 py-0.5 pr-1 pl-0.5 text-[13px] leading-none font-bold whitespace-nowrap text-[#4b5b6c] tabular-nums group-focus-visible:outline-3 group-focus-visible:outline-offset-3 group-focus-visible:outline-[#c2410c]"
                >
                  <GearIcon kind={row.gear.kind} size={15} />{row.gear.number}
                  {#if row.day}
                    <DayMarker day={row.day} size={14} class="ml-1 gap-0.5" />
                  {/if}
                </span>
              </button>
            {/if}
          {/snippet}
        </ChartMap>
      {:catch}
        <p class="px-4 pt-4 text-[17px]">
          The map can't show on this phone. The trip's gear is listed below.
        </p>
      {/await}
    </div>

    {#if multiDay}
      <fieldset class="px-4 pt-4">
        <legend class="mb-2 text-[20px] font-bold">Days on this trip</legend>
        <div class="grid grid-cols-3 gap-2">
          {#each DAY_CHOICES as choice (choice.days)}
            <label class={choiceClass}>
              <input
                type="radio"
                name="past-trip-days"
                class={inputClass}
                value={choice.days}
                bind:group={selection}
              />
              <span class="pointer-events-none">{choice.name}</span>
            </label>
          {/each}
        </div>
      </fieldset>
    {/if}

    <h2 id="past-gear-title" class="px-4 pt-6 pb-2 text-[22px] font-bold">
      Gear
    </h2>
    {#if byDay.length > 0}
      {#each byDay as group (group.day.number)}
        <section
          aria-labelledby="past-gear-title past-day-{group.day.number}-title"
        >
          <h3
            id="past-day-{group.day.number}-title"
            class="px-4 pt-3 pb-2 text-[19px] font-bold"
          >
            <DayMarker day={group.day} size={20} />
          </h3>
          {@render dropRows(group.rows)}
        </section>
      {/each}
    {:else}
      {@render dropRows(rows)}
    {/if}

    <div class="px-4 pt-8">
      <button
        bind:this={deleteButton}
        type="button"
        class="min-h-13 w-full rounded-control border-2 border-destructive px-4 text-[18px] font-bold text-destructive focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-haspopup="dialog"
        onclick={() => {
          deleteOpen = true;
        }}>Delete trip</button
      >
    </div>
  </section>
{:else}
  <section aria-labelledby="past-trips-title" class="pb-6">
    <h1
      id="past-trips-title"
      bind:this={titleHeading}
      tabindex="-1"
      class="px-4 pt-5 pb-3 text-[34px] leading-tight font-bold focus:outline-none"
    >
      Past trips
    </h1>
    {#if failed}
      <LoadFailed text="Couldn't load past trips." {onretry} />
    {/if}
    {#if past.length === 0}
      {#if !failed}
        <p class="px-4 text-[17px]">No past trips yet.</p>
      {/if}
    {:else}
      <ul bind:this={list} class="border-t border-border bg-card">
        {#each past as item (item.id)}
          <li class="border-b border-border">
            <button
              type="button"
              class={rowClass}
              data-trip={item.id}
              onclick={() => {
                openTrip(item.id);
              }}
            >
              <div class="min-w-0 flex-1">
                <p class="text-[19px] leading-snug font-semibold">
                  {tripDates(item)}
                </p>
                <p class="text-[15px] text-muted-foreground">
                  {pastTripCounts(item)}
                </p>
              </div>
              <svg
                class="size-5 flex-none text-muted-foreground"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg
              >
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}

<Sheet
  open={deleteOpen && trip !== null}
  titleId={DELETE_TITLE_ID}
  onclose={() => {
    deleteOpen = false;
  }}
  returnFocus={() => (deleteButton?.isConnected ? deleteButton : titleHeading)}
>
  {#snippet heading()}
    <h2 id={DELETE_TITLE_ID} class="text-[26px] leading-tight font-bold">
      Delete this trip?
    </h2>
  {/snippet}

  <p class="text-[18px]">
    Its drops and catches are removed from this phone. This can't be undone.
  </p>

  {#snippet footer()}
    <button
      type="button"
      class="min-h-13 flex-1 rounded-control border-2 border-destructive px-4 text-[18px] font-bold text-destructive focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-60"
      aria-disabled={deleting}
      onclick={() => void confirmDelete()}>Delete trip</button
    >
    <button
      type="button"
      class="min-h-13 flex-1 rounded-control border-2 border-primary px-4 text-[18px] font-bold text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
      onclick={() => {
        deleteOpen = false;
      }}>Keep it</button
    >
  {/snippet}
</Sheet>
