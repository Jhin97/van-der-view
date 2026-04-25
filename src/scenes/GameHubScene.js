import * as THREE from 'three';

// ---------------------------------------------------------------------------
// F-004a Game Hub — Portal navigation + scene transition system
// Acceptance: hub with portals, gating, progress display, <1s transitions
// ---------------------------------------------------------------------------

const PORTAL_DEFS = [
  { id: 'tutorial', label: 'Tutorial', color: 0x06d6a0, angle: -0.45 },
  { id: 'l1',       label: 'Level 1',  color: 0x3aa6ff, angle: -0.15 },
  { id: 'l2',       label: 'Level 2',  color: 0xffd166, angle:  0.15 },
  { id: 'l3',       label: 'Level 3',  color: 0xff6f91, angle:  0.45 },
];

// Unlock order: tutorial always open, l1 after tutorial, l2 after l1, l3 after l2
const UNLOCK_ORDER = ['tutorial', 'l1', 'l2', 'l3'];

export default class GameHubScene {
  constructor(ctx) {
    this.ctx = ctx; // { scene, player, renderer }
    this.objects = [];
    this.grabbables = [];
    this.portals = [];
    this.onSelectPortal = null; // callback(sceneId) for scene manager
    this.progress = { tutorial: false, l1: false, l2: false, l3: false };

    // Restore progress from sessionStorage
    try {
      const saved = sessionStorage.getItem('vdv-progress');
      if (saved) this.progress = JSON.parse(saved);
    } catch {}
  }

  // ---- public lifecycle ---------------------------------------------------

  init() {
    this._buildEnvironment();
    this._buildPortals();
    this._buildProgressDisplay();
    this._buildPrompt();
  }

  update(dt, controllers) {
    this._updatePortalAnimations(dt);
    this._checkPortalActivation(controllers);
  }

  getGrabbables() { return this.grabbables; }

  markComplete(sceneId) {
    this.progress[sceneId] = true;
    try { sessionStorage.setItem('vdv-progress', JSON.stringify(this.progress)); } catch {}
    this._refreshPortalStates();
    this._updateProgressDisplay();
  }

  isUnlocked(sceneId) {
    const idx = UNLOCK_ORDER.indexOf(sceneId);
    if (idx <= 0) return true; // tutorial always open
    return this.progress[UNLOCK_ORDER[idx - 1]];
  }

  // ---- environment --------------------------------------------------------

  _buildEnvironment() {
    // Central platform
    const platGeo = new THREE.CylinderGeometry(2.0, 2.2, 0.08, 48);
    const platMat = new THREE.MeshStandardMaterial({ color: 0x14142a, roughness: 0.7, metalness: 0.2 });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(0, 0.04, -1.0);
    this._add(platform);

    // Subtle grid on platform
    const gridGeo = new THREE.RingGeometry(0.3, 1.9, 48);
    const gridMat = new THREE.MeshBasicMaterial({ color: 0x222244, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const gridRing = new THREE.Mesh(gridGeo, gridMat);
    gridRing.rotation.x = -Math.PI / 2;
    gridRing.position.set(0, 0.09, -1.0);
    this._add(gridRing);
  }

  // ---- portals ------------------------------------------------------------

  _buildPortals() {
    this.portals = [];
    const hubCenter = new THREE.Vector3(0, 1.0, -1.0);
    const radius = 1.6;

    for (const def of PORTAL_DEFS) {
      const group = new THREE.Group();
      group.userData.portalId = def.id;

      const x = hubCenter.x + Math.sin(def.angle) * radius;
      const z = hubCenter.z - Math.cos(def.angle) * radius;
      group.position.set(x, 0, z);

      // Face toward hub center
      group.lookAt(hubCenter.x, 0, hubCenter.z);

      // Portal frame (torus)
      const frameGeo = new THREE.TorusGeometry(0.4, 0.04, 16, 48);
      const frameMat = new THREE.MeshStandardMaterial({
        color: def.color,
        emissive: def.color,
        emissiveIntensity: 0.4,
        roughness: 0.3,
        metalness: 0.5,
      });
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.y = 1.2;
      group.add(frame);

      // Inner glow plane
      const innerGeo = new THREE.CircleGeometry(0.36, 32);
      const innerMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.15,
        side: THREE.DoubleSide,
      });
      const inner = new THREE.Mesh(innerGeo, innerMat);
      inner.position.y = 1.2;
      inner.position.z = 0.01;
      group.add(inner);

      // Lock icon (X shape) — shown when locked
      const lockGroup = new THREE.Group();
      lockGroup.position.y = 1.2;
      lockGroup.visible = false;
      const lockMat = new THREE.MeshBasicMaterial({ color: 0x555577 });
      const bar1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.02), lockMat);
      bar1.rotation.z = Math.PI / 4;
      lockGroup.add(bar1);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.02), lockMat);
      bar2.rotation.z = -Math.PI / 4;
      lockGroup.add(bar2);
      group.add(lockGroup);

      // Label sprite
      const label = this._createLabelSprite(def.label, def.color);
      label.position.y = 1.75;
      group.add(label);

      // Floor marker ring
      const markerGeo = new THREE.RingGeometry(0.35, 0.38, 32);
      const markerMat = new THREE.MeshBasicMaterial({
        color: def.color,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
      const marker = new THREE.Mesh(markerGeo, markerMat);
      marker.rotation.x = -Math.PI / 2;
      marker.position.y = 0.01;
      group.add(marker);

      this._add(group);
      this.portals.push({
        group,
        frame,
        inner,
        lockGroup,
        label,
        marker,
        frameMat,
        innerMat,
        markerMat,
        def,
      });
    }

    this._refreshPortalStates();
  }

  _refreshPortalStates() {
    for (const p of this.portals) {
      const unlocked = this.isUnlocked(p.def.id);
      const completed = this.progress[p.def.id];

      // Visual state
      p.lockGroup.visible = !unlocked;
      p.inner.visible = unlocked;

      if (!unlocked) {
        p.frameMat.color.setHex(0x333355);
        p.frameMat.emissive.setHex(0x333355);
        p.frameMat.emissiveIntensity = 0.1;
        p.innerMat.color.setHex(0x333355);
        p.innerMat.opacity = 0.05;
        p.markerMat.color.setHex(0x333355);
        p.markerMat.opacity = 0.15;
      } else if (completed) {
        p.frameMat.emissiveIntensity = 0.6;
        p.innerMat.opacity = 0.35;
        p.markerMat.opacity = 0.7;
      } else {
        p.frameMat.color.setHex(p.def.color);
        p.frameMat.emissive.setHex(p.def.color);
        p.frameMat.emissiveIntensity = 0.4;
        p.innerMat.color.setHex(p.def.color);
        p.innerMat.opacity = 0.15;
        p.markerMat.color.setHex(p.def.color);
        p.markerMat.opacity = 0.4;
      }
    }
  }

  // ---- progress display ---------------------------------------------------

  _buildProgressDisplay() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    this.progressCanvas = canvas;
    this.progressCtx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.8, 0.4, 1);
    sprite.position.set(0, 2.0, -1.0);
    this._add(sprite);
    this.progressSprite = sprite;

    this._updateProgressDisplay();
  }

  _updateProgressDisplay() {
    const ctx = this.progressCtx;
    const w = this.progressCanvas.width;
    const h = this.progressCanvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 16);
    ctx.fill();

    // Title
    ctx.fillStyle = '#06d6a0';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Progress', w / 2, 40);

    // Level status
    const levels = [
      { id: 'tutorial', label: 'Tutorial' },
      { id: 'l1', label: 'Level 1 — COX-2 Dock' },
      { id: 'l2', label: 'Level 2 — Rank NSAIDs' },
      { id: 'l3', label: 'Level 3 — Selectivity' },
    ];

    ctx.font = '24px system-ui, sans-serif';
    for (let i = 0; i < levels.length; i++) {
      const y = 80 + i * 42;
      const unlocked = this.isUnlocked(levels[i].id);
      const completed = this.progress[levels[i].id];

      if (completed) {
        ctx.fillStyle = '#06d6a0';
        ctx.fillText('✓', 30, y);
      } else if (unlocked) {
        ctx.fillStyle = '#3aa6ff';
        ctx.fillText('►', 30, y);
      } else {
        ctx.fillStyle = '#555577';
        ctx.fillText('✗', 30, y);
      }

      ctx.fillStyle = completed ? '#06d6a0' : unlocked ? '#ffffff' : '#555577';
      ctx.textAlign = 'left';
      ctx.fillText(levels[i].label, 60, y);
    }

    this.progressSprite.material.map.needsUpdate = true;
  }

  // ---- prompt -------------------------------------------------------------

  _buildPrompt() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    this.promptCanvas = canvas;
    this.promptCtx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.7, 0.13, 1);
    sprite.position.set(0, 2.5, -1.0);
    this._add(sprite);
    this.promptSprite = sprite;
    this._setPrompt('Walk into a portal to enter');
  }

  _setPrompt(text) {
    const ctx = this.promptCtx;
    const w = this.promptCanvas.width;
    const h = this.promptCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2, w - 20);
    this.promptSprite.material.map.needsUpdate = true;
  }

  // ---- portal animations --------------------------------------------------

  _updatePortalAnimations(dt) {
    const t = performance.now() * 0.001;
    for (const p of this.portals) {
      const unlocked = this.isUnlocked(p.def.id);
      if (unlocked && !this.progress[p.def.id]) {
        // Pulse unlocked but incomplete portals
        const s = 1 + Math.sin(t * 2 + p.def.angle * 10) * 0.05;
        p.frame.scale.setScalar(s);
        p.innerMat.opacity = 0.15 + Math.sin(t * 3 + p.def.angle * 8) * 0.08;
      }
    }
  }

  // ---- portal activation --------------------------------------------------

  _checkPortalActivation(controllers) {
    // Check if player walks into any unlocked portal
    const playerPos = new THREE.Vector3();
    this.ctx.player.getWorldPosition(playerPos);

    for (const p of this.portals) {
      if (!this.isUnlocked(p.def.id)) continue;

      const portalPos = new THREE.Vector3();
      p.group.getWorldPosition(portalPos);
      portalPos.y = playerPos.y; // horizontal distance only

      const dist = playerPos.distanceTo(portalPos);
      if (dist < 0.6) {
        if (this.onSelectPortal) this.onSelectPortal(p.def.id);
        return;
      }
    }

    // VR: point controller at portal frame + press trigger
    // Track select state to detect fresh presses (not held)
    if (this._prevSelect === undefined) this._prevSelect = [false, false];
    const session = this.ctx.renderer.xr.getSession();
    if (session) {
      let idx = 0;
      for (const source of session.inputSources) {
        if (idx >= 2) break;
        const pressed = source.gamepad && source.gamepad.buttons[0] && source.gamepad.buttons[0].pressed;
        const freshPress = pressed && !this._prevSelect[idx];

        if (freshPress) {
          const rc = new THREE.Raycaster();
          const ctrl = controllers[idx];
          if (ctrl) {
            const tempMat = new THREE.Matrix4().extractRotation(ctrl.matrixWorld);
            rc.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
            rc.ray.direction.set(0, 0, -1).applyMatrix4(tempMat);

            for (const p of this.portals) {
              if (!this.isUnlocked(p.def.id)) continue;
              const hits = rc.intersectObject(p.frame, false);
              if (hits.length > 0) {
                if (this.onSelectPortal) this.onSelectPortal(p.def.id);
                this._prevSelect[idx] = pressed;
                return;
              }
            }
          }
        }
        this._prevSelect[idx] = pressed;
        idx++;
      }
    }

    // Desktop: click on portal frame
    if (this._desktopClick) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(this._desktopClick, this.ctx.renderer.xr.getCamera(camera));
      for (const p of this.portals) {
        if (!this.isUnlocked(p.def.id)) continue;
        const hits = rc.intersectObject(p.frame, false);
        if (hits.length > 0) {
          if (this.onSelectPortal) this.onSelectPortal(p.def.id);
          this._desktopClick = null;
          return;
        }
      }
      this._desktopClick = null;
    }
  }

  // ---- helpers ------------------------------------------------------------

  _createLabelSprite(text, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 32);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    return new THREE.Sprite(mat);
  }

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
