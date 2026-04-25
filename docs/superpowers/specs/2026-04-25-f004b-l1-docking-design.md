# F-004b L1 Docking + Scoring Core — Design Spec

**Date**: 2026-04-25
**Status**: Brainstormed, awaiting user review
**Tracks**: Issue #16 (F-004b, team:frontend, p0)
**Spec reference**: `docs/superpowers/specs/2026-04-25-hackathon-mvp-design.md`
**Asset spec reference**: `docs/superpowers/specs/2026-04-25-f002-asset-pipeline-design.md`
**Authoring**: User dialogue + Claude Opus 4.7 via `superpowers:brainstorming`

---

## Goal

Land **Level 1**: a single VR docking task where the user grabs **celecoxib** with a Quest 3 controller and snaps it into the **COX-2** binding pocket while watching a real-time score react to position, residue contacts, and steric clashes. Extract scoring as a pure-function module so **F-005 (L2 ranking)** and **F-006 (L3 selectivity)** can plug in without forking logic. Frame the task with an **in-scene narrative panel** that explains the biology (inhibit COX-2 to block prostaglandin synthesis) and the engineering (maximize shape complementarity + interaction quality) so the level reads as a chemistry mission, not a generic peg-in-hole game. The narrative content is data-driven JSON, designed to be reused (and later voiced) by F-008 without rewrites.

## Non-goals

- F-004a Game Hub (already split into Issue #15; L1 boots directly after the tutorial in this PR's scope)
- L2 / L3 / Tutorial scenes (separate issues)
- F-008 Story wrapper TTS / Dr. Chen voice production (Issue #13). F-004b authors the *task framing* narrative content as static JSON; F-008 will later read the same JSON for TTS playback.
- Click-to-confirm pose alternative loop (streaming only this time; spec already documents the fallback as a future option)
- Multi-ligand simultaneous docking
- 2D HUD overlays — score readout lives in-scene as a floating billboard (embodied cognition rationale)
- Real-time AutoDock Vina recomputation (we use pre-baked `vina_results.json`)

## Constraints

| Constraint | Detail |
|------------|--------|
| **Platform** | Quest 3 (WebXR), via `adb reverse tcp:5173 tcp:5173`; desktop fallback for dev only |
| **Stack** | Vite + Three.js (^0.169) + WebXR API; no new runtime deps required |
| **Asset source** | `public/assets/v1/` produced by F-002 pipeline (committed binaries) |
| **Score formula** | Locked from MVP spec: `α·(1 − d/d_max) + β·hBondHits − γ·clashes`, `α=0.6, β=0.3, γ=0.1`, `d_max=10 Å`; H-bond cutoff 3.5 Å, clash cutoff 1.0 Å |
| **Best-pose threshold** | `distance < 3.0 Å` AND `hBondHits ≥ 2` (locked from Issue #16 acceptance criteria) |
| **Cadence** | Streaming — score recomputed every frame (60 Hz target on Quest 3); telemetry sampled at 1 Hz to avoid spam |
| **Time** | < 8 h end-to-end including review/test loops, fits inside the 24 h hackathon budget |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  src/main.js  (existing — F-001 / F-003)                             │
│   - WebXR session, controllers, scene manager (loadScene)            │
│   - Pre-survey  ──>  TutorialScene  ──>  [F-004b] LevelOneScene  ──> │
│                                                          finish ──>  │
│                                                          post-survey │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  │ loadScene(LevelOneScene)
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  src/scenes/LevelOneScene.js   (NEW)                                  │
│                                                                       │
│   constructor(ctx)   ctx = { scene, player, renderer }                │
│   init()             load assets, position ligand, build readout      │
│   update(dt, ctrls)  per-frame: score recompute + UI update           │
│   destroy()          remove all added meshes                          │
│   getGrabbables()    [ligandRoot]                                     │
│                                                                       │
│   private:                                                            │
│     _loadAssets()    asset-loader → glb + json                        │
│     _spawnLigand()   place celecoxib offset from pocket               │
│     _onBestPose()    fire once, badge + telemetry + audio             │
│     _onLevelFinish() emit level_complete, advance                     │
└─────────────────────────────────────────────────────────────────────┘
                                  │
              ┌──────────────┬───────────┴───┬───────────────┬─────────────────┐
              ▼              ▼               ▼               ▼                 ▼
  ┌─────────────────┐  ┌──────────────┐  ┌────────────────┐  ┌──────────────┐  ┌──────────────────┐
  │ src/lib/asset-  │  │ src/lib/     │  │ src/ui/        │  │ src/ui/      │  │ src/data/        │
  │  loader.js (NEW)│  │ scoring.js   │  │ score-         │  │ narrative-   │  │ l1-narrative.json│
  │                 │  │  (NEW)       │  │ readout.js     │  │ panel.js     │  │ (NEW)            │
  │ loadGLB(url)    │  │              │  │  (NEW)         │  │  (NEW)       │  │                  │
  │ loadJSON(url)   │  │ computeScore │  │                │  │              │  │ task brief +     │
  │ extractAtomXYZ  │  │  ({...}) →   │  │ buildReadout   │  │ buildPanel   │  │ residue notes +  │
  │                 │  │  { total,    │  │ updateReadout  │  │ dismissBrief │  │ score-meaning    │
  │ shared L1/L2/L3 │  │    isBestPose│  │ showBadge      │  │ anchorNote   │  │ hint             │
  │                 │  │    ... }     │  │                │  │              │  │                  │
  │                 │  │              │  │ billboard +    │  │ task brief + │  │ TTS-friendly:    │
  │                 │  │              │  │ colour grad    │  │ residue side │  │ each block ≤60s  │
  │                 │  │              │  │                │  │ notes        │  │ at 130 wpm       │
  └─────────────────┘  └──────────────┘  └────────────────┘  └──────────────┘  └──────────────────┘
```

---

## Module contracts

### `src/lib/asset-loader.js`

```javascript
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const loader = new GLTFLoader();
const draco = new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
loader.setDRACOLoader(draco);

export function loadGLB(url) {
  return new Promise((resolve, reject) => {
    loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject);
  });
}

export async function loadJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return res.json();
}

// Walk a loaded ligand .glb and return world-space atom positions.
// (Surface-only mesh → vertices act as proxy atom samples for clash check.)
export function extractAtomPositions(rootObj) {
  const positions = [];
  rootObj.traverse((child) => {
    if (child.isMesh && child.geometry) {
      const pos = child.geometry.attributes.position;
      const m = child.matrixWorld;
      const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        positions.push(v.clone());
      }
    }
  });
  return positions;
}
```

> *Note* — DRACO decoder path uses Google's CDN by default. We can self-host for offline demo if needed; for hackathon localhost dev with internet access this works.

### `src/lib/scoring.js`

```javascript
import * as THREE from 'three';

export const DEFAULT_WEIGHTS    = { alpha: 0.6, beta: 0.3, gamma: 0.1 };
export const DEFAULT_THRESHOLDS = { hBondDist: 3.5, clashDist: 1.0, dMax: 10.0 };
export const BEST_POSE          = { distance: 3.0, hBondHits: 2 };

/**
 * Compute heuristic docking score. Pure function — no side effects.
 *
 * @param {object} args
 * @param {THREE.Vector3} args.ligandCentroid  — current ligand centre (world)
 * @param {THREE.Vector3[]} args.ligandAtoms   — sampled atom/vertex positions (world)
 * @param {object} args.pocketAnnotation       — parsed pocket_cox{1,2}.json
 * @param {object} args.vinaBestPose           — best_pose dict from vina_results.json
 * @param {object} [args.weights]              — { alpha, beta, gamma }
 * @param {object} [args.thresholds]           — { hBondDist, clashDist, dMax }
 * @returns {{
 *   total: number,
 *   components: { distance: number, hBondHits: number, clashes: number },
 *   isBestPose: boolean,
 *   rawDistance: number
 * }}
 */
export function computeScore({
  ligandCentroid,
  ligandAtoms,
  pocketAnnotation,
  vinaBestPose,
  weights    = DEFAULT_WEIGHTS,
  thresholds = DEFAULT_THRESHOLDS,
}) { /* impl */ }
```

**Algorithm**:

1. `rawDistance` = euclid(ligandCentroid, `vinaBestPose.ligand_centroid`).
2. `distanceTerm` = `1 - clamp(rawDistance / thresholds.dMax, 0, 1)`.
3. `hBondHits` = count of `pocketAnnotation.key_residues` whose **side_chain_centroid** is within `thresholds.hBondDist` of any ligand atom *and* whose `role` includes `'h_bond'`.
4. `clashes` = count of ligand atoms whose distance to **any** key residue side-chain centroid is `< thresholds.clashDist`. (Approximation: full-protein clash needs surface mesh; for L1 the key-residue subset is good enough and cheap.)
5. `total` = `α·distanceTerm + β·hBondHits − γ·clashes`.
6. `isBestPose` = `rawDistance < BEST_POSE.distance && hBondHits >= BEST_POSE.hBondHits`.

### `src/ui/score-readout.js`

```javascript
import * as THREE from 'three';

/**
 * Build an in-scene floating billboard near the pocket. Returns an object
 * with .group (Three.Group to add to scene) + .update(scoreResult).
 */
export function buildReadout({ pocketCenter, scene }) { /* impl */ }
```

- Uses `THREE.CanvasTexture` rendered onto a small `THREE.PlaneGeometry`.
- Shows: `Score: 0.62` (3 decimals) + colored bar gradient (red→amber→green) tied to `total`.
- Billboard always faces the camera (look-at in `update`).
- Best-pose badge: a second plane below, hidden until `showBestPoseBadge()` is called.
- Position: 0.5 m above `pocket_cox2.json.pocket_center`, aligned to head-up.

### `src/ui/narrative-panel.js`

```javascript
import * as THREE from 'three';

/**
 * Build the L1 narrative scaffolding: a dismissible task brief panel +
 * floating residue side-notes anchored to the marquee residue centroids.
 *
 * Returns { group, dismissBrief, update }.
 *
 * @param {object} args
 * @param {THREE.Scene} args.scene
 * @param {THREE.Vector3} args.pocketCenter
 * @param {object} args.pocketAnnotation     parsed pocket_cox2.json
 * @param {object} args.narrative            parsed l1-narrative.json
 */
export function buildNarrativePanel({ scene, pocketCenter, pocketAnnotation, narrative }) { /* impl */ }
```

- **Task brief panel**: a single billboard plane (~1.2 m × 0.6 m) positioned 1.0 m above and 0.6 m behind the pocket, default-visible. Auto-dismisses after `narrative.brief.auto_dismiss_seconds` (15 s) or via the user pressing the **A button on the LEFT controller**. Survives at most one boot of L1. (Quest 3S layout: A / B / Meta on left; X / Y / Menu on right. F-004b binds A = dismiss, B = redock; right controller buttons reserved for future scenes.)
- **Residue side-notes**: small label planes (~0.18 m × 0.05 m) anchored at each `key_residues[i].ca_xyz` from `pocket_cox2.json`. Always visible. Text comes from `narrative.residue_notes` keyed by residue id.
- **Score-meaning hint**: a tiny caption attached just below the score readout (handled inside this module to avoid coupling). Reads from `narrative.score_hint`.
- All text rendered via `THREE.CanvasTexture` (same renderer pattern as score-readout).
- Localisation-ready: panel reads `narrative.locale` and selects accordingly; ships with `en` only for F-004b.

### `src/data/l1-narrative.json`

```json
{
  "schema_version": "1.0",
  "locale": "en",
  "brief": {
    "title": "Mission: Inhibit COX-2",
    "biology": "COX-2 produces prostaglandins that drive inflammation, pain, and fever. Block it and you have an anti-inflammatory drug.",
    "engineering": "Dock celecoxib so that the natural substrate (arachidonic acid) cannot fit. Aim for tight shape complementarity AND at least two hydrogen-bond contacts with key residues.",
    "auto_dismiss_seconds": 15
  },
  "residue_notes": {
    "VAL523": "Selectivity gatekeeper — only COX-2 has Val here (COX-1 is Ile).",
    "ARG120": "Anchors the ligand's polar head (carboxylate / sulfonamide).",
    "TYR385": "Donor for an H-bond into the sulfonamide oxygens.",
    "SER530": "Reactive serine — covalent target for aspirin (not for celecoxib)."
  },
  "score_hint": "Score = α·shape_fit + β·H_bonds − γ·clashes  (educational proxy, not real ΔG)",
  "best_pose_message": "Best pose locked in. Celecoxib is now blocking COX-2 the way the FDA-approved drug does.",
  "tts_metadata": {
    "voice_persona": "dr_chen",
    "max_seconds_per_block": 60,
    "wpm": 130
  }
}
```

The `tts_metadata` block is forward-compatible with F-008: when the story wrapper lands it can read this same JSON, run the `brief.biology` + `brief.engineering` strings through `Web Speech API` (or pre-recorded ElevenLabs), and visually dim the panel during voiceover. F-004b ships text-only.

### `src/scenes/LevelOneScene.js`

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadGLB, loadJSON, extractAtomPositions } from '../lib/asset-loader.js';
import { computeScore } from '../lib/scoring.js';
import { buildReadout, showBestPoseBadge } from '../ui/score-readout.js';

const ASSET_BASE = '/assets/v1';

export default class LevelOneScene {
  constructor(ctx) { /* save ctx, init state */ }

  async init() {
    // Parallel asset load
    const [cox2Surface, cox2Cartoon, ligand, pocket, vina, narrative] = await Promise.all([
      loadGLB(`${ASSET_BASE}/cox2_surface.glb`),
      loadGLB(`${ASSET_BASE}/cox2_cartoon.glb`),
      loadGLB(`${ASSET_BASE}/ligands/celecoxib.glb`),
      loadJSON(`${ASSET_BASE}/pocket_cox2.json`),
      loadJSON(`${ASSET_BASE}/vina_results.json`),
      loadJSON('/data/l1-narrative.json'),     // shipped via Vite static under src/data/
    ]);

    // Save into instance state
    // Build scene root, add meshes
    // Spawn ligand at offset from pocket center (≥ 6 Å along +x)
    // Build readout via score-readout
    // Build narrative panel via narrative-panel (task brief + residue side-notes)
  }

  update(dt, controllers) {
    if (!this.ready) return;
    this.ligand.updateMatrixWorld(true);
    const atoms = extractAtomPositions(this.ligand);
    const result = computeScore({ /* ... */ });
    this.readout.update(result);
    if (result.isBestPose && !this.bestPoseFired) {
      this._onBestPose();
    }
    // Telemetry sampler at 1 Hz
    this._maybeEmitScoreTelemetry(result, dt);
  }

  destroy() { /* remove added meshes from ctx.scene */ }
  getGrabbables() { return [this.ligand]; }
}
```

---

## Data flow

```
controller B button (squeezeend)        ─────►  redock (reset ligand to spawn)
controller select (grab + move)         ─────►  ligand transform updates
                                                  │
                                                  ▼
animation frame (60 Hz)                ─────►  computeScore(ligandAtoms, pocket, vinaBest)
                                                  │
                                                  ├──►  readout.update() — text + colour
                                                  │
                                                  ├──►  if isBestPose first time:
                                                  │       showBestPoseBadge()
                                                  │       audio cue
                                                  │       telemetry: best_pose_hit
                                                  │
                                                  └──►  every ~1s (sampled):
                                                         POST /api/telemetry score_update
```

---

## Telemetry events

Reuse the existing `/api/telemetry` endpoint (F-007). Add new event types:

| Event           | Trigger                            | Payload                                                      |
|-----------------|------------------------------------|--------------------------------------------------------------|
| `level_start`   | L1 init complete                   | `{ session_id, level: "L1", target: "cox2", ligand: "celecoxib" }` |
| `score_update`  | every 1 s of held-time             | `{ session_id, total, components, rawDistance }`             |
| `best_pose_hit` | first frame `isBestPose === true`  | `{ session_id, total, rawDistance, time_to_hit_ms }`         |
| `redock_count`  | each B-button reset                | `{ session_id, count }`                                      |
| `level_complete`| user clicks Finish                 | `{ session_id, total_attempts, best_score, completed_ms }`   |

The server-side schema migration is **out of scope** for F-004b; the existing JSON-blob telemetry table accepts arbitrary `event_type` strings, so this is additive only.

---

## UI / UX details

- **Ligand spawn position**: 0.5 m east of pocket centre, 0.1 m above floor; rotation matches the Vina best pose orientation so that "snapping in" feels intuitive on first try.
- **Score colour gradient**: HSL interpolation, hue 0° (red) → 60° (yellow) → 120° (green) mapped from `total ∈ [0, 1]` clamped.
- **Best-pose badge**: a 0.4 m × 0.1 m green plane reading "BEST POSE". Stays visible 5 s, then fades. Frontend devs may swap copy / styling.
- **Audio cue**: optional — a short success chime played via `AudioContext`. Skipped if AudioContext is unavailable (e.g. no user gesture has unlocked it).
- **Reset**: **B button on the LEFT controller** (Quest 3S layout: A / B / Meta on left; X / Y / Menu on right). Snaps ligand back to spawn position. Increment `redock_count` telemetry.
- **Finish button**: reuse F-001's existing finish UI (already wired in `main.js`).

---

## Risks & mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| `extractAtomPositions` returns **vertex** positions, not real **atoms** (we use surface .glb) | 🟡 M | Sub-sample to ~50 evenly-spaced vertices for clash check; full atom list is overkill at 60 Hz anyway. Document the proxy in the scoring module. |
| GLTFLoader DRACO decoder path uses CDN (offline demo would fail) | 🟡 M | Hackathon demo runs with internet; if needed, self-host decoder under `/draco/` and switch path. Documented inline. |
| 60 Hz score compute too slow on Quest 3 | 🟢 L | Profile early; sub-sample atoms if hot. `O(N·M)` with N=50, M=4 = 200 ops/frame — well under budget. |
| Spawn pose makes celecoxib trivially close to best-pose centroid | 🟡 M | Force spawn ≥ 6 Å from pocket centroid so user has to *travel* before scoring meaningful. |
| Best-pose threshold too easy / too hard | 🟢 L | Pilot test; thresholds in `scoring.js` are constants — one-line tweak. |
| Browser cache of `/assets/v1/*.glb` between dev iterations | 🟢 L | Vite hot-reload busts; otherwise hard-reload (`Cmd+Shift+R`). |
| Narrative panel obstructs the pocket / score readout in VR | 🟡 M | Position 1 m above + 0.6 m behind the pocket; auto-dismiss at 15 s; A-button manual dismiss. Pilot to confirm. |
| Gemini-authored narrative drifts from biology accuracy (e.g. mis-states the role of a residue) | 🟡 M | Narrative authoring brief explicitly cites Wiki seed `[[bio-cox1-cox2]]` and `pocket_cox2.json` `role` field; Gemini review phase double-checks against same Wiki page. SME spot-check (the user) before merge. |

---

## Testing strategy

| Layer | Tool | What's tested |
|-------|------|---------------|
| **Unit** (scoring) | Vitest (Node, no DOM) | `computeScore` deterministic across crafted inputs: best pose hit, far away, perfect H-bonds, all clash. Numerical stability around `d_max`. |
| **Unit** (asset loader) | Vitest + jsdom mock | `loadJSON` retry / error path; `extractAtomPositions` returns expected count for a hand-built mesh. |
| **Integration** (scene) | Manual on Quest 3 + desktop fallback | Boot → tutorial → L1 loads → score moves → best pose triggers → finish hits. |
| **Pilot** | 2 humans × 5 min playthrough | Completion 2–4 min; no deadlocks; readout legible. |
| **E2E (optional)** | Puppeteer screenshot of WebXR Emulator | Future addition; 03624 GPU-accelerated headless if added. |

The scoring unit tests are the contract that protects L2 (F-005) and L3 (F-006) from forking logic.

---

## Acceptance criteria mapping (Issue #16)

| Issue criterion | Spec section |
|----------------|--------------|
| L1 场景加载 COX-2 + celecoxib via F-002 | `LevelOneScene.init()` + asset-loader |
| 实时 score readout (heuristic 公式) | `computeScore` in scoring.js + score-readout.js |
| Best-pose threshold (distance < 3 Å + ≥ 2 H-bond) | `BEST_POSE` constant + `isBestPose` flag |
| 完成时间 2–4 min | Pilot test (post-impl) |
| Scoring extracted as reusable module | scoring.js is pure-function, parameterised, reusable verbatim by L2/L3 |
| **Narrative context (added per review)** | `narrative-panel.js` + `l1-narrative.json` — task brief + residue side-notes + score hint |

---

## Out of scope

- F-004a Game Hub (Issue #15)
- L2 / L3 / Tutorial polish
- Click-confirm cadence (alternative loop)
- Multi-controller bimanual grab
- Subtitled audio narration (lives in F-008)
- Real-atom scoring beyond surface vertex proxy
- Visual regression / Puppeteer CI

---

## Workflow allocation (per user direction)

| Stage | Owner | Channel | Deliverable |
|-------|-------|---------|-------------|
| Brainstorm + spec | Claude Code (this session) | inline | this doc |
| Implementation plan | Claude Code (this session, `superpowers:writing-plans`) | inline | bite-sized TDD plan |
| **Narrative authoring** | **Gemini CLI worker** | `omc team 1:gemini` (content phase) | populated `src/data/l1-narrative.json` (biology + engineering brief, residue notes, score hint, TTS-friendly cadence) |
| **Coding** | **Codex CLI worker** | `omc team 1:codex` once plan + narrative JSON land | `LevelOneScene.js`, `scoring.js`, `asset-loader.js`, `score-readout.js`, `narrative-panel.js`, integration in `main.js` |
| **Test + review** | **Gemini CLI worker** | `omc team 1:gemini` (review phase) after code | Vitest unit tests for scoring + spec/PR review notes |
| Heavy compute (asset re-gen) | 03624 GPU host | SSH ad hoc | not needed for F-004b unless threshold change forces Vina re-run |

Two-phase Gemini work is intentional: the **content phase** runs first (deterministic JSON output, blocks Codex on data shape only); the **review phase** runs after Codex's PR is open. Codex consumes Gemini's narrative JSON as a fixed input, so the two never collide on the same files.

03624 has no must-have job in F-004b. The Vina box, ligand SDF, and pose data are all already baked. We only call 03624 if we want to regenerate assets after a design change — kept on standby.

---

## References

- Master MVP spec: `docs/superpowers/specs/2026-04-25-hackathon-mvp-design.md`
- Asset pipeline spec: `docs/superpowers/specs/2026-04-25-f002-asset-pipeline-design.md`
- F-001 scaffold: `src/main.js`, `vite.config.js`, `server/`
- F-003 tutorial: `src/scenes/TutorialScene.js`
- F-007 telemetry: `src/survey-ui.js`, `src/survey-questions.js`, `server/db.js`, `/api/telemetry`
- Three.js GLTFLoader: https://threejs.org/docs/#examples/en/loaders/GLTFLoader
- WebXR API: https://immersive-web.github.io/webxr/
- Sung et al. 2020 (Cohen's *d* baseline): `docs/reference/biochemar-...pdf`
