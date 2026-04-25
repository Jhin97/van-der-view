# F-002 Asset Pipeline Design — COX-1/COX-2 + 5 ligands + precomputed Vina

**Date**: 2026-04-25
**Status**: Brainstormed, awaiting user review
**Tracks**: Issue #7 (F-002, team:data, p0); story alignment with Issue #13 (F-008, team:frontend, p2)
**Spec reference**: `docs/superpowers/specs/2026-04-25-hackathon-mvp-design.md`
**Authoring**: User dialogue + Claude Opus 4.7 + Gemini story-eval pass via `superpowers:brainstorming` skill

---

## Goal

为 hackathon MVP 提供 **frontend-ready 资产包**：COX-1 / COX-2 protein meshes (cartoon + surface)、5 个 NSAID ligand meshes、pocket annotation JSON、precomputed AutoDock Vina docking poses + scores。所有产物 commit 到 `public/assets/v1/`，前端 (F-004 / F-005 / F-006) 通过 fetch + Three.js GLTFLoader 直接消费。

同步交付 F-008 故事 outline：5-beat beat-sheet 锁定 Vioxx narrative 的 mechanistic 教学口径（PGI2/TXA2 imbalance），避免 shock-value 风险。

## Non-goals

- 实时 Vina 计算（一切预计算）
- FPocket / pyKVFinder 自动 pocket detection（用 literature-grounded 手动 residue list）
- 商业 PyMOL（仅用 `pymol-open-source` from bioconda）
- 5 个之外的 ligand
- 完整 storytelling 实现（F-008 的 TTS / cutscene 实现是 frontend 的事；此处仅交付 dialogue text + asset implications）

## Constraints

| Constraint | Detail |
|------------|--------|
| **File budget** | 每个 .glb < 5MB；总资产 < 25MB |
| **Quest browser load** | 加载 + 解析 < 3s（USB-C `adb reverse` 通道）|
| **Tooling** | Conda env (RDKit / OpenBabel / Vina / BioPython / pymol-open-source) + Node (obj2gltf, gltf-pipeline) |
| **Reproducibility** | Hybrid: 科学步骤 (PyMOL 清理、pocket annotation、Vina) 脚本化；mesh 导出半自动（人工跑 PyMOL 脚本一次）|
| **License** | 仅用 RCSB PDB 公开结构 + 公开 ligand SMILES；diclofenac SMILES 取 ChEMBL CHEMBL3 |
| **Hardware** | macOS (Apple Silicon 优先，Intel 兼容)，无 GPU 依赖 |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│ pipelines/                       (committed scripts + manifests)     │
│                                                                       │
│  environment.yml ──────────► Conda env: vdv-pipeline                 │
│  package.json    ──────────► Node deps: obj2gltf, gltf-pipeline      │
│  Makefile        ──────────► `make assets` 一键                       │
│                                                                       │
│  scripts/                                                             │
│   01_fetch_pdb.py  ──── wget 1EQG / 1CX2 from RCSB                   │
│   02_clean_protein.py ─ BioPython 去 water/altconf，保 heme           │
│   03_annotate_pocket.py ─ literature residue list → pocket JSON      │
│   04_prep_ligands.py ── RDKit ETKDG + MMFF94 → SDF                   │
│   05_run_vina.py ────── 10 docking jobs (multiproc 4 worker)         │
│   06_export_meshes.sh ─ PyMOL → obj → obj2gltf → draco 压缩          │
│                                                                       │
│  data/                          (intermediate, gitignored)            │
│   pdb/, cleaned/, ligands/, vina_runs/                               │
└────────────────────────────────────┬────────────────────────────────┘
                                     │ outputs
                                     ▼
┌─────────────────────────────────────────────────────────────────────┐
│ public/assets/v1/                (committed binaries, 前端消费)       │
│                                                                       │
│   cox1_cartoon.glb       ~1MB                                        │
│   cox1_surface.glb       ~3MB   (含 heme, 含 Ile523 marquee)          │
│   cox2_cartoon.glb       ~1MB                                        │
│   cox2_surface.glb       ~3MB   (含 heme, 含 Val523 marquee, side    │
│                                  pocket 标注)                          │
│                                                                       │
│   ligands/                                                            │
│     celecoxib.glb        ~50KB                                       │
│     rofecoxib.glb        ~50KB                                       │
│     ibuprofen.glb        ~30KB                                       │
│     naproxen.glb         ~40KB                                       │
│     diclofenac.glb       ~40KB                                       │
│                                                                       │
│   pocket_cox1.json       <50KB                                       │
│   pocket_cox2.json       <50KB                                       │
│   vina_results.json      <100KB (10 runs × top 9 poses)              │
└─────────────────────────────────────────────────────────────────────┘
```

---

## File Contracts (Frontend Consumption)

### `public/assets/v1/pocket_cox{1,2}.json`

```json
{
  "schema_version": "1.0",
  "pdb_id": "1CX2",
  "chain": "A",
  "pocket_center": [x, y, z],
  "pocket_radius": 8.5,
  "key_residues": [
    {
      "id": "VAL523",
      "ca_xyz": [x, y, z],
      "side_chain_centroid": [x, y, z],
      "role": "marquee_selectivity_gatekeeper",
      "narrative_hook": "side_pocket_gate"
    },
    {
      "id": "ARG120",
      "ca_xyz": [x, y, z],
      "side_chain_centroid": [x, y, z],
      "role": "h_bond_acceptor"
    },
    {
      "id": "TYR385",
      "ca_xyz": [x, y, z],
      "side_chain_centroid": [x, y, z],
      "role": "h_bond_donor"
    },
    {
      "id": "SER530",
      "ca_xyz": [x, y, z],
      "side_chain_centroid": [x, y, z],
      "role": "covalent_anchor_aspirin_only"
    }
  ],
  "heme_centroid": [x, y, z],
  "side_pocket_anchor_xyz": [x, y, z]
}
```

`role` 字段是 frontend 高亮 / narrative trigger 用的开关。`narrative_hook` 字段对应 F-008 beat 内容（如 `"side_pocket_gate"` 触发 Beat 2 Dr. Chen 关于 Val523 的解说）。

### `public/assets/v1/vina_results.json`

```json
{
  "schema_version": "1.0",
  "generated_at": "2026-04-25T...",
  "vina_version": "1.2.5",
  "params": {
    "box_size": [22.5, 22.5, 22.5],
    "exhaustiveness": 8,
    "num_modes": 9,
    "energy_range": 3.0
  },
  "runs": [
    {
      "ligand": "celecoxib",
      "target": "cox2",
      "best_pose": {
        "ligand_centroid": [x, y, z],
        "atom_xyz": [[x, y, z], ...],
        "vina_score": -10.2,
        "rmsd_lb": 0.0,
        "rmsd_ub": 0.0
      },
      "all_poses": [ ... top 9 ... ]
    }
    // 10 runs total: 5 ligands × 2 targets
  ]
}
```

前端使用：
- **F-004 (L1)**: 加载 `cox2_*.glb` + `celecoxib.glb` + `pocket_cox2.json` + 抽 `vina_results.runs` 中 `(celecoxib, cox2)` 的 best_pose 作为 distance reward 锚点
- **F-005 (L2)**: 加载 `cox2_*.glb` + 5 个 ligand .glb，从 `vina_results` 抽 5 条 `(ligand_i, cox2)` score 作为 ranking ground truth
- **F-006 (L3)**: 加载 `cox1_*.glb` + `cox2_*.glb` + `rofecoxib.glb`，从 `vina_results` 抽 `(rofecoxib, cox1)` 与 `(rofecoxib, cox2)` 算 selectivity ratio = `score(cox2) - score(cox1)` 直接显示

---

## Pocket Annotation Strategy (Manual / Literature-Grounded)

**为什么不用 FPocket 自动检测**：
1. Val523/Ile523 这种 "side pocket gatekeeper" 是 *Kurumbail et al. Nature 1996* 明确，auto 算法可能漏报或报到错位
2. Wiki `bio-cox1-cox2` 已固化 4 个核心 residue + heme handling
3. 24h 时间敏感；手动一次性 → script 输出 → 视觉 sanity check 比 auto + verify 快

**实现** (`03_annotate_pocket.py`)：
- 输入硬编码 residue list per target
  - COX-2 (1CX2): VAL523, ARG120, TYR385, SER530
  - COX-1 (1EQG): ILE523, ARG120, TYR385, SER530
- BioPython 读 cleaned PDB，按 residue ID 抽：
  - Cα 坐标
  - 侧链非氢原子重心 (`side_chain_centroid`)
- `pocket_center` = 4 个关键 residue Cα 的几何重心（不含 heme）
- `pocket_radius` = max(每个 Cα 到 center 的距离) + 4Å buffer
- `heme_centroid` = HETATM HEM 所有重原子重心
- `side_pocket_anchor_xyz` = COX-2 用 VAL523 侧链 centroid，COX-1 用 ILE523 侧链 centroid（前端用此点做 "side pocket" highlight glow）

---

## Vina Docking Parameters

`05_run_vina.py` 默认：

```python
box_center = pocket_center        # 来自 03 输出
box_size = (22.5, 22.5, 22.5)     # Å, 标准 mid-size pocket
exhaustiveness = 8                 # Vina default; 24h 不上 32（runtime 4×）
num_modes = 9
energy_range = 3.0                 # kcal/mol top-pose 范围
seed = 42                          # 可复现
```

**并行**：`multiprocessing.Pool(4)` 跑 10 jobs（5 ligand × 2 target），每个 job ~30-60s on M-series Mac → total < 10 min。

**输出**：每个 job 出 `out_{ligand}_{target}.pdbqt`（all 9 poses）→ 解析为 atom_xyz + score → 合并成 `vina_results.json`。

---

## Heme + Ligand Handling

**Heme**：
- 烘进 `cox{1,2}_surface.glb`（active site 视觉锚点；离 protein < 5Å，单独 .glb 没价值）
- PyMOL `select heme, resn HEM` → 与 protein 同 mesh 但用不同 material color (orange/red)
- 不烘进 cartoon mesh（cartoon 是 protein backbone-only）

**Ligand .glb (5 个)**：
- RDKit `Chem.MolFromSmiles(s) + EmbedMolecule(ETKDGv3) + MMFFOptimizeMolecule(MMFF94s)` → 3D conformer SDF
- OpenBabel: SDF → mol2 (PyMOL 兼容)
- PyMOL: `load .mol2`, `show sticks`, `set stick_radius, 0.15` → `save .obj`
- obj2gltf → .glb
- gltf-pipeline draco 压缩
- **特别**：celecoxib sulfonamide tail 几何要清晰（Beat 2 narrative 关键），visual check 时确认 `-S(=O)(=O)NH2` 朝外

**Ligand SMILES（带源）**：
| Ligand | SMILES | Source |
|--------|--------|--------|
| celecoxib | `Cc1ccc(-c2cc(C(F)(F)F)nn2-c3ccc(S(N)(=O)=O)cc3)cc1` | ChEMBL CHEMBL118 |
| rofecoxib | `O=C1OCC(=C1c1ccccc1)c1ccc(S(C)(=O)=O)cc1` | ChEMBL CHEMBL122 |
| ibuprofen | `CC(C)Cc1ccc(C(C)C(=O)O)cc1` | ChEMBL CHEMBL521 |
| naproxen | `COc1ccc2cc(C(C)C(=O)O)ccc2c1` | ChEMBL CHEMBL154 |
| diclofenac | `OC(=O)Cc1ccccc1Nc1c(Cl)cccc1Cl` | ChEMBL CHEMBL3 |

---

## Story (F-008) Cross-Track Deliverable

**新增文件**：`docs/features/0002-story-outline.md`

内容来自 Gemini story-eval pass，加 mix-lang 化：
- 5-beat beat-sheet 表格（Beat 1 Intro / Beat 2 Discovery / Beat 3 Ranking / Beat 4 Vioxx Flashback / Beat 5 Horizon Wrap）
- 每个 beat 的 trigger / scene / Dr. Chen dialogue (English) / pedagogical payload / asset implications
- Vioxx narrative **必须** 讲 PGI2/TXA2 imbalance 机制（避免 shock-value）
- 显式提到 Val523 vs Ile523 (Beat 2)、Side Pocket theory、Safety-by-Design framing

**附属**：`pipelines/data/dialogue/dr_chen_beat_{1..5}.txt`（committed），每个 ≤60s TTS 文本，前端 (F-008) 直接喂 Web Speech API。

---

## Time Budget (~5h)

| Step | 估时 | 自动度 |
|------|------|--------|
| Conda env 创建 + Node deps install | 10 min | 全自动 |
| 01 fetch PDB + 02 clean | 20 min | 全自动 |
| 03 pocket annotation + visual check | 30 min | 自动 + 1 次人眼 PyMOL view |
| 04 ligand prep (5 个) | 30 min | 全自动 |
| 05 Vina dock (10 runs, parallel) | 30 min | 全自动 |
| 06 mesh export (PyMOL 手工 view 调) | 90 min | 半自动 |
| Story outline doc + dialogue 5 txt | 60 min | 人工（Gemini 输出 mix-lang 化）|
| 验证：placeholder loader 测加载 < 3s on Quest | 30 min | 人工（依赖 F-001 完成）|
| Buffer | 30 min | — |

**Total**: ~5h（spec 给 4h，超 1h 由 F-008 outline 摊到本 issue 所致；F-008 落到 frontend 时该 1h 已省）。

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| Vina arm64 wheel 装失败 | 🟡 M | bioconda `vina` 支持 osx-arm64；fallback 用 Smina (Vina fork) |
| pymol-open-source vs commercial PyMOL 行为差异 | 🟡 M | 02/06 脚本只用基础 API（load/select/save/cartoon/surface），避商业-only 功能 |
| .glb 超 5MB cap | 🟡 M | gltf-pipeline draco 压缩 + surface mesh quadric decimation；cartoon 单独导出降单文件量 |
| Heme 在 1EQG / 1CX2 编号不一致 | 🟢 L | BioPython 按 HETATM resname `HEM` 选，不靠 residue number |
| Diclofenac 3D conformer 偏离生理构象 | 🟢 L | RDKit ETKDG 多采样 (numConfs=10) 取最低 MMFF energy |
| Vina pose 与文献 published pose RMSD > 3Å | 🟡 M | 启用 `seed=42` 可复现；若偏，扩 box 或加 exhaustiveness=16 |
| Frontend 加载 > 3s | 🟡 M | F-001 完成后实测；超时则 progressive loading（先 cartoon，surface lazy load） |

---

## Acceptance Criteria Mapping (Issue #7)

| Issue criterion | Deliverable | Status |
|----------------|------------|--------|
| COX-1 (PDB 1EQG) + COX-2 (PDB 1CX2) 清理后导出 .glb，文件 < 5MB | `cox{1,2}_{cartoon,surface}.glb` 配 draco 压缩验证 | pending |
| 5 ligands (celecoxib, rofecoxib, ibuprofen, naproxen, **diclofenac**) 3D conformer 导出 .glb | `ligands/{5 names}.glb`（**diclofenac 替 aspirin**，per Gemini story eval） | pending |
| Pocket annotation JSON：每个 target 的 pocket center xyz + 关键 residue list | `pocket_cox{1,2}.json` 含 Val523/Ile523 + ARG120/TYR385/SER530 + heme | pending |
| Vina 跑完 5×2 = 10 docking poses + scores | `vina_results.json` schema_version 1.0 | pending |
| 资产加载时间 < 3s（Quest browser 实测） | F-001 完成后联调验证 | blocked on #6 |

**Off-spec deliverable**（Gemini swap 引入）：
- aspirin → diclofenac（理由：aspirin covalent acetylation Ser530，与 reversible docking heuristic 不符）
- 须在 PR body 标注 swap，让 reviewer 看到偏差并核准

**Cross-track**（F-008 alignment）：
- `docs/features/0002-story-outline.md` 含 5-beat beat-sheet
- `pipelines/data/dialogue/dr_chen_beat_{1..5}.txt` (5 个 TTS 输入)

---

## Frontend Integration Notes

F-002 仅交付 **scoring inputs**（pocket JSON + vina_results.json），不交付运行时 scorer。Frontend (F-004 / F-005 / F-006) 负责 score 计算。F-002 的 data contract 故意 cadence-agnostic：同一份数据支持两种 UI loop。

### Scoring cadence (frontend 决定)

| 模式 | 触发 | 适用情境 |
|------|------|---------|
| **Streaming** | `requestAnimationFrame`，60fps 实时算 | Quest 3 perf 充裕；提供 "热感" feedback |
| **Click-confirm** | User 按 "Confirm Pose" 按钮触发一次 | streaming 抖动太大 / Quest perf 紧 / 教学上希望 user 主动 commit |

两种都用同一个 `score(user_pose, pocket_json, vina_best_pose) → number` 函数，同一份 F-002 数据。**F-002 spec 不锁定 cadence；F-004 implementation 时再选。**

### Scoring complexity tier (frontend 自调)

| Tier | 公式 | 计算成本 | 教学口径 |
|------|------|---------|---------|
| **Lv0 最简** | `1 - distance(user_centroid, vina_best_centroid) / d_max` | O(1) | "靠近正解 = 高分"；纯位置 shape match |
| **Lv1 推荐起点** | Lv0 `+ β·H-bond residue hits − γ·clash count` | O(N·M)，N=ligand atoms, M=key residues + protein heavy atoms | 加 chemical interaction + 物理罚则；spec 默认 |
| **Lv2 进阶** | Lv1 `+ RMSD penalty + π-stacking score` | O(N²) | 时间充裕再加 |

Quest 3 性能预算：Lv1 在 5 ligand atoms × ~500 protein heavy atoms / 4 key residues = ~2500 距离/帧，60fps 无压力。Streaming 模式 Lv1 可行。

### Redock / resubmit loop

Frontend 须实现 ligand reset-to-spawn 功能（user 不满意当前 pose → 一键回到起点重 dock）。每次 confirm 是一次 attempt。telemetry (F-007, issue #12) 可记录所有 attempts 或仅 best — 由 F-007 spec 决定，**F-002 不约束**。

### Best-pose 阈值（F-004 acceptance）

Spec issue #9 acceptance 写的 "distance < 3Å + 至少 2 个 H-bond hit"，前端可直接从 `vina_results.runs[(celecoxib, cox2)].best_pose.ligand_centroid` 取参考点 + 用 `pocket_cox2.json.key_residues` 的 H-bond donor/acceptor list 做命中判定。F-002 已提供两份数据，F-004 拼装即可。

---

## Out of Scope

- F-001 项目脚手架（issue #6, team:infra，他人在做）
- F-003 程序化 toy pocket（issue #8，与本 PDB 资产无关）
- F-004 / F-005 / F-006 frontend level 实现（消费本 issue 输出）
- F-007 telemetry endpoint
- F-008 TTS / cutscene / VR overlay 实现（仅交付 dialogue text）

---

## References

- Master plan: `docs/features/0001-overview.md`
- MVP design: `docs/superpowers/specs/2026-04-25-hackathon-mvp-design.md`
- Story eval (Gemini): `/tmp/gemini-story-out.md`（不 commit；本 spec 已吸纳关键决策）
- Wiki seeds: `[[bio-cox1-cox2]]`, `[[bio-nsaids-cox-inhibitors]]`, `[[bio-vioxx-case]]`, `[[bio-binding-pocket-fundamentals]]`, `[[bio-pdb-1eqg-1cx2]]`, `[[bio-vina-scoring-proxy]]`, `[[pedagogy-embodied-cognition]]`
- Kurumbail et al. *Nature* 1996 (COX-2 side pocket) — Val523/Ile523 selectivity origin
- Sung et al. *J. Chem. Educ.* 2020, 97, 147-153 — Cohen's *d* baseline
- BioPython: https://biopython.org/
- RDKit: https://www.rdkit.org/
- AutoDock Vina: https://vina.scripps.edu/
- PyMOL Open Source: https://github.com/schrodinger/pymol-open-source
- obj2gltf: https://github.com/CesiumGS/obj2gltf
- gltf-pipeline (draco): https://github.com/CesiumGS/gltf-pipeline
