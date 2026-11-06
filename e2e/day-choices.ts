import { expect, type Locator } from '@playwright/test';

const choiceFaces = (days: Locator) =>
  days.locator('label').evaluateAll((labels) =>
    labels.map((label) => {
      const box = label.getBoundingClientRect();
      const mark = label.querySelector('svg');
      const markBox = mark?.getBoundingClientRect();
      return {
        name: label.textContent.trim(),
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
