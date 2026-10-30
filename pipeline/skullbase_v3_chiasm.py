"""Skull base v3's optic chiasm, drawn by rule where the fitted model puts it, with the optic nerves joining it and the
optic tracts leaving it.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_chiasm.py
  (after skullbase_v3_endonasal.py, before skullbase_v3_tumours.py; then compress.mjs skullbase-v3 and finalize)

Skull base v2 carries the Z-Anatomy chiasm onto this CT as a rounded block, and v3 routes each optic nerve on to the
midline in front of it, so that the two nerves met at a point and the block sat behind them. Here the chiasm is drawn
instead as one flat crossing:

  * where: the fitted block's centre, its plane (the block's least axis is the plane's normal) and its length front to
    back along the plane (the fitted model's);
  * how big: CHIASM_WIDTH_MM across and CHIASM_HEIGHT_MM thick (Mncube 2019: the mean width and height on coronal MRI
    in 80 adults);
  * its shape: two bands crossing in the plane, each from where one optic nerve reaches the chiasm's front edge to the
    other side's back corner (the tract's start), CHIASM_BAND of the nerve's width wide, and a central body
    (CHIASM_BODY of the width and length) joining them; the cross-section flattened to the height. The bands are the
    drawing's (illustrative): what crosses where inside the human chiasm is not settled.

Each optic nerve (v3's route through its canal) is kept out to where it lies a band's half-width inside the chiasm's
width from the midline, then joins the chiasm's front corner in a short curve, ending CHIASM_INTO_MM inside its front
edge, its radius tapering along the curve to the chiasm's half-height, instead of running on to the midline (written as
tb_optic_nerve_ii.chiasm.glb, the route's own file untouched). The optic tracts'
first TRACT_MM (illustrative) leave the back corners backwards and outwards at TRACT_ANGLE_DEG from the midline in the
plane (illustrative), as wide as the nerves.

Writes v3's build (tb_optic_chiasm.glb, tb_optic_tract.glb, tb_optic_nerve_ii.chiasm.glb, chiasm_items.json) and merges
the items into v3's manifest (the fitted block, sb_optic_chiasm, then left out).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy import ndimage
from skimage import measure

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_v3_cavernous as CAV  # noqa: E402
from glb import TRIANGLES, read_glb_full, write_glb  # noqa: E402

REPO = ROOT.parent
DATA = ROOT / "data" / "build"
V3_BUILD = DATA / "skullbase-v3"
CT_BUILD = DATA / "skullbase-ct"
GEN = REPO / "src" / "data" / "generated"
CH_ITEMS = V3_BUILD / "chiasm_items.json"

CHIASM_WIDTH_MM = 13.63     # Mncube 2019: mean width on coronal MRI (80 adults; range 11.13-16.92)
CHIASM_HEIGHT_MM = 2.26     # ... and mean height (range 1.54-3.38)
CHIASM_BAND = 1.0           # each crossing band as wide as the optic nerve drawn here
CHIASM_BODY = (0.62, 0.55)  # the central body: this share of the width and of the length (illustrative)
CHIASM_INTO_MM = 1.5        # a nerve runs this far into the chiasm's front corner ...
JOIN_OUT_MM = 3.0           # ... turning in to it from where its route lies this much further from the midline
TRACT_MM = 12.0             # the optic tracts' first part drawn (illustrative)
TRACT_ANGLE_DEG = 40.0      # ... backwards and outwards at this angle from the midline, in the chiasm's plane (illustrative)
GRID = 0.2
REPLACED = "sb_optic_chiasm"


def frame() -> dict:
    """The fitted chiasm's centre, axes (lateral x, forwards along its plane, its normal) and length along its plane."""
    ch = read_glb_full(CT_BUILD / "sb_optic_chiasm.glb")
    V = np.vstack([n["positions"] for n in ch.values()])
    c = V.mean(0)
    w, U = np.linalg.eigh((V - c).T @ (V - c))
    n = U[:, 0]                             # the least axis: the plane's normal
    n = n if n[2] > 0 else -n               # (up)
    x = np.array([1.0, 0.0, 0.0])
    x = x - (x @ n) * n
    x /= np.linalg.norm(x)
    f = np.cross(n, x)                      # forwards along the plane
    f = f if f[1] > 0 else -f
    t = (V - c) @ f
    return {"c": c, "x": x, "f": f, "n": n, "front": float(t.max()), "back": float(t.min())}


def local(P, F):
    d = P - F["c"]
    return np.c_[d @ F["x"], d @ F["f"], d @ F["n"]]


def seg_d2(Q, a, b):
    """Distance in the plane (u, v) from points Q to the segment a-b."""
    ab = b - a
    t = np.clip(((Q - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(Q - (a + t[:, None] * ab), axis=1)


def main() -> int:
    import skullbase_build as SB
    import skullbase_v3 as V3
    F = frame()
    nerves = CAV.centre_lines(V3_BUILD / "tb_optic_nerve_ii.glb")
    r_n = float(np.median(np.r_[nerves["R"][1], nerves["L"][1]]))
    half_w = CHIASM_WIDTH_MM / 2
    u_join = half_w - r_n * CHIASM_BAND       # a nerve joins the chiasm's front corner, a band's half-width in from its side
    corner, keep = {}, {}
    for s, (P, r) in nerves.items():
        L = local(P, F)
        sg = 1.0 if s == "R" else -1.0
        corner[s] = np.array([sg * u_join, F["front"] - r_n * CHIASM_BAND, 0.0])     # (the band's end rounds out to the edge)
        # the route kept from JOIN_OUT_MM further out than the corner to the canal; from there a smooth curve (a cubic
        # leaving along the route's own direction, arriving straight back along the chiasm's plane) runs in to
        # CHIASM_INTO_MM inside the corner
        j = int(np.argmax(sg * L[:, 0] >= u_join + JOIN_OUT_MM))
        end = corner[s] - np.array([0.0, CHIASM_INTO_MM, 0.0])
        d = L[j + 1] - L[j]
        d /= np.linalg.norm(d)
        a = np.linalg.norm(L[j] - end) / 2.5
        P0, P1, P2, P3 = end, end + np.array([0.0, a, 0.0]), L[j] - a * d, L[j]
        t = np.linspace(0, 1, 12)[:-1, None]
        curve = (1 - t) ** 3 * P0 + 3 * (1 - t) ** 2 * t * P1 + 3 * (1 - t) * t ** 2 * P2 + t ** 3 * P3
        Pw = F["c"] + curve[:, :1] * F["x"] + curve[:, 1:2] * F["f"] + curve[:, 2:3] * F["n"]
        # (its radius tapering along the curve to just under the chiasm's half-height, where it joins it)
        taper = CHIASM_HEIGHT_MM / 2 - 0.15 + (r[j] - CHIASM_HEIGHT_MM / 2 + 0.15) * t[:, 0] ** 0.7
        keep[s] = (np.vstack([Pw, P[j:]]), np.r_[taper, r[j:]])
    back = {"R": np.array([u_join, F["back"] + r_n * CHIASM_BAND, 0.0]), "L": np.array([-u_join, F["back"] + r_n * CHIASM_BAND, 0.0])}
    front = corner
    # the chiasm on a grid in its own frame
    lo = np.array([-half_w - 2, F["back"] - 3, -CHIASM_HEIGHT_MM])
    hi = np.array([half_w + 2, F["front"] + 3, CHIASM_HEIGHT_MM])
    axes = [np.arange(l, h + GRID, GRID) for l, h in zip(lo, hi)]
    U, Vv, W = np.meshgrid(*axes, indexing="ij")
    Q = np.c_[U.ravel(), Vv.ravel()]
    band = r_n * CHIASM_BAND
    d_band = np.minimum(seg_d2(Q, front["R"][:2], back["L"][:2]), seg_d2(Q, front["L"][:2], back["R"][:2])) / band
    length = F["front"] - F["back"]
    mid_v = (F["front"] + F["back"]) / 2
    d_body = np.sqrt((Q[:, 0] / (CHIASM_BODY[0] * half_w)) ** 2 + ((Q[:, 1] - mid_v) / (CHIASM_BODY[1] * length / 2)) ** 2)
    d_plane = np.minimum(d_band, d_body).reshape(U.shape)
    f = np.sqrt(d_plane ** 2 + (W / (CHIASM_HEIGHT_MM / 2)) ** 2)
    f = ndimage.gaussian_filter(f, 1.0)
    v, tri, _, _ = measure.marching_cubes(f, 1.0, spacing=(GRID,) * 3)
    v = v + lo
    world = F["c"] + v[:, :1] * F["x"] + v[:, 1:2] * F["f"] + v[:, 2:3] * F["n"]
    m = trimesh.Trimesh(world, tri, process=True)
    trimesh.smoothing.filter_taubin(m, iterations=10)
    if m.volume < 0:
        m.invert()
    items = []
    col_n = V3.colour("sbNerve")
    halves = SB.mesh_split(np.asarray(m.vertices), np.asarray(m.faces), np.ones(len(m.vertices)))
    nodes, cent = [], {}
    for s, (vv, tt, _) in sorted(halves.items()):
        nodes.append({"name": s, "positions": vv, "normals": SB.normals(vv, tt), "indices": tt, "mode": TRIANGLES})
        cent[s] = vv.mean(0).round(2).tolist()
    write_glb(V3_BUILD / "tb_optic_chiasm.glb", nodes, {"id": "tb_optic_chiasm"})
    meas = {"widthMm": round(float(np.ptp(v[:, 0])), 1), "lengthMm": round(float(np.ptp(v[:, 1])), 1), "heightMm": round(float(np.ptp(v[:, 2])), 1),
            "tiltDeg": round(float(np.degrees(np.arcsin(abs(F["f"][2])))), 0), "nerveJoinsMm": round(float(corner["R"][0] - corner["L"][0]), 1)}
    base = {"aliases": [], "type": "soft", "bytes": 0, "colour": col_n, "dataset": "rule", "source": "Drawn by rule on the TopBrain CT",
            "licence": "GPL-3.0 (the project's own drawing, on the TopBrain CT)", "citation": [], "citationUrls": [], "refIds": [],
            "category": "nerve", "layer": "tracts", "cranialNerve": 2, "schematic": True}
    items.append({**base, "id": "tb_optic_chiasm", "name": "Optic chiasm", "aliases": ["Chiasma opticum"], "file": "assets/skullbase-v3/tb_optic_chiasm.glb",
                  "derivation": ("Drawn by rule (skullbase_v3_chiasm.py) where the fitted Z-Anatomy chiasm lies: its centre, its plane (tilted "
                                 f"{meas['tiltDeg']:.0f}° from the horizontal) and its length front to back ({meas['lengthMm']} mm here). Its width "
                                 f"({CHIASM_WIDTH_MM} mm) and height ({CHIASM_HEIGHT_MM} mm) are the means Mncube 2019 measured on coronal MRI in 80 adults. "
                                 "Its shape is two bands crossing, each from where one optic nerve joins its front edge to the other side's back corner, "
                                 "where the optic tract leaves, with a central body joining them (illustrative: what crosses where inside the chiasm is "
                                 f"not settled). The optic nerves join it {meas['nerveJoinsMm']} mm apart."),
                  "centroid": {"L": cent.get("L"), "R": cent.get("R")}})
    # the tracts' first part
    ang = np.radians(TRACT_ANGLE_DEG)
    nodes, cent = [], {}
    for s, sg in (("R", 1.0), ("L", -1.0)):
        p0 = back[s] + np.array([0.0, band * 0.5, 0.0])
        d = np.array([sg * np.sin(ang), -np.cos(ang), 0.0])
        Pl = np.array([p0 + t * d for t in np.linspace(0, TRACT_MM, 13)])
        Pw = F["c"] + Pl[:, :1] * F["x"] + Pl[:, 1:2] * F["f"] + Pl[:, 2:3] * F["n"]
        vv, nn, tt = CAV.tube(Pw, r_n)
        nodes.append({"name": s, "positions": vv, "normals": nn, "indices": tt, "mode": TRIANGLES})
        cent[s] = Pw.mean(0).round(2).tolist()
    write_glb(V3_BUILD / "tb_optic_tract.glb", nodes, {"id": "tb_optic_tract"})
    items.append({**base, "id": "tb_optic_tract", "name": "Optic tract", "file": "assets/skullbase-v3/tb_optic_tract.glb",
                  "derivation": (f"Drawn by rule (skullbase_v3_chiasm.py): the tracts' first {TRACT_MM:g} mm from the chiasm's back corners, backwards and "
                                 f"outwards at {TRACT_ANGLE_DEG:g}° from the midline in the chiasm's plane, as wide as the optic nerves drawn here "
                                 "(illustrative); the rest of their course round the cerebral peduncles is not drawn."),
                  "centroid": cent})
    # the nerves, ending in the chiasm
    nodes = []
    for s in ("L", "R"):
        P, r = keep[s]
        vv, nn, tt = SB.tube(np.c_[P, np.r_[r[:12], np.full(len(r) - 12, float(np.median(nerves[s][1])))]])
        nodes.append({"name": s, "positions": vv, "normals": nn, "indices": tt, "mode": TRIANGLES})
    write_glb(V3_BUILD / "tb_optic_nerve_ii.chiasm.glb", nodes, {"id": "tb_optic_nerve_ii"})
    CH_ITEMS.write_text(json.dumps({"items": items, "measured": meas}, indent=1, ensure_ascii=False))
    merge()
    print("chiasm", meas)
    return 0


NERVE_NOTE = (" Near its end it turns in to the optic chiasm's front corner and ends 1.5 mm inside it (skullbase_v3_chiasm.py), "
              "instead of running on to the midline.")


def merge(man: dict | None = None) -> dict:
    """The chiasm and tracts into v3's manifest in place of the fitted block, the optic nerve's file the copy that ends in
    the chiasm (skullbase_v3_endonasal.carry_sellar does this too when it is run again). With a manifest given, it is
    changed and returned, not written."""
    write = man is None
    p = GEN / "sbv3-manifest.json"
    if man is None:
        man = json.loads(p.read_text())
    if not CH_ITEMS.exists():
        return man
    new = json.loads(CH_ITEMS.read_text())["items"]
    ids = {it["id"] for it in new}
    for it in new:
        f = REPO / "public" / it["file"]
        if f.exists():
            it["bytes"] = f.stat().st_size
    man["structures"] = [s for s in man["structures"] if s["id"] not in ids and s["id"] != REPLACED] + new
    for it in man["structures"]:
        if it["id"] == "tb_optic_nerve_ii" and (V3_BUILD / "tb_optic_nerve_ii.chiasm.glb").exists():
            it.setdefault("chiasmFrom", it["file"])
            it["file"] = "assets/skullbase-v3/tb_optic_nerve_ii.chiasm.glb"
            f = REPO / "public" / it["file"]
            if f.exists():
                it["bytes"] = f.stat().st_size
            if NERVE_NOTE not in it["derivation"]:
                it["derivation"] = it["derivation"].rstrip() + NERVE_NOTE
    if write:
        p.write_text(json.dumps(man, indent=1, ensure_ascii=False))
    return man


if __name__ == "__main__":
    sys.exit(main())
