import express from 'express';
import cors from 'cors';
import { insertResponse, getAllResponses } from './db.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/api/telemetry', (req, res) => {
  const rows = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: 'Expected non-empty array of response objects' });
  }
  for (const row of rows) {
    if (!row.session_id || !row.survey_type || !row.question_id || !row.question_text) {
      return res.status(400).json({ error: 'Missing required fields: session_id, survey_type, question_id, question_text' });
    }
    if (!['pre', 'post'].includes(row.survey_type)) {
      return res.status(400).json({ error: 'survey_type must be "pre" or "post"' });
    }
    insertResponse(row);
  }
  res.json({ ok: true, count: rows.length });
});

app.get('/api/telemetry', (_req, res) => {
  res.json(getAllResponses());
});

app.listen(PORT, () => {
  console.log(`Telemetry server listening on http://localhost:${PORT}`);
});
