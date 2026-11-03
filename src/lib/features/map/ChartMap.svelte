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
    lostConnection,
    noBaseStyle,
    type Accuracy,
    type Base
  } from './base-style';
  import { chartTileUrl } from './chart-tiles';
  import type { Camera, MapPlace, MyPosition } from './types';

  const SHOW_ZOOM = 15;
  const MAX_ZOOM = 19;
  const FIT_PADDING = 64;

  let {
    base = $bindable('chart'),
    camera = $bindable(null),
    places,
    me,
    show,
    onshown,
    pin
  }: {
    base?: Base;
    camera?: Camera | null;
    places: MapPlace[];
    me: MyPosition | null;
    show: string | null;
    onshown: () => void;
    pin: Snippet<[string]>;
  } = $props();

  let container = $state<HTMLDivElement>();
  let map: MapLibre | null = null;
  let ready = $state(false);
  let failed = $state(false);
  let signal = $state<boolean | null>(null);
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

  const apply = async (wanted: Base) => {
    signal = null;
    const next = await baseStyle(wanted, latest);
    if (!map || wanted !== base) return;
    map.setStyle(next.style, { diff: false });
    if (!next.reachable) signal = false;
  };

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
              maxZoom: MAX_ZOOM,
              bearing: 0,
              pitch: 0,
              maxPitch: 0,
              dragRotate: false,
              touchPitch: false,
              pitchWithRotate: false,
              rollEnabled: false,
              attributionControl: { compact: false },
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
      if (
        typeof sourceId === 'string' &&
        !isOverlay(sourceId) &&
        lostConnection(event.error)
      ) {
        signal = false;
      }
    });
    created.on('data', (event) => {
      if (
        event.dataType === 'source' &&
        'tile' in event &&
        event.tile &&
        !isOverlay(event.sourceId)
      ) {
        signal = true;
      }
    });
    created.on('style.load', () => {
      void created.getSource<GeoJSONSource>(ACCURACY_SOURCE)?.setData(latest);
    });
    created.on('moveend', () => {
      const center = created.getCenter();
      camera = {
        center: { lat: center.lat, lon: center.lng },
        zoom: created.getZoom()
      };
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

<div class="relative h-full min-h-64 overflow-hidden bg-[#d4e3ec]">
  <div bind:this={container} class="absolute inset-0"></div>

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
        <div data-place={place.id} use:marker={place.at}>
          {@render pin(place.id)}
        </div>
      </div>
    {/each}

    {#if me}
      <div class="contents">
        <div
          class="pointer-events-none size-11"
          role="img"
          aria-label={me.label}
          use:marker={me.at}
        >
          <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
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
      class="absolute inset-x-3 top-3 grid justify-items-end gap-2"
      style:pointer-events="none"
    >
      {#if signal === false}
        <p
          class="w-full rounded-control border border-border bg-card px-4 py-3 text-[17px] text-foreground shadow"
          role="status"
          style:pointer-events="auto"
        >
          No signal, so the map can't load. Your gear and position still show.
        </p>
      {/if}
    </div>

    <div class="absolute right-3 bottom-10 grid gap-2">
      <button
        type="button"
        class="flex min-h-12 items-center justify-center rounded-control border border-border bg-card px-3 text-[16px] font-semibold text-foreground shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:bg-primary aria-pressed:text-primary-foreground"
        aria-pressed={base === 'street'}
        onclick={() => {
          base = base === 'chart' ? 'street' : 'chart';
        }}>Street map</button
      >
      <button
        type="button"
        class="flex size-12 items-center justify-center justify-self-end rounded-control border border-border bg-card text-foreground shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label="Zoom in"
        onclick={() => map?.zoomIn()}
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
        class="flex size-12 items-center justify-center justify-self-end rounded-control border border-border bg-card text-foreground shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
        aria-label="Zoom out"
        onclick={() => map?.zoomOut()}
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
          class="flex size-12 items-center justify-center justify-self-end rounded-control border border-border bg-card text-foreground shadow focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
  {/if}
</div>
