import * as THREE from 'three';

// ---------------------------------------------------------------------------
// F-003 Tutorial Mode — Toy Pocket
// Acceptance: procedural pocket + 3 H-bond markers, grab→rotate→snap prompts,
//             steric-clash red / H-bond-vector blue overlay, no deadlocks
// ---------------------------------------------------------------------------

const STATES = {
  INTRO:       'INTRO',
  WAIT_GRAB:   'WAIT_GRAB',
  GRABBED:     'GRABBED',
  WAIT_ROTATE: 'WAIT_ROTATE',
  ROTATING:    'ROTATING',
  WAIT_SNAP:   'WAIT_SNAP',
  SNAPPED:     'SNAPPED',
  COMPLETE:    'COMPLETE',
};

const POCKET_RADIUS   = 0.25;
const MARKER_RADIUS   = 0.035;
const LIGAND_ARM_R    = 0.03;
const LIGAND_BOND_R   = 0.012;
// Ghost-overlay UX:
// A semi-transparent target ghost of the ligand sits at the docked pose.
// User just has to overlay their held ligand onto the ghost — when world-
// space distance between centres is below TARGET_OVERLAP_DIST, snap fires.
// Rotation is corrected by the snap animation, so the user doesn't have
// to nail orientation manually.
const TARGET_OVERLAP_DIST = 0.12;   // 12 cm tolerance volume around target
const HBOND_SHOW_DIST = 0.22;
const CLASH_DIST      = 0.06;

// Per-state timeouts (ms) before a progressive hint fires
const TIMEOUTS = {
  [STATES.WAIT_GRAB]:   12000,
  [STATES.WAIT_SNAP]:   18000,
};

export default class TutorialScene {
  constructor(ctx) {
    this.ctx = ctx;                       // { scene, player, renderer }
    this.state = STATES.INTRO;
    this.stateTime = 0;                   // ms in current state
    this.hintLevel = 0;                   // 0=none, 1=highlight, 2=arrow, 3=assist
    this.objects = [];                    // added to scene, removed on unload
    this.grabbables = [];
    this.hbondMarkers = [];
    this.ligandArms = [];                 // 3 arm world-positions tracked per frame
    this.hbondLines = [];
    this.clashSpheres = [];
    this.promptSprite = null;
    this.arrowGroup = null;
    this.snapAnim = null;
    this.onComplete = null;               // callback for scene manager
  }

  // ---- public lifecycle ---------------------------------------------------

  init() {
    this._buildPocket();
    this._buildLigand();
    this._buildGhostLigand();
    this._buildForceField();
    this._buildPrompt();
    this._buildArrow();
    this._buildFloorDecor();
    this._enterState(STATES.INTRO);
    // Spawn ~1m from the pocket (which sits at z=-0.6) so the user can
    // interact without walking.
    this.spawn = { player: [0, 0, 0], camera: [0, 1.6, 0.4] };
  }

  update(dt, controllers) {
    this.stateTime += dt;
    this._updateLigandArmPositions();
    this._updateForceField();
    this._updatePrompt();
    this._updateArrow();
    this._updatePulse(dt);
    this._updateState(controllers, dt);
    if (this.snapAnim) this._updateSnapAnim(dt);
  }

  getGrabbables() { return this.grabbables; }

  // ---- pocket geometry ----------------------------------------------------

  _buildPocket() {
    const { scene } = this.ctx;

    // Semi-transparent cutaway sphere (upper hemisphere)
    const pocketGeo = new THREE.SphereGeometry(POCKET_RADIUS, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const pocketMat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.25,
      roughness: 0.05,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const pocket = new THREE.Mesh(pocketGeo, pocketMat);
    pocket.position.set(0, 1.0, -0.6);
    this.pocketMesh = pocket;
    this._add(pocket);

    // Rim ring for visual clarity
    const rimGeo = new THREE.TorusGeometry(POCKET_RADIUS, 0.008, 12, 64);
    const rimMat = new THREE.MeshBasicMaterial({ color: 0x44aaff });
    const rim = new THREE.Mesh(rimGeo, rimMat);
    rim.position.copy(pocket.position);
    rim.rotation.x = Math.PI / 2;
    this._add(rim);

    // Base disk
    const baseGeo = new THREE.CylinderGeometry(POCKET_RADIUS + 0.04, POCKET_RADIUS + 0.04, 0.015, 48);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a3a, roughness: 0.8 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.set(0, 1.0 - 0.008, -0.6);
    this._add(base);

    // 3 H-bond markers at 120° intervals on inner surface
    this.hbondMarkers = [];
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const mGeo = new THREE.SphereGeometry(MARKER_RADIUS, 20, 20);
      const mMat = new THREE.MeshStandardMaterial({
        color: 0x00e5ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 0.5,
        roughness: 0.2,
      });
      const marker = new THREE.Mesh(mGeo, mMat);
      // Place on inner surface of pocket, slightly above equator
      const yOff = POCKET_RADIUS * 0.35;
      const rAtY = Math.sqrt(Math.max(0.001, POCKET_RADIUS * POCKET_RADIUS - yOff * yOff));
      marker.position.set(
        pocket.position.x + Math.cos(angle) * rAtY * 0.8,
        pocket.position.y + yOff,
        pocket.position.z + Math.sin(angle) * rAtY * 0.8,
      );
      this._add(marker);
      this.hbondMarkers.push(marker);
    }

    // Store target positions for alignment check
    this.pocketCenter = pocket.position.clone();
    this.targetArmPositions = this.hbondMarkers.map(m => m.position.clone());
  }

  // ---- ligand geometry ----------------------------------------------------

  _buildLigand() {
    const { scene } = this.ctx;
    // T-shaped toy ligand: central sphere + 3 arms (one upward, two sideways)
    const group = new THREE.Group();

    // Central sphere
    const cGeo = new THREE.SphereGeometry(LIGAND_ARM_R * 1.1, 20, 20);
    const cMat = new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.3, metalness: 0.3 });
    const center = new THREE.Mesh(cGeo, cMat);
    group.add(center);

    // Arm-tip geometry must coincide with the H-bond marker positions in
    // _buildPocket when the ligand is centered + aligned, otherwise the
    // alignment-completion check (SNAP_DIST + ALIGN_THRESHOLD) is unreachable.
    const yOff = POCKET_RADIUS * 0.35;
    const rAtY = Math.sqrt(Math.max(0.001, POCKET_RADIUS * POCKET_RADIUS - yOff * yOff)) * 0.8;
    const armLength = Math.sqrt(rAtY * rAtY + yOff * yOff);
    const armPositions = []; // local offsets for the arm tips
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
      const dx = Math.cos(angle) * rAtY;
      const dy = yOff;
      const dz = Math.sin(angle) * rAtY;
      const armTip = new THREE.Vector3(dx, dy, dz);
      armPositions.push(armTip);

      // Arm sphere
      const aGeo = new THREE.SphereGeometry(LIGAND_ARM_R, 16, 16);
      const aMat = new THREE.MeshStandardMaterial({ color: 0xff6f91, emissive: 0xff6f91, emissiveIntensity: 0.15, roughness: 0.3 });
      const arm = new THREE.Mesh(aGeo, aMat);
      arm.position.copy(armTip);
      group.add(arm);

      // Bond cylinder from center to arm
      const dir = armTip.clone().normalize();
      const bGeo = new THREE.CylinderGeometry(LIGAND_BOND_R, LIGAND_BOND_R, armLength, 8);
      const bMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5 });
      const bond = new THREE.Mesh(bGeo, bMat);
      // Position at midpoint
      bond.position.copy(armTip.clone().multiplyScalar(0.5));
      // Orient cylinder along direction
      bond.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      group.add(bond);
    }

    group.position.set(0, 1.2, -0.2);
    group.userData.grabbable = true;
    group.userData.tutorialLigand = true;

    this.ligandGroup = group;
    this.ligandArmLocalPositions = armPositions;
    this._add(group);
    this.grabbables.push(group);
  }

  // ---- ghost ligand (visual target) ---------------------------------------

  // The ghost is a low-opacity duplicate of the ligand, sat at the docked
  // pose. The user's job is simply to overlay their held copy onto this.
  // Geometry-wise the arms of the original ligand at identity rotation
  // already coincide with the H-bond markers (both _buildLigand and
  // _buildPocket use the same yOff / rAtY / angles), so the ghost goes at
  // pocketCenter with identity orientation.
  _buildGhostLigand() {
    const ghost = this.ligandGroup.clone(true);
    ghost.traverse((c) => {
      if (!c.material) return;
      c.material = c.material.clone();
      c.material.transparent = true;
      c.material.opacity = 0.28;
      c.material.depthWrite = false;
      if (c.material.emissive) {
        c.material.emissive.setHex(0x06d6a0);
        c.material.emissiveIntensity = 0.5;
      }
    });
    ghost.userData.grabbable = false;
    ghost.userData.tutorialLigand = false;
    ghost.position.copy(this.pocketCenter);
    ghost.quaternion.identity();
    this.ghostLigand = ghost;
    this.ghostTargetPos = this.pocketCenter.clone();
    this.ghostTargetQuat = ghost.quaternion.clone();
    this._add(ghost);
  }

  _hideGhost() {
    if (!this.ghostLigand) return;
    // Fade out over 350 ms, then hide.
    const start = performance.now();
    const ghost = this.ghostLigand;
    const fade = () => {
      const t = Math.min(1, (performance.now() - start) / 350);
      ghost.traverse((c) => {
        if (c.material && c.material.opacity !== undefined) {
          c.material.opacity = 0.28 * (1 - t);
        }
      });
      if (t < 1) requestAnimationFrame(fade);
      else ghost.visible = false;
    };
    fade();
  }

  // ---- force field overlay ------------------------------------------------

  _buildForceField() {
    // H-bond vectors (blue dashed lines) — one per marker-arm pair
    this.hbondLines = [];
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(), new THREE.Vector3(0, 0.01, 0),
      ]);
      const mat = new THREE.LineDashedMaterial({
        color: 0x00aaff,
        dashSize: 0.02,
        gapSize: 0.01,
        transparent: true,
        opacity: 0,
      });
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      line.visible = false;
      this._add(line);
      this.hbondLines.push(line);
    }

    // Steric clash spheres (red, instanced) — pool of 8
    this.clashSpheres = [];
    const cGeo = new THREE.SphereGeometry(0.025, 12, 12);
    const cMat = new THREE.MeshBasicMaterial({
      color: 0xff2244,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Mesh(cGeo, cMat.clone());
      s.visible = false;
      this._add(s);
      this.clashSpheres.push(s);
    }
  }

  // ---- prompt system ------------------------------------------------------

  _buildPrompt() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    this.promptCanvas = canvas;
    this.promptCtx = canvas.getContext('2d');

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.6, 0.15, 1);
    sprite.position.set(0, 1.7, -0.6);
    this._add(sprite);
    this.promptSprite = sprite;
  }

  _setPrompt(text) {
    const ctx = this.promptCtx;
    const w = this.promptCanvas.width;
    const h = this.promptCanvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 16);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2, w - 24);
    this.promptSprite.material.map.needsUpdate = true;
  }

  // ---- arrow indicator ----------------------------------------------------

  _buildArrow() {
    this.arrowGroup = new THREE.Group();
    this.arrowGroup.visible = false;
    this._add(this.arrowGroup);

    const coneGeo = new THREE.ConeGeometry(0.025, 0.07, 8);
    const coneMat = new THREE.MeshBasicMaterial({ color: 0x06d6a0 });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.rotation.x = Math.PI; // point downward
    this.arrowCone = cone;
    this.arrowGroup.add(cone);

    const lineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.15, 0),
    ]);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x06d6a0 });
    this.arrowGroup.add(new THREE.Line(lineGeo, lineMat));
  }

  _showArrow(target) {
    this.arrowGroup.visible = true;
    // Store either an Object3D (live tracking) or a static Vector3
    this.arrowTarget = target;
    this.arrowIsObject3D = target instanceof THREE.Object3D;
  }

  _hideArrow() {
    this.arrowGroup.visible = false;
    this.arrowTarget = null;
  }

  // ---- floor decorations --------------------------------------------------

  _buildFloorDecor() {
    // Glowing ring under the pocket area
    const ringGeo = new THREE.RingGeometry(0.35, 0.38, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.005, -0.6);
    this._add(ring);
    this.floorRing = ring;
  }

  // ---- state machine ------------------------------------------------------

  _enterState(state) {
    this.state = state;
    this.stateTime = 0;
    this.hintLevel = 0;

    switch (state) {
      case STATES.INTRO:
        this._setPrompt('Welcome! Grab the molecule with your trigger');
        this._showArrow(this.ligandGroup);
        break;

      case STATES.WAIT_GRAB:
        this._setPrompt('Grab the molecule with your trigger');
        this._showArrow(this.ligandGroup);
        break;

      case STATES.GRABBED:
        this._setPrompt('Move it onto the green ghost in the pocket');
        this._hideArrow();
        // Auto-advance after a short beat so the user reads the prompt.
        this._autoAdvance(STATES.WAIT_SNAP, 600);
        break;

      case STATES.WAIT_SNAP:
        this._setPrompt('Overlay the molecule onto the green ghost');
        this._showArrow(this.pocketCenter);
        break;

      case STATES.SNAPPED:
        this._setPrompt('Perfect dock!');
        this._hideArrow();
        this._startSnapAnimation();
        this._autoAdvance(STATES.COMPLETE, 2500);
        break;

      case STATES.COMPLETE:
        this._setPrompt('Tutorial complete! Well done.');
        this._hideArrow();
        if (this.onComplete) this.onComplete();
        break;
    }
  }

  _autoAdvance(targetState, delayMs) {
    this._advanceTimer = setTimeout(() => {
      if (this.state !== STATES.COMPLETE) {
        this._enterState(targetState);
      }
    }, delayMs);
  }

  _updateState(controllers, dt) {
    const isHeld = this._isLigandHeld(controllers);
    // Distance check is now world-space distance between the held ligand
    // and the ghost target — purely positional, no alignment math needed.
    const distToGhost = this._ligandWorldDistTo(this.ghostTargetPos);

    switch (this.state) {
      case STATES.INTRO:
        if (this.stateTime > 3000) this._enterState(STATES.WAIT_GRAB);
        break;

      case STATES.WAIT_GRAB:
        // Either grab (trigger) or just push the molecule with the thumbstick.
        // Either path advances to WAIT_SNAP; we also auto-advance after 5 s so
        // a thumbstick-only user is never stuck waiting for a grab.
        if (isHeld) this._enterState(STATES.GRABBED);
        else if (this.stateTime > 5000) this._enterState(STATES.WAIT_SNAP);
        this._checkTimeout(STATES.WAIT_GRAB);
        break;

      case STATES.GRABBED:
        // Auto-advance handled by timer (set in _enterState)
        break;

      case STATES.WAIT_SNAP:
        // No isHeld kick-back — the user may push the ligand onto the ghost
        // either by hand-grab or thumbstick. Snap fires on positional overlap
        // alone so a release-mid-drag (or pure-thumbstick) flow still works.
        if (distToGhost < TARGET_OVERLAP_DIST) {
          this._enterState(STATES.SNAPPED);
        }
        this._checkTimeout(STATES.WAIT_SNAP);
        break;

      // WAIT_ROTATE and ROTATING are kept in STATES for backward-compat
      // (skip-shortcut order array references them) but the user never
      // enters them — overlay UX collapses to a single positioning step.
      case STATES.WAIT_ROTATE:
      case STATES.ROTATING:
        this._enterState(STATES.WAIT_SNAP);
        break;

      case STATES.SNAPPED:
      case STATES.COMPLETE:
        break;
    }

    this._checkForceSkip(controllers, dt);
  }

  _checkTimeout(state) {
    const timeout = TIMEOUTS[state];
    if (!timeout) return;
    if (this.stateTime > timeout && this.hintLevel < 1) {
      this.hintLevel = 1;
      this._applyHint(state);
    }
    if (this.stateTime > timeout * 1.5 && this.hintLevel < 2) {
      this.hintLevel = 2;
      this._applyHint(state);
    }
    if (this.stateTime > timeout * 2 && this.hintLevel < 3) {
      this.hintLevel = 3;
      this._applyHint(state);
    }
  }

  _applyHint(state) {
    switch (state) {
      case STATES.WAIT_GRAB:
        // Highlight the ligand with glow
        this.ligandGroup.children.forEach(c => {
          if (c.material && c.material.emissiveIntensity !== undefined) {
            c.material.emissiveIntensity = 0.8;
          }
        });
        if (this.hintLevel >= 2) {
          this._showArrow(this.ligandGroup);
          this._setPrompt('Use your trigger to grab the glowing molecule');
        }
        break;

      case STATES.WAIT_SNAP:
        if (this.hintLevel >= 2) {
          this._showArrow(this.pocketCenter);
          this._setPrompt('Bring the molecule into the green ghost');
        }
        if (this.hintLevel >= 3) {
          // Make the ghost pulse so the target is unmissable.
          if (this.ghostLigand) {
            this.ghostLigand.traverse((c) => {
              if (c.material && c.material.emissive) {
                c.material.emissive.setHex(0xffd166);
              }
            });
          }
        }
        break;
    }
  }

  _checkForceSkip(controllers, dt) {
    if (this.state === STATES.COMPLETE) return;
    // Check if both select buttons are held
    let bothHeld = true;
    for (const ctrl of controllers) {
      if (!ctrl || !ctrl.userData) { bothHeld = false; break; }
      // selectstart sets held, but for force-skip we check gamepad
      const session = this.ctx.renderer.xr.getSession();
      if (!session) { bothHeld = false; break; }
    }
    // Simpler: check if both controllers are holding something OR user holds both triggers
    // For 2D desktop testing: press both mouse buttons — skip after 2s of holding both
    if (this._forceSkipTimer === undefined) this._forceSkipTimer = 0;
    // We'll use a keyboard shortcut for desktop: press Space twice
    // For VR: we rely on the timeout system which always progresses
  }

  // ---- alignment & distance helpers ---------------------------------------

  _updateLigandArmPositions() {
    this.ligandArms = this.ligandArmLocalPositions.map(localPos => {
      const worldPos = localPos.clone();
      this.ligandGroup.localToWorld(worldPos);
      return worldPos;
    });
  }

  // Thumbstick → object translation (player is locked in space).
  // Forwarded from main.js's handleThumbstickInput. Both thumbsticks
  // contribute different axes:
  //   left  X  → world X   (right/left)
  //   left  Y  → world Z   (forward/back; push forward = away from camera)
  //   right Y  → world Y   (up/down)
  //
  // Skipped once the ligand is locked (post-snap) so the user can't yank
  // it back out of the dock with the stick.
  applyThumbstickInput({ leftX, leftY, rightY }, dt) {
    if (!this.ligandGroup) return;
    if (!this.ligandGroup.userData.grabbable) return;

    const speed = 0.6; // m/s at full deflection
    const k = (dt / 1000) * speed;

    // World-space translation; ligand may be parented to a controller while
    // grabbed, so go through getWorldPosition + parent.worldToLocal so the
    // axes always feel global.
    const worldPos = new THREE.Vector3();
    this.ligandGroup.getWorldPosition(worldPos);
    worldPos.x += leftX * k;
    worldPos.z += leftY * k;       // push forward (Y=-1) → -z, toward the pocket
    worldPos.y -= rightY * k;      // push up (Y=-1) → +y
    if (this.ligandGroup.parent) {
      this.ligandGroup.parent.worldToLocal(worldPos);
    }
    this.ligandGroup.position.copy(worldPos);
  }

  _ligandToPocketDist() {
    return this.ligandGroup.position.distanceTo(this.pocketCenter);
  }

  _ligandWorldDistTo(worldTarget) {
    const wp = new THREE.Vector3();
    this.ligandGroup.getWorldPosition(wp);
    return wp.distanceTo(worldTarget);
  }

  _alignmentScore() {
    // Match each ligand arm to the nearest H-bond marker and compute avg alignment
    let totalScore = 0;
    const used = new Set();
    for (let i = 0; i < 3; i++) {
      let bestDist = Infinity;
      let bestJ = 0;
      for (let j = 0; j < 3; j++) {
        if (used.has(j)) continue;
        const d = this.ligandArms[i].distanceTo(this.targetArmPositions[j]);
        if (d < bestDist) { bestDist = d; bestJ = j; }
      }
      used.add(bestJ);
      // Score: 1.0 at distance 0, 0.0 at distance > 0.2
      totalScore += Math.max(0, 1 - bestDist / 0.2);
    }
    return totalScore / 3;
  }

  _nudgeAlignment(amount) {
    // Compute rotation that would improve alignment and apply a fraction
    const targetQuat = this._computeAlignmentQuaternion();
    if (targetQuat) {
      this.ligandGroup.quaternion.slerp(targetQuat, amount);
    }
  }

  _nudgeTowardPocket(amount) {
    const dir = this.pocketCenter.clone().sub(this.ligandGroup.position).normalize();
    this.ligandGroup.position.addScaledVector(dir, amount);
  }

  _computeAlignmentQuaternion() {
    // Find rotation that best maps ligand arms to marker positions
    // Simplified: use the first arm-marker pair to estimate rotation
    if (this.ligandArms.length < 1) return null;

    const ligandCenter = this.ligandGroup.position.clone();
    const pocketCenter = this.pocketCenter.clone();

    // Direction vectors from centers
    const armDir = this.ligandArms[0].clone().sub(ligandCenter).normalize();
    const markerDir = this.targetArmPositions[0].clone().sub(pocketCenter).normalize();

    const quat = new THREE.Quaternion().setFromUnitVectors(armDir, markerDir);
    return quat;
  }

  // ---- force field update -------------------------------------------------

  _updateForceField() {
    // H-bond lines — greedy nearest-neighbor matching so each line gets a unique pair
    const usedArms = new Set();
    const usedMarkers = new Set();
    const pairs = [];
    for (let iter = 0; iter < 3; iter++) {
      let bestDist = Infinity, bestA = -1, bestM = -1;
      for (let a = 0; a < 3; a++) {
        if (usedArms.has(a)) continue;
        for (let m = 0; m < 3; m++) {
          if (usedMarkers.has(m)) continue;
          const d = this.ligandArms[a].distanceTo(this.hbondMarkers[m].position);
          if (d < bestDist) { bestDist = d; bestA = a; bestM = m; }
        }
      }
      if (bestA >= 0) { usedArms.add(bestA); usedMarkers.add(bestM); pairs.push({ a: bestA, m: bestM, dist: bestDist }); }
    }

    for (let i = 0; i < 3; i++) {
      const line = this.hbondLines[i];
      if (i < pairs.length) {
        const { a, m, dist } = pairs[i];
        const armPos = this.ligandArms[a];
        const markerPos = this.hbondMarkers[m].position;

        if (dist < HBOND_SHOW_DIST) {
          line.visible = true;
          const positions = line.geometry.attributes.position;
          positions.setXYZ(0, armPos.x, armPos.y, armPos.z);
          positions.setXYZ(1, markerPos.x, markerPos.y, markerPos.z);
          positions.needsUpdate = true;
          line.computeLineDistances();

          const t = 1 - dist / HBOND_SHOW_DIST;
          line.material.opacity = t * 0.8;
          if (dist < 0.05) {
            line.material.color.setHex(0x00e5ff);
            line.material.dashSize = 999; // solid
          } else {
            line.material.color.setHex(0x0088cc);
            line.material.dashSize = 0.02;
          }
        } else {
          line.visible = false;
        }
      } else {
        line.visible = false;
      }
    }

    // Steric clash spheres
    const ligandPos = this.ligandGroup.position;
    const dist = ligandPos.distanceTo(this.pocketCenter);
    let clashIdx = 0;

    if (dist < POCKET_RADIUS + 0.05) {
      // Check each arm for proximity to pocket wall
      for (const armPos of this.ligandArms) {
        const armDist = armPos.distanceTo(this.pocketCenter);
        if (armDist > POCKET_RADIUS - CLASH_DIST && armDist < POCKET_RADIUS + CLASH_DIST) {
          if (clashIdx < this.clashSpheres.length) {
            const s = this.clashSpheres[clashIdx++];
            s.visible = true;
            s.position.copy(armPos);
            // Position on pocket surface
            const dir = armPos.clone().sub(this.pocketCenter).normalize();
            s.position.copy(this.pocketCenter).addScaledVector(dir, POCKET_RADIUS);
            const intensity = 1 - Math.abs(armDist - POCKET_RADIUS) / CLASH_DIST;
            s.material.opacity = intensity * 0.6;
            s.scale.setScalar(0.8 + intensity * 0.5);
          }
        }
      }
    }

    // Hide unused clash spheres
    for (let i = clashIdx; i < this.clashSpheres.length; i++) {
      this.clashSpheres[i].visible = false;
    }
  }

  // ---- prompt & arrow updates ---------------------------------------------

  _updatePrompt() {
    // Subtle floating animation
    if (this.promptSprite) {
      this.promptSprite.position.y = 1.7 + Math.sin(performance.now() * 0.002) * 0.02;
    }
  }

  _updateArrow() {
    if (!this.arrowGroup.visible || !this.arrowTarget) return;
    let pos;
    if (this.arrowIsObject3D) {
      pos = this.arrowTarget.position;
    } else {
      pos = this.arrowTarget; // Vector3
    }
    this.arrowGroup.position.copy(pos).add(new THREE.Vector3(0, 0.2, 0));
    // Bobbing animation
    this.arrowGroup.position.y += Math.sin(performance.now() * 0.004) * 0.03;
  }

  _updatePulse(dt) {
    // Pulse H-bond markers
    const t = performance.now() * 0.003;
    for (const marker of this.hbondMarkers) {
      const s = 1 + Math.sin(t) * 0.15;
      marker.scale.setScalar(s);
    }
  }

  // ---- snap animation -----------------------------------------------------

  _startSnapAnimation() {
    // Detach from controller and attach to scene so the target pose is
    // fixed in world space.
    if (this.ligandGroup.parent !== this.ctx.scene) {
      this.ctx.scene.attach(this.ligandGroup);
    }
    this.snapAnim = {
      startPos: this.ligandGroup.position.clone(),
      startQuat: this.ligandGroup.quaternion.clone(),
      targetPos: this.ghostTargetPos.clone(),
      targetQuat: this.ghostTargetQuat.clone(),
      elapsed: 0,
      duration: 350,
    };
    // Lock: not grabbable, not in active grab list. After snap the ligand
    // stays put — no more wandering.
    this.ligandGroup.userData.grabbable = false;
    const gi = this.grabbables.indexOf(this.ligandGroup);
    if (gi !== -1) this.grabbables.splice(gi, 1);

    // Positive feedback: fade the ghost out, haptic on both controllers,
    // emissive flash on the now-locked ligand.
    this._hideGhost();
    this._snapHaptic();
    this._snapVisualFlash();
  }

  _snapHaptic() {
    const session = this.ctx.renderer.xr.getSession();
    if (!session) return;
    for (const src of session.inputSources) {
      const a = src.gamepad?.hapticActuators?.[0];
      a?.pulse(0.7, 80);
    }
  }

  _snapVisualFlash() {
    // Flash all ligand mesh emissives green for ~0.6s, then ease back to a
    // higher resting intensity so the snapped ligand reads as "active".
    this.ligandGroup.traverse((c) => {
      if (c.material && c.material.emissive) {
        c.userData._origEmissive = c.material.emissive.getHex();
        c.userData._origEmissiveIntensity = c.material.emissiveIntensity ?? 0;
        c.material.emissive.setHex(0x06d6a0);
        c.material.emissiveIntensity = 1.4;
      }
    });
    setTimeout(() => {
      this.ligandGroup.traverse((c) => {
        if (c.material && c.material.emissive && c.userData._origEmissive !== undefined) {
          c.material.emissive.setHex(c.userData._origEmissive);
          c.material.emissiveIntensity = Math.max(0.45, c.userData._origEmissiveIntensity);
        }
      });
    }, 600);
  }

  _magneticAssist(dt, dist) {
    // The ligand is parented to the holding controller while grabbed, so
    // ligandGroup.position is in controller-local space. We must lerp in
    // WORLD space and then convert back to local, otherwise the pull is
    // inconsistent or invisible.
    const target = this.pocketCenter;

    // Falloff: stronger near the pocket center, gentler at the edge.
    const t = Math.max(0, Math.min(1, 1 - dist / MAGNETIC_RADIUS));
    const strength = MAGNETIC_PULL_BASE + (MAGNETIC_PULL_PEAK - MAGNETIC_PULL_BASE) * t;
    const k = Math.min(1, (dt / 16) * strength);

    // World-space lerp.
    const worldPos = new THREE.Vector3();
    this.ligandGroup.getWorldPosition(worldPos);
    worldPos.lerp(target, k);
    if (this.ligandGroup.parent) {
      this.ligandGroup.parent.worldToLocal(worldPos);
    }
    this.ligandGroup.position.copy(worldPos);

    // Rotation pull toward the best-alignment quaternion. _computeAlignmentQuaternion
    // operates on world arm/marker directions so its output is a world-space
    // delta rotation; applied to local quaternion this is an approximation
    // (good enough when the holding controller has near-identity orientation
    // relative to scene root).
    const targetQuat = this._computeAlignmentQuaternion();
    if (targetQuat) {
      this.ligandGroup.quaternion.slerp(targetQuat, k);
    }
  }

  _updateSnapAnim(dt) {
    const a = this.snapAnim;
    a.elapsed += dt;
    const t = Math.min(1, a.elapsed / a.duration);
    const e = 1 - Math.pow(1 - t, 3);
    this.ligandGroup.position.lerpVectors(a.startPos, a.targetPos, e);
    this.ligandGroup.quaternion.slerpQuaternions(a.startQuat, a.targetQuat, e);
    if (t >= 1) {
      this.snapAnim = null;
      // Marker pulse — slightly stronger than before so the docked state
      // visibly settles.
      for (const marker of this.hbondMarkers) {
        marker.material.emissiveIntensity = 1.8;
        setTimeout(() => { marker.material.emissiveIntensity = 0.7; }, 500);
      }
    }
  }

  // ---- helpers ------------------------------------------------------------

  _isLigandHeld(controllers) {
    for (const ctrl of controllers) {
      if (ctrl && ctrl.userData && ctrl.userData.held === this.ligandGroup) return true;
    }
    return false;
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
        if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
        else obj.material.dispose();
      }
    }
    this.objects = [];
    this.grabbables = [];
    if (this._advanceTimer) clearTimeout(this._advanceTimer);
    if (this._skipHandler) window.removeEventListener('keydown', this._skipHandler);
  }

  // Called by main.js after init() to wire up desktop skip shortcut
  enableSkipShortcut() {
    this._skipHandler = (e) => {
      if (e.code === 'Space' && this.state !== STATES.COMPLETE) {
        e.preventDefault();
        const order = [STATES.INTRO, STATES.WAIT_GRAB, STATES.GRABBED, STATES.WAIT_ROTATE, STATES.ROTATING, STATES.WAIT_SNAP, STATES.SNAPPED, STATES.COMPLETE];
        const idx = order.indexOf(this.state);
        if (idx < order.length - 1) this._enterState(order[idx + 1]);
      }
    };
    window.addEventListener('keydown', this._skipHandler);
  }
}
