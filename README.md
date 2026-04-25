# van-der-view

WebXR protein structure viewer for educational VR experiences (Quest 3).

## Quick Start

```bash
npm install
npm run dev          # Vite frontend on :5173 (HTTPS for WebXR)
```

## Telemetry Server

Survey responses are collected via a separate Express + SQLite backend.

```bash
# Terminal 1: start the telemetry API
npm run server       # Express on :3001

# Terminal 2: start the Vite frontend (proxies /api → :3001)
npm run dev

# Or both at once:
npm run dev:all
```

The Vite dev server proxies `/api` requests to `http://localhost:3001` automatically.

### Endpoints

- `POST /api/telemetry` — submit survey responses (array of objects)
- `GET /api/telemetry` — retrieve all stored responses

### Database

Responses are stored in `data/telemetry.db` (SQLite, git-ignored).
Override the path with `VDV_DB_PATH` environment variable.

## Effect-Size Analysis

After collecting survey data, compute Cohen's d per comparable pre/post Likert item:

```bash
npm run effect-size
# Output: CSV with columns item_id, pre_mean, post_mean, mean_diff, pooled_sd, cohens_d, n_pre, n_post
```

The script reads from `data/telemetry.db` by default. Pass a custom path as an argument:

```bash
node scripts/effect-size.mjs path/to/other.db
```

## Survey Flow

1. **Pre-survey** (4 Likert questions) — shown before the VR experience begins
2. **VR experience** — 3D scene with grab/teleport interactions
3. **Post-survey** (5 Likert + 1 free-text) — triggered by the "Finish / Take Post Survey" button

Pre/post responses are linked by a session UUID generated on page load.