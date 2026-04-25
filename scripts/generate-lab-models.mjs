// scripts/generate-lab-models.mjs
//
// Generates lab-like 3D models using the Tripo AI API and downloads GLB files
// into public/assets/v1/lab/ for use in the Tutorial scene.
//
// Usage: TRIPO_API_KEY=tsk_xxx node scripts/generate-lab-models.mjs

const API_BASE = 'https://api.tripo3d.ai/v2/openapi';
const API_KEY = process.env.TRIPO_API_KEY;
const OUT_DIR = 'public/assets/v1/lab';

if (!API_KEY) {
  console.error('Set TRIPO_API_KEY env var');
  process.exit(1);
}

// Lab models to generate — prompts crafted for clean, low-poly, VR-friendly results
const MODELS = [
  {
    id: 'lab-table',
    prompt: 'A clean modern laboratory bench table, white surface, metal frame legs, no objects on top, simple design, VR-ready low poly',
    filename: 'lab-table.glb',
  },
  {
    id: 'microscope',
    prompt: 'A simplified scientific microscope on a stand, modern design, dark grey and silver, clean geometric shapes, VR-ready low poly',
    filename: 'microscope.glb',
  },
  {
    id: 'wall-shelf',
    prompt: 'A wall-mounted laboratory shelf with brackets, clean modern design, metal brackets, wooden shelf board, empty, VR-ready low poly',
    filename: 'wall-shelf.glb',
  },
  {
    id: 'monitor-screen',
    prompt: 'A flat scientific display monitor on a small stand, holographic-style thin screen, minimal base, futuristic lab, VR-ready low poly',
    filename: 'monitor-screen.glb',
  },
  {
    id: 'beaker',
    prompt: 'A simple laboratory beaker glass, transparent, slightly tapered cylinder shape, no liquid inside, clean design, VR-ready low poly',
    filename: 'beaker.glb',
  },
  {
    id: 'lab-stool',
    prompt: 'A modern lab stool with wheels, adjustable height, simple design, silver metal, dark seat cushion, VR-ready low poly',
    filename: 'lab-stool.glb',
  },
];

async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status}: ${text}`);
  }
  return res.json();
}

async function createTask(type, prompt) {
  console.log(`  Creating task: ${type} — "${prompt.slice(0, 60)}..."`);
  const body = { type, prompt };
  const res = await api('/task', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (res.code !== 0) throw new Error(`Task creation failed: ${JSON.stringify(res)}`);
  return res.data.task_id;
}

async function pollTask(taskId, maxWaitMs = 300000) {
  const start = Date.now();
  const interval = 5000;
  while (Date.now() - start < maxWaitMs) {
    const res = await api(`/task/${taskId}`);
    const status = res.data?.status;
    const progress = res.data?.progress || 0;
    process.stdout.write(`\r  Status: ${status} (${progress}%)    `);
    if (status === 'success') {
      process.stdout.write('\n');
      return res.data;
    }
    if (status === 'failed') {
      throw new Error(`Task ${taskId} failed: ${JSON.stringify(res)}`);
    }
    await new Promise(r => setTimeout(r, interval));
  }
  throw new Error(`Task ${taskId} timed out after ${maxWaitMs}ms`);
}

async function downloadModel(url, filepath) {
  console.log(`  Downloading → ${filepath}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const { writeFileSync } = await import('fs');
  const buffer = Buffer.from(await res.arrayBuffer());
  writeFileSync(filepath, buffer);
  console.log(`  Saved (${(buffer.length / 1024).toFixed(1)} KB)`);
}

async function main() {
  console.log(`\n=== Tripo AI Lab Model Generator ===\n`);
  console.log(`Generating ${MODELS.length} models...\n`);

  const { mkdirSync } = await import('fs');
  mkdirSync(OUT_DIR, { recursive: true });

  // Create all tasks in parallel
  const tasks = [];
  for (const model of MODELS) {
    try {
      const taskId = await createTask('text_to_model', model.prompt);
      tasks.push({ ...model, taskId });
      console.log(`  Task ID: ${taskId}`);
    } catch (err) {
      console.error(`  FAILED to create task for ${model.id}: ${err.message}`);
    }
  }

  console.log(`\nWaiting for ${tasks.length} tasks to complete...\n`);

  // Poll and download each
  for (const task of tasks) {
    try {
      console.log(`[${task.id}]`);
      const result = await pollTask(task.taskId);

      // Try to find the model URL — Tripo returns various formats
      const modelUrl = result.model?.url
        || result.output?.model
        || result.data?.model
        || result.model_url;

      if (!modelUrl) {
        // Try to get from rendered image first, then convert
        console.log('  No direct model URL, checking response structure...');
        console.log(JSON.stringify(result, null, 2).slice(0, 500));
        continue;
      }

      const filepath = `${OUT_DIR}/${task.filename}`;
      await downloadModel(modelUrl, filepath);
    } catch (err) {
      console.error(`  FAILED for ${task.id}: ${err.message}`);
    }
  }

  console.log(`\n=== Done ===\n`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
