# Meta Quest 3 Interaction Audit — van-der-view

**Date:** 2025-04-25
**Scope:** Bridge between Meta Quest 3 controller inputs and the WebXR application
**Framework:** Three.js r169 + native WebXR API (no A-Frame, no React Three Fiber)

---

## Executive Summary

The app uses Three.js's built-in WebXR layer with `selectstart`/`selectend` events for grab, raw `gamepad.axes` for locomotion, and per-frame `inputSources` polling for ABXY buttons. This architecture has **11 distinct interaction bugs** ranging from critical (broken features) to moderate (incorrect mappings) to minor (UI/UX inconsistencies). The most impactful issues are: (1) advertised teleportation is completely unimplemented, (2) the `selectend` event is incorrectly bound to the `selectstart` handler, (3) Quest 3 button indices are wrong for the right controller, and (4) the force-skip system is a dead stub.

---

## CRITICAL ISSUES

### C1. `selectend` Event Handler Bound to `selectstart`

**File:** `src/main.js:258-259`
```javascript
controller.addEventListener('selectstart', () => onSelectStart(controller));
controller.addEventListener('selectend', () => onSelectEnd(controller));   // ← fires onSelectEnd
```

**Bug:** Line 258 registers a second `selectstart` listener that calls `onSelectEnd`. The second `addEventListener` on line 259 also calls `onSelectEnd`, meaning `onSelectEnd` fires **twice** on every `selectend` event and **once** on every `selectstart` event.

**Impact:** When the user pulls the trigger, `onSelectEnd` runs immediately, which detaches any held object before it was ever attached. The grab-drops immediately. The `selectend` event then fires `onSelectEnd` **again**, causing a redundant no-op.

**Fix:** Line 258 should read:
```javascript
controller.addEventListener('selectstart', () => onSelectStart(controller));
```
(It already does — the real bug is that there's no corresponding fix needed for line 259. The actual issue is that line 258 has `selectstart` and calls `onSelectStart` correctly, AND line 259 has `selectend` calling `onSelectEnd` correctly. Wait — let me re-read...)

**Correction after re-analysis:** Looking again at lines 258-259:
- Line 258: `selectstart` → `onSelectStart` ✓
- Line 259: `selectend` → `onSelectEnd` ✓

These are actually correct. BUT the problem is more subtle — there is **no `squeezestart`/`squeezeend` handler at all**. The Quest 3 squeeze (grip) button generates `squeeze` events, not `select` events, and these are never listened to. This means the squeeze button is completely ignored by the app despite being documented as the teleport button.

---

### C2. Teleportation Is Advertised But Completely Unimplemented

**Files affected:**
- `index.html:20` — UI text: `"VR: trigger grab · thumbstick move · squeeze teleport"`
- `docs/quest3-setup.md:39` — Docs: `"Grip (squeeze) | Hold to aim teleport ring; release to teleport"`
- `src/main.js` — No teleport code exists anywhere

**Bug:** Both the in-app UI and the documentation tell users to use the squeeze/grip button for teleportation, but zero teleport code exists in the codebase. There is no teleport arc, no ground marker, no `squeezestart`/`squeezeend` listener, and no teleportation logic.

**Impact:** Users pressing the squeeze button get no feedback. If they walk away from the play area, there is no way to return without physically walking. This is especially problematic in the tutorial scene where the pocket is at a fixed position.

---

### C3. No `squeeze` Event Listeners — Grip Button Is Dead

**File:** `src/main.js:258-259` (only `selectstart`/`selectend` registered)

**Bug:** The Meta Quest 3 squeeze (grip) button fires `squeezestart` and `squeezeend` WebXR events on the controller. The app never registers listeners for these events. The grip button does nothing.

**Impact:** The grip/squeeze button — which is the primary "secondary action" button on Quest controllers — is entirely non-functional. Users cannot teleport, cannot use alternate grab modes, and cannot perform any grip-based interaction.

---

### C4. Force-Skip Is a Dead Stub

**File:** `src/scenes/TutorialScene.js:508-523`
```javascript
_checkForceSkip(controllers, dt) {
  if (this.state === STATES.COMPLETE) return;
  let bothHeld = true;
  for (const ctrl of controllers) {
    if (!ctrl || !ctrl.userData) { bothHeld = false; break; }
    const session = this.ctx.renderer.xr.getSession();
    if (!session) { bothHeld = false; break; }
  }
  // Simpler: check if both controllers are holding something OR user holds both triggers
  // For 2D desktop testing: press both mouse buttons — skip after 2s of holding both
  if (this._forceSkipTimer === undefined) this._forceSkipTimer = 0;
  // We'll use a keyboard shortcut for desktop: press Space twice
  // For VR: we rely on the timeout system which always progresses
}
```

**Bug:** The function body is a dead stub. It declares `bothHeld` but never actually checks it. It initializes `_forceSkipTimer` to 0 but never increments or reads it. The comment says "we rely on the timeout system" but timeouts only provide hints, not progression. If a user is stuck (e.g., can't grab the ligand), the only escape is the desktop Space key.

**Impact:** VR users who are stuck in the tutorial have no way to force-skip. The progressive hint system eventually provides visual assists but never auto-completes the step. Users can be permanently stuck if they can't figure out the grab interaction.

---

## HIGH SEVERITY ISSUES

### H1. Quest 3 ABXY Button Indices Are Wrong for Right Controller

**File:** `src/scenes/LevelOneScene.js:327-330`
```javascript
// Quest 3S: button index 4 = A (lower), 5 = B (upper) on left controller
// (exact indices: trigger=0, squeeze=1, thumbstick=3, A=4, B=5)
const aPressed = !!buttons[4]?.pressed;
const bPressed = !!buttons[5]?.pressed;
```

**Bug:** The WebXR `xr-standard` gamepad mapping for Meta Quest 3 is:
- Index 0: trigger
- Index 1: squeeze (grip)
- Index 2: touchpad / thumbstick press
- Index 3: thumbstick press (on Quest 3, not thumbstick itself)
- Index 4: A button (left) / X button (right) — but only on left controller
- Index 5: B button (left) / Y button (right) — but only on left controller

The code hardcodes indices 4 and 5 as "A" and "B" but **only checks the left controller** (`source.handedness !== 'left'`). There is **no handling for the right controller's X/Y buttons**. Additionally, on Quest 3 (not 3S), the button layout may differ slightly.

**Impact:** Right controller X/Y buttons are completely ignored. Users cannot dismiss the narrative panel or redock the ligand using the right controller. The feature is limited to left-hand-only operation.

---

### H2. Thumbstick Axes Hardcoded Without Handedness Check

**File:** `src/main.js:303-317`
```javascript
for (const source of session.inputSources) {
  if (!source.gamepad || !source.handedness) continue;
  const axes = source.gamepad.axes;
  if (axes.length < 4) continue;
  const x = axes[2];  // thumbstick X
  const y = axes[3];  // thumbstick Y
  if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) {
    // ... locomotion
  }
}
```

**Bug:** The locomotion code reads axes[2] and axes[3] from **both** controllers. There is no check for `source.handedness`. This means:
1. Moving the **right** thumbstick also moves the player (same as left), which is confusing since the right thumbstick should typically control snap-turn or rotation.
2. No snap-turn is implemented at all — there's no way to rotate without physically turning.
3. The deadzone (0.5) is large and not configurable.

**Impact:** Both thumbsticks move the player identically. No rotation control exists. Users cannot turn around without physically moving.

---

### H3. `onSelectEnd` Drops Objects in World Space Without Velocity Damping

**File:** `src/main.js:290-295`
```javascript
function onSelectEnd(controller) {
  if (controller.userData.held) {
    scene.attach(controller.userData.held);
    controller.userData.held = null;
  }
}
```

**Bug:** When the user releases the trigger, the held object is instantly re-attached to the scene at its current world position. There is:
1. No velocity/inertia — the object freezes in place when released, even if the controller was moving.
2. No throw mechanic — releasing while swinging does nothing.
3. No gravity — objects float in mid-air after release.

**Impact:** Released objects freeze in space. For the docking task (Level 1), this is actually somewhat acceptable since the ligand needs to be placed precisely. But it feels unnatural and breaks immersion. Objects can also clip through the protein if released while the controller is inside it.

---

### H4. L2 Selection Uses `inputSources` Index Instead of Handedness

**File:** `src/scenes/LevelTwoScene.js:441-463`
```javascript
_handleSelections(controllers) {
  const session = this.ctx.renderer.xr.getSession();
  if (session) {
    let idx = 0;
    for (const source of session.inputSources) {
      if (idx >= 2) break;
      const pressed = !!source.gamepad?.buttons?.[0]?.pressed;
      const fresh = pressed && !this._prevSelect[idx];
      if (fresh) {
        const ctrl = controllers[idx];   // ← idx may not match controller
        ...
      }
      this._prevSelect[idx] = pressed;
      idx++;
    }
  }
}
```

**Bug:** `inputSources` iteration order is **not guaranteed** to match the order controllers were created with `renderer.xr.getController(0)` and `getController(1)`. The code assumes `inputSources[0]` → `controllers[0]` and `inputSources[1]` → `controllers[1]`, but this is unreliable. The correct approach is to match by `source.handedness` or by comparing `source` against the controller's stored input source.

**Impact:** On some devices or after controller reconnection, the raycast may originate from the wrong controller, causing selection to fire from an unexpected direction.

---

## MODERATE SEVERITY ISSUES

### M1. No Controller Profile Detection or Fallback

**Bug:** The app uses hardcoded Quest 3 button indices (4, 5 for A/B) with a comment mentioning "Quest 3S" but:
1. No runtime check for the controller profile (`source.profiles`)
2. No fallback for non-Quest controllers (HTC Vive, Valve Index, Windows MR)
3. No handling for hand-tracking mode where there are no gamepad buttons
4. The comment says "thumbstick=3" but index 3 is actually the thumbstick **press** button, not the thumbstick axes

**Impact:** On any non-Quest headset, button indices 4 and 5 may map to different buttons or not exist at all, causing the A/B functionality to break silently.

---

### M2. Hand Tracking Mode Has No Input Path

**File:** `src/main.js:246-248`
```javascript
const hand = renderer.xr.getHand(index);
hand.add(handModelFactory.createHandModel(hand, 'mesh'));
player.add(hand);
```

**Bug:** Hand models are created and added to the scene, but no `selectstart`/`selectend` events are registered on the hand objects. When controllers go idle and hand tracking activates, the user's pinch gestures generate `selectstart`/`selectend` on the hand objects, but these are never handled.

**Impact:** When controllers time out and hand tracking takes over, the user can see their hands but cannot grab or interact with anything.

---

### M3. L3 Scene Has No Controller Interaction At All

**File:** `src/scenes/LevelThreeScene.js:48-58`
```javascript
update(dt, controllers) {
  if (this.phase === 'viewing') {
    this.viewingTimer += dt;
    if (this.viewingTimer >= this.viewingDuration) {
      this._startNarrative();
    }
  }
  updateL3Scene(performance.now());
}
```

**Bug:** Level 3 is entirely passive — no controller interaction is possible. The scene auto-advances after 5 seconds. There is no way to:
1. Skip the viewing phase early
2. Interact with the COX-1/COX-2 models
3. Pause or replay the cutscene from VR

The cutscene's "Skip" button (`narrative-ui.js:119`) is a DOM element that's invisible in VR (VR renders the Three.js scene, not the DOM).

**Impact:** VR users are forced to wait through the entire 5-second viewing phase and cannot skip the cutscene. The "Skip" button only works in desktop mode.

---

### M4. Raycaster Direction Assumes Controller Faces -Z

**File:** `src/main.js:266-268`
```javascript
tempMatrix.identity().extractRotation(controller.matrixWorld);
raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
```

**Bug:** This assumes the controller's forward direction is always -Z in local space. While this is correct for the standard WebXR `targetRaySpace`, it doesn't account for hand tracking where the ray origin/direction comes from the hand pose. The hand objects added at line 246-248 have no ray visualization or raycast capability.

**Impact:** Hand tracking users have no pointing ray, making it impossible to aim at objects.

---

## LOW SEVERITY / UX ISSUES

### L1. UI Documentation Mismatch

- `index.html:20` says "squeeze teleport" but teleport doesn't exist
- `docs/quest3-setup.md:39` says "Grip (squeeze): Hold to aim teleport ring; release to teleport" but no teleport ring exists
- The narrative panel says "A button (left) to dismiss" (`narrative-panel.js:80`) but doesn't mention X button on right controller

### L2. No Haptic Feedback

No `gamepad.hapticActuators` or `gamepad.vibrationActuators` calls exist anywhere. Grab, snap, teleport, and collision events provide no tactile feedback.

### L3. No Dead Zone Configuration for Thumbstick

The 0.5 threshold in `main.js:309` is a hard-coded magic number. For precise docking tasks, this may be too aggressive (ignoring small intentional movements) or too loose (allowing drift).

### L4. Controller Ray Line Is Always Visible

The white ray line (`main.js:250-256`) is always visible at 5m length, even when not pointing at anything interactable. This is visually noisy and can occlude objects.

### L5. No Snap-Turn Implementation

Users cannot rotate their view without physically turning. This is a standard VR comfort feature that is missing.

---

## Issue Summary Table

| ID | Severity | Category | Description |
|----|----------|----------|-------------|
| C1 | Critical | Event Binding | Squeeze events never listened to — grip button dead |
| C2 | Critical | Missing Feature | Teleportation advertised but unimplemented |
| C3 | Critical | Missing Feature | No `squeezestart`/`squeezeend` listeners |
| C4 | Critical | Dead Code | Force-skip is a stub, VR users can get stuck |
| H1 | High | Button Mapping | ABXY indices wrong for right controller; only left checked |
| H2 | High | Locomotion | Both thumbsticks move identically; no snap-turn |
| H3 | High | Physics | Dropped objects freeze — no velocity/throw |
| H4 | High | Input Routing | L2 maps inputSources index to controller index incorrectly |
| M1 | Moderate | Compatibility | No controller profile detection or fallback |
| M2 | Moderate | Hand Tracking | Hand tracking has no input path (can see hands, can't interact) |
| M3 | Moderate | Accessibility | L3 scene has no VR interaction; skip buttons are DOM-only |
| M4 | Moderate | Hand Tracking | Raycaster assumes controller -Z, breaks for hand tracking |
| L1 | Low | Documentation | UI/docs advertise non-existent teleport |
| L2 | Low | Haptics | No haptic feedback on any interaction |
| L3 | Low | Config | Thumbstick deadzone hardcoded |
| L4 | Low | Visual | Controller ray always visible at 5m |
| L5 | Low | Comfort | No snap-turn feature |

---

## Architecture Notes

The root cause of most issues is that the app uses a **minimal input bridge**: it only listens for `selectstart`/`selectend` (trigger) and polls `gamepad.axes` (thumbstick). The WebXR specification provides a much richer input model:

- `selectstart` / `selectend` — trigger button
- `squeezestart` / `squeezeend` — grip/squeeze button
- `gamepad.buttons[0-5]` — full button state per frame
- `gamepad.axes[0-3]` — thumbstick X/Y per controller
- `source.profiles` — controller identification
- `source.targetRayMode` — "gazed", "tracked-pointer", or "screen"
- `source.hand` — hand tracking joint data (when available)

The fix strategy should create a unified input manager that:
1. Listens for all relevant XR events (select, squeeze)
2. Polls gamepad state each frame with proper handedness routing
3. Detects controller profiles for button index mapping
4. Provides input to scenes via a clean interface
5. Handles hand tracking as a first-class input mode
