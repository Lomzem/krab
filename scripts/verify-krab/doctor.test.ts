import { Result } from 'effect';
import { beforeEach, expect, test, vi } from 'vitest';
import { doctor } from './doctor';

const procfs = vi.hoisted(() => ({
  files: new Map<string, string>(),
  fds: new Map<string, string | Error>()
}));

const errno = (code: string, path: string) =>
  Object.assign(new Error(`${code}: readlink '${path}'`), { code });

const found = <A>(value: A | Error | undefined, path: string) =>
  Result.getOrThrow(
    value instanceof Error || value === undefined
      ? Result.fail(value ?? errno('ENOENT', path))
      : Result.succeed(value)
  );

vi.mock('node:fs', () => ({
  readFileSync: (path: string) => found(procfs.files.get(path), path),
  readdirSync: (path: string) =>
    found(path === '/proc/4242/fd' ? [...procfs.fds.keys()] : undefined, path),
  readlinkSync: (path: string) =>
    found(procfs.fds.get(path.replace('/proc/4242/fd/', '')), path)
}));

const LISTENER =
  '   0: 0100007F:104D 00000000:0000 0A 00000000:00000000 00:00000000 00000000  1000        0 777 1 0000000000000000 100 0 0 10 0';

const preview = (fds: Record<string, string | Error>) => {
  procfs.files.set('test-results/verify-krab-lock/preview-pid', '4242');
  procfs.files.set(
    '/proc/4242/cmdline',
    'node\0node_modules/vite/bin/vite.js\0preview\0--strictPort\0'
  );
  procfs.files.set(
    '/proc/4242/net/tcp',
    `  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n${LISTENER}\n`
  );
  Object.entries(fds).forEach(([fd, link]) => procfs.fds.set(fd, link));
};

beforeEach(() => {
  procfs.files.clear();
  procfs.fds.clear();
});

test('a descriptor closing during the scan leaves the owned listener accepted', () => {
  preview({
    '0': 'pipe:[1]',
    '7': 'socket:[777]',
    '9': errno('ENOENT', '/proc/4242/fd/9')
  });

  expect(doctor()).toEqual({
    pid: '4242',
    command: 'node node_modules/vite/bin/vite.js preview --strictPort ',
    port: 4173
  });
});

const denied = errno('EACCES', '/proc/4242/fd/9');

test.each([
  {
    how: 'a descriptor cannot be read',
    fds: { '7': 'socket:[777]', '9': denied },
    failure: denied
  },
  {
    how: 'another process owns the listener',
    fds: { '7': 'socket:[888]', '9': errno('ENOENT', '/proc/4242/fd/9') },
    failure: /preview port must belong to the PID launched by this run/
  }
])('doctor fails when $how', ({ fds, failure }) => {
  preview(fds);

  expect(doctor).toThrow(failure);
});
