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
const TELEMETRY_INTERVAL_MS = 1000;
const BEST_POSE_BADGE_FADE_MS = 5000;

const TELEMETRY_ENDPOINT = '/api/telemetry';

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
    this.ctx.scene.add(pivot);
    this.objects.push(pivot);

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
      fallbackLigand.position.copy(SPAWN_OFFSET);
      fallbackLigand.userData.grabbable = true;
      pivot.add(fallbackLigand);
      this.ligand = fallbackLigand;
    }
    this.spawnTransform = {
      position: this.ligand.position.clone(),
      quaternion: this.ligand.quaternion.clone(),
    };

    // Score readout above the pocket (in pivot-local coords -> already centred at origin).
    // Camera is null at init time; update() re-binds it once XR session starts.
    this.readout = buildReadout({
      pocketCenter: { x: 0, y: 0, z: 0 },
      camera: null,
    });
    pivot.add(this.readout.group);

    // Narrative panel
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
    pivot.add(this.narrativePanel.group);

    this.pivot = pivot;
    this.ready = true;

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

    // Re-bind the camera each frame so billboard look-at uses the live XR pose.
    if (camera) this.readout.group.userData._cam = camera;
    this.readout.update(result);
    if (camera) this.readout.group.lookAt(camera.position);
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
