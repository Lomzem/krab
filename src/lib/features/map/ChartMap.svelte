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
  import type { Camera, MapPlace, MyPosition } from './types';

  const SHOW_ZOOM = 15;
  const LAYER_ORDER: Record<MapPlace['layer'], number> = {
    past: 0,
    collected: 1,
    'in-water': 3
  };
  const MAX_ZOOM = 19;
  const MIN_ZOOM = 0;
  const FIT_PADDING = 64;
  const OUTAGE_NOTICE: Record<Outage, string> = {
    'no-signal':
      "No signal, so the map can't load. Your gear and position still show.",
    'not-answering':
      "The map service isn't answering, so the map can't load. Your gear and position still show."
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
    controls
  }: {
    base?: Base;
    camera?: Camera | null;
    places: MapPlace[];
    me: MyPosition | null;
    headingDeg?: number | null;
    show: string | null;
    onshown: () => void;
    pin: Snippet<[string]>;
    controls?: Snippet;
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
  let followFix = false;
  let latest: Accuracy = accuracyArea(null, 0, false);
  const markers = new SvelteMap<string, Marker>();

  const accuracy = $derived(
    accuracyArea(me?.at ?? null, me?.accuracyM ?? 0, me?.rough ?? false)
  );

  const lngLat = (at: LatLon): LngLatLike => [at.lon, at.lat];

  const fitPlaces = () => {
    if (!map || places.length === 0) return;
    const lons = places.map((place) => place.at.lon);
    const lats = places.map((place) => place.at.lat);
    map.fitBounds(
      [
        [Math.min(...lons), Math.min(...lats)],
        [Math.max(...lons), Math.max(...lats)]
      ],
      { padding: FIT_PADDING, maxZoom: SHOW_ZOOM, duration: 0 }
    );
  };

  const centreOn = (at: LatLon) => {
    map?.jumpTo({
      center: lngLat(at),
      zoom: Math.max(map.getZoom(), SHOW_ZOOM)
    });
  };

  const recentre = () => {
    if (me) centreOn(me.at);
    else fitPlaces();
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
    if (place) centreOn(place.at);
    await tick();
    markers.get(id)?.getElement().querySelector<HTMLElement>('button')?.focus();
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
    created.on('moveend', () => {
      const center = created.getCenter();
      zoom = created.getZoom();
      camera = { center: { lat: center.lat, lon: center.lng }, zoom };
    });
    const reconnect = () => {
      void apply(base);
    };
    window.addEventListener('online', reconnect);
    if (!camera) {
      if (me) centreOn(me.at);
      else if (places.length > 0) fitPlaces();
      else followFix = true;
    }
    ready = true;
    return () => {
      startGeneration();
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
    if (!ready || !followFix || !me) return;
    followFix = false;
    untrack(() => {
      centreOn(me.at);
    });
  });

  $effect(() => {
    if (ready && show) {
      const id = show;
      untrack(() => void showPlace(id));
    }
  });
</script>

<div class="relative isolate h-full min-h-64 overflow-hidden bg-[#d4e3ec]">
  <div class="absolute inset-0 z-0">
    <div bind:this={container} class="size-full"></div>
  </div>

  {#if failed}
    <p
      class="absolute inset-x-3 top-3 rounded-control border border-border bg-card px-4 py-3 text-[17px]"
    >
      The map can't show on this phone. Your gear is listed under Gear.
    </p>
  {/if}

  {#if ready}
    {#each places as place (place.id)}
      <div class="contents">
        <div
          data-place={place.id}
          style:z-index={LAYER_ORDER[place.layer]}
          use:marker={place.at}
        >
          {@render pin(place.id)}
        </div>
      </div>
    {/each}

    {#if me}
      <div class="contents">
        <div
          class="pointer-events-none size-11"
          style:z-index="2"
          role="img"
          aria-label={me.label}
          use:marker={me.at}
        >
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
            {#if headingDeg !== null}
              <defs>
                <radialGradient
                  id="heading-cone"
                  cx="22"
                  cy="22"
                  r="21"
                  gradientUnits="userSpaceOnUse"
                >
                  <stop offset="0.3" stop-color="#1d4ed8" stop-opacity="0.4" />
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
              r="8"
              fill="#1d4ed8"
              stroke="#ffffff"
              stroke-width="3"
            />
          </svg>
        </div>
      </div>
    {/if}

    <div
      class="absolute inset-x-3 top-3 z-1 grid gap-2"
      style:pointer-events="none"
    >
      {#if availability !== 'available'}
        <p
          class="w-full rounded-control border border-border bg-card px-4 py-3 text-[17px] text-foreground shadow"
          role="status"
          style:pointer-events="auto"
        >
          {OUTAGE_NOTICE[availability]}
        </p>
      {/if}
      <div class="flex items-start justify-between gap-2">
        <div class="flex flex-wrap gap-2" style:pointer-events="auto">
          {@render controls?.()}
          <button
            type="button"
            class="flex min-h-12 items-center justify-center rounded-control border border-border bg-card px-3 text-[16px] font-semibold text-foreground shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            aria-pressed={base === 'street'}
            onclick={() => {
              base = base === 'chart' ? 'street' : 'chart';
            }}>Street map</button
          >
        </div>
        <div class="grid gap-2" style:pointer-events="auto">
          <button
            type="button"
            class="flex size-12 items-center justify-center rounded-control border border-border bg-card text-foreground shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="Zoom in"
            aria-disabled={zoom >= MAX_ZOOM}
            onclick={() => {
              if (zoom < MAX_ZOOM) map?.zoomIn();
            }}
          >
            <svg
              class="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg
            >
          </button>
          <button
            type="button"
            class="flex size-12 items-center justify-center rounded-control border border-border bg-card text-foreground shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="Zoom out"
            aria-disabled={zoom <= MIN_ZOOM}
            onclick={() => {
              if (zoom > MIN_ZOOM) map?.zoomOut();
            }}
          >
            <svg
              class="size-6"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
              stroke-linecap="round"
              aria-hidden="true"><path d="M5 12h14" /></svg
            >
          </button>
          {#if me || places.length > 0}
            <button
              type="button"
              class="flex size-12 items-center justify-center rounded-control border border-border bg-card text-foreground shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
              aria-label={me ? 'Centre on my position' : 'Show all gear'}
              onclick={recentre}
            >
              <svg
                class="size-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.25"
                stroke-linecap="round"
                aria-hidden="true"
                ><circle cx="12" cy="12" r="4" /><path
                  d="M12 2v4M12 18v4M2 12h4M18 12h4"
                /></svg
              >
            </button>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
