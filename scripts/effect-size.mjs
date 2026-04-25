#!/usr/bin/env node
// Reads survey data from SQLite, computes Cohen's d for each comparable
// pre/post Likert item, and outputs a CSV to stdout.
//
// Usage: node scripts/effect-size.mjs [path-to-db]
//   Default DB path: data/telemetry.db

import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';

const DB_PATH = process.argv[2] || 'data/telemetry.db';

if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });

// Map of question_id → comparable_id for pre/post pairing.
// PRE_Q1↔POST_Q1 share comparable_id Q_STRUCTURE, etc.
const COMPARABLE_MAP = {
  PRE_Q1: 'Q_STRUCTURE', POST_Q1: 'Q_STRUCTURE',
  PRE_Q2: 'Q_VISUALIZE', POST_Q2: 'Q_VISUALIZE',
  PRE_Q3: 'Q_CONFIDENCE', POST_Q3: 'Q_CONFIDENCE',
  PRE_Q4: 'Q_DOCKING',   POST_Q4: 'Q_DOCKING',
  POST_Q5: 'Q_PYMOL_COMPARE',
};

function mean(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function variance(arr, m) {
  if (arr.length < 2) return 0;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
}

function pooledSD(n1, var1, n2, var2) {
  if (n1 + n2 < 3) return 0;
  return Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
}

// Fetch all likert responses
const rows = db.prepare(
  `SELECT question_id, survey_type, response_value
   FROM telemetry
   WHERE response_value IS NOT NULL
   ORDER BY id`
).all();

db.close();

// Group by comparable_id
const groups = {};
for (const row of rows) {
  const cid = COMPARABLE_MAP[row.question_id];
  if (!cid) continue;
  if (!groups[cid]) groups[cid] = { pre: [], post: [] };
  groups[cid][row.survey_type].push(row.response_value);
}

// Compute and output CSV
const header = 'item_id,pre_mean,post_mean,mean_diff,pooled_sd,cohens_d,n_pre,n_post';
const lines = [header];

const cids = Object.keys(groups).sort();
for (const cid of cids) {
  const { pre, post } = groups[cid];
  const preM = mean(pre);
  const postM = mean(post);
  const meanDiff = postM - preM;
  const preVar = variance(pre, preM);
  const postVar = variance(post, postM);
  const pSD = pooledSD(pre.length, preVar, post.length, postVar);
  const d = pSD > 0 ? meanDiff / pSD : 0;
  lines.push([
    cid,
    preM.toFixed(3),
    postM.toFixed(3),
    meanDiff.toFixed(3),
    pSD.toFixed(3),
    d.toFixed(3),
    pre.length,
    post.length,
  ].join(','));
}

console.log(lines.join('\n'));
