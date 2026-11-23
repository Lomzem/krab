import { expect, it } from 'vitest';
import {
  baitChips,
  baitChoices,
  baitMatches,
  chosenBait,
  type BaitChoice
} from './bait-options';

const trip = (id: string, drops: [string, number, string][]) => ({
  id,
  drops: drops.map(([dropId, placedAt, bait]) => ({
    id: dropId,
    placedAt,
    bait
  }))
});

const labels = (choices: readonly BaitChoice[]) =>
  choices.map((choice) => choice.label);

const choice = (label: string): BaitChoice => ({
  key: label.toLowerCase(),
  label
});

it('ranks unique baits from the edited trip before more recent baits from other trips', () => {
  const older = trip('older', [
    ['o1', 100, 'Squid'],
    ['o2', 200, 'Herring']
  ]);
  const edited = trip('edited', [
    ['e1', 10, 'Chicken'],
    ['e2', 20, 'Mackerel'],
    ['e3', 20, 'Fish heads']
  ]);
  const newest = trip('newest', [
    ['n1', 900, 'Turkey'],
    ['n2', 300, 'CHICKEN']
  ]);

  expect(labels(baitChoices([newest, edited, older], 'edited'))).toEqual([
    'Mackerel',
    'Fish heads',
    'Chicken',
    'Turkey',
    'Herring',
    'Squid'
  ]);
  expect(labels(baitChoices([edited, older], 'older'))).toEqual([
    'Herring',
    'Squid',
    'Mackerel',
    'Fish heads',
    'Chicken'
  ]);
});

it('matches case, whitespace and Unicode variants as one bait without folding distinct names', () => {
  const choices = baitChoices(
    [
      trip('t', [
        ['a', 6, '  CHICKEN   necks '],
        ['b', 5, 'chicken necks'],
        ['c', 4, 'Jalapeño'],
        ['d', 3, 'jalapeño'],
        ['e', 2, 'Jalapeno'],
        ['f', 1, '   '],
        ['g', 0, "Mom's mix"],
        ['h', -1, 'Moms mix']
      ])
    ],
    't'
  );

  expect(labels(choices)).toEqual([
    'CHICKEN necks',
    'Jalapeño',
    'Jalapeno',
    "Mom's mix",
    'Moms mix'
  ]);
});

it("chips show three ranked baits and keep the drop's own older bait", () => {
  const choices = baitChoices(
    [
      trip('past', [
        ['p1', 1, 'Squid'],
        ['p2', 2, 'Herring'],
        ['p3', 3, 'Chicken'],
        ['p4', 4, 'Turkey']
      ])
    ],
    'new'
  );

  expect(labels(baitChips(choices, ''))).toEqual([
    'Turkey',
    'Chicken',
    'Herring'
  ]);
  expect(labels(baitChips(choices, 'squid'))).toEqual([
    'Turkey',
    'Chicken',
    'Herring',
    'squid'
  ]);
  expect(labels(baitChips(choices, 'CHICKEN'))).toEqual([
    'Turkey',
    'CHICKEN',
    'Herring'
  ]);
  expect(labels(baitChips([], ''))).toEqual([]);
});

it('offers Add only when no saved bait matches the typed text ignoring case and spacing', () => {
  const choices = [
    choice('Fish heads'),
    choice('Fish'),
    choice('Chicken'),
    choice('Catfish')
  ];

  expect(baitMatches(choices, '  FISH ')).toEqual({
    matches: [choice('Fish'), choice('Fish heads'), choice('Catfish')],
    add: null
  });
  expect(baitMatches(choices, ' fish   h')).toEqual({
    matches: [choice('Fish heads')],
    add: 'fish h'
  });
  expect(baitMatches(choices, 'Eel')).toEqual({ matches: [], add: 'Eel' });
  expect(baitMatches(choices, '  ')).toEqual({ matches: choices, add: null });
});

it('keeps the saved spelling when the picked bait is the same one', () => {
  expect(chosenBait('chicken  necks', 'Chicken necks')).toBe('chicken  necks');
  expect(chosenBait('Chicken', '  Fish   heads ')).toBe('Fish heads');
});
