import { Effect } from 'effect';
import type {
  LayerSpecification,
  SourceSpecification,
  StyleSpecification
} from 'maplibre-gl';
import { chartSource } from './chart-tiles';

export type Base = 'chart' | 'street';

export type Accuracy = {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: { rough: boolean };
    geometry: { type: 'Polygon'; coordinates: [number, number][][] };
  }[];
};

export const ACCURACY_SOURCE = 'krab-accuracy';

const STREET_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const SEA = '#d4e3ec';
const STEADY = '#0f2a44';
const ROUGH = '#b42318';

const background: LayerSpecification = {
  id: 'krab-sea',
  type: 'background',
  paint: { 'background-color': SEA }
};

const overlayLayers: LayerSpecification[] = [
  {
    id: 'krab-accuracy-fill',
    type: 'fill',
    source: ACCURACY_SOURCE,
    paint: {
      'fill-color': ['case', ['get', 'rough'], ROUGH, STEADY],
      'fill-opacity': 0.12
    }
  },
  {
    id: 'krab-accuracy-edge',
    type: 'line',
    source: ACCURACY_SOURCE,
    paint: {
      'line-color': ['case', ['get', 'rough'], ROUGH, STEADY],
      'line-width': 1.5,
      'line-dasharray': [3, 2]
    }
  }
];

const withOverlays = (
  sources: Record<string, SourceSpecification>,
  layers: LayerSpecification[],
  accuracy: Accuracy,
  rest: Omit<StyleSpecification, 'version' | 'sources' | 'layers'> = {}
): StyleSpecification => ({
  ...rest,
  version: 8,
  sources: {
    ...sources,
    [ACCURACY_SOURCE]: { type: 'geojson', data: accuracy }
  },
  layers: [...layers, ...overlayLayers]
});

export type Outage = 'no-signal' | 'not-answering';

export type BaseStyle = { style: StyleSpecification; outage: Outage | null };

export const noBaseStyle = (accuracy: Accuracy) =>
  withOverlays({}, [background], accuracy);

const isStyle = (value: unknown): value is StyleSpecification =>
  typeof value === 'object' &&
  value !== null &&
  'version' in value &&
  value.version === 8 &&
  'sources' in value &&
  'layers' in value &&
  Array.isArray(value.layers);

const fetchStreetStyle = (signal: AbortSignal) =>
  Effect.tryPromise({
    try: async () => {
      const response = await fetch(STREET_STYLE, { signal });
      return response.ok ? await response.text() : null;
    },
    catch: (): Outage => 'no-signal'
  });

const usableStyle = (body: string | null) =>
  body === null
    ? Effect.fail<Outage>('not-answering')
    : Effect.filterOrFail(
        Effect.try({
          try: (): unknown => JSON.parse(body),
          catch: (): Outage => 'not-answering'
        }),
        isStyle,
        (): Outage => 'not-answering'
      );

const streetStyle = (
  accuracy: Accuracy,
  signal: AbortSignal
): Promise<BaseStyle> =>
  Effect.runPromise(
    Effect.match(Effect.flatMap(fetchStreetStyle(signal), usableStyle), {
      onFailure: (outage): BaseStyle => ({
        style: noBaseStyle(accuracy),
        outage
      }),
      onSuccess: ({ sources, layers, ...rest }): BaseStyle => ({
        style: withOverlays(sources, [background, ...layers], accuracy, rest),
        outage: null
      })
    })
  );

export const baseStyle = (
  base: Base,
  accuracy: Accuracy,
  signal: AbortSignal
): Promise<BaseStyle> =>
  base === 'chart'
    ? Promise.resolve({
        style: withOverlays(
          { chart: chartSource },
          [background, { id: 'chart', type: 'raster', source: 'chart' }],
          accuracy
        ),
        outage: null
      })
    : streetStyle(accuracy, signal);

export const isOverlay = (sourceId: string) => sourceId === ACCURACY_SOURCE;

const BUSY = 429;

export const tileOutage = (error: unknown): Outage | null => {
  if (typeof error !== 'object' || error === null) return null;
  if ('name' in error && error.name === 'AbortError') return null;
  if (!('status' in error) || error.status === 0) return 'no-signal';
  const { status } = error;
  return typeof status === 'number' &&
    (status === BUSY || (status >= 500 && status <= 599))
    ? 'not-answering'
    : null;
};
