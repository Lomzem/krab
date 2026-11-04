import type { Page } from '@playwright/test';
import { expect, test, toastOf } from './fixtures';

const PHONES = [
  {
    phone: 'without Screen Wake Lock',
    setup: () => {
      Reflect.deleteProperty(Navigator.prototype, 'wakeLock');
    }
  },
  {
    phone: 'that refuses to keep the screen on',
    setup: () => {
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: () =>
            Promise.reject(new DOMException('refused', 'NotAllowedError'))
        }
      });
    }
  }
];

for (const { phone, setup } of PHONES) {
  test(`a phone ${phone} still drops gear with no error`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => {
      errors.push(error.message);
    });
    await page.addInitScript(setup);

    await page.goto('/');
    await page.getByRole('button', { name: 'Turn on location' }).click();
    await expect(page.getByText('Position ready')).toBeVisible();
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText('Pot 1 dropped');
    await page.getByRole('button', { name: 'Drop pot' }).click();
    await expect(toastOf(page)).toContainText('Pot 2 dropped');

    expect(errors).toEqual([]);
  });
}

type Locks = { hidden: boolean; held: number; most: number };
type LocksWindow = { locks?: Locks; phoneLetsGo?: () => void };

const holdLocksLikeAPhone = () => {
  const locks: Locks = { hidden: false, held: 0, most: 0 };
  (window as LocksWindow).locks = locks;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (locks.hidden ? 'hidden' : 'visible')
  });
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => locks.hidden
  });
  let sentinels: WakeLockSentinel[] = [];
  const sentinel = (): WakeLockSentinel => {
    let released = false;
    const lock = Object.assign(new EventTarget(), {
      type: 'screen' as const,
      onrelease: null,
      released,
      release: () => {
        if (!released) {
          released = true;
          locks.held -= 1;
          lock.dispatchEvent(new Event('release'));
        }
        return Promise.resolve();
      }
    });
    Object.defineProperty(lock, 'released', { get: () => released });
    return lock;
  };
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: () => {
        if (locks.hidden) {
          return Promise.reject(new DOMException('hidden', 'NotAllowedError'));
        }
        const lock = sentinel();
        sentinels = [...sentinels, lock];
        locks.held += 1;
        locks.most = Math.max(locks.most, locks.held);
        return Promise.resolve(lock);
      }
    }
  });
  const letGo = () => {
    for (const lock of sentinels) void lock.release();
    sentinels = [];
  };
  (window as LocksWindow).phoneLetsGo = letGo;
  document.addEventListener('visibilitychange', () => {
    if (locks.hidden) letGo();
  });
};

const setHidden = (page: Page, hidden: boolean) =>
  page.evaluate((next) => {
    const { locks } = window as LocksWindow;
    if (locks) locks.hidden = next;
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);

const locksHeld = (page: Page) =>
  page.evaluate(() => {
    const { locks } = window as LocksWindow;
    return { held: locks?.held, most: locks?.most };
  });

test('a phone that keeps the screen on holds one lock during a trip, takes it again when the phone lets it go while showing and on return, and lets it go when the trip ends', async ({
  page
}) => {
  await page.addInitScript(holdLocksLikeAPhone);
  await page.goto('/');
  await page.getByRole('button', { name: 'Turn on location' }).click();
  await expect(page.getByText('Position ready')).toBeVisible();
  expect(await locksHeld(page)).toEqual({ held: 0, most: 0 });
  await page.getByRole('button', { name: 'Drop pot' }).click();
  await expect(toastOf(page)).toContainText('Pot 1 dropped');
  await expect.poll(() => locksHeld(page)).toEqual({ held: 1, most: 1 });

  await page.evaluate(() => {
    (window as LocksWindow).phoneLetsGo?.();
  });
  await expect.poll(() => locksHeld(page)).toEqual({ held: 1, most: 1 });

  await setHidden(page, true);
  await expect.poll(() => locksHeld(page)).toEqual({ held: 0, most: 1 });
  await setHidden(page, true);
  expect(await locksHeld(page)).toEqual({ held: 0, most: 1 });

  await setHidden(page, false);
  await expect.poll(() => locksHeld(page)).toEqual({ held: 1, most: 1 });
  await setHidden(page, false);
  await expect.poll(() => locksHeld(page)).toEqual({ held: 1, most: 1 });

  await page.getByRole('button', { name: 'End trip' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'End trip' })
    .click();
  await expect(toastOf(page)).toContainText('Trip ended');
  await expect.poll(() => locksHeld(page)).toEqual({ held: 0, most: 1 });
});
