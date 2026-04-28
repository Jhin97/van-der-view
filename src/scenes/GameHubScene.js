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
  // L3 (Selectivity) cut from MVP scope.
];


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
    this._buildTipDots();
    this.hoveredRow = -1;
    this.spawn = { player: [0, 0, 0], camera: [0, 1.6, 1.0] };
  }

  update(dt, controllers) {
    this._updateHover(controllers);
    this._checkMenuActivation();
    // Deferred trigger click — see _onControllerClick comment for why.
    if (this._pendingClick) {
      this._pendingClick = false;
      if (this.hoveredRow >= 0) this._activateRow(this.hoveredRow);
    }
  }

  getGrabbables() { return this.grabbables; }

  markComplete(sceneId) {
    this.progress[sceneId] = true;
    try { sessionStorage.setItem('vdv-progress', JSON.stringify(this.progress)); } catch {}
    this._renderMenu();
  }

  isUnlocked(/* sceneId */) {
    return true;
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
    const hovered = i === this.hoveredRow;
    const yTop = TITLE_BAND_H + i * ROW_HEIGHT;
    const yMid = yTop + ROW_HEIGHT / 2;

    // Row background tint — brighter when the controller ray is on this row.
    let bg;
    if (hovered && unlocked)      bg = 'rgba(80, 150, 240, 0.45)';
    else if (hovered && !unlocked) bg = 'rgba(120, 100, 100, 0.30)';
    else if (unlocked)             bg = 'rgba(60, 80, 140, 0.18)';
    else                           bg = 'rgba(60, 60, 80, 0.08)';
    ctx.fillStyle = bg;
    ctx.fillRect(20, yTop + 8, CANVAS_W - 40, ROW_HEIGHT - 16);

    // Hover outline
    if (hovered) {
      ctx.strokeStyle = unlocked ? '#3aa6ff' : '#776688';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, yTop + 8, CANVAS_W - 40, ROW_HEIGHT - 16);
    }

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
  // grabbable was hit. We **don't** raycast here — selectstart fires from
  // a WebXR input event whose timing is decoupled from the XR frame loop,
  // so `controller.matrixWorld` may be stale. Instead just flag a pending
  // click; `update()` consumes it next frame and uses the live hoveredRow
  // (raycasted with fresh matrices in `_updateHover`) as the activation
  // target. This eliminates the "hover lights up but click does nothing"
  // race that came from the ray missing the menu plane on the event tick.
  _onControllerClick(_controller) {
    this._pendingClick = true;
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

  // ---- hover feedback (per-frame raycast) ---------------------------------

  // Without a visible aim indicator, VR users have no way to know whether
  // they're pointing at the menu before pulling the trigger. We raycast each
  // controller every frame, snap a tip dot to the hit point, and highlight
  // the hovered row in the canvas.
  _buildTipDots() {
    const dotGeo = new THREE.SphereGeometry(0.012, 12, 12);
    this.tipDots = [];
    for (let i = 0; i < 2; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: 0x06d6a0, depthTest: false });
      const dot = new THREE.Mesh(dotGeo, mat);
      dot.visible = false;
      dot.renderOrder = 1000;
      this._add(dot);
      this.tipDots.push(dot);
    }
  }

  _updateHover(controllers) {
    const session = this.ctx.renderer.xr.getSession();
    let newHover = -1;

    for (let i = 0; i < 2; i++) {
      const ctrl = controllers[i];
      const dot = this.tipDots[i];
      if (!session || !ctrl) {
        dot.visible = false;
        continue;
      }

      const tempMat = new THREE.Matrix4().extractRotation(ctrl.matrixWorld);
      const rc = new THREE.Raycaster();
      rc.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
      rc.ray.direction.set(0, 0, -1).applyMatrix4(tempMat);
      const hits = rc.intersectObject(this.menuPlane, false);

      if (hits.length > 0 && hits[0].uv) {
        dot.position.copy(hits[0].point);
        dot.visible = true;
        const row = this._hitTestRow(hits[0].uv);
        if (row >= 0 && newHover < 0) newHover = row;
      } else {
        dot.visible = false;
      }
    }

    if (newHover !== this.hoveredRow) {
      this.hoveredRow = newHover;
      this._renderMenu();
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
