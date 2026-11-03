export type Tab = 'map' | 'gear' | 'trips';

export const TABS: readonly { tab: Tab; name: string }[] = [
  { tab: 'map', name: 'Map' },
  { tab: 'gear', name: 'Gear' },
  { tab: 'trips', name: 'Past trips' }
];
