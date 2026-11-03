import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page } from '@playwright/test';

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

export const expectAccessibleInBothThemes = async (page: Page) => {
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    const { violations } = await new AxeBuilder({ page })
      .withTags(WCAG_22_AA)
      .analyze();
    expect(violations, `${colorScheme} theme`).toEqual([]);
  }
};

type FocusStop = 'dialog' | 'outside the page' | 'page behind';

export const expectFocusTrapped = async (page: Page, dialog: Locator) => {
  const controls = dialog.getByRole('button');
  const focusStop = () =>
    dialog.evaluate((element): FocusStop => {
      const focused = document.activeElement;
      if (focused === null || focused === document.body) {
        return 'outside the page';
      }
      return element.contains(focused) ? 'dialog' : 'page behind';
    });
  const crossFrom = async (control: Locator, key: string) => {
    await control.focus();
    const stops: FocusStop[] = [];
    for (let press = 0; press < 3; press += 1) {
      await page.keyboard.press(key);
      stops.push(await focusStop());
    }
    expect(stops, `${key} across the dialog's edge`).not.toContain(
      'page behind'
    );
    expect(stops.at(-1), `${key} returns to the dialog`).toBe('dialog');
  };
  await crossFrom(controls.first(), 'Shift+Tab');
  await crossFrom(controls.last(), 'Tab');
};
