"""Test Vina output parser."""
from pathlib import Path

import pytest

from scripts.lib import vina_wrapper


def test_parse_pdbqt_returns_two_models(fixtures_dir):
    poses = vina_wrapper.parse_pdbqt_output(fixtures_dir / "sample_vina.pdbqt")
    assert len(poses) == 2


def test_parse_pdbqt_extracts_score_and_rmsd(fixtures_dir):
    poses = vina_wrapper.parse_pdbqt_output(fixtures_dir / "sample_vina.pdbqt")
    assert poses[0]["vina_score"] == -10.2
    assert poses[0]["rmsd_lb"] == 0.0
    assert poses[0]["rmsd_ub"] == 0.0
    assert poses[1]["vina_score"] == -9.8


def test_parse_pdbqt_extracts_atom_xyz(fixtures_dir):
    poses = vina_wrapper.parse_pdbqt_output(fixtures_dir / "sample_vina.pdbqt")
    assert len(poses[0]["atom_xyz"]) == 2
    assert poses[0]["atom_xyz"][0] == pytest.approx([1.0, 2.0, 3.0])


def test_centroid_of_first_pose(fixtures_dir):
    poses = vina_wrapper.parse_pdbqt_output(fixtures_dir / "sample_vina.pdbqt")
    cx, cy, cz = poses[0]["ligand_centroid"]
    assert (cx, cy, cz) == pytest.approx((1.25, 2.25, 3.25))
