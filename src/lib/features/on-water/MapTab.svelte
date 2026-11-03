<script lang="ts">
  import {
    CompassArrow,
    type CompassState
  } from '#lib/features/compass/index.js';
  import type { Base, Camera, MapPlace } from '#lib/features/map/index.js';
  import {
    compassPoint,
    gearInWater,
    nearestGear,
    roughness,
    type Fix,
    type GearRow,
    type Trip
  } from '#lib/features/trip/index.js';
  import GearIcon from './GearIcon.svelte';

  let {
    trip,
    fix,
    courseDeg,
    compass,
    oncompass,
    now,
    base = $bindable('chart'),
    camera = $bindable(null),
    show,
    onshown,
    onopen
  }: {
    trip: Trip | null;
    fix: Fix | null;
    courseDeg: number | null;
    compass: CompassState;
    oncompass: () => void;
    now: number;
    base?: Base;
    camera?: Camera | null;
    show: string | null;
    onshown: () => void;
    onopen: (dropId: string, opener: HTMLElement) => void;
  } = $props();

  const rows = $derived(trip ? gearInWater(trip, fix, now) : []);
  const nearest = $derived(nearestGear(rows));
  const rowsById = $derived(new Map(rows.map((row) => [row.drop.id, row])));
  const places = $derived(
    rows.flatMap(({ drop }): MapPlace[] =>
      drop.position ? [{ id: drop.id, at: drop.position }] : []
    )
  );
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

  const pinLabel = (row: GearRow) =>
    [
      row.name,
      row.direction && `${row.direction.distanceSpoken} ${row.direction.point}`,
      `in the water for ${row.timeInWater.spoken}`,
      row.rough && `rough position, within about ${row.rough.spoken}`
    ]
      .filter(Boolean)
      .join(', ');
</script>

<section class="flex h-full flex-col" aria-labelledby="map-title">
  <h1 id="map-title" class="sr-only">Map</h1>
  {#if !trip}
    <p class="border-b border-border bg-card px-4 py-3 text-[17px]">
      No trip running. Drop a pot or a net to start one.
    </p>
  {:else if nearest?.direction}
    {@const direction = nearest.direction}
    <section
      class="flex min-h-18 items-center gap-3 border-b border-l-4 border-border border-l-signal bg-card px-4 py-2"
      aria-labelledby="nearest-title"
    >
      <GearIcon kind={nearest.gear.kind} size={30} />
      <div class="min-w-0 flex-1">
        <h2 id="nearest-title" class="text-[19px] leading-snug font-bold">
          <span class="sr-only">Nearest gear: </span>{nearest.name}
        </h2>
        <p class="text-[15px] text-muted-foreground" aria-hidden="true">
          Nearest to you
        </p>
      </div>
      <CompassArrow
        bearingDeg={direction.bearingDeg}
        point={direction.point}
        {compass}
        ontoggle={oncompass}
      />
      <div class="text-right" aria-hidden="true">
        <p class="text-[21px] leading-tight font-bold tabular-nums">
          {direction.distance}
        </p>
        <p class="text-[14px] font-semibold text-muted-foreground">
          {direction.pointShort}
        </p>
      </div>
      <p class="sr-only">{direction.distanceSpoken} {direction.point}</p>
    </section>
  {/if}

  <div class="min-h-0 flex-1">
    {#await import('#lib/features/map/ChartMap.svelte')}
      <p class="px-4 pt-4 text-[17px] text-muted-foreground">Loading map</p>
    {:then { default: ChartMap }}
      <ChartMap
        bind:base
        bind:camera
        {places}
        {me}
        {headingDeg}
        {show}
        {onshown}
      >
        {#snippet pin(id: string)}
          {@const row = rowsById.get(id)}
          {#if row}
            <button
              type="button"
              class="group grid size-11 place-items-center focus-visible:outline-none"
              aria-label={pinLabel(row)}
              onclick={(event) => {
                onopen(id, event.currentTarget);
              }}
            >
              <span
                class="inline-flex items-center gap-0.5 rounded-md border-2 border-[#0f2a44] bg-[#0f2a44] py-1 pr-1.5 pl-1 text-[14px] leading-none font-bold text-white tabular-nums shadow group-focus-visible:outline-3 group-focus-visible:outline-offset-3 group-focus-visible:outline-[#c2410c]"
              >
                <GearIcon kind={row.gear.kind} size={17} />{row.gear.number}
              </span>
            </button>
            <span
              class="pointer-events-none absolute top-[calc(50%+15px)] left-1/2 -translate-x-1/2 rounded bg-white/90 px-1 text-[12px] leading-tight font-bold whitespace-nowrap text-[#0f2a44] tabular-nums"
              aria-hidden="true">{row.timeInWater.short}</span
            >
          {/if}
        {/snippet}
      </ChartMap>
    {:catch}
      <p class="px-4 pt-4 text-[17px]">
        The map can't show on this phone. Your gear is listed under Gear.
      </p>
    {/await}
  </div>
</section>
