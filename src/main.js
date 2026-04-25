import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
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

const grabbables = [];
const palette = [0x3aa6ff, 0xff6f91, 0xffd166, 0x06d6a0, 0xc77dff];
// Deterministic layout so every client (Quest + PC spectator) starts identical.
for (let i = 0; i < 5; i++) {
  const size = 0.14;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(size, size, size),
    new THREE.MeshStandardMaterial({ color: palette[i], roughness: 0.4, metalness: 0.2 })
  );
  const angle = (i / 5) * Math.PI * 2;
  mesh.position.set(Math.cos(angle) * 0.6, 1.2, -0.8 + Math.sin(angle) * 0.6);
  mesh.userData.grabbable = true;
  scene.add(mesh);
  grabbables.push(mesh);
}

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
  const hits = raycaster.intersectObjects(grabbables, false);
  if (hits.length > 0) {
    const obj = hits[0].object;
    controller.attach(obj);
    controller.userData.held = obj;
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

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
let frames = 0;
let fps = 0;
let animating = false;

renderer.setAnimationLoop((time) => {
  if (!animating) return;

  updateTeleport(controller0);
  updateTeleport(controller1);
  handleThumbstickTeleport();
  broadcastHeldTransforms();

  frames++;
  if (time - last > 1000) {
    fps = frames;
    frames = 0;
    last = time;
  }
  renderer.render(scene, camera);
});

if (!('xr' in navigator)) {
  console.warn('WebXR not available in this browser. The scene still renders in 2D.');
}

// --- Cross-client sync (Quest ↔ PC spectator) -----------------------------
const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProto}://${location.host}/sync`);
let wsReady = false;
ws.addEventListener('open', () => { wsReady = true; console.log('[sync] connected'); });
ws.addEventListener('close', () => { wsReady = false; console.warn('[sync] disconnected'); });

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

function localHeldCube(cube) {
  return controller0.userData.held === cube || controller1.userData.held === cube;
}

ws.addEventListener('message', (e) => {
  let msg;
  try { msg = JSON.parse(e.data); } catch { return; }
  if (msg.type !== 'cube') return;
  const cube = grabbables[msg.id];
  if (!cube) return;
  if (localHeldCube(cube)) return;
  if (cube.parent !== scene) scene.attach(cube);
  cube.position.fromArray(msg.p);
  cube.quaternion.fromArray(msg.q);
});

function broadcastHeldTransforms() {
  if (!wsReady) return;
  for (const ctrl of [controller0, controller1]) {
    const cube = ctrl.userData.held;
    if (!cube) continue;
    cube.getWorldPosition(_p);
    cube.getWorldQuaternion(_q);
    ws.send(JSON.stringify({
      type: 'cube',
      id: grabbables.indexOf(cube),
      p: [_p.x, _p.y, _p.z],
      q: [_q.x, _q.y, _q.z, _q.w],
    }));
  }
}

for (const ctrl of [controller0, controller1]) {
  ctrl.addEventListener('selectend', () => {
    if (!wsReady) return;
  });
}

// Debug surface
window.__VDV = { grabbables, ws, scene, renderer };

// --- Survey flow -----------------------------------------------------------
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
  // Render one frame immediately so the scene is visible
  renderer.render(scene, camera);
  createFinishButton(() => runPostSurvey());
}

// --- Boot: pre-survey blocks the experience until completed ----------------
console.log('van-der-view F-001 scaffold loaded. WebXR ready:', 'xr' in navigator);
runPreSurvey();
