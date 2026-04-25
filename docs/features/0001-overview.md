# Project Overview

## Executive Summary
本项目旨在通过 Extended Reality (XR) 与 AI 辅助创作 (AI-assisted authoring) 技术，解决 Medicinal Chemistry 教育中的核心认知瓶颈：即学习者在 2D 结构表征与 3D Spatial Reasoning 之间的转换鸿沟。通过将 Molecular Docking 过程高度游戏化，本项目使学习者能够直接在 Protein Binding Pocket 中操控 Molecular Entity，从而建立对 Structure-Activity Relationships (SAR) 与分子互补性 (Molecular Complementarity) 的具身认知 (Embodied Understanding)。依托“Open-source Runtime + AI-native Workflow”的技术架构，本项目在 24 小时内实现了从传统可视化工具向高参与度教学平台的跨越。

## Target Learners
本平台主要面向具备基础 Organic Chemistry 与 Molecular Biology 知识的学习者：
*   **Primary Audience**: 药学 (Pharmacy)、药物化学 (Medicinal Chemistry) 方向的高年级本科生 (Upper-undergraduate) 与研究生 (Graduate students)。
*   **Secondary Audience**: 寻求职业发展的实验室研究员 (Wet-lab researchers)，尤其是计划转向 Computational Drug Discovery 领域的专业人士，为其提供直观的理论桥梁。

## Learning Objectives
完成本模块后，学习者将能够：
1.  **Identify**: 在 Active Site 内识别关键 Amino Acid Residues 并描述其 Physicochemical Properties (Bloom: Knowledge)。
2.  **Evaluate**: 基于 Shape Complementarity 与分子间作用力 (Intermolecular Forces) 评估不同 Ligand 的 Binding Affinity (Bloom: Analysis)。
3.  **Design**: 通过 Fragment-based Assembly 优化子口袋 (Sub-pocket) 结合，设计新型 Lead Compounds (Bloom: Synthesis)。
4.  **Synthesize**: 制定选择性策略 (Selectivity Strategy)，在最大化 Target Protein 亲和力的同时，最小化 Off-target 或 Anti-target 相互作用 (Bloom: Evaluation)。

## Pedagogical Framework
本项目的教学设计根植于 **Embodied Cognition** (具身认知) 与 **Situated Learning** (情境学习) 理论，并严格遵循 Mayer (2014) 的 **Cognitive Theory of Multimedia Learning**。
在传统的 2D 环境下，学生需耗费大量认知资源 (Cognitive Load) 进行复杂的 Mental Rotation；而 VR 环境通过调用本体感受 (Proprioceptive) 与空间感，让学习者直观“感受” Binding Pocket 的几何约束，从而释放认知带宽，专注于核心的 Chemical Logic。

**Evidence Base**: 
Sung 等人 (2020) 在 Carleton College 的研究表明，移动端 AR 操作相比 PyMOL 在识别分子间相互作用方面的效应量达 Cohen's *d* = 0.97 (Large effect)。本项目通过 VR Haptics 与 5 级阶梯式难度设计，预期在提升 Spatial Reasoning 方面具有显著潜力。然而，考虑到 VR 设备存在一定的 Onboarding Overhead (入门门槛)，本项目将在 Pilot 阶段采用与 Sung 等人相同的测量工具 (Pre/Post Survey) 进行内部验证，以客观评估其实际效应量。

## Design & User Experience
系统采用 VR Haptics 模拟分子间作用力的“推拉感”，并由 AI 驱动的资产管线提供实时反馈：
*   **Visual Force Fields**: 实时 Mesh Gradient 显示位阻碰撞 (Steric Clash) 或 Van der Waals Overlap。
*   **Vectorial Indicators**: 动态显示 H-bond Donor-acceptor Geometry 与 Pi-stacking Alignment。
*   **Quantitative Overlays**: 基于经验力场 (Empirical Force Field) 提供 ΔG Approximation 动态评分。

### Accessibility & Safety
针对 XR 环境的特殊性，本项目实施了多重保障措施：
*   **Vestibular Comfort**: 优化移动算法，最小化前庭系统不匹配导致的晕动症 (Vestibular Issues)。
*   **Alternative Controls**: 为存在细微动作障碍的用户提供手势映射与控制器辅助。
*   **Visual Optimization**: 采用高对比度、Color-blind Palette 色彩方案以适配视觉差异。
*   **Session Management**: 设定单次教学时长限制 (Session Length Caps)，防止过度疲劳。
*   **Web Fallback**: 提供 Web 端访问层级，主要用于 Preview、Homework 或作为基础辅助工具，确保无硬件环境下的教学公平。

## Assessment & Progression
五级阶梯式挑战体系将复杂的药理概念解构为可量化的评估指标（需注意：当前评分机制为 Educational Proxy，主要用于教学反馈而非科研级 Lead Optimization）：

1.  **Level 1: Rigid Docking** (互补性入门)
    *   *Skill*: 识别 Shape Complementarity。
2.  **Level 2: Quantitative Scoring** (分子间力分析)
    *   *Skill*: 拆解 H-bond、Salt Bridge 与 Hydrophobic Effect 对 Binding Affinity 的贡献。
3.  **Level 3: Selectivity & Off-Target Profiling**
    *   *Skill*: 将 Ligand 对接入相似蛋白（如 COX-1 vs. COX-2）。引用 Vioxx (Rofecoxib) 案例作为戒鉴，强调 Selectivity Window 对降低毒副反应的关键性。
4.  **Level 4: Bioisosteric Replacement** (先导化合物优化)
    *   *Skill*: 应用 SAR 原则替换 Functional Group，满足特定 Pharmacophore Requirement。
5.  **Level 5: De Novo Design** (合成探索)
    *   *Skill*: 在空白 Pocket 中使用 Fragment Library 装配新分子。学习者需平衡 Drug-likeness (Lipinski's Rule of 5) 与结合强度。

## Background & Prior Art
在 Molecular Visualization 领域，本项目处于 BioBLOX 的教学实验性与 Nanome 的专业协作性之间的真空地带：
*   **BioBLOX** (Goldsmiths/Imperial): 证明了 Gamified Docking 的教育潜力，但其 K-12 定位导致内容深度有限，且受限于 2018 年的硬件与非 AI 管线。本项目继承其“AI-assisted Authoring”的技术愿景，但精准转向 Higher Education 市场。
*   **BiochemAR** (Carleton College): 为 Immersive 3D 优于 2D Viewer 提供了核心数据支撑。本项目将其单点实验扩展为完整的 5-level Curriculum。
*   **Nanome**: 作为行业标杆，Nanome 专注于 Enterprise Pharma 的协作办公。本项目的差异化在于：专注 **Open-source Toolchain** (RDKit, AutoDock Vina)；显著降低的 Onboarding 时间；以及针对学术机构定制的、符合 Bloom 指标的课纲化设计 (Curriculum-first)，而非单纯的工具包。
*   **Adjacent Tools**: 平台参考了 Foldit (UW) 的众包反馈、mol* (RCSB) 的高性能渲染以及 ChimeraX (UCSF) 的交互标准，将其整合为适合教学的轻量化工作流。

## Risks & Open Questions
作为前沿探索项目，我们坦诚面对以下技术与法律挑战：
*   **AI Fidelity**: AI 生成的关卡需要 Medicinal Chemist 作为 SME (Subject Matter Expert) 进行严格审计，以纠正可能出现的 H-bond Geometry 幻觉或非物理结合模式。
*   **Scientific Limitations**: 平台评分仅为教育模拟，真实的药效评估需要 FEP (Free Energy Perturbation) 或全原子 MD (Molecular Dynamics) 模拟，这超出了当前实时算力的范畴。
*   **Intellectual Property**: PDB 数据的商业化使用及 Open-source 协议的商业分发路径仍需合规审查。
*   **Cognitive Load**: 尽管 VR 具身操作能降低空间认知负荷，但头显操作的 Onboarding 过程可能增加额外的教学开销。

## Value Proposition
1.  **AI-native Authoring**: 利用 Claude / Codex / Gemini 进行“Vibe-coding”，使教学关卡的生成周期从月级缩短至小时级。
2.  **Pedagogy-first Design**: 交付的是完整的 Curriculum，而非单一的 Viewer。
3.  **Low-friction Entry**: 适配消费级 Quest 头显，结合 Web 端的 Homework Tier，降低院校部署成本。

## Stretch / Business Path
*   **Educational SaaS (Core)**: 针对药学院与 Bootcamp 提供订阅制服务，集成教室管理后台与 LTI 标准。
*   **Mid-market Biotech Room (Extension)**: 为中型生物技术公司提供高性价比的 VR 讨论空间。不同于 Nanome 的全家桶模式，我们聚焦于 Open-source 栈的快速集成，支持 Medicinal Chemist 在合成前进行 Hit-list 的协同走查。
*   **Speculative Vision**: 借鉴 Foldit 模式，探索将用户产生的教育解决方案转化为科研反馈环的可能性。
