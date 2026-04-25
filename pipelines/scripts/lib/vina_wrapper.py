"""Vina docking subprocess wrapper + .pdbqt parser."""
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any


def parse_pdbqt_output(path: Path) -> list[dict[str, Any]]:
    """Parse a multi-MODEL .pdbqt file into a list of pose dicts."""
    poses: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None

    for raw in path.read_text().splitlines():
        line = raw.rstrip()
        if line.startswith("MODEL"):
            current = {"vina_score": None, "rmsd_lb": None, "rmsd_ub": None, "atom_xyz": []}
        elif line.startswith("REMARK VINA RESULT"):
            tokens = line.split()
            current["vina_score"] = float(tokens[3])
            current["rmsd_lb"] = float(tokens[4])
            current["rmsd_ub"] = float(tokens[5])
        elif line.startswith(("ATOM", "HETATM")):
            x = float(line[30:38])
            y = float(line[38:46])
            z = float(line[46:54])
            current["atom_xyz"].append([x, y, z])
        elif line.startswith("ENDMDL"):
            atoms = current["atom_xyz"]
            n = len(atoms)
            cx = sum(a[0] for a in atoms) / n
            cy = sum(a[1] for a in atoms) / n
            cz = sum(a[2] for a in atoms) / n
            current["ligand_centroid"] = [cx, cy, cz]
            poses.append(current)
            current = None
    return poses


def run_vina(
    receptor_pdbqt: Path,
    ligand_pdbqt: Path,
    out_pdbqt: Path,
    box_center: tuple[float, float, float],
    box_size: tuple[float, float, float],
    exhaustiveness: int,
    num_modes: int,
    energy_range: float,
    seed: int,
) -> Path:
    """Invoke `vina` CLI; return the output .pdbqt path."""
    out_pdbqt.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "vina",
        "--receptor", str(receptor_pdbqt),
        "--ligand", str(ligand_pdbqt),
        "--center_x", str(box_center[0]),
        "--center_y", str(box_center[1]),
        "--center_z", str(box_center[2]),
        "--size_x", str(box_size[0]),
        "--size_y", str(box_size[1]),
        "--size_z", str(box_size[2]),
        "--exhaustiveness", str(exhaustiveness),
        "--num_modes", str(num_modes),
        "--energy_range", str(energy_range),
        "--seed", str(seed),
        "--out", str(out_pdbqt),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"vina failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}")
    return out_pdbqt
