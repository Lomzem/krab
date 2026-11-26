import { expect, type Locator } from '@playwright/test';

const choiceFaces = (days: Locator) =>
  days.getByRole('radio').evaluateAll((choices) =>
    choices.map((choice) => {
      const box = choice.getBoundingClientRect();
      const mark = choice.querySelector('svg');
      const markBox = mark?.getBoundingClientRect();
      return {
        name: choice.textContent.trim(),
        marked:
          mark !== null &&
          getComputedStyle(mark).visibility === 'visible' &&
          (markBox?.width ?? 0) >= 12,
        box: [box.left, box.top, box.width, box.height]
      };
    })
  );

export const chooseDays = async (days: Locator, name: string) => {
  const before = await choiceFaces(days);
  await days.getByRole('radio', { name, exact: true }).check();
  const after = await choiceFaces(days);
  expect(
    after.map((choice) => [choice.name, choice.marked]),
    'only the chosen day choice carries a check mark'
  ).toEqual(after.map((choice) => [choice.name, choice.name === name]));
  expect(
    after.map((choice) => choice.box),
    'choosing days moves no choice'
  ).toEqual(before.map((choice) => choice.box));
};
