<script lang="ts">
  import Icon from '#lib/icon/Icon.svelte';
  import { FOCUS_INSET, PRESS } from './controls';
  import type { CompassState } from '#lib/features/compass/index.js';
  import type { Base, Camera, MapPlace } from '#lib/features/map/index.js';
  import {
    collectedGear,
    compassPoint,
    dropsInDays,
    gearInWater,
    isMultiDay,
    pastDrops,
    roughness,
    tripDates,
    type CollectedRow,
    type Fix,
    type GearRow,
    type PastDropRow,
    type Trip
  } from '#lib/features/trip/index.js';
  import GearHere from './GearHere.svelte';
  import { inListOrder, spokenItem, type HereItem } from './gear-here';
  import GroupPin from './GroupPin.svelte';
  import {
    DEFAULT_MAP_FILTER,
    filterHides,
    type MapFilter
  } from './map-filter';
  import MapFilterSheet from './MapFilterSheet.svelte';
  import PinChip from './PinChip.svelte';
  import { chipBoxes } from './pin-chip';

  let {
    trip,
    past,
    fix,
    lastFix,
    courseDeg,
    compass,
    compassShown,
    oncompass,
    now,
    base = $bindable('chart'),
    camera = $bindable(null),
    filter = $bindable({ ...DEFAULT_MAP_FILTER }),
    show,
    onshown,
    onopen,
    newest
  }: {
    trip: Trip | null;
    past: readonly Trip[];
    fix: Fix | null;
    lastFix: Fix | null;
    courseDeg: number | null;
    compass: CompassState;
    compassShown: boolean;
    oncompass: () => void;
    now: number;
    base?: Base;
    camera?: Camera | null;
    filter?: MapFilter;
    show: string | null;
    onshown: () => void;
    onopen: (dropId: string, opener: HTMLElement) => void;
    newest: string | null;
  } = $props();

  const CAPSULE_BUTTON = `flex h-11 w-full touch-manipulation tiny-map:w-11 items-center justify-center ${FOCUS_INSET} ${PRESS} active:bg-muted`;
  const COMPASS_STATES: Record<
    Exclude<CompassState['kind'], 'unavailable'>,
    string
  > = {
    off: 'Compass off',
    waiting: 'Compass paused',
    starting: 'Compass starting',
    calibrating: 'Compass needs calibrating',
    usable: 'Compass on'
  };
  const rows = $derived(trip ? gearInWater(trip, fix, now) : []);
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
  const hides = $derived(filterHides(filter, trip));
  const filterSummary = $derived(
    [
      trip && 'gear in the water',
      filter.collected && 'collected gear',
      past.length > 0 && filter.past && 'past trips',
      filter.timeInWater && 'time in the water',
      multiDay && DAY_NAMES[filter.days]
    ]
      .filter(Boolean)
      .join(', ')
  );

  const compassOn = $derived(
    compass.kind !== 'off' && compass.kind !== 'unavailable'
  );
  const compassState = $derived.by(() => {
    if (compass.kind !== 'unavailable') return COMPASS_STATES[compass.kind];
    return compass.reason === 'denied'
      ? 'Motion access off'
      : 'Compass unavailable';
  });

  let filterOpen = $state(false);
  let filterButton = $state<HTMLButtonElement>();
  const rough = $derived(fix && roughness(fix));
  const headingDeg = $derived(
    compass.kind === 'usable' ? Math.round(compass.trueHeadingDeg) % 360 : null
  );
  const course = $derived(headingDeg === null ? courseDeg : null);
  const current = $derived(
    fix && {
      at: fix,
      accuracyM: fix.accuracyM,
      rough: rough !== null,
      current: true,
      courseDeg: course,
      label: [
        'Current position',
        rough && `rough, within about ${rough.spoken}`,
        course !== null && `heading ${compassPoint(course)[0]}`
      ]
        .filter(Boolean)
        .join(', ')
    }
  );
  const me = $derived(
    current ??
      (lastFix && {
        at: lastFix,
        accuracyM: lastFix.accuracyM,
        rough: false,
        current: false,
        courseDeg: null,
        label: 'Last position'
      })
  );

  const present = (parts: (string | false | null | undefined)[]) =>
    parts.filter((part): part is string => Boolean(part));

  const pinDetails = (row: GearRow) =>
    present([
      row.day?.text,
      row.direction &&
        (row.direction.atGear
          ? 'At gear'
          : `${row.direction.distanceSpoken} ${row.direction.point}`),
      `in the water for ${row.timeInWater.spoken}`,
      row.rough && `rough position, within about ${row.rough.spoken}`
    ]);

  const pinSummary = (row: GearRow) =>
    present([
      row.day?.text,
      row.direction &&
        (row.direction.atGear
          ? 'At gear'
          : `${row.direction.distance} ${row.direction.pointShort}`),
      `${row.timeInWater.short} in the water`,
      row.rough && `rough, within ${row.rough.short}`
    ]).join(', ');

  const pastDetails = (row: PastPin) => ['past trip', row.dates, row.status];

  const collectedDetails = (row: CollectedRow) =>
    present([row.day?.text, 'collected', row.catchText]);

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
          label: row.drop.label,
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
          label: done.drop.label,
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
          label: ended.drop.label,
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

<section class="flex flex-1 flex-col" aria-labelledby="map-title">
  <h1 id="map-title" class="sr-only">Map</h1>
  <div class="flex flex-1 flex-col">
    {#await import('#lib/features/map/ChartMap.svelte')}
      <p class="px-4 pt-4 text-base text-muted-foreground">Loading map</p>
    {:then { default: ChartMap }}
      <ChartMap
        bind:base
        bind:camera
        {places}
        {me}
        headingDeg={fix ? headingDeg : null}
        {show}
        {onshown}
        keepClear={newest}
        fitLabel={hides ? 'Fit shown gear' : 'Show all gear'}
      >
        {#snippet controls()}
          {#if trip || past.length > 0}
            <button
              bind:this={filterButton}
              type="button"
              class="relative {CAPSULE_BUTTON} data-active:bg-accent data-active:text-accent-foreground"
              data-active={hides || undefined}
              aria-haspopup="dialog"
              aria-label="Filter, showing {filterSummary}"
              onclick={() => {
                filterOpen = true;
              }}
            >
              <Icon name="filter" />
              {#if hides}
                <span
                  class="absolute top-2 right-2 size-2 rounded-full bg-action"
                  aria-hidden="true"
                ></span>
              {/if}
            </button>
          {/if}
          {#if compassShown}
            <button
              type="button"
              class="{CAPSULE_BUTTON} aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              aria-label="Compass"
              aria-pressed={compassOn}
              aria-describedby="compass-state"
              onclick={oncompass}
            >
              <Icon
                name={compass.kind === 'unavailable'
                  ? 'compass-off'
                  : 'compass'}
              />
            </button>
            <span id="compass-state" class="sr-only">{compassState}</span>
          {/if}
        {/snippet}
        {#snippet pin(id: string, selected: boolean)}
          {#each itemOf(id) as item (item.id)}
            {@const time = timeLabel(id)}
            <button
              type="button"
              class="group grid size-11 place-items-center focus-visible:outline-none"
              aria-label={spokenItem(item)}
              aria-haspopup="dialog"
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
                class="pointer-events-none absolute top-[calc(50%+15px)] left-1/2 -translate-x-1/2 rounded bg-map-paper/90 px-1 text-xs leading-tight font-semibold whitespace-nowrap text-[#1a2e2b] tabular-nums"
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
      <p class="px-4 pt-4 text-base">This phone can't show maps</p>
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
