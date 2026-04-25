import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import TutorialScene from './scenes/TutorialScene.js';
import { PRE_QUESTIONS, POST_QUESTIONS } from './survey-questions.js';
import { showSurvey, showThankYou, createFinishButton, removeFinishButton } from './survey-ui.js';

// --- Session ID (persists across pre/post for this page load) ---------------
const sessionId = crypto.randomUUID();

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
const teleportMarker = new THREE.Mesh(
  new THREE.RingGeometry(0.18, 0.22, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0x06d6a0, transparent: true, opacity: 0.85 })
);
teleportMarker.visible = false;
scene.add(teleportMarker);

// Active scene state
let activeScene = null;
let grabbables = [];
let animating = false;

function buildController(index) {
  const controller = renderer.xr.getController(index);
  controller.userData.teleporting = false;
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
  controller.addEventListener('squeezestart', () => { controller.userData.teleporting = true; });
  controller.addEventListener('squeezeend', () => {
    controller.userData.teleporting = false;
    if (teleportMarker.visible) {
      player.position.x = teleportMarker.position.x;
      player.position.z = teleportMarker.position.z;
      teleportMarker.visible = false;
    }
  });

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
    }
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

function updateTeleport(controller) {
  if (!controller.userData.teleporting) return;
  tempMatrix.identity().extractRotation(controller.matrixWorld);
  raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
  const hit = raycaster.intersectObject(floor, false)[0];
  if (hit) {
    teleportMarker.position.copy(hit.point);
    teleportMarker.visible = true;
  } else {
    teleportMarker.visible = false;
  }
}

function handleThumbstickTeleport() {
  const session = renderer.xr.getSession();
  if (!session) return;
  for (const source of session.inputSources) {
    if (!source.gamepad || !source.handedness) continue;
    const axes = source.gamepad.axes;
    if (axes.length < 4) continue;
    const x = axes[2];
    const y = axes[3];
    if (Math.abs(x) > 0.5 || Math.abs(y) > 0.5) {
      const speed = 0.04;
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.getWorldQuaternion(new THREE.Quaternion()));
      forward.y = 0; forward.normalize();
      const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).negate();
      player.position.addScaledVector(forward, -y * speed);
      player.position.addScaledVector(right, x * speed);
    }
  }
}

// ---- Scene manager --------------------------------------------------------

function loadScene(SceneClass) {
  if (activeScene) activeScene.destroy();
  activeScene = new SceneClass({ scene, player, renderer });
  activeScene.init();
  grabbables = activeScene.getGrabbables();
  if (activeScene.enableSkipShortcut) activeScene.enableSkipShortcut();
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
    }
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

  updateTeleport(controller0);
  updateTeleport(controller1);
  handleThumbstickTeleport();
  handleDesktopFallback(dt);

  if (activeScene) {
    activeScene.update(dt, [controller0, controller1]);
    grabbables = activeScene.getGrabbables();
  }

  renderer.render(scene, camera);
});

if (!('xr' in navigator)) {
  console.warn('WebXR not available in this browser. The scene still renders in 2D.');
}

// Debug surface
window.__VDV = { scene, renderer, camera, player };

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
  showThankYou();
}

function startExperience() {
  animating = true;
  loadScene(TutorialScene);
  renderer.render(scene, camera);
  createFinishButton(() => runPostSurvey());
}

// ---- Boot: pre-survey → tutorial → finish → post-survey -------------------
console.log('van-der-view F-003 tutorial loaded. WebXR ready:', 'xr' in navigator);
runPreSurvey();
