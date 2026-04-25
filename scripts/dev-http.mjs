#!/usr/bin/env node
// Local-only HTTP dev launcher for Claude Preview / CI smoke tests.
// Sets VITE_NO_HTTPS=1 so vite.config.js skips mkcert (whose self-signed
// root the headless browser doesn't trust), then runs vite on port 5174.
import { spawn } from 'node:child_process';

const vite = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', '--host', '0.0.0.0', '--port', '5174'],
  {
    stdio: 'inherit',
    env: { ...process.env, VITE_NO_HTTPS: '1' },
  },
);
vite.on('exit', (code) => process.exit(code ?? 0));
