<script lang="ts">
  import { keepScreenAwakeWhile } from '#lib/features/app-shell/index.js';
  import { PositionWatch } from '#lib/features/location/index.js';
  import DropControl from './DropControl.svelte';
  import GearList from './GearList.svelte';
  import LocationIntro from './LocationIntro.svelte';
  import { OnWater } from './on-water.svelte';
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
    void water.drop(kind);
  };

  const undo = (target: { dropId: string; name: string }) => {
    void water.undo(target).then(() => {
      dropButton?.focus();
    });
  };
</script>

<div class="flex h-dvh flex-col bg-background font-sans text-foreground">
  <main class="min-h-0 flex-1 overflow-y-auto">
    {#if tab === 'map'}
      <section class="px-4 pt-5" aria-labelledby="map-title">
        <h1 id="map-title" class="sr-only">Map</h1>
        <p class="text-[17px] text-muted-foreground">
          The map isn't here yet. Your gear is listed under Gear.
        </p>
      </section>
    {:else if tab === 'gear'}
      {#if water.ready}
        <GearList trip={water.trip} from={watch.fix} {now} />
      {/if}
    {:else}
      <section class="px-4 pt-5">
        <h1 class="text-[34px] leading-tight font-bold">Past trips</h1>
        <p class="text-[17px]">No past trips yet.</p>
      </section>
    {/if}
  </main>

  <UndoToast
    notice={water.notice}
    onundo={undo}
    ondismiss={(key: number) => {
      water.dismiss(key);
    }}
  />

  {#if tab !== 'trips'}
    {#if explained}
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
