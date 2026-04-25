// DOM overlay survey UI. Renders a full-screen overlay with Likert radio
// buttons and optional free-text textarea.

import { LIKERT_SCALE, LIKERT_LABELS } from './survey-questions.js';

let overlayEl = null;

export function createOverlay() {
  const el = document.createElement('div');
  el.id = 'survey-overlay';
  el.style.cssText = `
    position:fixed; inset:0; z-index:9999;
    display:flex; align-items:center; justify-content:center;
    background:rgba(0,0,0,0.82); backdrop-filter:blur(6px);
    font-family:ui-sans-serif,system-ui,sans-serif; color:#e0e0e0;
  `;
  document.body.appendChild(el);
  return el;
}

function renderQuestion(q, index) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'margin-bottom:18px;';

  const label = document.createElement('div');
  label.style.cssText = 'margin-bottom:6px; font-size:14px; line-height:1.5;';
  label.textContent = `${index + 1}. ${q.text}`;
  wrapper.appendChild(label);

  if (q.type === 'likert') {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; gap:6px; flex-wrap:wrap; align-items:center;';

    for (const val of LIKERT_SCALE) {
      const id = `${q.question_id}_${val}`;
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = q.question_id;
      radio.value = val;
      radio.id = id;
      radio.required = true;
      radio.style.cssText = 'accent-color:#06d6a0; cursor:pointer;';

      const rLabel = document.createElement('label');
      rLabel.htmlFor = id;
      rLabel.textContent = val;
      rLabel.title = LIKERT_LABELS[val];
      rLabel.style.cssText = 'cursor:pointer; font-size:13px; margin-right:4px;';

      const cell = document.createElement('span');
      cell.style.cssText = 'display:inline-flex; flex-direction:column; align-items:center; margin:0 2px;';
      cell.appendChild(radio);
      cell.appendChild(rLabel);
      row.appendChild(cell);
    }

    // End labels
    const disagree = document.createElement('span');
    disagree.textContent = '← Disagree';
    disagree.style.cssText = 'font-size:11px; color:#888; margin-right:8px;';

    const agree = document.createElement('span');
    agree.textContent = 'Agree →';
    agree.style.cssText = 'font-size:11px; color:#888; margin-left:8px;';

    row.prepend(disagree);
    row.appendChild(agree);

    wrapper.appendChild(row);
  } else if (q.type === 'freetext') {
    const ta = document.createElement('textarea');
    ta.name = q.question_id;
    ta.rows = 4;
    ta.style.cssText = `
      width:100%; box-sizing:border-box; margin-top:4px;
      background:#1a1a2e; color:#e0e0e0; border:1px solid #444;
      border-radius:6px; padding:8px; font-size:13px; resize:vertical;
    `;
    wrapper.appendChild(ta);
  }

  return wrapper;
}

/**
 * Show a survey overlay.
 * @param {Array} questions - array of question objects
 * @param {string} title - heading text
 * @param {string} surveyType - 'pre' or 'post'
 * @param {string} sessionId - session identifier
 * @returns {Promise<Array>} resolves with array of response objects
 */
export function showSurvey(questions, title, surveyType, sessionId) {
  return new Promise((resolve) => {
    if (!overlayEl) overlayEl = createOverlay();

    const card = document.createElement('div');
    card.style.cssText = `
      max-width:680px; width:90%; max-height:85vh; overflow-y:auto;
      background:#12121e; border:1px solid #333; border-radius:12px;
      padding:28px 32px; box-shadow:0 8px 32px rgba(0,0,0,0.6);
    `;

    const h2 = document.createElement('h2');
    h2.textContent = title;
    h2.style.cssText = 'margin:0 0 20px 0; font-size:20px; color:#06d6a0;';
    card.appendChild(h2);

    const form = document.createElement('form');
    form.id = 'survey-form';

    questions.forEach((q, i) => form.appendChild(renderQuestion(q, i)));

    const btn = document.createElement('button');
    btn.type = 'submit';
    btn.textContent = 'Submit';
    btn.style.cssText = `
      margin-top:20px; padding:10px 28px; font-size:15px;
      background:#06d6a0; color:#0a0a14; border:none; border-radius:8px;
      cursor:pointer; font-weight:600;
    `;
    form.appendChild(btn);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const responses = [];
      for (const q of questions) {
        if (q.type === 'likert') {
          const checked = form.querySelector(`input[name="${q.question_id}"]:checked`);
          if (!checked) {
            alert(`Please answer question: ${q.text}`);
            return;
          }
          responses.push({
            session_id: sessionId,
            survey_type: surveyType,
            question_id: q.question_id,
            question_text: q.text,
            response_value: parseInt(checked.value, 10),
            response_text: null,
          });
        } else {
          const ta = form.querySelector(`textarea[name="${q.question_id}"]`);
          responses.push({
            session_id: sessionId,
            survey_type: surveyType,
            question_id: q.question_id,
            question_text: q.text,
            response_value: null,
            response_text: ta?.value?.trim() || '',
          });
        }
      }
      overlayEl.style.display = 'none';
      overlayEl.innerHTML = '';
      resolve(responses);
    });

    card.appendChild(form);
    overlayEl.innerHTML = '';
    overlayEl.appendChild(card);
    overlayEl.style.display = 'flex';
  });
}

/** Show a simple "thank you" message and hide after a few seconds. */
export function showThankYou() {
  if (!overlayEl) overlayEl = createOverlay();
  overlayEl.innerHTML = '';
  const msg = document.createElement('div');
  msg.style.cssText = `
    text-align:center; font-size:22px; color:#06d6a0; font-weight:600;
  `;
  msg.textContent = 'Thank you for completing the survey!';
  overlayEl.appendChild(msg);
  overlayEl.style.display = 'flex';
  setTimeout(() => {
    overlayEl.style.display = 'none';
    overlayEl.innerHTML = '';
  }, 3000);
}

/**
 * Create a floating "Finish / Take Post Survey" button.
 * @param {Function} onClick - callback when clicked
 * @returns {HTMLButtonElement}
 */
export function createFinishButton(onClick) {
  const btn = document.createElement('button');
  btn.id = 'finish-btn';
  btn.textContent = 'Finish / Take Post Survey';
  btn.style.cssText = `
    position:fixed; bottom:20px; right:20px; z-index:9998;
    padding:12px 22px; font-size:14px; font-weight:600;
    background:#ff6f91; color:#fff; border:none; border-radius:10px;
    cursor:pointer; box-shadow:0 4px 14px rgba(0,0,0,0.4);
  `;
  btn.addEventListener('click', onClick);
  document.body.appendChild(btn);
  return btn;
}

export function removeFinishButton() {
  document.getElementById('finish-btn')?.remove();
}
