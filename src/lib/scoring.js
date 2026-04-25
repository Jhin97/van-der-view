// src/lib/scoring.js
//
// Pure-function docking score kernel reusable by L1 (F-004b), L2 (F-005),
// and L3 (F-006). No imports from Three.js — accepts plain {x,y,z} or
// THREE.Vector3 (both expose .x/.y/.z); operates only on those numbers.

export const DEFAULT_WEIGHTS = { alpha: 0.6, beta: 0.3, gamma: 0.1 };
export const DEFAULT_THRESHOLDS = { hBondDist: 3.5, clashDist: 1.0, dMax: 10.0 };
export const BEST_POSE = { distance: 3.0, hBondHits: 2 };

const HBOND_ROLES = new Set(['h_bond_donor', 'h_bond_acceptor']);

function _euclid(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function _toVec(arrOrVec) {
  if (Array.isArray(arrOrVec)) {
    return { x: arrOrVec[0], y: arrOrVec[1], z: arrOrVec[2] };
  }
  return arrOrVec;
}

/**
 * Compute heuristic docking score.
 *
 * @param {object} args
 * @param {{x:number,y:number,z:number}} args.ligandCentroid
 * @param {{x:number,y:number,z:number}[]} args.ligandAtoms
 * @param {object} args.pocketAnnotation   parsed pocket_cox{1,2}.json
 * @param {object} args.vinaBestPose       best_pose dict from vina_results.json
 * @param {object} [args.weights]
 * @param {object} [args.thresholds]
 * @returns {{
 *   total: number,
 *   components: { distance: number, hBondHits: number, clashes: number },
 *   isBestPose: boolean,
 *   rawDistance: number
 * }}
 */
export function computeScore({
  ligandCentroid,
  ligandAtoms,
  pocketAnnotation,
  vinaBestPose,
  weights = DEFAULT_WEIGHTS,
  thresholds = DEFAULT_THRESHOLDS,
}) {
  if (!ligandCentroid || !vinaBestPose || !pocketAnnotation) {
    throw new Error('computeScore: ligandCentroid, vinaBestPose, pocketAnnotation are required');
  }

  const bestCentroid = _toVec(vinaBestPose.ligand_centroid);
  const rawDistance = _euclid(ligandCentroid, bestCentroid);
  const distanceTerm = 1 - Math.max(0, Math.min(1, rawDistance / thresholds.dMax));

  let hBondHits = 0;
  let clashes = 0;
  const residues = pocketAnnotation.key_residues || [];

  for (const residue of residues) {
    const sideChain = _toVec(residue.side_chain_centroid);

    let nearestAtomDist = Infinity;
    for (const atom of ligandAtoms || []) {
      const d = _euclid(atom, sideChain);
      if (d < nearestAtomDist) nearestAtomDist = d;
      if (d < thresholds.clashDist) clashes += 1;
    }

    if (HBOND_ROLES.has(residue.role) && nearestAtomDist < thresholds.hBondDist) {
      hBondHits += 1;
    }
  }

  const total =
    weights.alpha * distanceTerm +
    weights.beta * hBondHits -
    weights.gamma * clashes;

  const isBestPose =
    rawDistance < BEST_POSE.distance && hBondHits >= BEST_POSE.hBondHits;

  return {
    total,
    components: { distance: distanceTerm, hBondHits, clashes },
    isBestPose,
    rawDistance,
  };
}
