export type { Base } from './base-style';
export { chartSource, chartTileUrl } from './chart-tiles';
export type { Spot } from './groups';
export type { Box, Camera, MapPlace, MyPosition } from './types';

export const loadChartMap = () =>
  import('./ChartMap.svelte').then((module) => module.default);
