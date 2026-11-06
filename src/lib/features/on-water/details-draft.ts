import type { Catch, Drop, DropEdit } from '#lib/features/trip/index.js';

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

export const depthAccepted = (text: string) => {
  const depthFt = depthOf(text);
  return depthFt === null || (Number.isFinite(depthFt) && depthFt >= 0);
};

export type CatchDraft = Record<keyof Catch, string>;

export const catchDraftOf = (recorded: Catch | null): CatchDraft | null =>
  recorded && {
    kept: String(recorded.kept),
    released: String(recorded.released)
  };

export const countOf = (text: string) => {
  const trimmed = text.trim();
  const count = Number(trimmed);
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(count) ? count : null;
};

const catchOf = (draft: CatchDraft | null): Catch | null =>
  draft && {
    kept: countOf(draft.kept) ?? Number.NaN,
    released: countOf(draft.released) ?? Number.NaN
  };

export const editOf = (
  draft: DetailsDraft,
  recorded: CatchDraft | null
): DropEdit => ({
  details: {
    label: draft.label,
    bait: draft.bait,
    depthFt: depthOf(draft.depth),
    notes: draft.notes
  },
  catch: catchOf(recorded)
});
