<script lang="ts">
  import { tick } from 'svelte';
  import { keepScreenAwakeWhile } from '#lib/features/app-shell/index.js';
  import {
    Compass,
    CompassArrow,
    compassChoice,
    deviceCompass
  } from '#lib/features/compass/index.js';
  import { PositionWatch } from '#lib/features/location/index.js';
  import type { Base, Camera } from '#lib/features/map/index.js';
  import {
    canUndoCollect,
    gearInWater,
    type Drop,
    type DropEdit,
    type Kind
  } from '#lib/features/trip/index.js';
  import DropControl from './DropControl.svelte';
  import EndTripSheet from './EndTripSheet.svelte';
  import GearList from './GearList.svelte';
  import {
    sheetSubject,
    type SheetOperation,
    type SheetOrigin
  } from './gear-sheet';
  import GearSheet from './GearSheet.svelte';
  import GettingPosition from './GettingPosition.svelte';
  import SavingDrop from './SavingDrop.svelte';
  import LocationIntro from './LocationIntro.svelte';
  import LoadFailed from './LoadFailed.svelte';
  import LocationStatus from './LocationStatus.svelte';
  import { DEFAULT_MAP_FILTER, filterToShow } from './map-filter';
  import MapTab from './MapTab.svelte';
  import PastTrips from './PastTrips.svelte';
  import {
    OnWater,
    type Retry,
    type SaveProblem,
    type Undo
  } from './on-water.svelte';
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
  const TRIP_LOAD_FAILED = "Couldn't load your trip.";

  const watch = new PositionWatch();
  const water = new OnWater(watch);
  keepScreenAwakeWhile(() => water.trip !== null);
  const compass = new Compass({
    sensor: deviceCompass,
    choice: compassChoice,
    position: watch.latest,
    now: Date.now
  });

  let tab = $state<Tab>('map');
  let kind = $state(savedKind());
  let explained = $state(locationExplained());
  let now = $state(Date.now());
  let dropButton = $state<HTMLButtonElement>();
  let sheet = $state.raw<SheetOrigin | null>(null);
  let base = $state<Base>('chart');
  let camera = $state.raw<Camera | null>(null);
  let showOnMap = $state<string | null>(null);
  let mapFilter = $state({ ...DEFAULT_MAP_FILTER });
  let mapTabButton = $state<HTMLButtonElement>();
  let endButton = $state<HTMLButtonElement>();
  let endOpen = $state(false);
  let ending = $state(false);
  let pastTripId = $state<string | null>(null);
  let pastHeading = $state<HTMLHeadingElement>();
  let pastShow = $state<string | null>(null);
  let pastShowNext: string | null = null;
  let toastCovers = $state(0);
  const listClearance = $derived(
    tab === 'map' ? undefined : `${String(toastCovers)}px`
  );

  let operation = $state.raw<SheetOperation | null>(null);

  const subject = $derived(
    sheetSubject(
      water.trip ? [water.trip, ...water.past] : water.past,
      sheet?.dropId ?? null
    )
  );
  const subjectActive = $derived(subject?.trip.endedAt === null);
  const sheetOperation = $derived(
    operation?.sheet === sheet ? operation : null
  );
  const busy = $derived(sheetOperation?.pending ?? false);
  const sheetDirection = $derived(
    subject && water.trip
      ? (gearInWater(water.trip, watch.fix, now).find(
          (row) => row.drop.id === subject.drop.id
        )?.direction ?? null)
      : null
  );

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
    compass.start();
    return () => {
      compass.stop();
    };
  });

  $effect(() => {
    saveKind(kind);
  });

  const reload = () => water.reload();

  const toggleCompass = () => {
    compass.toggle();
  };

  const allowLocation = () => {
    rememberLocationExplained();
    explained = true;
  };

  const focusDropAfterWait = async (waited: boolean) => {
    if (!waited) return;
    await tick();
    dropButton?.focus();
  };

  const drop = () => {
    now = Date.now();
    void water.drop(kind).then(focusDropAfterWait);
  };

  const restingFocus = () => (tab === 'trips' ? pastHeading : dropButton);

  const retry = (target: Retry) => {
    void water.retry(target).then(() => {
      dropButton?.focus();
    });
  };

  const undo = (target: Undo) => {
    void water.undo(target).then(async () => {
      await tick();
      restingFocus()?.focus();
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
    if (pastShowNext !== null) {
      pastShow = pastShowNext;
      pastShowNext = null;
      return null;
    }
    return returnTo?.isConnected ? returnTo : restingFocus();
  };

  const operate = async <A,>(
    work: () => Promise<A>,
    settle: (result: A) => SaveProblem | null
  ) => {
    const origin = sheet;
    if (!origin || busy) return;
    operation = { sheet: origin, pending: true, problem: null };
    const result = await work();
    if (operation.sheet !== origin) return;
    const problem = sheet === origin ? settle(result) : null;
    operation = { sheet: origin, pending: false, problem };
  };

  const closeWhenSaved = (problem: SaveProblem | null) => {
    if (problem === null) closeSheet();
    return problem;
  };

  const save = (dropId: string, edit: DropEdit, nextKind: Kind | null) => {
    void operate(() => water.save(dropId, edit, nextKind), closeWhenSaved);
  };

  const show = (target: Drop) => {
    if (busy) return;
    if (subject && !subjectActive) {
      pastShowNext = target.id;
      closeSheet();
      return;
    }
    if (!water.trip) return;
    now = Date.now();
    mapFilter = filterToShow(mapFilter, water.trip, target, now);
    showOnMap = target.id;
    tab = 'map';
    closeSheet();
  };

  const dropAgain = (dropId: string, edit: DropEdit, nextKind: Kind | null) => {
    void operate(
      () => water.save(dropId, edit, nextKind),
      (problem) => {
        if (problem !== null) return problem;
        closeSheet();
        now = Date.now();
        void water.dropAgain(dropId).then(focusDropAfterWait);
        return null;
      }
    );
  };

  const deleteDrop = (dropId: string) => {
    void operate(
      () => water.remove(dropId),
      (deleted) => {
        if (deleted) closeSheet();
        return null;
      }
    );
  };

  const collect = (dropId: string) => {
    void operate(
      () => water.collect(dropId),
      () => null
    );
  };

  const endTrip = async () => {
    const trip = water.trip;
    if (!trip || ending) return;
    ending = true;
    const ended = await water.endTrip(trip.id);
    ending = false;
    if (ended) endOpen = false;
  };

  const endReturnFocus = () =>
    endButton?.isConnected ? endButton : restingFocus();

  const undoCollect = (dropId: string, name: string) => {
    void operate(
      () => water.undoCollect(dropId, name),
      () => null
    );
  };
</script>

<div class="flex h-dvh flex-col bg-background font-sans text-foreground">
  <main
    class="min-h-0 flex-1 overflow-y-auto"
    style:padding-bottom={listClearance}
    style:scroll-padding-bottom={listClearance}
  >
    {#if tab === 'map'}
      {#if water.load === 'failed'}
        <section aria-labelledby="map-title">
          <h1 id="map-title" class="sr-only">Map</h1>
          <LoadFailed text={TRIP_LOAD_FAILED} onretry={reload} />
        </section>
      {:else if water.load === 'ready'}
        <MapTab
          trip={water.trip}
          past={water.past}
          canEnd={water.pending === null}
          onend={() => {
            endOpen = true;
          }}
          bind:endButton
          fix={watch.fix}
          courseDeg={watch.courseDeg}
          compass={$compass}
          oncompass={toggleCompass}
          {now}
          bind:base
          bind:camera
          bind:filter={mapFilter}
          show={showOnMap}
          onshown={() => {
            showOnMap = null;
          }}
          onopen={opensFrom('map')}
        />
      {/if}
    {:else if tab === 'gear'}
      {#if water.load === 'failed'}
        <header class="px-4 pt-5">
          <h1 class="text-[34px] leading-tight font-bold">Gear</h1>
        </header>
        <LoadFailed text={TRIP_LOAD_FAILED} onretry={reload} />
      {:else if water.load === 'ready'}
        <GearList
          trip={water.trip}
          from={watch.fix}
          compass={$compass}
          {now}
          onopen={opensFrom('list')}
        />
      {/if}
    {:else if water.load !== 'opening'}
      <PastTrips
        past={water.past}
        failed={water.load === 'failed'}
        bind:selected={pastTripId}
        bind:titleHeading={pastHeading}
        show={pastShow}
        onshown={() => {
          pastShow = null;
        }}
        onopen={(dropId: string, opener: HTMLElement, from: 'list' | 'map') => {
          sheet = { dropId, from, opener };
        }}
        ondelete={(tripId: string) => water.deleteTrip(tripId)}
        onretry={reload}
      />
    {/if}
  </main>

  <GearSheet
    {subject}
    {now}
    operation={sheetOperation}
    onclose={closeSheet}
    onsave={save}
    oncollect={collect}
    ondropagain={dropAgain}
    returnFocus={sheetReturnFocus}
  >
    {#snippet actions(target: Drop)}
      {#if sheet?.from === 'list' && target.position}
        <button
          type="button"
          class="min-h-13 w-full rounded-control border-2 border-primary px-4 text-[18px] font-bold text-foreground focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-60"
          aria-disabled={busy}
          onclick={() => {
            show(target);
          }}>Show on map</button
        >
      {/if}
    {/snippet}
    {#snippet direction()}
      {#if sheetDirection}
        <div class="flex items-center gap-2">
          <CompassArrow
            bearingDeg={sheetDirection.bearingDeg}
            point={sheetDirection.point}
            compass={$compass}
            ontoggle={toggleCompass}
          />
          <div class="text-right" aria-hidden="true">
            <p class="text-[21px] leading-tight font-bold tabular-nums">
              {sheetDirection.distance}
            </p>
            <p class="text-[14px] font-semibold text-muted-foreground">
              {sheetDirection.pointShort}
            </p>
          </div>
          <span class="sr-only"
            >{sheetDirection.distanceSpoken} {sheetDirection.point}</span
          >
        </div>
      {/if}
    {/snippet}
    {#snippet endAction(target: Drop)}
      {#if subject && canUndoCollect(subject.trip, target)}
        {@const { name } = subject}
        <button
          type="button"
          class="min-h-13 rounded-control border-2 border-primary px-4 text-[18px] font-bold text-primary focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-60"
          aria-disabled={busy}
          onclick={() => {
            undoCollect(target.id, name);
          }}>Undo collect</button
        >
      {:else}
        <button
          type="button"
          class="min-h-13 rounded-control border-2 border-destructive px-4 text-[18px] font-bold text-destructive focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-disabled:opacity-60"
          aria-disabled={busy}
          onclick={() => {
            deleteDrop(target.id);
          }}>Delete drop</button
        >
      {/if}
    {/snippet}
  </GearSheet>

  <EndTripSheet
    trip={water.trip}
    open={endOpen && water.trip !== null}
    busy={ending}
    onend={() => void endTrip()}
    onclose={() => {
      endOpen = false;
    }}
    returnFocus={endReturnFocus}
  />

  <UndoToast
    notice={water.notice}
    onundo={undo}
    onretry={retry}
    ondismiss={(key: number) => {
      water.dismiss(key);
    }}
    bind:covers={toastCovers}
  />

  {#if water.pending?.phase === 'acquiring'}
    {@const { attempt } = water.pending}
    <GettingPosition
      kind={water.pending.kind}
      oncancel={attempt.cancel}
      onskip={attempt.saveWithoutPosition}
    />
  {:else if water.pending?.waited}
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
