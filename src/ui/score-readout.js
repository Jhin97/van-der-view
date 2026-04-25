// src/ui/score-readout.js
//
// In-scene billboard showing the live docking score + colour bar +
// best-pose badge. Renders text via THREE.CanvasTexture; tracks the
// player's head so the panel always faces the camera.

import * as THREE from 'three';

const PANEL_W = 0.5;        // metres
const PANEL_H = 0.18;
const BADGE_W = 0.4;
const BADGE_H = 0.08;
const CANVAS_W = 512;
const CANVAS_H = 192;

function makeCanvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function colourForTotal(total) {
  // 0 -> red (hue 0), 0.5 -> yellow (hue 60), 1 -> green (hue 120)
  const t = Math.max(0, Math.min(1, total));
  const hue = Math.round(t * 120);
  return `hsl(${hue}, 80%, 50%)`;
}

function paintReadout(canvas, scoreResult) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = 'rgba(10, 10, 24, 0.85)';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = '#e6e6f0';
  ctx.font = 'bold 36px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(`Score: ${scoreResult.total.toFixed(3)}`, 24, 18);

  ctx.font = '20px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#a0a0c0';
  ctx.fillText(
    `dist ${scoreResult.rawDistance.toFixed(2)} Å    H-bonds ${scoreResult.components.hBondHits}    clashes ${scoreResult.components.clashes}`,
    24,
    74
  );

  // Score bar
  const barX = 24;
  const barY = 130;
  const barW = CANVAS_W - 48;
  const barH = 26;
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = colourForTotal(scoreResult.total);
  ctx.fillRect(barX, barY, barW * Math.max(0, Math.min(1, scoreResult.total)), barH);
}

function paintBadge(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#06d6a0';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = '#0a0a14';
  ctx.font = 'bold 96px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('BEST POSE', CANVAS_W / 2, CANVAS_H / 2);
}

/**
 * Build the readout. Returns { group, update, showBadge }.
 *
 * @param {object} args
 * @param {{x:number,y:number,z:number}} args.pocketCenter
 * @param {THREE.Camera} args.camera   for billboard look-at
 */
export function buildReadout({ pocketCenter, camera }) {
  const group = new THREE.Group();
  group.position.set(pocketCenter.x, pocketCenter.y + 0.5, pocketCenter.z);

  // Score panel
  const panelCanvas = document.createElement('canvas');
  panelCanvas.width = CANVAS_W;
  panelCanvas.height = CANVAS_H;
  paintReadout(panelCanvas, { total: 0, rawDistance: 0, components: { hBondHits: 0, clashes: 0 } });
  const panelTex = makeCanvasTexture(panelCanvas);
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL_W, PANEL_H),
    new THREE.MeshBasicMaterial({ map: panelTex, transparent: true })
  );
  group.add(panel);

  // Best-pose badge (hidden initially)
  const badgeCanvas = document.createElement('canvas');
  badgeCanvas.width = CANVAS_W;
  badgeCanvas.height = CANVAS_H;
  paintBadge(badgeCanvas);
  const badgeTex = makeCanvasTexture(badgeCanvas);
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(BADGE_W, BADGE_H),
    new THREE.MeshBasicMaterial({ map: badgeTex, transparent: true })
  );
  badge.position.set(0, -PANEL_H / 2 - BADGE_H / 2 - 0.02, 0);
  badge.visible = false;
  group.add(badge);

  function update(scoreResult) {
    paintReadout(panelCanvas, scoreResult);
    panelTex.needsUpdate = true;
    if (camera) {
      group.lookAt(camera.position);
    }
  }

  function showBadge() {
    badge.visible = true;
  }

  return { group, update, showBadge };
}
