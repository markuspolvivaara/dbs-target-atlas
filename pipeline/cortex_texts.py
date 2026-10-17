"""Export the Z-Anatomy definition texts the cortex section uses (run inside Blender).

  blender --factory-startup -b -noaudio pipeline/data/raw/zanatomy/Z-Anatomy/Startup.blend --python pipeline/cortex_texts.py

Writes pipeline/data/build/cortex/ztexts.json: {text name: raw text} for every name in
cortex_labels.ZTEXT / ZTEXT_LOBES. The texts are Wikipedia leads shipped with Z-Anatomy (CC BY-SA 3.0).
"""
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import cortex_labels as CL  # noqa: E402

names = {v[0] for v in CL.ZTEXT.values() if v} | {v for v in CL.ZTEXT_LOBES.values() if v}
out = {}
for n in sorted(names):
    t = bpy.data.texts.get(n)
    if t is None:
        raise SystemExit(f"Z-Anatomy has no text named {n!r}")
    out[n] = t.as_string()
dst = ROOT / "data" / "build" / "cortex" / "ztexts.json"
dst.parent.mkdir(parents=True, exist_ok=True)
dst.write_text(json.dumps(out, indent=1, ensure_ascii=False))
print(f"cortex texts: {len(out)} written to {dst}")
