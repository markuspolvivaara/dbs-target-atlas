#!/usr/bin/env bash
# Rebuild every web asset from the source atlases.
#   1. fetch the needed files from the Lead-DBS data archive (range requests, ~250 MB)
#      and the HCP-1065 tract archive (590 MB, once)
#   2. build meshes, tracts, T1 volumes, coordinates, white-matter tracts
#   3. compress GLBs (quantization + meshopt)
#   4. write manifest.json and ATTRIBUTION.md
#   5. validate geometry against the sources (exit 1 on failure)
# Requires: Python >= 3.10 with pipeline/requirements.txt, Node >= 20 with `npm install` done.
set -euo pipefail
cd "$(dirname "$0")/.."
PY="${PYTHON:-pipeline/.venv/bin/python}"
"$PY" -I pipeline/fetch_sources.py
"$PY" -I -W ignore pipeline/build.py
node pipeline/compress.mjs
"$PY" -I -W ignore pipeline/manifest.py
"$PY" -I -W ignore pipeline/validate.py
