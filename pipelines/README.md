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
