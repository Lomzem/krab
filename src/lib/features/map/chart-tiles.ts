import type { RasterSourceSpecification } from 'maplibre-gl';

const GRID =
  'https://gis.charttools.noaa.gov/arcgis/rest/services/MarineChart_Services/NOAACharts/MapServer/WMTS/tile/1.0.0/MarineChart_Services_NOAACharts/default/default028mm';
const GRID_OFFSET = 2;
const MAP_ZOOM = new RegExp(`^${GRID.replaceAll('.', '\\.')}/xyz(\\d+)/`);

export const chartSource: RasterSourceSpecification = {
  type: 'raster',
  tiles: [`${GRID}/xyz{z}/{y}/{x}.png`],
  tileSize: 256,
  minzoom: GRID_OFFSET,
  maxzoom: 16,
  attribution:
    '<a href="https://nauticalcharts.noaa.gov/">NOAA Office of Coast Survey</a>. Not to be used for navigation.'
};

export const chartTileUrl = (url: string) =>
  url.replace(
    MAP_ZOOM,
    (_, zoom: string) => `${GRID}/${String(Number(zoom) - GRID_OFFSET)}/`
  );
