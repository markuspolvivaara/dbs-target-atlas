"""Skull base v1 (the Z-Anatomy model): the pituitary stalk named apart from the two lobes of the hypophysis.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_stalk.py
  (after skullbase_build.py; then compress.mjs skullbase sb_adenohypophysis.glb sb_neurohypophysis.glb
  sb_pituitary_stalk.glb and skullbase_build.py finalize)

Z-Anatomy draws the hypophysis as two meshes, "Adenohypophysis" and "Neurohypophysis", each an open shell (they share
one rim and close each other). Both go on above the gland in the fossa as a narrow neck (the
adenohypophysis's pars tuberalis, the neurohypophysis's infundibulum). So the model's hypophysis is 12.6 mm high and has
no stalk of its own name (the audit's AP-11).

Here the neck is named: both shells are cut level at the height where the hypophysis, going up from its widest level,
first is less than STALK_WIDTH_SHARE of its greatest width across (neck_level). What lies above is the item "Pituitary
stalk" (both shells' upper parts together), what lies below stays the two lobes. No vertex is moved: the three meshes
together are Z-Anatomy's surface as it was, cut along one level line; like Z-Anatomy's lobes, the parts are open
towards each other.

Writes pipeline/data/build/skullbase/sb_adenohypophysis.glb, sb_neurohypophysis.glb and sb_pituitary_stalk.glb, the
three items into v1's manifest, their entries in sb-regions.json and the step's record (sb-modifications.json).
skullbase_v1_endonasal.py takes the level from here for the gland's parts; the tumours' step (SB_PROFILE=v1
skullbase_v3_tumours.py) places the adenomas by Z-Anatomy's whole anterior lobe as before (whole_lobe).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"

LOBES = ("Adenohypophysis", "Neurohypophysis")
STALK = "Pituitary stalk"
STALK_ID = "sb_pituitary_stalk"
STALK_WIDTH_SHARE = 1 / 3   # the stalk begins where the hypophysis is first narrower than this share of its greatest width
#                             (a drawing choice: at a half the cut falls on the gland's shoulder, 5.7 mm across; at a third
#                             where the shoulder ends and the neck is 3.3 to 3.9 mm across all the way up)
LEVEL_STEP_MM = 0.05        # the levels at which its width is measured

LOBE_NOTE = ("Mesh from Z-Anatomy, its vertices unchanged, less its upper part: the narrow neck above {z} mm over the fossa is shown "
             "apart as the Pituitary stalk (skullbase_v1_stalk.py: cut level where the hypophysis is first narrower than a third of its "
             "greatest width).")


def lobes(ex: dict) -> dict:
    """Z-Anatomy's two shells as exported: {name: (verts, tris)}."""
    return {n: (np.array(ex["soft"][n]["verts"], float), np.array(ex["soft"][n]["tris"], int)) for n in LOBES}


def whole_lobe(name: str = "Adenohypophysis") -> np.ndarray:
    """A lobe's vertices as Z-Anatomy draws it, its part of the stalk included."""
    ex = json.loads((BUILD / "export.json").read_text())
    return np.array(ex["soft"][name]["verts"], float)


def width_at(shells: dict, z: float) -> float:
    """The hypophysis's width across (x) at a level: over the points where the shells' edges cross it."""
    xs = []
    for v, t in shells.values():
        e = np.vstack([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]])
        a, b = v[e[:, 0]], v[e[:, 1]]
        cross = (a[:, 2] - z) * (b[:, 2] - z) < 0
        f = (z - a[cross, 2]) / (b[cross, 2] - a[cross, 2])
        xs.append(a[cross, 0] + f * (b[cross, 0] - a[cross, 0]))
    xs = np.concatenate(xs)
    return float(np.ptp(xs)) if len(xs) else 0.0


def neck_level(ex: dict) -> dict:
    """Where the stalk begins: the first level above the hypophysis's widest one at which it is narrower than
    STALK_WIDTH_SHARE of that width. {z, widestMm, widestZ, widthAtMm, topZ, bottomZ}."""
    shells = lobes(ex)
    zs = np.concatenate([v[:, 2] for v, _ in shells.values()])
    levels = np.arange(zs.min() + LEVEL_STEP_MM, zs.max(), LEVEL_STEP_MM)
    w = np.array([width_at(shells, float(z)) for z in levels])
    k0 = int(np.argmax(w))
    above = np.nonzero(w[k0:] < STALK_WIDTH_SHARE * w[k0])[0]
    if not len(above):
        raise SystemExit("the hypophysis does not narrow to a neck")
    k = k0 + int(above[0])
    return {"z": round(float(levels[k]), 2), "widestMm": round(float(w[k0]), 1), "widestZ": round(float(levels[k0]), 2),
            "widthAtMm": round(float(w[k]), 1), "topZ": round(float(zs.max()), 2), "bottomZ": round(float(zs.min()), 2)}


def split(ex: dict) -> tuple[dict, dict]:
    """The two shells cut at the neck's level: ({name: (verts, tris)} for the two lobes and the stalk, the level's dict)."""
    import skullbase_build as SB
    lv = neck_level(ex)
    n_, o_ = np.array([0.0, 0.0, 1.0]), np.array([0.0, 0.0, lv["z"]])
    out, tops = {}, []
    for name, (v, t) in lobes(ex).items():
        t = SB.orient_outward(v, t)         # (as skullbase_build.py turns a source mesh that is inside out; before the cut)
        lo = trimesh.intersections.slice_faces_plane(v, t, -n_, o_)
        hi = trimesh.intersections.slice_faces_plane(v, t, n_, o_)
        out[name] = tidy(lo[0], lo[1])
        tops.append(tidy(hi[0], hi[1]))
    off, vs, ts = 0, [], []
    for v, t in tops:
        vs.append(v); ts.append(t + off); off += len(v)
    m = trimesh.Trimesh(np.vstack(vs), np.vstack(ts), process=False)
    m.merge_vertices()                      # (the two shells' common rim)
    out[STALK] = (np.asarray(m.vertices), np.asarray(m.faces))
    return out, lv


def closed(ex: dict) -> trimesh.Trimesh:
    """The hypophysis as one closed surface: the two shells joined along their common rim."""
    off, vs, ts = 0, [], []
    for v, t in lobes(ex).values():
        vs.append(v); ts.append(t + off); off += len(v)
    m = trimesh.Trimesh(np.vstack(vs), np.vstack(ts), process=True)
    if not m.is_watertight:
        raise SystemExit("Z-Anatomy's two lobes no longer close each other")
    if m.volume < 0:
        m.invert()
    return m


def rim_plane(ex: dict) -> tuple[np.ndarray, np.ndarray, float]:
    """The plane of the two shells' common rim, where the lobes meet: (a point on it, its normal towards the anterior
    lobe, how far the rim's points lie off it at most, mm)."""
    v, t = lobes(ex)["Adenohypophysis"]
    a = trimesh.Trimesh(v, t, process=True)
    e, n = np.unique(a.edges_sorted, axis=0, return_counts=True)
    rim = np.asarray(a.vertices)[np.unique(e[n == 1])]
    c = rim.mean(0)
    nrm = np.linalg.svd(rim - c)[2][2]
    nrm = nrm if (np.asarray(a.vertices).mean(0) - c) @ nrm > 0 else -nrm
    return c, nrm, float(np.abs((rim - c) @ nrm).max())


def volume_within(m: trimesh.Trimesh, planes: list[tuple[np.ndarray, np.ndarray]]) -> float:
    """The exact volume (mm3) of the part of a closed mesh on the normal's side of one or two planes [(point, normal)].
    The surface is cut at the planes and its triangles' signed tetrahedra summed from a point that lies on every plane,
    so the flat caps, which are not drawn, add nothing."""
    v, t = np.asarray(m.vertices), np.asarray(m.faces)
    for o, n in planes:
        cut = trimesh.intersections.slice_faces_plane(v, t, np.asarray(n, float), np.asarray(o, float))
        v, t = cut[0], cut[1]
    if len(planes) == 1:
        apex = np.asarray(planes[0][0], float)
    else:       # a point on both planes: on their line of intersection, nearest the first plane's point
        (o1, n1), (o2, n2) = [(np.asarray(o, float), np.asarray(n, float) / np.linalg.norm(n)) for o, n in planes]
        d = np.cross(n1, n2)
        apex = np.linalg.solve(np.array([n1, n2, d]), np.array([n1 @ o1, n2 @ o2, d @ o1]))
    P = v[t] - apex
    return float(np.einsum("ij,ij->i", P[:, 0], np.cross(P[:, 1], P[:, 2])).sum() / 6.0)


def tidy(v: np.ndarray, t: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """A cut part without the vertices it no longer uses or faces of no area."""
    t = t[trimesh.triangles.area(v[t]) > 1e-12]
    used, inv = np.unique(t, return_inverse=True)
    return v[used], inv.reshape(-1, 3)


def main() -> int:
    import skullbase_build as SB
    from glb import TRIANGLES, write_glb
    from modifications import record
    ex = json.loads((BUILD / "export.json").read_text())
    parts, lv = split(ex)
    p = GEN / "sb-manifest.json"
    man = json.loads(p.read_text())
    by_id = {it["id"]: it for it in man["structures"]}
    report, pts = {}, {}
    for name, (v, t) in parts.items():
        sid = SB.slug(name)
        nodes, cent = [], {}
        for side, (v_, t_, _) in sorted(SB.mesh_split(v, t, np.ones(len(v))).items()):
            nodes.append({"name": side, "positions": v_, "normals": SB.normals(v_, t_), "indices": t_, "mode": TRIANGLES})
            cent[side] = v_.mean(0).round(2).tolist()
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        pts[sid] = v
        report[name] = {"heightMm": round(float(np.ptp(v[:, 2])), 1), "widthMm": round(float(np.ptp(v[:, 0])), 1),
                        "lengthMm": round(float(np.ptp(v[:, 1])), 1), "vertices": int(len(v)), "triangles": int(len(t))}
        if name == STALK:
            it = {**by_id["sb_adenohypophysis"], "id": sid, "name": name, "aliases": ["Infundibulum", "Hypophyseal stalk"],
                  "file": f"assets/skullbase/{sid}.glb", "bytes": 0,
                  "derivation": "Cut at the midline (x = 0) into left and right halves. The upper parts of Z-Anatomy's two meshes of the hypophysis "
                                "(its Adenohypophysis and Neurohypophysis, which both go on above the gland), where they form a narrow neck: "
                                f"what lies above {lv['z']:g} mm over the fossa, the level at which the hypophysis is first narrower than a third of its "
                                f"greatest width ({lv['widestMm']:g} mm across at its widest, {lv['widthAtMm']:g} mm there). Z-Anatomy does not "
                                "name it apart; no vertex is moved (skullbase_v1_stalk.py)."}
            by_id[sid] = it
        else:
            it = by_id[sid]
            it["derivation"] = "Cut at the midline (x = 0) into left and right halves. " + LOBE_NOTE.format(z=f"{lv['z']:g}")
        it["centroid"] = {s: cent.get(s, cent.get("R" if s == "L" else "L")) for s in ("L", "R")}
        f = REPO / "public" / it["file"]
        it["bytes"] = f.stat().st_size if f.exists() else it.get("bytes", 0)
    order = [it["id"] for it in man["structures"] if it["id"] != STALK_ID]
    order.insert(order.index("sb_neurohypophysis") + 1, STALK_ID)
    man["structures"] = [by_id[i] for i in order]
    p.write_text(json.dumps(man, indent=1, ensure_ascii=False))
    # the regions round the landmarks: the three items' nearest points again (as skullbase_build.py lists them)
    rp = GEN / "sb-regions.json"
    regions = json.loads(rp.read_text())
    for r in regions:
        near = [x for x in r["structures"] if x["id"] not in pts]
        for sid, v in pts.items():
            d = float(cKDTree(v).query(np.array(r["ras"], float))[0])
            if d <= r["radiusMm"]:
                near.append({"id": sid, "distanceMm": round(d, 1)})
        r["structures"] = sorted(near, key=lambda x: x["distanceMm"])
    rp.write_text(json.dumps(regions, indent=1, ensure_ascii=False))
    record("sb", "skullbase_v1_stalk", "the narrow upper part of Z-Anatomy's two meshes of the hypophysis named apart as the pituitary stalk "
           "(both cut along one level; no vertex moved)", [*LOBES, STALK],
           {"widthShare": round(STALK_WIDTH_SHARE, 3), "levelStepMm": LEVEL_STEP_MM}, {"level": lv, **report},
           {"check": "skullbase_build.py finalize: the stalk above the lobes, the three together as high as Z-Anatomy's hypophysis"})
    print("v1 stalk:", lv, report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
