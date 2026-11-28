"""Skull base v3's cranial nerves at the brainstem's surface: their roots cut there, and the trochlear nerve laid
round it.

The routed nerves (III to XII) are tubes round centre lines that begin at the fitted Z-Anatomy model's root points,
which lie inside the brainstem as it is fitted into this CT's posterior fossa: each nerve began 0.9 to 3.7 mm under the
drawn surface (up to 22 rings of its tube), a stub seen when the brainstem is hidden or drawn see-through (the site
audit's MB-11; the owner's decision of 22 November 2026: cut them).

  Each nerve's tube (skullbase_build.tube: rings, then two caps) loses the rings at its root end whose centres lie more
  than ROOT_IN_MM inside the brainstem (the midbrain, pons and medulla as shown, each filled on its own); the first
  ring kept lies at most that deep, so the nerve still begins in the surface, and the tube is closed there with a new
  cap. The tube keeps its layout (rings, then the two caps), which skullbase_v3_tumours.py reads to move a nerve
  round a tumour; a part before the tube (the facial nerve's specimen mesh) is left as it is.

  The trochlear nerve (ROUND) is not cut but laid round the brainstem. It leaves the back of the brainstem below the
  inferior colliculus and winds round it to the front, and the model's own course for it does not lie on the model's
  own surface: in Z-Anatomy's model, before any fit, it runs 1 to 3 mm inside the pons mesh's upper rim, under the
  midbrain, for its first 38 mm (its first centimetre is the way through the brainstem, from in front of the aqueduct
  across the midline behind it). Routed through the CT (skullbase_nerves.route, which knows bone, not the brain) it
  took a chord through the brainstem: 0.6 to 1.4 mm in it at its start and again up to 4.4 mm under the surface
  further on, and, once the hindbrain was fitted round the fourth ventricle (23 November 2026), in it for its first
  17 to 18 mm, so that the cut left a nerve that began at the front of the pons. So:
    its start is where the fitted course (carried by the posterior fossa fit, skullbase_v3.carry_lines) runs furthest
    back, moved straight back onto the brainstem's surface: the part of that course before it, through the brainstem,
    is not drawn;
    from there to where the routed tube has left the brainstem for good (its first ring from which every ring is
    ROUND_JOIN_MM clear of it) the centre line is the least-cost path over the surface: outside the brainstem (the
    midbrain, pons and medulla as shown, with the superior cerebellar peduncle and the fourth ventricle) and the
    arteries and veins as drawn, its tube ROUND_OFF_MM off them, each step costing more the further it is from the
    fitted course (as skullbase_nerves.route costs it). The cerebellum is no obstacle: where it lies against the
    brainstem the nerve runs between the two, in the cerebellum's mesh;
    the path is smoothed (ROUND_SMOOTH_MM along it, in ROUND_ROUNDS rounds, each followed by a push back out of the
    brainstem and off the vessels that takes the line's neighbouring points along: round an edge of the brainstem the
    line so turns wider than the edge does), with the routed line's next ROUND_BLEND_MM, so that the two meet without
    a corner; the root leaves the surface at a slant (ROOT_SLANT_MM); and it is drawn as rings of the tube's radius
    that carry on from the routed tube's own rings without a twist. The routed tube from the blend's end on (the
    cavernous sinus, the superior orbital fissure) keeps its vertices.
  As laid (23 November 2026): it leaves the back of the pons 6 to 8 mm from the midline, below the inferior
  colliculus, runs forwards in the groove between the pons and the midbrain, for most of the way between the
  posterior cerebral artery above and the superior cerebellar artery below, and comes down in front of the pons to
  the routed course, 39 mm (left) and 36 mm (right) from its root; no ring turns by more than 32 degrees from the
  last. Where the fitted cerebellum lies against the brainstem (its first 7 to 9 mm) it runs inside the cerebellum's
  mesh. Left as it was:
  the routed tube's own double corner (two turns of 60 to 75 degrees within 3 mm) where the nerve reaches the
  cavernous sinus's roof, from skullbase_v3_cavernous.py's splice.

  Not done: the optic and olfactory tracts in the template hemisphere.

Each nerve is taken from the file its source wrote (a nerve this step changed before goes back to it first), and its
changed tube is written as a file of its own (<id>.cleared.glb) that v3's item points to; the source's file is never
changed, and running this again gives the same files.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_roots.py
  (after skullbase_v3_clearance.py and skullbase_v3_junctions.py; then skullbase_v3_tumours.py, whose moved copies of
  the nerves are made from the cut files, compress.mjs skullbase-v3 <the files> and skullbase_v3.py finalize)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_v3_clearance as CL  # noqa: E402
from glb import read_glb_full  # noqa: E402

GEN = ROOT.parent / "src" / "data" / "generated"
STEM = ("Midbrain", "Pons", "Medulla oblongata")
ROOT_IN_MM = 0.5       # a nerve's first ring lies at most this far inside the brainstem
GRID_MM = 0.25         # the grid the brainstem is filled on
MIN_RINGS = 3          # a tube is not cut down to fewer rings than this
NOTE = (" Cut at the brainstem's surface: its routed course began {mm:g} mm inside the fitted brainstem "
        "(skullbase_v3_roots.py).")
# the trochlear nerve, laid round the brainstem
ROUND = ("Trochlear nerve (IV)",)
ROUND_WITH = ("Superior cerebellar peduncle", "Fourth ventricle")   # with the brainstem: what the nerve goes round
ROUND_OFF = ("artery", "vein")   # kept off these too, as drawn
ROUND_OFF_MM = 0.25        # the tube's surface this far off the brainstem and the vessels
ROUND_JOIN_MM = 3.0        # the new course joins the routed tube where that stays this clear of the brainstem
ROOT_SLANT_MM = 1.5        # the root joins the path over the surface this far along it
ROUND_BOX_MM = 8.0         # worked out in a box this far round the stretch
ROUND_SIGMA_MM = 4.0       # a step costs 1 + (distance from the fitted course / this)^2 (skullbase_nerves.SIGMA_MM)
ROUND_SMOOTH_MM = 2.0      # the path smoothed along its length (Gaussian)
ROUND_ROUNDS = 30          # ... in this many rounds, each followed by the push back out of the brainstem and off the vessels
ROUND_FINISH_MM = 0.6      # ... and once more at the end, this lightly, with no push after it
ROUND_HELD_MM = 1.0        # ... but for its root end, held over this length ...
ROUND_BLEND_MM = 3.0       # ... and past the join less and less, over this much of the routed line
ROUND_NOTE = (" Round the brainstem it is laid on the surface (skullbase_v3_roots.py): the routed course ran through the fitted "
              "brainstem there (for {inside:g} mm, up to {deep:g} mm deep). Its first {laid:g} mm are drawn from where the fitted "
              "course runs furthest back, moved straight back onto the brainstem's surface, then over the surface as near the "
              "fitted course as the brainstem and the drawn vessels allow (at most {off:g} mm from it), to where the routed "
              "course has left the brainstem; so drawn it is {right:g} mm long on the right and {left:g} mm on the left. The "
              "fitted course's way through the brainstem to that point is not drawn.")
NOTES = (" Cut at the brainstem's surface", " Round the brainstem it is laid on the surface")     # (each note's start)


def tube_part(V: np.ndarray):
    """As skullbase_v3_tumours.tube_part, with the rings' corner count: (first vertex, centre line, radius, sides)."""
    for sides in (8, 6):
        for n in range((len(V) - 2 * (sides + 1)) // sides, 2, -1):
            s0 = len(V) - n * sides - 2 * (sides + 1)
            ring = V[s0:s0 + n * sides].reshape(n, sides, 3)
            c = ring.mean(1)
            rr = np.linalg.norm(ring - c[:, None], axis=2)
            if rr.std(1).max() <= 0.05 * max(float(rr.mean()), 0.1) and np.linalg.norm(np.diff(c, axis=0), axis=1).max() < 2.0:
                return s0, c, rr.mean(1), sides
    return None


def plain(it: dict) -> bool:
    return not (it.get("tumourView") or it.get("herniationView") or it.get("approach") or it.get("forView"))


def pieces_of(items: list, pick) -> list:
    """[(vertices, triangles)] of the items `pick` chooses, as shown."""
    out = []
    for it in items:
        if plain(it) and pick(it) and CL.shown(it).exists():
            for nd in read_glb_full(CL.shown(it)).values():
                out.append((np.asarray(nd["positions"], float), np.asarray(nd["indices"]).reshape(-1, 3)))
    return out


class Stem:
    """The brainstem as shown (its parts each filled on its own): how deep a point lies in it (mm; negative outside)."""

    def __init__(self, items: list):
        pieces = pieces_of(items, lambda it: it["name"] in STEM and it.get("category") == "hindbrain")
        if len(pieces) < 3:
            raise SystemExit("roots: the brainstem's parts are not all in the manifest")
        allp = np.vstack([p for p, _ in pieces])
        self.lo = allp.min(0) - 3
        shape = tuple(int(x) for x in np.ceil((allp.max(0) + 3 - self.lo) / GRID_MM) + 1)
        mask = np.zeros(shape, bool)
        for p, t in pieces:
            mask |= CL.fill_pieces(p, t, self.lo, shape, GRID_MM)
        self.d = (ndimage.distance_transform_edt(mask, sampling=GRID_MM) - ndimage.distance_transform_edt(~mask, sampling=GRID_MM)).astype(np.float32)

    def depth(self, X: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(self.d, ((X - self.lo) / GRID_MM).T, order=1, mode="constant", cval=-99.0)


def retube(nd: dict, s0: int, rings: np.ndarray, n_old: int) -> None:
    """A tube's node with its rings replaced (in place): the part before the tube kept, the rings' triangles and the
    two caps made anew, wound as the tube was (a mirrored half is wound the other way round)."""
    V = np.asarray(nd["positions"], float)
    T = np.asarray(nd["indices"]).reshape(-1, 3)
    m, sides = rings.shape[:2]
    caps = np.vstack([np.vstack([rings[e].mean(0)[None], rings[e]]) for e in (0, m - 1)])
    tris = []
    for i in range(m - 1):
        for k in range(sides):
            a0, a1 = i * sides + k, i * sides + (k + 1) % sides
            tris += [[a0, a1, a0 + sides], [a1, a1 + sides, a0 + sides]]
    for j, sgn in ((0, -1), (1, 1)):
        c = m * sides + j * (sides + 1)
        for k in range(sides):
            u, w = c + 1 + k, c + 1 + (k + 1) % sides
            tris.append([c, w, u] if sgn < 0 else [c, u, w])
    tris = np.array(tris) + s0
    first = {tuple(np.roll(t, -int(np.argmin(t)))) for t in T[(T >= s0).all(1)][:4 * sides].tolist()}
    probe = np.array([s0, s0 + 1, s0 + sides])
    if tuple(probe) not in first:
        if tuple(np.roll(probe[::-1], -int(np.argmin(probe[::-1])))) not in first:
            raise SystemExit("roots: the tube's triangles are not laid out as skullbase_build.tube lays them")
        tris = tris[:, ::-1]
    prefix = T[(T < s0).all(1)]
    if len(prefix) + (n_old - 1) * sides * 2 + 2 * sides != len(T):
        raise SystemExit("roots: triangles join the tube to the part before it")
    nd["positions"] = np.vstack([V[:s0], rings.reshape(-1, 3), caps]).astype(np.float32)
    nd["indices"] = np.vstack([prefix, tris]).astype(np.uint32)


def cut_node(nd: dict, stem: Stem) -> dict | None:
    """A nerve's half cut at its root end (in place): the rings deeper than ROOT_IN_MM in the brainstem removed, the
    tube capped anew. Returns what was cut, or None (no tube, or its root is not that deep)."""
    V = np.asarray(nd["positions"], float)
    tp = tube_part(V)
    if tp is None or nd["targets"]:
        return None
    s0, C, R, sides = tp
    n = len(C)
    deep = stem.depth(C) > ROOT_IN_MM
    a = int(np.argmin(deep)) if deep[0] else 0              # rings to drop at the start ...
    b = int(np.argmin(deep[::-1])) if deep[-1] else 0       # ... and at the end
    if deep.all() or n - a - b < MIN_RINGS:
        raise SystemExit(f"roots: a tube with {n} rings would keep {n - a - b}")
    if not (a or b):
        return None
    rings = V[s0:s0 + n * sides].reshape(n, sides, 3)[a:n - b]
    retube(nd, s0, rings, n)
    arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    return {"ringsCut": a + b, "lengthCutMm": round(float(arc[a] + (arc[-1] - arc[n - 1 - b])), 1),
            "deepestMm": round(float(stem.depth(C).max()), 1), "wasInsideMm": round(float(stem.depth(C[[0, -1]]).max()), 1),
            "nowInsideMm": round(float(stem.depth(rings.mean(1)[[0, -1]]).max()), 2)}


# ---------------------------------------------------------------- the trochlear nerve round the brainstem
class Box:
    """A box of the frame on a grid: what lies in it, and how deep a point lies in that (mm; negative outside). Solid
    pieces are filled (each connected piece on its own, as skullbase_v3_clearance.fill_pieces, on a grid of its whole
    extent: skullbase_brain.fill wants the mesh inside its grid); of the others (vessels, thin beside the tube) only
    the surface counts: depth 0 on it, negative off it on either side."""

    def __init__(self, lo: np.ndarray, hi: np.ndarray, pieces: list, solid: bool = True, grid: float = GRID_MM):
        import trimesh
        from skullbase_brain import fill
        self.lo, self.grid = np.asarray(lo, float), grid
        hi = np.asarray(hi, float)
        self.shape = tuple(int(x) for x in np.ceil((hi - self.lo) / grid) + 1)
        self.mask = np.zeros(self.shape, bool)
        n = np.array(self.shape)
        for P, T in pieces:
            if (P.max(0) < self.lo).any() or (P.min(0) > hi).any():
                continue
            if not solid:
                near = ((P >= self.lo - 1.0) & (P <= hi + 1.0)).all(1)
                f = T[near[T].any(1)]
                if not len(f):
                    continue
                v, _ = trimesh.remesh.subdivide_to_size(P, f, max_edge=grid, max_iter=20)
                q = np.rint((v - self.lo) / grid).astype(int)
                q = q[(q >= 0).all(1) & (q < n).all(1)]
                self.mask[tuple(q.T)] = True
                continue
            for piece in trimesh.Trimesh(P, T, process=True).split(only_watertight=False):
                v, f = np.asarray(piece.vertices), np.asarray(piece.faces)
                a = np.floor((v.min(0) - self.lo) / grid).astype(int) - 1
                b = np.ceil((v.max(0) - self.lo) / grid).astype(int) + 2
                if (b <= 0).any() or (a >= n).any():
                    continue
                m = fill(v, f, self.lo + a * grid, tuple(b - a), grid)
                c0, c1 = np.maximum(a, 0), np.minimum(b, n)
                self.mask[c0[0]:c1[0], c0[1]:c1[1], c0[2]:c1[2]] |= m[c0[0] - a[0]:c1[0] - a[0], c0[1] - a[1]:c1[1] - a[1], c0[2] - a[2]:c1[2] - a[2]]
        if not self.mask.any():                                  # (nothing of it in the box)
            self.d = np.full(self.shape, -99.0, np.float32)
        elif solid:
            self.d = (ndimage.distance_transform_edt(self.mask, sampling=grid)
                      - ndimage.distance_transform_edt(~self.mask, sampling=grid)).astype(np.float32)
        else:
            self.d = (-ndimage.distance_transform_edt(~self.mask, sampling=grid)).astype(np.float32)
        self.g = np.stack(np.gradient(ndimage.gaussian_filter(self.d, 1.0), grid), -1)

    def ijk(self, X: np.ndarray) -> np.ndarray:
        return (np.atleast_2d(X) - self.lo) / self.grid

    def depth(self, X: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(self.d, self.ijk(X).T, order=1, mode="nearest")

    def outward(self, X: np.ndarray) -> np.ndarray:
        """The way out of it (unit vectors): against its depth's gradient."""
        q = self.ijk(X).T
        v = -np.stack([ndimage.map_coordinates(self.g[..., k], q, order=1, mode="nearest") for k in range(3)], 1)
        return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)


def fitted_courses(names) -> dict:
    """{(name, side): the fitted course's points} as skullbase_v3.py routes them: Skull base v2's fitted line, carried by
    the posterior fossa fit."""
    import skullbase_v3 as V3
    import skullbase_v3_base as BASE
    ex2 = json.loads((V3.ROOT / "data" / "build" / "skullbase-ct" / "export.json").read_text())
    V3.carry_lines(ex2)
    out = {}
    for name, _, sources, max_mm in BASE.NERVES:
        if name in names:
            for side in ("R", "L"):
                out[(name, side)] = BASE.fitted_course(ex2, sources, side, max_mm)[:, :3]
    return out


def resampled(P: np.ndarray, step: float) -> np.ndarray:
    d = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    n = max(int(round(d[-1] / step)), 1)
    t = np.linspace(0.0, d[-1], n + 1)
    return np.stack([np.interp(t, d, P[:, k]) for k in range(3)], 1)


def surface_path(body: Box, off: Box, r: float, F: np.ndarray, start: np.ndarray, end: np.ndarray) -> np.ndarray:
    """The least-cost path from start to end through the box's open space: outside the body and the vessels by the
    tube's radius and ROUND_OFF_MM, each step costing 1 + (its distance from the fitted course F / ROUND_SIGMA_MM)^2
    times its length."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra
    g = body.grid
    free = (body.d <= -(r + ROUND_OFF_MM)) & (off.d <= -(r + ROUND_OFF_MM))
    seed = np.zeros(body.shape, bool)
    q = np.rint(body.ijk(resampled(F, 0.5 * g))).astype(int)
    ok = (q >= 0).all(1) & (q < np.array(body.shape)).all(1)
    seed[tuple(q[ok].T)] = True
    cost = 1.0 + (ndimage.distance_transform_edt(~seed, sampling=g) / ROUND_SIGMA_MM) ** 2
    nodes = np.argwhere(free)
    idx = -np.ones(body.shape, np.int64)
    idx[tuple(nodes.T)] = np.arange(len(nodes))
    rows, cols, w = [], [], []
    for dv in [(i, j, k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1) if (i, j, k) > (0, 0, 0)]:
        nb = nodes + np.array(dv)
        okn = (nb >= 0).all(1) & (nb < np.array(body.shape)).all(1)
        a_, j_ = np.nonzero(okn)[0], idx[tuple(nb[okn].T)]
        keep = j_ >= 0
        a_, j_ = a_[keep], j_[keep]
        rows.append(a_)
        cols.append(j_)
        w.append(0.5 * (cost[tuple(nodes[a_].T)] + cost[tuple(nodes[j_].T)]) * np.sqrt(sum(x * x for x in dv)) * g)
    rows, cols, w = map(np.concatenate, (rows, cols, w))
    G = coo_matrix((np.r_[w, w], (np.r_[rows, cols], np.r_[cols, rows])), shape=(len(nodes),) * 2).tocsr()

    def nearest(p):
        return int(np.argmin(np.linalg.norm(nodes - body.ijk(p)[0], axis=1)))
    a0, b0 = nearest(start), nearest(end)
    dist, pred = dijkstra(G, indices=a0, return_predecessors=True)
    if not np.isfinite(dist[b0]):
        raise SystemExit("roots: no way round the brainstem in the box")
    path = [b0]
    while path[-1] != a0:
        path.append(int(pred[path[-1]]))
    return body.lo + nodes[path[::-1]] * g


def transported(rings_at: np.ndarray, centre_at: np.ndarray, H: np.ndarray, r: float) -> np.ndarray:
    """Rings round the centre line H (which ends one step before centre_at) that carry on, without a twist, from the
    ring rings_at round centre_at: its corners' offsets carried back along H, each step turned by the least rotation
    between the two tangents (parallel transport, as skullbase_build.tube makes its frames), kept square to the line."""
    O = rings_at - centre_at
    L = np.vstack([H, centre_at[None]])
    T = np.gradient(L, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    t_prev = np.cross(O[0], O[1])                      # the kept ring's own plane ...
    t_prev /= np.linalg.norm(t_prev)
    if t_prev @ T[-1] < 0:                             # ... (a mirrored half's corners run the other way round)
        t_prev = -t_prev
    out = []
    for i in range(len(H) - 1, -1, -1):
        v, c = np.cross(t_prev, T[i]), float(t_prev @ T[i])
        K = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
        O = O @ (np.eye(3) + K + K @ K / (1.0 + c)).T
        O = O - np.outer(O @ T[i], T[i])
        O *= r / np.linalg.norm(O, axis=1, keepdims=True)
        out.append(H[i] + O)
        t_prev = T[i]
    return np.array(out[::-1])


def round_node(nd: dict, F: np.ndarray, stem: Stem, items: list) -> dict | None:
    """A nerve's half laid round the brainstem (in place; see the module's text): its tube's rings up to the join
    replaced by rings round the path over the surface. Returns what was done, or None (no tube, or none of it lies in
    the brainstem)."""
    V = np.asarray(nd["positions"], float)
    tp = tube_part(V)
    if tp is None or nd["targets"]:
        return None
    s0, C, R, sides = tp
    n, r = len(C), float(R.mean())
    dC = stem.depth(C)
    if not (dC > ROOT_IN_MM).any():
        return None
    near = np.nonzero(dC > -(r + ROUND_JOIN_MM))[0]
    j = int(near.max()) + 1                                  # the join: from here on the routed tube is clear of it
    if n - j < MIN_RINGS:
        raise SystemExit("roots: the routed tube never leaves the brainstem")
    # the fitted course from where it runs furthest back (among its points in or by the brainstem) to the join
    by = np.nonzero(stem.depth(F) > -(r + ROUND_JOIN_MM))[0]
    k0 = int(by[np.argmin(F[by, 1])])
    k1 = int(np.argmin(np.linalg.norm(F - C[j], axis=1)))
    if k1 <= k0:
        raise SystemExit("roots: the fitted course does not run from the back of the brainstem to the join")
    guide = np.vstack([F[k0:k1 + 1], C[j][None]])
    lo, hi = guide.min(0) - ROUND_BOX_MM, guide.max(0) + ROUND_BOX_MM
    body = Box(lo, hi, pieces_of(items, lambda it: it.get("category") == "hindbrain" and it["name"] in STEM + ROUND_WITH))
    off = Box(lo, hi, pieces_of(items, lambda it: it.get("category") in ROUND_OFF), solid=False)
    # straight back from there: the root in the surface, and the first open point behind it
    t = np.arange(0.0, ROUND_BOX_MM, 0.25 * GRID_MM)
    ray = F[k0] + t[:, None] * np.array([0.0, -1.0, 0.0])
    d_ray = body.depth(ray)
    inside = np.nonzero(d_ray >= ROOT_IN_MM - GRID_MM)[0]
    if not len(inside):
        raise SystemExit("roots: the fitted course's furthest point back is not in the brainstem")
    root = ray[inside.max()]
    out = np.nonzero((d_ray <= -(r + ROUND_OFF_MM)) & (off.depth(ray) <= -(r + ROUND_OFF_MM)) & (t > t[inside.max()]))[0]
    if not len(out):
        raise SystemExit("roots: no open space behind the brainstem within the box")
    P = surface_path(body, off, r, guide, ray[out.min()], C[j])
    # root, path, then the routed centre line, smoothed along its length and kept off the body and the vessels: in full
    # up to the join, less and less over the routed line's next ROUND_BLEND_MM (so the two meet without a corner: the
    # path comes to the join from where the surface lets it, not along the routed line), not at all beyond that
    arcC = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    jb = int(np.argmax(arcC >= arcC[j] + ROUND_BLEND_MM)) if arcC[-1] >= arcC[j] + ROUND_BLEND_MM else n
    if n - jb < MIN_RINGS:
        raise SystemExit("roots: the routed tube ends within the blend past the join")
    step = 0.5 * GRID_MM
    # (the nerve leaves the surface at a slant: the path's first ROOT_SLANT_MM, straight out of the surface over the
    # root, is left out)
    along = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    P = P[min(int(np.argmax(along >= ROOT_SLANT_MM)), len(P) - 2):]
    head = resampled(np.vstack([root[None], P, C[j:jb + 1]]), step)
    tail = resampled(C[jb:min(jb + 6, n)], step)[1:]
    L = np.vstack([head, tail])
    arc = np.arange(len(L)) * step
    w = np.clip(np.minimum(arc / ROUND_HELD_MM, (arc[len(head) - 1] - arc) / ROUND_BLEND_MM), 0, 1)[:, None]
    w = w * w * (3 - 2 * w)
    L0 = L.copy()
    for _ in range(ROUND_ROUNDS):
        S = ndimage.gaussian_filter1d(L, ROUND_SMOOTH_MM / step, axis=0, mode="nearest")
        L = w * S + (1 - w) * L0                             # (held to the line as it began where w is low: round after round)
        for box in (body, off):
            # (a point the smoothing drew in goes out again by what it needs, its neighbours along the line by their
            # share of that push, as skullbase_v3.hindbrain_clearance spreads its pushes: round a sharp edge of the
            # brainstem, or over a vessel lying on it, the line so lifts off a little either side and turns wider
            # than the edge does)
            need = np.clip(box.depth(L) + r + ROUND_OFF_MM, 0, None)[:, None] * w
            D = need * box.outward(L)
            Ds = w * ndimage.gaussian_filter1d(D, ROUND_SMOOTH_MM / step, axis=0, mode="nearest")
            L = L + np.where(np.linalg.norm(Ds, axis=1, keepdims=True) > need, Ds, D)
    # (the pushes follow the grid's steps, a few tenths of a millimetre from ring to ring: smoothed out lightly, which
    # may bring the tube's surface back to the brainstem's by less than ROUND_OFF_MM)
    L = w * ndimage.gaussian_filter1d(L, ROUND_FINISH_MM / step, axis=0, mode="nearest") + (1 - w) * L0
    ds = float(np.median(np.linalg.norm(np.diff(C, axis=0), axis=1)))
    H = resampled(L[:len(head)], ds)[:-1]                    # (ring centres, as far apart as the tube's own; the ring at the blend's end is kept)
    old = V[s0:s0 + n * sides].reshape(n, sides, 3)
    rings = np.vstack([transported(old[jb], C[jb], H, r), old[jb:]])
    retube(nd, s0, rings, n)
    from scipy.spatial import cKDTree
    T = np.diff(rings.mean(1)[:len(H) + 3], axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    return {"ringsReplaced": jb, "ringsLaid": len(H), "laidMm": round(float(np.linalg.norm(np.diff(np.vstack([H, C[jb][None]]), axis=0), axis=1).sum()), 1),
            "sharpestTurnDeg": round(float(np.degrees(np.arccos(np.clip((T[:-1] * T[1:]).sum(1), -1, 1))).max()), 1),
            "routedInsideMm": round(float(arcC[np.nonzero(dC > 0)[0].max()]), 1), "routedDeepestMm": round(float(dC.max()), 1),
            "fromFittedMaxMm": round(float(cKDTree(resampled(guide, 0.25)).query(H)[0].max()), 1),
            "rootInsideMm": round(float(stem.depth(H[:1])[0]), 2), "deepestMm": round(float(stem.depth(H).max()), 2),
            "nearestVesselMm": round(float(-off.depth(H).max()) - r, 2), "start": np.round(H[0], 1).tolist(),
            "lengthMm": round(float(np.linalg.norm(np.diff(rings.mean(1), axis=0), axis=1).sum()), 1)}


def nerves(items: list) -> list:
    return [it for it in items if it.get("category") == "nerve" and plain(it)]


def check(items: list) -> list[tuple[bool, str]]:
    """For skullbase_v3.py's validation: no routed nerve's tube begins or ends more than ROOT_IN_MM (and the grid) inside
    the brainstem, and none of a nerve laid round it (ROUND) runs in it."""
    stem = Stem(items)
    out = []
    for it in nerves(items):
        if not CL.shown(it).exists():
            continue
        for side, nd in read_glb_full(CL.shown(it)).items():
            tp = tube_part(np.asarray(nd["positions"], float))
            if tp is None:
                continue
            d = float(stem.depth(tp[1][[0, -1]]).max())
            out.append((d <= ROOT_IN_MM + GRID_MM, f"{it['name']} {side}: its tube begins {d:.1f} mm inside the brainstem"))
            if it["name"] in ROUND:
                d = float(stem.depth(tp[1]).max())
                out.append((d <= ROOT_IN_MM + GRID_MM, f"{it['name']} {side}: its centre line runs up to {d:.1f} mm inside the brainstem"))
    return out


def main() -> int:
    p = GEN / "sbv3-manifest.json"
    m = json.loads(p.read_text())
    # each nerve from the file its source wrote (one this step changed before goes back to it; the clearance, which
    # runs before this in v3's chain, has done so already)
    for it in nerves(m["structures"]):
        for note in NOTES:
            if note in it["derivation"]:
                if it.get("clearedFrom") and not it.get("joinedFrom"):
                    it["file"] = it.pop("clearedFrom")
                it["derivation"] = it["derivation"][:it["derivation"].index(note)]
    stem = Stem(m["structures"])
    courses = fitted_courses(ROUND)
    rep, laid = {}, {}
    for it in nerves(m["structures"]):
        if not CL.shown(it).exists():        # (the chiasm and optic tracts: skullbase_v3_chiasm.py draws them after this)
            continue
        nodes = read_glb_full(CL.shown(it))
        if it["name"] in ROUND:
            done = {side: c for side, nd in nodes.items() if (c := round_node(nd, courses[(it["name"], side)], stem, m["structures"]))}
            note = ROUND_NOTE.format(inside=max(c["routedInsideMm"] for c in done.values()), deep=max(c["routedDeepestMm"] for c in done.values()),
                                     laid=max(c["laidMm"] for c in done.values()), off=max(c["fromFittedMaxMm"] for c in done.values()),
                                     right=done["R"]["lengthMm"], left=done["L"]["lengthMm"]) if len(done) == 2 else ""
            if len(done) == 1:
                raise SystemExit(f"{it['name']}: laid round the brainstem on one side only")
            if done:
                laid[it["name"]] = done
        else:
            done = {side: c for side, nd in nodes.items() if (c := cut_node(nd, stem))}
            note = NOTE.format(mm=max(c["wasInsideMm"] for c in done.values())) if done else ""
            if done:
                rep[it["name"]] = done
        if not done:
            continue
        if it.get("clearedFrom") or it.get("joinedFrom"):
            raise SystemExit(f"{it['name']}: cleared or joined by an earlier step, which this step does not handle")
        CL.cleared(it, nodes, note)
        for side in done:
            if side in it.get("centroid", {}):
                it["centroid"][side] = np.round(np.asarray(nodes[side]["positions"], float).mean(0), 2).tolist()
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    for k, v in {**rep, **laid}.items():
        print(k, v)
    bad = [msg for ok, msg in check(m["structures"]) if not ok]
    print("still inside:", bad or "none")
    from modifications import record
    if rep:
        record("sbv3", "skullbase_v3_roots", "the routed cranial nerves cut at the brainstem's surface (their courses began inside the fitted brainstem)",
               list(rep), {"rootInMm": ROOT_IN_MM, "gridMm": GRID_MM}, rep, {"failed": bad})
    if laid:
        record("sbv3", "skullbase_v3_roots_round", "the trochlear nerve laid round the brainstem on its surface (its routed course ran through the fitted brainstem)",
               list(laid), {"offMm": ROUND_OFF_MM, "joinMm": ROUND_JOIN_MM, "sigmaMm": ROUND_SIGMA_MM, "smoothMm": ROUND_SMOOTH_MM, "blendMm": ROUND_BLEND_MM, "gridMm": GRID_MM},
               laid, {"failed": bad})
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
