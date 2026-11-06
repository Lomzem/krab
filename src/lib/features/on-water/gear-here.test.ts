import { expect, it } from 'vitest';
import { groupChip, type HereItem } from './gear-here';

const DAY_1 = { number: 1, text: 'Day 1' };
const DAY_2 = { number: 2, text: 'Day 2' };

const pot = (
  number: number,
  day: HereItem['day'],
  uncollected = false
): HereItem => ({
  id: `pot-${String(number)}`,
  kind: 'pot',
  layer: 'past',
  number,
  day,
  uncollected,
  name: `Pot ${String(number)}`,
  details: [],
  summary: ''
});

it('names a group by what it shows first, then every gear in it', () => {
  const chip = groupChip(pot(8, null), [pot(7, null), pot(8, null)]);

  expect(chip.label).toBe('Pot 8 +1 more. 2 gear here: Pot 7, Pot 8');
  expect(chip.more).toBe(1);
  expect(chip.uncollected).toBe(false);
});

it('shows the day of a group whose gear all went in that day', () => {
  const chip = groupChip(pot(3, DAY_1), [pot(3, DAY_1), pot(4, DAY_1)]);

  expect(chip.face.day).toEqual(DAY_1);
  expect(chip.label).toBe('Pot 3 Day 1 +1 more. 2 gear here: Pot 3, Pot 4');
});

it('shows no day on a group that spans days and says which days it holds', () => {
  const chip = groupChip(pot(8, DAY_2), [
    pot(1, DAY_1),
    pot(2, DAY_1),
    pot(8, DAY_2)
  ]);

  expect(chip.face.day).toBeNull();
  expect(chip.label).toBe(
    'Pot 8 +2 more. 3 gear here on Day 1 and Day 2: Pot 1, Pot 2, Pot 8'
  );
});

it('marks a group once when some of it is uncollected, and says how many', () => {
  const lead = pot(1, DAY_1);
  const some = groupChip(lead, [lead, pot(2, DAY_1, true)]);
  const all = groupChip(pot(3, DAY_1, true), [
    pot(3, DAY_1, true),
    pot(4, DAY_1, true)
  ]);

  expect(some.uncollected).toBe(true);
  expect(some.face.uncollected).toBe(false);
  expect(some.label).toMatch(/; 1 of 2 uncollected$/);
  expect(all.uncollected).toBe(true);
  expect(all.face.uncollected).toBe(false);
  expect(all.label).toMatch(/; all uncollected$/);
});

it('borders the +N segment like the rest of the group and names how many of each status it holds when they differ', () => {
  const collected = { ...pot(2, null), layer: 'collected' as const };
  const wet = (number: number) => ({
    ...pot(number, null),
    layer: 'in-water' as const
  });
  const mixed = groupChip(collected, [wet(1), wet(3), collected]);
  const done = groupChip(collected, [
    collected,
    { ...collected, id: 'pot-4', name: 'Pot 4' }
  ]);
  const active = groupChip(wet(1), [wet(1), wet(3)]);

  expect(mixed.face.layer).toBe('collected');
  expect(mixed.others).toBe('in-water');
  expect(mixed.label).toBe(
    'Pot 2 +2 more. 3 gear here: Pot 1, Pot 3, Pot 2; 2 in the water, 1 collected'
  );
  expect(done.others).toBe('collected');
  expect(done.label).toBe('Pot 2 +1 more. 2 gear here: Pot 2, Pot 4');
  expect(active.others).toBe('in-water');
  expect(active.label).toBe('Pot 1 +1 more. 2 gear here: Pot 1, Pot 3');
});

it('says a group that spans more than one spot is in this area, not here', () => {
  expect(
    groupChip(pot(1, null), [pot(1, null), pot(2, null)], true).label
  ).toBe('Pot 1 +1 more. 2 gear in this area: Pot 1, Pot 2');
});
