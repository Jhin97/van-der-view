// src/ui/narrative-panel.js
//
// Builds the L1 narrative scaffolding:
//   1) a dismissible task-brief panel anchored above & behind the pocket,
//   2) small residue side-notes anchored to each marquee residue's Cα xyz,
//   3) a one-line score-meaning hint below the score readout's anchor.

import * as THREE from 'three';

const BRIEF_W = 1.2;
const BRIEF_H = 0.6;
const NOTE_W = 0.18;
const NOTE_H = 0.05;
const HINT_W = 0.5;
const HINT_H = 0.05;
const BRIEF_CANVAS_W = 1024;
const BRIEF_CANVAS_H = 512;

function makeCanvasTexture(canvas) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const testLine = line ? `${line} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = testLine;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paintBrief(canvas, narrative) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, BRIEF_CANVAS_W, BRIEF_CANVAS_H);
  ctx.fillStyle = 'rgba(8, 12, 28, 0.9)';
  ctx.fillRect(0, 0, BRIEF_CANVAS_W, BRIEF_CANVAS_H);

  const brief = narrative?.brief;
  if (!brief) {
    ctx.fillStyle = '#9ad9ff';
    ctx.font = 'bold 36px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(narrative?.steps?.[0]?.title || 'Dock the ligand', 32, 32);
    ctx.fillStyle = '#e0e0f0';
    ctx.font = '22px ui-sans-serif, system-ui, sans-serif';
    for (const line of wrapText(ctx, narrative?.steps?.[0]?.body || '', BRIEF_CANVAS_W - 64)) {
      ctx.fillText(line, 32, 80);
    }
    return;
  }

  // Title
  ctx.fillStyle = '#9ad9ff';
  ctx.font = 'bold 48px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(brief.title, 32, 24);

  // Body
  const bodyTextStart = 96;
  ctx.fillStyle = '#e0e0f0';
  ctx.font = '24px ui-sans-serif, system-ui, sans-serif';
  ctx.fillStyle = '#9ad9ff';
  ctx.fillText('Biology', 32, bodyTextStart);
  ctx.fillStyle = '#e0e0f0';
  let y = bodyTextStart + 36;
  for (const line of wrapText(ctx, brief.biology || '', BRIEF_CANVAS_W - 64)) {
    ctx.fillText(line, 32, y);
    y += 30;
  }
  y += 16;

  ctx.fillStyle = '#9ad9ff';
  ctx.fillText('Engineering', 32, y);
  ctx.fillStyle = '#e0e0f0';
  y += 36;
  for (const line of wrapText(ctx, brief.engineering || '', BRIEF_CANVAS_W - 64)) {
    ctx.fillText(line, 32, y);
    y += 30;
  }

  // Dismiss hint
  ctx.fillStyle = '#888';
  ctx.font = '20px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText('A button (left) to dismiss', 32, BRIEF_CANVAS_H - 36);
}

function paintNote(canvas, label, body) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(20, 24, 40, 0.85)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#9ad9ff';
  ctx.font = 'bold 28px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(label, 12, 8);
  ctx.fillStyle = '#e0e0f0';
  ctx.font = '18px ui-sans-serif, system-ui, sans-serif';
  let y = 44;
  for (const line of wrapText(ctx, body, canvas.width - 24)) {
    ctx.fillText(line, 12, y);
    y += 22;
  }
}

function paintHint(canvas, text) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8, 12, 28, 0.7)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#a0c0d0';
  ctx.font = 'italic 18px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 12, canvas.height / 2);
}

/**
 * Build the narrative panels.
 *
 * @returns {{
 *   group: THREE.Group,
 *   dismissBrief: () => void,
 *   update: (dtMs: number, camera: THREE.Camera) => void
 * }}
 */
export function buildNarrativePanel({
  pocketCenter,
  pocketAnnotation,
  narrative,
  scoreReadoutAnchor,
}) {
  const group = new THREE.Group();
  let dtSinceBoot = 0;

  // Brief panel — 1 m above + 0.6 m behind the pocket
  const briefCanvas = document.createElement('canvas');
  briefCanvas.width = BRIEF_CANVAS_W;
  briefCanvas.height = BRIEF_CANVAS_H;
  paintBrief(briefCanvas, narrative);
  const briefTex = makeCanvasTexture(briefCanvas);
  const brief = new THREE.Mesh(
    new THREE.PlaneGeometry(BRIEF_W, BRIEF_H),
    new THREE.MeshBasicMaterial({ map: briefTex, transparent: true })
  );
  brief.position.set(pocketCenter.x, pocketCenter.y + 1.0, pocketCenter.z - 0.6);
  group.add(brief);

  // Residue side-notes
  for (const residue of pocketAnnotation.key_residues || []) {
    const note = narrative.residue_notes?.[residue.id] || narrative.residue_notes?.[residue.name];
    if (!note) continue;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 160;
    paintNote(canvas, residue.id, note);
    const tex = makeCanvasTexture(canvas);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(NOTE_W, NOTE_H),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    const ca = residue.ca_xyz;
    plane.position.set(ca[0], ca[1] + 0.08, ca[2]);
    group.add(plane);
  }

  // Score-meaning hint
  let hint = null;
  if (scoreReadoutAnchor && narrative.score_hint) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 96;
    paintHint(canvas, narrative.score_hint);
    const tex = makeCanvasTexture(canvas);
    hint = new THREE.Mesh(
      new THREE.PlaneGeometry(HINT_W, HINT_H),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true })
    );
    hint.position.set(
      scoreReadoutAnchor.x,
      scoreReadoutAnchor.y - 0.12,
      scoreReadoutAnchor.z
    );
    group.add(hint);
  }

  function dismissBrief() {
    brief.visible = false;
  }

  function update(dtMs, camera) {
    dtSinceBoot += dtMs;
    const autoDismissMs = (narrative?.brief?.auto_dismiss_seconds ?? 15) * 1000;
    if (dtSinceBoot >= autoDismissMs) brief.visible = false;
    if (camera) {
      brief.lookAt(camera.position);
      if (hint) hint.lookAt(camera.position);
      // Side-notes are small enough that fixed orientation is fine; if needed,
      // wrap them in a billboarded child here.
    }
  }

  return { group, dismissBrief, update };
}
