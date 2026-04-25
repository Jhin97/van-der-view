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
