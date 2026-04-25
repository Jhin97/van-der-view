"""Test pocket-residue extraction from a tiny PDB."""
from pathlib import Path

import pytest

from scripts.lib import pdb_io, pocket


def test_extract_residue_returns_ca_xyz(fixtures_dir):
    structure = pdb_io.load_structure(fixtures_dir / "tiny_protein.pdb")
    info = pocket.extract_residue_info(structure, chain_id="A", residue_id="VAL1")
    assert info["id"] == "VAL1"
    assert info["ca_xyz"] == pytest.approx([11.0, 10.0, 10.0])


def test_pocket_center_is_mean_of_residue_cas(fixtures_dir):
    structure = pdb_io.load_structure(fixtures_dir / "tiny_protein.pdb")
    residues = [
        pocket.extract_residue_info(structure, chain_id="A", residue_id="VAL1"),
        pocket.extract_residue_info(structure, chain_id="A", residue_id="ARG2"),
        pocket.extract_residue_info(structure, chain_id="A", residue_id="TYR3"),
    ]
    center = pocket.compute_pocket_center(residues)
    # Cα xyz: (11,10,10), (11.5,13,10.5), (14,13.5,8.5)
    assert center == pytest.approx([12.166666, 12.166666, 9.666666], abs=1e-3)


def test_heme_centroid_extracted(fixtures_dir):
    structure = pdb_io.load_structure(fixtures_dir / "tiny_protein.pdb")
    centroid = pocket.compute_heme_centroid(structure)
    # FE (12,12,10) + C1A (12.5,12.5,10.5) -> mean (12.25, 12.25, 10.25)
    assert centroid == pytest.approx([12.25, 12.25, 10.25], abs=1e-3)
