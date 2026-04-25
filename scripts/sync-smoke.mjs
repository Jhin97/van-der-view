#!/usr/bin/env node
// Smoke test for the sync relay. Connects as a peer and broadcasts a forced
// cube transform; any other connected client (e.g. the preview browser tab)
// should apply it.

import WebSocket from 'ws';

const url = process.argv[2] ?? 'ws://localhost:5173/sync';
const ws = new WebSocket(url);

ws.on('open', () => {
  const msg = { type: 'cube', id: 0, p: [2.5, 0.7, -1.3], q: [0, 0, 0, 1] };
  ws.send(JSON.stringify(msg));
  console.log('sent', msg);
  setTimeout(() => ws.close(), 200);
});
ws.on('error', (err) => { console.error('error', err.message); process.exit(1); });
ws.on('close', () => process.exit(0));
