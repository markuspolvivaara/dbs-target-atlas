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
# skull base section (needs Blender in .tools/ or BLENDER=/path/to/blender, and the Z-Anatomy package in pipeline/data/raw/zanatomy)
"${BLENDER:-.tools/Blender.app/Contents/MacOS/Blender}" --factory-startup -b -noaudio \
    pipeline/data/raw/zanatomy/Z-Anatomy/Startup.blend --python pipeline/skullbase_export.py
"$PY" -I -W ignore pipeline/skullbase_build.py
node pipeline/compress.mjs
"$PY" -I -W ignore pipeline/skullbase_build.py finalize
# cortex section (Destrieux labels on the Lead-DBS template surface; definition texts read from the Z-Anatomy file in Blender)
"${BLENDER:-.tools/Blender.app/Contents/MacOS/Blender}" --factory-startup -b -noaudio \
    pipeline/data/raw/zanatomy/Z-Anatomy/Startup.blend --python pipeline/cortex_texts.py
"$PY" -I -W ignore pipeline/cortex_build.py
node pipeline/compress.mjs cortex
"$PY" -I -W ignore pipeline/cortex_build.py finalize
