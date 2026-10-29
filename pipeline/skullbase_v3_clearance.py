"""Skull base v3's arteries kept out of the brainstem: the brainstem is a template fitted into this CT, the arteries
are this CT's own (TopBrain's labels, carried with the brain's shapes) or fitted courses (Z-Anatomy's), so in places an
artery's surface runs into the brainstem's and seems to pass through it (the PICA's loops by the obex, where the fitted
medulla has a crevice; the fitted anterior inferior and superior cerebellar arteries in the pons).

Each artery point inside the brainstem, in any shape of the brain (the brainstem does not move), is moved out, its
neighbours along the vessel with it (a Gaussian), so that the tube keeps its shape and comes to lie on the surface:
  this CT's own arteries (the PICA's loops on the back of the medulla) straight back, as far as the first open space
  behind them plus CLEAR_MM (nudge: a millimetre or so; their cards say how far);
  the fitted courses towards the nearest open space (down the depth's gradient) by their depth plus CLEAR_MM, in rounds
  of at most LIFT_STEP_MM (lift).

A moved artery is written as a file of its own (<id>.cleared.glb) and v3's item points to it; the file its source wrote
is never changed, so running this again changes nothing. skullbase_v3_endonasal.py (the last of v3's steps to write its
manifest) runs this and then skullbase_v3_junctions.py, which joins the cleared files; on their own, run this and then
that.
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
from glb import TRIANGLES, read_glb_full, write_glb  # noqa: E402

DATA = ROOT / "data" / "build"
GEN = ROOT.parent / "src" / "data" / "generated"
STEM = ["Medulla oblongata", "Pons", "Midbrain"]
CLEAR_MM = 0.3          # an artery's clearance off the brainstem
GRID_MM = 0.2           # the brainstem rasterised this fine to find what lies in it
LIFT_SIGMA_MM = 1.5     # a fitted course lifted with its neighbours along it (Gaussian)
LIFT_STEP_MM = 0.5      # ... at most this per round
CARVE_BACK_MM = 3.0     # a channel for this CT's own artery: the tissue behind it removed up to this far
NUDGE_WHOLE_MM = 1.2    # this CT's own artery moved back whole within this of a point that must move (its cross-section),
NUDGE_SIGMA_MM = 1.0    # ... the move falling off beyond as a Gaussian this wide along the vessel ...
NUDGE_MAX_MM = 5.0      # ... looking at most this far back for open space
ROUNDS = 30
NEAR_MM = 3.0           # an artery's surface point counts for the brainstem's points this close to it
LIFT_NOTE = " Lifted out of the fitted brainstem where this course ran into it, onto its surface (skullbase_v3_clearance.py)."
CARVE_NOTE = (" Where this CT's own {} lies in it (the fitted template's surface reaching past the artery), a channel is"
              " cut for it: the artery widened by 0.3 mm and the tissue straight behind it removed, the surface meshed again"
              " (skullbase_v3_clearance.py).")
NOTES = ("Lifted out of the fitted brainstem", "Where this CT's own")


def source_of(item: dict) -> str:
    """The file its source wrote, before this step cleared it or skullbase_v3_junctions.py joined it."""
    return item.get("clearedFrom") or item.get("joinedFrom") or item["file"]


def file_of(item: dict) -> Path:
    return DATA / source_of(item).replace("assets/", "")


def cleared(item: dict, nodes: dict, note: str) -> None:
    """Write a cleared mesh as its own file and point the item to it (skullbase_v3_junctions.py, after this, joins it
    from there)."""
    src = source_of(item)
    item["clearedFrom"] = src
    item.pop("joinedFrom", None)
    item["file"] = f"assets/skullbase-v3/{item['id']}.cleared.glb"
    write(DATA / item["file"].replace("assets/", ""), nodes, item["id"])
    base = item["derivation"].split(" Joined ")[0]
    if note not in base:
        base += note
    item["derivation"] = base


def shown(item: dict) -> Path:
    """The file the viewer shows."""
    return DATA / item["file"].replace("assets/", "")


def normals(P: np.ndarray, T: np.ndarray) -> np.ndarray:
    import vascular_build as VB
    return VB.normals(P, T)


class Solid:
    """The brainstem rasterised (each part, each half on its own: their fills are OR-ed): depth inside it, and its
    surface's outward normals."""

    def __init__(self, parts: list[tuple[np.ndarray, np.ndarray]]):
        from skullbase_brain import fill
        allv = np.vstack([P for P, _ in parts])
        self.lo = allv.min(0) - 3
        self.shape = tuple(np.ceil((allv.max(0) + 3 - self.lo) / GRID_MM).astype(int) + 1)
        solid = np.zeros(self.shape, bool)
        for P, T in parts:
            solid |= fill(P, T, self.lo, self.shape, GRID_MM)
        self.dep = ndimage.distance_transform_edt(solid) * GRID_MM
        self.grad = np.gradient(ndimage.gaussian_filter(self.dep, 1.0))
        self.surf = allv
        self.nrm = np.vstack([normals(P, T) for P, T in parts])
        self.tree = cKDTree(self.surf)

    def depth(self, Q: np.ndarray) -> np.ndarray:
        ijk = np.rint((Q - self.lo) / GRID_MM).astype(int)
        ok = (ijk >= 0).all(1) & (ijk < np.array(self.shape)).all(1)
        d = np.zeros(len(Q))
        d[ok] = self.dep[tuple(ijk[ok].T)]
        return d

    def outward(self, Q: np.ndarray, k: int = 8) -> np.ndarray:
        """Towards the nearest open space: down the (smoothed) depth's gradient inside; the surface's normals near it
        outside (or where the gradient is flat)."""
        g = (Q - self.lo) / GRID_MM
        v = -np.stack([ndimage.map_coordinates(c, g.T, order=1, mode="nearest") for c in self.grad], 1)
        _, j = self.tree.query(Q, k)
        n = self.nrm[j].mean(1)
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
        ln = np.linalg.norm(v, axis=1)
        inside = (self.depth(Q) > 0) & (ln > 1e-4)
        n[inside] = v[inside] / ln[inside, None]
        return n


def states(nd: dict) -> list[np.ndarray]:
    """A mesh's positions at rest and in each of its shapes."""
    return [nd["positions"]] + [nd["positions"] + t["positions"] for t in nd["targets"]]


def write(path: Path, nodes: dict, vid: str) -> None:
    out = []
    for s, nd in nodes.items():
        node = {"name": s, "positions": nd["positions"], "normals": normals(nd["positions"], nd["indices"]),
                "indices": nd["indices"], "mode": TRIANGLES}
        if nd["targets"]:
            node["targets"] = [{"name": t["name"], "positions": t["positions"],
                                "normals": t["normals"] if t["normals"] is not None else np.zeros_like(nd["positions"])}
                               for t in nd["targets"]]
        out.append(node)
    write_glb(path, out, {"id": vid})


def lift(art: dict, solid: Solid) -> int:
    """Lift a fitted course's points out of the brainstem with their neighbours; returns how many were inside."""
    nodes = art
    first = None
    for nd in nodes.values():
        P = nd["positions"].copy()
        tree = cKDTree(P)
        for _ in range(ROUNDS):
            dep = np.max([solid.depth(Q - nd["positions"] + P) for Q in states(nd)], axis=0)
            ins = np.nonzero(dep > 0)[0]
            if first is None:
                first = 0
            if not len(ins):
                break
            first = max(first, len(ins))
            need = np.zeros(len(P))
            for i, near in zip(ins, tree.query_ball_point(P[ins], 3 * LIFT_SIGMA_MM)):
                near = np.asarray(near)
                w = np.exp(-np.linalg.norm(P[near] - P[i], axis=1) ** 2 / (2 * LIFT_SIGMA_MM ** 2))
                need[near] = np.maximum(need[near], (dep[i] + CLEAR_MM) * w)
            k = need > 1e-3
            P[k] += solid.outward(P[k]) * np.minimum(need[k], LIFT_STEP_MM)[:, None]
        nd["positions"] = P
    return first or 0


def nudge(art: dict, solid: Solid) -> int:
    """Move this CT's own artery back (posteriorly: its loops lie on the back of the medulla) just clear of the
    brainstem: each point inside it, in any shape, goes back as far as the first open space behind it plus CLEAR_MM, its
    cross-section with it (NUDGE_WHOLE_MM), falling off beyond along the vessel (NUDGE_SIGMA_MM); returns how many were
    inside."""
    back = np.array([0.0, -1.0, 0.0])
    ts = np.arange(0.0, NUDGE_MAX_MM + 1e-9, 0.05)
    first = 0
    for nd in art.values():
        P = nd["positions"].copy()
        tree = cKDTree(P)
        for _ in range(4):
            need_pt = np.zeros(len(P))
            for Q in states(nd):
                Q = Q - nd["positions"] + P
                ins = np.nonzero(solid.depth(Q) > 0)[0]
                for i in ins:
                    out = np.nonzero(solid.depth(Q[i] + ts[:, None] * back) == 0)[0]
                    need_pt[i] = max(need_pt[i], (ts[out[0]] if len(out) else NUDGE_MAX_MM) + CLEAR_MM)
            ins = np.nonzero(need_pt > 0)[0]
            first = max(first, len(ins))
            if not len(ins):
                break
            need = np.zeros(len(P))
            for i, near in zip(ins, tree.query_ball_point(P[ins], NUDGE_WHOLE_MM + 3 * NUDGE_SIGMA_MM)):
                near = np.asarray(near)
                d = np.maximum(np.linalg.norm(P[near] - P[i], axis=1) - NUDGE_WHOLE_MM, 0)
                need[near] = np.maximum(need[near], need_pt[i] * np.exp(-d ** 2 / (2 * NUDGE_SIGMA_MM ** 2)))
            P += need[:, None] * back
        nd["positions"] = P
    return first


def carve(stem: dict, arteries: list[dict]) -> dict:
    """A brainstem part with this CT's own arteries carved out of it (rasterised at GRID_MM): each artery, in every shape,
    widened by CLEAR_MM, and the part's tissue straight behind it (posteriorly, its loops lying on the back of the
    medulla) up to CARVE_BACK_MM, so that it lies in an open channel; the part meshed again (marching cubes, smoothed,
    decimated to its own size), each half (left and right of the midline) on its own, closed. Returns the new nodes, or {} if nothing to do."""
    import trimesh
    from skimage.measure import marching_cubes
    from skullbase_brain import fill
    parts = [(nd["positions"], nd["indices"]) for nd in stem.values()]
    allv = np.vstack([P for P, _ in parts])
    lo = allv.min(0) - 2
    shape = tuple(np.ceil((allv.max(0) + 2 - lo) / GRID_MM).astype(int) + 1)
    solid = np.zeros(shape, bool)
    for P, T in parts:
        solid |= fill(P, T, lo, shape, GRID_MM)
    # the artery (each shape) widened by CLEAR_MM, among the part's voxels: inside it or within CLEAR_MM of its surface
    # (signed along its nearest surface point's normal)
    A = np.vstack([Q for a in arteries for nd in a.values() for Q in states(nd)])
    NA = np.vstack([normals(nd["positions"], nd["indices"]) for a in arteries for nd in a.values() for _ in states(nd)])
    tree = cKDTree(A)
    idx = np.argwhere(solid)
    X = lo + idx * GRID_MM
    d, j = tree.query(X, distance_upper_bound=NEAR_MM)
    near = np.isfinite(d)
    sd = np.full(len(X), np.inf)
    sd[near] = ((X[near] - A[j[near]]) * NA[j[near]]).sum(1)
    art = np.zeros(shape, bool)
    art[tuple(idx[sd < CLEAR_MM].T)] = True
    layer = art & solid
    if not layer.any():
        return {}
    cut = layer.copy()
    for _ in range(int(round(CARVE_BACK_MM / GRID_MM))):       # (y index down is posterior)
        layer = np.roll(layer, -1, axis=1) & solid
        layer[:, -1, :] = False
        if not layer.any():
            break
        cut |= layer
    kept = solid & ~cut
    xs = lo[0] + np.arange(shape[0]) * GRID_MM
    target = sum(len(T) for _, T in parts) // 2
    out = {}
    for name, half in (("L", xs < 0), ("R", xs >= 0)):      # each half meshed on its own: closed, flat at the midline
        vol = np.where(half[:, None, None], kept, False).astype(np.float32)
        v, f, _, _ = marching_cubes(np.pad(ndimage.gaussian_filter(vol, 0.7), 1), 0.5, spacing=(GRID_MM,) * 3)
        m = trimesh.Trimesh(v + lo - GRID_MM, f[:, ::-1], process=True)
        trimesh.smoothing.filter_taubin(m, iterations=10)
        if len(m.faces) > target:
            m = m.simplify_quadric_decimation(face_count=target)
        if m.volume < 0:
            m.invert()
        out[name] = {"positions": np.asarray(m.vertices), "indices": np.asarray(m.faces), "targets": []}
    return out


def clear(items_list: list) -> dict:
    """Clear the arteries in v3's item list off its brainstem (cleared files written, items pointed to them, cards
    noted): a report. Starts again from each item's source (a cleared item back to its source first)."""
    for it in items_list:
        if it.get("clearedFrom"):
            it["file"] = it.pop("clearedFrom")
            it.pop("joinedFrom", None)
            it["derivation"] = " ".join(p for p in it["derivation"].split(" Joined ")[0].split("  ") if p)
            for note in NOTES:
                if note in it["derivation"]:
                    it["derivation"] = it["derivation"][:it["derivation"].index(" " + note)]
    by = {it["name"]: it for it in items_list}
    stem = [read_glb_full(file_of(by[n])) for n in STEM if n in by]
    solid = Solid([(nd["positions"], nd["indices"]) for s in stem for nd in s.values()])
    report, own = {}, []
    for it in items_list:
        if it.get("category") != "artery":
            continue
        nodes = read_glb_full(file_of(it))
        if not any((solid.depth(Q) > 0).any() for nd in nodes.values() for Q in states(nd)):
            continue
        if not (it.get("fitted") or it.get("dataset") == "fitted"):
            own.append((it, nodes))           # this CT's own: the brainstem gives way (below)
            continue
        rest = {s: nd["positions"].copy() for s, nd in nodes.items()}
        n = lift(nodes, solid)
        moved = max(float(np.linalg.norm(nodes[s]["positions"] - rest[s], axis=1).max()) for s in nodes)
        cleared(it, nodes, LIFT_NOTE)
        report[it["name"]] = {"insidePoints": n, "movedMm": round(moved, 2)}
    for name in STEM:
        if name not in by or not own:
            continue
        sit = by[name]
        new = carve(read_glb_full(file_of(sit)), [nodes for _, nodes in own])
        if new:
            cleared(sit, new, CARVE_NOTE.format(", ".join(it["name"].lower() for it, _ in own)))
            report[name] = {"carvedFor": [it["name"] for it, _ in own], "points": sum(len(nd["positions"]) for nd in new.values())}
    return report


def check(items_list: list) -> list[tuple[bool, str]]:
    """For skullbase_v3.py's validation: no artery's surface more than CLEAR_MM inside the brainstem, in any shape."""
    by = {it["name"]: it for it in items_list}
    stem = [read_glb_full(shown(by[n])) for n in STEM if n in by]
    solid = Solid([(nd["positions"], nd["indices"]) for s in stem for nd in s.values()])
    out = []
    for it in items_list:
        if it.get("category") != "artery":
            continue
        nodes = read_glb_full(shown(it))
        worst = max(float(solid.depth(Q).max()) for nd in nodes.values() for Q in states(nd))
        out.append((worst <= CLEAR_MM + GRID_MM, f"{it['name']}: {worst:.1f} mm inside the brainstem"))
    return out


def main() -> int:
    p = GEN / "sbv3-manifest.json"
    m = json.loads(p.read_text())
    rep = clear(m["structures"])
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    print(rep)
    bad = [msg for ok, msg in check(m["structures"]) if not ok]
    print("still inside:", bad or "none")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
