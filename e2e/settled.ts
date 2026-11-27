import type { Page } from '@playwright/test';

const finished = async () => {
  const finite = document
    .getAnimations()
    .filter(
      (animation) =>
        (animation instanceof CSSAnimation ||
          animation instanceof CSSTransition) &&
        animation.effect?.getComputedTiming().iterations !== Infinity
    );
  await Promise.all(
    finite.map((animation) => animation.finished.catch(() => null))
  );
};

export const animationsSettled = (page: Page) => page.evaluate(finished);
