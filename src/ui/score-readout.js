// src/ui/score-readout.js
//
// 3D test-tube score indicator for Level 1.
// Score (0–1) maps to liquid level; displayed as 1–100.
// Colour gradient: red → yellow → green.
// "Successful!" banner at 100. Cartoon score font.

import * as THREE from 'three';

// ---- Dimensions (metres) ---------------------------------------------------

const TUBE_R         = 0.028;   // outer cylinder radius
const TUBE_IR        = 0.024;   // inner cylinder radius
const WALL           = TUBE_R - TUBE_IR;
const BULB_OR        = TUBE_R * 1.5;  // outer bulb radius
const BULB_IR        = BULB_OR - WALL; // inner bulb radius
const CYL_H          = 0.32;    // height of straight cylinder section
const NECK_H         = 0.025;   // transition zone height
const BULB_H         = BULB_OR; // bulb is a hemisphere → height = radius
const BODY_START     = BULB_H + NECK_H; // Y where straight cylinder begins
const TOTAL_H        = BODY_START + CYL_H;
const LIQUID_MAX_H   = CYL_H - 0.012;  // leave small air gap at top
const RIM_R          = TUBE_R * 1.14;
const RIM_H          = 0.005;
const SEG            = 36;
const GRADS          = 5;

// ---- Colour ramp: red → yellow → green ------------------------------------

function scoreColor(t) {
  // Hue 0 (red) → 60 (yellow) → 120 (green)
  const hue = Math.max(0, Math.min(1, t)) * 120;
  return new THREE.Color().setHSL(hue / 360, 0.85, 0.5);
}

// Bright variant for text (avoid dark shades)
function scoreColorBright(t) {
  const hue = Math.max(0, Math.min(1, t)) * 120;
  return new THREE.Color().setHSL(hue / 360, 0.9, 0.6);
}

// ---- Profile builders (shared Y origin at y=0 = bottom of tube) ------------

function buildOuterProfile() {
  const pts = [];

  // 1) Bulb bottom hemisphere: center at (0, BULB_OR), radius BULB_OR
  //    Profile goes from (0, 0) at the very bottom → equator at (BULB_OR, BULB_OR)
  const bSteps = 10;
  for (let i = 0; i <= bSteps; i++) {
    const a = (i / bSteps) * (Math.PI * 0.5); // 0 → π/2
    pts.push(new THREE.Vector2(
      Math.sin(a) * BULB_OR,
      BULB_OR - Math.cos(a) * BULB_OR,  // 0 → BULB_OR
    ));
  }

  // 2) Neck transition: equator (BULB_OR, BULB_OR) → (TUBE_R, BODY_START)
  const nSteps = 5;
  for (let i = 1; i <= nSteps; i++) {
    const f = i / nSteps;
    const s = f * f * (3 - 2 * f); // smoothstep
    pts.push(new THREE.Vector2(
      BULB_OR + (TUBE_R - BULB_OR) * s,
      BULB_H + f * NECK_H,
    ));
  }

  // 3) Straight cylinder
  pts.push(new THREE.Vector2(TUBE_R, BODY_START));
  pts.push(new THREE.Vector2(TUBE_R, TOTAL_H));

  // 4) Rim flare
  pts.push(new THREE.Vector2(RIM_R, TOTAL_H));
  pts.push(new THREE.Vector2(RIM_R, TOTAL_H + RIM_H));
  pts.push(new THREE.Vector2(TUBE_R, TOTAL_H + RIM_H));

  return pts;
}

function buildLiquidProfile() {
  const pts = [];

  // Same structure as outer but using inner radii
  // 1) Bulb
  const bSteps = 10;
  for (let i = 0; i <= bSteps; i++) {
    const a = (i / bSteps) * (Math.PI * 0.5);
    pts.push(new THREE.Vector2(
      Math.sin(a) * BULB_IR,
      BULB_IR - Math.cos(a) * BULB_IR,
    ));
  }

  // 2) Neck
  const nSteps = 5;
  for (let i = 1; i <= nSteps; i++) {
    const f = i / nSteps;
    const s = f * f * (3 - 2 * f);
    pts.push(new THREE.Vector2(
      BULB_IR + (TUBE_IR - BULB_IR) * s,
      BULB_IR + f * NECK_H,
    ));
  }

  // 3) Straight cylinder — extends to full liquid height
  // The liquid geometry goes from y=0 to BODY_START + LIQUID_MAX_H
  // We scale Y so that only the cylinder portion stretches
  pts.push(new THREE.Vector2(TUBE_IR, BODY_START + LIQUID_MAX_H));

  return pts;
}

// ---- Build -----------------------------------------------------------------

export function buildReadout({ pocketCenter, camera }) {
  const group = new THREE.Group();
  group.position.set(pocketCenter.x, pocketCenter.y + 0.55, pocketCenter.z);

  // ---- Glass tube ----------------------------------------------------------

  const tubeGeo = new THREE.LatheGeometry(buildOuterProfile(), SEG);
  const tubeMat = new THREE.MeshPhysicalMaterial({
    color: 0xeef4ff,
    transparent: true,
    opacity: 0.18,
    roughness: 0.02,
    metalness: 0.0,
    transmission: 0.9,
    thickness: WALL * 2,
    ior: 1.52,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.5,
  });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  group.add(tube);

  // ---- Liquid body ---------------------------------------------------------

  const liqGeo = new THREE.LatheGeometry(buildLiquidProfile(), SEG);
  const liqMat = new THREE.MeshStandardMaterial({
    color: scoreColor(0),
    transparent: true,
    opacity: 0.85,
    roughness: 0.15,
    metalness: 0.15,
    emissive: scoreColor(0),
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  });
  const liquid = new THREE.Mesh(liqGeo, liqMat);
  // Bulb is always full of liquid; scale only stretches the cylinder part
  // Total profile height = BODY_START + LIQUID_MAX_H
  // Bulb+neck portion = BODY_START (always at full scale)
  // Cylinder portion = LIQUID_MAX_H (scaled by score)
  const profileH = BODY_START + LIQUID_MAX_H;
  const bulbFrac = BODY_START / profileH;
  liquid.scale.y = bulbFrac; // start with just the bulb filled
  group.add(liquid);

  // ---- Meniscus (top cap of liquid) ----------------------------------------

  const menGeo = new THREE.CircleGeometry(TUBE_IR, SEG);
  const menMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    roughness: 0.08,
    metalness: 0.4,
    side: THREE.DoubleSide,
  });
  const meniscus = new THREE.Mesh(menGeo, menMat);
  meniscus.rotation.x = -Math.PI / 2;
  meniscus.visible = false;
  group.add(meniscus);

  // ---- Graduation marks ----------------------------------------------------

  const markGrp = new THREE.Group();
  for (let i = 1; i <= GRADS; i++) {
    const t = i / (GRADS + 1);
    const y = BODY_START + t * LIQUID_MAX_H;

    const tickGeo = new THREE.PlaneGeometry(TUBE_R * 0.4, 0.002);
    const tickMat = new THREE.MeshBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.65, side: THREE.DoubleSide });
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.position.set(TUBE_R * 0.6, y, 0.003);
    markGrp.add(tick);

    const spr = makeGradLabel(Math.round(t * 100));
    spr.position.set(TUBE_R * 2.0, y, 0);
    spr.scale.set(0.035, 0.018, 1);
    markGrp.add(spr);
  }
  group.add(markGrp);

  // ---- Score label (cartoon 1–100) -----------------------------------------

  const sCanvas = document.createElement('canvas');
  sCanvas.width = 256; sCanvas.height = 256;
  const sCtx = sCanvas.getContext('2d');
  const sTex = new THREE.CanvasTexture(sCanvas);
  sTex.colorSpace = THREE.SRGBColorSpace;
  sTex.minFilter = THREE.LinearFilter;
  const sMat = new THREE.MeshBasicMaterial({ map: sTex, transparent: true, side: THREE.DoubleSide, depthTest: false });
  const scoreLabel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), sMat);
  scoreLabel.position.set(0.09, TOTAL_H * 0.45, 0);
  scoreLabel.scale.set(0.18, 0.18, 1);
  group.add(scoreLabel);

  // ---- "Successful!" banner ------------------------------------------------

  const bCanvas = document.createElement('canvas');
  bCanvas.width = 512; bCanvas.height = 128;
  const bCtx = bCanvas.getContext('2d');
  const bTex = new THREE.CanvasTexture(bCanvas);
  bTex.colorSpace = THREE.SRGBColorSpace;
  bTex.minFilter = THREE.LinearFilter;
  const bMat = new THREE.MeshBasicMaterial({ map: bTex, transparent: true, side: THREE.DoubleSide, depthTest: false });
  const successBanner = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bMat);
  successBanner.position.set(0, TOTAL_H + RIM_H + 0.06, 0);
  successBanner.scale.set(0.22, 0.055, 1);
  successBanner.visible = false;
  group.add(successBanner);

  // ---- Glow ring -----------------------------------------------------------

  const gGeo = new THREE.RingGeometry(TUBE_IR * 0.3, TUBE_R * 1.3, 32);
  const gMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false });
  const glowRing = new THREE.Mesh(gGeo, gMat);
  glowRing.rotation.x = -Math.PI / 2;
  group.add(glowRing);

  // ---- State ---------------------------------------------------------------

  let currentScore = 0;
  let successShown = false;

  // ---- Update --------------------------------------------------------------

  function update(scoreResult) {
    const target = Math.max(0, Math.min(1, scoreResult.total));
    currentScore += (target - currentScore) * 0.10;
    const t = currentScore;

    // Liquid Y-scale: bulb always full, cylinder portion scales with score
    liquid.scale.y = bulbFrac + (1 - bulbFrac) * Math.max(0.001, t);

    // Meniscus tracks top of liquid in the cylinder
    const menY = BODY_START + t * LIQUID_MAX_H;
    meniscus.position.y = menY;
    meniscus.visible = t > 0.03;

    // Colour
    const col = scoreColor(t);
    liqMat.color.copy(col);
    liqMat.emissive.copy(col);
    liqMat.emissiveIntensity = 0.25 + t * 0.4;
    liqMat.metalness = 0.1 + t * 0.25;
    menMat.color.copy(scoreColorBright(t));

    // Glow ring
    glowRing.position.y = menY;
    glowRing.material.color.copy(col);
    glowRing.material.opacity = t > 0.05 ? 0.18 + Math.sin(performance.now() * 0.005) * 0.07 : 0;

    // Score label
    paintScore(sCtx, sCanvas, sTex, t);

    // "Successful!" at score ~100
    if (t >= 0.98 && !successShown) {
      successShown = true;
      successBanner.visible = true;
    }
    if (t < 0.95) {
      successShown = false;
      successBanner.visible = false;
    }
    if (successBanner.visible) paintSuccess(bCtx, bCanvas, bTex, performance.now());

    // Billboard
    if (camera) group.lookAt(camera.position);
  }

  function showBadge() {
    successShown = true;
    successBanner.visible = true;
  }

  return { group, update, showBadge };
}

// ---- Painters --------------------------------------------------------------

function paintScore(ctx, canvas, tex, t) {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const pts = Math.round(t * 100);
  const col = scoreColorBright(t);
  const fill = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;

  // Large cartoon number
  ctx.font = 'bold 110px "Comic Sans MS", "Segoe Print", "Chalkboard SE", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#0a0a14';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.strokeText(pts.toString(), w / 2, h / 2 - 20);
  ctx.fillStyle = fill;
  ctx.fillText(pts.toString(), w / 2, h / 2 - 20);

  // "/ 100"
  ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", cursive';
  ctx.strokeStyle = '#0a0a14';
  ctx.lineWidth = 4;
  ctx.strokeText('/ 100', w / 2, h / 2 + 50);
  ctx.fillStyle = '#ccccdd';
  ctx.fillText('/ 100', w / 2, h / 2 + 50);

  tex.needsUpdate = true;
}

function paintSuccess(ctx, canvas, tex, time) {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const p = 0.9 + Math.sin(time * 0.006) * 0.1;

  ctx.fillStyle = `rgba(0, 200, 80, ${0.2 * p})`;
  ctx.beginPath(); ctx.roundRect(0, 0, w, h, 16); ctx.fill();
  ctx.strokeStyle = `rgba(0, 220, 100, ${0.8 * p})`;
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(2, 2, w - 4, h - 4, 14); ctx.stroke();

  ctx.font = 'bold 56px "Comic Sans MS", "Segoe Print", "Chalkboard SE", cursive';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#0a0a14'; ctx.lineWidth = 6; ctx.lineJoin = 'round';
  ctx.strokeText('Successful!', w / 2, h / 2);
  ctx.fillStyle = '#22dd66';
  ctx.fillText('Successful!', w / 2, h / 2);

  tex.needsUpdate = true;
}

function makeGradLabel(value) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#99aacc';
  x.font = 'bold 18px "Comic Sans MS", "Segoe Print", cursive';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(value.toString(), 32, 16);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false }));
}

function paintBadge(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#22dd66';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0a14';
  ctx.font = 'bold 64px "Comic Sans MS", "Segoe Print", cursive';
  ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.fillText('BEST POSE', canvas.width / 2, canvas.height / 2);
}
