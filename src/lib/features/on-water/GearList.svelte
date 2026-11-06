<script lang="ts">
  import {
    arrowDeg,
    BearingArrow,
    type CompassState
  } from '#lib/features/compass/index.js';
  import {
    collectedGear,
    gearCounts,
    dayGroups,
    gearInWater,
    type CollectedRow,
    type GearRow,
    type LatLon,
    type Trip
  } from '#lib/features/trip/index.js';
  import DayMarker from './DayMarker.svelte';
  import GearIcon from './GearIcon.svelte';

  let {
    trip,
    from,
    compass,
    now,
    onopen
  }: {
    trip: Trip | null;
    from: LatLon | null;
    compass: CompassState;
    now: number;
    onopen: (dropId: string, opener: HTMLElement) => void;
  } = $props();

  const rows = $derived(trip ? gearInWater(trip, from, now) : []);
  const collected = $derived(trip ? collectedGear(trip) : []);
  const counts = $derived(trip ? gearCounts(trip) : null);
  const inWaterByDay = $derived(dayGroups(rows));
  const collectedByDay = $derived(dayGroups(collected));

  const rowClass =
    'flex min-h-14 w-full touch-manipulation items-center gap-3 px-4 py-1.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring active:bg-muted';
</script>

<header class="px-4 pt-3 pb-2">
  <h1 class="text-[22px] leading-tight font-semibold">Gear</h1>
  {#if counts}
    <p class="text-[15px] text-muted-foreground">
      {counts.inWater}<span aria-hidden="true">&nbsp;·</span><span
        class="sr-only">,</span
      >
      {counts.collected}
    </p>
  {/if}
</header>

{#snippet dropLabel(label: string)}
  {#if label}
    <p class="line-clamp-2 text-[16px] leading-snug [overflow-wrap:anywhere]">
      {label}
    </p>
  {/if}
{/snippet}

{#snippet gearRows(shown: GearRow[])}
  <ul class="@container border-t border-border bg-card">
    {#each shown as row (row.drop.id)}
      {@render gearRow(row)}
    {/each}
  </ul>
{/snippet}

{#snippet gearRow(row: GearRow)}
  <li class="border-b border-border">
    <button
      type="button"
      class={[
        rowClass,
        row.direction ? '@max-2xs:flex-wrap' : '@max-[22rem]:flex-wrap'
      ]}
      data-drop={row.drop.id}
      onclick={(event) => {
        onopen(row.drop.id, event.currentTarget);
      }}
    >
      <GearIcon kind={row.gear.kind} size={24} />
      <div
        class={[
          'min-w-0 flex-1',
          row.direction
            ? '@max-2xs:basis-[calc(100%-2.5rem)]'
            : '@max-[22rem]:basis-[calc(100%-2.5rem)]'
        ]}
      >
        <p class="text-[17px] leading-snug font-medium">{row.name}</p>
        {@render dropLabel(row.drop.label)}
        <p class="text-[15px] text-muted-foreground">
          <span aria-hidden="true">{row.timeInWater.short} in the water</span>
          <span class="sr-only">In the water for {row.timeInWater.spoken}</span>
        </p>
        {#if row.rough}
          <p class="text-[15px] font-medium text-destructive">
            <span aria-hidden="true"
              >Rough position, within about {row.rough.short}</span
            >
            <span class="sr-only"
              >Rough position, within about {row.rough.spoken}</span
            >
          </p>
        {/if}
      </div>
      {#if row.direction}
        <div class="flex items-center gap-2 @max-2xs:ml-10">
          <BearingArrow degrees={arrowDeg(row.direction.bearingDeg, compass)} />
          <div class="text-right" aria-hidden="true">
            <p
              class="text-[19px] leading-tight font-semibold whitespace-nowrap tabular-nums"
            >
              {row.direction.distance}
            </p>
            <p class="text-[13px] font-medium text-muted-foreground">
              {row.direction.pointShort}
            </p>
          </div>
          <span class="sr-only"
            >{row.direction.distanceSpoken} {row.direction.point}</span
          >
        </div>
      {:else}
        <p class="text-[15px] text-muted-foreground @max-[22rem]:ml-10">
          {row.drop.position ? 'Waiting for location' : 'No position'}
        </p>
      {/if}
    </button>
  </li>{/snippet}

{#snippet collectedRows(shown: CollectedRow[])}
  <ul class="border-t border-border bg-card">
    {#each shown as item (item.drop.id)}
      <li class="border-b border-border">
        <button
          type="button"
          class={rowClass}
          data-drop={item.drop.id}
          onclick={(event) => {
            onopen(item.drop.id, event.currentTarget);
          }}
        >
          <GearIcon kind={item.gear.kind} size={24} />
          <div class="min-w-0 flex-1">
            <p class="text-[17px] leading-snug font-medium">{item.name}</p>
            {@render dropLabel(item.drop.label)}
            <p class="text-[15px] text-muted-foreground">{item.catchText}</p>
          </div>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

{#if trip}
  {#if inWaterByDay.length > 0}
    {#each inWaterByDay as group (group.day.number)}
      <section aria-labelledby="day-{group.day.number}-title">
        <h2
          id="day-{group.day.number}-title"
          class="px-4 pt-3 pb-1 text-[17px] font-semibold"
        >
          <DayMarker day={group.day} size={22} />
        </h2>
        {@render gearRows(group.rows)}
      </section>
    {/each}
  {:else}
    {@render gearRows(rows)}
  {/if}
  {#if collected.length > 0}
    <section aria-labelledby="collected-title">
      <h2 id="collected-title" class="px-4 pt-5 pb-1 text-[17px] font-semibold">
        Collected
      </h2>
      {#if collectedByDay.length > 0}
        {#each collectedByDay as group (group.day.number)}
          <section
            aria-labelledby="collected-title collected-day-{group.day
              .number}-title"
          >
            <h3
              id="collected-day-{group.day.number}-title"
              class="px-4 pt-2 pb-1 text-[15px] font-medium text-muted-foreground"
            >
              <DayMarker day={group.day} size={20} />
            </h3>
            {@render collectedRows(group.rows)}
          </section>
        {/each}
      {:else}
        {@render collectedRows(collected)}
      {/if}
    </section>
  {/if}
{:else}
  <p class="px-4 text-[16px]">
    No trip running. Drop a pot or a net to start one.
  </p>
{/if}
