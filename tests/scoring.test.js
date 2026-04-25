import { describe, it, expect } from 'vitest';
import {
  computeScore,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  BEST_POSE,
} from '../src/lib/scoring.js';

const samplePocket = {
  key_residues: [
    { id: 'ARG120', side_chain_centroid: [0, 0, 0], role: 'h_bond_acceptor' },
    { id: 'TYR385', side_chain_centroid: [1, 0, 0], role: 'h_bond_donor' },
    { id: 'VAL523', side_chain_centroid: [3, 0, 0], role: 'marquee_selectivity_gatekeeper' },
    { id: 'SER530', side_chain_centroid: [10, 0, 0], role: 'covalent_anchor_aspirin_only' },
  ],
};

const sampleVina = { ligand_centroid: [0.5, 0, 0] };

describe('computeScore', () => {
  it('returns isBestPose=true when distance < 3 Å AND >=2 H-bond hits', () => {
    const r = computeScore({
      ligandCentroid: { x: 0.5, y: 0, z: 0 },
      ligandAtoms: [{ x: 0, y: 0.1, z: 0 }, { x: 1, y: 0.1, z: 0 }],
      pocketAnnotation: samplePocket,
      vinaBestPose: sampleVina,
    });
    expect(r.isBestPose).toBe(true);
    expect(r.components.hBondHits).toBe(2);
    expect(r.rawDistance).toBeCloseTo(0);
  });

  it('returns isBestPose=false when far from best pose', () => {
    const r = computeScore({
      ligandCentroid: { x: 100, y: 0, z: 0 },
      ligandAtoms: [{ x: 100, y: 0, z: 0 }],
      pocketAnnotation: samplePocket,
      vinaBestPose: sampleVina,
    });
    expect(r.isBestPose).toBe(false);
    expect(r.components.hBondHits).toBe(0);
  });

  it('returns isBestPose=false when distance OK but only 1 H-bond hit', () => {
    // atom at [0, 3.4, 0] is within 3.5A of ARG120 [0,0,0] but > 3.5A from TYR385 [1,0,0]
    const r = computeScore({
      ligandCentroid: { x: 0.5, y: 0, z: 0 },
      ligandAtoms: [{ x: 0, y: 3.4, z: 0 }],
      pocketAnnotation: samplePocket,
      vinaBestPose: sampleVina,
    });
    expect(r.isBestPose).toBe(false);
    expect(r.components.hBondHits).toBe(1);
  });

  it('counts clashes within 1.0 Å of any key residue side chain', () => {
    const r = computeScore({
      ligandCentroid: { x: 0.5, y: 0, z: 0 },
      ligandAtoms: [
        { x: 0, y: 0.5, z: 0 }, // Clashes with ARG120
        { x: 1, y: 0.5, z: 0 }, // Clashes with TYR385
      ],
      pocketAnnotation: samplePocket,
      vinaBestPose: sampleVina,
    });
    expect(r.components.clashes).toBeGreaterThanOrEqual(2);
  });

  it('clamps distance term at d_max', () => {
    const r = computeScore({
      ligandCentroid: { x: 100, y: 0, z: 0 },
      ligandAtoms: [{ x: 100, y: 0, z: 0 }],
      pocketAnnotation: samplePocket,
      vinaBestPose: sampleVina,
      thresholds: { ...DEFAULT_THRESHOLDS, dMax: 10 },
    });
    expect(r.components.distance).toBe(0);
    expect(r.total).toBeCloseTo(0);
  });

  it('throws on missing required args', () => {
    expect(() => computeScore({
      pocketAnnotation: samplePocket,
      vinaBestPose: sampleVina,
    })).toThrow(/ligandCentroid/);
  });

  it('respects custom weights', () => {
    // Perfect distance (term=1), one H-bond hit (beta=0), no clashes (gamma=0)
    const r = computeScore({
      ligandCentroid: { x: 0.5, y: 0, z: 0 },
      ligandAtoms: [{ x: 0, y: 3.4, z: 0 }],
      pocketAnnotation: samplePocket,
      vinaBestPose: sampleVina,
      weights: { alpha: 1, beta: 0, gamma: 0 },
    });
    expect(r.total).toBeCloseTo(1);
  });

  it('exports the locked best-pose threshold from spec', () => {
    expect(BEST_POSE.distance).toBe(3.0);
    expect(BEST_POSE.hBondHits).toBe(2);
  });

  it('uses the locked default weights from spec', () => {
    expect(DEFAULT_WEIGHTS.alpha).toBe(0.6);
    expect(DEFAULT_WEIGHTS.beta).toBe(0.3);
    expect(DEFAULT_WEIGHTS.gamma).toBe(0.1);
  });
});
