// scripts/generate-voice-lines.mjs
//
// Generates all 26 Dr. Chen voice-line MP3s via ElevenLabs API.
//
// Usage: ELEVENLABS_API_KEY=sk_xxx node scripts/generate-voice-lines.mjs
//
// Output: public/assets/v1/audio/*.mp3

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const API_KEY = process.env.ELEVENLABS_API_KEY;
const OUT_DIR = 'public/assets/v1/audio';
const VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb'; // George - calm, authoritative, mentorly
const MODEL_ID = 'eleven_turbo_v2_5';

if (!API_KEY) {
  console.error('Set ELEVENLABS_API_KEY env var');
  process.exit(1);
}

// Voice settings for Dr. Chen: confident, precise, mentorly
const VOICE_SETTINGS = {
  stability: 0.55,
  similarity_boost: 0.75,
  style: 0.3,       // slight expressiveness
  use_speaker_boost: true,
};

// All 26 voice lines. Special chars replaced with ASCII equivalents
// to avoid UTF-8 encoding issues with the ElevenLabs API.
const LINES = [
  // ---- Main Beats ----
  {
    key: 'beat_1_intro',
    text: 'Welcome, Researcher. We are targeting inflammation. Our enzyme of interest is cyclooxygenase, COX-2, the spark of pain and fever. But COX-2 has a twin, COX-1, that protects the lining of your stomach and helps your platelets do their job. Hit one, you save lives. Hit both, you bleed your patients. Today you learn to tell them apart, atom by atom. Calibrate your hands; we begin in the active site.',
  },
  {
    key: 'beat_2_discovery',
    text: 'Meet celecoxib. Look at the back wall of this pocket. There is a side cavity that COX-1 does not have. One residue makes the difference: Valine 523 in COX-2, Isoleucine 523 in COX-1. A single methyl group, and the geometry opens up. Celecoxib carries a sulfonamide tail designed to slot into that side pocket. Your task: find the snap. Bring the sulfonamide home.',
  },
  {
    key: 'beat_3_ranking',
    text: 'Good fit. But chemistry is rarely binary. Naproxen, ibuprofen, diclofenac. These traditional NSAIDs hit both isoforms with varying enthusiasm. Rank them now. Look for the highest binding affinity in COX-2 without crippling COX-1. This is structure-activity relationship in motion: every methyl, every halogen, every charge nudges the score. Choose carefully.',
  },
  {
    key: 'beat_4a_vioxx_intro',
    text: 'Approved 1999. Rofecoxib, Vioxx. The most selective COX-2 inhibitor ever designed. It bound COX-2 with surgical precision and left COX-1 completely alone. No stomach bleeding. A triumph of rational drug design.',
  },
  {
    key: 'beat_4b_mechanism',
    text: 'But COX-2 in your blood vessels produces prostacyclin, PGI2, which prevents clots. COX-1 produces thromboxane A2, TXA2, which promotes clotting. These two keep your blood in balance.',
  },
  {
    key: 'beat_4c_imbalance',
    text: 'By blocking COX-2 everywhere, Vioxx wiped out prostacyclin. Thromboxane, unchecked, ran hot. The balance tipped toward clots. 88,000 heart attacks. Withdrawn September 2004.',
  },
  {
    key: 'beat_4d_lesson',
    text: 'Selectivity is not safety. A perfect score in one pocket does not mean a safe drug. The body is a system, and every target has roles we may not yet understand.',
  },
  {
    key: 'beat_5_horizon',
    text: 'You felt it. The difference of one methyl group, the cost of perfect selectivity, the geometry that decides who lives. Rational design is not just the strongest click in a pocket. It is the whole system: every off-target, every metabolite, every patient. Record what you learned. There are more targets to hunt, and they will not wait.',
  },

  // ---- Level Briefs ----
  {
    key: 'l1_brief_biology',
    text: 'Cyclooxygenase-2, or COX-2, is an enzyme you will find upregulated during inflammation. It is responsible for the synthesis of prostaglandins, the lipid mediators that signal pain, fever, and swelling in your body. By pharmacologically blocking this enzyme, we can achieve a potent anti-inflammatory effect. However, you must be precise. COX-1 is the housekeeping twin of COX-2, responsible for protecting your gastric mucosa and regulating platelet thromboxane. Non-selective inhibitors can damage the stomach, so your goal is to recognise the subtle structural differences that allow for COX-2 selectivity.',
  },
  {
    key: 'l1_brief_engineering',
    text: 'Your mission is to perform a molecular docking operation. Using your controllers, you must grab the celecoxib molecule and manually orient it within the COX-2 active site. Your objective is to block the catalytic channel so that the natural substrate, arachidonic acid, can no longer fit. To succeed, you must maximise shape complementarity and establish at least two hydrogen-bond contacts with the marquee residues indicated in your display. Pay close attention to the spatial orientation of the sulfonamide group.',
  },
  {
    key: 'l2_brief_biology',
    text: 'Five common NSAID analogs all bind COX-2, but with markedly different affinities. Two are designed for COX-2 selectivity: celecoxib and rofecoxib. Three are non-selective workhorses: diclofenac, naproxen, and ibuprofen. Your job is to rank them.',
  },
  {
    key: 'l2_brief_engineering',
    text: 'Each pedestal lights up an analog. Trigger a pedestal to reveal that ligands predicted delta-G in kilocalories per mole on the bar chart and its narrative card. Lower, more negative, means tighter binding. Activate all five to complete the level. Compare your intuition with the Vina ground truth. The order matters more than the exact numbers.',
  },

  // ---- Residue Notes (L1) ----
  {
    key: 'l1_residue_val523',
    text: 'This smaller valine residue acts as a selectivity gatekeeper. It opens a side pocket in COX-2 that is blocked by isoleucine in COX-1.',
  },
  {
    key: 'l1_residue_arg120',
    text: 'Located at the channel mouth, this residue anchors the polar sulfonamide head of celecoxib through critical electrostatic and hydrogen-bonding interactions.',
  },
  {
    key: 'l1_residue_tyr385',
    text: 'A key hydrogen-bond donor situated deep within the active site. It interacts with the sulfonamide oxygens to stabilise the docked ligand pose.',
  },
  {
    key: 'l1_residue_ser530',
    text: 'While famously acetylated by aspirin to inhibit COX activity, for celecoxib, this residue provides spatial context rather than a direct binding link.',
  },

  // ---- Ligand Taglines (L2) ----
  {
    key: 'l2_tagline_celecoxib',
    text: 'Selective COX-2 inhibitor. Sulfonamide head hydrogen-bonds to Arg120 and His90. Trifluoromethylphenyl ring fills the Val523 side pocket.',
  },
  {
    key: 'l2_tagline_rofecoxib',
    text: 'Methylsulfonyl variant. Slightly fewer hydrogen bonds than celecoxib but very tight hydrophobic packing in the side pocket. Withdrawn, Vioxx, for cardiovascular reasons unrelated to docking.',
  },
  {
    key: 'l2_tagline_diclofenac',
    text: 'Non-selective NSAID. Carboxylate hydrogen-bonds Arg120 at the channel mouth, but the molecule cannot exploit the COX-2-specific side pocket, capping its affinity gain over COX-1.',
  },
  {
    key: 'l2_tagline_naproxen',
    text: 'Naphthyl scaffold. One Arg120 anchor; methoxy group adds modest hydrophobic contact. No engagement of the Val523 pocket.',
  },
  {
    key: 'l2_tagline_ibuprofen',
    text: 'Smallest and most flexible of the five. Single carboxylate hydrogen bond, weak hydrophobic burial. The lowest predicted affinity in this set.',
  },

  // ---- Completion Messages ----
  {
    key: 'l1_complete_best_pose',
    text: 'Excellent work. You have successfully engaged the Val523 side pocket, achieving the precise orientation required for selective COX-2 inhibition and clinical efficacy.',
  },
  {
    key: 'l2_complete_all_ranked',
    text: 'All five ligands ranked. Notice: the COX-2 selectivity gap, celecoxib and rofecoxib, is driven by the same Val523 side-pocket geometry you exploited in Level 1, plus the sulfonamide and methylsulfonyl polar anchor.',
  },
  {
    key: 'l3_wrap_selectivity',
    text: 'Selectivity is not safety. A drug that binds its target perfectly can still harm, if that target has roles we did not account for.',
  },
  {
    key: 'l3_wrap_complexity',
    text: 'Biological complexity matters. COX-2 is not just a pain enzyme. It protects your blood vessels. The body is a system.',
  },
  {
    key: 'l3_wrap_tradeoff',
    text: 'Tradeoff awareness. Every drug is a balance between efficacy and risk. Rational design must consider the whole system, not just one pocket.',
  },
];

async function generateOne(key, text) {
  const filepath = join(OUT_DIR, `${key}.mp3`);

  if (existsSync(filepath)) {
    const { statSync } = await import('fs');
    const size = statSync(filepath).size;
    if (size > 1000) {
      console.log(`  SKIP ${key} (already exists, ${size} bytes)`);
      return { key, status: 'skipped' };
    }
  }

  const body = JSON.stringify({
    text,
    model_id: MODEL_ID,
    voice_settings: VOICE_SETTINGS,
  });

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'xi-api-key': API_KEY,
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'audio/mpeg',
    },
    body,
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`  FAIL ${key}: ${res.status} ${errText.slice(0, 200)}`);
    return { key, status: 'failed', error: errText };
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buffer);
  console.log(`  OK   ${key} (${(buffer.length / 1024).toFixed(1)} KB)`);
  return { key, status: 'ok', size: buffer.length };
}

async function main() {
  console.log(`\n=== ElevenLabs Voice Line Generator ===\n`);
  console.log(`Voice: ${VOICE_ID} (George)`);
  console.log(`Model: ${MODEL_ID}`);
  console.log(`Lines: ${LINES.length}\n`);

  mkdirSync(OUT_DIR, { recursive: true });

  const results = [];
  let totalChars = 0;

  for (const line of LINES) {
    totalChars += line.text.length;

    // Small delay to avoid rate limiting (free tier: ~3 req/s)
    await new Promise(r => setTimeout(r, 350));

    const result = await generateOne(line.key, line.text);
    results.push(result);
  }

  const ok = results.filter(r => r.status === 'ok').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const failed = results.filter(r => r.status === 'failed').length;

  console.log(`\n--- Summary ---`);
  console.log(`Generated: ${ok} | Skipped: ${skipped} | Failed: ${failed}`);
  console.log(`Total characters used: ${totalChars} (free tier: 10,000/month)`);
  console.log(`Output: ${OUT_DIR}/\n`);

  if (failed > 0) {
    console.error(`WARNING: ${failed} files failed to generate. Check errors above.`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
