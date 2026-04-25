// src/ui/score-readout.js
//
// 3D test-tube score indicator for Level 1.
// Score (0–1) maps to liquid level; displayed as 1–100.
// Colour gradient: white → silver → gold.
// "Successful!" banner when score reaches 100.
// Cartoon-style score font, bright colours only.

import * as THREE from 'three';

// ---- Dimensions (metres) ---------------------------------------------------

const TUBE_OUTER_R    = 0.032;
const TUBE_INNER_R   = 0.027;
const TUBE_HEIGHT     = 0.40;
const TUBE_WALL       = TUBE_OUTER_R - TUBE_INNER_R;
const BULB_RADIUS     = TUBE_OUTER_R * 1.55;
const BULB_HEIGHT     = BULB_RADIUS;
const TOTAL_HEIGHT    = TUBE_HEIGHT + BULB_HEIGHT;
const LIQUID_MAX_H    = TUBE_HEIGHT - 0.015;
const RIM_FLARE       = TUBE_OUTER_R * 1.15;
const RIM_HEIGHT      = 0.006;
const NECK_T          = 0.03;
const SEGMENTS        = 36;
const GRAD_MARKS      = 5;

// ---- Colour ramp: white → silver → gold -----------------------------------

function scoreColor(t) {
  const s = Math.max(0, Math.min(1, t));
  if (s < 0.5) {
    // white (0.95, 0.95, 0.95) → silver (0.75, 0.75, 0.78)
    const f = s / 0.5;
    return new THREE.Color(
      0.95 - f * 0.20,
      0.95 - f * 0.20,
      0.95 - f * 0.17,
    );
  } else {
    // silver (0.75, 0.75, 0.78) → gold (1.0, 0.84, 0.0)
    const f = (s - 0.5) / 0.5;
    return new THREE.Color(
      0.75 + f * 0.25,
      0.75 + f * 0.09,
      0.78 - f * 0.78,
    );
  }
}

// ---- Glass tube profile (realistic chemistry test tube) ---------------------

function createTubeProfile() {
  const pts = [];
  // Bulb bottom: full hemisphere
  const bulbSteps = 12;
  for (let i = bulbSteps; i >= 0; i--) {
    const a = (i / bulbSteps) * Math.PI;
    pts.push(new THREE.Vector2(
      Math.sin(a) * BULB_RADIUS,
      BULB_HEIGHT * 0.5 - Math.cos(a) * BULB_HEIGHT * 0.5 + BULB_HEIGHT * 0.5,
    ));
  }
  // Neck transition: smooth taper from bulb to tube
  const neckSteps = 6;
  for (let i = 1; i <= neckSteps; i++) {
    const f = i / neckSteps;
    const smoothF = f * f * (3 - 2 * f); // smoothstep
    const r = BULB_RADIUS + (TUBE_OUTER_R - BULB_RADIUS) * smoothF;
    const y = BULB_HEIGHT + f * NECK_T;
    pts.push(new THREE.Vector2(r, y));
  }
  // Straight cylinder body
  pts.push(new THREE.Vector2(TUBE_OUTER_R, BULB_HEIGHT + NECK_T));
  pts.push(new THREE.Vector2(TUBE_OUTER_R, TOTAL_HEIGHT));
  // Rim flare
  pts.push(new THREE.Vector2(RIM_FLARE, TOTAL_HEIGHT));
  pts.push(new THREE.Vector2(RIM_FLARE, TOTAL_HEIGHT + RIM_HEIGHT));
  pts.push(new THREE.Vector2(TUBE_OUTER_R, TOTAL_HEIGHT + RIM_HEIGHT));
  return pts;
}

function createLiquidProfile() {
  const pts = [];
  const innerBulbR = BULB_RADIUS - TUBE_WALL;
  const innerNeckR = TUBE_INNER_R;
  const innerBulbH = BULB_HEIGHT;
  const innerNeckT = NECK_T;
  const innerTotalH = innerBulbH + innerNeckT + LIQUID_MAX_H;

  // Bulb bottom
  const bulbSteps = 12;
  for (let i = bulbSteps; i >= 0; i--) {
    const a = (i / bulbSteps) * Math.PI;
    pts.push(new THREE.Vector2(
      Math.sin(a) * innerBulbR,
      innerBulbH * 0.5 - Math.cos(a) * innerBulbH * 0.5 + innerBulbH * 0.5,
    ));
  }
  // Neck
  const neckSteps = 6;
  for (let i = 1; i <= neckSteps; i++) {
    const f = i / neckSteps;
    const smoothF = f * f * (3 - 2 * f);
    const r = innerBulbR + (innerNeckR - innerBulbR) * smoothF;
    pts.push(new THREE.Vector2(r, innerBulbH + f * innerNeckT));
  }
  // Cylinder (full height for Y-scale animation)
  pts.push(new THREE.Vector2(innerNeckR, innerTotalH));
  return pts;
}

// ---- Build -----------------------------------------------------------------

export function buildReadout({ pocketCenter, camera }) {
  const group = new THREE.Group();
  group.position.set(pocketCenter.x, pocketCenter.y + 0.55, pocketCenter.z);

  // ---- Glass tube ----------------------------------------------------------

  const tubeGeo = new THREE.LatheGeometry(createTubeProfile(), SEGMENTS);
  const tubeMat = new THREE.MeshPhysicalMaterial({
    color: 0xeef4ff,
    transparent: true,
    opacity: 0.18,
    roughness: 0.02,
    metalness: 0.0,
    transmission: 0.9,
    thickness: TUBE_WALL * 2,
    ior: 1.52,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 1.5,
  });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  group.add(tube);

  // ---- Liquid body ---------------------------------------------------------

  const liquidGeo = new THREE.LatheGeometry(createLiquidProfile(), SEGMENTS);
  const liquidMat = new THREE.MeshStandardMaterial({
    color: scoreColor(0),
    transparent: true,
    opacity: 0.88,
    roughness: 0.12,
    metalness: 0.35,
    emissive: scoreColor(0),
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide,
  });
  const liquid = new THREE.Mesh(liquidGeo, liquidMat);
  liquid.scale.y = 0.01;
  group.add(liquid);

  // ---- Meniscus (top cap of liquid) ----------------------------------------

  const meniscusGeo = new THREE.CircleGeometry(TUBE_INNER_R, SEGMENTS);
  const meniscusMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.55,
    roughness: 0.08,
    metalness: 0.4,
    side: THREE.DoubleSide,
  });
  const meniscus = new THREE.Mesh(meniscusGeo, meniscusMat);
  meniscus.rotation.x = -Math.PI / 2;
  meniscus.visible = false;
  group.add(meniscus);

  // ---- Graduation marks (1–100 scale) --------------------------------------

  const markGroup = new THREE.Group();
  for (let i = 1; i <= GRAD_MARKS; i++) {
    const t = i / (GRAD_MARKS + 1);
    const y = BULB_HEIGHT + NECK_T + t * LIQUID_MAX_H;

    const tickGeo = new THREE.PlaneGeometry(TUBE_OUTER_R * 0.4, 0.002);
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0xaabbcc,
      transparent: true,
      opacity: 0.7,
      side: THREE.DoubleSide,
    });
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.position.set(TUBE_OUTER_R * 0.65, y, 0.003);
    markGroup.add(tick);

    const sprite = createGradLabel(Math.round(t * 100));
    sprite.position.set(TUBE_OUTER_R * 2.0, y, 0);
    sprite.scale.set(0.035, 0.018, 1);
    markGroup.add(sprite);
  }
  group.add(markGroup);

  // ---- Score label (cartoon style) -----------------------------------------

  const scoreCanvas = document.createElement('canvas');
  scoreCanvas.width = 256;
  scoreCanvas.height = 256;
  const scoreCtx = scoreCanvas.getContext('2d');
  const scoreTex = new THREE.CanvasTexture(scoreCanvas);
  scoreTex.colorSpace = THREE.SRGBColorSpace;
  scoreTex.minFilter = THREE.LinearFilter;
  const scoreLabelMat = new THREE.MeshBasicMaterial({
    map: scoreTex,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const scoreLabel = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), scoreLabelMat);
  scoreLabel.position.set(0.08, TOTAL_HEIGHT * 0.5, 0);
  scoreLabel.scale.set(0.18, 0.18, 1);
  group.add(scoreLabel);

  // ---- "Successful!" banner ------------------------------------------------

  const successCanvas = document.createElement('canvas');
  successCanvas.width = 512;
  successCanvas.height = 128;
  const successCtx = successCanvas.getContext('2d');
  const successTex = new THREE.CanvasTexture(successCanvas);
  successTex.colorSpace = THREE.SRGBColorSpace;
  successTex.minFilter = THREE.LinearFilter;
  const successMat = new THREE.MeshBasicMaterial({
    map: successTex,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: false,
  });
  const successBanner = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), successMat);
  successBanner.position.set(0, TOTAL_HEIGHT + RIM_HEIGHT + 0.06, 0);
  successBanner.scale.set(0.22, 0.055, 1);
  successBanner.visible = false;
  group.add(successBanner);

  // ---- Glow ring at liquid surface -----------------------------------------

  const glowGeo = new THREE.RingGeometry(TUBE_INNER_R * 0.3, TUBE_OUTER_R * 1.3, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const glowRing = new THREE.Mesh(glowGeo, glowMat);
  glowRing.rotation.x = -Math.PI / 2;
  group.add(glowRing);

  // ---- Animated state ------------------------------------------------------

  let currentScore = 0;
  let successShown = false;

  // ---- Update function -----------------------------------------------------

  function update(scoreResult) {
    const target = Math.max(0, Math.min(1, scoreResult.total));
    currentScore += (target - currentScore) * 0.10;
    const t = currentScore;

    // Liquid level — scale the cylinder portion only
    // Bulb is always full; scale only the cylinder part
    const bulbFrac = (BULB_HEIGHT + NECK_T) / (BULB_HEIGHT + NECK_T + LIQUID_MAX_H);
    const scaleY = bulbFrac + (1 - bulbFrac) * Math.max(0.01, t);
    liquid.scale.y = scaleY;

    // Meniscus position — track top of liquid in cylinder
    const cylinderTop = BULB_HEIGHT + NECK_T + t * LIQUID_MAX_H;
    meniscus.position.y = cylinderTop;
    meniscus.visible = t > 0.03;
    meniscusMat.color.copy(scoreColor(t));

    // Colour
    const col = scoreColor(t);
    liquidMat.color.copy(col);
    liquidMat.emissive.copy(col);
    liquidMat.emissiveIntensity = 0.25 + t * 0.45;
    liquidMat.metalness = 0.2 + t * 0.5;

    // Glow ring
    glowRing.position.y = cylinderTop;
    glowRing.material.color.copy(col);
    glowRing.material.opacity = t > 0.05 ? 0.2 + Math.sin(performance.now() * 0.005) * 0.08 : 0;

    // Score label (1–100, cartoon, bright)
    paintScoreLabel(scoreCtx, scoreCanvas, scoreTex, t);

    // "Successful!" banner at score 100
    if (t >= 0.98 && !successShown) {
      successShown = true;
      successBanner.visible = true;
    }
    if (successBanner.visible) {
      paintSuccessBanner(successCtx, successCanvas, successTex, performance.now());
    }

    // Billboard toward camera
    if (camera) {
      group.lookAt(camera.position);
    }
  }

  function showBadge() {
    successShown = true;
    successBanner.visible = true;
  }

  return { group, update, showBadge };
}

// ---- Label painters --------------------------------------------------------

function paintScoreLabel(ctx, canvas, tex, t) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const points = Math.round(t * 100);

  // Score number — large, cartoon outline style, bright colours
  const col = scoreColor(t);
  const bright = new THREE.Color(col.r * 0.5 + 0.5, col.g * 0.5 + 0.5, col.b * 0.5 + 0.5);
  const fill = `rgb(${Math.round(bright.r * 255)},${Math.round(bright.g * 255)},${Math.round(bright.b * 255)})`;
  const outline = `rgb(${Math.round(col.r * 200)},${Math.round(col.g * 200)},${Math.round(col.b * 200)})`;

  ctx.font = 'bold 110px "Comic Sans MS", "Segoe Print", "Chalkboard SE", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Black outline for readability
  ctx.strokeStyle = '#0a0a14';
  ctx.lineWidth = 10;
  ctx.lineJoin = 'round';
  ctx.strokeText(points.toString(), w / 2, h / 2 - 20);

  // Coloured fill
  ctx.fillStyle = fill;
  ctx.fillText(points.toString(), w / 2, h / 2 - 20);

  // Sub-info
  ctx.font = 'bold 22px "Comic Sans MS", "Segoe Print", cursive';
  ctx.strokeStyle = '#0a0a14';
  ctx.lineWidth = 4;
  ctx.strokeText('/ 100', w / 2, h / 2 + 50);
  ctx.fillStyle = '#ccccdd';
  ctx.fillText('/ 100', w / 2, h / 2 + 50);

  tex.needsUpdate = true;
}

function paintSuccessBanner(ctx, canvas, tex, time) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  // Pulsing gold background
  const pulse = 0.9 + Math.sin(time * 0.006) * 0.1;
  ctx.fillStyle = `rgba(255, 200, 0, ${0.15 * pulse})`;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 16);
  ctx.fill();

  // Border
  ctx.strokeStyle = `rgba(255, 180, 0, ${0.7 * pulse})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(2, 2, w - 4, h - 4, 14);
  ctx.stroke();

  // Text
  ctx.font = 'bold 56px "Comic Sans MS", "Segoe Print", "Chalkboard SE", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.strokeStyle = '#0a0a14';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.strokeText('Successful!', w / 2, h / 2);
  ctx.fillStyle = '#ffd700';
  ctx.fillText('Successful!', w / 2, h / 2);

  tex.needsUpdate = true;
}

function createGradLabel(value) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 32);
  ctx.fillStyle = '#99aacc';
  ctx.font = 'bold 18px "Comic Sans MS", "Segoe Print", cursive';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(value.toString(), 32, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  return new THREE.Sprite(mat);
}

function paintBadge(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#ffd700';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0a14';
  ctx.font = 'bold 64px "Comic Sans MS", "Segoe Print", cursive';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('BEST POSE', canvas.width / 2, canvas.height / 2);
}
