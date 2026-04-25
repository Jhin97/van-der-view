// src/ui/score-readout.js
//
// 3D test-tube score indicator for Level 1.
// Score (0–1) is the liquid level inside the tube.
// Colour gradient: red → orange → yellow → green → cyan → blue → purple.
// Includes: glass tube, liquid body, meniscus cap, graduation marks,
//           score label, best-pose badge.

import * as THREE from 'three';

// ---- Dimensions (metres) ---------------------------------------------------

const TUBE_RADIUS      = 0.028;
const TUBE_HEIGHT      = 0.35;
const TUBE_BOTTOM_R    = TUBE_RADIUS * 0.85; // slightly rounded bottom
const GLASS_THICKNESS  = 0.004;
const LIQUID_MAX_H     = TUBE_HEIGHT - 0.03; // leave air gap at top
const RIM_HEIGHT       = 0.008;
const RIM_RADIUS       = TUBE_RADIUS * 1.18;
const GRAD_MARKS       = 5;   // 0, 0.25, 0.5, 0.75, 1.0
const SEGMENTS         = 32;

// ---- Colour ramp (red → purple rainbow) -----------------------------------

function scoreColor(t) {
  // Hue: 0 (red) → 300 (purple) in CSS HSL space
  const hue = Math.max(0, Math.min(1, t)) * 300;
  return new THREE.Color().setHSL(hue / 360, 0.9, 0.5);
}

// ---- Geometry helpers ------------------------------------------------------

function createTubeGeometry(radius, height, bottomRadius, segs) {
  // Lathe profile: bottom cap → cylinder wall → top rim
  const points = [];
  // Bottom cap (half-circle)
  const capSteps = 6;
  for (let i = capSteps; i >= 0; i--) {
    const a = (i / capSteps) * Math.PI * 0.5;
    points.push(new THREE.Vector2(
      Math.cos(a) * bottomRadius,
      Math.sin(a) * bottomRadius
    ));
  }
  // Cylinder wall
  points.push(new THREE.Vector2(radius, height));
  // Rim flare
  points.push(new THREE.Vector2(RIM_RADIUS, height));
  points.push(new THREE.Vector2(RIM_RADIUS, height + RIM_HEIGHT));
  points.push(new THREE.Vector2(radius, height + RIM_HEIGHT));

  return new THREE.LatheGeometry(points, segs);
}

function createLiquidGeometry(radius, maxHeight, segs) {
  // Profile: bottom cap → tall cylinder (will be scaled.y at runtime)
  const innerR = radius - GLASS_THICKNESS;
  const bottomR = innerR * 0.82;
  const points = [];
  const capSteps = 6;
  for (let i = capSteps; i >= 0; i--) {
    const a = (i / capSteps) * Math.PI * 0.5;
    points.push(new THREE.Vector2(
      Math.cos(a) * bottomR,
      Math.sin(a) * bottomR
    ));
  }
  // Wall — full height; we scale Y to match liquid level
  points.push(new THREE.Vector2(innerR, maxHeight));

  return new THREE.LatheGeometry(points, segs);
}

// ---- Build -----------------------------------------------------------------

/**
 * Build the test-tube score readout.
 * @returns {{ group, update, showBadge }}
 */
export function buildReadout({ pocketCenter, camera }) {
  const group = new THREE.Group();
  group.position.set(pocketCenter.x, pocketCenter.y + 0.5, pocketCenter.z);

  // ---- Glass tube ----------------------------------------------------------

  const tubeGeo = createTubeGeometry(TUBE_RADIUS, TUBE_HEIGHT, TUBE_BOTTOM_R, SEGMENTS);
  const tubeMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.85,
    thickness: GLASS_THICKNESS,
    ior: 1.5,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const tube = new THREE.Mesh(tubeGeo, tubeMat);
  tube.position.y = TUBE_HEIGHT * 0.5;
  group.add(tube);

  // ---- Liquid body ---------------------------------------------------------

  const liquidGeo = createLiquidGeometry(TUBE_RADIUS, LIQUID_MAX_H, SEGMENTS);
  const liquidMat = new THREE.MeshStandardMaterial({
    color: scoreColor(0),
    transparent: true,
    opacity: 0.82,
    roughness: 0.15,
    metalness: 0.2,
    emissive: scoreColor(0),
    emissiveIntensity: 0.25,
    side: THREE.DoubleSide,
  });
  const liquid = new THREE.Mesh(liquidGeo, liquidMat);
  // Position so bottom of liquid is at the bottom of the tube
  // Lathe Y goes 0 → LIQUID_MAX_H; we want bottom at 0 (tube bottom)
  liquid.position.y = 0; // bottom of tube
  // Initially empty (scale.y ≈ 0)
  liquid.scale.y = 0.01;
  group.add(liquid);

  // ---- Meniscus (top cap of liquid) ----------------------------------------

  const meniscusGeo = new THREE.CircleGeometry(TUBE_RADIUS - GLASS_THICKNESS, SEGMENTS);
  const meniscusMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.5,
    roughness: 0.1,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const meniscus = new THREE.Mesh(meniscusGeo, meniscusMat);
  meniscus.rotation.x = -Math.PI / 2;
  meniscus.visible = false;
  group.add(meniscus);

  // ---- Graduation marks ----------------------------------------------------

  const markGroup = new THREE.Group();
  for (let i = 1; i <= GRAD_MARKS; i++) {
    const t = i / (GRAD_MARKS + 1);
    const y = t * LIQUID_MAX_H;

    // Small horizontal tick
    const tickGeo = new THREE.PlaneGeometry(TUBE_RADIUS * 0.5, 0.002);
    const tickMat = new THREE.MeshBasicMaterial({
      color: 0x8888aa,
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
    });
    const tick = new THREE.Mesh(tickGeo, tickMat);
    tick.position.set(TUBE_RADIUS * 0.6, y, 0.002);
    markGroup.add(tick);

    // Label
    const labelSprite = createTinyLabel((t * 100).toFixed(0));
    labelSprite.position.set(TUBE_RADIUS * 1.6, y, 0);
    labelSprite.scale.set(0.04, 0.015, 1);
    markGroup.add(labelSprite);
  }
  group.add(markGroup);

  // ---- Score label (top) ---------------------------------------------------

  const scoreLabel = createScoreLabel('Score: 0.000');
  scoreLabel.position.set(0, TUBE_HEIGHT + RIM_HEIGHT + 0.04, 0);
  scoreLabel.scale.set(0.14, 0.035, 1);
  group.add(scoreLabel);

  // ---- Best-pose badge -----------------------------------------------------

  const badgeCanvas = document.createElement('canvas');
  badgeCanvas.width = 512;
  badgeCanvas.height = 128;
  paintBadge(badgeCanvas);
  const badgeTex = new THREE.CanvasTexture(badgeCanvas);
  badgeTex.colorSpace = THREE.SRGBColorSpace;
  const badgeMat = new THREE.MeshBasicMaterial({
    map: badgeTex,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.035), badgeMat);
  badge.position.set(0, -0.04, 0);
  badge.visible = false;
  group.add(badge);

  // ---- Glow ring at liquid surface -----------------------------------------

  const glowGeo = new THREE.RingGeometry(TUBE_RADIUS * 0.5, TUBE_RADIUS * 1.0, 32);
  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xff0000,
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
  let targetScore = 0;

  // ---- Update function -----------------------------------------------------

  function update(scoreResult) {
    targetScore = Math.max(0, Math.min(1, scoreResult.total));

    // Smooth interpolation
    currentScore += (targetScore - currentScore) * 0.12;
    const t = currentScore;

    // Liquid level
    const levelH = Math.max(0.005, t * LIQUID_MAX_H);
    liquid.scale.y = t < 0.01 ? 0.01 : t;

    // Meniscus position (top of liquid)
    const innerR = TUBE_RADIUS - GLASS_THICKNESS;
    const bottomR = innerR * 0.82;
    const capH = bottomR; // approximate height of rounded bottom
    const meniscusY = capH + (levelH - capH) * Math.min(1, t * 2);
    meniscus.position.y = meniscusY;
    meniscus.visible = t > 0.02;

    // Colour
    const col = scoreColor(t);
    liquidMat.color.copy(col);
    liquidMat.emissive.copy(col);
    liquidMat.emissiveIntensity = 0.2 + t * 0.3;

    // Glow ring
    glowRing.position.y = meniscusY;
    glowRing.material.color.copy(col);
    glowRing.material.opacity = t > 0.05 ? 0.15 + Math.sin(performance.now() * 0.004) * 0.05 : 0;

    // Score label
    updateScoreLabel(scoreLabel, scoreResult.total, scoreResult.components);

    // Billboard toward camera
    if (camera) {
      group.lookAt(camera.position);
    }
  }

  function showBadge() {
    badge.visible = true;
  }

  return { group, update, showBadge };
}

// ---- Tiny text helpers -----------------------------------------------------

function createTinyLabel(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 64, 32);
  ctx.fillStyle = '#8888aa';
  ctx.font = 'bold 20px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 32, 16);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  return new THREE.Sprite(mat);
}

function createScoreLabel(initialText) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthTest: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.userData._canvas = canvas;
  mesh.userData._ctx = ctx;
  mesh.userData._tex = tex;
  return mesh;
}

function updateScoreLabel(labelMesh, total, components) {
  const ctx = labelMesh.userData._ctx;
  const canvas = labelMesh.userData._canvas;
  const tex = labelMesh.userData._tex;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Background
  ctx.fillStyle = 'rgba(10, 10, 24, 0.85)';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 8);
  ctx.fill();

  // Score
  const col = scoreColor(total);
  const css = `rgb(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)})`;
  ctx.fillStyle = css;
  ctx.font = 'bold 44px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total.toFixed(3), w / 2, h / 2 - 8);

  // Sub-label
  ctx.fillStyle = '#8888aa';
  ctx.font = '16px ui-sans-serif, system-ui, sans-serif';
  ctx.fillText(
    `dist ${components.rawDistance?.toFixed(2) || 0}  H-bonds ${components.hBondHits || 0}  clashes ${components.clashes || 0}`,
    w / 2, h / 2 + 24
  );

  tex.needsUpdate = true;
}

function paintBadge(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#06d6a0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0a0a14';
  ctx.font = 'bold 64px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText('BEST POSE', canvas.width / 2, canvas.height / 2);
}
