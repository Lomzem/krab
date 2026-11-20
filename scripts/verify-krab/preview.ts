#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const server = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    'preview',
    '--host',
    '127.0.0.1',
    '--port',
    '4173',
    '--strictPort'
  ],
  { stdio: 'inherit' }
);
const scratch =
  process.env['KRAB_VERIFY_SCRATCH'] ?? 'test-results/verify-krab-lock';
mkdirSync(scratch, { recursive: true });
writeFileSync(`${scratch}/preview-pid`, String(server.pid));
server.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
process.on('SIGTERM', () => {
  server.kill('SIGTERM');
});
process.on('SIGINT', () => {
  server.kill('SIGINT');
});
