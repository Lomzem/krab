<script lang="ts">
  import { tick } from 'svelte';
  import { keepScreenAwakeWhile } from '#lib/features/app-shell/index.js';
  import {
    Compass,
    compassChoice,
    deviceCompass
  } from '#lib/features/compass/index.js';
  import {
    PositionWatch,
    readiness as watchReadiness
  } from '#lib/features/location/index.js';
  import type { Base, Camera } from '#lib/features/map/index.js';
  import {
    canUndoCollect,
    gearInWater,
    nearestGear,
    type Drop,
    type DropAttempt,
    type DropEdit,
    type Kind
  } from '#lib/features/trip/index.js';
  import {
    DESTRUCTIVE_TEXT_BUTTON,
    FOCUS_INSET,
    PRESS,
    QUIET_BUTTON
  } from './controls';
  import DirectionCue from './DirectionCue.svelte';
  import DockRow from './DockRow.svelte';
  import DockStatus from './DockStatus.svelte';
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
  import LocationSteps from './LocationSteps.svelte';
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
  import { TABS, type Tab } from './tabs';

  const TICK_MS = 15_000;
  const SAVING_SHOWN_AFTER_MS = 500;
  const TRIP_LOAD_FAILED = "Couldn't load the trip";

  const watch = new PositionWatch();
  const water = new OnWater(watch);
  const readiness = watchReadiness(watch);
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
  let main = $state<HTMLElement>();
  const scrolls: Record<Tab, number> = { map: 0, gear: 0, trips: 0 };
  let gearHeading = $state<HTMLHeadingElement>();
  let stepsOpen = $state(false);
  let stepsOpener: HTMLElement | null = null;
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
  const rowStatus = $derived(explained ? readiness.status : null);
  const nearest = $derived(
    water.trip ? nearestGear(gearInWater(water.trip, readiness.fix, now)) : null
  );
  const rowShown = $derived(
    tab === 'map' ||
      water.notice !== null ||
      (tab === 'gear' && rowStatus?.kind === 'denied')
  );
  const sheetDirection = $derived(
    subject && water.trip
      ? (gearInWater(water.trip, readiness.fix, now).find(
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

  const switchTo = async (next: Tab) => {
    if (next === tab) return;
    if (main) scrolls[tab] = main.scrollTop;
    tab = next;
    await tick();
    if (main) main.scrollTop = scrolls[next];
  };

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

  const restingFocus = () => {
    if (tab === 'trips') return pastHeading;
    if (tab === 'gear') return gearHeading;
    return dropButton;
  };

  const retry = (target: Retry) => {
    void water.retry(target).then(() => {
      restingFocus()?.focus();
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
  <nav
    class="border-b border-border bg-card pt-[env(safe-area-inset-top,0px)]"
    aria-label="Screens"
  >
    <ul class="grid grid-cols-3">
      {#each TABS as item (item.tab)}
        <li class="flex">
          <button
            type="button"
            {@attach (node: HTMLButtonElement) => {
              if (item.tab === 'map') mapTabButton = node;
            }}
            class="relative flex min-h-12 w-full touch-manipulation items-center justify-center px-2 py-1 text-center text-control font-medium text-muted-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.75 after:bg-foreground after:opacity-0 compact:min-h-11 {FOCUS_INSET} {PRESS} active:bg-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground aria-[current=page]:after:opacity-100"
            aria-current={tab === item.tab ? 'page' : undefined}
            onclick={() => void switchTo(item.tab)}
          >
            {item.name}
          </button>
        </li>
      {/each}
    </ul>
  </nav>

  <main bind:this={main} class="flex min-h-0 flex-1 flex-col overflow-y-auto">
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
          fix={readiness.fix}
          lastFix={readiness.lastFix}
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
          newest={water.notice?.offer.action === 'undo-drop'
            ? water.notice.offer.dropId
            : null}
        />
      {/if}
    {:else if tab === 'gear'}
      {#if water.load === 'failed'}
        <header class="px-4 pt-5">
          <h1 class="text-display font-semibold">Gear</h1>
        </header>
        <LoadFailed text={TRIP_LOAD_FAILED} onretry={reload} />
      {:else if water.load === 'ready'}
        <GearList
          trip={water.trip}
          from={readiness.fix}
          compass={$compass}
          {now}
          onopen={opensFrom('list')}
          canEnd={water.pending === null}
          onend={() => {
            endOpen = true;
          }}
          bind:endButton
          bind:heading={gearHeading}
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
        notice={water.notice}
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
    notice={water.notice}
  >
    {#snippet actions(target: Drop, leave: (exit: () => void) => void)}
      {#if sheet?.from === 'list' && target.position}
        <button
          type="button"
          class="w-full {QUIET_BUTTON}"
          aria-disabled={busy}
          onclick={() => {
            leave(() => {
              show(target);
            });
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
    notice={water.notice}
  />

  <div
    class={[
      'grid grid-cols-1 border-t border-border bg-card',
      !rowShown && 'hidden',
      tab !== 'map' && 'pb-[env(safe-area-inset-bottom,0px)]'
    ]}
  >
    {#if tab === 'map'}
      <div
        class="row-start-2 grid min-h-20 content-center px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] compact:min-h-18 compact:py-1 compact:pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]"
      >
        {#if water.pending?.phase === 'acquiring'}
          {@const { attempt } = water.pending}
          <GettingPosition
            oncancel={attempt.cancel}
            onskip={attempt.saveWithoutPosition}
          />
        {:else if savingShown}
          <SavingDrop />
        {:else if explained}
          <section aria-label="Drop gear">
            <DropControl
              bind:kind
              bind:button={dropButton}
              denied={readiness.status.kind === 'denied'}
              ondrop={drop}
            />
          </section>
        {:else}
          <LocationIntro onallow={allowLocation} />
        {/if}
      </div>
    {/if}
    <div class={['row-start-1', tab === 'map' && 'border-b border-border']}>
      <DockRow
        notice={water.notice}
        onundo={undo}
        blocked={water.undoBlocked}
        onretry={retry}
        ondismiss={(key: number) => {
          water.dismiss(key);
        }}
      >
        {#if tab !== 'trips'}
          <DockStatus
            screen={tab}
            status={rowStatus}
            trip={water.trip}
            {nearest}
            compass={$compass}
            onopen={opensFrom('map')}
            onsteps={(opener: HTMLElement) => {
              stepsOpener = opener;
              stepsOpen = true;
            }}
          />
        {/if}
      </DockRow>
    </div>
  </div>
</div>

<LocationSteps
  open={stepsOpen}
  onclose={() => {
    stepsOpen = false;
  }}
  returnFocus={() => (stepsOpener?.isConnected ? stepsOpener : restingFocus())}
/>
