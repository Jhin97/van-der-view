# van-der-view

WebXR protein structure viewer for educational VR experiences (Quest 3).

## Quick Start

```bash
npm install
npm run dev          # Vite frontend on :5173 (HTTPS for WebXR)
```

Survey responses are stored in the browser's `sessionStorage` under the `vdv-surveys` key and are not transmitted anywhere.

## Survey Flow

1. **Pre-survey** (4 Likert questions) — shown before the VR experience begins
2. **VR experience** — 3D scene with grab/teleport interactions
3. **Post-survey** (5 Likert + 1 free-text) — triggered by the "Finish / Take Post Survey" button

Pre/post responses are linked by a session UUID generated on page load.
