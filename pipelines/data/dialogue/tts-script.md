# TTS Script — Dr. Chen Voice Lines

Voice persona: **Dr. Chen** — confident, scientifically precise, mentorly. No marketing fluff.
Target WPM: 130. Max duration per line: 60 seconds.

---

## Beat 1 — Intro (Game Hub / Onboarding)

**File**: `dr_chen_beat_1_intro`

Welcome, Researcher. We are targeting inflammation. Our enzyme of interest is cyclooxygenase — COX-2, the spark of pain and fever. But COX-2 has a twin, COX-1, that protects the lining of your stomach and helps your platelets do their job. Hit one, you save lives. Hit both, you bleed your patients. Today you learn to tell them apart, atom by atom. Calibrate your hands; we begin in the active site.

---

## Beat 2 — The Discovery (Level 1: Dock Celecoxib)

**File**: `dr_chen_beat_2_discovery`

Meet celecoxib. Look at the back wall of this pocket — there is a side cavity that COX-1 does not have. One residue makes the difference: Valine 523 in COX-2, Isoleucine 523 in COX-1. A single methyl group, and the geometry opens up. Celecoxib carries a sulfonamide tail designed to slot into that side pocket. Your task: find the snap. Bring the sulfonamide home.

---

## Beat 3 — The Ranking (Level 2: Rank NSAIDs)

**File**: `dr_chen_beat_3_ranking`

Good fit. But chemistry is rarely binary. Naproxen, ibuprofen, diclofenac — these traditional NSAIDs hit both isoforms with varying enthusiasm. Rank them now. Look for the highest binding affinity in COX-2 without crippling COX-1. This is structure-activity relationship in motion: every methyl, every halogen, every charge nudges the score. Choose carefully.

---

## Beat 4 — The Vioxx Flashback (Level 3: Cutscene)

### Sub-beat 4a — Vioxx Introduction

**File**: `dr_chen_beat_4a_vioxx_intro`

Approved 1999. Rofecoxib — Vioxx. The most selective COX-2 inhibitor ever designed. It bound COX-2 with surgical precision and left COX-1 completely alone. No stomach bleeding. A triumph of rational drug design.

### Sub-beat 4b — The Mechanism

**File**: `dr_chen_beat_4b_mechanism`

But COX-2 in your blood vessels produces prostacyclin, PGI2, which prevents clots. COX-1 produces thromboxane A2, TXA2, which promotes clotting. These two keep your blood in balance.

### Sub-beat 4c — The Imbalance

**File**: `dr_chen_beat_4c_imbalance`

By blocking COX-2 everywhere, Vioxx wiped out prostacyclin. Thromboxane, unchecked, ran hot. The balance tipped toward clots. 88,000 heart attacks. Withdrawn September 2004.

### Sub-beat 4d — The Lesson

**File**: `dr_chen_beat_4d_lesson`

Selectivity is not safety. A perfect score in one pocket does not mean a safe drug. The body is a system, and every target has roles we may not yet understand.

---

## Beat 5 — The Horizon (Level 3: Wrap / Completion)

**File**: `dr_chen_beat_5_horizon`

You felt it — the difference of one methyl group, the cost of perfect selectivity, the geometry that decides who lives. Rational design is not just the strongest click in a pocket. It is the whole system: every off-target, every metabolite, every patient. Record what you learned. There are more targets to hunt, and they will not wait.

---

## Level Briefings (Task Panels)

### L1 Brief — Biology

**File**: `l1_brief_biology`

Cyclooxygenase-2, or COX-2, is an enzyme you will find upregulated during inflammation. It is responsible for the synthesis of prostaglandins, the lipid mediators that signal pain, fever, and swelling in your body. By pharmacologically blocking this enzyme, we can achieve a potent anti-inflammatory effect. However, you must be precise. COX-1 is the housekeeping twin of COX-2, responsible for protecting your gastric mucosa and regulating platelet thromboxane. Non-selective inhibitors can damage the stomach, so your goal is to recognise the subtle structural differences that allow for COX-2 selectivity.

### L1 Brief — Engineering

**File**: `l1_brief_engineering`

Your mission is to perform a molecular docking operation. Using your controllers, you must grab the celecoxib molecule and manually orient it within the COX-2 active site. Your objective is to block the catalytic channel so that the natural substrate, arachidonic acid, can no longer fit. To succeed, you must maximise shape complementarity and establish at least two hydrogen-bond contacts with the marquee residues indicated in your display. Pay close attention to the spatial orientation of the sulfonamide group.

### L2 Brief — Biology

**File**: `l2_brief_biology`

Five common NSAID analogs all bind COX-2, but with markedly different affinities. Two are designed for COX-2 selectivity: celecoxib and rofecoxib. Three are non-selective workhorses: diclofenac, naproxen, and ibuprofen. Your job is to rank them.

### L2 Brief — Engineering

**File**: `l2_brief_engineering`

Each pedestal lights up an analog. Trigger a pedestal to reveal that ligand's predicted delta-G in kilocalories per mole on the bar chart and its narrative card. Lower, more negative, means tighter binding. Activate all five to complete the level. Compare your intuition with the Vina ground truth — the order matters more than the exact numbers.

---

## Residue Notes (Contextual — L1)

### VAL523

**File**: `l1_residue_val523`

This smaller valine residue acts as a selectivity gatekeeper. It opens a side pocket in COX-2 that is blocked by isoleucine in COX-1.

### ARG120

**File**: `l1_residue_arg120`

Located at the channel mouth, this residue anchors the polar sulfonamide head of celecoxib through critical electrostatic and hydrogen-bonding interactions.

### TYR385

**File**: `l1_residue_tyr385`

A key hydrogen-bond donor situated deep within the active site. It interacts with the sulfonamide oxygens to stabilise the docked ligand pose.

### SER530

**File**: `l1_residue_ser530`

While famously acetylated by aspirin to inhibit COX activity, for celecoxib, this residue provides spatial context rather than a direct binding link.

---

## Ligand Taglines (Contextual — L2)

### Celecoxib

**File**: `l2_tagline_celecoxib`

Selective COX-2 inhibitor. Sulfonamide head hydrogen-bonds to Arg120 and His90. Trifluoromethylphenyl ring fills the Val523 side pocket.

### Rofecoxib

**File**: `l2_tagline_rofecoxib`

Methylsulfonyl variant. Slightly fewer hydrogen bonds than celecoxib but very tight hydrophobic packing in the side pocket. Withdrawn, Vioxx, for cardiovascular reasons unrelated to docking.

### Diclofenac

**File**: `l2_tagline_diclofenac`

Non-selective NSAID. Carboxylate hydrogen-bonds Arg120 at the channel mouth, but the molecule cannot exploit the COX-2-specific side pocket, capping its affinity gain over COX-1.

### Naproxen

**File**: `l2_tagline_naproxen`

Naphthyl scaffold. One Arg120 anchor; methoxy group adds modest hydrophobic contact. No engagement of the Val523 pocket.

### Ibuprofen

**File**: `l2_tagline_ibuprofen`

Smallest and most flexible of the five. Single carboxylate hydrogen bond, weak hydrophobic burial — the lowest predicted affinity in this set.

---

## Completion Messages

### L1 — Best Pose

**File**: `l1_complete_best_pose`

Excellent work. You have successfully engaged the Val523 side pocket, achieving the precise orientation required for selective COX-2 inhibition and clinical efficacy.

### L2 — All Ranked

**File**: `l2_complete_all_ranked`

All five ligands ranked. Notice: the COX-2 selectivity gap, celecoxib and rofecoxib, is driven by the same Val523 side-pocket geometry you exploited in Level 1, plus the sulfonamide and methylsulfonyl polar anchor.

### L3 — Wrap Summary (Read as three distinct paragraphs)

**File**: `l3_wrap_selectivity`

Selectivity is not safety. A drug that binds its target perfectly can still harm — if that target has roles we did not account for.

**File**: `l3_wrap_complexity`

Biological complexity matters. COX-2 is not just a pain enzyme. It protects your blood vessels. The body is a system.

**File**: `l3_wrap_tradeoff`

Tradeoff awareness. Every drug is a balance between efficacy and risk. Rational design must consider the whole system, not just one pocket.

---

## Total Line Count

| Category | Lines |
|----------|-------|
| Main beats (1–5) | 8 |
| Level briefs | 4 |
| Residue notes | 4 |
| Ligand taglines | 5 |
| Completion messages | 5 |
| **Total** | **26** |
