"""Tests for PDB I/O helpers."""
from pathlib import Path

import pytest

from scripts.lib import pdb_io


def test_load_structure_returns_biopython_structure(fixtures_dir):
    pdb_path = fixtures_dir / "tiny_protein.pdb"
    structure = pdb_io.load_structure(pdb_path, structure_id="tiny")
    assert structure.id == "tiny"


def test_strip_waters_removes_hoh(fixtures_dir):
    pdb_path = fixtures_dir / "tiny_protein.pdb"
    structure = pdb_io.load_structure(pdb_path)
    pdb_io.strip_waters(structure)
    hetatms = [r for r in structure.get_residues() if r.id[0] == "W"]
    assert hetatms == []


def test_strip_waters_keeps_heme(fixtures_dir):
    pdb_path = fixtures_dir / "tiny_protein.pdb"
    structure = pdb_io.load_structure(pdb_path)
    pdb_io.strip_waters(structure)
    hem = [r for r in structure.get_residues() if r.resname == "HEM"]
    assert len(hem) == 1


def test_save_structure_writes_pdb(fixtures_dir, tmp_path):
    pdb_path = fixtures_dir / "tiny_protein.pdb"
    structure = pdb_io.load_structure(pdb_path)
    out = tmp_path / "out.pdb"
    pdb_io.save_structure(structure, out)
    assert out.exists()
    assert "ATOM" in out.read_text()
