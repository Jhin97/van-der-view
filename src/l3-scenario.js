import * as THREE from 'three';

// Proxy docking scores — swap with vina_results.json when F-002 assets arrive.
export const COX1_SCORE = -7.8;
export const COX2_SCORE = -10.2;
export const SELECTIVITY_RATIO = '2.4x';

// Per-frame animated objects
const ligands = [];
const cavityLights = [];
const markers = [];

// Deterministic sine-based displacement (no external noise lib).
function displace(x, y, z) {
  return 0.12 * (
    Math.sin(x * 3.7 + y * 2.3) +
    Math.sin(y * 4.1 + z * 1.9) +
    Math.sin(z * 3.3 + x * 2.7)
  ) / 3;
}

function createTextSprite(text, opts = {}) {
  const fontSize = opts.fontSize || 48;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.font = `bold ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  const metrics = ctx.measureText(text);
  canvas.width = Math.ceil(metrics.width) + 16;
  canvas.height = fontSize + 16;

  ctx.font = `bold ${fontSize}px ui-sans-serif, system-ui, sans-serif`;
  ctx.fillStyle = opts.color || '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  const aspect = canvas.width / canvas.height;
  const scale = opts.scale || 0.25;
  sprite.scale.set(scale * aspect, scale, 1);
  return sprite;
}

function createProteinBlob(color, openSide) {
  const geo = new THREE.IcosahedronGeometry(0.5, 4);
  const pos = geo.attributes.position;

  // Apply displacement for organic look.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = displace(x, y, z);
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    pos.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // Build half-shell: keep only triangles on the closed side.
  // openSide: 'right' removes faces with centroid x > 0, 'left' removes x < 0.
  const indexAttr = geo.getIndex();
  const keepPositions = [];
  const v = new THREE.Vector3();

  for (let i = 0; i < indexAttr.count; i += 3) {
    const a = indexAttr.getX(i);
    const b = indexAttr.getX(i + 1);
    const c = indexAttr.getX(i + 2);
    v.set(0, 0, 0);
    v.add(pos.setXYZ(a, pos.getX(a), pos.getY(a), pos.getZ(a)) || v);
    // Compute centroid
    const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;

    const isOnOpenSide = openSide === 'right' ? cx > 0 : cx < 0;
    if (!isOnOpenSide) {
      keepPositions.push(
        pos.getX(a), pos.getY(a), pos.getZ(a),
        pos.getX(b), pos.getY(b), pos.getZ(b),
        pos.getX(c), pos.getY(c), pos.getZ(c),
      );
    }
  }

  const shellGeo = new THREE.BufferGeometry();
  shellGeo.setAttribute('position', new THREE.Float32BufferAttribute(keepPositions, 3));
  shellGeo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.1,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(shellGeo, mat);
}

function createLigand() {
  const geo = new THREE.DodecahedronGeometry(0.1, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const d = displace(x, y, z) * 0.25;
    const len = Math.sqrt(x * x + y * y + z * z) || 1;
    pos.setXYZ(i, x + (x / len) * d, y + (y / len) * d, z + (z / len) * d);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd166,
    emissive: 0x332200,
    roughness: 0.3,
    metalness: 0.4,
  });

  return new THREE.Mesh(geo, mat);
}

function createMarker() {
  const geo = new THREE.SphereGeometry(0.03, 16, 16);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x06d6a0,
    emissive: 0x064a3a,
  });
  return new THREE.Mesh(geo, mat);
}

/**
 * Build the L3 dual-pocket scene and add it to the given Three.js scene.
 */
export function initL3Scene(scene) {
  const l3Group = new THREE.Group();
  l3Group.name = 'L3';

  // --- COX-1 (left) ---
  const cox1 = createProteinBlob(0x4a90d9, 'right'); // opens to the right (toward center)
  cox1.position.set(-0.8, 1.2, -1.0);
  l3Group.add(cox1);

  const ligand1 = createLigand();
  ligand1.position.set(-0.8, 1.2, -0.85);
  l3Group.add(ligand1);
  ligands.push({ mesh: ligand1, baseY: ligand1.position.y });

  const marker1 = createMarker();
  marker1.position.set(-0.65, 1.3, -0.9);
  l3Group.add(marker1);
  markers.push({ mesh: marker1, baseY: marker1.position.y });

  const cox1Light = new THREE.PointLight(0x4a90d9, 0.5, 2);
  cox1Light.position.set(-0.8, 1.2, -0.7);
  l3Group.add(cox1Light);
  cavityLights.push(cox1Light);

  const cox1Label = createTextSprite('COX-1', { color: '#4a90d9' });
  cox1Label.position.set(-0.8, 1.75, -1.0);
  l3Group.add(cox1Label);

  const ileLabel = createTextSprite('ILE523', { fontSize: 32, scale: 0.15, color: '#06d6a0' });
  ileLabel.position.set(-0.55, 1.42, -0.85);
  l3Group.add(ileLabel);

  // --- COX-2 (right) ---
  const cox2 = createProteinBlob(0xd94a4a, 'left'); // opens to the left (toward center)
  cox2.position.set(0.8, 1.2, -1.0);
  l3Group.add(cox2);

  const ligand2 = createLigand();
  ligand2.position.set(0.8, 1.2, -0.85);
  l3Group.add(ligand2);
  ligands.push({ mesh: ligand2, baseY: ligand2.position.y });

  const marker2 = createMarker();
  marker2.position.set(0.95, 1.3, -0.9);
  l3Group.add(marker2);
  markers.push({ mesh: marker2, baseY: marker2.position.y });

  const cox2Light = new THREE.PointLight(0xd94a4a, 0.5, 2);
  cox2Light.position.set(0.8, 1.2, -0.7);
  l3Group.add(cox2Light);
  cavityLights.push(cox2Light);

  const cox2Label = createTextSprite('COX-2', { color: '#d94a4a' });
  cox2Label.position.set(0.8, 1.75, -1.0);
  l3Group.add(cox2Label);

  const valLabel = createTextSprite('VAL523', { fontSize: 32, scale: 0.15, color: '#06d6a0' });
  valLabel.position.set(1.05, 1.42, -0.85);
  l3Group.add(valLabel);

  // --- Rofecoxib label (centered) ---
  const drugLabel = createTextSprite('Rofecoxib (Vioxx)', { fontSize: 36, scale: 0.2, color: '#ffd166' });
  drugLabel.position.set(0, 1.85, -1.0);
  l3Group.add(drugLabel);

  scene.add(l3Group);
}

/**
 * Per-frame animation updates. Call from the render loop.
 */
export function updateL3Scene(time) {
  const t = time * 0.001; // seconds

  for (const { mesh, baseY } of ligands) {
    mesh.scale.setScalar(1.0 + 0.05 * Math.sin(t * 2));
    mesh.position.y = baseY + 0.01 * Math.sin(t * 1.5);
  }

  for (const light of cavityLights) {
    light.intensity = 0.5 + 0.2 * Math.sin(t * 1.2);
  }

  for (const { mesh, baseY } of markers) {
    mesh.position.y = baseY + 0.015 * Math.sin(t * 1.8);
  }
}
