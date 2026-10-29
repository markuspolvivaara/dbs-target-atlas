"""Vascular section: the lesions, drawn by rule onto this CT angiogram's vessels and the fitted brain (vascular_build.py).

Every lesion is a drawing, not a patient's: its place is chosen to show the type (the sites where saccular aneurysms are
commonest, an arteriovenous malformation of each Spetzler-Martin grade's make-up, a dural fistula at the transverse-sigmoid
junction, direct and indirect carotid-cavernous fistulas), its shape and size are illustrative, and its vessels join
this CT's own where they would.

  Aneurysms: saccular ones where this CT's arteries meet (the anterior communicating artery; the internal carotid at the
  posterior communicating and ophthalmic arteries; the middle cerebral bifurcation; the basilar tip; the vertebral artery
  at the PICA), each a dome on a neck, joined smoothly (an implicit surface); a fusiform one on the basilar trunk (the
  whole circumference widened over a length, no neck); a blister on the internal carotid's dorsal wall.
  Arteriovenous malformations: a nidus drawn as a network (after Jain 2019's theoretical model): tortuous plexiform
  vessels between junctions in an irregular, lobulated envelope of the chosen greatest diameter, a compartment for each
  feeder and larger fistulous channels from a feeder to a draining vein; compact (clear margins) or diffuse (brain left
  between its vessels, margins unravelled: Wu 2024). Feeders from the nearest of this CT's arteries that supply that
  territory, dilated, branching into their compartments; tortuous draining veins to this CT's sinuses: superficial
  (superior sagittal or transverse sinus) or deep (the vein of Galen, straight sinus).
  Dural fistula: feeders from this CT's middle meningeal artery and an occipital artery branch drawn through the bone,
  the fistula on the right transverse-sigmoid junction's wall; drainage into the sinus (on to the jugular vein, and back
  along the transverse sinus) and back into a cortical vein over the temporal lobe.
  Carotid-cavernous fistulas: direct, the cavernous carotid opening into the sinus; indirect, small dural branches of
  the carotid (in the sinus) and of the external carotid (through the foramina ovale and spinosum) feeding its wall.
"""
from __future__ import annotations

import json

import numpy as np
from scipy.spatial import cKDTree

import vascular_build as VB

RNG = np.random.default_rng(7)


# ---------------------------------------------------------------- geometry helpers
def catmull(P: np.ndarray, step: float = 0.5, closed: bool = False) -> np.ndarray:
    """A smooth curve through points (centripetal-ish uniform Catmull-Rom), resampled every `step` mm."""
    P = np.asarray(P, float)
    Q = np.vstack([P[-1], P, P[0], P[1]]) if closed else np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        n = max(2, int(np.linalg.norm(p2 - p1) / (step / 3)))
        for t in np.linspace(0, 1, n, endpoint=False):
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(Q[-2] if not closed else Q[1])
    out = np.array(out)
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(out, axis=0), axis=1))]
    s = np.arange(0, d[-1], step)
    return np.stack([np.interp(s, d, out[:, k]) for k in range(3)], 1)


def tube(P: np.ndarray, r: np.ndarray, sides: int = 8) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """A tube round a centre line with a radius per point, closed with caps: positions, normals, triangles, and each
    vertex's centre-line index."""
    r = np.broadcast_to(np.asarray(r, float), (len(P),))
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    a = np.array([1.0, 0, 0]) if abs(T[0, 0]) < 0.9 else np.array([0, 1.0, 0])
    N = [np.cross(T[0], a) / np.linalg.norm(np.cross(T[0], a))]
    for i in range(1, len(P)):
        n = N[-1] - T[i] * np.dot(N[-1], T[i])
        ln = np.linalg.norm(n)
        N.append(n / ln if ln > 1e-9 else N[-1])
    N = np.array(N)
    B = np.cross(T, N)
    ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    dirs = np.cos(ang)[None, :, None] * N[:, None, :] + np.sin(ang)[None, :, None] * B[:, None, :]
    pos = np.vstack([(P[:, None, :] + r[:, None, None] * dirs).reshape(-1, 3), P[[0, -1]]])
    nrm = np.vstack([dirs.reshape(-1, 3), -T[0], T[-1]])
    idx = np.r_[np.repeat(np.arange(len(P)), sides), 0, len(P) - 1]
    tris = []
    for i in range(len(P) - 1):
        for k in range(sides):
            a_, b_ = i * sides + k, i * sides + (k + 1) % sides
            tris += [[a_, b_, b_ + sides], [a_, b_ + sides, a_ + sides]]
    c0, c1 = len(P) * sides, len(P) * sides + 1
    for k in range(sides):
        tris += [[c0, (k + 1) % sides, k], [c1, (len(P) - 1) * sides + k, (len(P) - 1) * sides + (k + 1) % sides]]
    return pos, nrm, np.array(tris), idx


def implicit_mesh(sdf, lo: np.ndarray, hi: np.ndarray, step: float = 0.15):
    """The zero surface of a signed distance function on a box (marching cubes): positions, triangles."""
    from skimage.measure import marching_cubes
    ax = [np.arange(lo[k], hi[k] + step, step) for k in range(3)]
    G = np.stack(np.meshgrid(*ax, indexing="ij"), -1)
    vol = sdf(G.reshape(-1, 3)).reshape(G.shape[:3])
    v, f, _, _ = marching_cubes(vol, 0.0, spacing=(step, step, step))
    return v + lo, f[:, ::-1].copy()


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)


def capsule(P, a, b, r):
    pa, ba = P - a, b - a
    h = np.clip((pa @ ba) / (ba @ ba), 0, 1)
    return np.linalg.norm(pa - h[:, None] * ba, axis=1) - r


def unit(v):
    v = np.asarray(v, float)
    return v / (np.linalg.norm(v) + 1e-12)


# ---------------------------------------------------------------- this CT's vessels
class Vessels:
    """The normal vessels by (name, side) with their arrival times, for finding sites and timing what joins them."""

    def __init__(self, vessels: list[dict], t_art: dict, t_ven: dict):
        self.mesh, self.t = {}, {}
        for v in vessels:
            for n, (P, T) in v["nodes"].items():
                self.mesh[(v["name"], n)] = (P, T)
                self.t[(v["name"], n)] = (t_art if v["category"] == "artery" else t_ven)[(v["name"], n)]

    def get(self, name: str, side: str):
        for s in (side, "R", "L"):
            if (name, s) in self.mesh:
                return self.mesh[(name, s)], self.t[(name, s)]
        raise KeyError(name)

    def nearest(self, name: str, side: str, p: np.ndarray) -> tuple[np.ndarray, float, np.ndarray]:
        """The vessel's vertex nearest p, its arrival and outward normal."""
        (P, T), t = self.get(name, side)
        i = int(np.argmin(np.linalg.norm(P - p, axis=1)))
        return P[i], float(t[i]), VB.normals(P, T)[i]

    def contact(self, a: str, b: str, side: str) -> np.ndarray:
        """Where two vessels meet: the middle of the closest pairs of their vertices."""
        (Pa, _), _ = self.get(a, side)
        (Pb, _), _ = self.get(b, side)
        d, j = cKDTree(Pb).query(Pa)
        k = np.argsort(d)[:30]
        return (Pa[k] + Pb[j[k]]) / 2

    def axis(self, name: str, side: str, p: np.ndarray, reach: float = 6.0) -> np.ndarray:
        (P, _), _ = self.get(name, side)
        Q = P[np.linalg.norm(P - p, axis=1) < reach]
        return np.linalg.svd(Q - Q.mean(0), full_matrices=False)[2][0]


# ---------------------------------------------------------------- aneurysms
ANEURYSMS = [  # id, name, parent, branch (None: its tip), side, dome radius, neck radius, how the dome points
    ("acom", "Anterior communicating artery aneurysm", "Anterior communicating artery", None, "R", 3.0, 1.6, "anterior"),
    ("pcom", "Posterior communicating artery aneurysm", "Internal carotid artery", "Posterior communicating artery", "R", 3.5, 1.9, "out"),
    ("mca", "Middle cerebral artery bifurcation aneurysm", "Middle cerebral artery (M1 segment)", "Middle cerebral artery (M2 segment)", "R", 3.5, 2.0, "along"),
    ("basilar", "Basilar tip aneurysm", "Basilar artery", None, "R", 4.0, 2.2, "along"),
    ("ophthalmic", "Ophthalmic segment (paraclinoid) aneurysm", "Internal carotid artery", "Ophthalmic artery", "L", 3.5, 2.0, "up"),
    ("pica", "Vertebral artery–PICA aneurysm", "Vertebral artery", "Posterior inferior cerebellar artery", "L", 2.5, 1.4, "out"),
]


def saccular(V: Vessels, parent, branch, side, R, rn, how) -> tuple[np.ndarray, np.ndarray, np.ndarray, float, dict]:
    (Pp, Tp), tp = V.get(parent, side)
    if branch:
        site = V.contact(parent, branch, side).mean(0)
    elif parent == "Basilar artery":
        site = Pp[np.argmax(Pp[:, 2])]
    else:
        site = Pp.mean(0)
    i = int(np.argmin(np.linalg.norm(Pp - site, axis=1)))
    base, n0 = Pp[i], VB.normals(Pp, Tp)[i]
    ax = V.axis(parent, side, base)
    if how == "along":                  # on the line of the inflow: from the parent 8-15 mm back, on through the site
        dd = np.linalg.norm(Pp - base, axis=1)
        back = Pp[(dd > 8) & (dd < 15)]
        d = unit(base - (back.mean(0) if len(back) else Pp.mean(0)))
    elif how == "anterior":
        d = unit(np.array([0.0, 1.0, 0.4]))
    elif how == "up":
        d = unit(n0 + np.array([0, 0, 1.0]))
    else:
        d = unit(n0 - (n0 @ ax) * ax)
    centre = base + d * (R + 0.6 * rn)

    def sdf(P):
        return smin(np.linalg.norm(P - centre, axis=1) - R, capsule(P, base - d * rn * 0.6, centre, rn), 1.0)
    lo, hi = np.minimum(base, centre) - R - 2.5, np.maximum(base, centre) + R + 2.5
    v, f = implicit_mesh(sdf, lo, hi)
    t0 = float(tp[i])
    arr = t0 + 0.05 + np.clip((v - base) @ d, 0, None) / 200.0
    return v, f, arr, t0, {"siteMm": np.round(base, 1).tolist(), "domeDiameterMm": 2 * R, "neckMm": round(2 * rn, 1),
                           "direction": np.round(d, 2).tolist()}


def fusiform(V: Vessels) -> tuple:
    """The basilar trunk widened all round over FUSI_LEN_MM: a tube on its centre line (slices along its axis), its radius
    swelling to FUSI_GAIN times the artery's own."""
    (P, T), t = V.get("Basilar artery", "R")
    ax = np.linalg.svd(P - P.mean(0), full_matrices=False)[2][0]
    ax = ax if ax[2] > 0 else -ax
    s = (P - P.mean(0)) @ ax
    cs, rs, ts = [], [], []
    for x in np.arange(s.min() + 2, s.max() - 2, 0.5):
        k = np.abs(s - x) < 0.6
        if k.sum() < 6:
            continue
        c = P[k].mean(0)
        cs.append(c); rs.append(float(np.median(np.linalg.norm(P[k] - c, axis=1)))); ts.append(float(t[k].mean()))
    C, r0, tt = np.array(cs), np.array(rs), np.array(ts)
    mid = len(C) // 2
    arc = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    u = (arc - arc[mid]) / (FUSI_LEN_MM / 2)
    bump = np.clip(1 - u ** 2, 0, None) ** 1.5
    R = r0 * (1 + (FUSI_GAIN - 1) * bump)
    sel = bump > 0.02
    pos, nrm, tri, idx = tube(C[sel], R[sel], 16)
    return pos, tri, tt[sel][idx] + 0.05, {"lengthMm": FUSI_LEN_MM, "widestMm": round(float(2 * R.max()), 1),
                                            "arteryMm": round(float(2 * np.median(r0)), 1)}


FUSI_LEN_MM = 12.0
FUSI_GAIN = 2.2
BLISTER_MM = (1.3, 1.6)    # the blister's base radius and height (illustrative)


def blister(V: Vessels) -> tuple:
    """A broad-based bleb on the right internal carotid's dorsal (upper) wall, just past the ophthalmic artery."""
    (P, T), t = V.get("Internal carotid artery", "R")
    site0 = V.contact("Internal carotid artery", "Ophthalmic artery", "R").mean(0)
    N = VB.normals(P, T)
    near = np.linalg.norm(P - site0, axis=1) < 7
    cand = np.nonzero(near & (N[:, 2] > 0.6))[0]
    i = int(cand[np.argmax(P[cand, 2])]) if len(cand) else int(np.argmin(np.linalg.norm(P - site0, axis=1)))
    base, n = P[i], N[i]
    rb, hb = BLISTER_MM
    centre = base + n * (hb - rb * 0.6)

    def sdf(Q):
        e = (Q - centre) / np.array([rb, rb, rb])
        return smin(np.linalg.norm(e, axis=1) * rb - rb, np.linalg.norm(Q - base, axis=1) - 0.6, 0.8)
    v, f = implicit_mesh(sdf, np.minimum(base, centre) - 3, np.maximum(base, centre) + 3, 0.1)
    return v, f, np.full(len(v), float(t[i]) + 0.05), {"siteMm": np.round(base, 1).tolist(), "baseMm": 2 * rb, "heightMm": hb}


# ---------------------------------------------------------------- arteriovenous malformations
AVMS = [
    # id, name, where (lobe, side, rule), nidus diameter (mm), feeders [(vessel, side)], drainage [(vessel, side, kind)],
    # Spetzler-Martin points (size, eloquence, deep drainage)
    ("avm1", "AVM, Spetzler–Martin grade I", ("frontal", "R", "pole"), 22.0,
     [("Anterior cerebral artery (A3)", "R")], [("Superior sagittal sinus", "R", "superficial")], (1, 0, 0)),
    ("avm3", "AVM, Spetzler–Martin grade III", ("frontal", "L", "central"), 42.0,
     [("Middle cerebral artery (M3 segment)", "L"), ("Middle cerebral artery (M3 segment)", "L")],
     [("Superior sagittal sinus", "L", "superficial"), ("Superior sagittal sinus", "L", "superficial")], (2, 1, 0)),
    ("avm5", "AVM, Spetzler–Martin grade V", ("occipital", "R", "deep"), 64.0,
     [("Posterior cerebral artery (P3–P4)", "R"), ("Posterior cerebral artery (P3–P4)", "R"), ("Middle cerebral artery (M3 segment)", "R")],
     [("Great cerebral vein (of Galen)", "R", "deep"), ("Straight sinus", "R", "deep"), ("Superior sagittal sinus", "R", "superficial")], (3, 1, 1)),
]
NIDUS_SPEED = 200.0    # mm/s through the nidus (illustrative)
FEEDER_SPEED = 400.0   # mm/s along a feeder (illustrative: a high-flow shunt)
NIDUS_MIDLINE_MM = 4.0  # a nidus is kept this far off the midline, in its own hemisphere
CENTRAL_X_MM = 38.0    # the sensorimotor AVM's place on the central sulcus: this far from the midline (illustrative)


class Brain:
    def __init__(self):
        self.lobes = {}
        for it in VB.v3_manifest()["structures"]:
            if it.get("category") == "brain":
                nodes = VB.read_glb(VB.DATA / it["file"].replace("assets/", ""))
                for s, (P, T) in nodes.items():
                    self.lobes[(it["name"].split()[0].lower(), s)] = (P, VB.normals(P, T))
        self.all = np.vstack([P for P, _ in self.lobes.values()])
        self.centre = self.all.mean(0)

    def site(self, lobe: str, side: str, rule: str) -> tuple[np.ndarray, np.ndarray]:
        """A cortical point and its outward normal: the frontal pole; the lateral convexity at the central sulcus (the
        frontal lobe's border with the parietal, CENTRAL_X_MM from the midline: the sensorimotor cortex); the occipital
        lobe's middle."""
        P, N = self.lobes[(lobe, side)]
        if rule == "pole":
            i = int(np.argmax(P[:, 1]))
        elif rule == "central":
            Pp, _ = self.lobes[("parietal", side)]
            d = cKDTree(Pp).query(P)[0]
            k = np.nonzero(d < 2.5)[0]
            k = k[N[k] @ np.array([np.sign(P[k, 0]).mean(), 0, 0.5]) > 0.3]     # (the outer, convex surface)
            i = int(k[np.argmin(np.abs(np.abs(P[k, 0]) - CENTRAL_X_MM))])
        else:
            c = P.mean(0)
            i = int(np.argmin(np.linalg.norm(P - c, axis=1)))
        return P[i], N[i]


NIDUS_JUNCTIONS = 260     # junctions in a nidus network (illustrative; Jain 2019's model: 97 vessels)
PLEXI_R_MM = 0.5          # a plexiform nidus vessel's radius (Jain 2019's model: 0.05 cm)
FISTULA_R_MM = 1.0        # an intranidal fistula's radius (Jain 2019's model: 0.10 cm)
FISTULA_SPEED = 600.0     # mm/s through an intranidal fistula (illustrative: faster than the plexiform vessels)
DIFFUSE_HOLES = 8         # pockets of brain left in a diffuse nidus (illustrative)
SURFACE_MM = 1.5          # a cortical nidus is kept this far under the cortex at its site


def extent(X: np.ndarray) -> float:
    """The greatest diameter of a point cloud (over its convex hull)."""
    from scipy.spatial import ConvexHull
    from scipy.spatial.distance import pdist
    return float(pdist(X[ConvexHull(X).vertices]).max())


def icosphere(c: np.ndarray, r: float) -> tuple[np.ndarray, np.ndarray]:
    t = (1 + 5 ** 0.5) / 2
    v = np.array([[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                  [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]], float)
    f = np.array([[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6],
                  [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]])
    return c + r * v / np.linalg.norm(v, axis=1, keepdims=True), f


def tortuous(a: np.ndarray, b: np.ndarray, amount: float, step: float) -> np.ndarray:
    """A winding vessel from a to b: two middle points pushed off the straight line by `amount` of its length."""
    L = np.linalg.norm(b - a)
    d = unit(b - a)
    def off():
        q = RNG.normal(size=3)
        return unit(q - (q @ d) * d) * amount * L * RNG.uniform(0.5, 1.0)
    return catmull(np.array([a, a + (b - a) / 3 + off(), a + 2 * (b - a) / 3 + off(), b]), step)


class Nidus:
    """A nidus drawn as a network (after Jain 2019's theoretical model), not a patient's: junctions scattered through an
    irregular, lobulated envelope scaled to the chosen greatest diameter, each linked to its nearest neighbours by a
    tortuous plexiform vessel; a lobe (a compartment) for each feeder, the links between compartments fewer; fistulous
    channels of larger calibre straight from a feeder's entry to a draining vein's exit. Compact: the lobes merged and the
    margins clear; diffuse: the lobes apart, pockets of brain left between the vessels and stray vessels unravelled off
    the margins (Wu 2024's definition). Kept in its own hemisphere (NIDUS_MIDLINE_MM off the midline) and, for a cortical
    nidus, under the cortex at its site."""

    def __init__(self, centre, dia, side, feed_dirs, diffuse, surface=None, axis=None):
        self.centre, self.diffuse = centre, diffuse
        self.sgn, self.surface = (1.0 if side == "R" else -1.0), surface
        R = dia / 2
        spread = 0.8 if diffuse else 0.45
        dirs = [unit(f) for f in feed_dirs] + [unit(RNG.normal(size=3)) for _ in range(3)]
        if axis is not None:              # stretched along an axis (a deep nidus: from the cortex towards the deep veins)
            dirs += [unit(axis), unit(-axis)]
        lobes = []
        for i, d in enumerate(dirs):
            d = unit(d + 0.35 * RNG.normal(size=3))
            Q = np.linalg.qr(RNG.normal(size=(3, 3)))[0]
            a = R * RNG.uniform(0.28, 0.5, 3) * (0.85 if diffuse else 1.0)
            a[RNG.integers(3)] *= RNG.uniform(1.3, 1.9)           # (each lobe drawn out one way)
            lobes.append((d * R * spread * RNG.uniform(0.7, 1.15), Q, a, i < len(feed_dirs)))
        waves = [(unit(RNG.normal(size=3)) * RNG.uniform(1.2, 3.0) / R, RNG.uniform(0, 2 * np.pi)) for _ in range(5)]
        lobe_m = lambda X: np.array([np.linalg.norm(((X - c) @ Q) / a, axis=1) for c, Q, a, _ in lobes])
        box = np.abs(np.array([c for c, *_ in lobes])).max() + R
        X = RNG.uniform(-box, box, (80000, 3))
        X = X[lobe_m(X).min(0) - 1 + 0.45 * sum(np.sin(X @ w + ph) for w, ph in waves) / len(waves) < 0]
        if diffuse:
            for h in X[RNG.choice(len(X), DIFFUSE_HOLES, replace=False)]:
                X = X[np.linalg.norm(X - h, axis=1) > R * RNG.uniform(0.2, 0.3)]
        # scale about the centre so that what the clamps leave has the chosen greatest diameter
        S = 1.0
        for _ in range(6):
            f = dia / extent(self.clamp(X))
            X, S = X * f, S * f
        X = self.clamp(X)
        # junctions: about NIDUS_JUNCTIONS of them, apart by a spacing that varies through the nidus (denser clusters,
        # sparser stretches: a Poisson-disc pick)
        vol = len(X) / 80000 * (2 * box * S) ** 3
        gap = (0.7 * vol / NIDUS_JUNCTIONS) ** (1 / 3)
        dens = [(unit(RNG.normal(size=3)) * RNG.uniform(2.0, 4.0) / dia, RNG.uniform(0, 2 * np.pi)) for _ in range(4)]
        field = 1 + 0.35 * sum(np.sin(X @ w + ph) for w, ph in dens) / len(dens)
        order = RNG.permutation(len(X))
        for _ in range(4):                 # (the spacing set again until the count is near NIDUS_JUNCTIONS)
            local, J = gap * field, []
            for i in order:
                if not J or np.min(np.linalg.norm(np.array(J) - X[i], axis=1)) >= local[i]:
                    J.append(X[i])
            if 0.85 < len(J) / NIDUS_JUNCTIONS < 1.2:
                break
            gap *= (len(J) / NIDUS_JUNCTIONS) ** (1 / 3)
        J = np.array(J)
        if diffuse:                        # unravelled margins: stray junctions off the envelope's edge
            rr = np.linalg.norm(J, axis=1)
            edge = J[rr > np.percentile(rr, 80)]
            S = edge[RNG.choice(len(edge), max(6, len(edge) // 4), replace=False)]
            S = S + S / np.linalg.norm(S, axis=1, keepdims=True) * RNG.uniform(0.6, 1.6, (len(S), 1)) * gap
            J = np.vstack([J, self.clamp(S)])
            J = J * min(1.0, dia / extent(J))       # (shrunk back to the chosen diameter: towards the centre, inside the clamps)
        self.gap, self.J = gap, J + centre
        fl = [k for k, l in enumerate(lobes) if l[3]]
        self.comp = np.argmin(lobe_m(J)[fl], axis=0)
        d, nb = cKDTree(J).query(J, 4)
        E = set()
        for i in range(len(J)):
            for dd, j in zip(d[i, 1:], nb[i, 1:]):
                if dd > 2.2 * gap or (self.comp[i] != self.comp[j] and RNG.random() > 0.3):
                    continue
                E.add((min(i, j), max(i, j)))
        self.edges = self.connect(J, E)
        self.fistulas: list[tuple[int, int]] = []

    def clamp(self, X: np.ndarray) -> np.ndarray:
        P = X + self.centre
        k = self.sgn * P[:, 0] >= NIDUS_MIDLINE_MM
        if self.surface is not None:
            p, n = self.surface
            k &= (P - p) @ n <= -SURFACE_MM
        return X[k]

    @staticmethod
    def connect(J: np.ndarray, E: set) -> list:
        """Join the pieces the links leave apart, each to the largest by its nearest pair of junctions."""
        import scipy.sparse as sp
        from scipy.sparse.csgraph import connected_components
        while True:
            e = np.array(sorted(E))
            G = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(J), len(J)))
            n, lab = connected_components(G, directed=False)
            if n == 1:
                return sorted(E)
            big = np.argmax(np.bincount(lab))
            main = np.nonzero(lab == big)[0]
            tree = cKDTree(J[main])
            for c in set(range(n)) - {big}:
                m = np.nonzero(lab == c)[0]
                dd, jj = tree.query(J[m])
                k = int(np.argmin(dd))
                E.add(tuple(sorted((int(m[k]), int(main[jj[k]])))))

    def nearest(self, p: np.ndarray, comp: int | None = None) -> int:
        k = np.arange(len(self.J)) if comp is None else np.nonzero(self.comp == comp)[0]
        return int(k[np.argmin(np.linalg.norm(self.J[k] - p, axis=1))])

    def draw(self, seeds: list[tuple[int, float]]) -> tuple[list, np.ndarray]:
        """The vessels as tubes timed from the seeds (a junction and when contrast reaches it): [(positions, triangles,
        arrival)] and each junction's arrival."""
        import scipy.sparse as sp
        from scipy.sparse.csgraph import dijkstra
        curves = []
        for i, j in self.edges:
            r = PLEXI_R_MM * float(np.clip(RNG.lognormal(0, 0.35), 0.6, 2.0))     # (calibres varying about it)
            curves.append((i, j, tortuous(self.J[i], self.J[j], RNG.uniform(0.15, 0.4), 0.4), r, NIDUS_SPEED))
        for i, j in self.fistulas:
            curves.append((i, j, tortuous(self.J[i], self.J[j], 0.12, 0.4), FISTULA_R_MM, FISTULA_SPEED))
        n = len(self.J)
        w = [(i, j, np.linalg.norm(np.diff(C, axis=0), axis=1).sum() / v) for i, j, C, _, v in curves]
        rows = [i for i, j, _ in w] + [n] * len(seeds)
        cols = [j for i, j, _ in w] + [k for k, _ in seeds]
        t0 = min(t for _, t in seeds)
        vals = [x for *_, x in w] + [t - t0 + 1e-6 for _, t in seeds]
        G = sp.coo_matrix((vals, (rows, cols)), shape=(n + 1, n + 1)).tocsr()
        T = dijkstra(G, directed=False, indices=n)[:n] + t0
        parts, rmax = [], np.zeros(n)
        for i, j, C, r, v in curves:
            s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
            tt = np.minimum(T[i] + s / v, T[j] + (s[-1] - s) / v)
            pos, nrm, tri, idx = tube(C, r, 6)
            parts.append((pos, tri, tt[idx]))
            rmax[i], rmax[j] = max(rmax[i], r), max(rmax[j], r)
        for k in range(n):                 # a junction's knot, so that the vessels meeting there join
            v, f = icosphere(self.J[k], 1.05 * rmax[k])
            parts.append((v, f, np.full(len(v), T[k])))
        return parts, T

    def facts(self) -> dict:
        return {"junctions": len(self.J), "plexiform": len(self.edges), "fistulous": len(self.fistulas),
                "measuredMm": round(extent(self.J), 1), "compact": not self.diffuse}


def route(a: np.ndarray, b: np.ndarray, push: np.ndarray, amount: float) -> np.ndarray:
    """A smooth vessel from a to b bowed by `amount` of its length towards `push`."""
    m = (a + b) / 2 + unit(push) * amount * np.linalg.norm(b - a)
    return catmull(np.array([a, (a + m) / 2 + unit(push) * 0.2 * amount * np.linalg.norm(b - a), m, (m + b) / 2, b]), 0.5)


# ---------------------------------------------------------------- early veins (the shunt's drainage)
EARLY_SPEED = 250.0      # mm/s: contrast running on from a shunt through this CT's veins and sinuses (illustrative)
DOWN_SLACK_MM = 20.0     # downstream: on a way to the jugular veins at most this much longer than the shortest (round a
                         # sinus's breadth; a few millimetres back into a tributary that joins downstream)
EARLIER_S, EARLIER_SHARE = 0.3, 0.05   # a vein is copied into a lesion's view if this share of it fills this much earlier
def early_veins(net: dict, t_flat: np.ndarray, seeds: list[tuple[np.ndarray, float]], speed: float,
                names: set | None = None, retro_mm: float = 0.0, both: bool = False) -> np.ndarray:
    """Venous arrival with a shunt: from each seed (a point and the time contrast reaches it) on through the veins at
    `speed`: downstream (towards the jugular veins) always, against the flow up to retro_mm (a sinus or veins filled back
    from a fistula); `names`: only these veins (and their seeds' nearest vertex among them)."""
    from scipy.sparse.csgraph import dijkstra
    V, dout = net["ven"], net["dout"]
    part = np.repeat(np.arange(len(V.keys)), np.diff(V.cut))
    allowed = np.ones(len(V.P), bool) if names is None else np.isin(np.array([V.keys[k][0] for k in part]), list(names))
    best = t_flat.copy()
    vname = np.array([V.keys[k][0] for k in part])
    for p, t, *into in seeds:            # (a seed may name the vein it drains into: it starts there)
        cand = np.nonzero(allowed & (vname == into[0]))[0] if into else np.nonzero(allowed)[0]
        i = int(cand[np.argmin(np.linalg.norm(V.P[cand] - p, axis=1))])
        d = dijkstra(V.Gmm, indices=i)       # (in millimetres along the vessels: how far the shunt's contrast runs)
        down = d + dout <= dout[i] + DOWN_SLACK_MM
        if both:                     # on the way to either jugular vein (a sinus confluence drains to both sides)
            for do in net["douts"]:
                down |= d + do <= do[i] + DOWN_SLACK_MM
        ok = allowed & np.isfinite(d) & (down | (d <= retro_mm))
        te = t + d / speed
        best = np.where(ok & (te < best), te, best)
    return best


def flat(net, split: dict) -> np.ndarray:
    return np.concatenate([split[k] for k in net["ven"].keys])


# ---------------------------------------------------------------- assembling the lesions
RULE = {"dataset": "rule", "source": "Drawn by rule on the TopBrain CT angiogram (Skull base v3)",
        "licence": "GPL-3.0 (the project's own drawing, on the TopBrain CT)", "citation": [], "citationUrls": [], "refIds": [],
        "aliases": [], "schematic": True, "bytes": 0, "type": "tube"}


class Out:
    def __init__(self, vessels, t_art, t_ven, net):
        self.vessels, self.t_art, self.t_ven, self.net = vessels, t_art, t_ven, net
        self.V = Vessels(vessels, t_art, t_ven)
        self.items, self.info = [], []

    def part(self, lesion: str, pid: str, name: str, cat: str, token: str, parts: list, dwell: float, derivation: str) -> str:
        """A lesion's part: [(positions, triangles, arrival)] in one GLB (node R)."""
        vs, ts, arr, off = [], [], [], 0
        for v, t, a in parts:
            vs.append(v); ts.append(t + off); arr.append(np.broadcast_to(a, (len(v),))); off += len(v)
        V, T, A = np.vstack(vs), np.vstack(ts), np.concatenate(arr)
        vid = f"va_{lesion}__{pid}"
        VB.write_glb(VB.BUILD / f"{vid}.glb", [{"name": "R", "positions": V, "normals": VB.normals(V, T), "indices": T, "mode": VB.TRIANGLES,
                                                "scalars": {"_ARRIVAL": np.clip(A / VB.T_MAX_S, 0, 1).astype(np.float32),
                                                            "_DWELL": np.full(len(V), dwell / VB.T_MAX_S, np.float32)}}], {"id": vid})
        c = V.mean(0).round(2).tolist()
        self.items.append({**RULE, "id": vid, "name": name, "file": f"assets/{VB.KIND}/{vid}.glb", "colour": VB.colour(token),
                           "category": cat, "lesion": lesion, "derivation": derivation, "centroid": {"L": c, "R": c},
                           "layer": {"feeder": "tracts", "drainer": "vessels"}.get(cat, "targets")})
        return vid

    def vein_copies(self, lesion: str, early: np.ndarray, dilate: dict | None = None) -> list[str]:
        """Copies of the veins a shunt fills early (or dilates), standing in for them in its view."""
        net, ids = self.net, []
        split = net["ven"].split(early)
        by = {v["name"]: v for v in self.vessels}
        for name in sorted({k[0] for k in net["ven"].keys}):
            keys = [k for k in net["ven"].keys if k[0] == name]
            earlier = any((split[k] < self.t_ven[k] - EARLIER_S).mean() > EARLIER_SHARE for k in keys)
            if not earlier and not (dilate and name in dilate):
                continue
            v = by[name]
            nodes = {}
            for k in keys:
                P, T = v["nodes"][k[1]]
                if dilate and name in dilate:
                    P = P + VB.normals(P, T) * dilate[name]
                nodes[k[1]] = (P, T)
            vid = f"va_{lesion}__{VB.slug(name)}"
            cent = VB.write_vessel(vid, nodes, {k[1]: split[k] for k in keys}, VB.DWELL_VEN_S)
            base = VB.base_item(v["item"], vid, cent, "")
            self.items.append({**base, "lesion": lesion, "replaces": "va_" + VB.slug(name),
                               "derivation": base["derivation"] + (f" Here filled early by the lesion's shunt" if earlier else "")
                               + (f", drawn {dilate[name]:g} mm wider (dilated, illustrative)" if dilate and name in dilate else "") + "."})
            ids.append(vid)
        return ids


def build_aneurysms(o: Out) -> None:
    for aid, name, parent, branch, side, R, rn, how in ANEURYSMS:
        v, f, arr, t0, facts = saccular(o.V, parent, branch, side, R, rn, how)
        pid = o.part(aid, "sac", name, "aneurysm", "vaAneurysm", [(v, f, arr)], VB.DWELL_ART_S + 0.8,
                     f"Drawn by rule, not this patient's: a saccular aneurysm {2 * R:g} mm across on a {2 * rn:g} mm neck (illustrative "
                     f"sizes), where this CT's {parent.lower()}" + (f" meets its {branch.lower()}" if branch else "") +
                     ", its dome and neck joined smoothly (an implicit surface).")
        o.info.append({"id": aid, "kind": "aneurysm", "type": "saccular", "name": name, "parts": [pid], "parent": parent,
                       "branch": branch, "side": side, **facts})
    v, f, arr, facts = fusiform(o.V)
    pid = o.part("fusiform", "sac", "Fusiform basilar trunk aneurysm", "aneurysm", "vaAneurysm", [(v, f, arr)], VB.DWELL_ART_S + 0.8,
                 f"Drawn by rule, not this patient's: this CT's basilar trunk widened all round over {FUSI_LEN_MM:g} mm, to "
                 f"{FUSI_GAIN:g} times its own width at the middle (illustrative), with no neck.")
    o.info.append({"id": "fusiform", "kind": "aneurysm", "type": "fusiform", "name": "Fusiform basilar trunk aneurysm", "parts": [pid],
                   "parent": "Basilar artery", "side": "M", **facts})
    v, f, arr, facts = blister(o.V)
    pid = o.part("blister", "sac", "Blister aneurysm of the internal carotid artery", "aneurysm", "vaAneurysm", [(v, f, arr)], VB.DWELL_ART_S + 0.5,
                 "Drawn by rule, not this patient's: a broad-based bleb on the upper (dorsal) wall of this CT's right internal carotid "
                 "artery just past the ophthalmic artery (illustrative size), with no neck.")
    o.info.append({"id": "blister", "kind": "aneurysm", "type": "blister", "name": "Blister aneurysm of the internal carotid artery",
                   "parts": [pid], "parent": "Internal carotid artery", "side": "R", **facts})


AVM_SHAPE = {"avm1": ("compact", 1), "avm3": ("compact", 1), "avm5": ("diffuse", 2)}   # nidus type, fistulous channels


def build_avms(o: Out, brain: Brain) -> None:
    tflat = flat(o.net, o.t_ven)
    for lid, name, (lobe, side, rule), dia, feeders, drains, smpts in AVMS:
        R = dia / 2
        kind, n_fist = AVM_SHAPE[lid]
        p, n = brain.site(lobe, side, rule)
        if rule == "deep":
            (Pg, _), _ = o.V.get("Great cerebral vein (of Galen)", "R")
            c_occ = brain.lobes[(lobe, side)][0].mean(0)
            centre = c_occ + 0.25 * (Pg.mean(0) - c_occ)
            surface, axis = None, Pg.mean(0) - c_occ
        else:
            centre = p - n * R * 0.8
            surface, axis = (p, n), None
        # the feeding arteries' points on this CT (a second from the same artery at least 15 mm from the first)
        starts, used = [], {}
        for vname, vs in feeders:
            (P, T), t = o.V.get(vname, vs)
            d = np.linalg.norm(P - centre, axis=1)
            for q in used.get(vname, []):
                d = np.where(np.linalg.norm(P - q, axis=1) < 15, np.inf, d)
            i = int(np.argmin(d))
            used.setdefault(vname, []).append(P[i])
            starts.append((P[i], float(t[i])))
        nid = Nidus(centre, dia, side, [A - centre for A, _ in starts], kind == "diffuse", surface, axis)
        # feeders: to the nearest junction of their own compartment, branching there into two more of its junctions
        fparts, seeds, entries = [], [], []
        for k, (A, tA) in enumerate(starts):
            e = nid.nearest(A, k)
            C = route(A, nid.J[e], A - brain.centre, 0.12)
            s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
            pos, nrm, tri, idx = tube(C, np.linspace(1.3, 0.9, len(C)), 10)
            ta = tA + s / FEEDER_SPEED
            fparts.append((pos, tri, ta[idx]))
            seeds.append((e, float(ta[-1]))); entries.append(e)
            b0 = int(0.8 * len(C))
            mine = np.nonzero(nid.comp == k)[0]
            near = mine[np.argsort(np.linalg.norm(nid.J[mine] - C[b0], axis=1))]
            for j in [x for x in near if x != e][:2]:
                Cb = tortuous(C[b0], nid.J[j], 0.15, 0.5)
                sb = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Cb, axis=0), axis=1))]
                pos, nrm, tri, idx = tube(Cb, np.linspace(0.8, 0.6, len(Cb)), 8)
                tb = ta[b0] + sb / FEEDER_SPEED
                fparts.append((pos, tri, tb[idx]))
                seeds.append((int(j), float(tb[-1])))
        # draining veins' exits: the junction nearest each target (a second exit on the same vein 20 mm along)
        targets, used = [], {}
        for vname, vs, dk in drains:
            (P, T), t = o.V.get(vname, vs)
            d = np.linalg.norm(P - centre, axis=1)
            for q in used.get(vname, []):
                d = np.where(np.linalg.norm(P - q, axis=1) < 20, np.inf, d)
            i = int(np.argmin(d))
            used.setdefault(vname, []).append(P[i])
            targets.append((P[i], dk, nid.nearest(P[i]), vname))
        # fistulous channels: straight from a feeder's entry to a draining vein's exit
        for k in range(n_fist):
            nid.fistulas.append((entries[k % len(entries)], targets[k % len(targets)][2]))
        nparts, T = nid.draw(seeds)
        dparts, vseeds = [], []
        for Tg, dk, x, vn in targets:
            X = nid.J[x]
            C = route(X, Tg, (X + Tg) / 2 - brain.centre, 0.15 if dk == "superficial" else 0.04)
            C = catmull(wiggle(C, 1.6, max(2, np.linalg.norm(Tg - X) / 14))[::3], 0.5)
            s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
            pos, nrm, tri, idx = tube(C, np.linspace(1.5, 2.3, len(C)), 10)
            ta = T[x] + s / VB.SHUNT_SPEED
            dparts.append((pos, tri, ta[idx]))
            vseeds.append((Tg, float(ta[-1]), vn))
        S, E_, Vp = smpts
        grade = S + E_ + Vp
        loc = {"pole": "the right frontal pole (not eloquent)", "central": "the left sensorimotor cortex at the central sulcus (eloquent)",
               "deep": "the right occipital lobe, visual cortex (eloquent), reaching deep towards the vein of Galen"}[rule]
        f = nid.facts()
        ids = [o.part(lid, "feeders", f"{name}: feeding arteries", "feeder", "sbArtery", fparts, VB.DWELL_ART_S,
                      "Drawn by rule: from the nearest point of this CT's " + ", ".join(sorted({x[0].lower() for x in feeders})) +
                      " to the nidus, dilated (illustrative), each into its own compartment and branching there."),
               o.part(lid, "nidus", f"{name}: nidus", "nidus", "vaNidus", nparts, VB.DWELL_ART_S + 0.6,
                      f"Drawn by rule, not this patient's: a {kind} nidus {f['measuredMm']:g} mm across at its greatest in {loc}; a "
                      f"network of {f['plexiform']} tortuous plexiform vessels ({2 * PLEXI_R_MM:g} mm wide) between {f['junctions']} "
                      f"junctions in an irregular, lobulated envelope, a compartment for each of its {len(feeders)} feeders, and "
                      f"{f['fistulous']} fistulous channel{'s' if f['fistulous'] > 1 else ''} ({2 * FISTULA_R_MM:g} mm wide) straight "
                      "from a feeder to a draining vein (vessel sizes after Jain 2019's theoretical model)"
                      + ("; pockets of brain left between its vessels and stray vessels off its margins." if kind == "diffuse" else
                         "; its margins clear.")),
               o.part(lid, "drainers", f"{name}: draining veins", "drainer", "sbVein", dparts, VB.DWELL_VEN_S,
                      "Drawn by rule: from the nidus to this CT's " + ", ".join(sorted({x[0].lower() for x in drains})) +
                      ", dilated and tortuous (illustrative); they fill straight from the nidus, in the arterial phase.")]
        early = early_veins(o.net, tflat, vseeds, EARLY_SPEED, both=True)
        ids += o.vein_copies(lid, early)
        o.info.append({"id": lid, "kind": "avm", "name": name, "parts": ids, "location": loc, "nidusMm": dia,
                       "nidus": {**f, "type": kind},
                       "sm": {"size": S, "eloquence": E_, "deep": Vp, "grade": grade}, "feeders": [x[0] for x in feeders],
                       "drainage": [{"vessel": x[0], "kind": x[2]} for x in drains], "centreMm": np.round(centre, 1).tolist()})


CS_NET = {"Cavernous sinus", "Anterior intercavernous sinus", "Posterior intercavernous sinus", "Superior ophthalmic vein",
          "Inferior ophthalmic vein", "Superior petrosal sinus", "Inferior petrosal sinus", "Sphenoparietal sinus", "Basilar venous plexus",
          "Superficial middle cerebral vein", "Internal jugular vein", "Sigmoid sinus", "Transverse sinus"}


def wiggle(C: np.ndarray, amp: float, waves: float) -> np.ndarray:
    T = np.gradient(C, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    Nn = np.cross(T, [0, 0, 1.0])
    Nn /= np.linalg.norm(Nn, axis=1, keepdims=True) + 1e-12
    s = np.linspace(0, 1, len(C))
    return C + amp * np.sin(2 * np.pi * waves * s)[:, None] * np.sin(np.pi * s)[:, None] * Nn


DAVF_MM = 5.0             # the drawn fistula's diameter (illustrative)
DAVF_RETRO_MM = 130.0     # how far contrast runs back along the transverse sinus from the fistula (to the torcular: drawn)


def build_davf(o: Out, brain: Brain) -> None:
    lid = "davf"
    F0 = o.V.contact("Transverse sinus", "Sigmoid sinus", "R").mean(0)
    # the fistula on the sinus's outer wall (away from the brain) at the junction, where the dural feeders reach it
    W = np.vstack([o.V.get(n, "R")[0][0] for n in ("Transverse sinus", "Sigmoid sinus")])
    near = W[np.linalg.norm(W - F0, axis=1) < 8]
    F = near[np.argmax((near - F0) @ unit(F0 - brain.centre))]
    parts, ends = [], []
    mma, t_mma, _ = o.V.nearest("Middle meningeal artery", "R", F)
    C = wiggle(route(mma, F, F - brain.centre, 0.12), 1.0, 3)
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    pos, nrm, tri, idx = tube(C, np.linspace(0.9, 0.7, len(C)), 8)
    ta = t_mma + s / FEEDER_SPEED
    parts.append((pos, tri, ta[idx])); ends.append(float(ta[-1]))
    S0 = F + unit(np.array([0.5, -0.7, -0.5])) * 26.0           # an occipital artery branch, outside the skull (drawn)
    C = wiggle(route(S0, F, S0 - brain.centre, 0.1), 1.2, 4)
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    pos, nrm, tri, idx = tube(C, np.linspace(1.1, 0.7, len(C)), 8)
    ta = VB.ECA_DELAY_S + 0.35 + s / FEEDER_SPEED
    parts.append((pos, tri, ta[idx])); ends.append(float(ta[-1]))
    tF = min(ends) + 0.05
    ids = [o.part(lid, "feeders", "Dural AV fistula: feeding arteries", "feeder", "sbArtery", parts, VB.DWELL_ART_S,
                  "Drawn by rule: a branch from this CT's right middle meningeal artery, and an occipital artery branch drawn "
                  "through the bone from outside the skull (this angiogram does not show the external carotid), to the fistula.")]
    sph_v, sph_f = implicit_mesh(lambda Q: np.linalg.norm(Q - F, axis=1) - DAVF_MM / 2, F - 4, F + 4, 0.2)
    ids.append(o.part(lid, "fistula", "Dural AV fistula: the fistula", "fistula", "vaNidus", [(sph_v, sph_f, np.full(len(sph_v), tF))],
                      VB.DWELL_ART_S + 0.6, f"Drawn by rule: where the feeders open into the outer wall of this CT's right sinus, at the "
                      f"junction of its transverse and sigmoid parts, {DAVF_MM:g} mm across (illustrative)."))
    # cortical venous reflux: from the transverse sinus back up over the temporal lobe (a vein of Labbé's course, drawn)
    (Ptr, _), _ = o.V.get("Transverse sinus", "R")
    T1 = Ptr[np.argmin(np.abs(np.linalg.norm(Ptr - F, axis=1) - 14))]
    Pt, _ = brain.lobes[("temporal", "R")]
    lat = Pt[np.argmax(Pt[:, 0] + 0.0 * Pt[:, 1])]
    up = Pt[np.argmax(Pt[:, 2] + 0.3 * Pt[:, 1])]
    C = catmull(np.array([T1, (T1 + lat) / 2 + unit(lat - brain.centre) * 4, lat, (lat + up) / 2 + unit(up - brain.centre) * 3, up]), 0.5)
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    pos, nrm, tri, idx = tube(C, np.linspace(1.8, 1.0, len(C)), 10)
    ta = tF + np.linalg.norm(T1 - F) / VB.SHUNT_SPEED + s / VB.SHUNT_SPEED
    ids.append(o.part(lid, "reflux", "Dural AV fistula: cortical venous reflux", "drainer", "sbVein", [(pos, tri, ta[idx])], VB.DWELL_VEN_S,
                      "Drawn by rule: a cortical vein filled backwards from the transverse sinus, up over this patient's fitted "
                      "temporal lobe (the course of a vein of Labbé), in the arterial phase."))
    early = early_veins(o.net, flat(o.net, o.t_ven), [(F, tF)], EARLY_SPEED,
                        {"Transverse sinus", "Sigmoid sinus", "Internal jugular vein"}, retro_mm=DAVF_RETRO_MM)
    ids += o.vein_copies(lid, early)
    o.info.append({"id": lid, "kind": "davf", "name": "Dural arteriovenous fistula (transverse–sigmoid)", "parts": ids,
                   "borden": 2, "fistulaMm": np.round(F, 1).tolist(), "feeders": ["Middle meningeal artery", "Occipital artery (drawn)"],
                   "drainage": ["Sigmoid sinus and internal jugular vein (antegrade)", "Transverse sinus (retrograde)", "Cortical vein (reflux)"]})


def build_ccfs(o: Out) -> None:
    tflat = flat(o.net, o.t_ven)
    (Pcs, _), _ = o.V.get("Cavernous sinus", "R")
    cs = Pcs.mean(0)
    # direct (Barrow A): the cavernous carotid opening into the sinus
    F, tI, _ = o.V.nearest("Internal carotid artery", "R", cs)
    tF = tI + 0.03
    sph_v, sph_f = implicit_mesh(lambda Q: np.linalg.norm(Q - F, axis=1) - 1.8, F - 3, F + 3, 0.15)
    ids = [o.part("ccfa", "fistula", "Direct carotid-cavernous fistula: the tear", "fistula", "vaNidus", [(sph_v, sph_f, np.full(len(sph_v), tF))],
                  VB.DWELL_ART_S + 0.6, "Drawn by rule: where the right cavernous carotid (this CT's) opens straight into the sinus.")]
    early = early_veins(o.net, tflat, [(F, tF)], EARLY_SPEED, CS_NET, retro_mm=160.0)
    ids += o.vein_copies("ccfa", early, {"Superior ophthalmic vein": 1.2, "Inferior ophthalmic vein": 0.8})
    o.info.append({"id": "ccfa", "kind": "ccf", "barrow": "A", "name": "Direct carotid-cavernous fistula (Barrow type A)", "parts": ids,
                   "fistulaMm": np.round(F, 1).tolist()})
    # indirect (Barrow D): small dural branches of the carotid in the sinus and of the external carotid through the foramina
    cav = json.loads((VB.GEN / "sbv3-cavernous.json").read_text())["landmarks"]["R"]
    pc = np.array(cav["posteriorClinoid"], float)
    A0, tA, _ = o.V.nearest("Internal carotid artery", "R", pc)
    parts, ends = [], []
    for start, t0, label in ((A0, tA, "ica"), (VB.landmark("Foramen ovale", "R"), VB.ECA_DELAY_S + 0.25, "ovale"),
                             (VB.landmark("Foramen spinosum", "R"), VB.ECA_DELAY_S + 0.25, "spinosum")):
        end = Pcs[np.argmin(np.linalg.norm(Pcs - start, axis=1))]
        C = wiggle(route(start, end, start - cs, 0.25), 0.9, 4)
        s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
        pos, nrm, tri, idx = tube(C, np.linspace(0.55, 0.4, len(C)), 6)
        ta = t0 + s / 120.0
        parts.append((pos, tri, ta[idx])); ends.append((end, float(ta[-1])))
    ids = [o.part("ccfd", "feeders", "Indirect carotid-cavernous fistula: dural feeders", "feeder", "sbArtery", parts, VB.DWELL_ART_S,
                  "Drawn by rule: a small dural branch of this CT's right cavernous carotid (as the meningohypophyseal trunk runs), and "
                  "external carotid branches through the foramen ovale and spinosum (this angiogram does not show them), to the "
                  "sinus's wall.")]
    early = early_veins(o.net, tflat, [(e, t + 0.3) for e, t in ends], 60.0, CS_NET - {"Superficial middle cerebral vein"}, retro_mm=120.0)
    ids += o.vein_copies("ccfd", early)
    o.info.append({"id": "ccfd", "kind": "ccf", "barrow": "D", "name": "Indirect carotid-cavernous fistula (Barrow type D)", "parts": ids})


def build(vessels, t_art, t_ven, net) -> tuple[list, list]:
    o = Out(vessels, t_art, t_ven, net)
    brain = Brain()
    build_aneurysms(o)
    build_avms(o, brain)
    build_davf(o, brain)
    build_ccfs(o)
    return o.items, o.info
