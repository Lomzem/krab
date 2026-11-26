import type { Catch, Drop, DropEdit, Kind } from '#lib/features/trip/index.js';
import { baitKey } from './bait-options';

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

export type CatchDraft = Record<keyof Catch, string>;

export const catchDraftOf = (recorded: Catch | null): CatchDraft | null =>
  recorded && {
    kept: String(recorded.kept),
    released: String(recorded.released)
  };

export type GearDraft = {
  details: DetailsDraft;
  catch: CatchDraft | null;
  kind: Kind;
  baitQuery: string;
};

export type InvalidField = 'bait' | 'depth' | keyof Catch;

export type CheckedDraft =
  | { valid: true; edit: DropEdit; kind: Kind | null }
  | { valid: false; invalid: readonly InvalidField[] };

const SIDES = ['kept', 'released'] as const;

const depthOf = (text: string): { depthFt: number | null } | null => {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return { depthFt: null };
  const depthFt = Number(trimmed);
  return Number.isFinite(depthFt) && depthFt >= 0 ? { depthFt } : null;
};

export const depthAccepted = (text: string) => depthOf(text) !== null;

export const countOf = (text: string) => {
  const trimmed = text.trim();
  const count = Number(trimmed);
  return /^\d+$/.test(trimmed) && Number.isSafeInteger(count) ? count : null;
};

const catchOf = (
  typed: CatchDraft | null
):
  | { valid: true; catch: Catch | null }
  | { valid: false; invalid: (keyof Catch)[] } => {
  if (typed === null) return { valid: true, catch: null };
  const kept = countOf(typed.kept);
  const released = countOf(typed.released);
  if (kept !== null && released !== null) {
    return { valid: true, catch: { kept, released } };
  }
  return {
    valid: false,
    invalid: SIDES.filter((side) => countOf(typed[side]) === null)
  };
};

export const checkDraft = (draft: GearDraft, stored: Kind): CheckedDraft => {
  const searching = baitKey(draft.baitQuery) !== '';
  const depth = depthOf(draft.details.depth);
  const recorded = catchOf(draft.catch);
  if (!searching && depth && recorded.valid) {
    const { label, bait, notes } = draft.details;
    return {
      valid: true,
      edit: {
        details: { label, bait, depthFt: depth.depthFt, notes },
        catch: recorded.catch
      },
      kind: draft.kind === stored ? null : draft.kind
    };
  }
  return {
    valid: false,
    invalid: [
      ...(searching ? (['bait'] as const) : []),
      ...(depth ? [] : (['depth'] as const)),
      ...(recorded.valid ? [] : recorded.invalid)
    ]
  };
};

export const draftChanged = (drop: Drop, stored: Kind, draft: GearDraft) => {
  const details = draftOf(drop);
  const recorded = catchDraftOf(drop.catch);
  const fields = Object.keys(details) as (keyof DetailsDraft)[];
  return (
    draft.kind !== stored ||
    baitKey(draft.baitQuery) !== '' ||
    fields.some((field) => details[field] !== draft.details[field]) ||
    SIDES.some((side) => draft.catch?.[side] !== recorded?.[side])
  );
};
