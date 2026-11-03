<script lang="ts">
  import {
    gearInWater,
    type LatLon,
    type Trip
  } from '#lib/features/trip/index.js';
  import BearingArrow from './BearingArrow.svelte';
  import { inWaterText } from './counts';
  import GearIcon from './GearIcon.svelte';

  let {
    trip,
    from,
    now
  }: { trip: Trip | null; from: LatLon | null; now: number } = $props();

  const rows = $derived(trip ? gearInWater(trip, from, now) : []);
</script>

<header class="px-4 pt-5 pb-3">
  <h1 class="text-[34px] leading-tight font-bold">Gear</h1>
  {#if trip}
    <p class="text-[17px] text-muted-foreground">{inWaterText(rows.length)}</p>
  {/if}
</header>

{#if trip}
  <ul class="border-t border-border bg-card">
    {#each rows as row (row.drop.id)}
      <li
        class="flex min-h-16 items-center gap-3 border-b border-border px-4 py-2"
      >
        <GearIcon kind={row.gear.kind} size={28} />
        <div class="min-w-0 flex-1">
          <p class="text-[19px] leading-snug font-semibold">{row.name}</p>
          <p class="text-[15px] text-muted-foreground">
            <span aria-hidden="true">{row.timeInWater.short} in the water</span>
            <span class="sr-only"
              >In the water for {row.timeInWater.spoken}</span
            >
          </p>
          {#if row.rough}
            <p class="text-[15px] font-semibold text-destructive">
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
          <div class="flex items-center gap-2">
            <BearingArrow degrees={row.direction.bearingDeg} />
            <div class="text-right" aria-hidden="true">
              <p class="text-[21px] leading-tight font-bold tabular-nums">
                {row.direction.distance}
              </p>
              <p class="text-[14px] font-semibold text-muted-foreground">
                {row.direction.pointShort}
              </p>
            </div>
            <span class="sr-only"
              >{row.direction.distanceSpoken} {row.direction.point}</span
            >
          </div>
        {:else}
          <p class="text-[15px] font-semibold text-muted-foreground">
            {row.drop.position ? 'Waiting for location' : 'No position'}
          </p>
        {/if}
      </li>
    {/each}
  </ul>
{:else}
  <p class="px-4 text-[17px]">
    No trip running. Drop a pot or a net to start one.
  </p>
{/if}
