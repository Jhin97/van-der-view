# van-der-view — 进度回顾会议
**日期**: 2026-04-27  
**分支**: `review/post-hackathon-2026-04-27`  
**完整记录**: [`docs/POST_HACKATHON_REVIEW.md`](POST_HACKATHON_REVIEW.md)

---

## 我们做了什么

一款**在 Quest 3 浏览器里直接运行的 WebXR 分子对接教育游戏**。无需安装 app——打开 URL，进入 VR，用双手学习药物发现。

**技术栈**: Vite + Three.js (WebXR) · Express + SQLite（遥测后端）· Python + AutoDock Vina（资产管线）

---

## 已交付的游戏流程

| 关卡 | 玩家做什么 | 状态 |
|------|-----------|------|
| **Hub 主菜单** | VR 扳机光线投射导航 | ✅ 已上线 |
| **Tutorial (L0)** | 抓取配体对齐到目标幽灵 | ✅ 已上线 |
| **L1 — 单次对接** | 将一个配体对接进 COX-2；HUD 评分 ≥ 0.70 通关 | ✅ 已上线 |
| **L2 — 排名 5 种 NSAIDs** | 从基座取出配体逐一对接，比较 ΔG 柱状图 | ✅ 已上线 |
| **L3 — 选择性对比** | COX-1 vs COX-2 + Vioxx 过场动画 | ⚠️ 已搭架，非交互 |
| **遥测系统** | 前后测问卷、session UUID、Cohen's d 脚本 | ✅ 已上线 |
| **资产管线** | COX-1/2 GLB 模型、5 种 NSAID 配体、Vina 对接姿态 | ✅ 已上线 |

---

## 关键工程亮点

- **场景切换死锁修复** — 在主动画循环里用 `try/finally` 保证 `transitioning` 标志必然释放
- **Hub 光线投射修复** — 扳机点击延迟一帧，避免矩阵过时问题
- **Tutorial 进度解锁** — 移除 `WAIT_SNAP` 的 `isHeld` 守卫，兼容仅用摇杆的操作流
- **6-DOF 抓取** — 平移与旋转解耦，旋转增益 2.5×
- **VR 里 ΔG 柱即时可见** — 绕过 `requestAnimationFrame` 在 VR 模式下暂停的陷阱
- **41 篇 Wiki 页面** 沉淀在 `.omc/wiki/` — Quest 3 特性、WebXR 模式、生物领域知识

---

## 未解决问题（来自真实用户反馈）

| 优先级 | 问题 | 影响 |
|--------|------|------|
| ⚠️ 中 | L1 入场说明可能让新用户迷失方向 | 理解度 |
| ❌ 高 | **无碰撞反馈** — 配体穿入蛋白质时没有任何触觉/视觉提示 | 沉浸感 & 教育效果 |
| ❌ 中 | 双手缩放一致性未验证（两只手是否对 ligand + protein 施加相同 scale factor？） | 手感 |
| ❌ 中 | 对接过程中无上下文提示（"Grip = 旋转，Trigger = 切换配体"） | 引导 |
| ❌ 中 | 通关反馈过于简陋，无评级或"做得好"说明 | 激励感 |

---

## 技术债

- `audio.rar`（6.5 MB）误 commit 到仓库根目录，代码中无引用
- `selection-debugging.txt`（15 KB）调试草稿，应提炼进 wiki 或直接删除
- `tmp/` 未加入 `.gitignore`，存在误提交风险
- `docs/pitch/` 保留 v1–v5，v5 是最终版，v1–v4 是冗余历史
- `CHANGELOG.md` `[Unreleased]` 为空——hackathon PR 未追加
- 无 CI 配置——`leader:auto-merge` 无法运行

---

## 未来工作

### P0 — 打磨 MVP 主循环（1–3 天）

1. **L1 入场说明重做** — 短暂过场提示："将配体对接到绿色口袋。Grip = 移动/旋转。Trigger = 抓取。"首次 grip 后自动关闭。
2. **碰撞反馈** — 配体穿入蛋白质时，手柄震动 + 配体闪红
3. **双手缩放统一** — 验证并修复：两只手 grip 共同作用于同一 transform 父节点
4. **通关庆祝** — Bronze / Silver / Gold 评级 + 一句"你做得好的点"
5. **接入 CI** — 添加 `npm ci && npm test` GitHub Action，解锁 `leader:auto-merge`

### P1 — L3 正式体验（3–5 天）

6. **L3 交互化** — 用手柄主动对比 COX-1/COX-2，再由玩家触发选择性揭示，替换现有 5s 计时器
7. **场景内配体选择器** — Trigger 循环切换 5 种 NSAIDs，从预计算 Vina 表实时刷新评分
8. **跨 session 成绩持久化** — 最佳分存入遥测 DB，Hub 菜单显示徽章

### P2 — 管线 & 工具（1–2 周）

9. **资产管线 CI 门控** — 锁定 Python 依赖，快照 PDB 输入，Vina 结果漂移时构建失败
10. **教师遥测仪表板** — 基于 `data/telemetry.db` 的 HTML 页面，展示前后测 effect size
11. **问卷 schema 迁移** — 版本化 schema，每条响应携带 `schema_id`
12. **回填 CHANGELOG + 打 `v0.1.0` tag**

---

## 更大方向（待头脑风暴后立票）

| 方向 | 想法 |
|------|------|
| 教学 | 课程阶梯：L4 酶动力学 → L5 变构调节 → L6 片段生长，每级对应真实药物故事 |
| 教学 | 与教育者合作重写前后测题库（Bloom's verbs，小规模 pilot） |
| UX | 双手撑开结合口袋——演示诱导契合 |
| UX | 分级提示系统：触觉轻推 → 幽灵闪烁 → 完整幽灵显示，使用情况记入遥测 |
| UX | 回放 & 截图导出：最佳对接姿态导出 PNG + JSON，支持同伴互评 |
| 平台 | Hand-tracking 路径 — 指尖选残基，消除 trigger vs grip 认知负担 |
| 平台 | Quest 3S 兼容性审计（参见 `.omc/wiki/quest3-vs-quest3s.md`） |
| 平台 | Boltz-2 / OpenFold3 钩子 — 教师上传 PDB，管线自动生成 GLB + Vina 姿态 |
| 商业 | 将 `pitch-v5.html` 托管到稳定 URL，用于投资人跟进 |
| 商业 | n ≥ 30 后发布 Cohen's d 案例报告——可复用为营销 & 申请材料 |
| 商业 | 在外部贡献者加入前确定开源协议（MIT vs Apache-2.0） |

---

## 清理计划（需确认后执行）

**低风险，可立即做**
- [x] `.gitignore` 追加 `audio.rar`、`*.rar`、`tmp/`、`selection-debugging.txt`、`**/.DS_Store`
- [ ] `tmp/feedback.md` → `docs/user-feedback-hackathon.md`（保留为历史记录）

**需要确认后删除**
- [ ] 删除 `audio.rar`（6.5 MB 二进制，代码无引用）
- [ ] 删除 `selection-debugging.txt`（精华先提炼进 wiki）
- [ ] 删除 `tmp/`（feedback.md 迁移后）
- [ ] 删除 `docs/pitch/pitch-v1.html` 至 `pitch-v4.html`，保留 v5

**仓库卫生**
- [ ] 回填 `CHANGELOG.md` `[Unreleased]` 条目
- [ ] 从 `main` 打 `v0.1.0` tag
- [ ] 配置 GitHub Action：`npm ci && npm test`
- [ ] 清理已合并远程分支（`001`、`003`、`004a`、`005`、`frontend/16-*` 等）
