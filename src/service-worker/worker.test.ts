import { afterEach, expect, test, vi } from 'vitest';

const ORIGIN = 'https://krab.test';

type Handler = (event: object) => void;

const worker = async (
  entry: () => Promise<unknown>,
  unregister: () => Promise<boolean> = () => Promise.resolve(true)
) => {
  const handlers = new Map<string, Handler>();
  const world = { unregistered: 0 };
  const self = {
    location: new URL(ORIGIN),
    addEventListener: (type: string, handler: Handler) => {
      handlers.set(type, handler);
    },
    clients: { claim: () => Promise.resolve() },
    registration: {
      unregister: () => {
        world.unregistered += 1;
        return unregister();
      }
    },
    skipWaiting: () => Promise.resolve()
  };
  vi.resetModules();
  vi.doMock('$app/service-worker', () => ({ self }));
  vi.doMock('$app/env', () => ({ version: 'test' }));
  vi.doMock('$app/manifest', () => ({
    assets: [{ path: 'icons/icon-192.png' }],
    immutable: []
  }));
  await entry();
  const dispatch = (type: string, event: object) => {
    let settled: Promise<unknown> = Promise.resolve();
    const handler = handlers.get(type);
    handler?.({
      ...event,
      waitUntil: (work: Promise<unknown>) => {
        settled = work;
      },
      respondWith: (response: Promise<Response>) => {
        settled = response;
      }
    });
    return settled;
  };
  return { world, dispatch };
};

const navigation = (path: string) =>
  Object.defineProperty(new Request(`${ORIGIN}${path}`), 'mode', {
    value: 'navigate'
  });

afterEach(() => {
  vi.unstubAllGlobals();
});

const unusable = new Error('cache storage unavailable');
const offline = new TypeError('network unreachable');
const shell = new Response('<!doctype html>', {
  headers: { 'content-type': 'text/html' }
});

test.each([
  {
    how: 'opening the cache rejects',
    open: () => Promise.reject(unusable),
    network: 'up',
    answer: shell
  },
  {
    how: 'reading the cache rejects',
    open: () => Promise.resolve({ match: () => Promise.reject(unusable) }),
    network: 'up',
    answer: shell
  },
  {
    how: 'opening the cache rejects and the network is down',
    open: () => Promise.reject(unusable),
    network: 'down',
    answer: offline
  }
])(
  'when $how, a navigation asks the network once and gets its answer',
  async ({ open, network, answer }) => {
    const requested: string[] = [];
    vi.stubGlobal('caches', { open });
    vi.stubGlobal('fetch', (request: Request) => {
      requested.push(request.url);
      return network === 'up'
        ? Promise.resolve(shell)
        : Promise.reject(offline);
    });
    const { dispatch } = await worker(() => import('./index'));

    const responded = dispatch('fetch', { request: navigation('/trip') });

    expect(await responded.catch((error: unknown) => error)).toBe(answer);
    expect(requested).toEqual([`${ORIGIN}/trip`]);
  }
);

test.each([
  {
    how: 'cache deletion succeeds',
    keys: () => Promise.resolve(['krab-shell-old', 'another-app']),
    failure: null
  },
  {
    how: 'listing caches fails',
    keys: () => Promise.reject(unusable),
    failure: unusable
  },
  {
    how: 'listing caches and unregistering both fail',
    keys: () => Promise.reject(unusable),
    failure: unusable,
    unregister: () => Promise.reject(new Error('unregister refused'))
  }
])(
  'the recovery worker unregisters when $how, and a deletion failure stays visible',
  async ({ keys, failure, unregister }) => {
    const deleted: string[] = [];
    vi.stubGlobal('caches', {
      keys,
      delete: (key: string) => {
        deleted.push(key);
        return Promise.resolve(true);
      }
    });
    const { world, dispatch } = await worker(
      () => import('./kill-switch'),
      unregister
    );

    const activated = dispatch('activate', {});

    expect(
      await activated.then(
        () => null,
        (error: unknown) => error
      )
    ).toBe(failure);
    expect(world.unregistered).toBe(1);
    expect(deleted).toEqual(failure ? [] : ['krab-shell-old']);
  }
);
