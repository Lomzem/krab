<script lang="ts">
  import type { CompassState } from '#lib/features/compass/index.js';
  import type {
    Base,
    Camera,
    Lane,
    MapPlace
  } from '#lib/features/map/index.js';
  import {
    collectedGear,
    compassPoint,
    dropsInDays,
    gearCounts,
    gearInWater,
    isMultiDay,
    nearestGear,
    pastDrops,
    roughness,
    tripDates,
    type CollectedRow,
    type Fix,
    type GearRow,
    type PastDropRow,
    type Trip
  } from '#lib/features/trip/index.js';
  import DirectionCue from './DirectionCue.svelte';
  import GearHere from './GearHere.svelte';
  import { inListOrder, type HereItem } from './gear-here';
  import GearIcon from './GearIcon.svelte';
  import GroupPin from './GroupPin.svelte';
  import { DEFAULT_MAP_FILTER, type MapFilter } from './map-filter';
  import MapFilterSheet from './MapFilterSheet.svelte';
  import PinChip from './PinChip.svelte';
  import { chipBoxes } from './pin-chip';

  let {
    trip,
    past,
    canEnd,
    onend,
    endButton = $bindable(),
    fix,
    courseDeg,
    compass,
    oncompass,
    now,
    base = $bindable('chart'),
    camera = $bindable(null),
    filter = $bindable({ ...DEFAULT_MAP_FILTER }),
    show,
    onshown,
    onopen,
    onlane,
    newest,
    cover
  }: {
    trip: Trip | null;
    past: readonly Trip[];
    canEnd: boolean;
    onend: () => void;
    endButton?: HTMLButtonElement;
    fix: Fix | null;
    courseDeg: number | null;
    compass: CompassState;
    oncompass: () => void;
    now: number;
    base?: Base;
    camera?: Camera | null;
    filter?: MapFilter;
    show: string | null;
    onshown: () => void;
    onopen: (dropId: string, opener: HTMLElement) => void;
    onlane: (lane: Lane | null) => void;
    newest: string | null;
    cover: number;
  } = $props();

  const rows = $derived(trip ? gearInWater(trip, fix, now) : []);
  const nearest = $derived(nearestGear(rows));
  const rowsById = $derived(new Map(rows.map((row) => [row.drop.id, row])));
  const multiDay = $derived(trip !== null && isMultiDay(trip));
  const inDays = $derived(
    new Set(trip ? dropsInDays(trip, filter.days, now).map(({ id }) => id) : [])
  );
  const collected = $derived(
    trip && filter.collected ? collectedGear(trip) : []
  );
  const collectedById = $derived(
    new Map(collected.map((row) => [row.drop.id, row]))
  );
  type PastPin = PastDropRow & { dates: string };
  const pastPins = $derived(
    filter.past
      ? past.flatMap((ended) => {
          const dates = tripDates(ended);
          return pastDrops(ended, 'all').map((row): PastPin => ({
            ...row,
            dates
          }));
        })
      : []
  );
  const pastById = $derived(new Map(pastPins.map((row) => [row.drop.id, row])));
  const DAY_NAMES = {
    today: 'today only',
    earlier: 'earlier days only',
    all: 'all days'
  } as const;
  const filterSummary = $derived(
    [
      'gear in the water',
      filter.collected && 'collected gear',
      past.length > 0 && filter.past && 'past trips',
      filter.timeInWater && 'time in the water',
      multiDay && DAY_NAMES[filter.days]
    ]
      .filter(Boolean)
      .join(', ')
  );

  let filterOpen = $state(false);
  let filterButton = $state<HTMLButtonElement>();
  const rough = $derived(fix && roughness(fix));
  const headingDeg = $derived(
    compass.kind === 'usable' ? Math.round(compass.trueHeadingDeg) % 360 : null
  );
  const course = $derived(headingDeg === null ? courseDeg : null);
  const me = $derived(
    fix && {
      at: fix,
      accuracyM: fix.accuracyM,
      rough: rough !== null,
      courseDeg: course,
      label: [
        'Your position',
        rough && `rough, within about ${rough.spoken}`,
        course !== null && `heading ${compassPoint(course)[0]}`
      ]
        .filter(Boolean)
        .join(', ')
    }
  );

  const present = (parts: (string | false | null | undefined)[]) =>
    parts.filter((part): part is string => Boolean(part));

  const pinDetails = (row: GearRow) =>
    present([
      row.day?.text,
      row.direction && `${row.direction.distanceSpoken} ${row.direction.point}`,
      `in the water for ${row.timeInWater.spoken}`,
      row.rough && `rough position, within about ${row.rough.spoken}`
    ]);

  const pinSummary = (row: GearRow) =>
    present([
      row.day?.text,
      row.direction && `${row.direction.distance} ${row.direction.pointShort}`,
      `${row.timeInWater.short} in the water`,
      row.rough && `rough, within ${row.rough.short}`
    ]).join(', ');

  const pastDetails = (row: PastPin) => ['past trip', row.dates, row.status];

  const collectedDetails = (row: CollectedRow) =>
    present([row.day?.text, 'collected', row.catchText]);

  const label = (name: string, details: string[]) =>
    [name, ...details].join(', ');

  const itemOf = (id: string): HereItem[] => {
    const row = rowsById.get(id);
    if (row) {
      return [
        {
          id,
          kind: row.gear.kind,
          layer: 'in-water',
          number: row.gear.number,
          day: row.day,
          uncollected: false,
          name: row.name,
          details: pinDetails(row),
          summary: pinSummary(row)
        }
      ];
    }
    const done = collectedById.get(id);
    if (done) {
      return [
        {
          id,
          kind: done.gear.kind,
          layer: 'collected',
          number: done.gear.number,
          day: done.day,
          uncollected: false,
          name: done.name,
          details: collectedDetails(done),
          summary: collectedDetails(done).join(', ')
        }
      ];
    }
    const ended = pastById.get(id);
    if (ended) {
      return [
        {
          id,
          kind: ended.gear.kind,
          layer: 'past',
          number: null,
          day: null,
          uncollected: ended.drop.collectedAt === null,
          name: ended.name,
          details: pastDetails(ended),
          summary: pastDetails(ended).join(', ')
        }
      ];
    }
    return [];
  };

  const timeLabel = (id: string) => {
    const row = rowsById.get(id);
    return row && filter.timeInWater ? row.timeInWater.short : null;
  };

  const placeOf = (
    id: string,
    at: MapPlace['at'] | null,
    shown: boolean
  ): MapPlace[] =>
    itemOf(id).flatMap((item) =>
      at && shown
        ? [{ id, at, layer: item.layer, ...chipBoxes(item, timeLabel(id)) }]
        : []
    );
  const places = $derived([
    ...pastPins.flatMap(({ drop }) => placeOf(drop.id, drop.position, true)),
    ...collected.flatMap(({ drop }) =>
      placeOf(drop.id, drop.position, inDays.has(drop.id))
    ),
    ...rows.flatMap(({ drop }) =>
      placeOf(drop.id, drop.position, inDays.has(drop.id))
    )
  ]);

  let here = $state<string[]>([]);
  let hereOpener: HTMLElement | null = null;
  let hereApart = $state(false);
  let picked = false;
  const hereItems = $derived(inListOrder(here.flatMap(itemOf)));

  const pick = (id: string) => {
    picked = true;
    here = [];
    if (hereOpener) onopen(id, hereOpener);
  };
</script>

<section class="flex h-full flex-col" aria-labelledby="map-title">
  <h1 id="map-title" class="sr-only">Map</h1>
  {#if trip}
    <div
      class="flex min-h-12 items-center gap-3 border-b border-border bg-card py-0.5 pr-2 pl-4"
    >
      <p class="min-w-0 flex-1 text-[15px] text-muted-foreground">
        Trip running. {gearCounts(trip).inWater}.
      </p>
      <button
        bind:this={endButton}
        type="button"
        class="min-h-11 touch-manipulation rounded-control px-3 text-[16px] font-semibold text-destructive underline-offset-3 transition-opacity duration-0 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-60 aria-disabled:delay-500"
        aria-haspopup="dialog"
        aria-disabled={!canEnd}
        onclick={() => {
          if (canEnd) onend();
        }}>End trip</button
      >
    </div>
  {/if}
  {#if !trip}
    <p
      class="border-b border-border bg-card px-4 py-3 text-[16px] text-muted-foreground"
    >
      No trip running. Drop a pot or a net to start one.
    </p>
  {:else if nearest?.direction}
    {@const direction = nearest.direction}
    <section
      class="flex min-h-14 items-center gap-3 border-b border-border bg-card px-4 py-1"
      aria-labelledby="nearest-title"
    >
      <span class="text-primary"
        ><GearIcon kind={nearest.gear.kind} size={24} /></span
      >
      <div class="min-w-0 flex-1">
        <h2 id="nearest-title" class="text-[17px] leading-snug font-semibold">
          <span class="sr-only">Nearest gear: </span>{nearest.name}
        </h2>
        <p class="text-[14px] text-muted-foreground" aria-hidden="true">
          Nearest to you
        </p>
      </div>
      <DirectionCue {direction} {compass} ontoggle={oncompass} />
    </section>
  {/if}

  <div class="min-h-0 flex-1">
    {#await import('#lib/features/map/ChartMap.svelte')}
      <p class="px-4 pt-4 text-[16px] text-muted-foreground">Loading map</p>
    {:then { default: ChartMap }}
      <ChartMap
        bind:base
        bind:camera
        {places}
        {me}
        {headingDeg}
        {show}
        {onshown}
        {onlane}
        keepClear={newest}
        {cover}
      >
        {#snippet controls()}
          {#if trip || past.length > 0}
            <button
              bind:this={filterButton}
              type="button"
              class="flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-control px-2.5 text-[15px] font-medium text-foreground hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-haspopup="dialog"
              aria-label="Filter, showing {filterSummary}"
              onclick={() => {
                filterOpen = true;
              }}
            >
              <svg
                class="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg
              >Filter
            </button>
          {/if}
        {/snippet}
        {#snippet pin(id: string, selected: boolean)}
          {#each itemOf(id) as item (item.id)}
            {@const time = timeLabel(id)}
            <button
              type="button"
              class="group grid size-11 place-items-center focus-visible:outline-none"
              aria-label={label(item.name, item.details)}
              aria-current={selected || undefined}
              data-drop={id}
              onclick={(event) => {
                onopen(id, event.currentTarget);
              }}
            >
              <PinChip face={item} {selected} />
            </button>
            {#if time}
              <span
                class="pointer-events-none absolute top-[calc(50%+15px)] left-1/2 -translate-x-1/2 rounded bg-white/90 px-1 text-[12px] leading-tight font-semibold whitespace-nowrap text-[#1a2e2b] tabular-nums"
                aria-hidden="true">{time}</span
              >
            {/if}
          {/each}
        {/snippet}
        {#snippet group(
          lead: string,
          ids: string[],
          apart: boolean,
          selected: boolean
        )}
          {#each itemOf(lead) as first (first.id)}
            <GroupPin
              lead={first}
              items={inListOrder(ids.flatMap(itemOf))}
              {apart}
              {selected}
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
        The map can't show on this phone. Your gear is listed under Gear.
      </p>
    {/await}
  </div>
</section>

<MapFilterSheet
  open={filterOpen}
  bind:filter
  {multiDay}
  hasPast={past.length > 0}
  onclose={() => {
    filterOpen = false;
  }}
  returnFocus={() => filterButton}
/>

<GearHere
  items={hereItems}
  apart={hereApart}
  onpick={pick}
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
