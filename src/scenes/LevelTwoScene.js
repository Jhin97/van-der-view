// src/scenes/LevelTwoScene.js
//
// Level 2 (F-005): rank 5 NSAID analogs by docking each into COX-2.
//
// Spec (Issue #10 / hackathon-mvp-design.md):
//   - COX-2 + 5 ligand 选择面板
//   - 每个 ligand dock 后输出 score
//   - VR-native bar chart 展示 5 个 affinity 排名
//   - 排名顺序与 Vina ground truth 一致
//   - Narrative card：H-bond / hydrophobic 贡献分解说明
//
// UX:
//   1. COX-2 protein at centre, scaled small, with grip translate / rotate /
//      bimanual-scale (same gestures as L1).
//   2. Five colour-coded ligand pedestals fanned out in front of the user.
//      Each pedestal carries a real ligand GLB (celecoxib, rofecoxib,
//      diclofenac, naproxen, ibuprofen) that is grabbable with the trigger.
//   3. User trigger-grabs a ligand off its pedestal, drags it into the
//      glowing green pocket sphere on the protein. When the ligand crosses
//      `DOCK_TOLERANCE` (Å, in pivot-local frame), the dock fires:
//      - the ligand snaps back to its pedestal as a green-emissive "done"
//        marker (no longer grabbable);
//      - that ligand's bar in the chart fills with its Vina ΔG (ground truth);
//      - haptic burst on both controllers.
//   4. After all five are docked, an "ALL FIVE DOCKED!" success card fades
//      in/out for 3.2 s and the level transitions back to the hub.
//
// HUD bundle = camera child with the progress readout above and the brief
// panel below, identical pattern to L1.

import * as THREE from 'three';
import { loadGLB, loadJSON } from '../lib/asset-loader.js';
import { buildNarrativePanel } from '../ui/narrative-panel.js';

const ASSET_BASE = '/assets/v1';
const DATA_PATH  = '/src/data/l2-data.json';
const TELEMETRY_ENDPOINT = '/api/telemetry';

const PIVOT_SCALE     = 0.015;
const PIVOT_SCALE_MIN = 0.005;
const PIVOT_SCALE_MAX = 0.20;
const ROTATION_GAIN   = 2.5;
// Pivot translation amplification — heavily-scaled-down protein at 1:1 hand
// mapping feels sluggish to drag across the room; 2.0× makes a small wrist
// motion meaningfully relocate the molecule.
const TRANSLATION_GAIN = 2.0;

const PROTEIN_COLOR = 0x88aaff;
// Drop tolerance in pivot-local Å (PyMOL geometry units). At PIVOT_SCALE
// = 0.015 this is 0.09 m world = ~ a fist's reach.
const DOCK_TOLERANCE = 6.0;

// Pedestal arc layout — placed in front of the user but well clear of the
// protein pivot (which sits at z=-0.8). Arc Z anchored at +0.5 puts the
// ligand pedestals on the user's side of the room rather than embedded in
// the protein hull.
const PED_RADIUS    = 0.55;
const PED_ARC       = Math.PI * 0.55;
const PED_HEIGHT    = 0.85;
const PED_ARC_Z_BASE = 0.50;
const PED_ARC_Z_DEPTH = 0.25;

const LIGAND_HANDHELD_SCALE = 0.018; // ligand GLB Å → world m

async function postTelemetry(events) {
  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events),
    });
  } catch (err) { console.warn('[L2 telemetry]', err); }
}

// ---- shared helpers (same shape as LevelOneScene) -----------------------

function _amplifyQuat(delta, gain) {
  const w = Math.max(-1, Math.min(1, delta.w));
  const halfAngle = Math.acos(w);
  if (halfAngle < 1e-4) return new THREE.Quaternion();
  const sinHalf = Math.sin(halfAngle);
  const ax = delta.x / sinHalf;
  const ay = delta.y / sinHalf;
  const az = delta.z / sinHalf;
  const newHalf = halfAngle * gain;
  const sinNew = Math.sin(newHalf);
  return new THREE.Quaternion(ax * sinNew, ay * sinNew, az * sinNew, Math.cos(newHalf));
}

function _recolor(root, hex, opts = {}) {
  const { emissiveIntensity = 0.0, transparent = false, opacity = 1.0 } = opts;
  root.traverse((c) => {
    if (!c.material) return;
    const list = Array.isArray(c.material) ? c.material : [c.material];
    const cloned = list.map((m) => {
      const cm = m.clone();
      if (cm.color) cm.color.setHex(hex);
      if (cm.emissive) {
        cm.emissive.setHex(hex);
        cm.emissiveIntensity = emissiveIntensity;
      }
      cm.transparent = transparent || cm.transparent;
      if (transparent) cm.opacity = opacity;
      return cm;
    });
    c.material = Array.isArray(c.material) ? cloned : cloned[0];
  });
}

export default class LevelTwoScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.objects = [];
    this.ready = false;
    this.completed = false;
    this.onComplete = null;
    this._completeTimer = null;

    this.pedestals  = [];
    this.activated  = new Set();
    this.barChart   = null;
    this.successCard = null;

    this.lastButtons = { A: false };
    this.telemetryAccumMs = 0;

    this._gripState     = { active: 0 };
    this._uiWorldAnchor = new THREE.Vector3();

    this.spawn = { player: [0, 0, 1.5], camera: [0, 1.6, 2.2] };
  }

  async init() {
    const [cox2Surface, cox2Cartoon, pocket, vina, data, ...ligandMeshes] = await Promise.all([
      loadGLB(`${ASSET_BASE}/cox2_surface.glb`),
      loadGLB(`${ASSET_BASE}/cox2_cartoon.glb`),
      loadJSON(`${ASSET_BASE}/pocket_cox2.json`),
      loadJSON(`${ASSET_BASE}/vina_results.json`),
      loadJSON(DATA_PATH),
      // Ligand GLBs in fixed order matching l2-data.json's ligands array.
      // Loaded eagerly so the grab path is ready immediately.
      loadGLB(`${ASSET_BASE}/ligands/celecoxib.glb`),
      loadGLB(`${ASSET_BASE}/ligands/rofecoxib.glb`),
      loadGLB(`${ASSET_BASE}/ligands/diclofenac.glb`),
      loadGLB(`${ASSET_BASE}/ligands/naproxen.glb`),
      loadGLB(`${ASSET_BASE}/ligands/ibuprofen.glb`),
    ]);

    this.pocket = pocket;
    this.vinaResults = vina.runs;
    this.data = data;

    const pocketCenter = new THREE.Vector3(...pocket.pocket_center);
    this.pocketCenter = pocketCenter;

    // ---- Protein pivot ------------------------------------------------
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.0, -0.8);
    pivot.scale.setScalar(PIVOT_SCALE);
    this.ctx.scene.add(pivot);
    this.objects.push(pivot);
    this._uiWorldAnchor.copy(pivot.position);

    const offsetMatrix = new THREE.Matrix4().makeTranslation(
      -pocketCenter.x, -pocketCenter.y, -pocketCenter.z
    );
    cox2Surface.applyMatrix4(offsetMatrix);
    cox2Cartoon.applyMatrix4(offsetMatrix);
    _recolor(cox2Surface, PROTEIN_COLOR, { transparent: true, opacity: 0.55 });
    _recolor(cox2Cartoon, PROTEIN_COLOR, { emissiveIntensity: 0.15 });
    pivot.add(cox2Surface);
    pivot.add(cox2Cartoon);
    this.pivot = pivot;

    // Glowing green pocket-sphere — the visible "drop here" target.
    this._buildPocketTarget(pivot);

    // ---- Ligand pedestals (synced order with the loaded GLBs above) ---
    const ligandsByName = {
      celecoxib:  ligandMeshes[0],
      rofecoxib:  ligandMeshes[1],
      diclofenac: ligandMeshes[2],
      naproxen:   ligandMeshes[3],
      ibuprofen:  ligandMeshes[4],
    };
    this._buildLigandPedestals(data.ligands, ligandsByName);

    // ---- Bar chart (world-locked, behind protein) --------------------
    this._buildBarChart(data.ligands);

    // ---- HUD bundle (camera-child progress + brief) ------------------
    this._buildHud(data);

    // ---- Success card (camera-child, hidden until all 5 docked) ------
    this._buildSuccessCard();

    this.ready = true;
    postTelemetry([{
      session_id: window.__VDV_SESSION_ID || 'anon',
      event_type: 'level_start',
      level: 'L2',
      target: 'cox2',
      ts: Date.now(),
    }]);
  }

  _buildPocketTarget(pivot) {
    const sphereGeo = new THREE.SphereGeometry(DOCK_TOLERANCE, 24, 16);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x06d6a0,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(0, 0, 0); // pivot-local pocket centre (geometry was offset)
    pivot.add(sphere);
    this.pocketTarget = sphere;
  }

  _buildLigandPedestals(ligands, ligandsByName) {
    for (let i = 0; i < ligands.length; i++) {
      const lig = ligands[i];
      const mesh = ligandsByName[lig.name];
      if (!mesh) continue;

      const t = ligands.length === 1 ? 0.5 : i / (ligands.length - 1);
      const angle = -PED_ARC / 2 + PED_ARC * t;
      const x = Math.sin(angle) * PED_RADIUS;
      const z = PED_ARC_Z_BASE - Math.cos(angle) * PED_ARC_Z_DEPTH;

      const group = new THREE.Group();
      group.position.set(x, 0, z);

      const colorHex = parseInt(lig.color.replace('0x', ''), 16);

      // Pedestal column
      const col = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.08, PED_HEIGHT, 16),
        new THREE.MeshStandardMaterial({ color: 0x222244, roughness: 0.6 })
      );
      col.position.y = PED_HEIGHT / 2;
      group.add(col);

      // Coloured ring on top — turns green when ligand is docked
      const ringMat = new THREE.MeshBasicMaterial({
        color: colorHex, transparent: true, opacity: 0.7, side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.10, 24), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = PED_HEIGHT + 0.01;
      group.add(ring);

      // Ligand GLB sitting on the pedestal — the grabbable
      mesh.scale.setScalar(LIGAND_HANDHELD_SCALE);
      _recolor(mesh, colorHex, { emissiveIntensity: 0.40 });
      mesh.position.y = PED_HEIGHT + 0.10;
      mesh.userData.grabbable = true;
      mesh.userData.ligandId = lig.name;
      mesh.userData.ligandData = lig;
      mesh.userData.spawnPos = mesh.position.clone();
      mesh.userData.spawnQuat = mesh.quaternion.clone();
      mesh.userData.spawnScale = mesh.scale.clone();
      mesh.userData.spawnParent = group;
      group.add(mesh);

      // Name label sprite above
      const labelTex = this._makeLabelTexture(lig.name, colorHex);
      const labelMat = new THREE.SpriteMaterial({
        map: labelTex, transparent: true, depthTest: false,
      });
      const label = new THREE.Sprite(labelMat);
      label.scale.set(0.20, 0.05, 1);
      label.position.set(0, PED_HEIGHT + 0.28, 0);
      group.add(label);

      this._add(group);
      this.pedestals.push({
        group, mesh, ringMat,
        ligand: lig,
        idx: i,
      });
    }
  }

  _makeLabelTexture(text, colorHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 512, 96);
    ctx.fillStyle = 'rgba(8, 12, 28, 0.85)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 96, 12);
    ctx.fill();
    const colourStr = '#' + colorHex.toString(16).padStart(6, '0');
    ctx.fillStyle = colourStr;
    ctx.font = 'bold 56px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 48);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  _buildBarChart(ligands) {
    const group = new THREE.Group();
    group.position.set(0, 1.85, -2.3);

    const W = 1.6, H = 0.8;
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshBasicMaterial({
        color: 0x080c1c, transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      })
    );
    group.add(panel);

    // Title
    const titleTex = this._makeTextTexture(
      'COX-2 Vina ΔG (kcal/mol) — lower is tighter',
      '#9ad9ff', 30
    );
    const title = new THREE.Mesh(
      new THREE.PlaneGeometry(W * 0.95, 0.07),
      new THREE.MeshBasicMaterial({ map: titleTex, transparent: true })
    );
    title.position.set(0, H / 2 - 0.07, 0.005);
    group.add(title);

    // Sort ligands by rank for visual ordering — left = strongest binder
    const sorted = [...ligands].sort((a, b) => a.rank - b.rank);
    const minScore = Math.min(...ligands.map((l) => l.vina_kcal));
    const maxBarHeight = H * 0.65;
    const innerWidth = W * 0.9;
    const innerStart = -innerWidth / 2;
    const slot = innerWidth / sorted.length;

    const bars = [];
    for (let i = 0; i < sorted.length; i++) {
      const lig = sorted[i];
      const colorHex = parseInt(lig.color.replace('0x', ''), 16);
      const fullHeight = maxBarHeight * Math.abs(lig.vina_kcal / minScore);
      const x = innerStart + slot * (i + 0.5);
      const baseY = -H / 2 + 0.18;

      const bar = new THREE.Mesh(
        new THREE.PlaneGeometry(slot * 0.55, 1),
        new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0 })
      );
      bar.position.set(x, baseY, 0.003);
      bar.scale.y = 0.0001;
      group.add(bar);

      const labelTex = this._makeTextTexture(lig.name, '#ffffff', 22);
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(slot * 0.95, 0.05),
        new THREE.MeshBasicMaterial({ map: labelTex, transparent: true })
      );
      label.position.set(x, baseY - 0.06, 0.005);
      group.add(label);

      const valueCanvas = document.createElement('canvas');
      valueCanvas.width = 256; valueCanvas.height = 64;
      const valueTex = new THREE.CanvasTexture(valueCanvas);
      valueTex.colorSpace = THREE.SRGBColorSpace;
      const valueLabel = new THREE.Mesh(
        new THREE.PlaneGeometry(slot * 0.85, 0.05),
        new THREE.MeshBasicMaterial({ map: valueTex, transparent: true })
      );
      valueLabel.visible = false;
      valueLabel.position.z = 0.005;
      group.add(valueLabel);

      bars.push({ bar, fullHeight, baseY, valueLabel, valueCanvas, valueTex, lig });
    }

    this._add(group);
    this.barChart = { group, bars };
  }

  _makeTextTexture(text, color, fontPx) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 1024, 96);
    ctx.fillStyle = color;
    ctx.font = `${fontPx}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 512, 48);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  _fillBar(ligandName, vinaKcal) {
    const entry = this.barChart.bars.find((b) => b.lig.name === ligandName);
    if (!entry) return;
    const { bar, fullHeight, baseY, valueLabel, valueCanvas, valueTex } = entry;

    // Set the final visual state immediately. The previous version drove
    // the bar-fill animation off `requestAnimationFrame`, but `window.rAF`
    // is paused during a WebXR `immersive-vr` session on Quest, so the
    // animation never reached its terminal state and the ΔG value label
    // stayed hidden. Skip the animation; the bar simply pops to full
    // height with the value rendered (the dock-success haptic + pedestal
    // ring colour change carry the moment).
    bar.scale.y = Math.max(0.0001, fullHeight);
    bar.position.y = baseY + fullHeight / 2;
    bar.material.opacity = 0.85;

    const ctx = valueCanvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${vinaKcal.toFixed(1)}`, 128, 32);
    valueTex.needsUpdate = true;
    valueLabel.position.y = baseY + fullHeight + 0.03;
    valueLabel.visible = true;
  }

  _buildHud(data) {
    this.hud = new THREE.Group();
    this.hud.position.set(-0.45, 0.05, -1.2);
    this.ctx.camera.add(this.hud);

    // Progress card
    const canvas = document.createElement('canvas');
    canvas.width = 768; canvas.height = 256;
    this._hudCanvas = canvas;
    this._hudCtx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    this._hudTex = tex;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.20),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthTest: false, depthWrite: false,
      })
    );
    mesh.position.set(0, 0.22, 0);
    mesh.scale.setScalar(0.7);
    mesh.renderOrder = 998;
    this.hud.add(mesh);
    this._hudMesh = mesh;
    this._renderHud(null);

    // Brief panel from narrative-panel module
    this.narrativePanel = buildNarrativePanel({
      pocketCenter: { x: 0, y: 0, z: 0 },
      pocketAnnotation: { ...this.pocket, key_residues: [] },
      narrative: { brief: data.brief, score_hint: data.score_hint, residue_notes: {} },
      scoreReadoutAnchor: null,
    });
    if (this.narrativePanel.brief) {
      this.narrativePanel.group.remove(this.narrativePanel.brief);
      const b = this.narrativePanel.brief;
      b.position.set(0, -0.20, 0);
      b.scale.setScalar(0.42);
      b.material.depthTest = false;
      b.material.depthWrite = false;
      b.renderOrder = 998;
      this.hud.add(b);
    }
    this.narrativePanel.group.position.copy(this._uiWorldAnchor);
    this.ctx.scene.add(this.narrativePanel.group);
    this.objects.push(this.narrativePanel.group);
  }

  _renderHud(holdingLigand) {
    const ctx = this._hudCtx;
    ctx.clearRect(0, 0, 768, 256);
    ctx.fillStyle = 'rgba(8, 12, 28, 0.92)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 768, 256, 24);
    ctx.fill();

    ctx.fillStyle = '#9ad9ff';
    ctx.font = 'bold 44px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText('Rank the NSAIDs', 24, 18);

    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 36px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`Docked ${this.activated.size} / ${this.pedestals.length}`, 24, 78);

    if (holdingLigand) {
      ctx.fillStyle = '#06d6a0';
      ctx.font = 'bold 30px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`Holding: ${holdingLigand.name}`, 24, 138);
      ctx.fillStyle = '#aaaacc';
      ctx.font = '24px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('Drop into the green pocket sphere', 24, 178);
    } else {
      ctx.fillStyle = '#aaaacc';
      ctx.font = '26px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('Trigger-grab a ligand from the pedestals', 24, 138);
      ctx.fillText('Drop it into the green COX-2 pocket', 24, 178);
    }

    this._hudTex.needsUpdate = true;
  }

  _buildSuccessCard() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(6, 214, 160, 0.95)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 1024, 512, 36);
    ctx.fill();
    ctx.fillStyle = '#0a2e22';
    ctx.font = 'bold 96px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ALL FIVE DOCKED!', 512, 180);
    ctx.font = 'bold 48px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('NSAID ranking complete', 512, 280);
    ctx.font = '36px ui-sans-serif, system-ui, sans-serif';
    const lines = (this.data.complete_message || '').split(/(?<=[.;])\s+/).slice(0, 2);
    let yy = 360;
    for (const line of lines) { ctx.fillText(line, 512, yy); yy += 44; }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.95, 0.48),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0, depthTest: false,
      })
    );
    mesh.position.set(0, 0, -1.4);
    mesh.visible = false;
    mesh.renderOrder = 999;
    this.ctx.camera.add(mesh);
    this.successCard = mesh;
  }

  _showSuccessCard() {
    if (!this.successCard) return;
    this.successCard.visible = true;
    const startTime = performance.now();
    const fadeIn = 280, hold = 2400, fadeOut = 540;
    const total = fadeIn + hold + fadeOut;
    const animate = () => {
      const e = performance.now() - startTime;
      let opacity;
      if (e < fadeIn) opacity = e / fadeIn;
      else if (e < fadeIn + hold) opacity = 1;
      else if (e < total) opacity = 1 - (e - fadeIn - hold) / fadeOut;
      else { this.successCard.visible = false; return; }
      this.successCard.material.opacity = opacity;
      requestAnimationFrame(animate);
    };
    animate();

    const session = this.ctx.renderer.xr.getSession();
    if (session) {
      for (const src of session.inputSources) {
        src.gamepad?.hapticActuators?.[0]?.pulse(0.8, 90);
      }
    }
  }

  // ------------------------------------------------------------------
  // Update loop
  // ------------------------------------------------------------------

  update(dt, controllers) {
    if (!this.ready) return;

    this.telemetryAccumMs += dt;

    const grabbed = this._findGrabbedLigand(controllers);
    this._renderHud(grabbed?.userData?.ligandData ?? null);

    if (grabbed) this._checkDock(grabbed);

    this._handleGripGestures(controllers);
    this._handleLeftA(controllers);
  }

  _findGrabbedLigand(controllers) {
    for (const c of controllers) {
      const held = c?.userData?.held;
      if (held?.userData?.ligandId) return held;
    }
    return null;
  }

  _checkDock(ligandMesh) {
    const ligandId = ligandMesh.userData.ligandId;
    if (this.activated.has(ligandId)) return;

    const worldPos = new THREE.Vector3();
    ligandMesh.getWorldPosition(worldPos);
    // Distance to pocket-centre in pivot-LOCAL Å (geometry was offset around
    // the pocket so origin = pocket centre).
    const pivotInv = this.pivot.matrixWorld.clone().invert();
    const localPos = worldPos.clone().applyMatrix4(pivotInv);
    const dist = localPos.length();

    if (dist < DOCK_TOLERANCE) this._dockLigand(ligandMesh);
  }

  _dockLigand(ligandMesh) {
    const lig = ligandMesh.userData.ligandData;
    this.activated.add(lig.name);

    // Detach from controller (or wherever) and put back on the pedestal as
    // a non-grabbable "completed" marker.
    const spawnPos = ligandMesh.userData.spawnPos.clone();
    const spawnQuat = ligandMesh.userData.spawnQuat.clone();
    const spawnScale = ligandMesh.userData.spawnScale.clone();
    const spawnParent = ligandMesh.userData.spawnParent;

    if (ligandMesh.parent) ligandMesh.parent.remove(ligandMesh);
    spawnParent.add(ligandMesh);
    ligandMesh.position.copy(spawnPos);
    ligandMesh.quaternion.copy(spawnQuat);
    ligandMesh.scale.copy(spawnScale);
    ligandMesh.userData.grabbable = false;

    // Visual lock: green-emissive ligand + pedestal ring goes green
    ligandMesh.traverse((c) => {
      if (c.material?.emissive) {
        c.material.emissive.setHex(0x06d6a0);
        c.material.emissiveIntensity = 0.6;
      }
    });
    const ped = this.pedestals.find((p) => p.ligand.name === lig.name);
    if (ped?.ringMat) ped.ringMat.color.setHex(0x06d6a0);

    // Fill bar chart with ground-truth Vina ΔG
    this._fillBar(lig.name, lig.vina_kcal);

    // Haptic burst
    const session = this.ctx.renderer.xr.getSession();
    if (session) {
      for (const src of session.inputSources) {
        src.gamepad?.hapticActuators?.[0]?.pulse(0.5, 60);
      }
    }

    postTelemetry([{
      session_id: window.__VDV_SESSION_ID || 'anon',
      event_type: 'l2_dock',
      ligand: lig.name,
      vina_kcal: lig.vina_kcal,
      activation_index: this.activated.size,
      ts: Date.now(),
    }]);

    if (this.activated.size === this.pedestals.length && !this.completed) {
      this._showComplete();
    }
  }

  _showComplete() {
    this.completed = true;
    this._showSuccessCard();
    postTelemetry([{
      session_id: window.__VDV_SESSION_ID || 'anon',
      event_type: 'level_complete',
      level: 'L2',
      ts: Date.now(),
    }]);
    this._completeTimer = setTimeout(() => {
      if (this.onComplete) this.onComplete();
    }, 3500);
  }

  _handleLeftA(controllers) {
    const session = this.ctx.renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      if (src.handedness !== 'left' || !src.gamepad) continue;
      const aPressed = !!src.gamepad.buttons?.[4]?.pressed;
      if (aPressed && !this.lastButtons.A && this.narrativePanel?.toggleBrief) {
        this.narrativePanel.toggleBrief();
      }
      this.lastButtons.A = aPressed;
    }
  }

  _handleGripGestures(controllers) {
    const session = this.ctx.renderer.xr.getSession();
    if (!session) return;

    let leftDown = false, rightDown = false;
    let leftCtrl = null, rightCtrl = null;
    let idx = 0;
    for (const src of session.inputSources) {
      if (!src.gamepad || !src.handedness) { idx++; continue; }
      const gripPressed = !!src.gamepad.buttons?.[1]?.pressed;
      const ctrl = controllers[idx];
      if (!ctrl) { idx++; continue; }
      if (src.handedness === 'left')  { leftDown  = gripPressed; leftCtrl  = ctrl; }
      else if (src.handedness === 'right') { rightDown = gripPressed; rightCtrl = ctrl; }
      idx++;
    }

    const numActive = (leftDown ? 1 : 0) + (rightDown ? 1 : 0);
    const s = this._gripState;

    if (numActive === 0) { s.active = 0; return; }

    if (numActive === 1) {
      const ctrl = leftDown ? leftCtrl : rightCtrl;
      if (!ctrl) return;
      const ctrlPos = new THREE.Vector3();
      const ctrlQuat = new THREE.Quaternion();
      ctrl.getWorldPosition(ctrlPos);
      ctrl.getWorldQuaternion(ctrlQuat);

      if (s.active !== 1) {
        s.active = 1;
        s.ctrlStartPos = ctrlPos.clone();
        s.ctrlStartQuat = ctrlQuat.clone();
        s.pivotStartPos = this.pivot.position.clone();
        s.pivotStartQuat = this.pivot.quaternion.clone();
      } else {
        // Translation amplified so a small hand motion meaningfully drags
        // the (heavily down-scaled) protein across the bench.
        const deltaPos = ctrlPos.clone().sub(s.ctrlStartPos).multiplyScalar(TRANSLATION_GAIN);
        this.pivot.position.copy(s.pivotStartPos).add(deltaPos);
        const deltaQuat = ctrlQuat.clone().multiply(s.ctrlStartQuat.clone().invert());
        const amp = _amplifyQuat(deltaQuat, ROTATION_GAIN);
        this.pivot.quaternion.copy(s.pivotStartQuat).premultiply(amp);
        this._syncUiAnchor();
      }
    } else {
      const leftPos = new THREE.Vector3(); leftCtrl.getWorldPosition(leftPos);
      const rightPos = new THREE.Vector3(); rightCtrl.getWorldPosition(rightPos);
      const currentDist = leftPos.distanceTo(rightPos);
      const currentMid = leftPos.clone().add(rightPos).multiplyScalar(0.5);

      if (s.active !== 2) {
        s.active = 2;
        s.bimanualDistStart = currentDist;
        s.bimanualMidStart = currentMid.clone();
        s.pivotScaleStart = this.pivot.scale.x;
        s.pivotPosStart = this.pivot.position.clone();
      } else {
        const ratio = currentDist / Math.max(0.05, s.bimanualDistStart);
        const newScale = Math.max(
          PIVOT_SCALE_MIN,
          Math.min(PIVOT_SCALE_MAX, s.pivotScaleStart * ratio)
        );
        this.pivot.scale.setScalar(newScale);
        const midDelta = currentMid.clone().sub(s.bimanualMidStart).multiplyScalar(TRANSLATION_GAIN);
        this.pivot.position.copy(s.pivotPosStart).add(midDelta);
        this._syncUiAnchor();
      }
    }
  }

  _syncUiAnchor() {
    if (!this.pivot) return;
    this._uiWorldAnchor.copy(this.pivot.position);
    if (this.narrativePanel) this.narrativePanel.group.position.copy(this._uiWorldAnchor);
  }

  // ------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------

  getGrabbables() {
    return this.pedestals.map((p) => p.mesh);
  }

  _add(obj) {
    this.ctx.scene.add(obj);
    this.objects.push(obj);
  }

  destroy() {
    if (this._completeTimer) { clearTimeout(this._completeTimer); this._completeTimer = null; }

    // Detach any held ligand from controller back to its pedestal so it
    // doesn't survive into the next scene.
    for (const ped of this.pedestals) {
      if (ped.mesh && ped.mesh.parent && ped.mesh.parent !== ped.group) {
        ped.mesh.parent.remove(ped.mesh);
      }
    }

    if (this.hud?.parent) {
      this.hud.parent.remove(this.hud);
      this.hud.traverse?.((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }
    if (this.successCard?.parent) {
      this.successCard.parent.remove(this.successCard);
      if (this.successCard.geometry) this.successCard.geometry.dispose();
      if (this.successCard.material) this.successCard.material.dispose();
    }

    for (const obj of this.objects) {
      this.ctx.scene.remove(obj);
      obj.traverse?.((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }
    this.objects = [];
    this.pedestals = [];
  }
}
