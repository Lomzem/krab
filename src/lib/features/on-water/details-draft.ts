import type { Drop, DropEdit } from '#lib/features/trip/index.js';

export type DetailsDraft = {
  label: string;
  bait: string;
  depth: string;
  notes: string;
};

export const emptyDraft = (): DetailsDraft => ({
  label: '',
  bait: '',
  depth: '',
  notes: ''
});

export const draftOf = (drop: Drop): DetailsDraft => ({
  label: drop.label,
  bait: drop.bait,
  depth: drop.depthFt === null ? '' : String(drop.depthFt),
  notes: drop.notes
});

const depthOf = (text: string) => {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? null : Number(trimmed);
};

export const editOf = (draft: DetailsDraft): DropEdit => ({
  details: {
    label: draft.label,
    bait: draft.bait,
    depthFt: depthOf(draft.depth),
    notes: draft.notes
  }
});
