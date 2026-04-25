"""Smoke test for 01_fetch_pdb (uses subprocess to test as CLI)."""
import subprocess
import sys
from pathlib import Path

import pytest


SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "01_fetch_pdb.py"


def test_script_exists_and_is_invocable():
    assert SCRIPT.exists()
    result = subprocess.run(
        [sys.executable, str(SCRIPT), "--help"],
        capture_output=True,
        text=True,
        cwd=str(SCRIPT.parent.parent),
    )
    assert result.returncode == 0
    assert "Usage" in result.stdout or "usage" in result.stdout


@pytest.mark.network
def test_script_fetches_1cx2(tmp_path, monkeypatch):
    """Network test — only runs when --network is passed."""
    monkeypatch.setenv("PIPELINE_PDB_DIR", str(tmp_path))
    result = subprocess.run(
        [sys.executable, str(SCRIPT)],
        capture_output=True,
        text=True,
        env={**__import__("os").environ},
        cwd=str(SCRIPT.parent.parent),
    )
    assert result.returncode == 0
    assert (tmp_path / "1CX2.pdb").exists()
    assert (tmp_path / "1EQG.pdb").exists()
