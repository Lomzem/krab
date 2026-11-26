export type { Base } from './base-style';
export { chartSource, chartTileUrl } from './chart-tiles';
export type { Box, Camera, MapPlace } from './types';

export const loadChartMap = () =>
  import('./ChartMap.svelte').then((module) => module.default);
