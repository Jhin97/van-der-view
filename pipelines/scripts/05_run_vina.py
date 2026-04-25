#!/usr/bin/env python
"""Run AutoDock Vina for all (ligand x target) combinations.

Pre-conditions:
  - cleaned/{cox1,cox2}.pdb exist
  - ligands/{name}.sdf exist (5 ligands)
  - public/assets/v1/pocket_{cox1,cox2}.json exist
Outputs:
  - data/vina_runs/out_{ligand}_{target}.pdbqt
  - public/assets/v1/vina_results.json (aggregated)

Usage:
  python scripts/05_run_vina.py
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import multiprocessing as mp
import os
import subprocess
import sys
from pathlib import Path

from scripts.config import (
    ASSETS_DIR,
    CLEANED_DIR,
    LIGAND_DIR,
    LIGANDS,
    TARGETS,
    VINA_PARAMS,
    VINA_RESULTS_SCHEMA_VERSION,
    VINA_RUN_DIR,
)
from scripts.lib import vina_wrapper


def _ensure_pdbqt(input_path: Path, output_path: Path, kind: str) -> Path:
    """Run mk_prepare_receptor / mk_prepare_ligand or fallback to obabel."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if output_path.exists():
        return output_path
    if kind == "receptor":
        cmd = ["obabel", str(input_path), "-O", str(output_path), "-xr"]
    else:
        cmd = ["obabel", str(input_path), "-O", str(output_path), "--gen3d", "-h"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not output_path.exists():
        raise RuntimeError(f"obabel {kind} prep failed for {input_path}: {result.stderr}")
    return output_path


def _vina_version() -> str:
    try:
        out = subprocess.run(["vina", "--version"], capture_output=True, text=True, check=True)
        return out.stdout.strip().splitlines()[0]
    except Exception:
        return "unknown"


def _run_one(args: tuple[str, str]) -> dict:
    ligand_name, target_key = args
    cleaned = Path(os.environ.get("PIPELINE_CLEANED_DIR", str(CLEANED_DIR)))
    ligands = Path(os.environ.get("PIPELINE_LIGAND_DIR", str(LIGAND_DIR)))
    assets = Path(os.environ.get("PIPELINE_ASSETS_DIR", str(ASSETS_DIR)))
    runs = Path(os.environ.get("PIPELINE_VINA_RUN_DIR", str(VINA_RUN_DIR)))

    receptor_pdbqt = _ensure_pdbqt(
        cleaned / f"{target_key}.pdb", runs / f"{target_key}.pdbqt", kind="receptor"
    )
    ligand_pdbqt = _ensure_pdbqt(
        ligands / f"{ligand_name}.sdf", runs / f"{ligand_name}.pdbqt", kind="ligand"
    )

    pocket = json.loads((assets / f"pocket_{target_key}.json").read_text())
    cx, cy, cz = pocket["pocket_center"]
    out_pdbqt = runs / f"out_{ligand_name}_{target_key}.pdbqt"

    vina_wrapper.run_vina(
        receptor_pdbqt=receptor_pdbqt,
        ligand_pdbqt=ligand_pdbqt,
        out_pdbqt=out_pdbqt,
        box_center=(cx, cy, cz),
        box_size=VINA_PARAMS["box_size"],
        exhaustiveness=VINA_PARAMS["exhaustiveness"],
        num_modes=VINA_PARAMS["num_modes"],
        energy_range=VINA_PARAMS["energy_range"],
        seed=VINA_PARAMS["seed"],
    )

    poses = vina_wrapper.parse_pdbqt_output(out_pdbqt)
    return {
        "ligand": ligand_name,
        "target": target_key,
        "best_pose": poses[0],
        "all_poses": poses,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Run Vina for all ligand x target combos")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args(argv)

    jobs = [(l["name"], t) for l in LIGANDS for t in TARGETS.keys()]

    with mp.Pool(processes=args.workers) as pool:
        runs = pool.map(_run_one, jobs)

    payload = {
        "schema_version": VINA_RESULTS_SCHEMA_VERSION,
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "vina_version": _vina_version(),
        "params": {
            "box_size": list(VINA_PARAMS["box_size"]),
            "exhaustiveness": VINA_PARAMS["exhaustiveness"],
            "num_modes": VINA_PARAMS["num_modes"],
            "energy_range": VINA_PARAMS["energy_range"],
            "seed": VINA_PARAMS["seed"],
        },
        "runs": runs,
    }
    out = Path(os.environ.get("PIPELINE_ASSETS_DIR", str(ASSETS_DIR))) / "vina_results.json"
    out.write_text(json.dumps(payload, indent=2))
    print(f"[done] {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
