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
