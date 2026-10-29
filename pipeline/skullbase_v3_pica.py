"""Skull base v3: the posterior inferior cerebellar artery from this CT's origin on, round the medulla to the
cerebellum, and moving with the cerebellum in the telovelar and retrosigmoid shapes.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_pica.py      (after skullbase_pfossa.py; also run by skullbase_v3.py)

TopBrain labels only the first part of each PICA here, and this patient's vertebral arteries are long and tortuous: the
labelled PICAs leave them near the midline and loop onto the back of the medulla, through where the fitted template
medulla lies. So only the label's first STUB_MM (its origin on the vertebral artery, measured over its surface) is this
CT's own; from there the model's typical course is drawn: a joining run from the stub's end round the outside of the
brainstem to the start of the Z-Anatomy model's PICA trunk, then that trunk (lateral to the medulla, round the tonsil)
and its branches, carried onto this CT by the whole-skull fit (skullbase_v3_skull.fitted_model, as its FITTED_LINES are)
and by the posterior fossa fit near the hindbrain (skullbase_v3.carry_lines: so it keeps its place against the fitted
cerebellum and brainstem); all kept clear of the fitted cerebellum and brainstem (skullbase_v3.hindbrain_clearance); a
branch that does not then start on the tree is left out.

Both the labelled stub and the course move with the cerebellum in its two shapes (skullbase_pfossa.py: the tonsils
drawn apart and the vermis lifted, the right hemisphere drawn back): each by cross-sections along its centre line
(skullbase_brain.skin_along), following the cerebellum's vertices within REACH_MM, the brainstem's counted as still.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
BUILD = ROOT / "data" / "build" / "skullbase-v3"
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
NAME = "Posterior inferior cerebellar artery"
CODES = {"R": [29], "L": [30]}
STUB_MM = 6.0              # this CT's labelled PICA kept from its origin on the vertebral artery this far along it
STEP_MM = 0.5
ATTACH_MM = 3.0            # a branch is kept when it starts this near the tree
REACH_MM = 4.0             # a vessel point follows the cerebellum's vertices this near
SHAPES = ("telovelar", "retrosigmoid")
CEREBELLUM = ("pf_cerebellar_hemisphere", "pf_tonsil", "pf_vermis")


def fitted_runs(side: str) -> list[np.ndarray]:
    """The model's PICA (trunk first, then its branches) carried onto this CT: [(n, 4): x, y, z, radius]."""
    import skullbase_v3 as V3
    import skullbase_v3_skull as SK
    ex = json.loads(SK.ZEXPORT.read_text())
    model, _ = SK.fitted_model(ex, None, None, None, None)
    key = f"{NAME}.{side.lower()}"
    keep = SK.FITTED_LINES
    try:
        SK.FITTED_LINES = [key]
        lines = SK.carry_lines(ex, model)
    finally:
        SK.FITTED_LINES = keep
    carried, keep = {"lines": lines}, V3.CARRIED
    try:
        V3.CARRIED = keep + (NAME,)
        V3.carry_lines(carried)
    finally:
        V3.CARRIED = keep
    return [np.array(r, float) for r in carried["lines"][key]["runs"] if len(r) > 1]


def label(side: str, fossa, R) -> tuple[np.ndarray, np.ndarray]:
    """This patient's PICA and vertebral artery as TopBrain labels them (surface points, frame mm)."""
    import nibabel as nib
    lab = nib.load(ROOT / "data" / "raw" / "topbrain" / "topcow_ct_011.nii.gz")
    L = np.asanyarray(lab.dataobj)
    out = []
    for codes in (CODES[side], {"R": [23], "L": [24]}[side]):
        m = np.isin(L, codes)
        edge = m & ~ndimage.binary_erosion(m)
        out.append((nib.affines.apply_affine(lab.affine, np.argwhere(edge)) - fossa) @ R)
    return out[0], out[1]


def stub(side: str, v: np.ndarray, t: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray, float]:
    """This CT's labelled PICA (v2's mesh v, t) kept from its origin on the vertebral artery STUB_MM along it (by
    distance over its surface): the faces kept, the stub's end (the centre of its surface there) and its radius."""
    import scipy.sparse as sp
    from scipy.sparse.csgraph import dijkstra
    fr = np.load(CT_BUILD / "frame.npz")
    _, vert = label(side, fr["fossa"], fr["R"])
    o = int(np.argmin(cKDTree(vert).query(v)[0]))                 # the label's point nearest the vertebral artery
    E = np.vstack([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]])
    w = np.linalg.norm(v[E[:, 0]] - v[E[:, 1]], axis=1)
    G = sp.coo_matrix((np.r_[w, w], (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(len(v), len(v))).tocsr()
    d = dijkstra(G, indices=o)
    keep = np.all(d[t] <= STUB_MM, axis=1)
    rim = (d > STUB_MM - 1.0) & (d <= STUB_MM)
    end = v[rim].mean(0)
    r = float(np.median(np.linalg.norm(v[rim] - end, axis=1)))
    return t[keep], end, v[o], r


def continued(side: str, clear, start: np.ndarray, r0: float) -> tuple[list, dict]:
    """The course on from the labelled stub's end (start, radius r0): a joining run round the medulla to the model's
    trunk, then the trunk and its branches: [(P, r)] runs, and a report."""
    fr = np.load(CT_BUILD / "frame.npz")
    _, vert = label(side, fr["fossa"], fr["R"])
    runs = fitted_runs(side)
    trunk = runs[0] if cKDTree(vert).query(runs[0][0, :3])[0] < cKDTree(vert).query(runs[0][-1, :3])[0] else runs[0][::-1]
    # from the stub's end to the trunk's start, round the outside of the brainstem (the clearance pushes it out)
    gap = float(np.linalg.norm(trunk[0, :3] - start))
    n = max(2, int(gap / STEP_MM))
    s_ = np.linspace(0, 1, n, endpoint=False)[:, None]
    join = start + s_ * (trunk[0, :3] - start)
    rj = r0 + s_[:, 0] * (trunk[0, 3] - r0)
    P0 = np.vstack([join, trunk[:, :3]])
    r_0 = np.r_[rj, trunk[:, 3]]
    out = [(P0, r_0)]
    tree = [out[0][0]]
    kept, dropped = 0, 0
    for Rb in runs[1:]:
        P = Rb[:, :3]
        t = cKDTree(np.vstack(tree))
        if t.query(P[0])[0] > ATTACH_MM and t.query(P[-1])[0] <= ATTACH_MM:
            P, Rb = P[::-1], Rb[::-1]
        if t.query(P[0])[0] > ATTACH_MM:
            dropped += 1
            continue
        out.append((P, Rb[:, 3]))
        tree.append(P)
        kept += 1
    if clear is not None:
        out = [(clear(P, r), r) for P, r in out]
        out[0] = (np.vstack([start, out[0][0][1:]]), out[0][1])     # (the stub's end kept: the course starts on it)
    length = float(sum(np.linalg.norm(np.diff(P, axis=0), axis=1).sum() for P, _ in out))
    return out, {"stubEnd": np.round(start, 1).tolist(), "joinMm": round(gap, 1),
                 "branchesKept": kept, "branchesLeftOut": dropped, "lengthMm": round(length, 1)}


def hindbrain_shapes() -> tuple[np.ndarray, np.ndarray, dict]:
    """The fitted hindbrain at rest (skullbase_pfossa.py's GLBs), whether each vertex is cerebellum, and each shape's
    displacement of it."""
    from pygltflib import GLTF2
    V, follow, D = [], [], {s: [] for s in SHAPES}
    for f in sorted(BUILD.glob("pf_*.glb")):
        if "fourth_ventricle" in f.name:
            continue
        g = GLTF2().load(str(f))
        blob = g.binary_blob()

        def acc(i):
            a = g.accessors[i]
            bv = g.bufferViews[a.bufferView]
            n = {"SCALAR": 1, "VEC3": 3}[a.type]
            dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a.componentType]
            arr = np.frombuffer(blob, dt, a.count * n, (bv.byteOffset or 0) + (a.byteOffset or 0))
            return arr.reshape(a.count, n).astype(float) if n > 1 else arr
        for node in g.nodes:
            if node.mesh is None:
                continue
            mesh = g.meshes[node.mesh]
            p = mesh.primitives[0]
            P = acc(p.attributes.POSITION)
            names = (mesh.extras or {}).get("targetNames", [])
            V.append(P)
            follow.append(np.full(len(P), f.stem in CEREBELLUM))
            for s in SHAPES:
                D[s].append(acc(p.targets[names.index(s)]["POSITION"]) if s in names else np.zeros_like(P))
    return np.vstack(V), np.concatenate(follow), {s: np.vstack(D[s]) for s in SHAPES}


def carried_by_shapes(v: np.ndarray, line: np.ndarray, hb: tuple) -> dict:
    """Each shape's displacement of a vessel's surface points v, by cross-sections along its centre line."""
    import skullbase_brain as BR
    rest, follow, D = hb
    keep = BR.SKIN_MM
    try:
        BR.SKIN_MM = REACH_MM
        return {s: BR.skin_along(v, line, rest, rest + D[s], follow, link=1.5, rounds=12) for s in SHAPES}
    finally:
        BR.SKIN_MM = keep


def label_line(side: str) -> np.ndarray:
    """The labelled PICA's centre line (TopBrain's label, skeletonised), frame mm."""
    import nibabel as nib
    from skimage.morphology import skeletonize
    fr = np.load(CT_BUILD / "frame.npz")
    lab = nib.load(ROOT / "data" / "raw" / "topbrain" / "topcow_ct_011.nii.gz")
    m = np.isin(np.asanyarray(lab.dataobj), CODES[side])
    sl = tuple(slice(max(s.start - 2, 0), s.stop + 2) for s in ndimage.find_objects(m.astype(np.uint8))[0])
    sk = np.argwhere(skeletonize(m[sl])) + np.array([s.start for s in sl])
    return (nib.affines.apply_affine(lab.affine, sk) - fr["fossa"]) @ fr["R"]


def build(ex2: dict) -> dict:
    """GLBs for the labelled PICA (v2's mesh, now with the shapes) and its carried-on course; returns the report."""
    import skullbase_build as SB
    import skullbase_v3 as V3
    from glb import TRIANGLES, write_glb
    clear = V3.hindbrain_clearance()
    hb = hindbrain_shapes()
    rep = {"continued": {}, "movedMaxMm": {}}
    # the labelled part, v2's mesh: the same vertices, with the shapes as morph targets
    nodes, ends = [], {}
    for s in ("L", "R"):
        m = ex2["meshes"][f"{NAME}.{s.lower()}"]
        v, t = np.array(m["verts"], float), np.array(m["tris"], int)
        t, end, origin, r0 = stub(s, v, t)
        used = np.unique(t)
        remap = -np.ones(len(v), int)
        remap[used] = np.arange(len(used))
        v, t = v[used], remap[t]
        ends[s] = (end, r0)
        D = carried_by_shapes(v, label_line(s), hb)
        nodes.append({"name": s, "positions": v, "normals": SB.normals(v, t), "indices": t, "mode": TRIANGLES,
                      "targets": [{"name": n, "positions": D[n], "normals": np.zeros_like(v)} for n in SHAPES]})
        rep["movedMaxMm"][f"label{s}"] = {n: round(float(np.linalg.norm(D[n], axis=1).max()), 1) for n in SHAPES}
        rep.setdefault("stub", {})[s] = {"origin": np.round(origin, 1).tolist(), "end": np.round(end, 1).tolist(), "radiusMm": round(r0, 2)}
    write_glb(BUILD / "sb_posterior_inferior_cerebellar_artery.glb", nodes, {"id": "sb_posterior_inferior_cerebellar_artery"})
    # the carried-on course: tubes round its runs, each moved by cross-sections
    import skullbase_brain as BR
    nodes, cent = [], {}
    for s in ("L", "R"):
        runs, rep["continued"][s] = continued(s, clear, *ends[s])
        vs, ns, ts, tg, off = [], [], [], {n: ([], []) for n in SHAPES}, 0
        for P, r in runs:
            P = BR.resample_line(P, 0.5) if len(P) > 1 else P
            rr = float(np.clip(np.median(r), 0.3, 0.8))
            v0, n0, t0, N0 = BR.sweep(P, rr, sides=8)
            D = carried_by_shapes(P, P, hb)
            for n in SHAPES:
                v1, n1, _, _ = BR.sweep(P + D[n], rr, N0, sides=8)
                tg[n][0].append(v1 - v0)
                tg[n][1].append(n1 - n0)
            vs.append(v0); ns.append(n0); ts.append(t0 + off); off += len(v0)
        V = np.vstack(vs)
        nodes.append({"name": s, "positions": V, "normals": np.vstack(ns), "indices": np.vstack(ts), "mode": TRIANGLES,
                      "targets": [{"name": n, "positions": np.vstack(tg[n][0]), "normals": np.vstack(tg[n][1])} for n in SHAPES]})
        cent[s] = V.mean(0).round(2).tolist()
        rep["movedMaxMm"][f"course{s}"] = {n: round(float(np.abs(np.vstack(tg[n][0])).max()), 1) for n in SHAPES}
    write_glb(BUILD / "tb_posterior_inferior_cerebellar_artery_fitted_course.glb", nodes,
              {"id": "tb_posterior_inferior_cerebellar_artery_fitted_course"})
    rep["centroid"] = cent
    (BUILD / "pica.json").write_text(json.dumps(rep, indent=1))
    return rep


def items(items: list) -> None:
    """The manifest's PICA (this build's file, with the shapes) and its carried-on course (pica.json's)."""
    p = BUILD / "pica.json"
    if not p.exists():
        return
    import skullbase_v3 as V3
    rep = json.loads(p.read_text())
    it = next(i for i in items if i["name"] == NAME)
    it["file"] = "assets/skullbase-v3/sb_posterior_inferior_cerebellar_artery.glb"
    it["morph"] = True
    base = it.get("derivation", "").split(" This angiogram labels only")[0].split(" Only its origin")[0]
    it["derivation"] = (base + f" Only its origin is shown: its first {STUB_MM:g} mm from the vertebral artery. This angiogram labels "
                        "only the PICA's first part, and this patient's vertebral arteries are long and tortuous: the labelled PICAs leave "
                        "them near the midline and loop onto the back of the medulla, through where the fitted model's medulla lies; its "
                        "course on from the origin is the model's typical one (Posterior inferior cerebellar artery (fitted course)). In the "
                        "telovelar and retrosigmoid views it moves with the cerebellum it lies against, carried by cross-sections along its "
                        "centre line.").strip()
    sca = next(i for i in items if i["name"] == "Superior cerebellar artery (fitted course)")
    c = rep["continued"]
    new = {**{k: sca[k] for k in ("aliases", "type", "colour", "dataset", "source", "licence", "citation", "citationUrls", "refIds",
                                    "category", "layer", "fitted")},
           "id": "tb_posterior_inferior_cerebellar_artery_fitted_course", "name": f"{NAME} (fitted course)",
           "file": "assets/skullbase-v3/tb_posterior_inferior_cerebellar_artery_fitted_course.glb", "bytes": 0,
           "system": "Vertebral artery", "morph": True,
           "derivation": "The model's typical course on from this CT's PICA origin: a run drawn from the end of the labelled origin round "
                         f"the outside of the brainstem ({c['R']['joinMm']} mm on the right, {c['L']['joinMm']} mm on the left) to the start of the "
                         "Z-Anatomy PICA's trunk, then that trunk (lateral to the medulla, round the tonsil) and the branches that start on it, "
                         "fitted onto this CT (the whole-skull fit, then the posterior fossa's) and kept clear of the fitted cerebellum and "
                         "brainstem. It moves with the cerebellum in the telovelar and retrosigmoid views. Its course is approximate, not this "
                         "patient's: this CT's own PICAs loop medially from long, tortuous vertebral arteries.",
           "centroid": {"L": rep["centroid"]["L"], "R": rep["centroid"]["R"]}}
    old = next((i for i, x in enumerate(items) if x["id"] == new["id"]), None)
    if old is None:
        items.insert(items.index(sca) + 1, new)
    else:
        items[old] = {**new, "bytes": items[old].get("bytes", 0)}
    _ = V3


def main() -> int:
    ex2 = json.loads((CT_BUILD / "export.json").read_text())
    rep = build(ex2)
    print(json.dumps({k: v for k, v in rep.items() if k != "centroid"}, indent=1))
    p = ROOT.parent / "src" / "data" / "generated" / "sbv3-manifest.json"
    m = json.loads(p.read_text())
    items(m["structures"])
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
