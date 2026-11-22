<script lang="ts">
  import {
    CompassArrow,
    type CompassState
  } from '#lib/features/compass/index.js';
  import type { Direction } from '#lib/features/trip/index.js';

  let {
    direction,
    compass,
    ontoggle
  }: {
    direction: Direction;
    compass: CompassState;
    ontoggle: () => void;
  } = $props();
</script>

{#if direction.atGear}
  <p class="text-title font-semibold whitespace-nowrap">At gear</p>
{:else}
  <CompassArrow
    bearingDeg={direction.bearingDeg}
    point={direction.point}
    {compass}
    {ontoggle}
  >
    {#snippet beside()}
      <div class="text-right whitespace-nowrap" aria-hidden="true">
        <p class="text-title font-semibold tabular-nums">
          {direction.distance}
        </p>
        <p class="text-sm font-medium text-muted-foreground">
          {direction.pointShort}
        </p>
      </div>
      <span class="sr-only">{direction.distanceSpoken} {direction.point}</span>
    {/snippet}
  </CompassArrow>
{/if}
