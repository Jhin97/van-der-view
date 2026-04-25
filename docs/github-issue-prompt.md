# GitHub Issue Prompt — Meta Quest 3 Controller Interaction Bugs

Copy the sections below as individual GitHub issues, or combine them into one tracking issue.

---

## Combined Tracking Issue

**Title:** Meta Quest 3 controller interactions broken — squeeze dead, teleport missing, ABXY wrong, force-skip stub

**Labels:** `type:bug`, `team:frontend`, `p0`

**Body:**

### Summary

The WebXR input bridge between Meta Quest 3 controllers and the app has multiple critical bugs. The squeeze button is dead, teleportation is advertised but unimplemented, ABXY button mapping is incorrect for the right controller, and the force-skip system is a non-functional stub. These issues make the app nearly unusable on Quest 3 hardware.

### Critical Issues

#### 1. Squeeze/Grip Button Does Nothing
- **Files:** `src/main.js:258-259`
- Only `selectstart`/`selectend` (trigger) events are registered. `squeezestart`/`squeezeend` are never listened to.
- The grip button on both Quest 3 controllers generates zero app response.
- WebXR spec: Quest 3 grip fires `squeezestart` and `squeezeend` events on `renderer.xr.getController(n)`.

#### 2. Teleportation Advertised But Not Implemented
- **Files:** `index.html:20`, `docs/quest3-setup.md:39`, `src/main.js` (no teleport code)
- UI tells users `"squeeze teleport"` — there is no teleport code anywhere.
- No teleport arc, no ground marker, no `squeezestart`/`squeezeend` handler.

#### 3. Force-Skip Is a Dead Stub
- **File:** `src/scenes/TutorialScene.js:508-523`
- The `_checkForceSkip` function declares variables but never reads them. `_forceSkipTimer` is initialized but never incremented or checked.
- VR users stuck in the tutorial have no escape mechanism.
- Only the desktop Space key works for skipping.

### High Severity Issues

#### 4. ABXY Button Mapping Wrong for Right Controller
- **File:** `src/scenes/LevelOneScene.js:321-341`
- Hardcodes `buttons[4]` = A, `buttons[5]` = B for left controller only.
- Right controller X/Y buttons (same indices 4/5) are never checked.
- No runtime profile detection (`source.profiles`) for cross-headset compatibility.

#### 5. Both Thumbsticks Move Identically, No Snap-Turn
- **File:** `src/main.js:300-317`
- Locomotion reads axes from both controllers with no `handedness` filter.
- Right thumbstick should control rotation (snap-turn), not duplicate locomotion.
- No snap-turn feature exists.

#### 6. Dropped Objects Freeze in Space
- **File:** `src/main.js:290-295`
- `onSelectEnd` re-attaches to scene with zero velocity.
- No throw mechanic, no inertia, no gravity.
- Objects float wherever released.

#### 7. L2 InputSources Index Mismatch
- **File:** `src/scenes/LevelTwoScene.js:441-463`
- Maps `inputSources` iteration index to `controllers[]` index.
- `inputSources` order is not guaranteed to match controller creation order.
- Should match by `handedness` or stored input source reference.

### Moderate Issues

#### 8. Hand Tracking Mode Has No Input
- **File:** `src/main.js:246-248`
- Hand models render but no events are registered on hand objects.
- Pinch gestures generate `selectstart`/`selectend` on hands but go unhandled.

#### 9. L3 Scene Has No VR Interaction
- **File:** `src/scenes/LevelThreeScene.js`
- Scene auto-advances after 5s. No VR skip or interaction.
- Cutscene "Skip" button is DOM-only, invisible in VR.

#### 10. No Haptic Feedback
- No `gamepad.hapticActuators` calls anywhere.
- Grab, snap, and collision events provide no tactile feedback.

### Proposed Fix Plan

1. Create a unified `XRInputManager` class that:
   - Registers `selectstart`, `selectend`, `squeezestart`, `squeezeend` on controllers AND hands
   - Polls `gamepad.buttons` and `gamepad.axes` per frame with proper `handedness` routing
   - Detects `source.profiles` for controller-specific button mapping
   - Provides clean per-frame input state to scenes
2. Implement teleportation with `squeezestart`/`squeezeend` + parabolic arc + ground marker
3. Implement snap-turn on right thumbstick
4. Fix force-skip to actually check both trigger/squeeze buttons held for 2s
5. Fix L2 input routing to use `handedness` matching
6. Add haptic feedback on grab, snap, and collision events
7. Update UI text to match actual controls
8. Add VR-accessible skip/interaction for L3 cutscene

---

## Individual Issue Templates

### Issue 1: Squeeze button dead / no teleport

**Title:** Squeeze/grip button does nothing — teleport unimplemented
**Labels:** `type:bug`, `team:frontend`, `p0`

**Steps to Reproduce:**
1. Launch app on Quest 3
2. Enter VR mode
3. Press grip/squeeze button on either controller

**Expected:** Teleport arc appears (as documented in `index.html` and `quest3-setup.md`).
**Actual:** Nothing happens. No feedback, no teleport, no log output.

**Root Cause:** `squeezestart`/`squeezeend` events are never registered (`main.js:258-259`). No teleport code exists.

---

### Issue 2: Force-skip stub

**Title:** Tutorial force-skip is non-functional in VR
**Labels:** `type:bug`, `team:frontend`, `p1`

**Steps to Reproduce:**
1. Enter tutorial in VR
2. Get stuck on any step
3. Hold both triggers for 2+ seconds

**Expected:** Force-skip activates, advancing the tutorial.
**Actual:** Nothing happens. Only desktop Space key works.

**Root Cause:** `TutorialScene._checkForceSkip` is a dead stub — it never increments `_forceSkipTimer` or checks `bothHeld`.

---

### Issue 3: ABXY right controller ignored

**Title:** Right controller X/Y buttons ignored in L1
**Labels:** `type:bug`, `team:frontend`, `p1`

**Steps to Reproduce:**
1. Enter Level 1 in VR
2. Press X or Y button on right controller
3. Press A or B button on left controller

**Expected:** Both controllers can dismiss narrative and redock.
**Actual:** Only left controller A/B works. Right controller X/Y is ignored.

**Root Cause:** `_handleLeftControllerButtons` explicitly filters `source.handedness !== 'left'`. No corresponding right handler exists.

---

### Issue 4: No snap-turn, both thumbsticks move

**Title:** No snap-turn; both thumbsticks move player identically
**Labels:** `type:bug`, `team:frontend`, `p1`

**Steps to Reproduce:**
1. Enter VR
2. Push right thumbstick left/right
3. Push left thumbstick left/right

**Expected:** Right thumbstick rotates view (snap-turn). Left thumbstick moves player.
**Actual:** Both thumbsticks move the player. No rotation without physical turning.

**Root Cause:** `handleThumbstickLocomotion` reads axes from all input sources with no handedness filter.

---

### Issue 5: Hand tracking can't interact

**Title:** Hand tracking visible but non-interactive
**Labels:** `type:bug`, `team:frontend`, `p2`

**Steps to Reproduce:**
1. Enter VR
2. Set controllers down; wait for hand tracking to activate
3. Pinch gesture toward grabbable object

**Expected:** Pinch acts as grab (like trigger).
**Actual:** Hands render but pinch does nothing. No grab, no selection.

**Root Cause:** Hand objects have no `selectstart`/`selectend` listeners registered.
