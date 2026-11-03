import { expect, it } from 'vitest';
import { chartSource, chartTileUrl } from './chart-tiles';

const NOAA_TILE =
  'https://gis.charttools.noaa.gov/arcgis/rest/services/MarineChart_Services/NOAACharts/MapServer/WMTS/tile/1.0.0/MarineChart_Services_NOAACharts/default/default028mm';

const requested = (z: number, x: number, y: number) =>
  chartTileUrl(
    (chartSource.tiles?.[0] ?? '')
      .replace('{z}', String(z))
      .replace('{x}', String(x))
      .replace('{y}', String(y))
  );

it('asks the fixed default028mm grid for the level two below the map zoom, row then column', () => {
  expect(requested(2, 0, 1)).toBe(`${NOAA_TILE}/0/1/0.png`);
  expect(requested(12, 655, 1582)).toBe(`${NOAA_TILE}/10/1582/655.png`);
  expect(requested(16, 10483, 25322)).toBe(`${NOAA_TILE}/14/25322/10483.png`);
});

it('leaves requests that are not chart tiles unchanged', () => {
  const style = 'https://tiles.openfreemap.org/styles/liberty';
  expect(chartTileUrl(style)).toBe(style);
});
