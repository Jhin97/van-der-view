#!/usr/bin/env python
"""Fetch raw PDB files for the F-002 targets from RCSB.

Usage:
  python scripts/01_fetch_pdb.py
"""
from __future__ import annotations

import argparse
import os
import sys
import urllib.request
from pathlib import Path

from scripts.config import PDB_DIR, TARGETS

RCSB_URL = "https://files.rcsb.org/download/{pdb_id}.pdb"


def fetch_pdb(pdb_id: str, dest_dir: Path) -> Path:
    dest_dir.mkdir(parents=True, exist_ok=True)
    out = dest_dir / f"{pdb_id.upper()}.pdb"
    if out.exists() and out.stat().st_size > 0:
        print(f"[skip] {out} already present.")
        return out
    url = RCSB_URL.format(pdb_id=pdb_id.upper())
    print(f"[fetch] {url} -> {out}")
    urllib.request.urlretrieve(url, str(out))
    if out.stat().st_size == 0:
        out.unlink()
        raise RuntimeError(f"Empty download for {pdb_id}")
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch PDB files from RCSB")
    parser.parse_args(argv)

    dest = Path(os.environ.get("PIPELINE_PDB_DIR", str(PDB_DIR)))
    for target in TARGETS.values():
        fetch_pdb(target["pdb_id"], dest)
    print(f"[done] PDB files in {dest}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
