import { COX1_SCORE, COX2_SCORE, SELECTIVITY_RATIO } from './l3-scenario.js';

// Cutscene beats adapted from pipelines/data/dialogue/dr_chen_beat_4_vioxx_flashback.txt
const CUTSCENE_BEATS = [
  {
    title: 'VIOXX (Rofecoxib)',
    body: 'Approved 1999. The most selective COX-2 inhibitor ever designed. It bound COX-2 with surgical precision and left COX-1 completely alone. No stomach bleeding. A triumph of rational drug design.',
    duration: 8000,
  },
  {
    title: 'The Mechanism',
    body: 'But COX-2 in your blood vessels produces prostacyclin (PGI2), which prevents clots. COX-1 produces thromboxane A2 (TXA2), which promotes clotting. These two keep your blood in balance.',
    duration: 10000,
  },
  {
    title: 'The Imbalance',
    body: 'By blocking COX-2 everywhere, Vioxx wiped out prostacyclin. Thromboxane, unchecked, ran hot. The balance tipped toward clots. 88,000 heart attacks. Withdrawn September 2004.',
    duration: 10000,
    warning: true,
  },
  {
    title: 'The Lesson',
    body: 'Selectivity is not safety. A perfect score in one pocket does not mean a safe drug. The body is a system, and every target has roles we may not yet understand.',
    duration: 10000,
  },
];

const OVERLAY_BASE = `
  position:fixed; inset:0; z-index:9999;
  display:flex; align-items:center; justify-content:center;
  background:rgba(0,0,0,0.82); backdrop-filter:blur(6px);
  font-family:ui-sans-serif,system-ui,sans-serif; color:#e0e0e0;
`;

let hudEl = null;

// --- Selectivity HUD ---

export function showSelectivityHUD() {
  if (hudEl) return;
  hudEl = document.createElement('div');
  hudEl.id = 'selectivity-hud';
  hudEl.style.cssText = `
    position:fixed; top:8%; left:50%; transform:translateX(-50%); z-index:9998;
    background:rgba(18,18,30,0.92); border:1px solid #333; border-radius:12px;
    padding:16px 28px; text-align:center; pointer-events:none;
  `;
  hudEl.innerHTML = `
    <div style="display:flex; gap:32px; align-items:center; font-size:14px;">
      <div>
        <div style="color:#4a90d9; font-weight:600;">COX-1</div>
        <div style="font-size:20px; color:#e0e0e0;">${COX1_SCORE}</div>
        <div style="font-size:11px; color:#888;">kcal/mol</div>
      </div>
      <div style="font-size:24px; color:#ff6f91; font-weight:700;">
        ${SELECTIVITY_RATIO}
        <div style="font-size:11px; color:#888; font-weight:400;">COX-2 selectivity &gt;&gt; COX-1</div>
      </div>
      <div>
        <div style="color:#d94a4a; font-weight:600;">COX-2</div>
        <div style="font-size:20px; color:#e0e0e0;">${COX2_SCORE}</div>
        <div style="font-size:11px; color:#888;">kcal/mol</div>
      </div>
    </div>
    <div style="margin-top:8px; font-size:10px; color:#666;">Educational proxy (not real Delta-G)</div>
  `;
  document.body.appendChild(hudEl);
}

export function hideSelectivityHUD() {
  if (hudEl) { hudEl.remove(); hudEl = null; }
}

// --- CV Warning ---

function showWarning() {
  const el = document.createElement('div');
  el.id = 'cv-warning';
  el.style.cssText = `
    position:fixed; inset:0; z-index:10001; display:flex; align-items:center; justify-content:center;
    background:rgba(180,30,30,0.25); border:3px solid #ff4444; pointer-events:none;
  `;
  el.innerHTML = `
    <div style="font-size:22px; color:#ff6666; font-weight:700; text-align:center;">
      WARNING<br/><span style="font-size:14px; color:#ff9999; font-weight:400;">Cardiovascular risk: PGI2/TXA2 imbalance</span>
    </div>
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// --- Cutscene ---

export function showCutscene() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = OVERLAY_BASE;

    const card = document.createElement('div');
    card.style.cssText = `
      max-width:800px; width:90%; text-align:center; padding:40px 32px;
      background:#12121e; border:1px solid #333; border-radius:12px;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
    `;

    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:28px; color:#06d6a0; font-weight:700; margin-bottom:20px;';

    const bodyEl = document.createElement('div');
    bodyEl.style.cssText = 'font-size:18px; line-height:1.6; color:#e0e0e0;';

    const progressWrap = document.createElement('div');
    progressWrap.style.cssText = 'margin-top:24px; height:4px; background:#333; border-radius:2px;';
    const progressBar = document.createElement('div');
    progressBar.style.cssText = 'height:100%; background:#06d6a0; border-radius:2px; width:0%; transition:width 0.3s;';
    progressWrap.appendChild(progressBar);

    const skipBtn = document.createElement('button');
    skipBtn.textContent = 'Skip';
    skipBtn.style.cssText = `
      margin-top:16px; padding:8px 20px; background:transparent;
      border:1px solid #555; color:#888; border-radius:6px; cursor:pointer; font-size:13px;
    `;

    card.appendChild(titleEl);
    card.appendChild(bodyEl);
    card.appendChild(progressWrap);
    card.appendChild(skipBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let skipped = false;
    let timeoutId = null;

    skipBtn.addEventListener('click', () => {
      skipped = true;
      if (timeoutId) clearTimeout(timeoutId);
      overlay.remove();
      resolve();
    });

    function showBeat(index) {
      if (skipped) return;
      if (index >= CUTSCENE_BEATS.length) {
        overlay.remove();
        resolve();
        return;
      }
      const beat = CUTSCENE_BEATS[index];
      titleEl.textContent = beat.title;
      bodyEl.textContent = beat.body;
      progressBar.style.width = ((index + 1) / CUTSCENE_BEATS.length * 100) + '%';

      if (beat.warning) showWarning();

      timeoutId = setTimeout(() => showBeat(index + 1), beat.duration);
    }

    showBeat(0);
  });
}

// --- Wrap Card ---

export function showWrapCard() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = OVERLAY_BASE;

    const card = document.createElement('div');
    card.style.cssText = `
      max-width:640px; width:90%; background:#12121e; border:1px solid #333;
      border-radius:12px; padding:32px; text-align:center;
      box-shadow:0 8px 32px rgba(0,0,0,0.6);
    `;

    card.innerHTML = `
      <h2 style="color:#06d6a0; font-size:22px; margin:0 0 16px 0;">What Vioxx Taught Us</h2>
      <div style="font-size:15px; line-height:1.7; color:#c0c0c0; text-align:left;">
        <p style="margin-bottom:12px;"><strong style="color:#ff6f91;">Selectivity is not safety.</strong> A drug that binds its target perfectly can still harm — if that target has roles we did not account for.</p>
        <p style="margin-bottom:12px;"><strong style="color:#06d6a0;">Biological complexity matters.</strong> COX-2 is not just a pain enzyme. It protects your blood vessels. The body is a system.</p>
        <p><strong style="color:#ffd166;">Tradeoff awareness.</strong> Every drug is a balance between efficacy and risk. Rational design must consider the whole system, not just one pocket.</p>
      </div>
    `;

    const continueBtn = document.createElement('button');
    continueBtn.textContent = 'Continue to Survey';
    continueBtn.style.cssText = `
      margin-top:20px; padding:10px 28px; font-size:15px;
      background:#06d6a0; color:#0a0a14; border:none; border-radius:8px;
      cursor:pointer; font-weight:600;
    `;
    continueBtn.addEventListener('click', () => {
      overlay.remove();
      resolve();
    });
    card.appendChild(continueBtn);

    overlay.appendChild(card);
    document.body.appendChild(overlay);
  });
}
