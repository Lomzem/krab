<script lang="ts">
  import { tick } from 'svelte';
  import { keepScreenAwakeWhile } from '#lib/features/app-shell/index.js';
  import { PositionWatch } from '#lib/features/location/index.js';
  import type { Base, Camera } from '#lib/features/map/index.js';
  import type { Drop, DropEdit, Kind } from '#lib/features/trip/index.js';
  import DropControl from './DropControl.svelte';
  import GearList from './GearList.svelte';
  import { sheetSubject, type SheetOrigin } from './gear-sheet';
  import GearSheet from './GearSheet.svelte';
  import GettingPosition from './GettingPosition.svelte';
  import SavingDrop from './SavingDrop.svelte';
  import LocationIntro from './LocationIntro.svelte';
  import LocationStatus from './LocationStatus.svelte';
  import MapTab from './MapTab.svelte';
  import { OnWater, type Retry, type Undo } from './on-water.svelte';
  import {
    locationExplained,
    rememberLocationExplained,
    saveKind,
    savedKind
  } from './preferences';
  import TabIcon from './TabIcon.svelte';
  import { TABS, type Tab } from './tabs';
  import UndoToast from './UndoToast.svelte';

  const TICK_MS = 15_000;

  const watch = new PositionWatch();
  const water = new OnWater(watch);
  keepScreenAwakeWhile(() => water.trip !== null);

  let tab = $state<Tab>('map');
  let kind = $state(savedKind());
  let explained = $state(locationExplained());
  let now = $state(Date.now());
  let dropButton = $state<HTMLButtonElement>();
  let sheet = $state.raw<SheetOrigin | null>(null);
  let base = $state<Base>('chart');
  let camera = $state.raw<Camera | null>(null);
  let showOnMap = $state<string | null>(null);
  let mapTabButton = $state<HTMLButtonElement>();

  const subject = $derived(sheetSubject(water.trip, sheet?.dropId ?? null));

  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  });

  $effect(() => {
    if (!explained) return;
    watch.start();
    return () => {
      watch.stop();
    };
  });

  $effect(() => {
    saveKind(kind);
  });

  const allowLocation = () => {
    rememberLocationExplained();
    explained = true;
  };

  const drop = () => {
    now = Date.now();
    void water.drop(kind).then(async (waited) => {
      if (!waited) return;
      await tick();
      dropButton?.focus();
    });
  };

  const retry = (target: Retry) => {
    void water.retry(target).then(() => {
      dropButton?.focus();
    });
  };

  const undo = (target: Undo) => {
    void water.undo(target).then(() => {
      dropButton?.focus();
    });
  };

  const opensFrom =
    (from: SheetOrigin['from']) => (dropId: string, opener: HTMLElement) => {
      sheet = { dropId, from, opener };
    };

  let returnTo: HTMLElement | null = null;

  const closeSheet = () => {
    returnTo = sheet?.opener ?? null;
    sheet = null;
  };

  const sheetReturnFocus = () => {
    if (showOnMap !== null) return mapTabButton;
    return returnTo?.isConnected ? returnTo : dropButton;
  };

  const show = (dropId: string) => {
    showOnMap = dropId;
    tab = 'map';
    closeSheet();
  };

  const deleteDrop = (dropId: string) => {
    void water.remove(dropId).then((deleted) => {
      if (deleted) closeSheet();
    });
  };
</script>

<div class="flex h-dvh flex-col bg-background font-sans text-foreground">
  <main class="min-h-0 flex-1 overflow-y-auto">
    {#if tab === 'map'}
      {#if water.ready}
        <MapTab
          trip={water.trip}
          fix={watch.fix}
          courseDeg={watch.courseDeg}
          {now}
          bind:base
          bind:camera
          show={showOnMap}
          onshown={() => {
            showOnMap = null;
          }}
          onopen={opensFrom('map')}
        />
      {/if}
    {:else if tab === 'gear'}
      {#if water.ready}
        <GearList
          trip={water.trip}
          from={watch.fix}
          {now}
          onopen={opensFrom('list')}
        />
      {/if}
    {:else}
      <section class="px-4 pt-5">
        <h1 class="text-[34px] leading-tight font-bold">Past trips</h1>
        <p class="text-[17px]">No past trips yet.</p>
      </section>
    {/if}
  </main>

  <GearSheet
    {subject}
    onclose={closeSheet}
    onsave={(dropId: string, edit: DropEdit, nextKind: Kind | null) =>
      water.save(dropId, edit, nextKind)}
    returnFocus={sheetReturnFocus}
  >
    {#snippet actions(target: Drop)}
      {#if sheet?.from === 'list' && target.position}
        <button
          type="button"
          class="min-h-13 w-full rounded-control border-2 border-primary px-4 text-[18px] font-bold text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          onclick={() => {
            show(target.id);
          }}>Show on map</button
        >
      {/if}
    {/snippet}
    {#snippet endAction(target: Drop)}
      <button
        type="button"
        class="min-h-13 rounded-control border-2 border-destructive px-4 text-[18px] font-bold text-destructive focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        onclick={() => {
          deleteDrop(target.id);
        }}>Delete drop</button
      >
    {/snippet}
  </GearSheet>

  <UndoToast
    notice={water.notice}
    onundo={undo}
    onretry={retry}
    ondismiss={(key: number) => {
      water.dismiss(key);
    }}
  />

  {#if water.pending?.phase === 'acquiring'}
    {@const { attempt } = water.pending}
    <GettingPosition
      kind={water.pending.kind}
      oncancel={attempt.cancel}
      onskip={attempt.saveWithoutPosition}
    />
  {:else if water.pending}
    <SavingDrop />
  {:else if tab !== 'trips'}
    {#if explained}
      <LocationStatus permission={watch.permission} fix={watch.fix} />
      <DropControl bind:kind bind:button={dropButton} ondrop={drop} />
    {:else}
      <LocationIntro onallow={allowLocation} />
    {/if}
  {/if}

  <nav
    class="bg-primary pb-[env(safe-area-inset-bottom)] text-primary-foreground"
    aria-label="Screens"
  >
    <ul class="grid grid-cols-3">
      {#each TABS as item (item.tab)}
        <li>
          <button
            type="button"
            {@attach (node: HTMLButtonElement) => {
              if (item.tab === 'map') mapTabButton = node;
            }}
            class="relative flex min-h-15 w-full flex-col items-center justify-center gap-0.5 text-[14px] font-medium opacity-85 before:absolute before:inset-x-4 before:top-0 before:h-1 before:rounded-b-sm before:bg-tab-mark before:opacity-0 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-tab-mark aria-[current=page]:font-bold aria-[current=page]:opacity-100 aria-[current=page]:before:opacity-100"
            aria-current={tab === item.tab ? 'page' : undefined}
            onclick={() => {
              tab = item.tab;
            }}
          >
            <TabIcon tab={item.tab} />
            {item.name}
          </button>
        </li>
      {/each}
    </ul>
  </nav>
</div>
