<script lang="ts">
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
  import type { Camera, Lane, MapPlace, MyPosition } from './types';

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
  const CREDITS_RESERVE = 40;
  const LANE_GAP = 8;
  const SAFE_EDGE_SLACK = 1 + 1e-6;
  const OUTAGE_NOTICE: Record<Outage, { shown: string; more: string }> = {
    offline: {
      shown: "Offline. The map can't load.",
      more: 'Your gear and position still show.'
    },
    unexplained: {
      shown: "The map can't load right now.",
      more: 'Your gear and position still show.'
    },
    'not-answering': {
      shown: "The map service isn't answering.",
      more: "The map can't load. Your gear and position still show."
    }
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
    onlane,
    keepClear = null,
    cover = 0
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
    onlane?: (lane: Lane | null) => void;
    keepClear?: string | null;
    cover?: number;
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
  let creditsHeight = $state(0);
  let viewHeight = $state(0);
  let railWidth = $state(0);
  let railReach = $state(0);
  let shown = $state<string | null>(null);
  let selected = $state<string | null>(null);
  const isSelected = (ids: string[]) =>
    selected !== null && ids.includes(selected);
  let latest: Accuracy = accuracyArea(null, 0, false);
  const markers = new SvelteMap<string, Marker>();

  const accuracy = $derived(
    accuracyArea(me?.at ?? null, me?.accuracyM ?? 0, me?.rough ?? false)
  );

  const featured = $derived(
    [keepClear, shown].filter((id): id is string => id !== null)
  );
  const spots = $derived(spotsAt(places, zoom, featured));
  const reach = $derived(
    places.reduce(
      (most, { leading }) => ({
        up: Math.max(most.up, leading.up),
        down: Math.max(most.down, leading.down),
        side: Math.max(most.side, leading.left, leading.right)
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

  const safeArea = (band = cover) => {
    const area = container?.getBoundingClientRect();
    if (!area) return 0;
    const credits = container
      ?.querySelector('.maplibregl-ctrl-bottom-right')
      ?.getBoundingClientRect();
    const [up, down] = squeeze(
      { cover: 0, reach: reach.up },
      {
        cover:
          Math.max(credits ? area.bottom - credits.top : 0, CREDITS_RESERVE) +
          band,
        reach: reach.down
      },
      area.height
    );
    const [left, right] = squeeze(
      { cover: 0, reach: reach.side },
      { cover: 0, reach: reach.side },
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

  const coversIn = (area: DOMRect, toast: number): Rect[] => {
    const credits = container
      ?.querySelector('.maplibregl-ctrl-bottom-right')
      ?.getBoundingClientRect();
    const band = (credits ? area.bottom - credits.top : 0) + toast;
    return [
      {
        left: 0,
        right: area.width,
        top: area.height - band,
        bottom: area.height
      }
    ];
  };

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

  const clearShift = (
    drawn: Rect[],
    area: DOMRect,
    band: number,
    across: boolean
  ) => {
    const view = { left: 0, right: area.width, top: 0, bottom: area.height };
    const shown = drawn.filter((box) => overlapOf(box, view) > 0);
    if (shown.length === 0) return null;
    const covers = coversIn(area, band);
    const hiddenAt = (dx: number, dy: number) =>
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
    const still = hiddenAt(0, 0);
    if (still === 0) return { dx: 0, dy: 0, hidden: 0 };
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
    const best = xs
      .flatMap((dx) => ys.map((dy) => ({ dx, dy, hidden: hiddenAt(dx, dy) })))
      .sort(
        (a, b) =>
          a.hidden - b.hidden || a.dx ** 2 + a.dy ** 2 - (b.dx ** 2 + b.dy ** 2)
      )[0];
    return best.hidden < still ? best : { dx: 0, dy: 0, hidden: still };
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

  const settle = () => {
    const area = container?.getBoundingClientRect();
    if (!area) return;
    const drawn = spots.map(drawnOf).filter((box) => box !== null);
    shiftBy(clearShift(drawn, area, cover, false));
  };

  const revealDrawn = (drawn: Rect | null, band = cover) => {
    const area = container?.getBoundingClientRect();
    if (!area || !drawn) return false;
    const shift = clearShift([drawn], area, band, true);
    shiftBy(shift);
    return shift?.hidden === 0;
  };

  const reveal = (id: string, band = cover) => {
    const spot = spotOf.get(id);
    return revealDrawn(spot ? drawnOf(spot) : null, band);
  };

  const revealSoon = async (id: string, band: number) => {
    await tick();
    reveal(id, band);
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
    awaitingStyle = true;
    baseSources = new Set(
      Object.keys(next.style.sources).filter((id) => !isOverlay(id))
    );
    if (next.outage) availability = next.outage;
  };

  const fallBack = () => {
    startGeneration();
    map?.setStyle(noBaseStyle(latest), { diff: false });
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
        if (id && markers.get(id) === placed) markers.delete(id);
        placed.remove();
      }
    };
  };

  const showPlace = async (id: string) => {
    const place = places.find((candidate) => candidate.id === id);
    if (place && map) {
      const from = Math.max(map.getZoom(), SHOW_ZOOM);
      shown = id;
      selected = id;
      centreOn(place.at, zoomToSeparate(places, id, from, MAX_ZOOM));
    }
    await tick();
    reveal(id);
    await tick();
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
              attributionControl: { compact: false },
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
    created.on('resize', () => {
      if (overview) void frameSoon();
    });
    created.on('moveend', () => {
      zoom = created.getZoom();
      if (overview) return;
      const center = created.getCenter();
      camera = { center: { lat: center.lat, lon: center.lng }, zoom };
    });
    const credits = host.querySelector<HTMLElement>(
      '.maplibregl-ctrl-bottom-right'
    );
    if (credits) {
      credits.style.zIndex = String(
        Math.max(...Object.values(LAYER_ORDER)) + 1
      );
    }
    let measuring = 0;
    const measureCredits = new ResizeObserver(() => {
      cancelAnimationFrame(measuring);
      measuring = requestAnimationFrame(() => {
        creditsHeight = credits?.getBoundingClientRect().height ?? 0;
      });
    });
    if (credits) measureCredits.observe(credits);
    const refit = new ResizeObserver(() => {
      if (overview) void frameSoon();
    });
    if (credits) refit.observe(credits);
    const reconnect = () => {
      void apply(base);
    };
    window.addEventListener('online', reconnect);
    framePending = overview;
    ready = true;
    return () => {
      startGeneration();
      cancelAnimationFrame(measuring);
      measureCredits.disconnect();
      refit.disconnect();
      onlane?.(null);
      window.removeEventListener('online', reconnect);
      markers.clear();
      created.remove();
      map = null;
    };
  });

  $effect(() => {
    if (!ready) return;
    const below =
      viewHeight > 0 ? viewHeight - creditsHeight - LANE_GAP : -Infinity;
    onlane?.({
      bottom: creditsHeight,
      room: below - railReach,
      beside: { room: below, right: railWidth + LANE_GAP }
    });
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
    const band = cover;
    if (!ready || (!me && drawn.length === 0)) return;
    untrack(() => {
      if (
        framePending ||
        (overview && drawn.some(outsideSafeArea(safeArea(band))))
      ) {
        framePending = false;
        void frameSoon();
      }
    });
  });

  $effect(() => {
    const id = keepClear;
    const band = cover;
    if (!ready || !id) return;
    untrack(() => {
      if (overview) void revealSoon(id, band);
    });
  });

  $effect(() => {
    if (ready && show) {
      const id = show;
      untrack(() => void showPlace(id));
    }
  });
</script>

<div class="chart-map flex h-full flex-col bg-card">
  {#if !failed}
    <div
      class="flex flex-none flex-wrap items-center gap-1 border-b border-border px-1.5 py-0.5"
    >
      {@render controls?.()}
      <button
        type="button"
        class="flex min-h-11 touch-manipulation items-center justify-center gap-1.5 rounded-control px-2.5 text-[15px] font-medium text-foreground hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:bg-accent aria-pressed:text-accent-foreground"
        aria-label="Street map"
        aria-pressed={base === 'street'}
        onclick={() => {
          base = base === 'chart' ? 'street' : 'chart';
        }}
      >
        <svg
          class="size-5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.75"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
          ><rect
            x="3.5"
            y="3.5"
            width="17"
            height="17"
            rx="3"
          />{#if base === 'street'}<path d="m7.5 12.5 3 3 6-6.5" />{/if}</svg
        >Street
      </button>
      {#if places.length > 0}
        <button
          type="button"
          class="flex size-11 touch-manipulation items-center justify-center rounded-control text-foreground hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Show all gear"
          onclick={showAll}
        >
          <svg
            class="size-5.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
            ><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" /><circle
              cx="9"
              cy="10"
              r="1.75"
              fill="currentColor"
            /><circle cx="15" cy="9" r="1.75" fill="currentColor" /><circle
              cx="12"
              cy="15"
              r="1.75"
              fill="currentColor"
            /></svg
          >
        </button>
      {/if}
      {#if me}
        <button
          type="button"
          class="flex size-11 touch-manipulation items-center justify-center rounded-control text-foreground hover:bg-muted focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
          aria-label="Centre on my position"
          onclick={() => {
            centreOn(me.at);
            revealDrawn(drawnOf({ at: me.at, box: MY_EXTENT }));
          }}
        >
          <svg
            class="size-5.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            aria-hidden="true"
            ><circle cx="12" cy="12" r="4" /><path
              d="M12 2v4M12 18v4M2 12h4M18 12h4"
            /></svg
          >
        </button>
      {/if}
    </div>
    {#if availability !== 'available'}
      {@const outage = OUTAGE_NOTICE[availability]}
      <p
        class="flex-none border-b border-border bg-card px-3 py-1.5 text-[14px] leading-tight text-foreground"
        role="status"
      >
        {outage.shown}<span class="sr-only"> {outage.more}</span>
      </p>
    {/if}
  {/if}

  <div class="flex min-h-0 flex-1">
    <div
      class="relative isolate min-w-0 flex-1 overflow-hidden bg-[#d5e2e0]"
      bind:clientHeight={viewHeight}
    >
      <div class="absolute inset-0">
        <div bind:this={container} class="size-full"></div>
      </div>

      {#if failed}
        <p
          class="absolute inset-x-3 top-3 rounded-control border border-border bg-card px-4 py-3 text-[16px]"
        >
          The map can't show on this phone. Your gear is listed under Gear.
        </p>
      {/if}

      {#if ready}
        {#each spots as spot (spot.key)}
          <div class="contents">
            <div
              data-place={spot.key}
              style:z-index={LAYER_ORDER[spot.layer]}
              use:marker={spot.at}
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
              <svg
                width="60"
                height="60"
                viewBox="-8 -8 60 60"
                aria-hidden="true"
              >
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
                        stop-color="#1d4ed8"
                        stop-opacity="0.4"
                      />
                      <stop offset="1" stop-color="#1d4ed8" stop-opacity="0" />
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
                    fill="#1d4ed8"
                    fill-opacity="0.35"
                    style:transform={`rotate(${String(Math.round(me.courseDeg))}deg)`}
                    style:transform-origin="22px 22px"
                  />
                {/if}
                <circle
                  cx="22"
                  cy="22"
                  r="27"
                  fill="none"
                  stroke="#ffffff"
                  stroke-width="5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="27"
                  fill="none"
                  stroke="#1d4ed8"
                  stroke-width="2.5"
                />
                <circle
                  cx="22"
                  cy="22"
                  r="8"
                  fill="#1d4ed8"
                  stroke="#ffffff"
                  stroke-width="3"
                />
              </svg>
            </div>
          </div>
        {/if}
      {/if}
    </div>

    {#if !failed}
      <div
        class="flex-none border-l border-border px-1"
        bind:offsetWidth={railWidth}
      >
        <div class="flex flex-col pt-1" bind:offsetHeight={railReach}>
          <button
            type="button"
            class="relative flex size-11 touch-manipulation items-center justify-center rounded-t-control border border-border bg-card text-foreground focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="Zoom in"
            aria-disabled={zoom >= MAX_ZOOM}
            onclick={() => {
              leaveOverview();
              if (zoom < MAX_ZOOM) map?.zoomIn();
            }}
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
            >
          </button>
          <button
            type="button"
            class="relative -mt-px flex size-11 touch-manipulation items-center justify-center rounded-b-control border border-border bg-card text-foreground focus-visible:z-10 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="Zoom out"
            aria-disabled={zoom <= MIN_ZOOM}
            onclick={() => {
              leaveOverview();
              if (zoom > MIN_ZOOM) map?.zoomOut();
            }}
          >
            <svg
              class="size-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              aria-hidden="true"><path d="M5 12h14" /></svg
            >
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .chart-map :global(.maplibregl-ctrl-attrib) {
    line-height: 16px;
    background-color: var(--card);
    color: var(--foreground);
  }

  .chart-map :global(.maplibregl-ctrl-attrib a) {
    color: inherit;
    text-decoration: underline;
  }
</style>
