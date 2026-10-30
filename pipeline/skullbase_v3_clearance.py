"""Skull base v3's arteries kept out of the fitted hindbrain: the brainstem and cerebellum are a template fitted into
this CT, the arteries are this CT's own (TopBrain's labels, carried with the brain's shapes) or fitted courses
(Z-Anatomy's), so in places an artery's surface runs into them and seems to pass through (the fitted anterior inferior
and superior cerebellar arteries in the pons; the fitted PICA's branches inside the smooth template cerebellum, which
has no fissures for them to lie in).

  The fitted courses give way: each point inside the brainstem, in each of the artery's shapes (the brainstem does not
  move), is lifted out along the shortest way by its depth plus CLEAR_MM, its neighbours along the vessel with it (a
  Gaussian, LIFT_SIGMA_MM), in rounds of at most LIFT_STEP_MM, so that the tube keeps its shape and comes to lie on the
  surface (lift). Out of the cerebellum they are kept upstream, as centre lines (skullbase_v3.hindbrain_clearance, the
  PICA's in skullbase_v3_pica.py): checked here to lie on it or in its fissures.
  This CT's own arteries: the brainstem gives way, should one lie in it (carve: a channel cut, the tissue straight
  behind it removed, the part meshed again).

A changed mesh is written as a file of its own (<id>.cleared.glb) and v3's item points to it; the file its source wrote
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
CEREBELLUM = ["Cerebellar hemisphere", "Vermis", "Tonsil of cerebellum"]
SHAPES = ("rest", "telovelar", "retrosigmoid")
HINDBRAIN_GRID_MM = 0.35  # the whole hindbrain rasterised this fine (the brainstem alone at GRID_MM)
FISSURE_SHARE = 0.2       # a fitted course on the cerebellum: at most this share of its surface touching it ...
FISSURE_MM = 4.0          # ... at most this deep (its branches lie in the template's narrow fissures)
CLEAR_MM = 0.3          # an artery's clearance off the brainstem
GRID_MM = 0.2           # the brainstem rasterised this fine to find what lies in it
LIFT_SIGMA_MM = 1.5     # a fitted course lifted with its neighbours along it (Gaussian)
LIFT_STEP_MM = 1.0      # ... at most this per round
CARVE_BACK_MM = 3.0     # a channel for this CT's own artery: the tissue behind it removed up to this far
ROUNDS = 60
NEAR_MM = 3.0           # an artery's surface point counts for the brainstem's points this close to it
LIFT_NOTE = " Lifted out of the fitted brainstem and cerebellum where this course ran into them, onto their surface (skullbase_v3_clearance.py)."
CARVE_NOTE = (" Where this CT's own {} lies in it (the fitted template's surface reaching past the artery), a channel is"
              " cut for it: the artery widened by 0.3 mm and the tissue straight behind it removed, the surface meshed again"
              " (skullbase_v3_clearance.py).")
NOTES = ("Lifted out of the fitted brainstem", "Where this CT's own")    # (each note's start)


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

    def __init__(self, parts: list[tuple[np.ndarray, np.ndarray]], grid: float = GRID_MM):
        from skullbase_brain import fill
        self.grid = grid
        allv = np.vstack([P for P, _ in parts])
        self.lo = allv.min(0) - 3
        self.shape = tuple(np.ceil((allv.max(0) + 3 - self.lo) / grid).astype(int) + 1)
        solid = np.zeros(self.shape, bool)
        for P, T in parts:
            solid |= fill(P, T, self.lo, self.shape, grid)
        dep, near = ndimage.distance_transform_edt(solid, return_indices=True)
        self.dep = (dep * grid).astype(np.float32)
        self.near = near.astype(np.int32)        # each voxel's nearest voxel outside
        del dep
        self.surf = allv
        self.nrm = np.vstack([normals(P, T) for P, T in parts])
        self.tree = cKDTree(self.surf)

    def depth(self, Q: np.ndarray) -> np.ndarray:
        ijk = np.rint((Q - self.lo) / self.grid).astype(int)
        ok = (ijk >= 0).all(1) & (ijk < np.array(self.shape)).all(1)
        d = np.zeros(len(Q))
        d[ok] = self.dep[tuple(ijk[ok].T)]
        return d

    def outward(self, Q: np.ndarray, k: int = 8) -> np.ndarray:
        """Towards the nearest open space: inside, straight to the nearest voxel outside (the shortest way out);
        outside, the surface's normals near it."""
        _, j = self.tree.query(Q, k)
        n = self.nrm[j].mean(1)
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
        ijk = np.rint((Q - self.lo) / self.grid).astype(int)
        ok = (ijk >= 0).all(1) & (ijk < np.array(self.shape)).all(1) & (self.depth(Q) > 0)
        out = self.lo + self.near[(slice(None),) + tuple(ijk[ok].T)].T * self.grid
        v = out - Q[ok]
        ln = np.linalg.norm(v, axis=1)
        n[np.nonzero(ok)[0][ln > 1e-6]] = v[ln > 1e-6] / ln[ln > 1e-6, None]
        return n


def states(nd: dict) -> list[np.ndarray]:
    """A mesh's positions at rest and in each of its shapes."""
    return [nd["positions"]] + [nd["positions"] + t["positions"] for t in nd["targets"]]


def shaped(nd: dict, shape: str) -> np.ndarray:
    """A mesh's positions in one shape of the brain (at rest if it has no such shape)."""
    for t in nd["targets"]:
        if t["name"] == shape:
            return nd["positions"] + t["positions"]
    return nd["positions"]


def hindbrain(by: dict, pick=None) -> dict:
    """The fitted brainstem and cerebellum rasterised in each shape of the brain: {shape: Solid}."""
    pick = pick or file_of
    parts = [read_glb_full(pick(by[n])) for n in STEM + CEREBELLUM if n in by]
    return {sh: Solid([(shaped(nd, sh), nd["indices"]) for p in parts for nd in p.values()], HINDBRAIN_GRID_MM) for sh in SHAPES}


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


def lift(art: dict, solids: dict) -> int:
    """Lift a fitted course's points out of the hindbrain (in each shape, against the hindbrain in that shape) with their
    neighbours; returns how many were inside."""
    first = 0
    for nd in art.values():
        P = nd["positions"].copy()
        tree = cKDTree(P)
        for _ in range(ROUNDS):
            # the deepest of its shapes, and the way out there
            dep, way = np.zeros(len(P)), np.zeros((len(P), 3))
            for sh, solid in solids.items():
                Q = shaped(nd, sh) - nd["positions"] + P
                d = solid.depth(Q)
                deeper = d > dep
                if deeper.any():
                    dep[deeper] = d[deeper]
                    way[deeper] = solid.outward(Q[deeper])
            ins = np.nonzero(dep > 0)[0]
            if not len(ins):
                break
            first = max(first, len(ins))
            need, vec = np.zeros(len(P)), np.zeros((len(P), 3))
            for i, near in zip(ins, tree.query_ball_point(P[ins], 3 * LIFT_SIGMA_MM)):
                near = np.asarray(near, int)
                w = (dep[i] + CLEAR_MM) * np.exp(-np.linalg.norm(P[near] - P[i], axis=1) ** 2 / (2 * LIFT_SIGMA_MM ** 2))
                more = w > need[near]
                need[near[more]] = w[more]
                vec[near[more]] = way[i]
            k = need > 1e-3
            P[k] += vec[k] * np.minimum(need[k], LIFT_STEP_MM)[:, None]
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
    stem_solids = {sh: solid for sh in SHAPES}    # (the brainstem does not move; each of an artery's shapes against it)
    report, own = {}, []
    for it in items_list:
        if it.get("category") != "artery":
            continue
        nodes = read_glb_full(file_of(it))
        fitted = it.get("fitted") or it.get("dataset") == "fitted"
        if not fitted:
            if any((solid.depth(Q) > 0).any() for nd in nodes.values() for Q in states(nd)):
                own.append((it, nodes))           # this CT's own: the brainstem gives way (below)
            continue
        if not any((solid.depth(shaped(nd, sh)) > 0).any() for sh in SHAPES for nd in nodes.values()):
            continue
        rest = {s: nd["positions"].copy() for s, nd in nodes.items()}
        n = lift(nodes, stem_solids)
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
    """For skullbase_v3.py's validation: no artery's surface more than CLEAR_MM inside the brainstem, in any shape; no
    fitted course's inside the cerebellum either."""
    by = {it["name"]: it for it in items_list}
    stem = [read_glb_full(shown(by[n])) for n in STEM if n in by]
    solid = Solid([(nd["positions"], nd["indices"]) for s in stem for nd in s.values()])
    solids = hindbrain(by, shown)
    out = []
    for it in items_list:
        if it.get("category") != "artery":
            continue
        nodes = read_glb_full(shown(it))
        worst = max(float(solid.depth(Q).max()) for nd in nodes.values() for Q in states(nd))
        out.append((worst <= CLEAR_MM + GRID_MM, f"{it['name']}: {worst:.1f} mm inside the brainstem"))
        if it.get("fitted") or it.get("dataset") == "fitted":
            # on the cerebellum or in its fissures (the template's narrow slits, where its branches lie: the tube's wall
            # may touch their sides), not through it
            # (in its own shapes: a vessel that does not move with the cerebellum is judged at rest)
            own_shapes = {"rest"} | {t["name"] for nd in nodes.values() for t in nd["targets"]}
            d = [sd.depth(shaped(nd, sh)) for sh, sd in solids.items() if sh in own_shapes for nd in nodes.values()]
            share = max(float((x > 0).mean()) for x in d)
            w2 = max(float(x.max()) for x in d)
            out.append((share <= FISSURE_SHARE and w2 <= FISSURE_MM,
                        f"{it['name']}: {100 * share:.0f} % of it, up to {w2:.1f} mm, inside the cerebellum"))
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
