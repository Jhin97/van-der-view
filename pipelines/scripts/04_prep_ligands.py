#!/usr/bin/env python
"""Prep 3D conformers for the 5 NSAID ligands; write SDF files.

Usage:
  python scripts/04_prep_ligands.py
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from scripts.config import LIGAND_DIR, LIGANDS
from scripts.lib import ligand


def prep_one(name: str, smiles: str, out_dir: Path) -> Path:
    mol = ligand.smiles_to_conformer(smiles)
    if mol is None:
        raise RuntimeError(f"Conformer generation failed for {name} ({smiles})")
    out = out_dir / f"{name}.sdf"
    out.parent.mkdir(parents=True, exist_ok=True)
    ligand.write_sdf(mol, out)
    print(f"[ligand] {name} -> {out} (energy={ligand.compute_mmff_energy(mol):.2f})")
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Prep ligand 3D conformers")
    parser.parse_args(argv)
    out_dir = Path(os.environ.get("PIPELINE_LIGAND_DIR", str(LIGAND_DIR)))
    for entry in LIGANDS:
        prep_one(entry["name"], entry["smiles"], out_dir)
    print(f"[done] ligand SDFs in {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
