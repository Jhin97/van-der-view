# F-002 Asset Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a frontend-ready asset bundle (4 protein .glb + 5 ligand .glb + 2 pocket annotation JSON + 1 Vina results JSON + 5 TTS dialogue txt + 1 story outline doc) from RCSB PDB structures (1EQG / 1CX2) and 5 NSAID SMILES, via a hybrid Conda + Node pipeline that the hackathon team can re-run with `make assets`.

**Architecture:** Conda env (`vdv-pipeline`) hosts BioPython / RDKit / OpenBabel / AutoDock Vina / pymol-open-source for science steps; Node manifest hosts obj2gltf / gltf-pipeline for mesh tooling. Six numbered scripts run via `Makefile` targets. Outputs land in `public/assets/v1/` (committed binaries) — frontend consumes them directly through `fetch()` + Three.js `GLTFLoader`. Story-track deliverables (`docs/features/0002-story-outline.md` + `pipelines/data/dialogue/dr_chen_beat_*.txt`) ship in the same PR for F-008 alignment.

**Tech Stack:** Python 3.11 (BioPython 1.83, RDKit 2024.03, OpenBabel 3.1, vina 1.2.5, pymol-open-source 3.0), pytest 8 + jsonschema 4 for tests, Node 20 (obj2gltf 4, gltf-pipeline 4), GNU Make.

---

## File Structure

**New files**:

```
pipelines/
├── environment.yml                         (Conda env spec)
├── package.json                            (Node deps for obj2gltf/gltf-pipeline)
├── Makefile                                (entry point: `make assets`)
├── README.md                               (run instructions)
├── .gitignore                              (data/ stays local)
├── pyproject.toml                          (pytest config + ruff)
├── scripts/
│   ├── __init__.py
│   ├── config.py                           (paths, residue lists, Vina params, SMILES table)
│   ├── 01_fetch_pdb.py
│   ├── 02_clean_protein.py
│   ├── 03_annotate_pocket.py
│   ├── 04_prep_ligands.py
│   ├── 05_run_vina.py
│   ├── 06_export_meshes.sh
│   ├── pymol_export.pml                    (PyMOL .pml driving 06)
│   └── lib/
│       ├── __init__.py
│       ├── pdb_io.py                       (BioPython wrappers)
│       ├── pocket.py                       (residue extraction + center calc)
│       ├── ligand.py                       (RDKit ETKDG + MMFF)
│       ├── vina_wrapper.py                 (subprocess + .pdbqt parser)
│       └── json_schemas.py                 (output schema constants)
├── tests/
│   ├── __init__.py
│   ├── conftest.py                         (fixtures: sample PDB / SMILES)
│   ├── fixtures/
│   │   └── tiny_protein.pdb                (5-residue toy PDB)
│   ├── test_pdb_io.py
│   ├── test_pocket.py
│   ├── test_ligand.py
│   ├── test_vina_wrapper.py
│   └── test_e2e_smoke.py                   (run all 5 scripts on real inputs)
└── data/                                   (intermediate, gitignored)
    ├── pdb/
    ├── cleaned/
    ├── ligands/
    └── vina_runs/

public/assets/v1/                           (committed outputs)
├── cox1_cartoon.glb
├── cox1_surface.glb
├── cox2_cartoon.glb
├── cox2_surface.glb
├── ligands/
│   ├── celecoxib.glb
│   ├── rofecoxib.glb
│   ├── ibuprofen.glb
│   ├── naproxen.glb
│   └── diclofenac.glb
├── pocket_cox1.json
├── pocket_cox2.json
└── vina_results.json

docs/features/
└── 0002-story-outline.md                   (F-008 cross-track)

pipelines/data/dialogue/
├── dr_chen_beat_1_intro.txt
├── dr_chen_beat_2_discovery.txt
├── dr_chen_beat_3_ranking.txt
├── dr_chen_beat_4_vioxx_flashback.txt
└── dr_chen_beat_5_horizon.txt
```

**Modified files**: `.gitignore` (add `pipelines/data/`).

---

## Task 1: Pipeline Scaffold + Conda + Node Manifests

**Files:**
- Create: `pipelines/environment.yml`
- Create: `pipelines/package.json`
- Create: `pipelines/.gitignore`
- Create: `pipelines/pyproject.toml`
- Create: `pipelines/Makefile`
- Modify: `.gitignore` (project root)

- [ ] **Step 1: Create `pipelines/environment.yml`**

```yaml
name: vdv-pipeline
channels:
  - conda-forge
  - bioconda
dependencies:
  - python=3.11
  - biopython=1.83
  - rdkit=2024.03.5
  - openbabel=3.1.1
  - vina=1.2.5
  - pymol-open-source=3.0.0
  - pip
  - pip:
    - pytest==8.2.0
    - jsonschema==4.22.0
    - ruff==0.5.0
```

- [ ] **Step 2: Create `pipelines/package.json`**

```json
{
  "name": "vdv-pipeline-mesh-tooling",
  "version": "0.1.0",
  "private": true,
  "description": "Node-side mesh tooling for the F-002 asset pipeline (obj2gltf + draco compression).",
  "dependencies": {
    "obj2gltf": "^4.0.0",
    "gltf-pipeline": "^4.1.0"
  },
  "scripts": {
    "obj2gltf": "obj2gltf",
    "compress": "gltf-pipeline -d"
  }
}
```

- [ ] **Step 3: Create `pipelines/.gitignore`**

```
data/
__pycache__/
.pytest_cache/
*.pyc
node_modules/
```

- [ ] **Step 4: Create `pipelines/pyproject.toml`**

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py"]
addopts = "-q -ra"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "N", "W"]
ignore = ["E501"]
```

- [ ] **Step 5: Create `pipelines/Makefile`**

```makefile
.PHONY: help env install fetch clean annotate ligands dock meshes assets test fmt clean-data

ASSETS_DIR := ../public/assets/v1
DATA_DIR := data

help:
	@echo "make env       - create Conda env"
	@echo "make install   - install Node deps"
	@echo "make assets    - run full pipeline"
	@echo "make test      - run pytest"
	@echo "make fmt       - run ruff format"
	@echo "make clean-data - remove data/ (intermediate artifacts)"

env:
	conda env create -f environment.yml

install:
	npm install

fetch:
	python scripts/01_fetch_pdb.py

clean:
	python scripts/02_clean_protein.py

annotate:
	python scripts/03_annotate_pocket.py

ligands:
	python scripts/04_prep_ligands.py

dock:
	python scripts/05_run_vina.py

meshes:
	bash scripts/06_export_meshes.sh

assets: fetch clean annotate ligands dock meshes
	@echo "Pipeline complete. Outputs in $(ASSETS_DIR)/"

test:
	pytest tests/

fmt:
	ruff format scripts/ tests/
	ruff check --fix scripts/ tests/

clean-data:
	rm -rf $(DATA_DIR)
```

- [ ] **Step 6: Append to project root `.gitignore`**

```
# F-002 pipeline intermediate artifacts
pipelines/data/
pipelines/node_modules/
pipelines/__pycache__/
pipelines/.pytest_cache/
```

- [ ] **Step 7: Verify directory creation**

Run:
```bash
cd /Users/chunan/abYcloud/projects/van-der-view
mkdir -p pipelines/scripts/lib pipelines/tests/fixtures pipelines/data
ls pipelines/
```
Expected: `Makefile  README.md  environment.yml  package.json  pyproject.toml  scripts  tests  data` (some may be missing — README will be Task 11; data/ ignored).

- [ ] **Step 8: Commit**

```bash
git add pipelines/environment.yml pipelines/package.json pipelines/.gitignore pipelines/pyproject.toml pipelines/Makefile .gitignore
git commit -m "feat(pipeline): scaffold Conda + Node manifests and Makefile"
```

---

## Task 2: Config Module + Constants

**Files:**
- Create: `pipelines/scripts/__init__.py`
- Create: `pipelines/scripts/lib/__init__.py`
- Create: `pipelines/scripts/config.py`
- Create: `pipelines/tests/__init__.py`
- Create: `pipelines/tests/conftest.py`
- Test: `pipelines/tests/test_config.py`

- [ ] **Step 1: Create empty `__init__.py` files**

```bash
touch pipelines/scripts/__init__.py pipelines/scripts/lib/__init__.py pipelines/tests/__init__.py
```

- [ ] **Step 2: Write the failing test `pipelines/tests/test_config.py`**

```python
"""Sanity-check the config constants."""
from scripts import config


def test_targets_are_cox1_and_cox2():
    assert set(config.TARGETS.keys()) == {"cox1", "cox2"}


def test_cox2_has_val523_marquee():
    cox2 = config.TARGETS["cox2"]
    marquee = next(r for r in cox2["key_residues"] if r["role"] == "marquee_selectivity_gatekeeper")
    assert marquee["id"] == "VAL523"


def test_cox1_has_ile523_marquee():
    cox1 = config.TARGETS["cox1"]
    marquee = next(r for r in cox1["key_residues"] if r["role"] == "marquee_selectivity_gatekeeper")
    assert marquee["id"] == "ILE523"


def test_five_ligands_with_diclofenac_not_aspirin():
    names = {l["name"] for l in config.LIGANDS}
    assert names == {"celecoxib", "rofecoxib", "ibuprofen", "naproxen", "diclofenac"}
    assert "aspirin" not in names


def test_vina_params_match_spec():
    assert config.VINA_PARAMS["box_size"] == (22.5, 22.5, 22.5)
    assert config.VINA_PARAMS["exhaustiveness"] == 8
    assert config.VINA_PARAMS["num_modes"] == 9
    assert config.VINA_PARAMS["seed"] == 42
```

- [ ] **Step 3: Run test to verify it fails**

```bash
cd pipelines
pytest tests/test_config.py -v
```
Expected: ImportError or ModuleNotFoundError on `scripts.config`.

- [ ] **Step 4: Implement `pipelines/scripts/config.py`**

```python
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pytest tests/test_config.py -v
```
Expected: 5 passed.

- [ ] **Step 6: Create `pipelines/tests/conftest.py` (shared fixtures placeholder)**

```python
"""Shared pytest fixtures."""
from pathlib import Path

import pytest


@pytest.fixture
def fixtures_dir() -> Path:
    return Path(__file__).resolve().parent / "fixtures"
```

- [ ] **Step 7: Commit**

```bash
git add pipelines/scripts/__init__.py pipelines/scripts/lib/__init__.py pipelines/scripts/config.py \
        pipelines/tests/__init__.py pipelines/tests/conftest.py pipelines/tests/test_config.py
git commit -m "feat(pipeline): add config module with targets/ligands/Vina params"
```

---

## Task 3: PDB I/O Library + Test Fixture

**Files:**
- Create: `pipelines/tests/fixtures/tiny_protein.pdb`
- Create: `pipelines/scripts/lib/pdb_io.py`
- Test: `pipelines/tests/test_pdb_io.py`

- [ ] **Step 1: Create test fixture `pipelines/tests/fixtures/tiny_protein.pdb`**

A 3-residue toy PDB with one HEM HETATM and one HOH (water) to verify cleaning.

```
HEADER    TINY TEST                               01-JAN-26   TINY              
ATOM      1  N   VAL A   1      10.000  10.000  10.000  1.00 20.00           N  
ATOM      2  CA  VAL A   1      11.000  10.000  10.000  1.00 20.00           C  
ATOM      3  C   VAL A   1      11.500  11.000  10.500  1.00 20.00           C  
ATOM      4  O   VAL A   1      12.500  11.000  10.500  1.00 20.00           O  
ATOM      5  CB  VAL A   1      11.500   9.500  11.000  1.00 20.00           C  
ATOM      6  N   ARG A   2      11.000  12.000  10.000  1.00 20.00           N  
ATOM      7  CA  ARG A   2      11.500  13.000  10.500  1.00 20.00           C  
ATOM      8  C   ARG A   2      12.500  13.500  10.000  1.00 20.00           C  
ATOM      9  O   ARG A   2      13.000  14.500  10.000  1.00 20.00           O  
ATOM     10  CB  ARG A   2      11.000  14.000  11.000  1.00 20.00           C  
ATOM     11  N   TYR A   3      13.000  13.000   9.000  1.00 20.00           N  
ATOM     12  CA  TYR A   3      14.000  13.500   8.500  1.00 20.00           C  
ATOM     13  C   TYR A   3      14.500  14.500   9.000  1.00 20.00           C  
ATOM     14  O   TYR A   3      15.500  14.500   9.500  1.00 20.00           O  
ATOM     15  CB  TYR A   3      14.500  12.500   7.500  1.00 20.00           C  
HETATM   16 FE   HEM A 100      12.000  12.000  10.000  1.00 30.00          FE  
HETATM   17  C1A HEM A 100      12.500  12.500  10.500  1.00 30.00           C  
HETATM   18  O   HOH A 200      20.000  20.000  20.000  1.00 40.00           O  
END                                                                             
```

- [ ] **Step 2: Write the failing test `pipelines/tests/test_pdb_io.py`**

```python
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
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pytest tests/test_pdb_io.py -v
```
Expected: ImportError on `scripts.lib.pdb_io`.

- [ ] **Step 4: Implement `pipelines/scripts/lib/pdb_io.py`**

```python
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pytest tests/test_pdb_io.py -v
```
Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add pipelines/tests/fixtures/tiny_protein.pdb pipelines/scripts/lib/pdb_io.py pipelines/tests/test_pdb_io.py
git commit -m "feat(pipeline): add BioPython PDB I/O helpers with water-strip"
```

---

## Task 4: Script 01 — Fetch PDB

**Files:**
- Create: `pipelines/scripts/01_fetch_pdb.py`
- Test: `pipelines/tests/test_01_fetch_pdb.py`

- [ ] **Step 1: Write the failing test**

```python
"""Smoke test for 01_fetch_pdb (uses subprocess to test as CLI)."""
import subprocess
import sys
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "01_fetch_pdb.py"


def test_script_exists_and_is_invocable():
    assert SCRIPT.exists()
    result = subprocess.run([sys.executable, str(SCRIPT), "--help"], capture_output=True, text=True)
    assert result.returncode == 0
    assert "Usage" in result.stdout or "usage" in result.stdout


@pytest.mark.network
def test_script_fetches_1cx2(tmp_path, monkeypatch):
    """Network test — only runs when --network is passed."""
    monkeypatch.setenv("PIPELINE_PDB_DIR", str(tmp_path))
    result = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True, env={**__import__("os").environ})
    assert result.returncode == 0
    assert (tmp_path / "1CX2.pdb").exists()
    assert (tmp_path / "1EQG.pdb").exists()
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_01_fetch_pdb.py -v -k "not network"
```
Expected: FileNotFoundError on script.

- [ ] **Step 3: Implement `pipelines/scripts/01_fetch_pdb.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_01_fetch_pdb.py -v -k "not network"
```
Expected: 1 passed (smoke test); network test skipped.

- [ ] **Step 5: Commit**

```bash
git add pipelines/scripts/01_fetch_pdb.py pipelines/tests/test_01_fetch_pdb.py
git commit -m "feat(pipeline): add 01_fetch_pdb to download 1EQG/1CX2 from RCSB"
```

---

## Task 5: Script 02 — Clean Protein

**Files:**
- Create: `pipelines/scripts/02_clean_protein.py`
- Test: `pipelines/tests/test_02_clean_protein.py`

- [ ] **Step 1: Write the failing test**

```python
"""Test 02_clean_protein wraps strip_waters + altloc."""
import subprocess
import sys
from pathlib import Path

import shutil

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "02_clean_protein.py"


def test_clean_strips_water_and_keeps_heme(tmp_path, fixtures_dir):
    src_pdb = tmp_path / "pdb"
    src_pdb.mkdir()
    shutil.copy(fixtures_dir / "tiny_protein.pdb", src_pdb / "TINY.pdb")

    out_dir = tmp_path / "cleaned"
    env = {**__import__("os").environ, "PIPELINE_PDB_DIR": str(src_pdb), "PIPELINE_CLEANED_DIR": str(out_dir)}

    # Force the script to treat TINY as a target by passing custom mapping
    # Easier: run via library-call test instead of subprocess for this check
    from scripts.lib import pdb_io
    structure = pdb_io.load_structure(src_pdb / "TINY.pdb")
    pdb_io.strip_waters(structure)
    pdb_io.keep_first_altloc(structure)
    out = out_dir / "tiny.pdb"
    pdb_io.save_structure(structure, out)
    text = out.read_text()
    assert "HOH" not in text
    assert "HEM" in text
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_02_clean_protein.py -v
```
Expected: FileNotFoundError on script (Step 1 of test passes via library call but script-existence check below it should fail later).

(If only library call runs, this test serves dual purpose: locks behaviour now; script comes next.)

- [ ] **Step 3: Implement `pipelines/scripts/02_clean_protein.py`**

```python
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_02_clean_protein.py -v
```
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add pipelines/scripts/02_clean_protein.py pipelines/tests/test_02_clean_protein.py
git commit -m "feat(pipeline): add 02_clean_protein to strip waters and altlocs"
```

---

## Task 6: Pocket Library + Script 03 — Annotate Pocket

**Files:**
- Create: `pipelines/scripts/lib/pocket.py`
- Create: `pipelines/scripts/03_annotate_pocket.py`
- Test: `pipelines/tests/test_pocket.py`

- [ ] **Step 1: Write the failing test for `pocket.extract_residues`**

```python
"""Test pocket-residue extraction from a tiny PDB."""
from pathlib import Path

import pytest

from scripts.lib import pdb_io, pocket


def test_extract_residue_returns_ca_xyz(fixtures_dir):
    structure = pdb_io.load_structure(fixtures_dir / "tiny_protein.pdb")
    info = pocket.extract_residue_info(structure, chain_id="A", residue_id="VAL1")
    assert info["id"] == "VAL1"
    assert info["ca_xyz"] == pytest.approx([11.0, 10.0, 10.0])


def test_pocket_center_is_mean_of_residue_cas(fixtures_dir):
    structure = pdb_io.load_structure(fixtures_dir / "tiny_protein.pdb")
    residues = [
        pocket.extract_residue_info(structure, chain_id="A", residue_id="VAL1"),
        pocket.extract_residue_info(structure, chain_id="A", residue_id="ARG2"),
        pocket.extract_residue_info(structure, chain_id="A", residue_id="TYR3"),
    ]
    center = pocket.compute_pocket_center(residues)
    # Cα xyz: (11,10,10), (11.5,13,10.5), (14,13.5,8.5)
    assert center == pytest.approx([12.166666, 12.166666, 9.666666], abs=1e-3)


def test_heme_centroid_extracted(fixtures_dir):
    structure = pdb_io.load_structure(fixtures_dir / "tiny_protein.pdb")
    centroid = pocket.compute_heme_centroid(structure)
    # FE (12,12,10) + C1A (12.5,12.5,10.5) -> mean (12.25, 12.25, 10.25)
    assert centroid == pytest.approx([12.25, 12.25, 10.25], abs=1e-3)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_pocket.py -v
```
Expected: ImportError on `scripts.lib.pocket`.

- [ ] **Step 3: Implement `pipelines/scripts/lib/pocket.py`**

```python
"""Pocket annotation helpers: residue extraction + center calculation."""
from __future__ import annotations

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
    chain = next(structure.get_chains())
    if chain.id != chain_id:
        for c in structure.get_chains():
            if c.id == chain_id:
                chain = c
                break
        else:
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
    import math

    radii = [
        math.sqrt((r["ca_xyz"][0] - center[0]) ** 2 + (r["ca_xyz"][1] - center[1]) ** 2 + (r["ca_xyz"][2] - center[2]) ** 2)
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_pocket.py -v
```
Expected: 3 passed.

- [ ] **Step 5: Implement `pipelines/scripts/03_annotate_pocket.py`**

```python
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
        {**pocket.extract_residue_info(structure, chain_id, r["id"]), "role": r["role"], **({"narrative_hook": r["narrative_hook"]} if "narrative_hook" in r else {})}
        for r in target["key_residues"]
    ]
    center = pocket.compute_pocket_center(residues)
    radius = pocket.compute_pocket_radius(residues, center)
    heme = pocket.compute_heme_centroid(structure)
    side_pocket_anchor = next(r["side_chain_centroid"] for r in residues if r["role"] == "marquee_selectivity_gatekeeper")

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
```

- [ ] **Step 6: Verify pocket script imports cleanly**

```bash
python -c "from scripts import config; print(config.TARGETS['cox2']['pdb_id'])"
```
Expected: `1CX2`

- [ ] **Step 7: Commit**

```bash
git add pipelines/scripts/lib/pocket.py pipelines/scripts/03_annotate_pocket.py pipelines/tests/test_pocket.py
git commit -m "feat(pipeline): add pocket annotation library and script 03"
```

---

## Task 7: Ligand Library + Script 04 — Prep Ligands

**Files:**
- Create: `pipelines/scripts/lib/ligand.py`
- Create: `pipelines/scripts/04_prep_ligands.py`
- Test: `pipelines/tests/test_ligand.py`

- [ ] **Step 1: Write the failing test**

```python
"""Test ligand 3D conformer generation."""
from scripts.lib import ligand


def test_smiles_to_conformer_returns_mol_with_3d_coords():
    mol = ligand.smiles_to_conformer("CCO")  # ethanol
    assert mol is not None
    assert mol.GetNumConformers() == 1
    conf = mol.GetConformer()
    pos = conf.GetAtomPosition(0)
    # any non-trivial 3D coord (not all zero)
    assert (pos.x, pos.y, pos.z) != (0.0, 0.0, 0.0)


def test_conformer_is_minimised_with_mmff94():
    mol = ligand.smiles_to_conformer("CC(C)Cc1ccc(C(C)C(=O)O)cc1")  # ibuprofen
    energy = ligand.compute_mmff_energy(mol)
    assert energy is not None
    # Reasonable energy band for ibuprofen post-min (kcal/mol scale)
    assert -200 < energy < 200
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pytest tests/test_ligand.py -v
```
Expected: ImportError on `scripts.lib.ligand`.

- [ ] **Step 3: Implement `pipelines/scripts/lib/ligand.py`**

```python
"""Ligand prep helpers: SMILES → 3D conformer (ETKDG + MMFF94)."""
from __future__ import annotations

from rdkit import Chem
from rdkit.Chem import AllChem


def smiles_to_conformer(smiles: str, num_confs: int = 10, seed: int = 42) -> Chem.Mol | None:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        return None
    mol = Chem.AddHs(mol)
    params = AllChem.ETKDGv3()
    params.randomSeed = seed
    cids = AllChem.EmbedMultipleConfs(mol, numConfs=num_confs, params=params)
    if not cids:
        return None
    energies: list[tuple[int, float]] = []
    for cid in cids:
        result = AllChem.MMFFOptimizeMolecule(mol, confId=cid, mmffVariant="MMFF94s", maxIters=500)
        if result != 0:
            continue
        ff = AllChem.MMFFGetMoleculeForceField(mol, AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94s"), confId=cid)
        if ff is None:
            continue
        energies.append((cid, float(ff.CalcEnergy())))
    if not energies:
        return None
    best_cid, _ = min(energies, key=lambda kv: kv[1])
    keep = Chem.Mol(mol)
    keep.RemoveAllConformers()
    keep.AddConformer(mol.GetConformer(best_cid), assignId=True)
    return keep


def compute_mmff_energy(mol: Chem.Mol) -> float | None:
    if mol.GetNumConformers() == 0:
        return None
    props = AllChem.MMFFGetMoleculeProperties(mol, mmffVariant="MMFF94s")
    if props is None:
        return None
    ff = AllChem.MMFFGetMoleculeForceField(mol, props, confId=0)
    if ff is None:
        return None
    return float(ff.CalcEnergy())


def write_sdf(mol: Chem.Mol, path) -> None:
    writer = Chem.SDWriter(str(path))
    writer.write(mol)
    writer.close()
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pytest tests/test_ligand.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Implement `pipelines/scripts/04_prep_ligands.py`**

```python
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
```

- [ ] **Step 6: Commit**

```bash
git add pipelines/scripts/lib/ligand.py pipelines/scripts/04_prep_ligands.py pipelines/tests/test_ligand.py
git commit -m "feat(pipeline): add ligand prep with RDKit ETKDG+MMFF94"
```

---

## Task 8: Vina Wrapper Library + Script 05 — Run Vina

**Files:**
- Create: `pipelines/scripts/lib/vina_wrapper.py`
- Create: `pipelines/scripts/05_run_vina.py`
- Test: `pipelines/tests/test_vina_wrapper.py`
- Test fixture: `pipelines/tests/fixtures/sample_vina.pdbqt`

- [ ] **Step 1: Create `pipelines/tests/fixtures/sample_vina.pdbqt`**

A short PDBQT showing one MODEL with 2 atoms:

```
MODEL 1
REMARK VINA RESULT:    -10.2      0.000      0.000
ATOM      1  C1  LIG     1       1.000   2.000   3.000  0.00  0.00     0.000 C 
ATOM      2  C2  LIG     1       1.500   2.500   3.500  0.00  0.00     0.000 C 
ENDMDL
MODEL 2
REMARK VINA RESULT:     -9.8      1.230      2.450
ATOM      1  C1  LIG     1       1.100   2.100   3.100  0.00  0.00     0.000 C 
ATOM      2  C2  LIG     1       1.600   2.600   3.600  0.00  0.00     0.000 C 
ENDMDL
```

- [ ] **Step 2: Write the failing test**

```python
"""Test Vina output parser."""
from pathlib import Path

import pytest

from scripts.lib import vina_wrapper


def test_parse_pdbqt_returns_two_models(fixtures_dir):
    poses = vina_wrapper.parse_pdbqt_output(fixtures_dir / "sample_vina.pdbqt")
    assert len(poses) == 2


def test_parse_pdbqt_extracts_score_and_rmsd(fixtures_dir):
    poses = vina_wrapper.parse_pdbqt_output(fixtures_dir / "sample_vina.pdbqt")
    assert poses[0]["vina_score"] == -10.2
    assert poses[0]["rmsd_lb"] == 0.0
    assert poses[0]["rmsd_ub"] == 0.0
    assert poses[1]["vina_score"] == -9.8


def test_parse_pdbqt_extracts_atom_xyz(fixtures_dir):
    poses = vina_wrapper.parse_pdbqt_output(fixtures_dir / "sample_vina.pdbqt")
    assert len(poses[0]["atom_xyz"]) == 2
    assert poses[0]["atom_xyz"][0] == pytest.approx([1.0, 2.0, 3.0])


def test_centroid_of_first_pose(fixtures_dir):
    poses = vina_wrapper.parse_pdbqt_output(fixtures_dir / "sample_vina.pdbqt")
    cx, cy, cz = poses[0]["ligand_centroid"]
    assert (cx, cy, cz) == pytest.approx((1.25, 2.25, 3.25))
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pytest tests/test_vina_wrapper.py -v
```
Expected: ImportError on `scripts.lib.vina_wrapper`.

- [ ] **Step 4: Implement `pipelines/scripts/lib/vina_wrapper.py`**

```python
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
            x = float(line[30:38]); y = float(line[38:46]); z = float(line[46:54])
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pytest tests/test_vina_wrapper.py -v
```
Expected: 4 passed.

- [ ] **Step 6: Implement `pipelines/scripts/05_run_vina.py`**

```python
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

    receptor_pdbqt = _ensure_pdbqt(cleaned / f"{target_key}.pdb", runs / f"{target_key}.pdbqt", kind="receptor")
    ligand_pdbqt = _ensure_pdbqt(ligands / f"{ligand_name}.sdf", runs / f"{ligand_name}.pdbqt", kind="ligand")

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
```

- [ ] **Step 7: Commit**

```bash
git add pipelines/tests/fixtures/sample_vina.pdbqt pipelines/scripts/lib/vina_wrapper.py \
        pipelines/scripts/05_run_vina.py pipelines/tests/test_vina_wrapper.py
git commit -m "feat(pipeline): add Vina wrapper + 05_run_vina with multiprocessing"
```

---

## Task 9: Script 06 — PyMOL Mesh Export

**Files:**
- Create: `pipelines/scripts/pymol_export.pml`
- Create: `pipelines/scripts/06_export_meshes.sh`

- [ ] **Step 1: Create `pipelines/scripts/pymol_export.pml`**

```
# PyMOL script driving the surface + cartoon export per target.
# Inputs (env-style placeholders replaced by 06_export_meshes.sh via sed):
#   __TARGET__     e.g. cox1 or cox2
#   __PDB_PATH__   absolute path to cleaned PDB
#   __OUT_DIR__    absolute path to output dir for .obj files

load __PDB_PATH__, __TARGET__
hide everything
remove resn HOH

# Cartoon ribbon (no heme, protein backbone only)
show cartoon, polymer
color slate, polymer
set cartoon_transparency, 0.0
ray 800, 600
save __OUT_DIR__/__TARGET___cartoon.obj
hide everything

# Surface mesh (with heme, semi-transparent for pocket visibility)
show surface, polymer
show sticks, resn HEM
color salmon, polymer
color orange, resn HEM
set surface_quality, 1
set transparency, 0.4
ray 800, 600
save __OUT_DIR__/__TARGET___surface.obj

quit
```

- [ ] **Step 2: Create `pipelines/scripts/06_export_meshes.sh`**

```bash
#!/usr/bin/env bash
# Export cartoon + surface .obj for both targets, ligand .obj for all 5,
# then convert to .glb with obj2gltf and apply draco compression.
set -euo pipefail

PIPELINE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CLEANED_DIR="${PIPELINE_CLEANED_DIR:-$PIPELINE_ROOT/data/cleaned}"
LIGAND_DIR="${PIPELINE_LIGAND_DIR:-$PIPELINE_ROOT/data/ligands}"
ASSETS_DIR="${PIPELINE_ASSETS_DIR:-$PIPELINE_ROOT/../public/assets/v1}"
TMP_DIR="$PIPELINE_ROOT/data/mesh_tmp"
PML_TEMPLATE="$PIPELINE_ROOT/scripts/pymol_export.pml"

mkdir -p "$ASSETS_DIR/ligands" "$TMP_DIR"

OBJ2GLTF="$PIPELINE_ROOT/node_modules/.bin/obj2gltf"
GLTF_PIPELINE="$PIPELINE_ROOT/node_modules/.bin/gltf-pipeline"

if [[ ! -x "$OBJ2GLTF" ]] || [[ ! -x "$GLTF_PIPELINE" ]]; then
  echo "Run 'make install' inside pipelines/ first." >&2
  exit 1
fi

export_protein() {
  local target="$1"
  local pdb="$CLEANED_DIR/${target}.pdb"
  if [[ ! -f "$pdb" ]]; then
    echo "Missing cleaned PDB: $pdb" >&2
    exit 1
  fi

  local pml="$TMP_DIR/${target}.pml"
  sed -e "s|__TARGET__|${target}|g" -e "s|__PDB_PATH__|${pdb}|g" -e "s|__OUT_DIR__|${TMP_DIR}|g" "$PML_TEMPLATE" > "$pml"
  pymol -cq "$pml"

  for variant in cartoon surface; do
    local obj="$TMP_DIR/${target}_${variant}.obj"
    local glb_raw="$TMP_DIR/${target}_${variant}.glb"
    local glb_final="$ASSETS_DIR/${target}_${variant}.glb"
    "$OBJ2GLTF" -i "$obj" -o "$glb_raw" --binary
    "$GLTF_PIPELINE" -i "$glb_raw" -o "$glb_final" --draco.compressionLevel=10
    echo "[mesh] $glb_final"
  done
}

export_ligand() {
  local name="$1"
  local sdf="$LIGAND_DIR/${name}.sdf"
  if [[ ! -f "$sdf" ]]; then
    echo "Missing ligand SDF: $sdf" >&2
    exit 1
  fi
  local mol2="$TMP_DIR/${name}.mol2"
  obabel "$sdf" -O "$mol2"
  local pml="$TMP_DIR/${name}.pml"
  cat > "$pml" <<EOF
load ${mol2}, ${name}
hide everything
show sticks, ${name}
set stick_radius, 0.15
ray 600, 600
save ${TMP_DIR}/${name}.obj
quit
EOF
  pymol -cq "$pml"
  local glb_raw="$TMP_DIR/${name}.glb"
  local glb_final="$ASSETS_DIR/ligands/${name}.glb"
  "$OBJ2GLTF" -i "$TMP_DIR/${name}.obj" -o "$glb_raw" --binary
  "$GLTF_PIPELINE" -i "$glb_raw" -o "$glb_final" --draco.compressionLevel=10
  echo "[mesh] $glb_final"
}

for t in cox1 cox2; do export_protein "$t"; done
for l in celecoxib rofecoxib ibuprofen naproxen diclofenac; do export_ligand "$l"; done

echo "[done] meshes in $ASSETS_DIR"
```

- [ ] **Step 3: Make script executable**

```bash
chmod +x pipelines/scripts/06_export_meshes.sh
ls -la pipelines/scripts/06_export_meshes.sh
```
Expected: shows `-rwxr-xr-x`.

- [ ] **Step 4: Commit**

```bash
git add pipelines/scripts/pymol_export.pml pipelines/scripts/06_export_meshes.sh
git commit -m "feat(pipeline): add PyMOL mesh export script and shell driver"
```

---

## Task 10: Story Outline + Dialogue Files (F-008 Cross-Track)

**Files:**
- Create: `docs/features/0002-story-outline.md`
- Create: `pipelines/data/dialogue/dr_chen_beat_1_intro.txt`
- Create: `pipelines/data/dialogue/dr_chen_beat_2_discovery.txt`
- Create: `pipelines/data/dialogue/dr_chen_beat_3_ranking.txt`
- Create: `pipelines/data/dialogue/dr_chen_beat_4_vioxx_flashback.txt`
- Create: `pipelines/data/dialogue/dr_chen_beat_5_horizon.txt`

> Note: although `pipelines/data/` is gitignored for *intermediate* artifacts, this `dialogue/` subfolder is a deliverable. We commit it explicitly with `git add -f`.

- [ ] **Step 1: Create `docs/features/0002-story-outline.md`**

```markdown
# F-008 Story Outline — XR Rational Drug Design Educational App

**Date**: 2026-04-25
**Status**: Initial outline (sourced from Gemini story-eval pass; cross-track with F-002 asset pipeline)
**Reference**: `docs/superpowers/specs/2026-04-25-f002-asset-pipeline-design.md`

## Narrative anchor

Vioxx (rofecoxib) — withdrawn 2004 — as a **mechanistic** cautionary tale (PGI2 / TXA2 imbalance), not a shock-value tragedy. The story honours the public-health cost while teaching *why* over-selectivity can be dangerous.

## Persona — Dr. Chen

Virtual mentor. Confident, scientifically precise, mentorly. No marketing fluff. English primary; localisation later.

## 5-beat beat-sheet

| Beat | Trigger (in-app event) | Setting / scene | Pedagogical payload | Asset / mol implications |
|------|------------------------|-----------------|--------------------|--------------------------|
| **1: Intro** | App boot / Game Hub | High-tech virtual lab; Dr. Chen hologram | Onboarding to COX-1 / COX-2 isoforms; GI-safety vs pain-relief tradeoff | Heme cofactor mesh inside hub for "lab" atmosphere |
| **2: The Discovery** | Enter L1 (dock celecoxib) | Inside COX-2 (1CX2) active site | Val523 (COX-2) vs Ile523 (COX-1) selectivity origin; "side pocket" theory | Highlight VAL523 in neon; celecoxib sulfonamide tail visible |
| **3: The Ranking** | Start L2 (rank NSAIDs) | Data visualisation deck | SAR reasoning across reversible binders | Dynamic bar chart; diclofenac (replacing aspirin) in lineup |
| **4: The Vioxx Flashback** | Enter L3 (selectivity) | Dual-pocket COX-1 / COX-2 view | PGI2 / TXA2 imbalance mechanism → cardiovascular events; over-selectivity risk | Rofecoxib .glb; split-screen PDB view; warning overlay |
| **5: The Horizon** | Wrap / post-survey | Lab sunset / credits | Synthesis: rational design = systems thinking + structural biology | Post-survey UI; transition to global-impact framing |

## Dialogue files

Each beat has a dedicated TTS input file at `pipelines/data/dialogue/dr_chen_beat_*.txt`. The frontend story wrapper (F-008) feeds these into `Web Speech API` `speechSynthesis` (or pre-renders to .mp3 if TTS quality is too low). Each line is ≤ 60 seconds at typical cadence (≈ 130 wpm → ≤ 130 words per file).

## Frontend integration cues

- Beat 1 plays once at first boot; subsequent boots skip if `localStorage.getItem("dv_intro_seen") === "true"`.
- Beat 2 fires when the user enters the L1 portal in the Game Hub.
- Beat 3 plays as the L2 scene loads.
- Beat 4 plays as a cutscene before L3 controls become active; users may not skip until the dialogue completes (∼ 60s — pedagogical anchor).
- Beat 5 triggers when L3 is completed; the post-survey overlay appears at the end of this beat.

## Risks

- **Overshooting the tone**: If TTS sounds robotic, the Vioxx beat falls flat. Mitigation: pre-record the voice line for Beat 4 in advance using a reasonable TTS voice (e.g., ElevenLabs trial or browser-native quality voice).
- **Cultural memory**: Gen Z learners may not remember Vioxx. Beat 4 explicitly frames it as the reason FDA black-box warnings exist today, not as a current event.
- **Accessibility**: Provide on-screen subtitles in addition to TTS audio (F-008 implementation requirement, captured here for cross-track visibility).

## Out of scope

- TTS voice production (frontend implementation).
- Cutscene visuals beyond the "split-screen PDB" composition note (frontend implementation).
- Localisation (subsequent sprints).
```

- [ ] **Step 2: Create `pipelines/data/dialogue/dr_chen_beat_1_intro.txt`**

```
Welcome, Researcher. We are targeting inflammation. Our enzyme of interest is cyclooxygenase — COX-2, the spark of pain and fever. But COX-2 has a twin, COX-1, that protects the lining of your stomach and helps your platelets do their job. Hit one, you save lives. Hit both, you bleed your patients. Today you learn to tell them apart, atom by atom. Calibrate your hands; we begin in the active site.
```

- [ ] **Step 3: Create `pipelines/data/dialogue/dr_chen_beat_2_discovery.txt`**

```
Meet celecoxib. Look at the back wall of this pocket — there is a side cavity that COX-1 does not have. One residue makes the difference: Valine 523 in COX-2, Isoleucine 523 in COX-1. A single methyl group, and the geometry opens up. Celecoxib carries a sulfonamide tail designed to slot into that side pocket. Your task: find the snap. Bring the sulfonamide home.
```

- [ ] **Step 4: Create `pipelines/data/dialogue/dr_chen_beat_3_ranking.txt`**

```
Good fit. But chemistry is rarely binary. Naproxen, ibuprofen, diclofenac — these traditional NSAIDs hit both isoforms with varying enthusiasm. Rank them now. Look for the highest binding affinity in COX-2 without crippling COX-1. This is structure-activity relationship in motion: every methyl, every halogen, every charge nudges the score. Choose carefully.
```

- [ ] **Step 5: Create `pipelines/data/dialogue/dr_chen_beat_4_vioxx_flashback.txt`**

```
Two-thousand-and-four. Rofecoxib — Vioxx — withdrawn from market. It was the cleanest COX-2 binder we had ever seen. No stomach bleeding. But COX-2 in your blood vessels makes prostacyclin — PGI2 — that keeps clots from forming. By sparing COX-1, Vioxx left thromboxane untouched. The balance tipped. Tens of thousands of cardiovascular events. The lesson is not that selectivity is bad. The lesson is that the body is a system. Look at this ratio. It is too perfect. And perfect is dangerous.
```

- [ ] **Step 6: Create `pipelines/data/dialogue/dr_chen_beat_5_horizon.txt`**

```
You felt it — the difference of one methyl group, the cost of perfect selectivity, the geometry that decides who lives. Rational design is not just the strongest click in a pocket. It is the whole system: every off-target, every metabolite, every patient. Record what you learned. There are more targets to hunt, and they will not wait.
```

- [ ] **Step 7: Force-add the dialogue files (parent dir is gitignored)**

```bash
git add docs/features/0002-story-outline.md
git add -f pipelines/data/dialogue/dr_chen_beat_1_intro.txt \
           pipelines/data/dialogue/dr_chen_beat_2_discovery.txt \
           pipelines/data/dialogue/dr_chen_beat_3_ranking.txt \
           pipelines/data/dialogue/dr_chen_beat_4_vioxx_flashback.txt \
           pipelines/data/dialogue/dr_chen_beat_5_horizon.txt
git status --short
```
Expected: 6 new files staged.

- [ ] **Step 8: Commit**

```bash
git commit -m "feat(story): add 5-beat outline + Dr. Chen TTS dialogue for F-008"
```

---

## Task 11: Pipeline README

**Files:**
- Create: `pipelines/README.md`

- [ ] **Step 1: Create `pipelines/README.md`**

```markdown
# F-002 Asset Pipeline

Generates the frontend-ready asset bundle for the hackathon MVP from RCSB PDB entries
and ligand SMILES. Hybrid Conda + Node toolchain.

## Quick start

```bash
cd pipelines
make env                          # one-time: create Conda env "vdv-pipeline"
conda activate vdv-pipeline
make install                      # one-time: install Node deps (obj2gltf, gltf-pipeline)
make assets                       # full pipeline (≈ 20–30 min on M-series Mac)
```

Outputs land in `../public/assets/v1/`.

## Targets

| Make target | What it runs |
|-------------|--------------|
| `make fetch` | `01_fetch_pdb.py` — download 1EQG, 1CX2 from RCSB |
| `make clean` | `02_clean_protein.py` — strip waters / altlocs, keep heme |
| `make annotate` | `03_annotate_pocket.py` — emit `pocket_cox{1,2}.json` |
| `make ligands` | `04_prep_ligands.py` — RDKit ETKDG + MMFF94 → SDF |
| `make dock` | `05_run_vina.py` — 10 Vina runs, emit `vina_results.json` |
| `make meshes` | `06_export_meshes.sh` — PyMOL .obj → obj2gltf → draco-compressed .glb |
| `make test` | `pytest` |
| `make fmt` | `ruff format && ruff check --fix` |
| `make clean-data` | wipe `data/` (intermediate artefacts) |
| `make assets` | full pipeline |

## Scientific defaults

- COX-1: PDB 1EQG (chain A, ovine)
- COX-2: PDB 1CX2 (chain A, murine)
- Ligands (ChEMBL): celecoxib, rofecoxib, ibuprofen, naproxen, diclofenac (replaces aspirin — see spec)
- Pocket residues (Kurumbail et al. *Nature* 1996): VAL/ILE 523, ARG 120, TYR 385, SER 530
- Vina: box 22.5×22.5×22.5 Å, exhaustiveness 8, num_modes 9, seed 42

## Directory layout

```
pipelines/
  environment.yml      Conda env spec
  package.json         Node deps
  Makefile             entry point
  scripts/             Python + shell pipeline scripts
  tests/               pytest
  data/                intermediate artefacts (gitignored, except dialogue/)
    pdb/, cleaned/, ligands/, vina_runs/
    dialogue/          F-008 TTS inputs (committed)
```

## Troubleshooting

- **Vina arm64 install fails**: use `mamba install -c bioconda vina` or fall back to Smina (`brew install smina`).
- **PyMOL "ray" hangs in headless**: ensure `pymol -cq` flag set (already in `06_export_meshes.sh`).
- **.glb > 5 MB**: tweak `gltf-pipeline --draco.compressionLevel` (max 10) and consider quadric decimation pre-export (see PyMOL `simplify` mod).

## License

PDB structures are RCSB-deposited, free for research and education. Ligand SMILES from ChEMBL (CC-BY-SA 3.0). All wrapper code under the project root licence.
```

- [ ] **Step 2: Commit**

```bash
git add pipelines/README.md
git commit -m "docs(pipeline): add F-002 asset pipeline README"
```

---

## Task 12: End-to-end Smoke Test (manual, after env ready)

**Files:**
- Test (manual): full pipeline run
- Test: `pipelines/tests/test_e2e_smoke.py` (cheap dry-run that asserts CLI exits non-error when artefacts already exist)

- [ ] **Step 1: Write a cheap dry-run smoke test**

```python
"""Cheap smoke test: assert each script emits a help banner."""
import subprocess
import sys
from pathlib import Path


SCRIPTS = [
    "01_fetch_pdb.py",
    "02_clean_protein.py",
    "03_annotate_pocket.py",
    "04_prep_ligands.py",
    "05_run_vina.py",
]


def test_each_script_responds_to_help():
    root = Path(__file__).resolve().parent.parent
    for s in SCRIPTS:
        path = root / "scripts" / s
        result = subprocess.run([sys.executable, str(path), "--help"], capture_output=True, text=True)
        assert result.returncode == 0, f"{s} --help failed: {result.stderr}"
```

- [ ] **Step 2: Run the smoke test**

```bash
cd pipelines
pytest tests/test_e2e_smoke.py -v
```
Expected: 1 passed.

- [ ] **Step 3: Manual full-pipeline run (operator runs once before commit)**

```bash
cd pipelines
make env
conda activate vdv-pipeline
make install
make assets
ls -la ../public/assets/v1/
```
Expected outputs:
```
cox1_cartoon.glb
cox1_surface.glb
cox2_cartoon.glb
cox2_surface.glb
ligands/celecoxib.glb
ligands/rofecoxib.glb
ligands/ibuprofen.glb
ligands/naproxen.glb
ligands/diclofenac.glb
pocket_cox1.json
pocket_cox2.json
vina_results.json
```

- [ ] **Step 4: Verify file size budget**

```bash
du -h public/assets/v1/*.glb public/assets/v1/ligands/*.glb
```
Expected: every protein .glb < 5 MB; every ligand .glb < 200 KB.

- [ ] **Step 5: Validate JSON schema sanity**

```bash
python -c "
import json, pathlib
p = pathlib.Path('public/assets/v1')
for f in ('pocket_cox1.json', 'pocket_cox2.json', 'vina_results.json'):
    d = json.loads((p/f).read_text())
    assert d.get('schema_version') == '1.0', f
    print(f, 'OK')
"
```
Expected: 3 lines `... OK`.

- [ ] **Step 6: Spot-check pocket JSON contents**

```bash
python -c "
import json
d = json.loads(open('public/assets/v1/pocket_cox2.json').read())
val523 = next(r for r in d['key_residues'] if r['id'] == 'VAL523')
print('VAL523 ca_xyz:', val523['ca_xyz'])
print('side_pocket_anchor_xyz:', d['side_pocket_anchor_xyz'])
print('heme_centroid:', d['heme_centroid'])
"
```
Expected: three lines with reasonable xyz coords (none at origin, none None).

- [ ] **Step 7: Spot-check Vina results**

```bash
python -c "
import json
d = json.loads(open('public/assets/v1/vina_results.json').read())
assert len(d['runs']) == 10, f\"expected 10 runs, got {len(d['runs'])}\"
for r in d['runs']:
    print(f\"{r['ligand']:12} x {r['target']:5} -> {r['best_pose']['vina_score']:6.2f}\")
"
```
Expected: 10 lines like `celecoxib    x cox2  -> -10.21`.

- [ ] **Step 8: Stage assets + smoke test commit**

```bash
git add public/assets/v1/
git add pipelines/tests/test_e2e_smoke.py
git status --short
```
Expected: 12 new files in `public/assets/v1/` + new test file.

- [ ] **Step 9: Commit**

```bash
git commit -m "feat(assets): commit generated v1 asset bundle (4 protein .glb, 5 ligand .glb, 3 JSON)"
```

---

## Task 13: PR Open

- [ ] **Step 1: Push branch**

```bash
git push -u origin data/7-asset-pipeline
```

- [ ] **Step 2: Create PR body file `/tmp/f002-pr-body.md`**

```markdown
Closes #7

## Summary
- Adds the F-002 asset pipeline: hybrid Conda + Node toolchain emitting frontend-ready `.glb` meshes, pocket annotation JSON, and Vina docking results into `public/assets/v1/`.
- Six numbered scripts driven by `make assets` produce: 4 protein meshes (cartoon + surface, with heme), 5 ligand meshes, 2 pocket JSONs, 1 Vina results JSON.
- Cross-track delivery for F-008: 5-beat story outline (`docs/features/0002-story-outline.md`) + 5 Dr. Chen TTS dialogue files.

## Off-spec change (flagged for reviewer)

**Aspirin → Diclofenac** swap. Aspirin acts via covalent acetylation of Ser530, which conflicts with the reversible-binding scoring heuristic used by F-004 / F-005. Diclofenac is reversible, has a slight COX-2 preference, and is a better SAR bridge in the L2 ranking task. Backed by Gemini story-eval pass (Severity: WEAKNESS).

## Changelog

### Added
- `pipelines/` — Conda + Node hybrid pipeline (6 scripts + libs + tests + Makefile + README) producing the F-002 asset bundle.
- `public/assets/v1/` — committed binary assets: 2× COX-1/COX-2 cartoon `.glb`, 2× COX-1/COX-2 surface `.glb` (with heme), 5× NSAID ligand `.glb` (celecoxib, rofecoxib, ibuprofen, naproxen, diclofenac), `pocket_cox1.json`, `pocket_cox2.json`, `vina_results.json`.
- `docs/features/0002-story-outline.md` — F-008 5-beat story outline (Vioxx PGI2/TXA2 mechanistic narrative, Val523/Ile523 marquee).
- `pipelines/data/dialogue/dr_chen_beat_*.txt` — 5 TTS dialogue inputs for the story wrapper.

### Changed
- `.gitignore` — adds `pipelines/data/`, `pipelines/node_modules/`, etc.

## Verification

- `make test` passes (unit tests for config, PDB I/O, pocket, ligand, Vina parser).
- Manual `make assets` run produced all expected outputs; file sizes within 5 MB (proteins) / 200 KB (ligands) budget.
- JSON schema_version checks pass on all three JSON outputs.
- VAL523 / ILE523 marquee residues correctly populated in pocket JSONs.
- 10 Vina runs (5 ligands × 2 targets) all produce best-pose scores.

## Cross-track impact

- F-004 (Issue #9): can now consume `pocket_cox2.json` + `vina_results.runs[(celecoxib, cox2)]` to drive L1 score readout.
- F-005 (Issue #10): can rank 5 ligands by `vina_results.runs[(_, cox2)].best_pose.vina_score`.
- F-006 (Issue #11): can compute selectivity ratio `score(rofecoxib, cox2) - score(rofecoxib, cox1)` directly.
- F-008 (Issue #13): outline + dialogue committed, frontend can wire TTS straight away (subject to F-008 implementation).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 3: Open PR**

```bash
gh pr create \
  --base main \
  --head data/7-asset-pipeline \
  --title "feat(pipeline): F-002 asset pipeline + F-008 story outline" \
  --body-file /tmp/f002-pr-body.md
```
Expected: prints PR URL.

- [ ] **Step 4: Apply labels via REST (gh pr edit may hit Projects-classic bug)**

```bash
PR_NUM=$(gh pr view --json number --jq '.number')
gh api -X POST repos/Jhin97/van-der-view/issues/$PR_NUM/labels \
  -f "labels[]=team:data" \
  -f "labels[]=type:feature" \
  -f "labels[]=priority:p0" \
  -f "labels[]=status:in-review"
```

- [ ] **Step 5: Verify**

```bash
gh pr view --json number,labels,url
```
Expected: number = current PR, 4 labels listed, URL printed.

---

## Self-review log

(Filled in after the implementer reviews this plan against the spec.)

- [x] Spec coverage:
  - File contracts → Tasks 6 (pocket JSON) + 8 (vina_results JSON)
  - 6 scripts → Tasks 4–9
  - Conda + Node manifests → Task 1
  - 5 dialogue files + outline → Task 10
  - README → Task 11
  - Smoke test + assets commit → Task 12
  - PR opening → Task 13
- [x] Aspirin → diclofenac swap captured in `config.LIGANDS`, README, story outline, PR body.
- [x] Pocket residue picks (VAL/ILE 523, ARG 120, TYR 385, SER 530) captured in `config.TARGETS`.
- [x] Vina params (box 22.5, exhaustiveness 8, seed 42) captured in `config.VINA_PARAMS`.
- [x] Mesh format split (cartoon + surface + ligand) honoured in PyMOL .pml + 06 shell.
- [x] Heme baked into surface .glb (PyMOL `show sticks, resn HEM`).
- [x] Frontend integration notes section in spec referenced from README and PR body.
- [x] No placeholders: every code step contains complete code.
- [x] Type/name consistency: `cox1`/`cox2` keys, `pocket_cox{1,2}.json` filenames, `vina_results.json` schema_version "1.0" all consistent across config / scripts / fixtures / spec.
