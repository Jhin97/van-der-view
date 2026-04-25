// src/lib/asset-loader.js
//
// Thin async wrappers over GLTFLoader + DRACO + fetch. Used by all level
// scenes (L1, L2, L3) to load F-002 assets.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const dracoLoader = new DRACOLoader().setDecoderPath(
  'https://www.gstatic.com/draco/v1/decoders/'
);
const gltfLoader = new GLTFLoader().setDRACOLoader(dracoLoader);

export function loadGLB(url) {
  return new Promise((resolve) => {
    gltfLoader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      () => {
        console.warn(`[asset-loader] loadGLB(${url}) failed — returning null`);
        resolve(null);
      }
    );
  });
}

export async function loadJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[asset-loader] loadJSON(${url}) failed — HTTP ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn(`[asset-loader] loadJSON(${url}) failed — ${err.message}`);
    return null;
  }
}

/**
 * Walk a loaded mesh tree and extract world-space vertex positions.
 * Used as a proxy for "atom positions" during clash / H-bond detection.
 * For surface-mesh ligands the vertices ARE the molecular surface.
 *
 * @param {THREE.Object3D} rootObj
 * @param {number} [maxSamples=64] sub-sample if vertex count exceeds this
 * @returns {{x:number,y:number,z:number}[]}
 */
export function extractAtomPositions(rootObj, maxSamples = 64) {
  if (!rootObj) return [];
  rootObj.updateMatrixWorld(true);

  const allPositions = [];
  const tmp = new THREE.Vector3();
  rootObj.traverse((child) => {
    if (child.isMesh && child.geometry?.attributes?.position) {
      const posAttr = child.geometry.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        tmp.fromBufferAttribute(posAttr, i).applyMatrix4(child.matrixWorld);
        allPositions.push({ x: tmp.x, y: tmp.y, z: tmp.z });
      }
    }
  });

  if (allPositions.length <= maxSamples) return allPositions;

  // Even-stride sub-sample to keep cost predictable at 60 Hz.
  const stride = allPositions.length / maxSamples;
  const sampled = [];
  for (let i = 0; i < maxSamples; i++) {
    sampled.push(allPositions[Math.floor(i * stride)]);
  }
  return sampled;
}
