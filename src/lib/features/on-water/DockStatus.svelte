<script lang="ts">
  import { Button } from '@ui-sdk/svelte/button';
  import { arrowDeg, BearingArrow } from '#lib/features/compass/index.js';
  import type { CompassState } from '#lib/features/compass/index.js';
  import {
    roughness,
    type ActiveGear,
    type Availability,
    type GearRow
  } from '#lib/features/trip/index.js';
  import { FOCUS, FOCUS_INSET, PRESS } from '#lib/shared/control-states.js';
  import GearIcon from './GearIcon.svelte';

  let {
    screen,
    status,
    loaded = true,
    gear,
    nearest,
    compass,
    onopen,
    onsteps
  }: {
    screen: 'map' | 'gear';
    status: Availability | null;
    loaded?: boolean;
    gear: ActiveGear | null;
    nearest: GearRow | null;
    compass: CompassState;
    onopen: (dropId: string, opener: HTMLElement) => void;
    onsteps: (opener: HTMLElement) => void;
  } = $props();

  const LINE_1 = 'text-control font-semibold';
  const LINE_2 = 'flex items-center gap-1.5 text-sm text-muted-foreground';
  const count = $derived.by(() => {
    if (!loaded) return null;
    return gear?.counts.inWater ?? 'Nothing in the water';
  });
  const rough = $derived(status?.kind === 'ready' && roughness(status.fix));
  const direction = $derived(
    status?.kind === 'ready' ? (nearest?.direction ?? null) : null
  );
  let pressedDropId: string | null = null;

  $effect(() => {
    if (!nearest) pressedDropId = null;
  });
</script>

{#snippet roughLine()}
  <span class={LINE_2}>
    <span class="size-2 rounded-full bg-warning" aria-hidden="true"></span>
    Rough position
  </span>
{/snippet}

{#if status?.kind === 'denied'}
  <section
    class="flex min-h-14 w-full items-center gap-3 py-1 pr-1 pl-4"
    aria-labelledby="location-off-title"
  >
    <span class="size-2.5 flex-none rounded-full bg-warning" aria-hidden="true"
    ></span>
    <h2 id="location-off-title" class="min-w-0 flex-1 {LINE_1}">
      Location is off
    </h2>
    <Button
      class="min-h-11 flex-none touch-manipulation rounded-control px-3 text-base font-semibold text-action underline underline-offset-4 {FOCUS} {PRESS} active:bg-muted"
      aria-haspopup="dialog"
      onclick={(event) => {
        if (event.currentTarget instanceof HTMLElement)
          onsteps(event.currentTarget);
      }}>Show steps</Button
    >
  </section>
{:else if screen === 'gear'}
  {#if status?.kind === 'finding'}
    <p
      class="flex min-h-14 w-full items-center gap-2 px-4 py-1 text-sm text-muted-foreground"
    >
      <span
        class="size-2 rounded-full border-2 border-muted-foreground"
        aria-hidden="true"
      ></span>
      Finding position
    </p>
  {/if}
{:else if status?.kind === 'finding'}
  <p class="flex min-h-14 w-full flex-col justify-center px-4 py-1">
    {#if count}
      <span class={LINE_1}>{count}</span>
    {/if}
    <span class={LINE_2}>
      <span
        class="size-2 rounded-full border-2 border-muted-foreground"
        aria-hidden="true"
      ></span>
      Finding position
    </span>
  </p>
{:else if nearest && direction}
  <Button
    class="flex min-h-14 w-full touch-manipulation items-center gap-3 py-1 pr-3 pl-4 text-left {FOCUS_INSET} {PRESS} active:bg-muted"
    onpointerdown={() => {
      pressedDropId = nearest.drop.id;
    }}
    onpointercancel={() => {
      pressedDropId = null;
    }}
    onclick={(event) => {
      const target =
        event.detail > 0 && pressedDropId ? pressedDropId : nearest.drop.id;
      pressedDropId = null;
      if (event.currentTarget instanceof HTMLElement)
        onopen(target, event.currentTarget);
    }}
  >
    <span class="flex-none text-foreground"
      ><GearIcon kind={nearest.gear.kind} size={24} /></span
    >
    <span class="flex min-w-0 flex-1 flex-col">
      <span class={LINE_1}
        ><span class="sr-only">Nearest gear: </span>{nearest.name}</span
      >
      {#if rough}
        {@render roughLine()}
      {:else}
        <span class={LINE_2} aria-hidden="true">Nearest</span>
      {/if}
    </span>
    {#if direction.atGear}
      <span class="flex-none text-title font-semibold whitespace-nowrap"
        ><span class="sr-only">, </span>At gear</span
      >
    {:else}
      <span class="flex flex-none items-center gap-1.5">
        <span class="text-title font-semibold whitespace-nowrap tabular-nums"
          ><span aria-hidden="true"
            >{direction.distance} {direction.pointShort}</span
          ><span class="sr-only"
            >, {direction.distanceSpoken} {direction.point}</span
          ></span
        >
        <span class="size-6 flex-none text-foreground">
          {#if compass.kind === 'usable'}
            <BearingArrow degrees={arrowDeg(direction.bearingDeg, compass)} />
          {/if}
        </span>
      </span>
    {/if}
  </Button>
{:else}
  <p class="flex min-h-14 w-full flex-col justify-center px-4 py-1">
    {#if count}
      <span class={LINE_1}>{count}</span>
    {/if}
    {#if rough}
      {@render roughLine()}
    {/if}
  </p>
{/if}
