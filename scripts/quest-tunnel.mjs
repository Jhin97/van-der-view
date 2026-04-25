#!/usr/bin/env node
// F-001: ADB reverse tunnel so a Quest 3 (USB-C) can hit the laptop dev server at localhost:5173.
// Requires the Android Platform Tools `adb` on PATH and developer mode enabled on the headset.

import { execSync } from 'node:child_process';

const PORT = process.env.QUEST_PORT ?? '5173';

function run(cmd) {
  console.log(`$ ${cmd}`);
  return execSync(cmd, { stdio: 'inherit' });
}

try {
  run('adb devices');
  run(`adb reverse tcp:${PORT} tcp:${PORT}`);
  console.log(`\n✅ Quest 3 can now reach https://localhost:${PORT} via USB-C.`);
  console.log('   In Quest Browser, navigate to that URL and accept the self-signed cert.');
} catch (err) {
  console.error('\n❌ adb failed. Verify:');
  console.error('   1) `adb` is installed and on PATH (Android Platform Tools).');
  console.error('   2) Quest 3 is in Developer Mode and connected via USB-C.');
  console.error('   3) The headset prompt to Allow USB debugging was accepted.');
  process.exit(1);
}
