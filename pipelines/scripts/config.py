"""F-002 pipeline configuration: targets, residue picks, ligand SMILES, Vina params, paths."""
from __future__ import annotations

from pathlib import Path

# --- paths ---
PIPELINE_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PIPELINE_ROOT / "data"
PDB_DIR = DATA_DIR / "pdb"
CLEANED_DIR = DATA_DIR / "cleaned"
LIGAND_DIR = DATA_DIR / "ligands"
VINA_RUN_DIR = DATA_DIR / "vina_runs"

ASSETS_DIR = PIPELINE_ROOT.parent / "public" / "assets" / "v1"
LIGAND_GLB_DIR = ASSETS_DIR / "ligands"

# --- targets (literature-grounded, Kurumbail et al. Nature 1996) ---
TARGETS: dict[str, dict] = {
    "cox1": {
        "pdb_id": "1EQG",
        "chain": "A",
        "key_residues": [
            {"id": "ILE523", "role": "marquee_selectivity_gatekeeper", "narrative_hook": "side_pocket_gate"},
            {"id": "ARG120", "role": "h_bond_acceptor"},
            {"id": "TYR385", "role": "h_bond_donor"},
            {"id": "SER530", "role": "covalent_anchor_aspirin_only"},
        ],
    },
    "cox2": {
        "pdb_id": "1CX2",
        "chain": "A",
        "key_residues": [
            {"id": "VAL523", "role": "marquee_selectivity_gatekeeper", "narrative_hook": "side_pocket_gate"},
            {"id": "ARG120", "role": "h_bond_acceptor"},
            {"id": "TYR385", "role": "h_bond_donor"},
            {"id": "SER530", "role": "covalent_anchor_aspirin_only"},
        ],
    },
}

# --- ligands (SMILES from ChEMBL, diclofenac replacing aspirin per Gemini eval) ---
LIGANDS: list[dict] = [
    {"name": "celecoxib", "smiles": "Cc1ccc(-c2cc(C(F)(F)F)nn2-c3ccc(S(N)(=O)=O)cc3)cc1", "chembl": "CHEMBL118"},
    {"name": "rofecoxib", "smiles": "O=C1OCC(=C1c1ccccc1)c1ccc(S(C)(=O)=O)cc1", "chembl": "CHEMBL122"},
    {"name": "ibuprofen", "smiles": "CC(C)Cc1ccc(C(C)C(=O)O)cc1", "chembl": "CHEMBL521"},
    {"name": "naproxen", "smiles": "COc1ccc2cc(C(C)C(=O)O)ccc2c1", "chembl": "CHEMBL154"},
    {"name": "diclofenac", "smiles": "OC(=O)Cc1ccccc1Nc1c(Cl)cccc1Cl", "chembl": "CHEMBL3"},
]

# --- Vina docking params ---
VINA_PARAMS: dict = {
    "box_size": (22.5, 22.5, 22.5),
    "exhaustiveness": 8,
    "num_modes": 9,
    "energy_range": 3.0,
    "seed": 42,
}

# --- output schema versioning ---
POCKET_SCHEMA_VERSION = "1.0"
VINA_RESULTS_SCHEMA_VERSION = "1.0"
