#!/usr/bin/env python
"""Clean fetched PDB files: strip waters, keep first altloc, retain HEM.

Usage:
  python scripts/02_clean_protein.py
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from scripts.config import CLEANED_DIR, PDB_DIR, TARGETS
from scripts.lib import pdb_io


def clean_one(pdb_id: str, src_dir: Path, out_dir: Path, target_key: str) -> Path:
    src = src_dir / f"{pdb_id.upper()}.pdb"
    if not src.exists():
        raise FileNotFoundError(f"Missing input PDB: {src}")
    structure = pdb_io.load_structure(src, structure_id=target_key)
    pdb_io.strip_waters(structure)
    pdb_io.keep_first_altloc(structure)
    out = out_dir / f"{target_key}.pdb"
    pdb_io.save_structure(structure, out)
    print(f"[clean] {src.name} -> {out}")
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Clean PDB files")
    parser.parse_args(argv)

    src_dir = Path(os.environ.get("PIPELINE_PDB_DIR", str(PDB_DIR)))
    out_dir = Path(os.environ.get("PIPELINE_CLEANED_DIR", str(CLEANED_DIR)))
    out_dir.mkdir(parents=True, exist_ok=True)

    for key, target in TARGETS.items():
        clean_one(target["pdb_id"], src_dir, out_dir, key)
    print(f"[done] Cleaned PDBs in {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
