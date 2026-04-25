#!/usr/bin/env node
// F-001: One-command headset mirror to laptop at 60fps.
// Uses scrcpy (https://github.com/Genymobile/scrcpy) which targets the Quest's primary display.

import { spawn } from 'node:child_process';

const args = [
  '--max-size=1280',
  '--max-fps=60',
  '--video-bit-rate=8M',
  '--no-audio',
  '--window-title=Quest 3 Mirror — van-der-view',
];

console.log('Starting scrcpy headset mirror (60fps cap)...');
console.log('Tip: aim Quest 3 cameras at a well-lit area for best passthrough.');

const child = spawn('scrcpy', args, { stdio: 'inherit', shell: true });
child.on('error', () => {
  console.error('\n❌ scrcpy not found. Install via `winget install scrcpy` (Windows) or `brew install scrcpy` (macOS).');
  process.exit(1);
});
child.on('exit', (code) => process.exit(code ?? 0));
