import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DB_PATH = process.env.VDV_DB_PATH || 'data/telemetry.db';

let db = null;

export function getDb() {
  if (db) return db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS telemetry (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id    TEXT    NOT NULL,
      survey_type   TEXT    NOT NULL CHECK(survey_type IN ('pre','post')),
      question_id   TEXT    NOT NULL,
      question_text TEXT    NOT NULL,
      response_value INTEGER,
      response_text  TEXT,
      created_at    TEXT    DEFAULT (datetime('now'))
    );
  `);
  return db;
}

export function insertResponse(row) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO telemetry (session_id, survey_type, question_id, question_text, response_value, response_text)
    VALUES (@session_id, @survey_type, @question_id, @question_text, @response_value, @response_text)
  `);
  stmt.run(row);
}

export function getAllResponses() {
  return getDb().prepare('SELECT * FROM telemetry ORDER BY id').all();
}

export function getResponsesByType(surveyType) {
  return getDb().prepare('SELECT * FROM telemetry WHERE survey_type = ? ORDER BY id').all(surveyType);
}
