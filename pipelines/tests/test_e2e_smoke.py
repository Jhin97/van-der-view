"""Cheap smoke test: assert each script emits a help banner.

Requires biopython and rdkit to be importable (e.g. the vdv-pipeline conda
env, or any env that has those packages).  When run via pytest in such an env
the test passes; when deps are absent the test is skipped with a clear message.
"""
import subprocess
import sys
from pathlib import Path

import pytest


SCRIPTS = [
    "01_fetch_pdb.py",
    "02_clean_protein.py",
    "03_annotate_pocket.py",
    "04_prep_ligands.py",
    "05_run_vina.py",
]


try:
    import Bio  # noqa: F401
    import rdkit  # noqa: F401
except ImportError as _e:
    pytest.skip(
        f"Pipeline dependency not installed ({_e}); "
        "activate the vdv-pipeline conda env to run this test.",
        allow_module_level=True,
    )


def test_each_script_responds_to_help():
    root = Path(__file__).resolve().parent.parent
    for s in SCRIPTS:
        path = root / "scripts" / s
        result = subprocess.run(
            [sys.executable, str(path), "--help"],
            capture_output=True,
            text=True,
            cwd=str(root),
        )
        assert result.returncode == 0, f"{s} --help failed: {result.stderr}"
