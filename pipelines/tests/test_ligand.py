"""Test ligand 3D conformer generation."""
import importlib.util

import pytest

if importlib.util.find_spec("rdkit") is None:
    pytest.skip("rdkit not available in host interpreter; tests run in vdv-pipeline conda env", allow_module_level=True)

from scripts.lib import ligand


def test_smiles_to_conformer_returns_mol_with_3d_coords():
    mol = ligand.smiles_to_conformer("CCO")  # ethanol
    assert mol is not None
    assert mol.GetNumConformers() == 1
    conf = mol.GetConformer()
    pos = conf.GetAtomPosition(0)
    # any non-trivial 3D coord (not all zero)
    assert (pos.x, pos.y, pos.z) != (0.0, 0.0, 0.0)


def test_conformer_is_minimised_with_mmff94():
    mol = ligand.smiles_to_conformer("CC(C)Cc1ccc(C(C)C(=O)O)cc1")  # ibuprofen
    energy = ligand.compute_mmff_energy(mol)
    assert energy is not None
    # Reasonable energy band for ibuprofen post-min (kcal/mol scale)
    assert -200 < energy < 200
