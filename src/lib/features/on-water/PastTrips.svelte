<script lang="ts">
  import { tick } from 'svelte';
  import type { MapPlace } from '#lib/features/map/index.js';
  import {
    dayGroups,
    isMultiDay,
    pastDrops,
    pastTripCounts,
    shortDateRange,
    tripDates,
    tripSpan,
    type PastDaySelection,
    type PastDropRow,
    type Trip
  } from '#lib/features/trip/index.js';
  import DayMarker from './DayMarker.svelte';
  import GearHere from './GearHere.svelte';
  import { inListOrder, type HereItem } from './gear-here';
  import { DAY_CHOICE, DESTRUCTIVE_BUTTON, PRIMARY_BUTTON } from './controls';
  import GearIcon from './GearIcon.svelte';
  import GroupPin from './GroupPin.svelte';
  import LoadFailed from './LoadFailed.svelte';
  import PinChip from './PinChip.svelte';
  import { chipBoxes } from './pin-chip';
  import SelectedCheck from './SelectedCheck.svelte';
  import Sheet from './Sheet.svelte';
  import UncollectedMark from './UncollectedMark.svelte';

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

  const keepTrip = () => {
    if (!deleting) deleteOpen = false;
  };

  const confirmDelete = async () => {
    if (deleting || !trip) return;
    deleting = true;
    const deleted = await ondelete(trip.id);
    deleting = false;
    if (deleted) deleteOpen = false;
  };

  const shortDates = (shown: Trip) => {
    const { first, last } = tripSpan(shown);
    return shortDateRange(first, last);
  };

  const pinDetails = (row: PastDropRow) =>
    [row.day?.text, row.status].filter((part): part is string => Boolean(part));

  const itemOf = (id: string): HereItem[] => {
    const row = rowsById.get(id);
    return row
      ? [
          {
            id,
            kind: row.gear.kind,
            layer: 'past',
            number: row.gear.number,
            day: row.day,
            uncollected: row.drop.collectedAt === null,
            name: row.name,
            details: pinDetails(row),
            summary: pinDetails(row).join(', ')
          }
        ]
      : [];
  };

  const places = $derived(
    rows.flatMap(({ drop }): MapPlace[] =>
      itemOf(drop.id).flatMap((item) =>
        drop.position
          ? [
              {
                id: drop.id,
                at: drop.position,
                layer: 'past',
                ...chipBoxes(item, null)
              }
            ]
          : []
      )
    )
  );

  let here = $state<string[]>([]);
  let hereOpener: HTMLElement | null = null;
  let hereApart = $state(false);
  let picked = false;
  const hereItems = $derived(inListOrder(here.flatMap(itemOf)));

  const rowClass =
    'flex min-h-14 w-full touch-manipulation items-center gap-3 px-4 py-1.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-muted';
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
          data-drop={row.drop.id}
          onclick={(event) => {
            onopen(row.drop.id, event.currentTarget, 'list');
          }}
        >
          <GearIcon kind={row.gear.kind} size={24} />
          <div class="min-w-0 flex-1">
            <p class="text-[17px] leading-snug font-medium">{row.name}</p>
            {#if row.drop.label}
              <p
                class="line-clamp-2 text-[16px] leading-snug [overflow-wrap:anywhere]"
              >
                {row.drop.label}
              </p>
            {/if}
            <p
              class="flex items-center gap-1.5 text-[15px] text-muted-foreground"
            >
              {#if row.drop.collectedAt === null}
                <UncollectedMark size={16} />
              {/if}
              {row.status}
            </p>
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
        class="-ml-2 flex min-h-11 touch-manipulation items-center gap-1 rounded-control px-2 text-[16px] font-medium text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
        class="mt-1 text-[22px] leading-tight font-semibold focus:outline-none"
      >
        <span aria-hidden="true">{shortDates(trip)}</span><span class="sr-only"
          >{tripDates(trip)}</span
        >
      </h1>
      <p class="pb-3 text-[15px] text-muted-foreground">
        {pastTripCounts(trip)}
      </p>
    </div>

    <div class="h-[45dvh]">
      {#await import('#lib/features/map/ChartMap.svelte')}
        <p class="px-4 pt-4 text-[16px] text-muted-foreground">Loading map</p>
      {:then { default: ChartMap }}
        <ChartMap {places} me={null} show={mapShow} {onshown}>
          {#snippet pin(id: string)}
            {#each itemOf(id) as item (item.id)}
              <button
                type="button"
                class="group grid size-11 place-items-center focus-visible:outline-none"
                aria-label={[item.name, ...item.details].join(', ')}
                data-drop={id}
                onclick={(event) => {
                  onopen(id, event.currentTarget, 'map');
                }}
              >
                <PinChip face={item} />
              </button>
            {/each}
          {/snippet}
          {#snippet group(lead: string, ids: string[], apart: boolean)}
            {#each itemOf(lead) as first (first.id)}
              <GroupPin
                lead={first}
                items={inListOrder(ids.flatMap(itemOf))}
                {apart}
                onopen={(opener: HTMLElement) => {
                  hereOpener = opener;
                  hereApart = apart;
                  here = ids;
                }}
              />
            {/each}
          {/snippet}
        </ChartMap>
      {:catch}
        <p class="px-4 pt-4 text-[16px]">
          The map can't show on this phone. The trip's gear is listed below.
        </p>
      {/await}
    </div>

    {#if multiDay}
      <fieldset class="px-4 pt-4">
        <legend class="mb-2 text-[17px] font-semibold">Days on this trip</legend
        >
        <div class="grid grid-cols-3 gap-2">
          {#each DAY_CHOICES as choice (choice.days)}
            <label class={DAY_CHOICE}>
              <input
                type="radio"
                name="past-trip-days"
                class={inputClass}
                value={choice.days}
                bind:group={selection}
              />
              <span class="pointer-events-none">{choice.name}</span>
              <SelectedCheck shown={selection === choice.days} />
            </label>
          {/each}
        </div>
      </fieldset>
    {/if}

    <h2 id="past-gear-title" class="px-4 pt-6 pb-2 text-[18px] font-semibold">
      Gear
    </h2>
    {#if byDay.length > 0}
      {#each byDay as group (group.day.number)}
        <section
          aria-labelledby="past-gear-title past-day-{group.day.number}-title"
        >
          <h3
            id="past-day-{group.day.number}-title"
            class="px-4 pt-3 pb-1 text-[16px] font-semibold"
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
        class="w-full {DESTRUCTIVE_BUTTON}"
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
      class="px-4 pt-3 pb-2 text-[22px] leading-tight font-semibold focus:outline-none"
    >
      Past trips
    </h1>
    {#if failed}
      <LoadFailed text="Couldn't load past trips." {onretry} />
    {/if}
    {#if past.length === 0}
      {#if !failed}
        <p class="px-4 text-[16px]">No past trips yet.</p>
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
                <p class="text-[17px] leading-snug font-medium">
                  <span aria-hidden="true">{shortDates(item)}</span><span
                    class="sr-only">{tripDates(item)}</span
                  >
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

<GearHere
  items={hereItems}
  apart={hereApart}
  onpick={(id: string) => {
    picked = true;
    here = [];
    if (hereOpener) onopen(id, hereOpener, 'map');
  }}
  onclose={() => {
    here = [];
  }}
  returnFocus={() => {
    if (picked) {
      picked = false;
      return null;
    }
    return hereOpener?.isConnected ? hereOpener : null;
  }}
/>

<Sheet
  open={deleteOpen && trip !== null}
  titleId={DELETE_TITLE_ID}
  onclose={keepTrip}
  returnFocus={() => (deleteButton?.isConnected ? deleteButton : titleHeading)}
>
  {#snippet heading()}
    <h2 id={DELETE_TITLE_ID} class="text-[22px] leading-tight font-semibold">
      Delete this trip?
    </h2>
  {/snippet}

  <p class="text-[16px] leading-normal">
    Its drops and catches are removed from this phone. This can't be undone.
  </p>

  {#snippet footer()}
    <button
      type="button"
      class="flex-1 {DESTRUCTIVE_BUTTON}"
      aria-disabled={deleting}
      onclick={() => void confirmDelete()}>Delete trip</button
    >
    <button
      type="button"
      class="flex-1 {PRIMARY_BUTTON}"
      aria-disabled={deleting}
      onclick={keepTrip}>Keep it</button
    >
  {/snippet}
</Sheet>
