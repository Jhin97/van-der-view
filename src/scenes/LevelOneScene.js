// src/scenes/LevelOneScene.js
//
// Level 1: dock celecoxib into COX-2 active site.
// Lifecycle matches TutorialScene: init / update(dt, controllers) /
// destroy / getGrabbables.

import * as THREE from 'three';
import { loadGLB, loadJSON, extractAtomPositions } from '../lib/asset-loader.js';
import { computeScore } from '../lib/scoring.js';
import { buildReadout } from '../ui/score-readout.js';
import { buildNarrativePanel } from '../ui/narrative-panel.js';

const ASSET_BASE = '/assets/v1';
const NARRATIVE_PATH = '/src/data/l1-narrative.json';
const SPAWN_OFFSET = new THREE.Vector3(0.6, 0.0, 0.0); // ≥ 6 Å along +x relative to pocket
const TELEMETRY_INTERVAL_MS = 1000;
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

const TELEMETRY_ENDPOINT = '/api/telemetry';

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

async function postTelemetry(events) {
  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events),
    });
  } catch (err) {
    console.warn('[L1 telemetry]', err);
  }
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
    this.telemetryAccumMs = 0;
    this.dtSinceInit = 0;
    this.redockCount = 0;
    this.lastButtons = { A: false, B: false }; // edge detection on left controller
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

    this.pocket = pocket;
    this.vinaBest = vina.runs.find((r) => r.ligand === 'celecoxib' && r.target === 'cox2')?.best_pose;
    if (!this.vinaBest) {
      throw new Error('LevelOneScene: vina_results.json missing (celecoxib, cox2) entry');
    }
    this.narrative = narrative;

    const pocketCenter = new THREE.Vector3(...pocket.pocket_center);

    // Pivot holds the protein + ligand. Scale it down so the user sees the
    // whole molecule in front of them rather than being inside it.
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.0, -0.8); // 0.8 m forward of player at standing height
    pivot.scale.setScalar(PIVOT_SCALE);
    this.ctx.scene.add(pivot);
    this.objects.push(pivot);
    this._uiWorldAnchor.copy(pivot.position);

    const offsetMatrix = new THREE.Matrix4().makeTranslation(
      -pocketCenter.x, -pocketCenter.y, -pocketCenter.z
    );
    cox2Surface.applyMatrix4(offsetMatrix);
    cox2Cartoon.applyMatrix4(offsetMatrix);
    pivot.add(cox2Surface);
    pivot.add(cox2Cartoon);

    // Ligand spawn — translate same way so it lives in the same frame
    ligand.applyMatrix4(offsetMatrix);
    ligand.position.add(SPAWN_OFFSET);
    ligand.userData.grabbable = true;
    pivot.add(ligand);
    this.ligand = ligand;
    this.spawnTransform = {
      position: ligand.position.clone(),
      quaternion: ligand.quaternion.clone(),
    };

    // Score readout — head-locked HUD, child of camera so it stays in the
    // top-left of the user's view regardless of model translation /
    // rotation / scale. (User asked: "scoring 表格固定在屏幕的左上角不
    // 要让它参与模型移动等操作".)
    this.readout = buildReadout({
      pocketCenter: { x: 0, y: 0, z: 0 },
      camera: null,
    });
    this.readout.group.position.set(-0.45, 0.30, -1.2);
    this.readout.group.scale.setScalar(0.7);
    this.ctx.camera.add(this.readout.group);
    // Not pushed to `this.objects` — destroy handles HUD detach explicitly.

    // Narrative panel — also world-locked. Skip residue side-notes for now;
    // attaching them in pivot-local frame would also shrink them, and the
    // task brief is the critical onboarding text.
    this.narrativePanel = buildNarrativePanel({
      pocketCenter: { x: 0, y: 0, z: 0 },
      pocketAnnotation: { ...pocket, key_residues: [] },
      narrative,
      scoreReadoutAnchor: { x: 0, y: 0.5, z: 0 },
    });
    this.narrativePanel.group.position.copy(this._uiWorldAnchor);
    this.ctx.scene.add(this.narrativePanel.group);
    this.objects.push(this.narrativePanel.group);

    // Target ghost — semi-transparent green clone of the ligand at the
    // Vina-best docked pose. Same UX as Tutorial's ghost-overlay: tells
    // the user *where* in the protein to place the ligand. Lives inside
    // the pivot so it scales / translates / rotates with the protein.
    this._buildTargetGhost(ligand, pocketCenter, pivot);

    this.pivot = pivot;
    // Spawn even farther so the user starts with a full view of the protein.
    this.spawn = { player: [0, 0, 1.5], camera: [0, 1.6, 2.2] };
    this.ready = true;

    // Snapshot current A/B state so a held button doesn't produce a phantom
    // first-frame action (P0-2).
    this._snapshotButtons();

    postTelemetry([
      {
        session_id: window.__VDV_SESSION_ID || crypto.randomUUID(),
        event_type: 'level_start',
        level: 'L1',
        target: 'cox2',
        ligand: 'celecoxib',
        ts: Date.now(),
      },
    ]);
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
    this.telemetryAccumMs += dt;

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

    if (result.isBestPose && !this.bestPoseFired) {
      this.bestPoseFired = true;
      this.bestPoseFireTime = this.dtSinceInit;
      this.readout.showBadge();
      postTelemetry([
        {
          session_id: window.__VDV_SESSION_ID || 'anon',
          event_type: 'best_pose_hit',
          level: 'L1',
          total: result.total,
          rawDistance: result.rawDistance,
          time_to_hit_ms: this.dtSinceInit,
          ts: Date.now(),
        },
      ]);
    }

    if (this.telemetryAccumMs >= TELEMETRY_INTERVAL_MS) {
      this.telemetryAccumMs = 0;
      postTelemetry([
        {
          session_id: window.__VDV_SESSION_ID || 'anon',
          event_type: 'score_update',
          level: 'L1',
          total: result.total,
          components: result.components,
          rawDistance: result.rawDistance,
          ts: Date.now(),
        },
      ]);
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
        const midDelta = currentMid.clone().sub(s.bimanualMidStart);
        this.pivot.position.copy(s.pivotPosStart).add(midDelta);
        this._syncUiAnchor();
      }
    }
  }

  // Visual target: low-opacity green clone of the ligand at the Vina-best
  // docked pose. Tells the user where to overlay their grabbed ligand.
  _buildTargetGhost(ligand, pocketCenter, pivot) {
    if (!this.vinaBest?.ligand_centroid) return;
    const ghost = ligand.clone(true);
    ghost.traverse((c) => {
      if (!c.material) return;
      // Materials must be cloned so we don't bleed our overrides into the
      // grabbable real ligand.
      c.material = Array.isArray(c.material)
        ? c.material.map((m) => {
            const cm = m.clone();
            cm.transparent = true;
            cm.opacity = 0.30;
            cm.depthWrite = false;
            if (cm.emissive) {
              cm.emissive.setHex(0x06d6a0);
              cm.emissiveIntensity = 0.7;
            }
            return cm;
          })
        : (() => {
            const cm = c.material.clone();
            cm.transparent = true;
            cm.opacity = 0.30;
            cm.depthWrite = false;
            if (cm.emissive) {
              cm.emissive.setHex(0x06d6a0);
              cm.emissiveIntensity = 0.7;
            }
            return cm;
          })();
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
        this.narrativePanel.dismissBrief();
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
    this.redockCount += 1;
    postTelemetry([
      {
        session_id: window.__VDV_SESSION_ID || 'anon',
        event_type: 'redock_count',
        level: 'L1',
        count: this.redockCount,
        ts: Date.now(),
      },
    ]);
  }

  destroy() {
    // HUD readout is parented to the camera, not the scene — explicit detach
    // so it doesn't survive into the next scene.
    if (this.readout?.group?.parent) {
      this.readout.group.parent.remove(this.readout.group);
      this.readout.group.traverse?.((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
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
