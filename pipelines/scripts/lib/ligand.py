"""Ligand prep helpers: SMILES → 3D conformer (ETKDG + MMFF94)."""
from __future__ import annotations

from rdkit import Chem
from rdkit.Chem import AllChem


def smiles_to_conformer(smiles: str, num_confs: int = 10, seed: int = 42) -> Chem.Mol | None:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = seed
    cids = AllChem.EmbedMultipleConfs(mol, numConfs=num_confs, params=params)
    if not cids:
        return None
    energies: list[tuple[int, float]] = []
    for cid in cids:
        result = AllChem.MMFFOptimizeMolecule(mol, confId=cid, mmffVariant="MMFF94s", maxIters=500)
        if result != 0:
            continue
        ff = AllChem.MMFFGetMoleculeForceField(mol, AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94s"), confId=cid)
        if ff is None:
            continue
        energies.append((cid, float(ff.CalcEnergy())))
    if not energies:
        return None
    best_cid, _ = min(energies, key=lambda kv: kv[1])
    keep = Chem.Mol(mol)
    keep.RemoveAllConformers()
    keep.AddConformer(mol.GetConformer(best_cid), assignId=True)
    return keep


def compute_mmff_energy(mol: Chem.Mol) -> float | None:
    if mol.GetNumConformers() == 0:
        return None
    props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94s")
    if props is None:
        return None
    ff = AllChem.MMFFGetMoleculeForceField(mol, props, confId=0)
    if ff is None:
        return None
    return float(ff.CalcEnergy())


def write_sdf(mol: Chem.Mol, path) -> None:
    writer = Chem.SDWriter(str(path))
    writer.write(mol)
    writer.close()
