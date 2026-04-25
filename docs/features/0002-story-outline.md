# F-008 Story Outline — XR Rational Drug Design Educational App

**Date**: 2026-04-25
**Status**: Initial outline (sourced from Gemini story-eval pass; cross-track with F-002 asset pipeline)
**Reference**: `docs/superpowers/specs/2026-04-25-f002-asset-pipeline-design.md`

## Narrative anchor

Vioxx (rofecoxib) — withdrawn 2004 — as a **mechanistic** cautionary tale (PGI2 / TXA2 imbalance), not a shock-value tragedy. The story honours the public-health cost while teaching *why* over-selectivity can be dangerous.

## Persona — Dr. Chen

Virtual mentor. Confident, scientifically precise, mentorly. No marketing fluff. English primary; localisation later.

## 5-beat beat-sheet

| Beat | Trigger (in-app event) | Setting / scene | Pedagogical payload | Asset / mol implications |
|------|------------------------|-----------------|--------------------|--------------------------|
| **1: Intro** | App boot / Game Hub | High-tech virtual lab; Dr. Chen hologram | Onboarding to COX-1 / COX-2 isoforms; GI-safety vs pain-relief tradeoff | Heme cofactor mesh inside hub for "lab" atmosphere |
| **2: The Discovery** | Enter L1 (dock celecoxib) | Inside COX-2 (1CX2) active site | Val523 (COX-2) vs Ile523 (COX-1) selectivity origin; "side pocket" theory | Highlight VAL523 in neon; celecoxib sulfonamide tail visible |
| **3: The Ranking** | Start L2 (rank NSAIDs) | Data visualisation deck | SAR reasoning across reversible binders | Dynamic bar chart; diclofenac (replacing aspirin) in lineup |
| **4: The Vioxx Flashback** | Enter L3 (selectivity) | Dual-pocket COX-1 / COX-2 view | PGI2 / TXA2 imbalance mechanism → cardiovascular events; over-selectivity risk | Rofecoxib .glb; split-screen PDB view; warning overlay |
| **5: The Horizon** | Wrap / post-survey | Lab sunset / credits | Synthesis: rational design = systems thinking + structural biology | Post-survey UI; transition to global-impact framing |

## Dialogue files

Each beat has a dedicated TTS input file at `pipelines/data/dialogue/dr_chen_beat_*.txt`. The frontend story wrapper (F-008) feeds these into `Web Speech API` `speechSynthesis` (or pre-renders to .mp3 if TTS quality is too low). Each line is ≤ 60 seconds at typical cadence (≈ 130 wpm → ≤ 130 words per file).

## Frontend integration cues

- Beat 1 plays once at first boot; subsequent boots skip if `localStorage.getItem("dv_intro_seen") === "true"`.
- Beat 2 fires when the user enters the L1 portal in the Game Hub.
- Beat 3 plays as the L2 scene loads.
- Beat 4 plays as a cutscene before L3 controls become active; users may not skip until the dialogue completes (∼ 60s — pedagogical anchor).
- Beat 5 triggers when L3 is completed; the post-survey overlay appears at the end of this beat.

## Risks

- **Overshooting the tone**: If TTS sounds robotic, the Vioxx beat falls flat. Mitigation: pre-record the voice line for Beat 4 in advance using a reasonable TTS voice (e.g., ElevenLabs trial or browser-native quality voice).
- **Cultural memory**: Gen Z learners may not remember Vioxx. Beat 4 explicitly frames it as the reason FDA black-box warnings exist today, not as a current event.
- **Accessibility**: Provide on-screen subtitles in addition to TTS audio (F-008 implementation requirement, captured here for cross-track visibility).

## Out of scope

- TTS voice production (frontend implementation).
- Cutscene visuals beyond the "split-screen PDB" composition note (frontend implementation).
- Localisation (subsequent sprints).
