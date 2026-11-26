<script lang="ts">
  import { FOCUS, FOCUS_INSET, PRESS } from '#lib/shared/control-states.js';
  import { QUIET_BUTTON } from './controls';
  import {
    arrowDeg,
    BearingArrow,
    type CompassState
  } from '#lib/features/compass/index.js';
  import {
    dayGroups,
    type ActiveGear,
    type CollectedRow,
    type GearRow
  } from '#lib/features/trip/index.js';
  import DayMarker from './DayMarker.svelte';
  import GearIcon from './GearIcon.svelte';

  let {
    gear,
    compass,
    onopen,
    canEnd,
    onend,
    endedTrip,
    onviewended,
    endButton = $bindable(),
    heading = $bindable()
  }: {
    gear: ActiveGear | null;
    compass: CompassState;
    onopen: (dropId: string, opener: HTMLElement) => void;
    canEnd: boolean;
    onend: () => void;
    endedTrip: boolean;
    onviewended: () => void;
    endButton?: HTMLButtonElement;
    heading?: HTMLHeadingElement;
  } = $props();

  const rows = $derived(gear?.inWater ?? []);
  const collected = $derived(gear?.collected ?? []);
  const counts = $derived(gear?.counts ?? null);
  const inWaterByDay = $derived(dayGroups(rows));
  const collectedByDay = $derived(dayGroups(collected));

  const rowClass = `flex min-h-14 w-full touch-manipulation items-center gap-3 px-4 py-1.5 text-left ${FOCUS_INSET} ${PRESS} active:bg-muted`;
</script>

<header class="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
  <div class="min-w-0">
    <h1
      bind:this={heading}
      tabindex="-1"
      class="rounded-control text-display font-semibold {FOCUS}"
    >
      Gear
    </h1>
    {#if counts}
      <p class="text-sm text-muted-foreground">
        {counts.inWater}<span aria-hidden="true">&nbsp;·</span><span
          class="sr-only">,</span
        >
        {counts.collected}
      </p>
    {/if}
  </div>
  {#if gear}
    <button
      bind:this={endButton}
      type="button"
      class="inline-flex min-h-11 flex-none touch-manipulation items-center justify-center rounded-control border border-input bg-card px-3 text-base font-semibold text-foreground transition-opacity duration-0 {FOCUS} {PRESS} active:bg-muted aria-disabled:opacity-60 aria-disabled:delay-500"
      aria-haspopup="dialog"
      aria-disabled={!canEnd}
      onclick={() => {
        if (canEnd) onend();
      }}>End trip</button
    >
  {/if}
</header>

{#snippet dropLabel(label: string)}
  {#if label}
    <p class="line-clamp-2 text-base leading-snug [overflow-wrap:anywhere]">
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
        <p class="text-control leading-snug font-medium">{row.name}</p>
        {@render dropLabel(row.drop.label)}
        <p class="text-sm text-muted-foreground">
          <span aria-hidden="true">{row.timeInWater.short} in the water</span>
          <span class="sr-only">In the water for {row.timeInWater.spoken}</span>
        </p>
        {#if row.rough}
          <p class="text-base font-medium text-destructive">
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
        {#if row.direction.atGear}
          <p class="text-title font-semibold whitespace-nowrap @max-2xs:ml-10">
            At gear
          </p>
        {:else}
          <div class="flex items-center gap-2 @max-2xs:ml-10">
            <BearingArrow
              degrees={arrowDeg(row.direction.bearingDeg, compass)}
            />
            <div class="text-right" aria-hidden="true">
              <p
                class="text-title font-semibold whitespace-nowrap tabular-nums"
              >
                {row.direction.distance}
              </p>
              <p class="text-sm font-medium text-muted-foreground">
                {row.direction.pointShort}
              </p>
            </div>
            <span class="sr-only"
              >{row.direction.distanceSpoken} {row.direction.point}</span
            >
          </div>
        {/if}
      {:else if !row.drop.position}
        <p class="text-sm text-muted-foreground @max-[22rem]:ml-10">
          No position
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
            <p class="text-control leading-snug font-medium">{item.name}</p>
            {@render dropLabel(item.drop.label)}
            <p class="text-sm text-muted-foreground">{item.catchText}</p>
          </div>
        </button>
      </li>
    {/each}
  </ul>
{/snippet}

{#if gear}
  <div class="pb-6">
    {#if inWaterByDay.length > 0}
      {#each inWaterByDay as group (group.day.number)}
        <section aria-labelledby="day-{group.day.number}-title">
          <h2
            id="day-{group.day.number}-title"
            class="px-4 pt-3 pb-1 text-control font-semibold"
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
        <h2
          id="collected-title"
          class="px-4 pt-5 pb-1 text-control font-semibold"
        >
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
                class="px-4 pt-2 pb-1 text-sm font-medium text-muted-foreground"
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
  </div>
{:else}
  <div class="flex flex-col items-start gap-3 px-4 pb-6">
    <p class="text-base">Nothing in the water</p>
    {#if endedTrip}
      <button type="button" class={QUIET_BUTTON} onclick={onviewended}
        >View ended trip</button
      >
    {/if}
  </div>
{/if}
