"""Skull base v3: the posterior inferior cerebellar artery carried on past what this angiogram labels, and both parts
moving with the cerebellum in the telovelar and retrosigmoid shapes.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_pica.py      (after skullbase_pfossa.py; also run by skullbase_v3.py)

TopBrain labels only the first part of each PICA (by the medulla: some 17 mm on the right, 25 mm on the left here), so
its loops round the tonsil and its branches over the cerebellum are missing. As for the superior cerebellar artery
(skullbase_v3_base.CONTINUED), the Z-Anatomy model's PICA is carried on from the label's far end (the end away from the
vertebral artery): its course carried onto this CT by the whole-skull fit (skullbase_v3_skull.fitted_model, as its
FITTED_LINES are) and by the posterior fossa fit near the hindbrain (skullbase_v3.carry_lines: so it keeps its place
against the fitted cerebellum and brainstem), its trunk from the point nearest the label's far end on, its branches
with it, all moved so that the trunk starts there, the move fading out over FADE_MM from it; kept clear of the fitted
cerebellum and brainstem (skullbase_v3.hindbrain_clearance); a branch that does not then start on the tree is left out.

Both the labelled part and the carried-on course move with the cerebellum in its two shapes (skullbase_pfossa.py: the
tonsils drawn apart and the vermis lifted, the right hemisphere drawn back): each by cross-sections along its centre
line (skullbase_brain.skin_along), following the cerebellum's vertices within REACH_MM, the brainstem's counted as still.
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
FADE_MM = 15.0
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


def continued(side: str, clear) -> tuple[list, dict]:
    """The carried-on course: [(P, r)] runs, and a report."""
    fr = np.load(CT_BUILD / "frame.npz")
    pica, vert = label(side, fr["fossa"], fr["R"])
    far = pica[int(np.argmax(cKDTree(vert).query(pica)[0]))]       # the label's far end
    runs = fitted_runs(side)
    trunk = runs[0] if cKDTree(vert).query(runs[0][0, :3])[0] < cKDTree(vert).query(runs[0][-1, :3])[0] else runs[0][::-1]
    k = int(np.argmin(np.linalg.norm(trunk[:, :3] - far, axis=1)))
    shift = far - trunk[k, :3]

    def moved(R):
        d = np.linalg.norm(R[:, :3] - trunk[k, :3], axis=1)
        f = np.clip(1 - d / FADE_MM, 0, 1)
        f = f * f * (3 - 2 * f)
        return R[:, :3] + f[:, None] * shift
    out = [(moved(trunk[k:]), trunk[k:, 3])]
    tree = [out[0][0]]
    kept, dropped = 0, 0
    for Rb in runs[1:]:
        P = moved(Rb)
        t = cKDTree(np.vstack(tree + [pica]))
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
    length = float(sum(np.linalg.norm(np.diff(P, axis=0), axis=1).sum() for P, _ in out))
    return out, {"labelFarEnd": np.round(far, 1).tolist(), "movedMm": round(float(np.linalg.norm(shift)), 1),
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
    nodes = []
    for s in ("L", "R"):
        m = ex2["meshes"][f"{NAME}.{s.lower()}"]
        v, t = np.array(m["verts"], float), np.array(m["tris"], int)
        D = carried_by_shapes(v, label_line(s), hb)
        nodes.append({"name": s, "positions": v, "normals": SB.normals(v, t), "indices": t, "mode": TRIANGLES,
                      "targets": [{"name": n, "positions": D[n], "normals": np.zeros_like(v)} for n in SHAPES]})
        rep["movedMaxMm"][f"label{s}"] = {n: round(float(np.linalg.norm(D[n], axis=1).max()), 1) for n in SHAPES}
    write_glb(BUILD / "sb_posterior_inferior_cerebellar_artery.glb", nodes, {"id": "sb_posterior_inferior_cerebellar_artery"})
    # the carried-on course: tubes round its runs, each moved by cross-sections
    import skullbase_brain as BR
    nodes, cent = [], {}
    for s in ("L", "R"):
        runs, rep["continued"][s] = continued(s, clear)
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
    if "cross-sections" not in it.get("derivation", ""):
        it["derivation"] = (it.get("derivation", "") + " This angiogram labels only its first part, by the medulla; its course beyond "
                            "is the fitted model's (Posterior inferior cerebellar artery (fitted course)). In the telovelar and retrosigmoid "
                            "views it moves with the cerebellum it lies against, carried by cross-sections along its centre line.").strip()
    sca = next(i for i in items if i["name"] == "Superior cerebellar artery (fitted course)")
    c = rep["continued"]
    new = {**{k: sca[k] for k in ("aliases", "type", "colour", "dataset", "source", "licence", "citation", "citationUrls", "refIds",
                                    "category", "layer", "fitted")},
           "id": "tb_posterior_inferior_cerebellar_artery_fitted_course", "name": f"{NAME} (fitted course)",
           "file": "assets/skullbase-v3/tb_posterior_inferior_cerebellar_artery_fitted_course.glb", "bytes": 0,
           "system": "Vertebral artery", "morph": True,
           "derivation": "Too small for this angiogram to show beyond its first part: the Z-Anatomy branch (its trunk from the point nearest "
                         "the label's far end on, and the branches that start on it), fitted onto this CT (the whole-skull fit, then the posterior "
                         f"fossa's), its start moved onto the far end of this patient's labelled PICA ({c['R']['movedMm']} mm on the right, "
                         f"{c['L']['movedMm']} mm on the left), the move fading out over {FADE_MM:.0f} mm, and kept clear of the fitted cerebellum "
                         "and brainstem. It moves with the cerebellum in the telovelar and retrosigmoid views. Its course is approximate.",
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
