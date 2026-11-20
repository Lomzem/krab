import type { Drop } from '#lib/features/trip/index.js';

export type BaitChoice = { key: string; label: string };

type BaitSource = {
  id: string;
  drops: readonly Pick<Drop, 'id' | 'placedAt' | 'bait'>[];
};

export const baitLabel = (text: string) => text.trim().replace(/\s+/g, ' ');

export const baitKey = (text: string) =>
  baitLabel(text.normalize('NFC')).toLowerCase();

export const baitChoices = (
  trips: readonly BaitSource[],
  editedTripId: string
): BaitChoice[] => {
  const placements = trips
    .flatMap((trip) =>
      trip.drops.map((drop) => ({ ...drop, edited: trip.id === editedTripId }))
    )
    .sort(
      (a, b) =>
        Number(b.edited) - Number(a.edited) ||
        b.placedAt - a.placedAt ||
        (a.id < b.id ? -1 : Number(a.id > b.id))
    );
  const choices = new Map<string, BaitChoice>();
  for (const { bait } of placements) {
    const key = baitKey(bait);
    if (key !== '' && !choices.has(key)) {
      choices.set(key, { key, label: baitLabel(bait) });
    }
  }
  return [...choices.values()];
};

export const baitChips = (
  choices: readonly BaitChoice[],
  current: string,
  count = 3
): BaitChoice[] => {
  const own = baitKey(current);
  const chips = choices
    .slice(0, count)
    .map((choice) =>
      choice.key === own ? { key: own, label: baitLabel(current) } : choice
    );
  return own === '' || chips.some((chip) => chip.key === own)
    ? chips
    : [...chips, { key: own, label: baitLabel(current) }];
};

export const baitMatches = (
  choices: readonly BaitChoice[],
  query: string
): { matches: BaitChoice[]; add: string | null } => {
  const typed = baitKey(query);
  if (typed === '') return { matches: [...choices], add: null };
  const found = choices.filter((choice) => choice.key.includes(typed));
  const exact = found.filter((choice) => choice.key === typed);
  return {
    matches: [...exact, ...found.filter((choice) => choice.key !== typed)],
    add: exact.length > 0 ? null : baitLabel(query)
  };
};

export const chosenBait = (current: string, picked: string) =>
  baitKey(current) === baitKey(picked) ? current : baitLabel(picked);
