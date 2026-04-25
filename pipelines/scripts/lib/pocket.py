"""Pocket annotation helpers: residue extraction + center calculation."""
from __future__ import annotations

import math
import re
from typing import Any

from Bio.PDB.Structure import Structure


_RES_ID_RE = re.compile(r"^([A-Z]{3})(\d+)$")


def _split_residue_id(residue_id: str) -> tuple[str, int]:
    match = _RES_ID_RE.match(residue_id)
    if not match:
        raise ValueError(f"Bad residue id: {residue_id} (expected e.g. VAL523)")
    return match.group(1), int(match.group(2))


def extract_residue_info(structure: Structure, chain_id: str, residue_id: str) -> dict[str, Any]:
    """Return dict with id, ca_xyz, side_chain_centroid."""
    resname, resnum = _split_residue_id(residue_id)
    chain = None
    for c in structure.get_chains():
        if c.id == chain_id:
            chain = c
            break
    if chain is None:
        raise KeyError(f"Chain {chain_id} not found")

    target_res = None
    for residue in chain:
        if residue.resname == resname and residue.id[1] == resnum:
            target_res = residue
            break
    if target_res is None:
        raise KeyError(f"Residue {residue_id} not found on chain {chain_id}")

    if "CA" not in target_res:
        raise ValueError(f"No CA atom on {residue_id}")
    ca = list(target_res["CA"].get_coord())

    backbone = {"N", "CA", "C", "O"}
    side_atoms = [a for a in target_res if a.name not in backbone]
    if side_atoms:
        sx = sum(a.coord[0] for a in side_atoms) / len(side_atoms)
        sy = sum(a.coord[1] for a in side_atoms) / len(side_atoms)
        sz = sum(a.coord[2] for a in side_atoms) / len(side_atoms)
        side = [sx, sy, sz]
    else:
        side = ca

    return {"id": residue_id, "ca_xyz": [float(x) for x in ca], "side_chain_centroid": [float(x) for x in side]}


def compute_pocket_center(residues: list[dict[str, Any]]) -> list[float]:
    """Geometric centre of residue Cα coords."""
    if not residues:
        raise ValueError("Empty residue list")
    n = len(residues)
    cx = sum(r["ca_xyz"][0] for r in residues) / n
    cy = sum(r["ca_xyz"][1] for r in residues) / n
    cz = sum(r["ca_xyz"][2] for r in residues) / n
    return [cx, cy, cz]


def compute_pocket_radius(residues: list[dict[str, Any]], center: list[float], buffer: float = 4.0) -> float:
    """Max Cα distance from centre + buffer."""
    radii = [
        math.sqrt(
            (r["ca_xyz"][0] - center[0]) ** 2
            + (r["ca_xyz"][1] - center[1]) ** 2
            + (r["ca_xyz"][2] - center[2]) ** 2
        )
        for r in residues
    ]
    return max(radii) + buffer


def compute_heme_centroid(structure: Structure) -> list[float] | None:
    """Mean coord of all HEM heavy atoms; None if no heme."""
    atoms = [a for a in structure.get_atoms() if a.get_parent().resname == "HEM"]
    if not atoms:
        return None
    cx = sum(a.coord[0] for a in atoms) / len(atoms)
    cy = sum(a.coord[1] for a in atoms) / len(atoms)
    cz = sum(a.coord[2] for a in atoms) / len(atoms)
    return [float(cx), float(cy), float(cz)]
