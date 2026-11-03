#!/usr/bin/env bun
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, readlinkSync } from 'node:fs';

export const doctor = () => {
  const pid = readFileSync('test-results/verify-krab-lock/preview-pid', 'utf8');
  const command = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
  assert.ok(command.includes('node_modules/vite/bin/vite.js'));
  assert.ok(command.includes('--strictPort'));
  const sockets = readdirSync(`/proc/${pid}/fd`).map((fd) =>
    readlinkSync(`/proc/${pid}/fd/${fd}`)
  );
  const listeners = readFileSync(`/proc/${pid}/net/tcp`, 'utf8').split('\n');
  const owned = listeners.some((line) => {
    const fields = line.trim().split(/\s+/);
    return (
      fields[1] === '0100007F:104D' &&
      fields[3] === '0A' &&
      sockets.includes(`socket:[${fields[9] ?? ''}]`)
    );
  });
  assert.ok(
    owned,
    'Doctor: preview port must belong to the PID launched by this run'
  );
  return { pid, command: command.replaceAll('\0', ' '), port: 4173 };
};

if (import.meta.main) console.log(JSON.stringify(doctor(), null, 2));
