import type { MapPlace } from '#lib/features/map/index.js';
import type { ChipFace } from './pin-chip';

export type HereItem = ChipFace & {
  id: string;
  name: string;
  details: string[];
  summary: string;
};

const LAYER_RANK: readonly MapPlace['layer'][] = [
  'in-water',
  'collected',
  'past'
];

export type GroupChip = {
  face: ChipFace;
  others: MapPlace['layer'];
  more: number;
  uncollected: boolean;
  label: string;
};

const listed = (parts: readonly string[]) =>
  parts.length > 1
    ? `${parts.slice(0, -1).join(', ')} and ${String(parts.at(-1))}`
    : parts.join('');

const LAYER_WORDS: Record<MapPlace['layer'], string> = {
  'in-water': 'in the water',
  collected: 'collected',
  past: 'from past trips'
};

export const groupChip = (
  lead: HereItem,
  items: readonly HereItem[],
  apart = false
): GroupChip => {
  const days = [
    ...new Map(
      items.map((item) => [item.day?.number ?? null, item.day] as const)
    ).values()
  ];
  const day = days.length === 1 ? lead.day : null;
  const more = items.length - 1;
  const uncollected = items.filter((item) => item.uncollected).length;
  const shown = [lead.name, day?.text, `+${String(more)} more`]
    .filter(Boolean)
    .join(' ');
  const spread = days.flatMap((each) => (each ? [each.text] : []));
  const status =
    uncollected === items.length
      ? 'all uncollected'
      : `${String(uncollected)} of ${String(items.length)} uncollected`;
  const layers = LAYER_RANK.flatMap((layer) => {
    const count = items.filter((item) => item.layer === layer).length;
    return count ? [`${String(count)} ${LAYER_WORDS[layer]}`] : [];
  });
  const others =
    LAYER_RANK.find((layer) =>
      items.some((item) => item.id !== lead.id && item.layer === layer)
    ) ?? lead.layer;
  return {
    face: { ...lead, day, uncollected: false },
    others,
    more,
    uncollected: uncollected > 0,
    label: [
      `${shown}. ${String(items.length)} gear ${apart ? 'in this area' : 'here'}`,
      day === null && spread.length > 1 && ` on ${listed(spread)}`,
      `: ${items.map((item) => item.name).join(', ')}`,
      layers.length > 1 && `; ${layers.join(', ')}`,
      uncollected > 0 && `; ${status}`
    ]
      .filter(Boolean)
      .join('')
  };
};

const NAMES = new Intl.Collator('en', { numeric: true });

export const inListOrder = (items: readonly HereItem[]) =>
  items.toSorted(
    (a, b) =>
      LAYER_RANK.indexOf(a.layer) - LAYER_RANK.indexOf(b.layer) ||
      NAMES.compare(a.name, b.name)
  );
