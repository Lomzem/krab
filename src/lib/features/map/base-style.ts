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

export type BaseStyle = { style: StyleSpecification; reachable: boolean };

export const noBaseStyle = (accuracy: Accuracy) =>
  withOverlays({}, [background], accuracy);

const offline = (accuracy: Accuracy): BaseStyle => ({
  style: noBaseStyle(accuracy),
  reachable: false
});

const isStyle = (value: unknown): value is StyleSpecification =>
  typeof value === 'object' &&
  value !== null &&
  'version' in value &&
  value.version === 8 &&
  'sources' in value &&
  'layers' in value &&
  Array.isArray(value.layers);

const fetchStreetStyle = Effect.tryPromise(async () => {
  const response = await fetch(STREET_STYLE);
  const remote: unknown = response.ok ? await response.json() : null;
  return remote;
});

const streetStyle = (accuracy: Accuracy): Promise<BaseStyle> =>
  Effect.runPromise(
    Effect.orElseSucceed(
      Effect.map(fetchStreetStyle, (remote): BaseStyle => {
        if (!isStyle(remote)) return offline(accuracy);
        const { sources, layers, ...rest } = remote;
        return {
          style: withOverlays(sources, [background, ...layers], accuracy, rest),
          reachable: true
        };
      }),
      () => offline(accuracy)
    )
  );

export const baseStyle = (base: Base, accuracy: Accuracy) =>
  base === 'chart'
    ? Promise.resolve({
        style: withOverlays(
          { chart: chartSource },
          [background, { id: 'chart', type: 'raster', source: 'chart' }],
          accuracy
        ),
        reachable: true
      })
    : streetStyle(accuracy);

export const isOverlay = (sourceId: string) => sourceId === ACCURACY_SOURCE;

export const lostConnection = (error: unknown) => {
  if (typeof error !== 'object' || error === null) return false;
  if ('name' in error && error.name === 'AbortError') return false;
  return !('status' in error) || error.status === 0;
};
