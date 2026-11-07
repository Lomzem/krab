<script lang="ts">
  import { tick } from 'svelte';
  import { keepScreenAwakeWhile } from '#lib/features/app-shell/index.js';
  import {
    Compass,
    compassChoice,
    deviceCompass
  } from '#lib/features/compass/index.js';
  import { PositionWatch } from '#lib/features/location/index.js';
  import type { Base, Camera, Lane } from '#lib/features/map/index.js';
  import {
    canUndoCollect,
    gearInWater,
    type Drop,
    type DropAttempt,
    type DropEdit,
    type Kind
  } from '#lib/features/trip/index.js';
  import { DESTRUCTIVE_TEXT_BUTTON, QUIET_BUTTON } from './controls';
  import DirectionCue from './DirectionCue.svelte';
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
  const SAVING_SHOWN_AFTER_MS = 500;
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
  let lane = $state<Lane | null>(null);
  let toastHeight = $state(0);
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
  let slowAttempt = $state.raw<DropAttempt | null>(null);
  let dropReplaced = false;
  const savingAttempt = $derived(water.pending?.attempt ?? null);
  const savingShown = $derived(
    water.pending !== null &&
      (water.pending.waited || slowAttempt === water.pending.attempt)
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
    const attempt = savingAttempt;
    if (!attempt) return;
    const timer = setTimeout(() => {
      slowAttempt = attempt;
    }, SAVING_SHOWN_AFTER_MS);
    return () => {
      clearTimeout(timer);
    };
  });

  $effect(() => {
    if (water.pending?.phase === 'acquiring' || savingShown)
      dropReplaced = true;
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

  const focusDropAfterSave = async (saved: boolean) => {
    if (!saved || !dropReplaced) return;
    dropReplaced = false;
    await tick();
    dropButton?.focus();
  };

  const drop = () => {
    now = Date.now();
    void water.drop(kind).then(focusDropAfterSave);
  };

  const restingFocus = () => (tab === 'trips' ? pastHeading : dropButton);

  const retry = (target: Retry) => {
    void water.retry(target).then(() => {
      dropButton?.focus();
    });
  };

  const undo = (target: Undo) => {
    void water.undo(target).then(async (undone) => {
      if (!undone) return;
      await tick();
      restingFocus()?.focus();
    });
  };

  let returnTo: HTMLElement | null = null;
  let returnDrop: string | null = null;

  const openSheet = (origin: SheetOrigin) => {
    sheet = origin;
    returnTo = origin.opener;
    returnDrop = origin.dropId;
  };

  const opensFrom =
    (from: SheetOrigin['from']) => (dropId: string, opener: HTMLElement) => {
      openSheet({ dropId, from, opener });
    };

  const closeSheet = () => {
    sheet = null;
  };

  const shownDrop = (dropId: string | null) =>
    dropId === null
      ? null
      : document.querySelector<HTMLElement>(
          `main :is([data-drop="${CSS.escape(dropId)}"], [data-drops~="${CSS.escape(dropId)}"])`
        );

  const sheetReturnFocus = () => {
    if (showOnMap !== null) return mapTabButton;
    if (pastShowNext !== null) {
      pastShow = pastShowNext;
      pastShowNext = null;
      return null;
    }
    if (returnTo?.isConnected) return returnTo;
    return shownDrop(returnDrop) ?? restingFocus();
  };

  const operate = async <A,>(
    work: () => Promise<A>,
    settle: (result: A) => SaveProblem | null
  ) => {
    const origin = sheet;
    if (!origin || busy) return;
    operation = { sheet: origin, pending: true, problem: null };
    const settled = await work().then(
      (result) => () => settle(result),
      () => (): SaveProblem => 'storage'
    );
    if (operation.sheet !== origin) return;
    const problem = sheet === origin ? settled() : null;
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
        void water.dropAgain(dropId).then(focusDropAfterSave);
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
  <main class="min-h-0 flex-1 overflow-y-auto">
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
          onlane={(next: Lane | null) => {
            lane = next;
          }}
          bind:filter={mapFilter}
          show={showOnMap}
          onshown={() => {
            showOnMap = null;
          }}
          onopen={opensFrom('map')}
          newest={water.notice?.offer.action === 'undo-drop'
            ? water.notice.offer.dropId
            : null}
          cover={toastHeight}
        />
      {/if}
    {:else if tab === 'gear'}
      {#if water.load === 'failed'}
        <header class="px-4 pt-5">
          <h1 class="text-[22px] leading-tight font-semibold">Gear</h1>
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
          openSheet({ dropId, from, opener });
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
          class="w-full {QUIET_BUTTON}"
          aria-disabled={busy}
          onclick={() => {
            show(target);
          }}>Show on map</button
        >
      {/if}
    {/snippet}
    {#snippet direction()}
      {#if sheetDirection}
        <DirectionCue
          direction={sheetDirection}
          compass={$compass}
          ontoggle={toggleCompass}
        />
      {/if}
    {/snippet}
    {#snippet endAction(target: Drop)}
      {#if subject && canUndoCollect(subject.trip, target)}
        {@const { name } = subject}
        <button
          type="button"
          class="grow {QUIET_BUTTON}"
          aria-disabled={busy}
          onclick={() => {
            undoCollect(target.id, name);
          }}>Undo collect</button
        >
      {:else}
        <button
          type="button"
          class="grow {DESTRUCTIVE_TEXT_BUTTON}"
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
    blocked={water.undoBlocked}
    onretry={retry}
    ondismiss={(key: number) => {
      water.dismiss(key);
    }}
    overlay={tab === 'map'
      ? (lane ?? { bottom: 0, room: null, beside: null })
      : null}
    bind:cover={toastHeight}
  />

  {#if water.pending?.phase === 'acquiring'}
    {@const { attempt } = water.pending}
    <GettingPosition
      kind={water.pending.kind}
      oncancel={attempt.cancel}
      onskip={attempt.saveWithoutPosition}
    />
  {:else if savingShown}
    <SavingDrop />
  {:else if tab !== 'trips'}
    {#if explained}
      <section aria-label="Drop gear">
        {#key tab}
          <LocationStatus permission={watch.permission} fix={watch.fix} />
        {/key}
        <DropControl bind:kind bind:button={dropButton} ondrop={drop} />
      </section>
    {:else}
      <LocationIntro onallow={allowLocation} />
    {/if}
  {/if}

  <nav
    class="border-t border-border bg-card pb-[env(safe-area-inset-bottom)] text-muted-foreground"
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
            class="relative flex min-h-13 w-full touch-manipulation flex-col items-center justify-center gap-0.5 text-[13px] font-medium before:absolute before:inset-x-6 before:top-0 before:h-0.75 before:rounded-b-sm before:bg-mark before:opacity-0 focus-visible:outline-3 focus-visible:-outline-offset-3 focus-visible:outline-ring aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:before:opacity-100"
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
