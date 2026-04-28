// src/scenes/LevelOneScene.js
//
// Level 1: dock celecoxib into COX-2 active site.
// Lifecycle matches TutorialScene: init / update(dt, controllers) /
// destroy / getGrabbables.

import * as THREE from 'three';
import { loadGLB, loadJSON, extractAtomPositions } from '../lib/asset-loader.js';
import { computeScore, BEST_POSE } from '../lib/scoring.js';
import { buildReadout } from '../ui/score-readout.js';
import { buildNarrativePanel } from '../ui/narrative-panel.js';

const ASSET_BASE = '/assets/v1';
const NARRATIVE_PATH = '/src/data/l1-narrative.json';
const SPAWN_OFFSET = new THREE.Vector3(0.6, 0.0, 0.0); // ≥ 6 Å along +x relative to pocket

// Procedural geometry fallbacks when GLB assets are not available.
function displace(x, y, z) {
  return 0.12 * (Math.sin(x * 3.7 + y * 2.3) + Math.sin(y * 4.1 + z * 1.9) + Math.sin(z * 3.3 + x * 2.7)) / 3;
}

function createProteinBlob(color, openSide) {
  const geo = new THREE.IcosahedronGeometry(0.5, 4);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = displace(x, y, z);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    pos.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const indexAttr = geo.getIndex();
  const keepPositions = [];
  for (let i = 0; i < indexAttr.count; i += 3) {
    const a = indexAttr.getX(i), b = indexAttr.getX(i + 1), c = indexAttr.getX(i + 2);
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
    const isOnOpenSide = openSide === 'right' ? cx > 0 : cx < 0;
    if (!isOnOpenSide) {
      keepPositions.push(pos.getX(a), pos.getY(a), pos.getZ(a), pos.getX(b), pos.getY(b), pos.getZ(b), pos.getX(c), pos.getY(c), pos.getZ(c));
    }
  }
  const shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(keepPositions, 3));
  shellGeo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  return new THREE.Mesh(shellGeo, mat);
}

function createLigand() {
  const geo = new THREE.DodecahedronGeometry(0.1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const d = displace(x, y, z) * 0.25;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    pos.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0x332200, roughness: 0.3, metalness: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'celecoxib-fallback';
  return mesh;
}
const BEST_POSE_BADGE_FADE_MS = 5000;
// PyMOL exports geometry in Å (1 unit = 1 Å). At unit Three scale a 5 nm
// protein renders 50 m wide and the user is inside the molecule. Scale the
// whole pivot down so the protein sits desk-sized in front of the user.
// User can grip-bimanual to rescale.
const PIVOT_SCALE = 0.015;
// Grip gesture limits — see [[experience-vr-scene-transition-tutorial-snap-patterns-2026-04-25]]
// + [[prior-art-nanome]] (bimanual scale is the muscle memory we steal).
const PIVOT_SCALE_MIN = 0.005;
const PIVOT_SCALE_MAX = 0.20;
// 1:1 wrist rotation looks subtle on a heavily scaled-down protein, so
// amplify the rotational delta only (translation stays 1:1 to keep the
// "grab the world" metaphor honest).
const ROTATION_GAIN = 2.5;

// Best-pose relaxation: kernel's strict 3 Å threshold is unrealistic in VR,
// so success fires at 3 Å × BEST_POSE_RELAX while keeping the strict H-bond
// requirement (chemistry stays earned).
const BEST_POSE_RELAX = 2.5;
// Composite-score pass threshold — total ≥ this counts as a successful dock
// even without the H-bond gate (handles "very good fit, only one H-bond").
const PASS_SCORE_THRESHOLD = 0.70;
// Target-ghost colour — semi-transparent green clone of the ligand at the
// Vina-best pose (matches the dock-success accent used elsewhere).
const GHOST_COLOR = 0x06d6a0;

// Stretch the angle of a quaternion by a gain factor (preserves axis).
// Used to amplify wrist rotation when scaling pivot rotation in grip mode.
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

// Recolour every material on a loaded GLB subtree. Materials are cloned so
// shared assets (e.g. ghost ligand later cloning the real ligand) keep
// independent overrides.
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

// Layer a dark line overlay on every mesh in the subtree — the silhouette
// edges read as "sticks" against the (now translucent) surface so the
// composite gives a ball+stick impression without re-exporting geometry.
function _addStickOverlay(root, lineColorHex = 0x111122, angleThresholdDeg = 20) {
  const mats = [];
  root.traverse((c) => {
    if (!c.geometry || !(c.isMesh)) return;
    const edges = new THREE.EdgesGeometry(c.geometry, angleThresholdDeg);
    const mat = new THREE.LineBasicMaterial({
      color: lineColorHex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    mats.push(mat);
    const lines = new THREE.LineSegments(edges, mat);
    lines.userData.stickOverlay = true;
    c.add(lines);
  });
  return mats;
}

export default class LevelOneScene {
  constructor(ctx) {
    this.ctx = ctx; // { scene, player, renderer }
    this.ready = false;
    this.objects = [];     // tracked for destroy()
    this.ligand = null;
    this.spawnTransform = null; // {position: Vec3, quaternion: Quat}
    this.pocket = null;
    this.vinaBest = null;
    this.narrative = null;
    this.readout = null;
    this.narrativePanel = null;
    this.bestPoseFired = false;
    this.bestPoseFireTime = 0;
    this.dtSinceInit = 0;
    this.lastButtons = { A: false, B: false }; // edge detection on left controller
    // Scene-manager callback. Must be `null` (not undefined) so main.js's
    // loadScene() wires it: `if (next.onComplete !== undefined) next.onComplete = ...`.
    // Without this the dock-success transition silently no-ops.
    this.onComplete = null;
    this._completeTimer = null;
    // Two-handed grip gesture state — single grip = translate pivot,
    // both grips = bimanual scale + translate (Nanome-style).
    this._gripState = {
      active: 0,                  // 0, 1, or 2
      handStart: null,            // Vec3 when single-grip started
      pivotPosStart: null,
      pivotScaleStart: null,
      bimanualDistStart: null,
      bimanualMidStart: null,
    };
    // World-locked UI anchor (kept separate from pivot so brief / readout
    // stay readable regardless of model scale).
    this._uiWorldAnchor = new THREE.Vector3();
  }

  async init() {
    // renderer.xr.getCamera() requires an active XR session — defer camera
    // capture to update() so init() can run pre-session (desktop fallback).
    const [cox2Surface, cox2Cartoon, ligand, pocket, vina, narrative] = await Promise.all([
      loadGLB(`${ASSET_BASE}/cox2_surface.glb`),
      loadGLB(`${ASSET_BASE}/cox2_cartoon.glb`),
      loadGLB(`${ASSET_BASE}/ligands/celecoxib.glb`),
      loadJSON(`${ASSET_BASE}/pocket_cox2.json`),
      loadJSON(`${ASSET_BASE}/vina_results.json`),
      loadJSON(NARRATIVE_PATH),
    ]);

    // If GLB assets are missing (F-002 pipeline not yet run), fall back to
    // procedural geometry so the level is still playable.
    this.pocket = pocket || {
      pocket_center: [0, 0, 0],
      key_residues: [
        { name: 'VAL523', ca_xyz: [0.3, 0.1, -0.2], side_chain_centroid: [0.35, 0.1, -0.15] },
      ],
    };
    this.vinaBest = vina?.runs?.find((r) => r.ligand === 'celecoxib' && r.target === 'cox2')?.best_pose || {
      ligand_centroid: [0.0, 0.0, 0.0],
    };
    this.narrative = narrative || {
      steps: [
        { trigger: 'enter', title: 'COX-2 Docking', body: 'Dock celecoxib into the COX-2 active site. Grab the ligand and move it into the pocket.' },
      ],
    };

    // Build pivot — the centre of all scene objects
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.0, -0.8);
    // PDB geometry is in Å — without PIVOT_SCALE a 5 nm protein renders 50 m
    // wide and the user spawns inside the molecule. Procedural fallbacks are
    // already authored in world units, so only scale down when a real GLB
    // loaded.
    if (cox2Surface || cox2Cartoon) pivot.scale.setScalar(PIVOT_SCALE);
    this.ctx.scene.add(pivot);
    this.objects.push(pivot);
    this._uiWorldAnchor.copy(pivot.position);

    const pocketCenter = new THREE.Vector3(...this.pocket.pocket_center);
    const offsetMatrix = new THREE.Matrix4().makeTranslation(
      -pocketCenter.x, -pocketCenter.y, -pocketCenter.z
    );

    if (cox2Surface) {
      cox2Surface.applyMatrix4(offsetMatrix);
      pivot.add(cox2Surface);
    } else {
      // Procedural fallback: a displaced icosahedron for COX-2
      const blob = createProteinBlob(0xd94a4a, 'left');
      pivot.add(blob);
    }

    if (cox2Cartoon) {
      cox2Cartoon.applyMatrix4(offsetMatrix);
      pivot.add(cox2Cartoon);
    }

    if (ligand) {
      ligand.applyMatrix4(offsetMatrix);
      ligand.position.add(SPAWN_OFFSET);
      ligand.userData.grabbable = true;
      pivot.add(ligand);
      this.ligand = ligand;
    } else {
      // Procedural fallback: a small dodecahedron for celecoxib
      const fallbackLigand = createLigand();
      // SPAWN_OFFSET (0.6) is in Å for the GLB path (≈9 mm after PIVOT_SCALE).
      // The procedural protein is unscaled (~0.6 m radius), so use a much
      // larger world-unit offset and bump the ligand size for visibility from
      // the new spawn distance (~9 m away).
      fallbackLigand.position.set(2.5, 0, 0);
      fallbackLigand.scale.setScalar(5.0);
      fallbackLigand.traverse?.((c) => {
        if (c.material?.emissive) {
          c.material.emissive.setHex(0xffaa33);
          c.material.emissiveIntensity = 1.4;
        }
      });
      fallbackLigand.userData.grabbable = true;
      pivot.add(fallbackLigand);
      this.ligand = fallbackLigand;
    }
    this.spawnTransform = {
      position: this.ligand.position.clone(),
      quaternion: this.ligand.quaternion.clone(),
    };

    // Build a single HUD bundle on the camera that holds both the score
    // readout and the dismissible task brief — so they sit together in
    // the user's view rather than the brief floating in front of the
    // protein. (User: "描述框不要嵌入和模型本身，和分数看板放在一起".)
    this.hud = new THREE.Group();
    this.hud.position.set(-0.45, 0.05, -1.2);
    this.ctx.camera.add(this.hud);

    this.readout = buildReadout({
      pocketCenter: { x: 0, y: 0, z: 0 },
      camera: null,
    });
    this.readout.group.position.set(0, 0.22, 0);
    this.readout.group.scale.setScalar(0.7);
    this.hud.add(this.readout.group);

    // Narrative — keep `group` at scene root for any future world-locked
    // residue notes, but pull the brief mesh into the HUD bundle.
    this.narrativePanel = buildNarrativePanel({
      pocketCenter: { x: 0, y: 0, z: 0 },
      pocketAnnotation: {
        ...this.pocket,
        key_residues: (this.pocket.key_residues || []).map((r) => ({
          ...r,
          ca_xyz: [r.ca_xyz[0] - pocketCenter.x, r.ca_xyz[1] - pocketCenter.y, r.ca_xyz[2] - pocketCenter.z],
          side_chain_centroid: [
            r.side_chain_centroid[0] - pocketCenter.x,
            r.side_chain_centroid[1] - pocketCenter.y,
            r.side_chain_centroid[2] - pocketCenter.z,
          ],
        })),
      },
      narrative: this.narrative,
      scoreReadoutAnchor: { x: 0, y: 0.5, z: 0 },
    });
    if (this.narrativePanel.brief) {
      this.narrativePanel.group.remove(this.narrativePanel.brief);
      this.narrativePanel.brief.position.set(0, -0.20, 0);
      this.narrativePanel.brief.scale.setScalar(0.42);
      // Brief is HUD now — never let the protein occlude it.
      this.narrativePanel.brief.material.depthTest = false;
      this.narrativePanel.brief.material.depthWrite = false;
      this.narrativePanel.brief.renderOrder = 998;
      this.hud.add(this.narrativePanel.brief);
    }
    // Same for the score readout meshes — disable depth test so the
    // bundle is always visible even if the camera enters the protein.
    this.readout.group.traverse((c) => {
      if (!c.material) return;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of mats) {
        m.depthTest = false;
        m.depthWrite = false;
      }
      c.renderOrder = 998;
    });
    this.narrativePanel.group.position.copy(this._uiWorldAnchor);
    this.ctx.scene.add(this.narrativePanel.group);
    this.objects.push(this.narrativePanel.group);

    // Target ghost — semi-transparent green clone of the ligand at the
    // Vina-best docked pose. Same UX as Tutorial's ghost-overlay: tells
    // the user *where* in the protein to place the ligand. Lives inside
    // the pivot so it scales / translates / rotates with the protein.
    this._buildTargetGhost(ligand, pocketCenter, pivot);

    // Pre-build the dock-success card; shown when bestPoseFired transitions.
    this._buildSuccessCard();

    this.pivot = pivot;
    // Spawn far enough back that the player starts well clear of the protein
    // hull — the procedural fallback (no PIVOT_SCALE) is ~1 m diameter at
    // pivot z=-0.8, so push the player back to z=5 to keep ≥ 5 m clearance.
    this.spawn = { player: [0, 0, 5.0], camera: [0, 1.6, 3.0] };
    this.ready = true;

    // Snapshot current A/B state so a held button doesn't produce a phantom
    // first-frame action (P0-2).
    this._snapshotButtons();
  }

  _snapshotButtons() {
    const session = this.ctx.renderer.xr.getSession();
    if (!session) return;
    for (const source of session.inputSources) {
      if (source.handedness !== 'left' || !source.gamepad) continue;
      const buttons = source.gamepad.buttons || [];
      this.lastButtons.A = !!buttons[4]?.pressed;
      this.lastButtons.B = !!buttons[5]?.pressed;
    }
  }

  update(dt, controllers) {
    if (!this.ready || !this.ligand) return;

    this.dtSinceInit += dt;

    // Resolve current camera (XR session-bound when presenting, else null).
    const xr = this.ctx.renderer.xr;
    const camera = xr.isPresenting ? xr.getCamera() : null;

    // Collect ligand atom positions (sub-sampled vertex proxy)
    this.ligand.updateMatrixWorld(true);
    const atoms = extractAtomPositions(this.ligand);

    // Compute centroid in world space
    const centroid = new THREE.Vector3();
    if (atoms.length > 0) {
      for (const p of atoms) centroid.add(new THREE.Vector3(p.x, p.y, p.z));
      centroid.multiplyScalar(1 / atoms.length);
    } else {
      centroid.copy(this.ligand.getWorldPosition(new THREE.Vector3()));
    }

    // Convert to pivot-local for the pocket frame the spec lives in
    const pivotInverse = this.pivot.matrixWorld.clone().invert();
    const localCentroid = centroid.clone().applyMatrix4(pivotInverse);
    const localAtoms = atoms.map((p) => {
      const v = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(pivotInverse);
      return { x: v.x, y: v.y, z: v.z };
    });

    // Re-frame pocket annotation centroids to pivot-local on the fly
    const pocketCenter = new THREE.Vector3(...this.pocket.pocket_center);
    const reframedAnnotation = {
      ...this.pocket,
      key_residues: (this.pocket.key_residues || []).map((r) => ({
        ...r,
        side_chain_centroid: [
          r.side_chain_centroid[0] - pocketCenter.x,
          r.side_chain_centroid[1] - pocketCenter.y,
          r.side_chain_centroid[2] - pocketCenter.z,
        ],
      })),
    };
    const reframedVina = {
      ligand_centroid: [
        this.vinaBest.ligand_centroid[0] - pocketCenter.x,
        this.vinaBest.ligand_centroid[1] - pocketCenter.y,
        this.vinaBest.ligand_centroid[2] - pocketCenter.z,
      ],
    };

    const result = computeScore({
      ligandCentroid: { x: localCentroid.x, y: localCentroid.y, z: localCentroid.z },
      ligandAtoms: localAtoms,
      pocketAnnotation: reframedAnnotation,
      vinaBestPose: reframedVina,
    });

    // Score readout is now a child of the camera (HUD), so it always faces
    // the user without an explicit lookAt.
    this.readout.update(result);
    this.narrativePanel.update(dt, camera);

    // Relaxed best-pose: kernel's strict `BEST_POSE.distance` (3 Å) is
    // hard to nail in VR, widen by `BEST_POSE_RELAX` while keeping the
    // strict H-bond requirement so the chemistry is still earned.
    const hBondHitsCount = result.components?.hBondHits ?? 0;
    const relaxedBestPose =
      result.rawDistance < BEST_POSE.distance * BEST_POSE_RELAX &&
      hBondHitsCount >= BEST_POSE.hBondHits;
    // Composite-score pass: total >= 0.70 alone counts. Lets a user with
    // very good fit but only one H-bond still complete the level.
    const scorePass = result.total >= PASS_SCORE_THRESHOLD;

    if ((result.isBestPose || relaxedBestPose || scorePass) && !this.bestPoseFired) {
      this.bestPoseFired = true;
      this.bestPoseFireTime = this.dtSinceInit;
      this.readout.showBadge();
      this._showSuccessCard(result.total);
      // Hand off to the scene manager (markProgress + transitionToHub)
      // after the success card finishes its hold so the level actually
      // completes. Total card duration ≈ 3.2 s; fire onComplete just past
      // peak so the user reads the score before fade.
      this._completeTimer = setTimeout(() => {
        if (this.onComplete) this.onComplete();
      }, 3200);
    }

    this._handleLeftControllerButtons(controllers);
    this._handleGripGestures(controllers);
  }

  _handleGripGestures(controllers) {
    const session = this.ctx.renderer.xr.getSession();
    if (!session) return;

    let leftDown = false, rightDown = false;
    let leftCtrl = null, rightCtrl = null;

    let idx = 0;
    for (const src of session.inputSources) {
      if (!src.gamepad || !src.handedness) { idx++; continue; }
      const gripPressed = !!src.gamepad.buttons?.[1]?.pressed; // index 1 = squeeze/grip
      const ctrl = controllers[idx];
      if (!ctrl) { idx++; continue; }
      if (src.handedness === 'left') { leftDown = gripPressed; leftCtrl = ctrl; }
      else if (src.handedness === 'right') { rightDown = gripPressed; rightCtrl = ctrl; }
      idx++;
    }

    const numActive = (leftDown ? 1 : 0) + (rightDown ? 1 : 0);
    const s = this._gripState;

    if (numActive === 0) {
      s.active = 0;
      return;
    }

    if (numActive === 1) {
      // Single-hand grip — translate pivot 1:1 with hand position, rotate
      // by amplified controller rotation around the pivot's own centre.
      // Decoupled rather than matrix-relative so we can apply ROTATION_GAIN
      // to rotation only — pure 6-DOF follow felt unresponsive on a
      // 0.015-scaled protein.
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
        // Translate 1:1 with the hand
        const deltaPos = ctrlPos.clone().sub(s.ctrlStartPos);
        this.pivot.position.copy(s.pivotStartPos).add(deltaPos);

        // Amplify rotation: convert delta to axis-angle, scale angle by
        // ROTATION_GAIN, rebuild quaternion, prepend to pivot start.
        const deltaQuat = ctrlQuat.clone().multiply(s.ctrlStartQuat.clone().invert());
        const amp = _amplifyQuat(deltaQuat, ROTATION_GAIN);
        this.pivot.quaternion.copy(s.pivotStartQuat).premultiply(amp);

        this._syncUiAnchor();
      }
    } else {
      // Two-handed grip — bimanual scale + translate around the midpoint.
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
          Math.min(PIVOT_SCALE_MAX, s.pivotScaleStart * ratio),
        );
        this.pivot.scale.setScalar(newScale);
        // If the ligand is currently held by a controller (i.e. parented
        // away from `pivot`), it doesn't inherit pivot.scale anymore. Match
        // its world size to the protein so they bimanual-zoom together.
        if (this.ligand && this.ligand.parent && this.ligand.parent !== this.pivot) {
          this.ligand.scale.setScalar(newScale);
        }
        const midDelta = currentMid.clone().sub(s.bimanualMidStart);
        this.pivot.position.copy(s.pivotPosStart).add(midDelta);
        this._syncUiAnchor();
      }
    }
  }

  // Visual target: low-opacity green clone of the ligand at the Vina-best
  // docked pose. Tells the user where to overlay their grabbed ligand.
  _buildTargetGhost(ligand, pocketCenter, pivot) {
    if (!ligand) return; // GLB missing — skip ghost overlay
    if (!this.vinaBest?.ligand_centroid) return;
    const ghost = ligand.clone(true);
    ghost.traverse((c) => {
      if (!c.material) return;
      const list = Array.isArray(c.material) ? c.material : [c.material];
      const cloned = list.map((m) => {
        const cm = m.clone();
        cm.transparent = true;
        cm.opacity = 0.45;
        cm.depthWrite = false;
        if (cm.color) cm.color.setHex(GHOST_COLOR);
        if (cm.emissive) {
          cm.emissive.setHex(GHOST_COLOR);
          cm.emissiveIntensity = 1.4;
        }
        return cm;
      });
      c.material = Array.isArray(c.material) ? cloned : cloned[0];
    });
    ghost.position.set(
      this.vinaBest.ligand_centroid[0] - pocketCenter.x,
      this.vinaBest.ligand_centroid[1] - pocketCenter.y,
      this.vinaBest.ligand_centroid[2] - pocketCenter.z,
    );
    ghost.userData.grabbable = false;
    pivot.add(ghost);
    this.targetGhost = ghost;
  }

  _buildSuccessCard() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(6, 214, 160, 0.95)';
    ctx.beginPath();
    ctx.roundRect(0, 0, 1024, 512, 36);
    ctx.fill();
    ctx.fillStyle = '#0a2e22';
    ctx.font = 'bold 110px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PERFECT DOCK!', 512, 200);
    ctx.font = 'bold 56px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('COX-2 + celecoxib', 512, 320);
    ctx.font = '40px ui-sans-serif, system-ui, sans-serif';
    this._successCardCanvas = canvas;
    this._successCardCtx = ctx;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.45), mat);
    mesh.position.set(0, 0, -1.4);
    mesh.visible = false;
    mesh.renderOrder = 999;
    this.ctx.camera.add(mesh);
    this.successCard = mesh;
  }

  _showSuccessCard(scoreTotal) {
    if (!this.successCard || !this._successCardCanvas) return;
    const ctx = this._successCardCtx;
    // Repaint with current score below the title line.
    ctx.fillStyle = 'rgba(6, 214, 160, 0.95)';
    ctx.beginPath();
    ctx.roundRect(0, 360, 1024, 152, 24);
    ctx.fill();
    ctx.fillStyle = '#0a2e22';
    ctx.font = 'bold 56px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Score: ${scoreTotal.toFixed(2)} / 1.00`, 512, 440);
    if (this.successCard.material.map) this.successCard.material.map.needsUpdate = true;

    this.successCard.visible = true;
    const startTime = performance.now();
    const fadeIn = 280;
    const hold = 2400;
    const fadeOut = 540;
    const total = fadeIn + hold + fadeOut;
    const animate = () => {
      const elapsed = performance.now() - startTime;
      let opacity;
      if (elapsed < fadeIn) opacity = elapsed / fadeIn;
      else if (elapsed < fadeIn + hold) opacity = 1;
      else if (elapsed < total) opacity = 1 - (elapsed - fadeIn - hold) / fadeOut;
      else { this.successCard.visible = false; return; }
      this.successCard.material.opacity = opacity;
      requestAnimationFrame(animate);
    };
    animate();

    // Haptic burst on both controllers
    const session = this.ctx.renderer.xr.getSession();
    if (session) {
      for (const src of session.inputSources) {
        const a = src.gamepad?.hapticActuators?.[0];
        a?.pulse(0.8, 90);
      }
    }
  }

  _syncUiAnchor() {
    // Keep the world-locked narrative brief attached to the pivot's WORLD
    // position so panning the molecule with grip brings the brief along
    // but doesn't rescale it. Readout is now HUD-locked (child of camera)
    // and intentionally does NOT follow.
    if (!this.pivot) return;
    this._uiWorldAnchor.copy(this.pivot.position);
    if (this.narrativePanel) this.narrativePanel.group.position.copy(this._uiWorldAnchor);
  }

  _handleLeftControllerButtons(controllers) {
    const session = this.ctx.renderer.xr.getSession();
    if (!session) return;
    for (const source of session.inputSources) {
      if (source.handedness !== 'left' || !source.gamepad) continue;
      const buttons = source.gamepad.buttons || [];
      // Quest 3S: button index 4 = A (lower), 5 = B (upper) on left controller
      // (exact indices: trigger=0, squeeze=1, thumbstick=3, A=4, B=5)
      const aPressed = !!buttons[4]?.pressed;
      const bPressed = !!buttons[5]?.pressed;

      if (aPressed && !this.lastButtons.A) {
        // Toggle (was dismiss-only) so users can recall the brief.
        this.narrativePanel.toggleBrief();
      }
      if (bPressed && !this.lastButtons.B) {
        this._redock();
      }
      this.lastButtons.A = aPressed;
      this.lastButtons.B = bPressed;
    }
  }

  _redock() {
    if (!this.ligand || !this.spawnTransform) return;
    // If the ligand is currently held by a controller, detach it first.
    if (this.ligand.parent && this.ligand.parent !== this.pivot) {
      this.pivot.attach(this.ligand);
    }
    this.ligand.position.copy(this.spawnTransform.position);
    this.ligand.quaternion.copy(this.spawnTransform.quaternion);
    this.bestPoseFired = false;
  }

  destroy() {
    if (this._completeTimer) { clearTimeout(this._completeTimer); this._completeTimer = null; }
    // The grabbable ligand may have been trigger-grabbed at scene end —
    // in that case `controller.attach(ligand)` reparented it onto the
    // (persistent) controller node, NOT pivot, so pivot disposal won't
    // clean it up and the mesh persists into the next scene.
    if (this.ligand && this.ligand.parent) {
      this.ligand.parent.remove(this.ligand);
      this.ligand.traverse?.((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }
    // HUD bundle (score readout + brief + success card) is parented to the
    // camera, not the scene — explicit detach so it doesn't survive into
    // the next scene.
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
    this.ready = false;
  }

  getGrabbables() {
    return this.ligand ? [this.ligand] : [];
  }
}
