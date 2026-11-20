<script lang="ts">
  import Icon from '#lib/icon/Icon.svelte';
  import {
    FOCUS,
    FOCUS_INSET,
    PRESS
  } from '#lib/features/on-water/controls.js';
  import {
    Map as MapLibre,
    Marker,
    setWorkerUrl,
    type GeoJSONSource,
    type LngLatLike
  } from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { Effect } from 'effect';
  import { onMount, tick, untrack, type Snippet } from 'svelte';
  import { SvelteMap } from 'svelte/reactivity';
  import type { LatLon } from '#lib/features/trip/index.js';
  import { accuracyArea } from './accuracy';
  import {
    ACCURACY_SOURCE,
    baseStyle,
    isOverlay,
    noBaseStyle,
    tileOutage,
    type Accuracy,
    type Base,
    type Outage
  } from './base-style';
  import { chartTileUrl } from './chart-tiles';
  import { MAX_ZOOM, spotsAt, zoomToSeparate, type Spot } from './groups';
  import { CREDITS } from './credits';
  import type { Camera, MapPlace, MyPosition } from './types';

  const SHOW_ZOOM = 15;
  const MY_EXTENT = { left: 30, right: 30, up: 30, down: 30 };
  const OVERVIEW_MAX_ZOOM = 17;
  const ME_ORDER = 1;
  const LAYER_ORDER: Record<MapPlace['layer'], number> = {
    past: 2,
    collected: 3,
    'in-water': 4
  };
  const MIN_ZOOM = 0;
  const MIN_FIT_SPAN = 48;
  const CLEAR_GAP = 8;
  const FOCUS_REACH = 11;
  const ICON_BUTTON = `flex h-11 w-full touch-manipulation items-center justify-center ${FOCUS_INSET} ${PRESS} active:bg-muted`;
  const CREDIT_LINK = `flex min-h-11 items-center px-3 text-base underline underline-offset-3 ${FOCUS_INSET}`;
  const SAFE_EDGE_SLACK = 1 + 1e-6;
  const OUTAGE_NOTICE: Record<Outage, string> = {
    offline: 'Map offline',
    unexplained: "Map can't load",
    'not-answering': 'Map service not answering'
  };

  let {
    base = $bindable('chart'),
    camera = $bindable(null),
    places,
    me,
    headingDeg = null,
    show,
    onshown,
    pin,
    group,
    controls,
    keepClear = null
  }: {
    base?: Base;
    camera?: Camera | null;
    places: MapPlace[];
    me: MyPosition | null;
    headingDeg?: number | null;
    show: string | null;
    onshown: () => void;
    pin: Snippet<[id: string, selected: boolean]>;
    group: Snippet<
      [lead: string, ids: string[], apart: boolean, selected: boolean]
    >;
    controls?: Snippet;
    keepClear?: string | null;
  } = $props();

  let container = $state<HTMLDivElement>();
  let map: MapLibre | null = null;
  let ready = $state(false);
  let failed = $state(false);
  let availability = $state<'available' | Outage>('available');
  let generation = 0;
  let request: AbortController | null = null;
  let awaitingStyle = false;
  let baseSources = new Set<string>();
  let zoom = $state(camera?.zoom ?? 2);
  let overview = untrack(() => camera === null);
  let framePending = false;
  let capsule = $state<HTMLDivElement>();
  let notice = $state<HTMLParagraphElement>();
  let chip = $state<HTMLButtonElement>();
  let creditsPanel = $state<HTMLDivElement>();
  let creditsOpen = $state(false);
  let rendered = $state<Base | null>(null);
  const credit = $derived(CREDITS[rendered ?? base]);
  let selected = $state<string | null>(null);
  const isSelected = (ids: string[]) =>
    selected !== null && ids.includes(selected);
  let latest: Accuracy = accuracyArea(null, 0, false);
  const markers = new SvelteMap<string, Marker>();

  const accuracy = $derived(
    me?.current
      ? accuracyArea(me.at, me.accuracyM, me.rough)
      : accuracyArea(null, 0, false)
  );

  const featured = $derived(
    [keepClear, selected].filter((id): id is string => id !== null)
  );
  const spots = $derived(spotsAt(places, zoom, featured));
  const reach = $derived(
    [
      ...places.map(({ leading }) => leading(places.length - 1)),
      ...(me ? [MY_EXTENT] : [])
    ].reduce(
      (most, box) => ({
        up: Math.max(most.up, box.up),
        down: Math.max(most.down, box.down),
        side: Math.max(most.side, box.left, box.right)
      }),
      { up: 0, down: 0, side: 0 }
    )
  );
  const spotOf = $derived(
    new Map(spots.flatMap((spot) => spot.ids.map((id) => [id, spot] as const)))
  );

  const lngLat = (at: LatLon): LngLatLike => [at.lon, at.lat];

  const lonSpan = (lons: number[]) => {
    const sorted = [...lons].sort((a, b) => a - b);
    const gapAfter = (index: number) =>
      (sorted[(index + 1) % sorted.length] ?? 0) -
      (sorted[index] ?? 0) +
      360 * Number(index === sorted.length - 1);
    const widest = sorted.reduce(
      (best, _, index) => (gapAfter(index) > gapAfter(best) ? index : best),
      sorted.length - 1
    );
    const west = sorted[(widest + 1) % sorted.length] ?? 0;
    const east = sorted[widest] ?? 0;
    return { west, east: east < west ? east + 360 : east };
  };

  const squeeze = (
    near: { cover: number; reach: number },
    far: { cover: number; reach: number },
    size: number
  ) => {
    const room = Math.max(0, size - MIN_FIT_SPAN);
    const cover = near.cover + far.cover;
    const reach = near.reach + far.reach;
    if (cover + reach <= room) {
      return [near.cover + near.reach, far.cover + far.reach] as const;
    }
    if (cover <= room) {
      const share = (room - cover) / reach;
      return [
        near.cover + near.reach * share,
        far.cover + far.reach * share
      ] as const;
    }
    const scale = room / cover;
    return [near.cover * scale, far.cover * scale] as const;
  };

  const safeArea = () => {
    const area = container?.getBoundingClientRect();
    if (!area) return 0;
    const credits = chip?.getBoundingClientRect();
    const controls = capsule?.getBoundingClientRect();
    const told = notice?.getBoundingClientRect();
    const [up, down] = squeeze(
      { cover: told ? told.bottom - area.top + CLEAR_GAP : 0, reach: reach.up },
      {
        cover: credits ? area.bottom - credits.top + CLEAR_GAP : 0,
        reach: reach.down
      },
      area.height
    );
    const [left, right] = squeeze(
      { cover: 0, reach: reach.side },
      {
        cover: controls ? area.right - controls.left + CLEAR_GAP : 0,
        reach: reach.side
      },
      area.width
    );
    return { top: up, bottom: down, left, right };
  };

  const frame = () => {
    if (!map) return;
    const targets = [
      ...places.map((place) => place.at),
      ...(me ? [me.at] : [])
    ];
    if (targets.length === 0) return;
    const { west, east } = lonSpan(targets.map((at) => at.lon));
    const lats = targets.map((at) => at.lat);
    if (west === east && Math.min(...lats) === Math.max(...lats)) {
      map.jumpTo({ center: lngLat(targets[0]), zoom: SHOW_ZOOM });
    } else {
      map.fitBounds(
        [
          [west, Math.min(...lats)],
          [east, Math.max(...lats)]
        ],
        { padding: safeArea(), maxZoom: OVERVIEW_MAX_ZOOM, duration: 0 }
      );
    }
    settle();
    if (keepClear && !reveal(keepClear)) {
      separate(keepClear);
      reveal(keepClear);
    }
  };

  const frameSoon = async () => {
    await tick();
    if (overview) frame();
  };

  const outsideSafeArea = (padding: ReturnType<typeof safeArea>) => {
    const { clientWidth, clientHeight } = map?.getContainer() ?? {
      clientWidth: 0,
      clientHeight: 0
    };
    return ({ at }: MapPlace) => {
      if (!map || padding === 0) return false;
      const { lng } = map.getCenter();
      const point = map.project([
        at.lon + 360 * Math.round((lng - at.lon) / 360),
        at.lat
      ]);
      return (
        point.x < padding.left - SAFE_EDGE_SLACK ||
        point.y < padding.top - SAFE_EDGE_SLACK ||
        point.x > clientWidth - padding.right + SAFE_EDGE_SLACK ||
        point.y > clientHeight - padding.bottom + SAFE_EDGE_SLACK
      );
    };
  };

  type Rect = { left: number; right: number; top: number; bottom: number };

  const coversIn = (area: DOMRect, without?: HTMLElement): Rect[] =>
    [chip, capsule, notice].flatMap((element) => {
      const box =
        element === without ? undefined : element?.getBoundingClientRect();
      return box
        ? [
            {
              left: box.left - area.left - CLEAR_GAP,
              right: box.right - area.left + CLEAR_GAP,
              top: box.top - area.top - CLEAR_GAP,
              bottom: box.bottom - area.top + CLEAR_GAP
            }
          ]
        : [];
    });

  const drawnOf = ({ at, box }: Pick<Spot, 'at' | 'box'>): Rect | null => {
    if (!map) return null;
    const { lng } = map.getCenter();
    const point = map.project([
      at.lon + 360 * Math.round((lng - at.lon) / 360),
      at.lat
    ]);
    return {
      left: point.x - box.left,
      right: point.x + box.right,
      top: point.y - box.up,
      bottom: point.y + box.down
    };
  };

  const overlapOf = (a: Rect, b: Rect) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

  const hiddenOf =
    (shown: Rect[], view: Rect, covers: Rect[]) => (dx: number, dy: number) =>
      shown.reduce((sum, at) => {
        const box = {
          left: at.left + dx,
          right: at.right + dx,
          top: at.top + dy,
          bottom: at.bottom + dy
        };
        return (
          sum +
          (box.right - box.left) * (box.bottom - box.top) -
          overlapOf(box, view) +
          covers.reduce((all, block) => all + overlapOf(box, block), 0)
        );
      }, 0);

  const clearShift = (
    drawn: Rect[],
    area: DOMRect,
    across: boolean,
    without?: HTMLElement
  ) => {
    const view = { left: 0, right: area.width, top: 0, bottom: area.height };
    const shown = drawn.filter((box) => overlapOf(box, view) > 0);
    if (shown.length === 0) return null;
    const covers = coversIn(area);
    const hiddenAt = hiddenOf(shown, view, covers);
    const still = hiddenAt(0, 0);
    if (still === 0) return { dx: 0, dy: 0, hidden: 0 };
    const enough = without
      ? hiddenOf(shown, view, coversIn(area, without))(0, 0)
      : 0;
    const blocks = [...covers, view];
    const xs = across
      ? [
          0,
          ...shown.flatMap((box) =>
            blocks.flatMap((block) => [
              block.left - box.right,
              block.right - box.left
            ])
          )
        ]
      : [0];
    const ys = [
      0,
      ...shown.flatMap((box) =>
        blocks.flatMap((block) => [
          block.top - box.bottom,
          block.bottom - box.top
        ])
      )
    ];
    const length = ({ dx, dy }: { dx: number; dy: number }) =>
      dx ** 2 + dy ** 2;
    const tried = xs.flatMap((dx) =>
      ys.map((dy) => ({ dx, dy, hidden: hiddenAt(dx, dy) }))
    );
    const best =
      tried
        .filter(({ hidden }) => hidden <= enough + 1)
        .sort((a, b) => length(a) - length(b))[0] ??
      tried.sort((a, b) => a.hidden - b.hidden || length(a) - length(b))[0];
    return best.hidden < still ? best : { dx: 0, dy: 0, hidden: still };
  };

  const clearOf = (cover: HTMLElement) => {
    const area = container?.getBoundingClientRect();
    if (!area) return;
    const box = cover.getBoundingClientRect();
    const block = {
      left: box.left - area.left - CLEAR_GAP,
      right: box.right - area.left + CLEAR_GAP,
      top: box.top - area.top - CLEAR_GAP,
      bottom: box.bottom - area.top + CLEAR_GAP
    };
    const drawn = [
      ...spots,
      ...(me ? [{ at: me.at, box: MY_EXTENT }] : [])
    ].flatMap((spot) => {
      const shown = drawnOf(spot);
      return shown ? [shown] : [];
    });
    if (drawn.every((shown) => overlapOf(shown, block) === 0)) return;
    shiftBy(clearShift(drawn, area, false, cover));
  };

  const separate = (id: string) => {
    const place = places.find((candidate) => candidate.id === id);
    if (!map || !place || (spotOf.get(id)?.ids.length ?? 0) < 2) return;
    map.jumpTo({
      center: lngLat(place.at),
      zoom: zoomToSeparate(places, id, map.getZoom(), MAX_ZOOM)
    });
  };

  const shiftBy = (shift: { dx: number; dy: number } | null) => {
    if (!map || !shift || (shift.dx === 0 && shift.dy === 0)) return;
    const middle = map.project(map.getCenter());
    map.jumpTo({
      center: map.unproject([middle.x - shift.dx, middle.y - shift.dy])
    });
  };

  const hideOffscreen = () => {
    const area = container?.getBoundingClientRect();
    if (!map || !area) return;
    for (const spot of spots) {
      const node = markers.get(spot.key)?.getElement();
      const drawn = drawnOf(spot);
      if (!node || !drawn) continue;
      const away =
        drawn.right < 0 ||
        drawn.bottom < 0 ||
        drawn.left > area.width ||
        drawn.top > area.height;
      if (away && node.contains(document.activeElement)) {
        map.getCanvas().focus();
      }
      node.inert = away;
    }
  };

  const settle = () => {
    const area = container?.getBoundingClientRect();
    if (!area) return;
    const drawn = spots.map(drawnOf).filter((box) => box !== null);
    shiftBy(clearShift(drawn, area, false));
  };

  const revealDrawn = (drawn: Rect | null) => {
    const area = container?.getBoundingClientRect();
    if (!area || !drawn) return false;
    const shift = clearShift([drawn], area, true);
    shiftBy(shift);
    return shift?.hidden === 0;
  };

  const revealFocused = (event: FocusEvent) => {
    const area = container?.getBoundingClientRect();
    const target = event.target;
    if (
      !area ||
      !(target instanceof HTMLElement) ||
      !target.matches(':focus-visible')
    )
      return;
    const box = target.getBoundingClientRect();
    revealDrawn({
      left: box.left - area.left - FOCUS_REACH,
      right: box.right - area.left + FOCUS_REACH,
      top: box.top - area.top - FOCUS_REACH,
      bottom: box.bottom - area.top + FOCUS_REACH
    });
  };

  const reveal = (id: string) => {
    const spot = spotOf.get(id);
    return revealDrawn(spot ? drawnOf(spot) : null);
  };

  const revealSoon = async (id: string) => {
    await tick();
    reveal(id);
  };

  const closeCredits = (refocus: boolean) => {
    if (!creditsOpen) return;
    creditsOpen = false;
    if (refocus) chip?.focus();
  };

  const toggleCredits = async () => {
    if (creditsOpen) {
      closeCredits(true);
      return;
    }
    creditsOpen = true;
    await tick();
    creditsPanel?.querySelector<HTMLElement>('a')?.focus();
  };

  const outsideCredits = (event: PointerEvent) => {
    const target = event.target as Node | null;
    if (
      !creditsOpen ||
      chip?.contains(target) ||
      creditsPanel?.contains(target)
    ) {
      return;
    }
    closeCredits(true);
  };

  const leaveOverview = () => {
    overview = false;
    framePending = false;
  };

  const showAll = () => {
    selected = null;
    overview = true;
    camera = null;
    frame();
  };

  const centreOn = (at: LatLon, atZoom = SHOW_ZOOM) => {
    leaveOverview();
    map?.jumpTo({
      center: lngLat(at),
      zoom: Math.max(map.getZoom(), atZoom)
    });
  };

  const startGeneration = () => {
    generation += 1;
    request?.abort();
    request = null;
    awaitingStyle = false;
    baseSources = new Set();
    return generation;
  };

  const apply = async (wanted: Base) => {
    const current = startGeneration();
    const loading = new AbortController();
    request = loading;
    const next = await baseStyle(wanted, latest, loading.signal);
    if (!map || current !== generation) return;
    request = null;
    map.setStyle(next.style, { diff: false });
    rendered = wanted;
    awaitingStyle = true;
    baseSources = new Set(
      Object.keys(next.style.sources).filter((id) => !isOverlay(id))
    );
    if (next.outage) availability = next.outage;
  };

  const fallBack = () => {
    startGeneration();
    map?.setStyle(noBaseStyle(latest), { diff: false });
    rendered = null;
    availability = 'not-answering';
  };

  const fromBase = (sourceId: unknown) =>
    typeof sourceId === 'string' && baseSources.has(sourceId);

  const marker = (node: HTMLElement, at: LatLon) => {
    if (!map) return {};
    const placed = new Marker({ element: node })
      .setLngLat(lngLat(at))
      .addTo(map);
    const id = node.dataset['place'];
    if (id) markers.set(id, placed);
    return {
      update: (next: LatLon) => {
        placed.setLngLat(lngLat(next));
      },
      destroy: () => {
        const held = node.contains(document.activeElement)
          ? heldDrops(node)
          : [];
        if (id && markers.get(id) === placed) markers.delete(id);
        placed.remove();
        if (held.length > 0)
          void tick().then(() => {
            refocus(held);
          });
      }
    };
  };

  const heldDrops = (node: HTMLElement) => {
    const shown = node.querySelector<HTMLElement>('[data-drop], [data-drops]');
    return (shown?.dataset['drops'] ?? shown?.dataset['drop'] ?? '')
      .split(' ')
      .filter((drop) => drop !== '');
  };

  const refocus = (held: string[]) => {
    if (document.activeElement !== document.body) return;
    const next = held
      .map((drop) =>
        container?.querySelector<HTMLElement>(
          `[data-place] :is([data-drop="${CSS.escape(drop)}"], [data-drops~="${CSS.escape(drop)}"])`
        )
      )
      .find((shown) => shown);
    next?.focus();
  };

  const showPlace = async (id: string) => {
    const place = places.find((candidate) => candidate.id === id);
    if (place && map) {
      const from = Math.max(map.getZoom(), SHOW_ZOOM);
      selected = id;
      centreOn(place.at, zoomToSeparate(places, id, from, MAX_ZOOM));
    }
    await tick();
    reveal(id);
    await tick();
    hideOffscreen();
    const spot = spotOf.get(id);
    if (spot) {
      markers
        .get(spot.key)
        ?.getElement()
        .querySelector<HTMLElement>('button')
        ?.focus();
    }
    onshown();
  };

  onMount(() => {
    const host = container;
    if (!host) return;
    setWorkerUrl(workerUrl);
    const created = Effect.runSync(
      Effect.orElseSucceed(
        Effect.try(
          () =>
            new MapLibre({
              container: host,
              style: noBaseStyle(latest),
              center: camera ? lngLat(camera.center) : [0, 0],
              zoom: camera?.zoom ?? 2,
              minZoom: MIN_ZOOM,
              maxZoom: MAX_ZOOM,
              bearing: 0,
              pitch: 0,
              maxPitch: 0,
              dragRotate: false,
              touchPitch: false,
              pitchWithRotate: false,
              rollEnabled: false,
              attributionControl: false,
              locale: { 'Map.Title': 'Map view' },
              transformRequest: (url) => ({ url: chartTileUrl(url) })
            })
        ),
        () => null
      )
    );
    if (!created) {
      failed = true;
      return;
    }
    map = created;
    created.touchZoomRotate.disableRotation();
    created.keyboard.disableRotation();
    created.on('error', (event) => {
      const sourceId = 'sourceId' in event ? event.sourceId : null;
      if (awaitingStyle && typeof sourceId !== 'string') {
        fallBack();
        return;
      }
      const outage = fromBase(sourceId) ? tileOutage(event.error) : null;
      if (outage) availability = outage;
    });
    created.on('data', (event) => {
      if (
        event.dataType === 'source' &&
        'tile' in event &&
        event.tile &&
        fromBase(event.sourceId)
      ) {
        availability = 'available';
      }
    });
    created.on('style.load', () => {
      awaitingStyle = false;
      void created.getSource<GeoJSONSource>(ACCURACY_SOURCE)?.setData(latest);
    });
    created.on('movestart', (event) => {
      if (!event.originalEvent) return;
      selected = null;
      leaveOverview();
    });
    created.on('move', hideOffscreen);
    created.on('resize', () => {
      if (overview) void frameSoon();
    });
    created.on('moveend', () => {
      zoom = created.getZoom();
      if (overview) return;
      const center = created.getCenter();
      camera = { center: { lat: center.lat, lon: center.lng }, zoom };
    });
    const refit = new ResizeObserver(() => {
      if (overview) void frameSoon();
    });
    if (chip) refit.observe(chip);
    if (capsule) refit.observe(capsule);
    const reconnect = () => {
      void apply(base);
    };
    window.addEventListener('online', reconnect);
    framePending = overview;
    ready = true;
    return () => {
      startGeneration();
      refit.disconnect();
      window.removeEventListener('online', reconnect);
      markers.clear();
      created.remove();
      map = null;
    };
  });

  $effect(() => {
    const wanted = base;
    if (ready) untrack(() => void apply(wanted));
  });

  $effect(() => {
    latest = accuracy;
    if (ready) {
      void map?.getSource<GeoJSONSource>(ACCURACY_SOURCE)?.setData(latest);
    }
  });

  $effect(() => {
    const drawn = places;
    if (!ready || (!me && drawn.length === 0)) return;
    untrack(() => {
      if (
        framePending ||
        (overview && drawn.some(outsideSafeArea(safeArea())))
      ) {
        framePending = false;
        void frameSoon();
      }
    });
  });

  $effect(() => {
    const shown = notice;
    if (!shown) return;
    const watch = new ResizeObserver(() => {
      if (overview) void frameSoon();
      else clearOf(shown);
    });
    watch.observe(shown);
    return () => {
      watch.disconnect();
      if (overview) void frameSoon();
    };
  });

  $effect(() => {
    const id = keepClear;
    if (!ready || !id) return;
    untrack(() => {
      if (overview) void revealSoon(id);
    });
  });

  $effect(() => {
    if (ready && spots.length > 0) {
      untrack(() => void tick().then(hideOffscreen));
    }
  });

  $effect(() => {
    if (ready && show) {
      const id = show;
      untrack(() => void showPlace(id));
    }
  });
</script>

<svelte:document onpointerdown={outsideCredits} />

{#snippet baseChoice(choice: Base, text: string)}
  <button
    type="button"
    class="flex min-h-11 w-full touch-manipulation items-center justify-center px-2.5 text-sm font-medium text-muted-foreground {FOCUS_INSET} {PRESS} active:bg-muted aria-pressed:text-foreground aria-pressed:underline aria-pressed:decoration-2 aria-pressed:underline-offset-4"
    aria-label="{text} map"
    aria-pressed={base === choice}
    onclick={() => {
      base = choice;
    }}>{text}</button
  >
{/snippet}

<div
  class="chart-map relative isolate grid min-h-56 flex-1 grid-rows-[auto_1fr] overflow-hidden bg-map-sea [container:map/size] compact:min-h-40"
>
  <div class="absolute inset-0">
    <div bind:this={container} class="size-full"></div>
  </div>

  {#if failed}
    <p
      class="relative col-start-1 row-start-1 m-3 self-start rounded-control border border-input bg-card px-4 py-3 text-base"
    >
      This phone can't show maps
    </p>
  {/if}

  {#if ready}
    {#each spots as spot (spot.key)}
      <div class="contents">
        <div
          data-place={spot.key}
          style:z-index={LAYER_ORDER[spot.layer]}
          use:marker={spot.at}
          onfocusin={revealFocused}
        >
          {#if spot.ids.length === 1}
            {@render pin(spot.key, isSelected(spot.ids))}
          {:else}
            {@render group(
              spot.lead,
              spot.ids,
              spot.apart,
              isSelected(spot.ids)
            )}
          {/if}
        </div>
      </div>
    {/each}

    {#if me}
      <div class="contents">
        <div
          class="pointer-events-none size-15"
          style:z-index={ME_ORDER}
          role="img"
          aria-label={me.label}
          use:marker={me.at}
        >
          <svg width="60" height="60" viewBox="-8 -8 60 60" aria-hidden="true">
            {#if headingDeg !== null}
              <defs>
                <radialGradient
                  id="heading-cone"
                  cx="22"
                  cy="22"
                  r="21"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop
                    offset="0.3"
                    style:stop-color="var(--position)"
                    stop-opacity="0.4"
                  />
                  <stop
                    offset="1"
                    style:stop-color="var(--position)"
                    stop-opacity="0"
                  />
                </radialGradient>
              </defs>
              <path
                d="M22 22 11.5 3.8a21 21 0 0 1 21 0Z"
                fill="url(#heading-cone)"
                style:transform={`rotate(${String(headingDeg)}deg)`}
                style:transform-origin="22px 22px"
              />
            {/if}
            {#if me.courseDeg !== null}
              <path
                d="M22 22 13 2a20 20 0 0 1 18 0Z"
                class="fill-position"
                fill-opacity="0.35"
                style:transform={`rotate(${String(Math.round(me.courseDeg))}deg)`}
                style:transform-origin="22px 22px"
              />
            {/if}
            {#if me.current}
              <circle
                cx="22"
                cy="22"
                r="27"
                fill="none"
                class="stroke-map-paper"
                stroke-width="5"
              />
              <circle
                cx="22"
                cy="22"
                r="27"
                fill="none"
                class="stroke-position"
                stroke-width="2.5"
              />
              <circle
                cx="22"
                cy="22"
                r="8"
                class="fill-position stroke-map-paper"
                stroke-width="3"
              />
            {:else}
              <circle
                cx="22"
                cy="22"
                r="8"
                fill="none"
                class="stroke-map-paper"
                stroke-width="7"
              />
              <circle
                cx="22"
                cy="22"
                r="8"
                fill="none"
                class="stroke-position"
                stroke-width="3"
              />
            {/if}
          </svg>
        </div>
      </div>
    {/if}
  {/if}

  {#if !failed}
    {#if availability !== 'available'}
      <p
        bind:this={notice}
        class="z-10 col-start-1 row-start-1 m-3 self-start justify-self-start rounded-control border border-input bg-card px-2.5 py-1.5 text-sm leading-tight font-medium text-foreground"
        role="status"
      >
        {OUTAGE_NOTICE[availability]}
      </p>
    {/if}

    <div
      bind:this={capsule}
      class="z-10 col-start-1 row-start-1 m-3 mb-0 flex min-w-11 flex-col self-start justify-self-end rounded-xl border border-input bg-card text-foreground shadow-sm short-map:flex-row"
    >
      <div class="flex min-w-11 flex-col">
        {@render baseChoice('chart', 'Chart')}
        {@render baseChoice('street', 'Street')}
        {#if controls}
          <span class="mx-2 h-px bg-border" aria-hidden="true"></span>
          {@render controls()}
        {/if}
      </div>
      <span
        class="mx-2 h-px bg-border short-map:mx-0 short-map:my-2 short-map:h-auto short-map:w-px"
        aria-hidden="true"
      ></span>
      <div class="flex min-w-11 flex-col">
        {#if places.length > 0}
          <button
            type="button"
            class={ICON_BUTTON}
            aria-label="Show all gear"
            onclick={showAll}
          >
            <Icon name="show-all" />
          </button>
        {/if}
        <button
          type="button"
          class="{ICON_BUTTON} aria-disabled:text-muted-foreground aria-disabled:active:bg-transparent"
          aria-label="Centre on my position"
          aria-disabled={me?.current ? undefined : 'true'}
          onclick={() => {
            if (!me?.current) return;
            centreOn(me.at);
            revealDrawn(drawnOf({ at: me.at, box: MY_EXTENT }));
          }}
        >
          <Icon name="centre" />
        </button>
        <span class="mx-2 h-px bg-border" aria-hidden="true"></span>
        <button
          type="button"
          class="{ICON_BUTTON} aria-disabled:text-muted-foreground aria-disabled:active:bg-transparent"
          aria-label="Zoom in"
          aria-disabled={zoom >= MAX_ZOOM}
          onclick={() => {
            leaveOverview();
            if (zoom < MAX_ZOOM) map?.zoomIn();
          }}
        >
          <Icon name="plus" size={20} />
        </button>
        <button
          type="button"
          class="{ICON_BUTTON} aria-disabled:text-muted-foreground aria-disabled:active:bg-transparent"
          aria-label="Zoom out"
          aria-disabled={zoom <= MIN_ZOOM}
          onclick={() => {
            leaveOverview();
            if (zoom > MIN_ZOOM) map?.zoomOut();
          }}
        >
          <Icon name="minus" size={20} />
        </button>
      </div>
    </div>

    <div
      class="relative z-10 col-start-1 row-span-2 row-start-1 m-3 max-w-[calc(100%-5.5rem)] self-end justify-self-start short-map:max-w-[calc(100%-8.5rem)]"
    >
      {#if creditsOpen}
        <div
          bind:this={creditsPanel}
          role="dialog"
          aria-label="Map credits"
          tabindex="-1"
          class="absolute bottom-full left-0 mb-2 w-max max-w-[calc(100vw-1.5rem)] rounded-control border border-input bg-card py-1 text-foreground shadow-sm transition-opacity duration-120 ease-out motion-reduce:transition-none starting:opacity-0"
          onkeydown={(event) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            closeCredits(true);
          }}
        >
          <ul>
            {#if (rendered ?? base) === 'chart'}
              <li>
                <a
                  class={CREDIT_LINK}
                  href="https://nauticalcharts.noaa.gov/"
                  target="_blank"
                  rel="noreferrer">NOAA chart</a
                >
              </li>
              <li
                class="flex min-h-11 items-center px-3 text-base text-muted-foreground"
              >
                Not for navigation
              </li>
            {:else}
              <li>
                <a
                  class={CREDIT_LINK}
                  href="https://openfreemap.org/"
                  target="_blank"
                  rel="noreferrer">OpenFreeMap</a
                >
              </li>
              <li>
                <a
                  class={CREDIT_LINK}
                  href="https://www.openmaptiles.org/"
                  target="_blank"
                  rel="noreferrer">© OpenMapTiles</a
                >
              </li>
              <li>
                <a
                  class={CREDIT_LINK}
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer">© OpenStreetMap contributors</a
                >
              </li>
            {/if}
          </ul>
        </div>
      {/if}
      <button
        bind:this={chip}
        type="button"
        class="min-h-11 min-w-11 touch-manipulation rounded-[6px] border border-input bg-card px-2 py-1 text-left text-sm leading-[1.3] font-medium text-muted-foreground {FOCUS} {PRESS} active:bg-muted"
        aria-haspopup="dialog"
        aria-expanded={creditsOpen}
        onclick={() => void toggleCredits()}>{credit}</button
      >
    </div>
  {/if}
</div>
