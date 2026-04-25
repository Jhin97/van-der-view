// src/scenes/LevelThreeScene.js
//
// Level 3: dual-pocket COX-1 vs COX-2 comparison with Vioxx narrative.
// Lifecycle: init / update(dt, controllers) / destroy / getGrabbables.

import * as THREE from 'three';
import { initL3Scene, updateL3Scene, COX1_SCORE, COX2_SCORE, SELECTIVITY_RATIO } from '../l3-scenario.js';
import { showSelectivityHUD, hideSelectivityHUD, showCutscene, showWrapCard } from '../narrative-ui.js';

export default class LevelThreeScene {
  constructor(ctx) {
    this.ctx = ctx; // { scene, player, renderer, camera }
    this.objects = [];
    this.grabbables = [];
    this.onComplete = null; // callback when L3 is finished
    this.l3Group = null;
    this.phase = 'viewing'; // viewing | cutscene | wrap | done
    this.viewingTimer = 0;
    this.viewingDuration = 5000; // ms before cutscene triggers
  }

  init() {
    this.spawn = { player: [0, 0, 0], camera: [0, 1.6, 3] };
    initL3Scene(this.ctx.scene);

    // Find the L3 group for cleanup later
    this.l3Group = this.ctx.scene.getObjectByName('L3');

    showSelectivityHUD();
    this.phase = 'viewing';
    this.viewingTimer = 0;

    // Post telemetry for level start
    try {
      fetch('/api/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{
          session_id: window.__VDV_SESSION_ID || crypto.randomUUID(),
          event_type: 'level_start',
          level: 'L3',
          ts: Date.now(),
        }]),
      });
    } catch {}
  }

  update(dt, controllers) {
    if (this.phase === 'viewing') {
      this.viewingTimer += dt;
      // Allow early skip with trigger press
      if (this._anyTriggerPressed()) {
        this.viewingTimer = this.viewingDuration;
      }
      if (this.viewingTimer >= this.viewingDuration) {
        this._startNarrative();
      }
    }

    // Always animate the 3D scene
    updateL3Scene(performance.now());
  }

  _anyTriggerPressed() {
    const session = this.ctx.renderer.xr.getSession();
    if (!session) return false;
    for (const source of session.inputSources) {
      if (source.gamepad?.buttons?.[0]?.pressed) {
        // Also skip any active overlay (cutscene or wrap card)
        if (window.__VDV_CUTSCENE_SKIP) window.__VDV_CUTSCENE_SKIP();
        if (window.__VDV_WRAP_SKIP) window.__VDV_WRAP_SKIP();
        return true;
      }
    }
    return false;
  }

  async _startNarrative() {
    this.phase = 'cutscene';
    hideSelectivityHUD();
    await showCutscene();
    this.phase = 'wrap';
    await showWrapCard();
    this.phase = 'done';
    if (this.onComplete) this.onComplete();
  }

  getGrabbables() {
    return this.grabbables;
  }

  destroy() {
    hideSelectivityHUD();
    if (this.l3Group) {
      this.ctx.scene.remove(this.l3Group);
      this.l3Group.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
      this.l3Group = null;
    }
    this.objects = [];
  }
}
