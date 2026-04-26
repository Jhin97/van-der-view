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

// ---- Persistent "← MENU" HUD button (return-to-hub) ----------------------
// Always visible on the camera HUD when not already in the hub. Trigger-
// click anywhere on it to bail out of the active level back to the menu.
const _menuBtnCanvas = document.createElement('canvas');
_menuBtnCanvas.width = 256;
_menuBtnCanvas.height = 96;
{
  const ctx = _menuBtnCanvas.getContext('2d');
  ctx.fillStyle = 'rgba(20, 30, 60, 0.92)';
  ctx.beginPath();
  ctx.roundRect(0, 0, 256, 96, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 200, 240, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(2, 2, 252, 92, 14);
  ctx.stroke();
  ctx.fillStyle = '#06d6a0';
  ctx.font = 'bold 38px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('← MENU', 128, 48);
}
const menuBtnTex = new THREE.CanvasTexture(_menuBtnCanvas);
menuBtnTex.colorSpace = THREE.SRGBColorSpace;
const menuButton = new THREE.Mesh(
  new THREE.PlaneGeometry(0.24, 0.09),
  new THREE.MeshBasicMaterial({
    map: menuBtnTex, transparent: true, depthTest: false, depthWrite: false,
  })
);
menuButton.position.set(0.45, 0.30, -1.2); // upper-right of HUD
menuButton.renderOrder = 1000;
menuButton.visible = false; // toggled in loadScene
camera.add(menuButton);

const controllerModelFactory = new XRControllerModelFactory();
const handModelFactory = new XRHandModelFactory();

const tempMatrix = new THREE.Matrix4();
const raycaster = new THREE.Raycaster();

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
  l3: LevelThreeScene,
};

function registerScene(id, SceneClass) {
  SCENE_MAP[id] = SceneClass;
}

async function loadScene(sceneIdOrClass) {
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
  const nextScene = new SceneClass({ scene, player, renderer, camera });

  // Wire callbacks BEFORE init so async init paths cannot fire onComplete /
  // onSelectPortal against a null-target scene. (P0-1 fix.)
  if (nextScene.onComplete !== undefined) {
    nextScene.onComplete = () => {
      if (sceneId) markProgress(sceneId);
      transitionToHub();
    };
  }
  if (nextScene.onSelectPortal !== undefined) {
    nextScene.onSelectPortal = (portalId) => {
      if (SCENE_MAP[portalId]) {
        transitionToScene(portalId);
      }
    };
  }

  // Await async init so first update() does not run on a half-built scene.
  // Sync init() returns undefined which Promise.resolve handles fine.
  try {
    await Promise.resolve(nextScene.init());
  } catch (err) {
    console.error('[scene] init failed', err);
    nextScene.destroy?.();
    return;
  }

  // Only commit nextScene to activeScene after init resolves so the render
  // loop never sees a scene mid-construction.
  activeScene = nextScene;

  // Persistent ← MENU button is hidden in the hub (no point) and shown
  // in any other scene as the universal escape back to the level menu.
  menuButton.visible = !(nextScene instanceof GameHubScene);

  grabbables = activeScene.getGrabbables();
  if (activeScene.enableSkipShortcut) activeScene.enableSkipShortcut();

  if (activeScene.spawn) {
    if (activeScene.spawn.player) player.position.fromArray(activeScene.spawn.player);
    if (activeScene.spawn.camera) camera.position.fromArray(activeScene.spawn.camera);
  }
}

async function transitionToScene(sceneId) {
  if (transitioning) return;
  transitioning = true;
  try {
    await _fadeOut(300);
    await loadScene(sceneId);
    await _fadeIn(300);
  } catch (err) {
    console.error('[transition] scene transition failed', err);
  } finally {
    // Always release the lock — otherwise a thrown error in load/fade
    // pins transitioning=true and the user is stuck on a dead screen.
    transitioning = false;
  }
}

async function transitionToHub() {
  if (transitioning) return;
  transitioning = true;
  try {
    await _fadeOut(300);
    await loadScene(GameHubScene);
    _syncHubProgress();
    await _fadeIn(300);
  } catch (err) {
    console.error('[transition] hub transition failed', err);
  } finally {
    transitioning = false;
  }
}

// Fade animation state — ticked from the main animation loop so it works
// in both desktop and immersive-VR (window.requestAnimationFrame is paused
// during a WebXR session on Quest, so the previous standalone-rAF fade
// never resolved and transitions hung forever).
let fadeAnim = null; // { from, to, startTime, duration, resolve }

function _fadeOut(duration) {
  return _animateFade(0, 1, duration);
}

function _fadeIn(duration) {
  return _animateFade(1, 0, duration);
}

function _animateFade(from, to, duration) {
  return new Promise(resolve => {
    fadeAnim = { from, to, startTime: null, duration, resolve };
  });
}

function _tickFade(time) {
  if (!fadeAnim) return;
  if (fadeAnim.startTime === null) fadeAnim.startTime = time;
  const t = Math.min(1, (time - fadeAnim.startTime) / fadeAnim.duration);
  fadeMat.opacity = fadeAnim.from + (fadeAnim.to - fadeAnim.from) * t;
  updateFadeQuad();
  if (t >= 1) {
    const r = fadeAnim.resolve;
    fadeAnim = null;
    r();
  }
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

  player.add(controller);
  return controller;
}

function onSelectStart(controller) {
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);

  // First: did the user point the laser at the persistent ← MENU HUD
  // button? If so, take them back to the hub regardless of what scene
  // they're in.
  if (menuButton.visible) {
    const menuHits = raycaster.intersectObject(menuButton, false);
    if (menuHits.length > 0) {
      transitionToHub();
      return;
    }
  }

  const hits = raycaster.intersectObjects(grabbables, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj.parent && !obj.userData.grabbable) {
      obj = obj.parent;
    }
    if (obj.userData.grabbable) {
      controller.attach(obj);
      controller.userData.held = obj;
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

const controller0 = buildController(0);
const controller1 = buildController(1);

// Player is intentionally locked in space — thumbsticks no longer drive
// player position. Per [[webxr-locomotion-comfort]] educational scenes
// should disable smooth-locomotion (high cybersickness risk). Instead the
// thumbstick is forwarded to the active scene so it can use it to translate
// the object the user is interacting with.
//
// Convention (Quest 3 / 3S Touch Plus, see [[quest3s-button-map]]):
//   left  axes[2/3] = leftX  / leftY   (forward push = -1)
//   right axes[2/3] = rightX / rightY  (forward push = -1)
function handleThumbstickInput(dt) {
  const session = renderer.xr.getSession();
  if (!session) return;
  const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
  let leftX = 0, leftY = 0, rightX = 0, rightY = 0;
  for (const source of session.inputSources) {
    if (!source.gamepad || !source.handedness) continue;
    const a = source.gamepad.axes;
    if (a.length < 4) continue;
    if (source.handedness === 'left') {
      leftX = dz(a[2]);
      leftY = dz(a[3]);
    } else if (source.handedness === 'right') {
      rightX = dz(a[2]);
      rightY = dz(a[3]);
    }
  }
  if (activeScene && activeScene.applyThumbstickInput) {
    activeScene.applyThumbstickInput({ leftX, leftY, rightX, rightY }, dt);
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

  // Clamp dt so a Meta-menu pause / focus-loss doesn't trip state-machine
  // timers in a single frame on resume. (P1: dt clamp.)
  const rawDt = lastTime ? time - lastTime : 16;
  const dt = Math.min(rawDt, 100);
  lastTime = time;

  // Drive fade animation from the main loop so it works in immersive VR
  // (where window.requestAnimationFrame is paused).
  _tickFade(time);

  handleThumbstickInput(dt);
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
window.__VDV = { scene, renderer, camera, player, registerScene, progress };

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

async function startExperience() {
  animating = true;
  await loadScene(GameHubScene);
  _syncHubProgress();
  renderer.render(scene, camera);
  createFinishButton(() => runPostSurvey());
}

// ---- Boot: pre-survey → hub → levels → finish → post-survey ---------------
console.log('van-der-view loaded. WebXR ready:', 'xr' in navigator);
runPreSurvey();
