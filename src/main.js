import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import TutorialScene from './scenes/TutorialScene.js';
import GameHubScene from './scenes/GameHubScene.js';
import LevelOneScene from './scenes/LevelOneScene.js';
import LevelTwoScene from './scenes/LevelTwoScene.js';
import LevelThreeScene from './scenes/LevelThreeScene.js';
import { PRE_QUESTIONS, POST_QUESTIONS } from './survey-questions.js';
import { showSurvey, showThankYou, createFinishButton, removeFinishButton } from './survey-ui.js';

// --- Session ID (persists across pre/post for this page load) ---------------
const sessionId = crypto.randomUUID();
window.__VDV_SESSION_ID = sessionId;

// --- Telemetry POST --------------------------------------------------------
async function submitSurvey(responses) {
  try {
    const res = await fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responses),
    });
    if (!res.ok) console.error('[telemetry] submit failed', res.status);
    else console.log('[telemetry] submitted', responses.length, 'responses');
  } catch (err) {
    console.error('[telemetry] network error', err);
  }
}

// --- Three.js scene setup --------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a14);
scene.fog = new THREE.Fog(0x0a0a14, 10, 40);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(0, 1.6, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);
document.body.appendChild(VRButton.createButton(renderer));

// ---- Lighting & environment -----------------------------------------------

scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x1a1a2e, 0.7));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
keyLight.position.set(3, 6, 2);
scene.add(keyLight);

const floorGeo = new THREE.CircleGeometry(8, 64);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x1c1c2a, roughness: 0.9, metalness: 0.0 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const grid = new THREE.GridHelper(16, 32, 0x444466, 0x222233);
scene.add(grid);

// ---- Player & XR controllers ----------------------------------------------

const player = new THREE.Group();
player.add(camera);
scene.add(player);

const controllerModelFactory = new XRControllerModelFactory();
const handModelFactory = new XRHandModelFactory();

const tempMatrix = new THREE.Matrix4();
const raycaster = new THREE.Raycaster();

// ---- XR Input Manager ------------------------------------------------------

const xrInput = {
  left:  { axes: [0, 0, 0, 0], buttons: [], squeeze: false, prevSqueeze: false },
  right: { axes: [0, 0, 0, 0], buttons: [], squeeze: false, prevSqueeze: false },
};

function pollXRInput() {
  const session = renderer.xr.getSession();
  if (!session) {
    xrInput.left.squeeze = false;
    xrInput.right.squeeze = false;
    return;
  }
  for (const source of session.inputSources) {
    const hand = source.handedness; // 'left' | 'right' | 'none'
    if (hand !== 'left' && hand !== 'right') continue;
    const state = xrInput[hand];
    state.prevSqueeze = state.squeeze;
    if (source.gamepad) {
      state.axes = source.gamepad.axes || [];
      state.buttons = source.gamepad.buttons || [];
      state.squeeze = !!state.buttons[1]?.pressed;
    }
  }
}

// ---- Teleportation ---------------------------------------------------------

const TELEPORT_MAX_DIST = 8;
const TELEPORT_RAY_SEGMENTS = 30;
const TELEPORT_SEGMENT_DT = 0.016;
const SNAP_TURN_ANGLE = Math.PI / 4; // 45 degrees

const teleportArcPoints = [];
for (let i = 0; i <= TELEPORT_RAY_SEGMENTS; i++) teleportArcPoints.push(new THREE.Vector3());

const teleportGeo = new THREE.BufferGeometry().setFromPoints(teleportArcPoints);
const teleportMat = new THREE.LineBasicMaterial({ color: 0x06d6a0, transparent: true, opacity: 0.7 });
const teleportLine = new THREE.Line(teleportGeo, teleportMat);
teleportLine.visible = false;
scene.add(teleportLine);

const teleportMarkerGeo = new THREE.RingGeometry(0.15, 0.22, 32);
const teleportMarkerMat = new THREE.MeshBasicMaterial({ color: 0x06d6a0, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
const teleportMarker = new THREE.Mesh(teleportMarkerGeo, teleportMarkerMat);
teleportMarker.rotation.x = -Math.PI / 2;
teleportMarker.visible = false;
scene.add(teleportMarker);

let isTeleportAiming = false;
let teleportHand = null;
let lastSnapTurnTime = 0;

function updateTeleport() {
  // Check squeeze on either hand
  const leftJustSqueezed = xrInput.left.squeeze && !xrInput.left.prevSqueeze;
  const rightJustSqueezed = xrInput.right.squeeze && !xrInput.right.prevSqueeze;
  const leftReleased = !xrInput.left.squeeze && xrInput.left.prevSqueeze;
  const rightReleased = !xrInput.right.squeeze && xrInput.right.prevSqueeze;

  if (leftJustSqueezed && !isTeleportAiming) {
    isTeleportAiming = true;
    teleportHand = 'left';
  } else if (rightJustSqueezed && !isTeleportAiming) {
    isTeleportAiming = true;
    teleportHand = 'right';
  }

  if (isTeleportAiming) {
    // Compute parabolic arc from the squeezing controller
    const ctrl = teleportHand === 'left' ? controller0 : controller1;
    const origin = new THREE.Vector3();
    const direction = new THREE.Vector3(0, 0, -1);
    const rotMat = new THREE.Matrix4().extractRotation(ctrl.matrixWorld);
    origin.setFromMatrixPosition(ctrl.matrixWorld);
    direction.applyMatrix4(rotMat);

    // Launch velocity: forward + slight upward arc
    const speed = 5;
    const velocity = direction.multiplyScalar(speed);
    velocity.y += 2.5; // upward bias for arc

    const posAttr = teleportGeo.attributes.position;
    let validHit = null;
    for (let i = 0; i <= TELEPORT_RAY_SEGMENTS; i++) {
      const t = i * TELEPORT_SEGMENT_DT;
      const px = origin.x + velocity.x * t;
      const py = origin.y + velocity.y * t - 0.5 * 9.8 * t * t;
      const pz = origin.z + velocity.z * t;
      posAttr.setXYZ(i, px, py, pz);

      // Check ground hit (y <= 0)
      if (py <= 0 && i > 0) {
        // Interpolate to exact ground point
        const prevY = posAttr.getY(i - 1);
        const frac = prevY / (prevY - py);
        const hitX = posAttr.getX(i - 1) + (px - posAttr.getX(i - 1)) * frac;
        const hitZ = posAttr.getZ(i - 1) + (pz - posAttr.getZ(i - 1)) * frac;
        const dist = Math.sqrt(hitX * hitX + hitZ * hitZ);
        if (dist <= TELEPORT_MAX_DIST) {
          validHit = { x: hitX, z: hitZ };
        }
        // Hide remaining segments
        for (let j = i + 1; j <= TELEPORT_RAY_SEGMENTS; j++) {
          posAttr.setXYZ(j, px, 0, pz);
        }
        break;
      }
    }
    posAttr.needsUpdate = true;
    teleportLine.visible = true;

    if (validHit) {
      teleportMarker.position.set(validHit.x, 0.01, validHit.z);
      teleportMarker.visible = true;
      teleportMarkerMat.color.setHex(0x06d6a0);
    } else {
      teleportMarker.visible = false;
      teleportMarkerMat.color.setHex(0xff4444);
    }

    // Release → teleport
    const released = (teleportHand === 'left' && leftReleased) || (teleportHand === 'right' && rightReleased);
    if (released) {
      if (validHit) {
        player.position.x = validHit.x;
        player.position.z = validHit.z;
      }
      isTeleportAiming = false;
      teleportHand = null;
      teleportLine.visible = false;
      teleportMarker.visible = false;
    }
  }
}

// ---- Snap-turn (right thumbstick) ------------------------------------------

function handleSnapTurn() {
  const session = renderer.xr.getSession();
  if (!session) return;
  const now = performance.now();
  if (now - lastSnapTurnTime < 300) return; // debounce

  const axes = xrInput.right.axes;
  if (axes.length < 4) return;
  const x = axes[2]; // right thumbstick X

  if (x > 0.7) {
    player.rotation.y -= SNAP_TURN_ANGLE;
    lastSnapTurnTime = now;
  } else if (x < -0.7) {
    player.rotation.y += SNAP_TURN_ANGLE;
    lastSnapTurnTime = now;
  }
}

// ---- Scene transition system -----------------------------------------------

let activeScene = null;
let grabbables = [];
let animating = false;
let transitioning = false;

// Fade overlay for scene transitions
const fadeGeo = new THREE.PlaneGeometry(2, 2);
const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false });
const fadeQuad = new THREE.Mesh(fadeGeo, fadeMat);
fadeQuad.renderOrder = 999;
fadeQuad.frustumCulled = false;
scene.add(fadeQuad);

function updateFadeQuad() {
  fadeQuad.position.copy(camera.position);
  fadeQuad.quaternion.copy(camera.quaternion);
  fadeQuad.translateZ(-0.3);
}

// Scene registry: maps portal IDs to scene classes
const SCENE_MAP = {
  tutorial: TutorialScene,
  l1: LevelOneScene,
  l2: LevelTwoScene,
  l3: LevelThreeScene, // F-006
};

function registerScene(id, SceneClass) {
  SCENE_MAP[id] = SceneClass;
}

function loadScene(sceneIdOrClass) {
  let SceneClass;
  let sceneId = null;

  if (typeof sceneIdOrClass === 'string') {
    sceneId = sceneIdOrClass;
    SceneClass = SCENE_MAP[sceneId];
    if (!SceneClass) {
      console.warn(`[scene] No scene registered for "${sceneId}"`);
      return;
    }
  } else {
    SceneClass = sceneIdOrClass;
  }

  // Clear held references before destroying scene to prevent ghost objects
  controller0.userData.held = null;
  controller1.userData.held = null;
  desktopHeld = null;

  if (activeScene) activeScene.destroy();
  activeScene = new SceneClass({ scene, player, renderer, camera });
  activeScene.init();

  // Wire level completion → hub return
  if (activeScene.onComplete !== undefined) {
    activeScene.onComplete = () => {
      if (sceneId) markProgress(sceneId);
      transitionToHub();
    };
  }

  // Wire hub portal selection → scene transitions
  if (activeScene.onSelectPortal !== undefined) {
    activeScene.onSelectPortal = (portalId) => {
      if (SCENE_MAP[portalId]) {
        transitionToScene(portalId);
      }
    };
  }

  grabbables = activeScene.getGrabbables();
  if (activeScene.enableSkipShortcut) activeScene.enableSkipShortcut();

  if (activeScene.spawn) {
    if (activeScene.spawn.player) player.position.fromArray(activeScene.spawn.player);
    if (activeScene.spawn.camera) camera.position.fromArray(activeScene.spawn.camera);
  }
}

function transitionToScene(sceneId) {
  if (transitioning) return;
  transitioning = true;
  _fadeOut(300).then(() => {
    loadScene(sceneId);
    renderer.render(scene, camera);
    _fadeIn(300).then(() => {
      transitioning = false;
    });
  });
}

function transitionToHub() {
  if (transitioning) return;
  transitioning = true;
  _fadeOut(300).then(() => {
    loadScene(GameHubScene);
    _syncHubProgress();
    renderer.render(scene, camera);
    _fadeIn(300).then(() => {
      transitioning = false;
    });
  });
}

function _fadeOut(duration) {
  return _animateFade(0, 1, duration);
}

function _fadeIn(duration) {
  return _animateFade(1, 0, duration);
}

function _animateFade(from, to, duration) {
  return new Promise(resolve => {
    const start = performance.now();
    function step() {
      const t = Math.min(1, (performance.now() - start) / duration);
      fadeMat.opacity = from + (to - from) * t;
      updateFadeQuad();
      renderer.render(scene, camera);
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    }
    step();
  });
}

// ---- Progress tracking -----------------------------------------------------

const progress = loadProgress();

function loadProgress() {
  try {
    const saved = sessionStorage.getItem('vdv-progress');
    if (saved) return JSON.parse(saved);
  } catch {}
  return { tutorial: false, l1: false, l2: false, l3: false };
}

function saveProgress() {
  try { sessionStorage.setItem('vdv-progress', JSON.stringify(progress)); } catch {}
}

function markProgress(sceneId) {
  progress[sceneId] = true;
  saveProgress();
}

function _syncHubProgress() {
  if (activeScene instanceof GameHubScene) {
    Object.keys(progress).forEach(k => {
      if (progress[k]) activeScene.markComplete(k);
    });
  }
}

// ---- XR controllers --------------------------------------------------------

function buildController(index) {
  const controller = renderer.xr.getController(index);
  controller.userData.held = null;

  const grip = renderer.xr.getControllerGrip(index);
  grip.add(controllerModelFactory.createControllerModel(grip));
  player.add(grip);

  const hand = renderer.xr.getHand(index);
  hand.add(handModelFactory.createHandModel(hand, 'mesh'));
  player.add(hand);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -1),
  ]);
  const line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xffffff }));
  line.scale.z = 5;
  controller.add(line);

  controller.addEventListener('selectstart', () => onSelectStart(controller));
  controller.addEventListener('selectend', () => onSelectEnd(controller));

  // Hand tracking: pinch gestures fire select events on the hand object.
  // Forward them to the same handlers so hand tracking can grab/click.
  hand.addEventListener('selectstart', () => onSelectStart(hand));
  hand.addEventListener('selectend', () => onSelectEnd(hand));

  player.add(controller);
  return controller;
}

function onSelectStart(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  const hits = raycaster.intersectObjects(grabbables, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj.parent && !obj.userData.grabbable) {
      obj = obj.parent;
    }
    if (obj.userData.grabbable) {
      controller.attach(obj);
      controller.userData.held = obj;
      // Haptic feedback on grab
      _pulseController(controller, 0.5, 80);
      return;
    }
  }

  // No grab hit — let the active scene treat the trigger as a click
  // (e.g. hub menu raycast). Mirrors the desktop mouse-click path.
  if (activeScene && activeScene._onControllerClick) {
    activeScene._onControllerClick(controller);
  }
}

function onSelectEnd(controller) {
  if (controller.userData.held) {
    scene.attach(controller.userData.held);
    controller.userData.held = null;
  }
}

function _pulseController(controller, intensity, durationMs) {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const source of session.inputSources) {
    const actuator = source.gamepad?.hapticActuators?.[0] || source.gamepad?.vibrationActuator;
    if (actuator) {
      try { actuator.pulse(intensity, durationMs); } catch {}
    }
  }
}

const controller0 = buildController(0);
const controller1 = buildController(1);

function handleThumbstickLocomotion() {
  const session = renderer.xr.getSession();
  if (!session) return;
  // Only use left thumbstick for movement; right is for snap-turn
  const axes = xrInput.left.axes;
  if (axes.length < 4) return;
  const x = axes[2];
  const y = axes[3];
  if (Math.abs(x) > 0.3 || Math.abs(y) > 0.3) {
    const speed = 0.04;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();
    player.position.addScaledVector(forward, -y * speed);
    player.position.addScaledVector(right, x * speed);
  }
}

// ---- Keyboard fallback for 2D testing -------------------------------------

const keys = {};
window.addEventListener('keydown', (e) => { keys[e.code] = true; });
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

function handleDesktopFallback(dt) {
  if (renderer.xr.isPresenting) return;
  const speed = 0.003 * dt;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
  forward.y = 0; forward.normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();
  if (keys['KeyW']) player.position.addScaledVector(forward, speed);
  if (keys['KeyS']) player.position.addScaledVector(forward, -speed);
  if (keys['KeyD']) player.position.addScaledVector(right, speed);
  if (keys['KeyA']) player.position.addScaledVector(right, -speed);

  if (keys['MouseLook']) {
    camera.rotation.y -= keys._mouseDX * 0.003;
    camera.rotation.x -= keys._mouseDY * 0.003;
    camera.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, camera.rotation.x));
    keys._mouseDX = 0;
    keys._mouseDY = 0;
  }
}

// Mouse-based grab for desktop testing
let desktopHeld = null;
renderer.domElement.addEventListener('mousedown', (e) => {
  if (renderer.xr.isPresenting) return;
  if (e.button === 2) { keys['MouseLook'] = true; keys._mouseDX = 0; keys._mouseDY = 0; return; }
  if (e.button !== 0) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1,
  );

  const rc = new THREE.Raycaster();
  rc.setFromCamera(mouse, camera);
  const hits = rc.intersectObjects(grabbables, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj.parent && !obj.userData.grabbable) obj = obj.parent;
    if (obj.userData.grabbable) {
      desktopHeld = obj;
      desktopHeld._dragOffset = obj.position.clone().sub(camera.position);
      return;
    }
  }

  if (activeScene && activeScene._desktopClick !== undefined) {
    activeScene._desktopClick = mouse;
  }
});

renderer.domElement.addEventListener('mousemove', (e) => {
  if (keys['MouseLook']) {
    keys._mouseDX = (keys._mouseDX || 0) + e.movementX;
    keys._mouseDY = (keys._mouseDY || 0) + e.movementY;
  }
  if (desktopHeld && !renderer.xr.isPresenting) {
    const rect = renderer.domElement.getBoundingClientRect();
    const mouse = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const rc = new THREE.Raycaster();
    rc.setFromCamera(mouse, camera);
    const dist = camera.position.distanceTo(desktopHeld.position);
    const target = rc.ray.at(dist, new THREE.Vector3());
    desktopHeld.position.lerp(target, 0.3);
  }
});

renderer.domElement.addEventListener('mouseup', (e) => {
  if (e.button === 2) { keys['MouseLook'] = false; return; }
  desktopHeld = null;
});

renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ---- Resize ---------------------------------------------------------------

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- Main loop ------------------------------------------------------------

let lastTime = 0;
renderer.setAnimationLoop((time) => {
  if (!animating) return;

  const dt = lastTime ? time - lastTime : 16;
  lastTime = time;

  pollXRInput();
  handleThumbstickLocomotion();
  handleSnapTurn();
  updateTeleport();
  handleDesktopFallback(dt);

  if (activeScene && !transitioning) {
    activeScene.update(dt, [controller0, controller1]);
    grabbables = activeScene.getGrabbables();
  }

  updateFadeQuad();
  renderer.render(scene, camera);
});

if (!('xr' in navigator)) {
  console.warn('WebXR not available in this browser. The scene still renders in 2D.');
}

// Debug surface
window.__VDV = { scene, renderer, camera, player, registerScene, progress, xrInput };

// ---- Survey flow ----------------------------------------------------------

async function runPreSurvey() {
  const responses = await showSurvey(
    PRE_QUESTIONS,
    'Pre-Experience Survey',
    'pre',
    sessionId,
  );
  await submitSurvey(responses);
  startExperience();
}

async function runPostSurvey() {
  removeFinishButton();
  const responses = await showSurvey(
    POST_QUESTIONS,
    'Post-Experience Survey',
    'post',
    sessionId,
  );
  await submitSurvey(responses);
  animating = false;
  showThankYou();
}

function startExperience() {
  animating = true;
  loadScene(GameHubScene);
  _syncHubProgress();
  renderer.render(scene, camera);
  createFinishButton(() => runPostSurvey());
}

// ---- Boot: pre-survey → hub → levels → finish → post-survey ---------------
console.log('van-der-view loaded. WebXR ready:', 'xr' in navigator);
runPreSurvey();
