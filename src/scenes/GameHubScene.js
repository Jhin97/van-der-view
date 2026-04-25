import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Game Hub — flat level-select menu (no 3D portals, no teleport).
// Renders a clickable canvas-on-plane in front of the user. Each row is
// driven by the existing progress / isUnlocked machinery, so completing
// level N visually unlocks N+1 the next time the user is in the hub.
// ---------------------------------------------------------------------------

const LEVEL_DEFS = [
  { id: 'tutorial', label: 'Tutorial',              color: '#06d6a0' },
  { id: 'l1',       label: 'Level 1 — COX-2 Dock',  color: '#3aa6ff' },
  { id: 'l2',       label: 'Level 2 — Rank NSAIDs', color: '#ffd166' },
  { id: 'l3',       label: 'Level 3 — Selectivity', color: '#ff6f91' },
];

const UNLOCK_ORDER = ['tutorial', 'l1', 'l2', 'l3'];

const CANVAS_W = 768;
const CANVAS_H = 512;
const TITLE_BAND_H = 96;
const ROW_HEIGHT = (CANVAS_H - TITLE_BAND_H) / LEVEL_DEFS.length;

const PLANE_W = 1.2;
const PLANE_H = 0.8;
const PLANE_POS = [0, 1.5, -1.0];

export default class GameHubScene {
  constructor(ctx) {
    this.ctx = ctx; // { scene, player, renderer, camera }
    this.objects = [];
    this.grabbables = [];
    this.onSelectPortal = null;
    // Initialize to null (not undefined) so main.js's mousedown handler
    // forwards desktop clicks: it gates on `_desktopClick !== undefined`.
    this._desktopClick = null;
    this.progress = { tutorial: false, l1: false, l2: false, l3: false };
    this._loadProgress();
  }

  _loadProgress() {
    try {
      const saved = sessionStorage.getItem('vdv-progress');
      if (saved) this.progress = JSON.parse(saved);
    } catch {}
  }

  // ---- public lifecycle ---------------------------------------------------

  init() {
    // Re-read on init in case sessionStorage was written between constructor
    // and init (e.g. transitionToHub right after a level's onComplete).
    this._loadProgress();
    this._buildMenu();
    this.spawn = { player: [0, 0, 0], camera: [0, 1.6, 1.0] };
  }

  update(dt, controllers) {
    this._checkMenuActivation();
  }

  getGrabbables() { return this.grabbables; }

  markComplete(sceneId) {
    this.progress[sceneId] = true;
    try { sessionStorage.setItem('vdv-progress', JSON.stringify(this.progress)); } catch {}
    this._renderMenu();
  }

  isUnlocked(sceneId) {
    const idx = UNLOCK_ORDER.indexOf(sceneId);
    if (idx <= 0) return true;
    return this.progress[UNLOCK_ORDER[idx - 1]];
  }

  // ---- menu construction --------------------------------------------------

  _buildMenu() {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    this.menuCanvas = canvas;
    this.menuCtx = canvas.getContext('2d');

    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    this.menuTexture = tex;

    const geo = new THREE.PlaneGeometry(PLANE_W, PLANE_H);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const plane = new THREE.Mesh(geo, mat);
    plane.position.fromArray(PLANE_POS);
    this.menuPlane = plane;
    this._add(plane);

    this._renderMenu();
  }

  _renderMenu() {
    const ctx = this.menuCtx;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    // Card background
    ctx.fillStyle = 'rgba(10, 12, 32, 0.92)';
    ctx.beginPath();
    ctx.roundRect(0, 0, CANVAS_W, CANVAS_H, 24);
    ctx.fill();

    // Subtle border
    ctx.strokeStyle = 'rgba(120, 140, 200, 0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(1, 1, CANVAS_W - 2, CANVAS_H - 2, 23);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Select a Level', CANVAS_W / 2, TITLE_BAND_H / 2);

    // Title underline
    ctx.strokeStyle = 'rgba(120, 140, 200, 0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(60, TITLE_BAND_H);
    ctx.lineTo(CANVAS_W - 60, TITLE_BAND_H);
    ctx.stroke();

    // Rows
    for (let i = 0; i < LEVEL_DEFS.length; i++) {
      this._renderRow(i);
    }

    this.menuTexture.needsUpdate = true;
  }

  _renderRow(i) {
    const ctx = this.menuCtx;
    const def = LEVEL_DEFS[i];
    const unlocked = this.isUnlocked(def.id);
    const completed = this.progress[def.id];
    const yTop = TITLE_BAND_H + i * ROW_HEIGHT;
    const yMid = yTop + ROW_HEIGHT / 2;

    // Row background tint
    ctx.fillStyle = unlocked ? 'rgba(60, 80, 140, 0.18)' : 'rgba(60, 60, 80, 0.08)';
    ctx.fillRect(20, yTop + 8, CANVAS_W - 40, ROW_HEIGHT - 16);

    // Status icon
    let iconText, iconColor;
    if (completed)     { iconText = '✓'; iconColor = '#06d6a0'; }
    else if (unlocked) { iconText = '►'; iconColor = '#3aa6ff'; }
    else               { iconText = '✗'; iconColor = '#555577'; }
    ctx.fillStyle = iconColor;
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(iconText, 60, yMid);

    // Label
    ctx.fillStyle = unlocked ? def.color : '#666688';
    ctx.font = unlocked ? 'bold 30px system-ui, sans-serif' : '30px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(def.label, 110, yMid);

    // Status hint (right-aligned)
    const hint = completed ? 'COMPLETE' : unlocked ? 'CLICK TO ENTER' : 'LOCKED';
    ctx.fillStyle = completed ? '#06d6a0' : unlocked ? '#aaaacc' : '#555577';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(hint, CANVAS_W - 30, yMid);
  }

  // ---- input → row activation ---------------------------------------------

  // PlaneGeometry uv: (0,0) bottom-left, (1,1) top-right. Canvas y is 0 at top, so flip.
  _hitTestRow(uv) {
    const canvasY = (1 - uv.y) * CANVAS_H;
    if (canvasY < TITLE_BAND_H) return -1;
    const idx = Math.floor((canvasY - TITLE_BAND_H) / ROW_HEIGHT);
    if (idx < 0 || idx >= LEVEL_DEFS.length) return -1;
    return idx;
  }

  _activateRow(idx) {
    if (idx < 0) return;
    const def = LEVEL_DEFS[idx];
    if (!this.isUnlocked(def.id)) return;
    if (this.onSelectPortal) this.onSelectPortal(def.id);
  }

  // VR trigger pull is dispatched by main.js's onSelectStart when no
  // grabbable was hit. The controller event fires per-controller, so the
  // matrix is the right one — no inputSources iteration to misalign.
  _onControllerClick(controller) {
    const tempMat = new THREE.Matrix4().extractRotation(controller.matrixWorld);
    const rc = new THREE.Raycaster();
    rc.ray.origin.setFromMatrixPosition(controller.matrixWorld);
    rc.ray.direction.set(0, 0, -1).applyMatrix4(tempMat);
    const hits = rc.intersectObject(this.menuPlane, false);
    if (hits.length > 0 && hits[0].uv) {
      this._activateRow(this._hitTestRow(hits[0].uv));
    }
  }

  _checkMenuActivation() {
    // Desktop: forwarded mouse click via main.js's mousedown handler.
    if (this._desktopClick) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(this._desktopClick, this.ctx.camera);
      const hits = rc.intersectObject(this.menuPlane, false);
      if (hits.length > 0 && hits[0].uv) {
        this._activateRow(this._hitTestRow(hits[0].uv));
      }
      this._desktopClick = null;
    }
  }

  // ---- helpers ------------------------------------------------------------

  _add(obj) {
    this.ctx.scene.add(obj);
    this.objects.push(obj);
  }

  destroy() {
    for (const obj of this.objects) {
      this.ctx.scene.remove(obj);
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    this.objects = [];
  }
}
