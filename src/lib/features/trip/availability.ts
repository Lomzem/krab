import type { Fix } from './types';

export const FRESH_FIX_MS = 5000;

export type Availability =
  | { kind: 'denied' }
  | { kind: 'ready'; fix: Fix; staleAt: number }
  | { kind: 'finding' };

type Sighting = { denied: boolean; fix: Fix | null };

export const availability = (
  { denied, fix }: Sighting,
  now: number
): Availability => {
  if (denied) return { kind: 'denied' };
  if (fix && fix.at >= now - FRESH_FIX_MS) {
    return { kind: 'ready', fix, staleAt: fix.at + FRESH_FIX_MS + 1 };
  }
  return { kind: 'finding' };
};
