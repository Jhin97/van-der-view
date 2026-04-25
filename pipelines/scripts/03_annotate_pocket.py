#!/usr/bin/env python
"""Generate pocket annotation JSON for each target.

Usage:
  python scripts/03_annotate_pocket.py
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from scripts.config import ASSETS_DIR, CLEANED_DIR, POCKET_SCHEMA_VERSION, TARGETS
from scripts.lib import pdb_io, pocket


def annotate_one(target_key: str, target: dict, src_dir: Path, out_dir: Path) -> Path:
    pdb = src_dir / f"{target_key}.pdb"
    structure = pdb_io.load_structure(pdb, structure_id=target_key)
    chain_id = target["chain"]
    residues = [
        {
            **pocket.extract_residue_info(structure, chain_id, r["id"]),
            "role": r["role"],
            **({"narrative_hook": r["narrative_hook"]} if "narrative_hook" in r else {}),
        }
        for r in target["key_residues"]
    ]
    center = pocket.compute_pocket_center(residues)
    radius = pocket.compute_pocket_radius(residues, center)
    heme = pocket.compute_heme_centroid(structure)
    side_pocket_anchor = next(
        r["side_chain_centroid"]
        for r in residues
        if r["role"] == "marquee_selectivity_gatekeeper"
    )

    payload = {
        "schema_version": POCKET_SCHEMA_VERSION,
        "pdb_id": target["pdb_id"],
        "chain": chain_id,
        "pocket_center": center,
        "pocket_radius": radius,
        "key_residues": residues,
        "heme_centroid": heme,
        "side_pocket_anchor_xyz": side_pocket_anchor,
    }
    out = out_dir / f"pocket_{target_key}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2))
    print(f"[annotate] {target_key} -> {out}")
    return out


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Annotate pocket residues")
    parser.parse_args(argv)
    src_dir = Path(os.environ.get("PIPELINE_CLEANED_DIR", str(CLEANED_DIR)))
    out_dir = Path(os.environ.get("PIPELINE_ASSETS_DIR", str(ASSETS_DIR)))
    for key, target in TARGETS.items():
        annotate_one(key, target, src_dir, out_dir)
    print(f"[done] pocket JSONs in {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
