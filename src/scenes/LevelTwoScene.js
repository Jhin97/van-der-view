// src/scenes/LevelTwoScene.js
//
// Level 2 (F-005): rank 5 NSAID analogs against COX-2 by predicted Vina ΔG.
// Lifecycle matches LevelOneScene: init / update(dt, controllers) /
// destroy / getGrabbables.
//
// UX: 5 pedestals in an arc. Triggering / clicking a pedestal reveals that
// ligand's bar on a VR bar chart plus a narrative card explaining its
// H-bond and hydrophobic contributions. Level completes once every pedestal
// has been activated.

import * as THREE from 'three';
import { loadJSON } from '../lib/asset-loader.js';

const DATA_PATH = '/src/data/l2-data.json';
const TELEMETRY_ENDPOINT = '/api/telemetry';
const TELEMETRY_INTERVAL_MS = 1000;

const HUB_CENTER = new THREE.Vector3(0, 1.0, -1.4);
const PEDESTAL_RADIUS = 1.2;
const BAR_CHART_POSITION = new THREE.Vector3(0, 1.6, -2.6);
const BAR_CHART_WIDTH = 1.6;
const BAR_CHART_HEIGHT = 0.8;
const NARRATIVE_POSITION = new THREE.Vector3(0, 2.4, -2.6);
const BRIEF_POSITION = new THREE.Vector3(0, 2.4, -1.4);

async function postTelemetry(events) {
  try {
    await fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(events),
    });
  } catch (err) {
    console.warn('[L2 telemetry]', err);
  }
}

function hexFromString(s) {
  return parseInt(s, 16);
}

export default class LevelTwoScene {
  constructor(ctx) {
    this.ctx = ctx;
    this.objects = [];
    this.pedestals = [];
    this.activated = new Set();
    this.data = null;
    this.barChart = null;
    this.narrativePanel = null;
    this.briefPanel = null;
    this.completed = false;
    this.onComplete = null;
    this.telemetryAccumMs = 0;
    this._prevSelect = [false, false];
    this._desktopClick = null;
    this.spawn = { player: [0, 0, 0], camera: [0, 1.6, 0.6] };
  }

  async init() {
    this.data = await loadJSON(DATA_PATH);

    this._buildEnvironment();
    this._buildPedestals();
    this._buildBarChart();
    this._buildNarrativePanel();
    this._buildBriefPanel();

    postTelemetry([
      {
        session_id: window.__VDV_SESSION_ID || crypto.randomUUID(),
        event_type: 'level_start',
        level: 'L2',
        target: 'cox2',
        ts: Date.now(),
      },
    ]);
  }

  // ---- environment --------------------------------------------------------

  _buildEnvironment() {
    const platGeo = new THREE.CylinderGeometry(2.0, 2.2, 0.08, 48);
    const platMat = new THREE.MeshStandardMaterial({ color: 0x14142a, roughness: 0.7, metalness: 0.2 });
    const platform = new THREE.Mesh(platGeo, platMat);
    platform.position.set(HUB_CENTER.x, 0.04, HUB_CENTER.z);
    this._add(platform);
  }

  _buildPedestals() {
    const ligands = this.data.ligands;
    const arcStart = -0.5; // radians, leftmost
    const arcEnd = 0.5;
    const n = ligands.length;

    for (let i = 0; i < n; i++) {
      const lig = ligands[i];
      const t = n === 1 ? 0.5 : i / (n - 1);
      const angle = arcStart + (arcEnd - arcStart) * t;
      const x = HUB_CENTER.x + Math.sin(angle) * PEDESTAL_RADIUS;
      const z = HUB_CENTER.z + Math.cos(angle) * PEDESTAL_RADIUS - PEDESTAL_RADIUS;

      const group = new THREE.Group();
      group.position.set(x, 0, z);

      const color = hexFromString(lig.color.replace('0x', ''));

      // Pedestal column
      const pedGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.7, 24);
      const pedMat = new THREE.MeshStandardMaterial({ color: 0x222244, roughness: 0.6, metalness: 0.3 });
      const pedestal = new THREE.Mesh(pedGeo, pedMat);
      pedestal.position.y = 0.35;
      group.add(pedestal);

      // Molecule proxy (color-coded sphere with a smaller sphere "substituent")
      const molGroup = new THREE.Group();
      molGroup.position.y = 0.92;

      const coreGeo = new THREE.IcosahedronGeometry(0.12, 1);
      const coreMat = new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: 0.25,
        roughness: 0.4,
        metalness: 0.4,
      });
      const core = new THREE.Mesh(coreGeo, coreMat);
      molGroup.add(core);

      // Add a few satellite atoms for visual variety
      for (let j = 0; j < 4; j++) {
        const angle = (j / 4) * Math.PI * 2;
        const sat = new THREE.Mesh(
          new THREE.IcosahedronGeometry(0.05, 0),
          new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
        );
        sat.position.set(Math.cos(angle) * 0.18, Math.sin(angle * 0.5) * 0.06, Math.sin(angle) * 0.18);
        molGroup.add(sat);
      }

      group.add(molGroup);

      // Selection ring (highlights when activated)
      const ringGeo = new THREE.RingGeometry(0.25, 0.3, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.71;
      group.add(ring);

      // Name label
      const label = this._createLabelSprite(lig.name, color);
      label.position.set(0, 1.2, 0);
      group.add(label);

      this._add(group);
      this.pedestals.push({
        group,
        ligand: lig,
        coreMat,
        ringMat,
        molGroup,
        idx: i,
      });
    }
  }

  // ---- bar chart ----------------------------------------------------------

  _buildBarChart() {
    const ligands = this.data.ligands;
    const group = new THREE.Group();
    group.position.copy(BAR_CHART_POSITION);

    // Background panel
    const panelGeo = new THREE.PlaneGeometry(BAR_CHART_WIDTH, BAR_CHART_HEIGHT);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0x080c1c, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    group.add(panel);

    // Title sprite
    const title = this._createTextSprite('COX-2 Vina ΔG (kcal/mol) — lower is tighter', '#9ad9ff', 28);
    title.position.set(0, BAR_CHART_HEIGHT / 2 - 0.07, 0.005);
    title.scale.set(BAR_CHART_WIDTH * 0.95, 0.07, 1);
    group.add(title);

    // Compute scaling: most negative score maps to max bar height
    const minScore = Math.min(...ligands.map((l) => l.vina_kcal));
    const maxBarHeight = BAR_CHART_HEIGHT * 0.65;
    const innerWidth = BAR_CHART_WIDTH * 0.9;
    const innerStart = -innerWidth / 2;
    const slot = innerWidth / ligands.length;

    const bars = [];
    for (let i = 0; i < ligands.length; i++) {
      const lig = ligands[i];
      const fullHeight = maxBarHeight * (lig.vina_kcal / minScore);
      const x = innerStart + slot * (i + 0.5);
      const baseY = -BAR_CHART_HEIGHT / 2 + 0.18;

      const color = hexFromString(lig.color.replace('0x', ''));

      // Bar (initially hidden — height grows on activation)
      const barMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.0 });
      const barGeo = new THREE.PlaneGeometry(slot * 0.55, 1);
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.position.set(x, baseY, 0.003);
      bar.scale.y = 0.0001; // hidden until activated
      group.add(bar);

      // Label below bar
      const label = this._createTextSprite(lig.name, '#ffffff', 22);
      label.position.set(x, baseY - 0.06, 0.005);
      label.scale.set(slot * 0.95, 0.05, 1);
      group.add(label);

      // Value label (shown when activated)
      const valueLabel = this._createTextSprite('', '#ffffff', 22);
      valueLabel.position.set(x, 0, 0.005);
      valueLabel.scale.set(slot * 0.95, 0.05, 1);
      valueLabel.visible = false;
      group.add(valueLabel);

      bars.push({ bar, fullHeight, baseY, valueLabel, lig });
    }

    this._add(group);
    this.barChart = { group, bars };
  }

  _revealBar(idx) {
    const entry = this.barChart.bars[idx];
    if (!entry) return;
    const { bar, fullHeight, baseY, valueLabel, lig } = entry;

    // Animate bar fill
    const startTime = performance.now();
    const duration = 600;
    const animate = () => {
      const t = Math.min(1, (performance.now() - startTime) / duration);
      const eased = 1 - (1 - t) * (1 - t);
      bar.scale.y = Math.max(0.0001, fullHeight * eased);
      bar.position.y = baseY + (fullHeight * eased) / 2;
      bar.material.opacity = 0.85 * eased;

      if (t < 1) requestAnimationFrame(animate);
      else {
        // Show value
        const tex = this._textTexture(lig.vina_kcal.toFixed(1), '#ffffff', 22);
        valueLabel.material.map.dispose();
        valueLabel.material.map = tex;
        valueLabel.material.needsUpdate = true;
        valueLabel.position.y = baseY + fullHeight + 0.04;
        valueLabel.visible = true;
      }
    };
    animate();
  }

  // ---- narrative panel ----------------------------------------------------

  _buildNarrativePanel() {
    const group = new THREE.Group();
    group.position.copy(NARRATIVE_POSITION);

    const w = 1.6;
    const h = 0.5;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 320;

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    group.add(panel);

    this._add(group);
    this.narrativePanel = { group, canvas, tex, panel };
    this._paintNarrative(null);
  }

  _paintNarrative(ligand) {
    const canvas = this.narrativePanel.canvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'rgba(8, 12, 28, 0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!ligand) {
      ctx.fillStyle = '#9ad9ff';
      ctx.font = 'bold 36px ui-sans-serif, system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillText('Trigger any pedestal to reveal a ligand', 32, 32);

      ctx.fillStyle = '#aaa';
      ctx.font = '24px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(this.data.score_hint, 32, 90);

      ctx.fillStyle = '#ffd166';
      ctx.font = '22px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`Activated ${this.activated.size}/${this.data.ligands.length}`, 32, canvas.height - 50);
      this.narrativePanel.tex.needsUpdate = true;
      return;
    }

    // Title row
    ctx.fillStyle = '#9ad9ff';
    ctx.font = 'bold 40px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(ligand.name, 32, 24);

    // Score
    ctx.fillStyle = '#ffd166';
    ctx.font = 'bold 32px ui-monospace, monospace';
    ctx.fillText(`ΔG = ${ligand.vina_kcal.toFixed(1)} kcal/mol`, 32, 80);

    // H-bonds + hydrophobic
    ctx.fillStyle = '#9ad9ff';
    ctx.font = '22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`H-bonds: ${ligand.h_bonds}     Hydrophobic burial: ${ligand.hydrophobic}`, 32, 130);

    // Tagline (wrapped)
    ctx.fillStyle = '#e0e0f0';
    ctx.font = '22px ui-sans-serif, system-ui, sans-serif';
    let y = 170;
    for (const line of this._wrapText(ctx, ligand.tagline, canvas.width - 64)) {
      ctx.fillText(line, 32, y);
      y += 28;
    }

    // Activation counter
    ctx.fillStyle = this.activated.size === this.data.ligands.length ? '#06d6a0' : '#ffd166';
    ctx.font = '22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(
      this.activated.size === this.data.ligands.length
        ? '✓ All five ranked — level complete'
        : `Activated ${this.activated.size}/${this.data.ligands.length}`,
      32,
      canvas.height - 50,
    );

    this.narrativePanel.tex.needsUpdate = true;
  }

  // ---- task brief ---------------------------------------------------------

  _buildBriefPanel() {
    const group = new THREE.Group();
    group.position.copy(BRIEF_POSITION);

    const w = 1.4;
    const h = 0.5;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(8, 12, 28, 0.92)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#9ad9ff';
    ctx.font = 'bold 40px ui-sans-serif, system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(this.data.brief.title, 32, 24);

    ctx.fillStyle = '#9ad9ff';
    ctx.font = 'bold 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Biology', 32, 90);
    ctx.fillStyle = '#e0e0f0';
    ctx.font = '22px ui-sans-serif, system-ui, sans-serif';
    let y = 120;
    for (const line of this._wrapText(ctx, this.data.brief.biology, canvas.width - 64)) {
      ctx.fillText(line, 32, y);
      y += 28;
    }
    y += 10;

    ctx.fillStyle = '#9ad9ff';
    ctx.font = 'bold 22px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('Engineering', 32, y);
    y += 30;
    ctx.fillStyle = '#e0e0f0';
    ctx.font = '22px ui-sans-serif, system-ui, sans-serif';
    for (const line of this._wrapText(ctx, this.data.brief.engineering, canvas.width - 64)) {
      ctx.fillText(line, 32, y);
      y += 28;
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide });
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    group.add(panel);
    this._add(group);
    this.briefPanel = { group, panel };
  }

  // ---- update loop --------------------------------------------------------

  update(dt, controllers) {
    this.telemetryAccumMs += dt;

    // Idle rotation on molecule proxies for visual interest
    const t = performance.now() * 0.001;
    for (const ped of this.pedestals) {
      ped.molGroup.rotation.y = t * 0.5;
      // Pulse activated rings; fade unselected ones
      if (this.activated.has(ped.idx)) {
        ped.ringMat.opacity = 0.6 + Math.sin(t * 3 + ped.idx) * 0.15;
      } else {
        ped.ringMat.opacity = 0.4 + Math.sin(t * 1.5 + ped.idx) * 0.08;
      }
    }

    this._handleSelections(controllers);

    if (!this.completed && this.activated.size === this.data.ligands.length) {
      this.completed = true;
      postTelemetry([
        {
          session_id: window.__VDV_SESSION_ID || 'anon',
          event_type: 'level_complete',
          level: 'L2',
          ts: Date.now(),
        },
      ]);
      // Defer onComplete by a beat so the user sees the final reveal
      setTimeout(() => {
        if (this.onComplete) this.onComplete();
      }, 1500);
    }
  }

  _handleSelections(controllers) {
    // VR triggers
    const session = this.ctx.renderer.xr.getSession();
    if (session) {
      let idx = 0;
      for (const source of session.inputSources) {
        if (idx >= 2) break;
        const pressed = !!source.gamepad?.buttons?.[0]?.pressed;
        const fresh = pressed && !this._prevSelect[idx];
        if (fresh) {
          const ctrl = controllers[idx];
          if (ctrl) {
            const tempMat = new THREE.Matrix4().extractRotation(ctrl.matrixWorld);
            const rc = new THREE.Raycaster();
            rc.ray.origin.setFromMatrixPosition(ctrl.matrixWorld);
            rc.ray.direction.set(0, 0, -1).applyMatrix4(tempMat);
            this._tryActivateFromRay(rc);
          }
        }
        this._prevSelect[idx] = pressed;
        idx++;
      }
    }

    // Desktop click
    if (this._desktopClick) {
      const rc = new THREE.Raycaster();
      rc.setFromCamera(this._desktopClick, this.ctx.camera);
      this._tryActivateFromRay(rc);
      this._desktopClick = null;
    }
  }

  _tryActivateFromRay(rc) {
    // Sprite.raycast dereferences raycaster.camera for billboard projection.
    // The VR branch builds rc by hand and never sets it, so do it here.
    if (!rc.camera) rc.camera = this.ctx.camera;
    for (const ped of this.pedestals) {
      const hits = rc.intersectObject(ped.group, true);
      if (hits.length > 0) {
        this._activate(ped);
        return;
      }
    }
  }

  _activate(ped) {
    const isFirstActivation = !this.activated.has(ped.idx);
    if (isFirstActivation) {
      this.activated.add(ped.idx);
      this._revealBar(ped.idx);
      ped.coreMat.emissiveIntensity = 0.7;

      postTelemetry([
        {
          session_id: window.__VDV_SESSION_ID || 'anon',
          event_type: 'l2_activate',
          level: 'L2',
          ligand: ped.ligand.name,
          activation_index: this.activated.size,
          ts: Date.now(),
        },
      ]);
    }
    this._paintNarrative(ped.ligand);
  }

  // ---- helpers ------------------------------------------------------------

  _createLabelSprite(text, color) {
    const tex = this._textTexture(text, '#ffffff', 28, color);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.4, 0.1, 1);
    return sprite;
  }

  _createTextSprite(text, color, size) {
    const tex = this._textTexture(text, color, size);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, side: THREE.DoubleSide });
    return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  }

  _textTexture(text, color, size, accentColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (accentColor) {
      ctx.fillStyle = `rgba(${(accentColor >> 16) & 0xff}, ${(accentColor >> 8) & 0xff}, ${accentColor & 0xff}, 0.15)`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.fillStyle = color;
    ctx.font = `bold ${size}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    return tex;
  }

  _wrapText(ctx, text, maxWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  _add(obj) {
    this.ctx.scene.add(obj);
    this.objects.push(obj);
  }

  // ---- lifecycle ----------------------------------------------------------

  getGrabbables() {
    // L2 has no draggable objects — selection is point-and-click on pedestals.
    return [];
  }

  destroy() {
    for (const obj of this.objects) {
      this.ctx.scene.remove(obj);
      obj.traverse?.((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }
    this.objects = [];
    this.pedestals = [];
  }
}
