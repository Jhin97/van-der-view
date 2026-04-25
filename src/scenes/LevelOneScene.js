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

    this.pocket = pocket;
    this.vinaBest = vina.runs.find((r) => r.ligand === 'celecoxib' && r.target === 'cox2')?.best_pose;
    if (!this.vinaBest) {
      throw new Error('LevelOneScene: vina_results.json missing (celecoxib, cox2) entry');
    }
    this.narrative = narrative;

    const pocketCenter = new THREE.Vector3(...pocket.pocket_center);

    // Centre everything around pocket so the user starts looking at the action.
    const pivot = new THREE.Group();
    pivot.position.set(0, 1.0, -0.8); // 0.8 m forward of player at standing height
    this.ctx.scene.add(pivot);
    this.objects.push(pivot);

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
        ...pocket,
        // Shift residue Cα to pivot-local frame
        key_residues: (pocket.key_residues || []).map((r) => ({
          ...r,
          ca_xyz: [r.ca_xyz[0] - pocketCenter.x, r.ca_xyz[1] - pocketCenter.y, r.ca_xyz[2] - pocketCenter.z],
          side_chain_centroid: [
            r.side_chain_centroid[0] - pocketCenter.x,
            r.side_chain_centroid[1] - pocketCenter.y,
            r.side_chain_centroid[2] - pocketCenter.z,
          ],
        })),
      },
      narrative,
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

  update(/* dt, controllers */) {
    // Filled in Task 7
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
