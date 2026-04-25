# Hackathon MVP Design — XR Rational Drug Design Educational App

**Date**: 2026-04-25
**Status**: Brainstormed, awaiting user review
**Scope reference**: `docs/features/0001-overview.md` (master project plan)
**Authoring**: User dialogue + Claude Opus 4.7 (orchestrator) via `superpowers:brainstorming` skill

---

## Goal

在 24 小时 hackathon 内交付一个 Quest 3 native VR 教学 demo，让 judges 亲手体验 embodied 3D molecular docking，并通过 Level 1→3 的 pedagogical curriculum 验证从 onboarding 到 selectivity reasoning 的完整学习弧。

## Non-goals

- Web fallback（仅 Quest 3 native via Quest browser，不支持 desktop / mobile / WebXR emulator demo）
- Public deployment、云端 hosting、SaaS infrastructure
- Meta 账号 / oculus.com / 任何外部 OAuth 流
- 完整 5-level 内容（Levels 4-5 留待后续 sprint）
- Multi-user / collaborative VR（单用户 session）
- 商业级 scoring (FEP / MD)，仅 educational proxy
- Real-time AutoDock Vina 计算（统一 precomputed）

---

## Constraints

| Constraint | Detail |
|------------|--------|
| **Time** | 24h 实操 + 赛前 prep（asset pipeline 允许提前跑） |
| **Hardware** | Quest 3 (single device for demo); macOS dev laptop |
| **Network** | Localhost only — 无公网域名、无 HTTPS 证书、无云服务 |
| **Identity** | 零 Meta 账号、零外部 OAuth |
| **Stack** | Vite + Three.js + WebXR API（or `@react-three/xr`），Node.js + SQLite 后端 |
| **Casting** | `scrcpy` (USB-C 镜像 Quest 3 到 laptop)，开源，零账号 |
| **Asset license** | 仅用 RCSB PDB 公开结构 + 公开 ligand SMILES |

---

## North-star Demo (3-min judge flow)

| 时间 | 内容 |
|------|------|
| 0:00 | Judge 戴 Quest 3，启动 app — intro voiceover (lead scientist 旁白，15s) |
| 0:15 | Tutorial mode — toy pocket 玩具关卡，3 个交互式提示教 grab / rotate / snap (60s 速通) |
| 1:15 | Game Hub 出现 — 三个 portal 进 L1/L2/L3 |
| 1:20 | L1: dock celecoxib 进 COX-2，real-time score readout (60s) |
| 2:20 | 跳到 L3: Vioxx 叙事 flashback (rofecoxib 上市/撤市闪回 cutscene) → COX-1 vs COX-2 selectivity 双 pocket 对比 (30s) |
| 2:50 | Wrap card: post-survey + 实时 effect-size 仪表盘截屏 (10s) |

L2 在 demo 中可跳过（hub 显示完成度但 demo 不必走全部）。

---

## Architecture

```
┌─────────────────────────┐         ┌──────────────────────┐
│  macOS Dev Laptop        │         │  Quest 3 Headset      │
│                          │         │                       │
│  Vite dev server :5173   │◄────────┤  Quest browser        │
│   - Three.js scene       │  adb    │   - WebXR session     │
│   - WebXR session        │  reverse│   - Hand controllers  │
│   - Static assets        │         │                       │
│   (./public)             │         │                       │
│                          │         │                       │
│  Node telemetry :5174    │◄────────┤  Survey + events      │
│   - Express endpoint     │         │   POST /api/telemetry │
│   - SQLite ./data/*.db   │         │                       │
│                          │         │                       │
│  scrcpy window           │◄────────┤  Mirror display       │
│   (60fps, USB-C)         │         │                       │
└─────────────────────────┘         └──────────────────────┘
```

**State machine**:
`Boot → Tutorial (toy pocket) → Game Hub → L1 → L2 → L3 → Wrap (post-survey) → Credits`

每个 state 之间穿插 narrative beat（4 个：intro / pre-L1 / pre-L3 Vioxx flashback / wrap retrospective）。

---

## Asset Pipeline

| Step | Tool | Output |
|------|------|--------|
| 1. Fetch PDB | `wget` from RCSB | `1EQG.pdb` (COX-1), `1CX2.pdb` (COX-2) |
| 2. Clean & strip | PyMOL script | 去 water、ligand、alt confs，留 cofactor heme |
| 3. Pocket annotation | PyMOL + 手工 | `pocket-{cox1,cox2}.json`（pocket center xyz + key residue list: ARG-120, TYR-355, GLU-524 etc.） |
| 4. Mesh export | PyMOL `save .obj` → `obj2gltf` | `cox1.glb`, `cox2.glb` (cartoon ribbon + surface mesh) |
| 5. Ligand prep | RDKit | celecoxib, rofecoxib, ibuprofen, naproxen, aspirin → 3D conformers SDF |
| 6. Ligand mesh | OpenBabel + `obj2gltf` | `{ligand}.glb` × 5 |
| 7. Vina docking | AutoDock Vina | 每对 (ligand × target) 跑 docking，导出 best pose + score → `vina-results.json` |
| 8. Toy pocket | Three.js procedural | 球形 pocket + 3 个 H-bond donor/acceptor 标记，无 PDB 来源 |

**Pre-prep**：以上步骤 1-7 在 hackathon 开始前跑完，hackathon 期间仅消费 .glb + JSON。

---

## Scoring Model

教学 proxy，非真实 lead optimization：

```
score = α · (1 - normalize(distance_to_best_pose))
      + β · h_bond_residue_hit_count
      - γ · steric_clash_penalty
```

参数：α=0.6, β=0.3, γ=0.1（demo 阶段手调）。

- `distance_to_best_pose`: 用户 ligand 中心到预计算 Vina best pose 中心的欧氏距离
- `h_bond_residue_hit_count`: ligand 表面到关键 residue（pocket annotation 列表）距离 < 3.5Å 的数量
- `steric_clash_penalty`: ligand atom 与 protein 表面距离 < 1.0Å 的数量

**Disclaimer**: UI 上显示 "Educational score (proxy)" 标签，不号称等价 ΔG。引用 spec：`Score is an educational proxy aligned to precomputed Vina docking poses; real-world lead optimization requires FEP / MD beyond hackathon scope.`

---

## Story Wrapper

Lead scientist persona "Dr. Chen"（virtual mentor），TTS 旁白（hackathon 期间 fallback 纯文字字幕）：

| Beat | 触发点 | 内容 (≤60s) |
|------|--------|------------|
| **Intro** | Boot | "Welcome to the lab. Today we hunt selective inhibitors. First, let's calibrate your hands…" |
| **Pre-L1** | 进 L1 portal | "Celecoxib — a COX-2 inhibitor approved 1998. Find its sweet spot in the pocket." |
| **Pre-L3 Vioxx flashback** | 进 L3 portal | "2004. Rofecoxib — Vioxx — pulled from market. 88,000+ heart attacks attributed. Why? Selectivity matters. Look closely at COX-1 vs COX-2…" |
| **Wrap** | 完成所有 levels | "What you just felt — the difference of 5Å between two pockets — is the line between drug and disaster. Survey loaded; tell me what stuck." |

**风险降级**：TTS 难度高时 fallback 纯文字 card 显示 60s 自动 advance。

---

## Telemetry & Survey

**Pre-survey** (Boot 后立即弹 2D overlay)：
1. 自评 3D 分子结构理解 (1-7 Likert)
2. 自评 binding pocket 概念熟悉度 (1-7)
3. 自评 selectivity 概念熟悉度 (1-7)
4. 受教育程度（pulldown）

**Post-survey** (Wrap 显示)：1-3 同 pre + 加：
5. 这次 demo 与 PyMOL/2D viewer 对比哪个更易识别 molecular interactions (1-7)
6. 自由文本 (≤200 chars)

**Endpoint**: `POST /api/telemetry` (localhost:5174) → SQLite `./data/sessions.db`
**Schema**: `(session_id, ts, event_type, level, score, survey_pre, survey_post, free_text)`

**Effect-size dashboard**：demo 后跑 `node scripts/effect-size.mjs` 输出 Cohen's *d* 表（pre vs post 配对，仿 Sung et al. 2020 instrument）。

---

## Features (F-001..F-008) — 提交给 Leader Ingest

> 以下 schema 符合 `/ingest-project-plan` 的 `## Features` 格式：`F-<id>` + `**Team:**` + `**Priority:**` + `**Depends on:**` + `#### Acceptance` checkbox list。

### F-001 — Project scaffold + Quest 3 deploy pipeline
**Team:** team:infra
**Priority:** priority:p0
**Depends on:** —
#### Acceptance
- [ ] Vite + Three.js + WebXR 项目脚手架就位
- [ ] Quest 3 通过 USB-C `adb reverse tcp:5173 tcp:5173` 访问 laptop localhost
- [ ] WebXR session 在 Quest browser 启动，hand controllers tracked
- [ ] Teleport locomotion + 基础 grab interaction 跑通
- [ ] `scrcpy -d` 一行命令镜像头显到 laptop 60fps

### F-002 — Asset pipeline: COX-1/2 + 5 ligands + precomputed Vina
**Team:** team:data
**Priority:** priority:p0
**Depends on:** —
#### Acceptance
- [ ] COX-1 (PDB 1EQG) + COX-2 (PDB 1CX2) 清理后导出 .glb，文件 < 5MB
- [ ] 5 ligands (celecoxib, rofecoxib, ibuprofen, naproxen, aspirin) 3D conformer 导出 .glb
- [ ] Pocket annotation JSON：每个 target 的 pocket center xyz + 关键 residue list
- [ ] Vina 跑完 5×2 = 10 docking poses + scores，存 `vina-results.json`
- [ ] 资产加载时间 < 3s（Quest browser 实测）

### F-003 — Tutorial mode (toy pocket)
**Team:** team:frontend
**Priority:** priority:p0
**Depends on:** F-001
#### Acceptance
- [ ] 程序化生成的 toy pocket（球形 + 3 个 H-bond marker），无 PDB 依赖
- [ ] Step-by-step 提示：grab → rotate → snap-to-pocket
- [ ] Visual force field overlay：steric clash 红色 + H-bond vector 蓝色
- [ ] 完成时间 3-5 min（pilot 实测）
- [ ] 无死锁 / 无 stuck state

### F-004 — Game Hub + L1: COX-2 dock celecoxib
**Team:** team:frontend
**Priority:** priority:p0
**Depends on:** F-001, F-002, F-003
#### Acceptance
- [ ] Hub 场景：3 个 portal，按完成度门禁
- [ ] L1 场景加载 COX-2 + celecoxib
- [ ] 实时 score readout（heuristic 公式见设计文档）
- [ ] Best-pose detection threshold 调通（distance < 3Å + 至少 2 个 H-bond hit）
- [ ] 完成时间 2-4 min

### F-005 — L2: COX-2 score 5 NSAID analogs
**Team:** team:frontend
**Priority:** priority:p1
**Depends on:** F-002, F-004
#### Acceptance
- [ ] L2 场景：COX-2 + 5 ligand 选择面板
- [ ] 每个 ligand dock 后输出 score
- [ ] VR-native bar chart 展示 5 个 affinity 排名
- [ ] 排名顺序与 Vina ground truth 一致
- [ ] Narrative card：H-bond / hydrophobic 贡献分解说明

### F-006 — L3: COX-1 vs COX-2 selectivity + Vioxx flashback
**Team:** team:frontend
**Priority:** priority:p0
**Depends on:** F-002, F-004
#### Acceptance
- [ ] L3 场景：双 pocket 并排（COX-1 左 / COX-2 右）
- [ ] Rofecoxib (Vioxx) docked 进两个 target，selectivity ratio 显示
- [ ] Vioxx 叙事 flashback cutscene 触发（≤45s）
- [ ] Wrap card 总结 lessons learned

### F-007 — Pre/post Likert survey + telemetry
**Team:** team:data
**Priority:** priority:p1
**Depends on:** F-001
#### Acceptance
- [ ] Pre-survey 4 题 + Post-survey 6 题（含 PyMOL 对比项 + 自由文本）
- [ ] 2D overlay UI（in-VR DOM overlay 或 Three.js plane）
- [ ] Express endpoint POST /api/telemetry → SQLite
- [ ] `scripts/effect-size.mjs` 输出 Cohen's *d* CSV
- [ ] Schema 与 Sung et al. 2020 可比

### F-008 — Story wrapper + TTS narration
**Team:** team:frontend
**Priority:** priority:p2
**Depends on:** F-003, F-004, F-006
#### Acceptance
- [ ] 4 个 narrative beats（intro / pre-L1 / pre-L3 / wrap）
- [ ] 每个 beat ≤60s
- [ ] TTS（首选 Web Speech API or 预录 .mp3）
- [ ] Skip 按钮可用
- [ ] Fallback：TTS 失败时纯文字 card 显示

---

## Dependency DAG

```
F-001 (scaffold) ──┬─ F-003 (tutorial) ──┐
                   │                      └─ F-008 (story)
                   │                      ┌──────────────┘
                   ├─ F-004 (Hub + L1) ──┬─ F-005 (L2)   [p1, optional]
                   │                      └─ F-006 (L3, p0, Vioxx)
                   │      ▲                ▲
                   │      │                │
                   ├──────┴────────────────┘
                   │   F-002 (assets — blocks all level features)
                   │
                   └─ F-007 (survey/telemetry, parallel track)
```

**Critical path** (p0 only): F-001 (2h) → F-002 (4h) → F-004 (3h) → F-006 (3h) ≈ 12h
**Optional**: F-005 (L2, p1) — can be cut if time-boxed; L3 unaffected
**Parallel tracks**: F-003、F-007、F-008

---

## Time Budget (24h)

| Feature | 估时 | 累计 (critical path, p0 only) |
|---------|------|------------------------------|
| F-001 (scaffold + Quest 3 wiring) | 2h | 2h |
| F-002 (assets — pre-prep 部分) | 4h | 6h |
| F-003 (tutorial) | 3h | (并行) |
| F-004 (Hub + L1) | 3h | 9h |
| F-005 (L2, **optional p1**) | 2h | (并行 / 可砍) |
| F-006 (L3 + Vioxx) | 3h | 12h |
| F-007 (survey/telemetry) | 1h | (并行) |
| F-008 (story) | 3h | (并行) |
| **Buffer + dry-run** | 3h | 15h critical + 9h reserve |

**Strategy**: F-002 至少 50% 在赛前 prep 完成，否则 critical path overrun 风险高。F-005 时间紧时优先砍——L3 已解耦，demo 仍可走通 Tutorial → L1 → L3。

---

## Risks & Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| F-002 资产 pipeline overrun | 🔴 H | 赛前 prep；至少 PDB 清理 + Vina runs 提前完成 |
| Quest 3 USB 线缆掉线 | 🔴 H | 备 2 根 USB-C 线；demo 前 5 min 重连 `adb reverse` |
| WebXR API 不支持某交互 | 🟡 M | 早期 spike；F-001 完成时验证 grab + teleport 功能 |
| TTS 不稳 / 不好听 | 🟡 M | F-008 fallback 纯文字 card；预录 .mp3 兜底 |
| Heuristic scoring 与 Vina 排序不一致 | 🟡 M | F-005 acceptance 内 ranking 对齐校验；不一致时调 α/β/γ |
| Quest sleep 中断 demo | 🟡 M | 设置常亮 + 摘下提醒禁用 |
| Pilot user 晕动症 | 🟢 L | Teleport locomotion 默认（无 smooth move）；session ≤10 min |
| AI generated assets 错（H-bond geometry 幻觉）| 🟡 M | F-002 SME review；只用真实 PDB + Vina 不依赖 LLM 生成结构 |

---

## Demo Runbook (赛前 30 min)

```bash
# 1. 启 dev server
cd /Users/chunan/abYcloud/projects/van-der-view
pnpm dev          # Vite on :5173

# 2. 启 telemetry
node scripts/telemetry-server.mjs   # Express on :5174

# 3. USB 接 Quest 3, 启 ADB 桥
adb devices       # 确认 Quest 3 列出
adb reverse tcp:5173 tcp:5173
adb reverse tcp:5174 tcp:5174

# 4. 启 mirror
scrcpy -d --max-fps=60 --window-title="Quest 3 Demo"

# 5. 头显内打开 Quest browser → http://localhost:5173

# 6. 检查清单
# [ ] Vite hot-reload 工作
# [ ] WebXR session 起来
# [ ] Hand controllers tracked
# [ ] scrcpy 60fps
# [ ] /api/telemetry 接收事件 (浏览器 devtools 看 200 OK)
```

---

## Out of Scope (Future Sprints)

- Levels 4-5 (Bioisosteric Replacement, De Novo Design)
- Web fallback / mobile / desktop
- Multi-user collaboration
- Real-time AutoDock Vina（需 server-side compute）
- Curriculum dashboard / LTI integration
- Mid-market biotech B2B tier
- Citizen-science crowdsourced docking loop

---

## Acceptance Criteria (Whole MVP)

- [ ] Judge 3-min demo 能完整跑通：Boot → Tutorial → L1 → L3 → Wrap
- [ ] Quest 3 上 60fps 稳定，无明显卡顿
- [ ] Pre/post survey 收集到 ≥3 个 pilot 数据点（队友自测）
- [ ] Cohen's *d* 仪表盘 demo 可现场展示
- [ ] scrcpy 镜像 60fps 在 laptop 显示
- [ ] `docs/superpowers/specs/2026-04-25-hackathon-mvp-design.md` 提交
- [ ] Followup PR 把 `## Features` block append 到 `docs/features/0001-overview.md` (或新建 `docs/PROJECT_PLAN.md`)，触发 `/ingest-project-plan` 自动生成 8 个 issue

---

## References

- Master overview: `docs/features/0001-overview.md`
- Project orchestration: `docs/team-orchestration.md`, `CLAUDE.md`
- Sung et al. 2020 (BiochemAR effect-size paper): `docs/reference/biochemar-an-augmented-reality-educational-tool-for-teaching-macromolecular-structure-and-function (1).pdf`
- BioBLOX prior art: https://www.doc.gold.ac.uk/bioblox/
- BBSRC grant BB/R01955X/1: https://gtr.ukri.org/projects?ref=BB%2FR01955X%2F1
- Nanome competitor: https://nanome.ai/
- scrcpy: https://github.com/Genymobile/scrcpy
- WebXR spec: https://immersive-web.github.io/webxr/
- Three.js: https://threejs.org/
