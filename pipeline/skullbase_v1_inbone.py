"""Skull base v1 (the Z-Anatomy model): every vessel and nerve measured against the model's bones.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_inbone.py
  (last of v1's steps before compress.mjs skullbase and skullbase_build.py finalize: it reads the tubes as built)

Z-Anatomy draws its vessels and nerves as curves and its bones as meshes, each on its own, and its bones have few of the
canals and grooves those curves run in: there is no carotid canal through the petrous bone, no facial canal, no holes in
the cribriform plate, and the dural sinuses' grooves are shallow. A curve then runs through the bone mesh (the audit's
finding MC-11). The project moves a few of them (the cortical arteries with the cortex, the hypoglossal nerve into its
canal); the rest stay as Z-Anatomy has them, and this step measures how much of each lies in bone, so that its card can
say so.

Each bone mesh is rasterised on a GRID_MM grid (its inside by the parity of crossings along each axis, two of three
agreeing: skullbase_v1_xii.bone_inside), with the depth below its surface by a distance transform; each tube's surface
vertices are read against every bone. A structure's entry in the manifest gets

  inBone: {share: the fraction of its surface vertices more than DEEP_MM inside a bone mesh,
           deepestMm: the deepest of them, bones: the bones concerned, most vertices first}

where share is at least NOTE_SHARE or the deepest vertex at least NOTE_DEEP_MM; the others get none. (A tube lying on
a bone's surface has half of each ring under it: hence DEEP_MM, about a thin tube's radius.)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from glb import read_glb_full  # noqa: E402
from skullbase_v1_xii import bone_inside  # noqa: E402

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"
GRID_MM = 0.4
DEEP_MM = 0.5
NOTE_SHARE = 0.05
NOTE_DEEP_MM = 2.0


def measure(tubes: dict[str, np.ndarray], bones: dict) -> dict:
    """{name: {share, deepestMm, bones}} for every tube (its surface vertices) against every bone mesh."""
    depth = {n: np.zeros(len(p)) for n, p in tubes.items()}
    where: dict[str, dict[str, int]] = {n: {} for n in tubes}
    for bn, b in bones.items():
        if bn.startswith("Sinus of"):          # (the paranasal sinuses' own meshes: air)
            continue
        m = trimesh.Trimesh(np.array(b["verts"], float), np.array(b["tris"], int), process=True)
        solid, lo = bone_inside(np.asarray(m.vertices), np.asarray(m.faces), GRID_MM)
        dep = ndimage.distance_transform_edt(solid) * GRID_MM
        hi = lo + (np.array(solid.shape) - 1) * GRID_MM
        base = bn.split(".")[0]
        for n, p in tubes.items():
            ok = (p >= lo).all(1) & (p <= hi).all(1)
            if not ok.any():
                continue
            d = ndimage.map_coordinates(dep, ((p[ok] - lo) / GRID_MM).T, order=1, mode="constant")
            if (d > DEEP_MM).any():
                where[n][base] = where[n].get(base, 0) + int((d > DEEP_MM).sum())
            depth[n][ok] = np.maximum(depth[n][ok], d)
    return {n: {"share": round(float((depth[n] > DEEP_MM).mean()), 3), "deepestMm": round(float(depth[n].max()), 1),
                "bones": sorted(where[n], key=lambda k: (-where[n][k], k))} for n in tubes}


def main() -> int:
    ex = json.loads((BUILD / "export.json").read_text())
    p = GEN / "sb-manifest.json"
    man = json.loads(p.read_text())
    tubes = {}
    for it in man["structures"]:
        f = BUILD / (it["id"] + ".glb")
        if it["type"] == "tube" and not it.get("forView") and not it.get("replaces") and f.exists():
            tubes[it["id"]] = np.vstack([nd["positions"] for nd in read_glb_full(f).values()])
    rep = measure(tubes, ex["bones"])
    noted = 0
    for it in man["structures"]:
        it.pop("inBone", None)
        r = rep.get(it["id"])
        if r and (r["share"] >= NOTE_SHARE or r["deepestMm"] >= NOTE_DEEP_MM):
            it["inBone"] = r
            noted += 1
    p.write_text(json.dumps(man, indent=1, ensure_ascii=False))
    (BUILD / "inbone.json").write_text(json.dumps({"params": {"gridMm": GRID_MM, "deepMm": DEEP_MM, "noteShare": NOTE_SHARE,
                                                              "noteDeepMm": NOTE_DEEP_MM}, "tubes": rep}, indent=1))
    names = {it["id"]: it["name"] for it in man["structures"]}
    for sid, r in sorted(rep.items(), key=lambda kv: -kv[1]["share"]):
        if r["share"] >= NOTE_SHARE or r["deepestMm"] >= NOTE_DEEP_MM:
            print(f"{names[sid]:58s} {100 * r['share']:5.1f} % of its surface over {DEEP_MM} mm inside bone, deepest {r['deepestMm']:4.1f} mm  {r['bones']}")
    print(f"v1 in bone: {len(rep)} tubes measured, {noted} noted on their cards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
