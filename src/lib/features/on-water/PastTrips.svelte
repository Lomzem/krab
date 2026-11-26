<script lang="ts">
  import Icon from '#lib/shared/Icon.svelte';
  import { tick } from 'svelte';
  import {
    dayGroups,
    isMultiDay,
    pastDrops,
    pastTripSummaries,
    type PastDaySelection,
    type PastDropRow,
    type PastTripSummary,
    type Trip
  } from '#lib/features/trip/index.js';
  import DayMarker from './DayMarker.svelte';
  import GearMap from './GearMap.svelte';
  import type { MapItem } from './gear-here';
  import { FOCUS, FOCUS_INSET, PRESS } from '#lib/shared/control-states.js';
  import { DAY_CHOICE, DESTRUCTIVE_BUTTON, PRIMARY_BUTTON } from './controls';
  import GearIcon from './GearIcon.svelte';
  import LoadFailed from './LoadFailed.svelte';
  import SelectedCheck from './SelectedCheck.svelte';
  import Sheet from './Sheet.svelte';
  import type { Notice } from './on-water.svelte';
  import UncollectedMark from './UncollectedMark.svelte';

  const DELETE_TITLE_ID = 'delete-trip-title';
  const DELETE_NOTE_ID = 'delete-trip-note';
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
    onretry,
    notice
  }: {
    past: readonly Trip[];
    failed: boolean;
    selected?: string | null;
    titleHeading?: HTMLHeadingElement;
    show: string | null;
    onshown: () => void;
    onopen: (
      dropId: string,
      returnFocus: () => HTMLElement | null,
      from: 'list' | 'map'
    ) => void;
    ondelete: (tripId: string) => Promise<boolean>;
    onretry: () => Promise<void>;
    notice: Notice | null;
  } = $props();

  let selection = $state<PastDaySelection>('all');
  let deleteOpen = $state(false);
  let deleting = $state(false);
  let deleteButton = $state<HTMLButtonElement>();
  let keepButton = $state<HTMLButtonElement>();
  let list = $state<HTMLUListElement>();

  const summaries = $derived(pastTripSummaries(past));
  const summaryById = $derived(
    new Map(summaries.map((item) => [item.trip.id, item]))
  );
  const current = $derived(
    selected !== null ? (summaryById.get(selected) ?? null) : null
  );
  const trip = $derived(current?.trip ?? null);
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

  const tripTitle = (summary: PastTripSummary, short: boolean) => {
    const dates = short ? summary.shortDates : summary.dates;
    if (!summary.startTime) return dates;
    return short
      ? `${dates} · ${summary.startTime}`
      : `${dates}, ${summary.startTime}`;
  };

  const pinDetails = (row: PastDropRow) =>
    [row.day?.text, row.status].filter((part): part is string => Boolean(part));

  const mapItems = $derived(
    rows.flatMap((row): MapItem[] =>
      row.drop.position
        ? [
            {
              id: row.drop.id,
              kind: row.gear.kind,
              layer: 'past',
              number: row.gear.number,
              day: row.day,
              uncollected: row.drop.collectedAt === null,
              name: row.name,
              label: row.drop.label,
              details: pinDetails(row),
              summary: pinDetails(row).join(', '),
              at: row.drop.position,
              time: null
            }
          ]
        : []
    )
  );

  const rowClass = `flex min-h-14 w-full touch-manipulation items-center gap-3 px-4 py-1.5 text-left ${FOCUS_INSET} ${PRESS} active:bg-muted`;
  const inputClass = `peer absolute inset-0 size-full cursor-pointer appearance-none rounded-control ${FOCUS}`;
</script>

{#snippet dropRows(shown: PastDropRow[])}
  <ul class="@container border-t border-border bg-card">
    {#each shown as row (row.drop.id)}
      <li class="border-b border-border">
        <button
          type="button"
          class={[rowClass, !row.drop.position && '@max-[22rem]:flex-wrap']}
          data-drop={row.drop.id}
          onclick={(event) => {
            const opener = event.currentTarget;
            onopen(
              row.drop.id,
              () => (opener.isConnected ? opener : null),
              'list'
            );
          }}
        >
          <GearIcon kind={row.gear.kind} size={24} />
          <div
            class={[
              'min-w-0 flex-1',
              !row.drop.position && '@max-[22rem]:basis-[calc(100%-2.5rem)]'
            ]}
          >
            <p class="text-control leading-snug font-medium">{row.name}</p>
            {#if row.drop.label}
              <p
                class="line-clamp-2 text-base leading-snug [overflow-wrap:anywhere]"
              >
                {row.drop.label}
              </p>
            {/if}
            <p class="flex items-center gap-2 text-sm text-muted-foreground">
              {#if row.drop.collectedAt === null}
                <UncollectedMark size={16} />
              {/if}
              {row.status}
            </p>
          </div>
          {#if !row.drop.position}
            <p class="text-sm text-muted-foreground @max-[22rem]:ml-10">
              No position
            </p>
          {/if}
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

{#if current}
  <section aria-labelledby="past-trip-title" class="pb-6">
    <div class="px-4 pt-3">
      <button
        type="button"
        class="-ml-2 flex min-h-11 touch-manipulation items-center gap-1 rounded-control px-2 text-base font-medium text-primary {FOCUS}"
        onclick={() => void backToList()}
      >
        <Icon name="back" size={20} />All past trips
      </button>
      <h1
        id="past-trip-title"
        bind:this={titleHeading}
        tabindex="-1"
        class="mt-1 text-display font-semibold focus:outline-none"
      >
        <span aria-hidden="true">{tripTitle(current, true)}</span><span
          class="sr-only">{tripTitle(current, false)}</span
        >
      </h1>
      <p class="pb-3 text-sm text-muted-foreground">
        {current.counts}
      </p>
    </div>

    <div class="flex h-[45dvh] flex-col">
      <GearMap
        items={mapItems}
        locate={false}
        show={mapShow}
        {onshown}
        onopen={(dropId: string, returnFocus: () => HTMLElement | null) => {
          onopen(dropId, returnFocus, 'map');
        }}
      />
    </div>

    {#if multiDay}
      <fieldset class="px-4 pt-4">
        <legend class="mb-2 text-control font-semibold"
          >Days on this trip</legend
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

    <h2 id="past-gear-title" class="px-4 pt-6 pb-2 text-control font-semibold">
      Gear
    </h2>
    {#if byDay.length > 0}
      {#each byDay as group (group.day.number)}
        <section
          aria-labelledby="past-gear-title past-day-{group.day.number}-title"
        >
          <h3
            id="past-day-{group.day.number}-title"
            class="px-4 pt-3 pb-1 text-base font-semibold"
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
      class="px-4 pt-3 pb-2 text-display font-semibold focus:outline-none"
    >
      Past trips
    </h1>
    {#if failed}
      <LoadFailed text="Couldn't load past trips" {onretry} />
    {/if}
    {#if past.length === 0}
      {#if !failed}
        <p class="px-4 text-base">No past trips</p>
      {/if}
    {:else}
      <ul bind:this={list} class="border-t border-border bg-card">
        {#each summaries as item (item.trip.id)}
          <li class="border-b border-border">
            <button
              type="button"
              class={rowClass}
              data-trip={item.trip.id}
              onclick={() => {
                openTrip(item.trip.id);
              }}
            >
              <div class="min-w-0 flex-1">
                <p class="text-control leading-snug font-medium">
                  <span aria-hidden="true">{tripTitle(item, true)}</span><span
                    class="sr-only">{tripTitle(item, false)}</span
                  >
                </p>
                <p class="text-sm text-muted-foreground">
                  {item.counts}
                </p>
              </div>
              <Icon name="forward" size={20} class="text-muted-foreground" />
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
  describedBy={DELETE_NOTE_ID}
  initialFocus={() => keepButton}
  onclose={keepTrip}
  {notice}
  returnFocus={() => (deleteButton?.isConnected ? deleteButton : titleHeading)}
>
  {#snippet heading()}
    <h2 id={DELETE_TITLE_ID} class="text-title font-semibold">Delete trip?</h2>
  {/snippet}

  {#if current}
    <div id={DELETE_NOTE_ID} class="space-y-1 text-base leading-normal">
      <p class="font-medium">
        <span aria-hidden="true"
          >{tripTitle(current, true)} · {current.dropCount}</span
        ><span class="sr-only"
          >{tripTitle(current, false)}, {current.dropCount}</span
        >
      </p>
      <p class="text-muted-foreground">Can't be undone</p>
    </div>
  {/if}

  {#snippet footer()}
    <button
      bind:this={keepButton}
      type="button"
      class="flex-1 basis-36 {PRIMARY_BUTTON}"
      aria-disabled={deleting}
      onclick={keepTrip}>Keep trip</button
    >
    <button
      type="button"
      class="flex-1 basis-36 {DESTRUCTIVE_BUTTON}"
      aria-disabled={deleting}
      onclick={() => void confirmDelete()}>Delete trip</button
    >
  {/snippet}
</Sheet>
