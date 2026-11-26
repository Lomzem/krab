<script lang="ts">
  import { Button } from '@ui-sdk/svelte/button';
  import { elementRef } from '#lib/shared/element-ref.js';
  import { tick } from 'svelte';
  import { keepScreenAwakeWhile } from '#lib/features/app-shell/index.js';
  import {
    Compass,
    compassChoice,
    compassSupported,
    deviceCompass
  } from '#lib/features/compass/index.js';
  import {
    PositionWatch,
    readiness as watchReadiness
  } from '#lib/features/location/index.js';
  import type { Base, Camera } from '#lib/features/map/index.js';
  import {
    canUndoCollect,
    activeGear,
    type Drop,
    type DropAttempt,
    type DropEdit,
    type Kind
  } from '#lib/features/trip/index.js';
  import { FOCUS_INSET, PRESS } from '#lib/shared/control-states.js';
  import { DESTRUCTIVE_TEXT_BUTTON, QUIET_BUTTON } from './controls';
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
  import { OnWater, type SaveProblem, type Undo } from './on-water.svelte';
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
  let acquireNow = $state(Date.now());
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
  let endedTripId = $state<string | null>(null);
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
  const dockStatus = $derived(
    water.pending?.phase === 'acquiring' && rowStatus?.kind === 'finding'
      ? null
      : rowStatus
  );
  const gear = $derived(
    water.trip
      ? activeGear(water.trip, readiness.fix, now, mapFilter.days)
      : null
  );
  const nearest = $derived(gear?.nearest ?? null);
  const panelShown = $derived(
    tab === 'map' ||
      (tab === 'gear' && (water.pending?.phase === 'acquiring' || savingShown))
  );
  const rowShown = $derived(
    tab === 'map' ||
      water.notice !== null ||
      (tab === 'gear' &&
        (dockStatus?.kind === 'denied' || dockStatus?.kind === 'finding'))
  );
  const dockShown = $derived(rowShown || panelShown);
  const sheetDirection = $derived(
    subject && gear
      ? (gear.inWater.find((row) => row.drop.id === subject.drop.id)
          ?.direction ?? null)
      : null
  );

  const endedTrip = $derived(
    !water.trip && endedTripId
      ? (water.past.find((item) => item.id === endedTripId) ?? null)
      : null
  );

  $effect(() => {
    if (water.trip) endedTripId = null;
  });

  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  });

  $effect(() => {
    if (water.pending?.phase !== 'acquiring') return;
    acquireNow = Date.now();
    const timer = setInterval(() => {
      acquireNow = Date.now();
    }, 1000);
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
    restingFocus()?.focus();
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

  const retry = (key: number) => {
    void water.retry(key).then(() => {
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

  let sheetReturn: SheetOrigin['returnFocus'] = () => null;

  const openSheet = (origin: SheetOrigin) => {
    sheet = origin;
    sheetReturn = origin.returnFocus;
  };

  const listRow = (dropId: string) =>
    document.querySelector<HTMLElement>(
      `main [data-drop="${CSS.escape(dropId)}"]`
    );

  const opensFrom =
    (from: SheetOrigin['from']) => (dropId: string, opener: HTMLElement) => {
      openSheet({
        dropId,
        from,
        returnFocus: () => (opener.isConnected ? opener : listRow(dropId))
      });
    };

  const closeSheet = () => {
    sheet = null;
  };

  const sheetReturnFocus = () => {
    if (pastShowNext !== null) {
      pastShow = pastShowNext;
      pastShowNext = null;
      return null;
    }
    if (water.pending?.phase === 'acquiring' || savingShown) return null;
    if (showOnMap !== null) return mapTabButton;
    return sheetReturn() ?? restingFocus();
  };

  const operate = async <A>(
    work: () => Promise<A>,
    settle: (result: A) => SaveProblem | null,
    closed: (outcome: { result: A } | null) => void = () => {}
  ) => {
    const origin = sheet;
    if (!origin || busy) return;
    operation = { sheet: origin, pending: true, problem: null };
    const outcome = await work().then(
      (result) => ({ result }),
      () => null
    );
    const owned = operation.sheet === origin;
    if (sheet !== origin) {
      if (owned) operation = { sheet: origin, pending: false, problem: null };
      closed(outcome);
      return;
    }
    if (!owned) return;
    const problem = outcome ? settle(outcome.result) : 'storage';
    operation = { sheet: origin, pending: false, problem };
  };

  const closeWhenSaved = (problem: SaveProblem | null) => {
    if (problem === null) closeSheet();
    return problem;
  };

  const save = (dropId: string, edit: DropEdit, nextKind: Kind | null) => {
    const name = subject?.name;
    void operate(
      () => water.save(dropId, edit, nextKind),
      closeWhenSaved,
      (outcome) => {
        if (outcome?.result !== null && name) water.saveLost(name);
      }
    );
  };

  const show = (target: Drop) => {
    if (busy) return;
    if (subject && !subjectActive) {
      pastShowNext = target.id;
      closeSheet();
      return;
    }
    now = Date.now();
    if (!gear) return;
    mapFilter = filterToShow(mapFilter, gear.inDays, target);
    showOnMap = target.id;
    void switchTo('map');
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
    if (ended) {
      endedTripId = trip.id;
      endOpen = false;
    }
  };

  const viewEndedTrip = async () => {
    if (!endedTrip) return;
    pastTripId = endedTrip.id;
    await switchTo('trips');
    await tick();
    pastHeading?.focus();
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
          {gear}
          past={water.past}
          fix={readiness.fix}
          lastFix={readiness.lastFix}
          courseDeg={watch.courseDeg}
          compass={$compass}
          compassShown={compassSupported()}
          oncompass={toggleCompass}
          bind:base
          bind:camera
          bind:filter={mapFilter}
          show={showOnMap}
          onshown={() => {
            showOnMap = null;
          }}
          onopen={(dropId: string, returnFocus: () => HTMLElement | null) => {
            openSheet({ dropId, from: 'map', returnFocus });
          }}
          newest={water.notice?.offer.action === 'undo-drop'
            ? water.notice.offer.dropId
            : null}
        />
      {:else}
        <section aria-labelledby="map-title">
          <h1 id="map-title" class="sr-only">Map</h1>
          <p class="px-4 pt-4 text-base text-muted-foreground">Loading trip</p>
        </section>
      {/if}
    {:else if tab === 'gear'}
      {#if water.load === 'failed'}
        <header class="px-4 pt-5">
          <h1 class="text-display font-semibold">Gear</h1>
        </header>
        <LoadFailed text={TRIP_LOAD_FAILED} onretry={reload} />
      {:else if water.load === 'ready'}
        <GearList
          {gear}
          compass={$compass}
          onopen={opensFrom('list')}
          canEnd={water.pending === null}
          onend={() => {
            endOpen = true;
          }}
          endedTrip={endedTrip !== null}
          onviewended={() => void viewEndedTrip()}
          attachEndButton={elementRef<HTMLButtonElement>((element) => {
            endButton = element;
          })}
          bind:heading={gearHeading}
        />
      {:else}
        <header class="px-4 pt-3 pb-2">
          <h1 class="text-display font-semibold">Gear</h1>
        </header>
        <p class="px-4 text-base text-muted-foreground">Loading trip</p>
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
        onopen={(
          dropId: string,
          returnFocus: () => HTMLElement | null,
          from: 'list' | 'map'
        ) => {
          openSheet({ dropId, from, returnFocus });
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
    denied={readiness.status.kind === 'denied'}
    returnFocus={sheetReturnFocus}
    notice={water.notice}
  >
    {#snippet actions(target: Drop, leave: (exit: () => void) => void)}
      {#if sheet?.from === 'list' && target.position}
        <Button
          class="w-full {QUIET_BUTTON}"
          aria-disabled={busy}
          onclick={() => {
            leave(() => {
              show(target);
            });
          }}>Show on map</Button
        >
      {/if}
    {/snippet}
    {#snippet direction(target: Drop)}
      {#if sheetDirection}
        <DirectionCue
          direction={sheetDirection}
          compass={$compass}
          ontoggle={toggleCompass}
        />
      {:else if !target.position}
        <p class="text-sm text-muted-foreground">No position</p>
      {:else if readiness.status.kind === 'denied'}
        <p class="text-sm text-muted-foreground">Location is off</p>
      {:else if readiness.status.kind === 'finding'}
        <p class="text-sm text-muted-foreground">Finding position</p>
      {/if}
    {/snippet}
    {#snippet endAction(
      target: Drop,
      leave: (exit: () => void) => void,
      confirmCatchLoss: (exit: () => void) => void
    )}
      {#if subject && canUndoCollect(subject.trip, target)}
        {@const { name } = subject}
        {@const putBack = () => {
          undoCollect(target.id, name);
        }}
        <Button
          class="grow {QUIET_BUTTON}"
          aria-disabled={busy}
          onclick={() => {
            if (busy) return;
            leave(() => {
              if (target.catch) confirmCatchLoss(putBack);
              else putBack();
            });
          }}>Undo collect</Button
        >
      {:else}
        <Button
          class="grow {DESTRUCTIVE_TEXT_BUTTON}"
          aria-disabled={busy}
          onclick={() => {
            if (busy) return;
            leave(() => {
              deleteDrop(target.id);
            });
          }}>Delete drop</Button
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
      !dockShown && 'hidden',
      !panelShown && 'pb-[env(safe-area-inset-bottom,0px)]'
    ]}
  >
    {#if panelShown}
      <div
        class="row-start-2 grid min-h-20 content-center px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] compact:min-h-18 compact:py-1 compact:pb-[max(0.25rem,env(safe-area-inset-bottom,0px))]"
      >
        {#if water.pending?.phase === 'acquiring'}
          {@const { attempt } = water.pending}
          <GettingPosition
            deadline={attempt.deadline}
            now={acquireNow}
            oncancel={attempt.cancel}
            onskip={attempt.saveWithoutPosition}
          />
        {:else if savingShown}
          <SavingDrop />
        {:else if tab === 'map' && explained}
          <section aria-label="Drop gear">
            <DropControl
              bind:kind
              attachButton={elementRef<HTMLButtonElement>((element) => {
                dropButton = element;
              })}
              denied={readiness.status.kind === 'denied'}
              finding={water.notice !== null &&
                readiness.status.kind === 'finding'}
              busy={water.pending !== null}
              ondrop={drop}
            />
          </section>
        {:else if tab === 'map'}
          <LocationIntro onallow={allowLocation} />
        {/if}
      </div>
    {/if}
    <div
      class={[
        'row-start-1',
        panelShown && rowShown && 'border-b border-border',
        !rowShown && 'hidden'
      ]}
    >
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
            status={dockStatus}
            loaded={water.load === 'ready'}
            {gear}
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
