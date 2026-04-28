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
  }

  update(dt, controllers) {
    if (this.phase === 'viewing') {
      this.viewingTimer += dt;
      if (this.viewingTimer >= this.viewingDuration) {
        this._startNarrative();
      }
    }

    // Always animate the 3D scene
    updateL3Scene(performance.now());
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
