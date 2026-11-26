<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from '#lib/shared/Icon.svelte';
  import { FOCUS_INSET, PRESS } from '#lib/shared/control-states.js';
  import type { CompassState } from '#lib/features/compass/index.js';
  import type { Base, Camera } from '#lib/features/map/index.js';
  import {
    compassPoint,
    pastGear,
    roughness,
    tripDates,
    type ActiveGear,
    type CollectedRow,
    type Fix,
    type GearRow,
    type PastDropRow,
    type Trip
  } from '#lib/features/trip/index.js';
  import GearMap from './GearMap.svelte';
  import type { HereItem, MapItem } from './gear-here';
  import {
    DEFAULT_MAP_FILTER,
    filterHides,
    type MapFilter
  } from './map-filter';
  import MapFilterSheet from './MapFilterSheet.svelte';

  let {
    gear,
    past,
    fix,
    lastFix,
    courseDeg,
    compass,
    compassShown,
    oncompass,
    base = $bindable('chart'),
    camera = $bindable(null),
    filter = $bindable({ ...DEFAULT_MAP_FILTER }),
    show,
    onshown,
    onopen,
    newest
  }: {
    gear: ActiveGear | null;
    past: readonly Trip[];
    fix: Fix | null;
    lastFix: Fix | null;
    courseDeg: number | null;
    compass: CompassState;
    compassShown: boolean;
    oncompass: () => void;
    base?: Base;
    camera?: Camera | null;
    filter?: MapFilter;
    show: string | null;
    onshown: () => void;
    onopen: (dropId: string, returnFocus: () => HTMLElement | null) => void;
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
  const rows = $derived(gear?.inWater ?? []);
  const rowsById = $derived(new Map(rows.map((row) => [row.drop.id, row])));
  const multiDay = $derived(gear?.multiDay ?? false);
  const inDays = $derived(gear?.inDays ?? new Set<string>());
  const collected = $derived(gear && filter.collected ? gear.collected : []);
  const collectedById = $derived(
    new Map(collected.map((row) => [row.drop.id, row]))
  );
  type PastPin = PastDropRow & { dates: string };
  const pastPins = $derived(
    filter.past
      ? past.flatMap((ended) => {
          const dates = tripDates(ended);
          return pastGear(ended, 'all').rows.map((row): PastPin => ({
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
  const hides = $derived(filterHides(filter, gear));
  const filterSummary = $derived(
    [
      gear && 'gear in the water',
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

  const mapItemOf = (
    id: string,
    at: MapItem['at'] | null,
    shown: boolean
  ): MapItem[] =>
    at && shown
      ? itemOf(id).map((item) => ({ ...item, at, time: timeLabel(id) }))
      : [];
  const mapItems = $derived([
    ...pastPins.flatMap(({ drop }) => mapItemOf(drop.id, drop.position, true)),
    ...collected.flatMap(({ drop }) =>
      mapItemOf(drop.id, drop.position, inDays.has(drop.id))
    ),
    ...rows.flatMap(({ drop }) =>
      mapItemOf(drop.id, drop.position, inDays.has(drop.id))
    )
  ]);
</script>

<GearMap
  items={mapItems}
  {itemOf}
  {onopen}
  bind:base
  bind:camera
  {me}
  headingDeg={fix ? headingDeg : null}
  {show}
  {onshown}
  keepClear={newest}
  fitLabel={hides ? 'Fit shown gear' : 'Show all gear'}
>
  {#snippet controls()}
    {#if gear || past.length > 0}
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
          name={compass.kind === 'unavailable' ? 'compass-off' : 'compass'}
        />
      </button>
      <span id="compass-state" class="sr-only">{compassState}</span>
    {/if}
  {/snippet}
  {#snippet frame(map: Snippet)}
    <section class="flex flex-1 flex-col" aria-labelledby="map-title">
      <h1 id="map-title" class="sr-only">Map</h1>
      <div class="flex flex-1 flex-col">
        {@render map()}
      </div>
    </section>
  {/snippet}
</GearMap>

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
