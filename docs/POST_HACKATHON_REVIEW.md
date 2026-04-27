# Post-Hackathon Review — van-der-view

**Snapshot date**: 2026-04-27
**Snapshot branch**: `review/post-hackathon-2026-04-27` (cut from `frontend/release-candidate` @ `2a11c65`)
**Purpose**: freeze the post-hackathon state, summarize what shipped, capture open issues, and stage the cleanup plan before resuming feature work.

---

## 1. Summary of Achievement

WebXR molecular-docking educational app for Quest 3, built end-to-end during the hackathon. Stack: Vite + Three.js (WebXR) frontend, Express + SQLite telemetry backend, Python asset pipeline (COX-1/COX-2 + 5 NSAID ligands precomputed via AutoDock Vina).

### Shipped game flow

| Stage | Status | Notes |
|-------|--------|-------|
| **Hub menu** | ✅ shipped | Click-to-enter menu replaced 3D portals/teleport. VR trigger picks via per-frame raycast. Persistent HUD MENU button (`8e1cf5c`). |
| **Tutorial (L0)** | ✅ shipped | Ghost-overlay snap UX (overlay ligand onto target ghost). Bimanual grip, 6-DOF, manual return-to-hub. |
| **L1 — single docking** | ✅ shipped | COX-2 + ligand. Bundled HUD score readout, 6-DOF grip, target ghost at Vina pose, score ≥ 0.70 passes. Decoupled translate/rotate, 2.5× rotation gain, 30% widened dock threshold. |
| **L2 — rank 5 NSAIDs** | ✅ shipped | Pull-pedestal selection, ΔG bar instantly visible (rAF-paused-in-VR fix), manual return-to-hub. |
| **L3 — COX-1 vs COX-2 + Vioxx** | ✅ scaffolded, restored to hub | Dual pocket viewer + selectivity HUD + cutscene + wrap card. Cut from MVP demo path mid-hackathon, then re-listed in hub for post-MVP iteration. |
| **Telemetry** | ✅ shipped | `/api/telemetry` POST/GET, SQLite persistence, session UUID linking pre/post survey. Cohen's d effect-size script. |
| **Asset pipeline (F-002)** | ✅ shipped | `public/assets/v1/` carries cox1/cox2 cartoon+surface GLBs, ligand GLBs, pocket JSONs, precomputed Vina results. |

### Engineering wins worth keeping

- **Scene transition deadlock fix** — fades driven from main animation loop with `try/finally` releasing the `transitioning` flag (`fdad021`, `8a8d621`).
- **Hub menu raycast fix** — trigger click deferred to next frame to avoid stale matrix raycast (`108d348`).
- **Tutorial progression unblock** — removed `WAIT_SNAP` `isHeld` guard for thumbstick-only / mid-drag-release flows (`57f13e0`).
- **Input routing** — locked player locomotion, thumbsticks forwarded to active scene's grabbed object (`3fdd6f3`).
- **Visual polish** — ligand/protein color split, ghost-fade on snap, smaller initial scale, farther spawn for pocket comfort.

### Process artifacts

- `docs/superpowers/specs/` — three design specs (hackathon MVP, F-002 pipeline, F-004b L1 docking).
- `docs/superpowers/plans/` — phased implementation plans for F-002 + F-004b.
- `docs/pitch-script.md` + `docs/pitch.html` — 5-minute investor pitch (final = `docs/pitch/pitch-v5.html`).
- `docs/team-orchestration.md` + `docs/leader-runbook.md` — leader/contributor protocol that survived the sprint.
- `.omc/wiki/` — 41 wiki pages capturing Quest 3 / WebXR / domain-bio learnings (auto-loaded into future sessions).

---

## 2. Summary of Remaining Issues

### From `tmp/feedback.md` (live user feedback during hackathon)

Status legend: ✅ fixed in branch / ⚠️ partial / ❌ open.

- ✅ Score readout fixed to HUD (no longer participates in model transform).
- ✅ Protein supports translate + rotate via grip.
- ✅ Initial spawn distance increased; model scale reduced.
- ✅ Docking area judgment widened by 30%.
- ✅ Color split: ligand vs protein distinguished (green / light-blue style).
- ✅ Magnetic snap retained for high-score auto-correct (ghost-overlay UX).
- ⚠️ **L1 entry brief**: brief panel exists but may still drop the user into the molecule with insufficient orientation context. Validate fresh-user comprehension.
- ❌ **Clash feedback**: ligand can still penetrate protein interior with no haptic/visual collision feedback. No controller rumble on clash, no flash/red highlight.
- ❌ **Bimanual zoom uniformity**: confirm both hands' grip applies the same scale factor to ligand + protein together (visual ratio preservation).
- ❌ **Mid-docking guidance hints**: no contextual prompt when ligand is grabbed ("use grip to rotate / trigger to switch ligand").
- ❌ **Success feedback**: success path still terse — no celebratory readout or score breakdown beyond pass threshold flip.

### Known engineering debt

- `selection-debugging.txt` (15 KB) — raw scratch from controller-selection investigation; should be condensed into a wiki page or deleted.
- `audio.rar` (6.5 MB) — binary checked into repo root by accident; not referenced in source. Belongs out-of-tree or in Git LFS.
- `tmp/` not in `.gitignore`; risk of stray debug commits.
- `docs/pitch/v1..v5` — five iterations of the pitch HTML kept side-by-side. v5 is canonical; v1–v4 are history.
- L3 ships in hub but is **post-MVP**; entry exists, but the experience is a 5s viewing timer → cutscene → wrap card. No interactive selectivity comparison.
- No CI checks configured on the repo. Leader can't auto-merge per its own contract (`docs/team-orchestration.md`).
- `CHANGELOG.md` has empty `[Unreleased]` section; the leader was not invoked to append per-PR entries during the hackathon.

### Cross-cutting risks

- **No automated VR regression coverage** — Vitest covers `src/lib/scoring.js` only (9 tests passing as of `81`). All scene/grip/transition fixes have been validated manually on Quest 3.
- **Asset pipeline is not deterministic in CI** — Python steps live in `pipelines/`, not gated.
- **Telemetry survey schema** is hard-coded in `src/survey-questions.js`; no migration story for future revisions.

---

## 3. Future Work (next sprint candidates)

Prioritized by user-perceived impact ÷ engineering cost.

### P0 — Polish the MVP loop (1–3 days)

1. **L1 entry brief revamp** — short cinematic hint before pocket appears: "Dock the ligand into the green pocket. Grip = move/rotate. Trigger = grab." Auto-dismiss on first grip.
2. **Clash feedback** — controller haptic pulse + ligand flash-red on protein-mesh interpenetration. Reuse the asset GLB bounding volumes; no need for full collision physics.
3. **Bimanual uniform zoom** — verify both controllers' grip scales ligand + protein by the same factor; if not, factor scale into a single transform parent.
4. **Success celebration** — score-tier readout (Bronze / Silver / Gold) + one-line "what you did well" tip on success.
5. **Wire CI** — add a minimal GitHub Action: `npm ci && npm test`. Unblocks `leader:auto-merge`.

### P1 — L3 promotion (3–5 days)

6. **Make L3 interactive** — replace 5s timer with controller-driven side-by-side examination, then user-triggered selectivity reveal.
7. **Ligand picker for L1/L2** — let trigger cycle through the 5 NSAIDs in-scene, recompute score live from precomputed Vina table.
8. **Persistent score across sessions** — write per-level best score into telemetry DB, surface on hub menu badges.

### P2 — Pipeline & tooling (1–2 weeks)

9. **Asset pipeline CI gate** — pin Python deps, snapshot input PDBs, fail build on Vina drift.
10. **Telemetry dashboard** — small Express/HTML page over `data/telemetry.db` for instructor-side review of pre/post survey effect sizes.
11. **Survey schema migrations** — versioned schema, store schema_id with each response.
12. **Backfill `CHANGELOG.md`** for hackathon merges (`c17de6f`, `f53fb55`, `2773af9`, etc.) so the project gets a proper `0.1.0` tag.

---

## 4. Future Dev Ideas & Directions

Things worth a brainstorm session before they become tickets.

### Pedagogy

- **Curriculum extension** — a ladder past L3: enzyme kinetics (Km/Vmax), allosteric modulation, fragment-based growth. Anchor each to a real drug story (Vioxx → Imatinib → Venetoclax).
- **Pre/post Likert refresh** — current 4-pre / 5-post + 1 free-text battery is hackathon-tuned. Run a small pilot with educators to rewrite items against measured learning objectives (Bloom's verbs).
- **Embodied-cognition wiki page** (`pedagogy-embodied-cognition.md`) already drafted — operationalize: every new mechanic must let the user *do* the concept with their hands, not watch it.

### Game / UX

- **Two-handed pocket dilation** — grab pocket residues bilaterally to "open" the binding site. Teaches induced fit.
- **Shared-room multiplayer** — one Quest, one desktop spectator. Educator on desktop can spotlight residues and cue prompts.
- **Hint-tier system** — cost-aware hints (haptic nudge → ghost flicker → full ghost reveal). Track hint use in telemetry.
- **Replay & screenshot-out** — capture best dock pose to PNG + JSON, share for peer review.

### Platform / Tech

- **Quest 3S parity audit** — `.omc/wiki/quest3-vs-quest3s.md` flags differences; do a pass on frame budget and depth precision now that L1/L2 are stable.
- **WebGPU migration** — Three.js r170+ has a WebGPU renderer; evaluate when Quest browser stabilizes support. Surface meshes are the heaviest assets.
- **Hand-tracking path** — currently controller-only. Hand-tracking would unlock fingertip residue selection and remove the trigger-vs-grip cognitive load.
- **Boltz-2 / OpenFold3 hooks** — lightweight wrapper to swap in user-supplied PDBs (instructor uploads target → pipeline generates GLBs + pocket JSON + Vina pose). Long-term: in-app authoring.
- **Server consolidation** — Express telemetry + asset pipeline + (future) instructor dashboard could move to a single Node/Python service behind one origin.

### Business / Ops

- **Pitch v5 → web** — host `docs/pitch/pitch-v5.html` at a stable URL for the school / investor follow-ups.
- **Effect-size case study** — once pre/post telemetry has n ≥ 30, publish a short report (Cohen's d on conceptual-understanding items) — reusable as marketing + grant material.
- **Open-source posture** — decide license now (MIT vs Apache-2.0) before any external contributors.

---

## 5. Cleanup Plan (proposed; execute under separate PRs)

This branch (`review/post-hackathon-2026-04-27`) only adds this document and gitignore tweaks. Destructive moves below are **proposed** — execute after your sign-off.

### A. Safe to do now (additive, low risk)

- [x] Append `audio.rar`, `*.rar`, `tmp/`, `selection-debugging.txt`, `**/.DS_Store` to `.gitignore`.
- [ ] Move `tmp/feedback.md` → `docs/user-feedback-hackathon.md` (preserve as historical record). *Pending your sign-off; preserves content.*

### B. Needs sign-off (delete or relocate)

- [ ] **Delete** `audio.rar` from working tree (6.5 MB binary, not referenced in source). If needed, archive externally (Drive / Notion).
- [ ] **Delete** `selection-debugging.txt`. Distill any keepers into `.omc/wiki/webxr-input-events-debugging.md` first.
- [ ] **Delete** `tmp/` (after moving feedback.md).
- [ ] **Prune** `docs/pitch/pitch-v1.html..pitch-v4.html`; keep `pitch-v5.html` and rename to `pitch.html`. Drop the duplicate `docs/pitch.html` at top level.
- [ ] **Decide** on `.superpowers/` — empty `brainstorm/` dir; either commit a README placeholder or add to `.gitignore`.

### C. Repo hygiene (medium effort)

- [ ] Backfill `CHANGELOG.md` `[Unreleased]` from merged PRs since 2026-04-25.
- [ ] Cut a `v0.1.0` tag from `main` after backfill.
- [ ] Wire GitHub Action: `npm ci && npm test` on PR. Required for `leader:auto-merge`.
- [ ] Delete merged remote branches (origin: `001`, `003`, `004a`, `005`, `frontend/16-*`, `frontend/29-*`, `frontend/31-*`, `frontend/fix-vr-scene-transition-deadlock`, `frontend/tutorial-ghost-overlay`, `frontend/26-post-merge-fixes`).

### D. Post-cleanup checkpoint

After A–C, the working tree on `main` should have **zero untracked files** at root and all hackathon learnings either codified (wiki, this doc) or excised. Then `frontend/release-candidate` can be merged or retired.

---

## Appendix — Branch & commit anchors

- Cut from: `frontend/release-candidate` @ `2a11c65 fix(hub): unlock L3 row in LEVEL_DEFS + UNLOCK_ORDER`
- Last hackathon merge to `main`: `eac1779 Merge pull request #32 from Jhin97/frontend/31-hub-menu-no-teleport`
- L3 restoration: `8e1cf5c feat(menu): persistent HUD ← MENU button + restore L3 in hub`
- Tutorial ghost-overlay refactor: `3c18a89 refactor(tutorial): ghost-overlay UX — overlay ligand onto a target ghost to snap`
- Input lock: `3fdd6f3 feat(input): lock player, route thumbsticks to active scene's object`
