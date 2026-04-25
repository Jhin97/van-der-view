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
