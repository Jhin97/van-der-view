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
