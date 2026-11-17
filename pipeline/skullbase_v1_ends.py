"""Skull base v1 (the Z-Anatomy model): a vessel that runs on down the spinal cord, cut where the drawn medulla is cut.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_ends.py
  (after skullbase_v1_vessels.py, the last step that may write the vessel's tube; then
   node pipeline/compress.mjs skullbase <the file it names> and skullbase_build.py finalize)

Z-Anatomy's anterior spinal artery is cropped to the head, but the medulla this model draws is cut a little higher: the
artery ran 2 mm past the cut, into empty space (the model has no spinal cord). vessel_end.py finds the medulla's cut end
as a plane and cuts the artery's tube there, as skullbase_v3_clearance.py does on Skull base v3 (the owner's decision of
17 November 2026, when the far lateral view began to draw the artery).

The tube is cut in its own file (its stamp, if a step has stamped it, kept); the item's centroid moves by as much as the
mean of the tube's points did; its card says so. Run again, it finds nothing past the cut and changes nothing. Writes
the tube, v1's manifest and the step's record.
"""
from __future__ import annotations

import json
import struct
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import vessel_end as VE  # noqa: E402
from glb import TRIANGLES, read_glb_full, write_glb  # noqa: E402

BUILD = ROOT / "data" / "build"
GEN = ROOT.parent / "src" / "data" / "generated"


def extras(f: Path) -> dict:
    """The file's own extras (its id; a stamp a step has left on it)."""
    b = f.read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n]).get("extras") or {}


def write(f: Path, nodes: dict, ex: dict) -> None:
    import vascular_build as VB
    out = []
    for s, nd in nodes.items():
        node = {"name": s, "positions": nd["positions"], "normals": VB.normals(nd["positions"], nd["indices"]),
                "indices": nd["indices"], "mode": TRIANGLES}
        if nd["targets"]:
            node["targets"] = [{"name": t["name"], "positions": t["positions"], "normals": np.zeros_like(nd["positions"])} for t in nd["targets"]]
        out.append(node)
    write_glb(f, out, ex)


def check(by: dict) -> list[tuple[bool, str]]:
    """None of such a vessel lies past the medulla's cut end."""
    c0, n, _ = VE.end_plane(read_glb_full(BUILD / by["Medulla oblongata"]["file"].replace("assets/", "")))
    out = []
    for name in VE.VESSELS:
        if name in by:
            nodes = read_glb_full(BUILD / by[name]["file"].replace("assets/", ""))
            past = max(float(((nd["positions"] - c0) @ n).max()) for nd in nodes.values())
            out.append((past <= VE.PAST_MM, f"{name}: {max(past, 0.0):.1f} mm past the medulla's cut end"))
    return out


def main() -> int:
    p = GEN / "sb-manifest.json"
    man = json.loads(p.read_text())
    by = {it["name"]: it for it in man["structures"] if not it.get("pushedFrom")}
    c0, n, plane = VE.end_plane(read_glb_full(BUILD / by["Medulla oblongata"]["file"].replace("assets/", "")))
    rep = {}
    for name in VE.VESSELS:
        it = by.get(name)
        if it is None:
            continue
        f = BUILD / it["file"].replace("assets/", "")
        nodes = read_glb_full(f)
        before = {s: nd["positions"].mean(0) for s, nd in nodes.items()}
        cut = VE.trim(nodes, c0, n)
        if not any(r["pointsPast"] for r in cut.values()):
            continue
        write(f, nodes, extras(f))
        for s, r in cut.items():
            if r["pointsPast"] and s in it.get("centroid", {}):
                it["centroid"][s] = np.round(np.array(it["centroid"][s]) + nodes[s]["positions"].mean(0) - before[s], 2).tolist()
        if VE.NOTE not in it["derivation"]:
            it["derivation"] += VE.NOTE
        rep[name] = {"cut": plane, **cut, "file": f.name}
    if rep:
        p.write_text(json.dumps(man, indent=1, ensure_ascii=False))
        from modifications import record
        record("sb", "skullbase_v1_ends", "a vessel that runs on down the spinal cord, which the model does not draw, cut where the drawn medulla is cut",
               list(rep), {"vessels": list(VE.VESSELS), "pastMm": VE.PAST_MM}, rep,
               {"check": "skullbase_v1_ends.check: none of it past the medulla's cut end"})
    print(json.dumps(rep, indent=1) if rep else "nothing past the medulla's cut end")
    bad = [msg for ok, msg in check(by) if not ok]
    print("still past it:", bad or "none")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
