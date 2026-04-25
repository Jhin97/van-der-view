"""BioPython PDB I/O helpers."""
from __future__ import annotations

from pathlib import Path

from Bio.PDB import PDBIO, PDBParser, Select
from Bio.PDB.Structure import Structure


def load_structure(path: Path, structure_id: str | None = None) -> Structure:
    """Parse a PDB file into a BioPython Structure."""
    parser = PDBParser(QUIET=True)
    sid = structure_id or path.stem
    return parser.get_structure(sid, str(path))


def strip_waters(structure: Structure) -> None:
    """Remove HOH (water) residues in place. HEM and other ligands are kept."""
    waters_to_remove: list[tuple] = []
    for model in structure:
        for chain in model:
            for residue in chain:
                if residue.resname == "HOH":
                    waters_to_remove.append((model.id, chain.id, residue.id))
    for model_id, chain_id, res_id in waters_to_remove:
        structure[model_id][chain_id].detach_child(res_id)


def keep_first_altloc(structure: Structure) -> None:
    """Drop alt-conformations beyond the first per atom (in place)."""
    for atom in list(structure.get_atoms()):
        if atom.is_disordered():
            atom.disordered_select("A")  # keep altloc A


class _AcceptAll(Select):
    def accept_atom(self, atom):
        # Skip atoms with non-default altloc that weren't selected.
        return atom.altloc in ("", " ", "A")


def save_structure(structure: Structure, path: Path) -> None:
    """Write a BioPython Structure to a PDB file."""
    io = PDBIO()
    io.set_structure(structure)
    path.parent.mkdir(parents=True, exist_ok=True)
    io.save(str(path), select=_AcceptAll())
