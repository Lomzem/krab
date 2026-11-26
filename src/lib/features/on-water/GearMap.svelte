<script lang="ts">
  import type { Snippet } from 'svelte';
  import {
    loadChartMap,
    type Base,
    type Camera,
    type MapPlace,
    type MyPosition,
    type Spot
  } from '#lib/features/map/index.js';
  import GearHere from './GearHere.svelte';
  import {
    groupChip,
    inListOrder,
    spokenItem,
    type HereItem,
    type MapItem
  } from './gear-here';
  import GroupPin from './GroupPin.svelte';
  import PinChip from './PinChip.svelte';
  import { chipBoxes, LAYER_PRIORITY } from './pin-chip';

  type ReturnFocus = () => HTMLElement | null;

  let {
    items,
    itemOf,
    onopen,
    base = $bindable('chart'),
    camera = $bindable(null),
    me = null,
    locate = true,
    headingDeg = null,
    show,
    onshown,
    keepClear = null,
    fitLabel,
    controls,
    frame
  }: {
    items: MapItem[];
    itemOf?: (id: string) => HereItem[];
    onopen: (dropId: string, returnFocus: ReturnFocus) => void;
    base?: Base;
    camera?: Camera | null;
    me?: MyPosition | null;
    locate?: boolean;
    headingDeg?: number | null;
    show: string | null;
    onshown: () => void;
    keepClear?: string | null;
    fitLabel?: string;
    controls?: Snippet;
    frame?: Snippet<[map: Snippet]>;
  } = $props();

  let chart = $state<{
    focusTarget: (ids: readonly string[]) => HTMLElement | null;
    canvas: () => HTMLElement | null;
  }>();

  const byId = $derived(new Map(items.map((item) => [item.id, item])));
  const places = $derived(
    items.map((item): MapPlace => ({
      id: item.id,
      at: item.at,
      priority: LAYER_PRIORITY[item.layer],
      ...chipBoxes(item, item.time)
    }))
  );

  const itemsOf = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const item = byId.get(id);
      return item ? [item] : [];
    });

  const chipOf = (spot: Spot) => {
    const lead = byId.get(spot.lead);
    return lead && groupChip(lead, inListOrder(itemsOf(spot.ids)), spot.apart);
  };

  const label = (spot: Spot) => {
    const lead = byId.get(spot.lead);
    if (!lead) return '';
    return spot.ids.length === 1
      ? spokenItem(lead)
      : (chipOf(spot)?.label ?? '');
  };

  const focusOn = (ids: readonly string[]) => () =>
    chart?.focusTarget(ids) ?? null;

  let chooser = $state<{ ids: string[]; apart: boolean } | null>(null);
  let chosenFrom: string[] = [];
  let closedBy: 'pick' | 'dismiss' = 'dismiss';
  const chooserItems = $derived(
    chooser
      ? inListOrder(itemOf ? chooser.ids.flatMap(itemOf) : itemsOf(chooser.ids))
      : []
  );

  $effect(() => {
    if (chooser !== null && chooserItems.length === 0) chooser = null;
  });

  const activate = (spot: Spot) => {
    if (spot.ids.length === 1) {
      onopen(spot.lead, focusOn([spot.lead]));
      return;
    }
    chosenFrom = spot.ids;
    closedBy = 'dismiss';
    chooser = { ids: spot.ids, apart: spot.apart };
  };

  const pick = (id: string) => {
    closedBy = 'pick';
    chooser = null;
    onopen(id, focusOn([id, ...chosenFrom]));
  };
</script>

{#snippet map()}
  {#await loadChartMap()}
    <p class="px-4 pt-4 text-base text-muted-foreground">Loading map</p>
  {:then ChartMap}
    <ChartMap
      bind:this={chart}
      bind:base
      bind:camera
      {places}
      {me}
      {locate}
      {headingDeg}
      {show}
      {onshown}
      {keepClear}
      {fitLabel}
      {controls}
      {label}
      onactivate={activate}
    >
      {#snippet face(spot: Spot, selected: boolean)}
        {#if spot.ids.length === 1}
          {#each itemsOf([spot.lead]) as item (item.id)}
            <PinChip face={item} {selected} />
          {/each}
        {:else}
          {@const chip = chipOf(spot)}
          {#if chip}
            <GroupPin {chip} {selected} />
          {/if}
        {/if}
      {/snippet}
      {#snippet beside(spot: Spot)}
        {@const time =
          spot.ids.length === 1 ? (byId.get(spot.lead)?.time ?? null) : null}
        {#if time}
          <span
            class="pointer-events-none absolute top-[calc(50%+15px)] left-1/2 -translate-x-1/2 rounded bg-map-paper/90 px-1 text-xs leading-tight font-semibold whitespace-nowrap text-map-ink tabular-nums"
            aria-hidden="true">{time}</span
          >
        {/if}
      {/snippet}
    </ChartMap>
  {:catch}
    <p class="px-4 pt-4 text-base">This phone can't show maps</p>
  {/await}
{/snippet}

{#if frame}
  {@render frame(map)}
{:else}
  {@render map()}
{/if}

<GearHere
  items={chooserItems}
  apart={chooser?.apart ?? false}
  onpick={pick}
  onclose={() => {
    chooser = null;
  }}
  returnFocus={() =>
    closedBy === 'pick'
      ? null
      : (chart?.focusTarget(chosenFrom) ?? chart?.canvas() ?? null)}
/>
