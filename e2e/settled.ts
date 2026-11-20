import type { Page } from '@playwright/test';

const finished = async () => {
  const finite = document
    .getAnimations()
    .filter(
      (animation) =>
        animation.effect?.getComputedTiming().iterations !== Infinity
    );
  for (const animation of finite) await animation.finished.catch(() => null);
};

export const animationsSettled = (page: Page) => page.evaluate(finished);
