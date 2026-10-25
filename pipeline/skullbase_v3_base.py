"""Skull base v3, beyond the temporal bone: the cranial nerves routed through this CT's own foramina, the foramina
themselves, and the vessels the CT shows at the skull base.

Nerves (skullbase_nerves.route): each nerve's fitted Z-Anatomy course (Skull base v2) gives where it leaves the brainstem
and which way it runs; the path drawn is the least-cost route through the CT near that course, which cannot pass bone
except through an opening. VII and VIII end at the internal acoustic meatus' opening of the registered OpenEar ear
(skullbase_v3), whose own facial nerve continues through the temporal bone. Each nerve is drawn to just past the skull
base (MAX_MM along its fitted course).

Foramina: where a routed nerve is most closely surrounded by bone (the bone mask within ENCLOSE_MM of its path); the
foramen lacerum and the foramen magnum from the through-holes of the cranial floor seen from above; the carotid canal's
outer opening at the top of TotalSegmentator's internal carotid artery.

Independent checks (reported in sbv3-fit.json): the mandibular nerve's foramen against the floor's foramen ovale holes;
the optic nerve's route against TotalSegmentator's optic nerve; the jugular foramen's nerves against the top of
TotalSegmentator's internal jugular vein (the jugular bulb).
"""
from __future__ import annotations

import json
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

import skullbase_nerves as NV

ROOT = Path(__file__).resolve().parent
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
TS = CT_BUILD / "ts"
ENCLOSE_MM = 2.0
ENCLOSED = 0.5            # a path point this much surrounded by bone is in a foramen or canal
SOF_NERVES = ("Oculomotor nerve (III)", "Trochlear nerve (IV)", "Ophthalmic nerve (V1)", "Abducens nerve (VI)")

# name, cranial nerve, fitted source (v2 line name, run, then optional more), MAX_MM along it, colour category
NERVES = [
    ("Olfactory nerve (I)", 1, [("Olfactory nerve (I)", 1)], None),
    ("Optic nerve (II)", 2, [("Optic nerve (II)", 0)], None),
    ("Oculomotor nerve (III)", 3, [("Oculomotor nerve (III)", 0)], 55),
    ("Trochlear nerve (IV)", 4, [("Trochlear nerve (IV)", 0)], 75),
    ("Trigeminal nerve (V)", 5, [("Trigeminal nerve (V)", 0)], None),
    ("Ophthalmic nerve (V1)", 5, [("Ophthalmic nerve", 0)], 50),
    ("Maxillary nerve (V2)", 5, [("Maxillary nerve", 0)], 45),
    ("Mandibular nerve (V3)", 5, [("Trigeminal nerve (V)", 1), ("Posterior division of mandibular nerve", 0)], None),
    ("Abducens nerve (VI)", 6, [("Abducens nerve (VI)", 0)], 65),
    ("Facial nerve (VII)", 7, [("Facial nerve (VII)", 0)], "porus"),
    ("Vestibulocochlear nerve (VIII)", 8, [("Vestibulocochlear nerve (VIII)", 0)], "porus"),
    ("Glossopharyngeal nerve (IX)", 9, [("Glossopharyngeal nerve (IX)", 0)], 45),
    ("Vagus nerve (X)", 10, [("Vagus nerve (X)", 1)], 45),
    ("Accessory nerve (XI)", 11, [("Accessory nerve (XI)", 0)], 50),
    ("Hypoglossal nerve (XII)", 12, [("Hypoglossal nerve (XII)", 0)], 40),
]
ARTERIES = [("Middle meningeal artery", [("Middle meningeal artery", 0)], None)]
# foramen landmark <- the route it is taken from (and a window on the route, frame mm, where needed)
FORAMEN_OF = {
    "Optic canal": ("Optic nerve (II)", None),
    "Foramen rotundum": ("Maxillary nerve (V2)", None),
    "Foramen ovale": ("Mandibular nerve (V3)", None),
    "Foramen spinosum": ("Middle meningeal artery", None),
    "Hypoglossal canal": ("Hypoglossal nerve (XII)", None),
}
JUGULAR_NERVES = ("Glossopharyngeal nerve (IX)", "Vagus nerve (X)", "Accessory nerve (XI)")


def fitted_course(ex: dict, sources, side: str, max_mm) -> np.ndarray:
    P = np.vstack([np.array(ex["lines"][f"{n}.{side.lower()}"]["runs"][i])[:, :4] for n, i in sources])
    if isinstance(max_mm, (int, float)):
        s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P[:, :3], axis=0), axis=1))]
        P = P[s <= max_mm]
    return P


def enclosure(g: NV.Grid, P: np.ndarray) -> np.ndarray:
    """Share of bone in a ball of ENCLOSE_MM around each path point."""
    r = int(round(ENCLOSE_MM / g.step))
    off = np.argwhere(np.ones((2 * r + 1,) * 3, bool)) - r
    off = off[np.linalg.norm(off, axis=1) <= r]
    q = np.rint(g.to_ijk(P)).astype(int)
    out = np.zeros(len(P))
    for i, p in enumerate(q):
        nb = p + off
        ok = (nb >= 0).all(1) & (nb < np.array(g.bone.shape)).all(1)
        out[i] = g.bone[tuple(nb[ok].T)].mean() if ok.any() else 0.0
    return out


def first_enclosed(e: np.ndarray) -> int:
    """The foramen on a path (from inside the skull outwards): the most enclosed point of the first stretch where the
    path is at least ENCLOSED surrounded by bone (the first opening it meets), or the most enclosed point overall."""
    lab, n = ndimage.label(e >= ENCLOSED)
    if not n:
        return int(np.argmax(e))
    idx = np.nonzero(lab == 1)[0]
    return int(idx[np.argmax(e[idx])])


def ts_points(rel: str, ct_fossa, ct_R) -> np.ndarray:
    img = nib.load(TS / f"{rel}.nii.gz")
    idx = np.argwhere(np.asanyarray(img.dataobj) > 0)
    return (nib.affines.apply_affine(img.affine, idx) - ct_fossa) @ ct_R


def floor_holes(g: NV.Grid) -> list[dict]:
    """Openings of the cranial floor seen from above: where a vertical ray from z = +22 finds no bone (CT over 350 HU:
    small openings the smoothed bone mask closes stay open) down to z = -62 (frame mm), as connected areas not touching
    the map's edge. Centre (at the rim's height), area."""
    import skullbase_canals as CC
    ctf = CC.CTFrame()
    S = 0.25
    xs, ys, zs = np.arange(-62, 62.001, S), np.arange(-62, 52.001, S), np.arange(22, -62, -0.5)
    X, Y = np.meshgrid(xs, ys, indexing="xy")
    depth = np.full(X.shape, np.nan)
    for z in zs:
        b = (ctf.sample(np.c_[X.ravel(), Y.ravel(), np.full(X.size, z)]) > CC.BONE_HU).reshape(X.shape)
        new = np.isnan(depth) & b
        depth[new] = z
    hole = np.isnan(depth)
    lab, n = ndimage.label(hole)
    edge = set(np.unique(np.r_[lab[0], lab[-1], lab[:, 0], lab[:, -1]]).tolist())
    out = []
    for k in range(1, n + 1):
        if k in edge:
            continue
        m = lab == k
        area = float(m.sum() * S * S)
        if area < 3.0:
            continue
        yy, xx = np.nonzero(m)
        ring = ndimage.binary_dilation(m, iterations=4) & ~m
        out.append({"centre": np.array([xs[xx].mean(), ys[yy].mean(), float(np.nanmedian(depth[ring]))]), "area": area})
    return out


def lift_onto_floor(g: NV.Grid, F: np.ndarray, clear_mm: float = 1.5) -> np.ndarray:
    """Points of a fitted course that lie in or under bone moved straight up to clear_mm above the bone surface over
    them (a structure lying on the cranial floor)."""
    out = F.copy()
    for i, p in enumerate(F[:, :3]):
        zs = np.arange(-4.0, 12.0, 0.25)
        col = g.in_bone(p + np.c_[np.zeros(len(zs)), np.zeros(len(zs)), zs])
        if not col[zs >= 0][:int(clear_mm / 0.25) + 1].any():
            continue
        top = zs[np.nonzero(col)[0].max()]
        out[i, 2] = p[2] + top + clear_mm
    return out


def centre_line(T: np.ndarray) -> np.ndarray:
    """The centre line of an elongated point set: centroids of 1 mm slabs along its principal axis."""
    c = T.mean(0)
    ax = np.linalg.svd(T - c)[2][0]
    t = (T - c) @ ax
    out = [T[(t >= a) & (t < a + 1.0)].mean(0) for a in np.arange(t.min(), t.max(), 1.0) if ((t >= a) & (t < a + 1.0)).sum() > 5]
    return np.array(out)


def optic_guide(F: np.ndarray, T: np.ndarray) -> np.ndarray:
    """The optic nerve's course: from the fitted chiasm end to the segmented nerve's posterior end, then along it."""
    C = centre_line(T)
    if np.linalg.norm(C[0] - F[0, :3]) > np.linalg.norm(C[-1] - F[0, :3]):
        C = C[::-1]
    r = np.median(F[:, 3])
    lead = np.linspace(F[0, :3], C[0], 12)
    return np.c_[np.vstack([lead[:-1], C]), np.full(len(lead) - 1 + len(C), r)]


def build(ex: dict, ct_fossa: np.ndarray, ct_R: np.ndarray, porus: dict, carotid_guide: dict) -> dict:
    """Routes, foramina, vessels and checks. porus: side -> the internal acoustic meatus' opening (frame mm) of the
    OpenEar ear; carotid_guide: side -> the registered specimen's petrous carotid (points, frame mm)."""
    g = NV.Grid()
    routes, report = {}, {}
    optic_ts = {s: ts_points("head_glands_cavities/optic_nerve_" + ("right" if s == "R" else "left"), ct_fossa, ct_R) for s in ("R", "L")}
    for name, cn, sources, max_mm in NERVES + [(a, None, s, m) for a, s, m in ARTERIES]:
        for side in ("R", "L"):
            F = fitted_course(ex, sources, side, max_mm)
            if name == "Optic nerve (II)":    # the CT's own optic nerve (TotalSegmentator) guides it past the chiasm
                F = optic_guide(F, optic_ts[side])
            if name == "Olfactory nerve (I)":  # it lies on the anterior fossa's floor: lifted onto it where fitted below it
                F = lift_onto_floor(g, F)
            start, end = F[0, :3], F[-1, :3]
            if max_mm == "porus":
                end = porus[side]
                k = int(np.argmin(np.linalg.norm(F[:, :3] - end, axis=1)))
                F = F[: k + 1]
            P = NV.route(g, F[:, :3], start, end)
            if P is None:
                raise SystemExit(f"{name} {side}: no route")
            dev = cKDTree(F[:, :3]).query(P)[0]
            r = float(max(np.median(F[:, 3]), NV.MIN_RADIUS_MM if hasattr(NV, "MIN_RADIUS_MM") else 0.3))
            routes[(name, side)] = {"path": P, "radius": r, "cn": cn}
            report.setdefault(name, {})[side] = {"lengthMm": round(float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum()), 1),
                                                 "boneCrossedMm": round(NV.bone_crossed_mm(g, P), 1),
                                                 "maxFromFittedMm": round(float(dev.max()), 1)}
    # the optic nerve: drawn as thick as TotalSegmentator's segmentation of it (its volume over its length)
    landmarks, checks = [], {}
    for side, rel in (("R", "head_glands_cavities/optic_nerve_right"), ("L", "head_glands_cavities/optic_nerve_left")):
        T = ts_points(rel, ct_fossa, ct_R)
        P = routes[("Optic nerve (II)", side)]["path"]
        inside = P[(P[:, 1] >= T[:, 1].min()) & (P[:, 1] <= T[:, 1].max())]
        d = cKDTree(T).query(inside)[0] if len(inside) else np.array([np.nan])
        checks.setdefault("opticNerveToSegmentationMm", {})[side] = round(float(np.median(d)), 1)
        img = nib.load(TS / f"{rel}.nii.gz")
        vol = float((np.asanyarray(img.dataobj) > 0).sum() * abs(np.linalg.det(img.affine[:3, :3])))
        span = float(np.ptp(T @ np.linalg.svd(T - T.mean(0))[2][0]))
        routes[("Optic nerve (II)", side)]["radius"] = round(float(np.sqrt(vol / (np.pi * span))), 2)
    # foramina from the routes
    for lm, (src, window) in FORAMEN_OF.items():
        for side in ("R", "L"):
            P = routes[(src, side)]["path"]
            e = enclosure(g, P)
            i = first_enclosed(e)
            nerve = src[0].lower() + src[1:]
            landmarks.append({"name": lm, "side": side, "ras": P[i], "from": [src],
                              "how": (f"Where the {nerve}, routed through this CT, first passes between bone on most sides "
                                      if e[i] >= ENCLOSED else f"Where the {nerve}, routed through this CT, is most closely surrounded by bone ")
                                     + f"({round(float(e[i]) * 100)} % bone within {ENCLOSE_MM:.0f} mm of it)."})
    # the superior orbital fissure: where the nerves that pass it run closest together, between the cavernous sinus
    # and the orbit
    for side in ("R", "L"):
        paths = [routes[(n, side)]["path"] for n in SOF_NERVES]
        trees = [cKDTree(p) for p in paths[1:]]
        spread = np.array([sum(t.query(q)[0] for t in trees) for q in paths[0]])
        i = int(np.argmin(spread))
        pts = [paths[0][i]] + [p[t.query(paths[0][i])[1]] for p, t in zip(paths[1:], trees)]
        landmarks.append({"name": "Superior orbital fissure", "side": side, "ras": np.mean(pts, 0), "from": list(SOF_NERVES),
                          "how": "Where the oculomotor, trochlear, ophthalmic and abducens nerves, routed through this CT, run "
                                 f"closest together (within {spread[i] / 3:.1f} mm of each other on average)."})
    for side in ("R", "L"):
        pts = []
        for n in JUGULAR_NERVES:
            P = routes[(n, side)]["path"]
            pts.append(P[first_enclosed(enclosure(g, P))])
        landmarks.append({"name": "Jugular foramen", "side": side, "ras": np.mean(pts, 0), "from": list(JUGULAR_NERVES),
                          "how": "The middle of where the glossopharyngeal, vagus and accessory nerves, routed through this CT, are most "
                                 "closely surrounded by bone."})
        bulb = ts_points("headneck_bones_vessels/internal_jugular_vein_" + ("right" if side == "R" else "left"), ct_fossa, ct_R)
        top = bulb[bulb[:, 2] > bulb[:, 2].max() - 2].mean(0)
        checks.setdefault("jugularNervesToBulbMm", {})[side] = {n: round(float(cKDTree(routes[(n, side)]["path"]).query(top)[0]), 1)
                                                                 for n in JUGULAR_NERVES}
        ica = ts_points("headneck_bones_vessels/internal_carotid_artery_" + ("right" if side == "R" else "left"), ct_fossa, ct_R)
        landmarks.append({"name": "External opening of carotid canal", "side": side, "ras": ica[ica[:, 2] > ica[:, 2].max() - 1.5].mean(0),
                          "from": ["Internal carotid artery (cervical part)"],
                          "how": "The top of the internal carotid artery as TotalSegmentator segments it in this CT, where it enters the "
                                 "carotid canal."})
        landmarks.append({"name": "Internal acoustic meatus", "side": side, "ras": porus[side], "from": ["Nerves in the internal acoustic meatus (VII, VIII)"],
                          "how": "The medial end of the canal's contents in the registered OpenEar ear: the meatus' opening."})
    # the floor's openings: foramen ovale (a check), foramen lacerum and foramen magnum
    holes = floor_holes(g)
    big = max(holes, key=lambda h: h["area"])
    landmarks.append({"name": "Foramen magnum", "side": "M", "ras": big["centre"], "from": [],
                      "how": f"The centre of the largest opening of the cranial floor seen from above ({big['area']:.0f} mm²), at its rim's height."})
    for side, sign in (("R", 1.0), ("L", -1.0)):
        ov = next(l for l in landmarks if l["name"] == "Foramen ovale" and l["side"] == side)["ras"]
        near = [h for h in holes if h is not big and np.linalg.norm(h["centre"][:2] - ov[:2]) < 6]
        checks.setdefault("mandibularNerveToOvaleHoleMm", {})[side] = round(float(min(np.linalg.norm(h["centre"][:2] - ov[:2]) for h in near)), 1) if near else None
        # the foramen lacerum: the opening beside the sella, between the foramen ovale and the midline
        cand = [h for h in holes if h is not big and sign * h["centre"][0] > 5 and sign * h["centre"][0] < sign * ov[0] - 5
                and abs(h["centre"][1] - ov[1]) < 8]
        if cand:
            h = max(cand, key=lambda h: h["area"])
            landmarks.append({"name": "Foramen lacerum", "side": side, "ras": h["centre"], "from": [],
                              "how": f"The opening of the cranial floor beside the sella, medial to the foramen ovale, seen from above "
                                     f"({h['area']:.0f} mm²), at its rim's height."})
    bulbs = {}
    for side in ("R", "L"):
        B = ts_points("headneck_bones_vessels/internal_jugular_vein_" + ("right" if side == "R" else "left"), ct_fossa, ct_R)
        bulbs[side] = B[B[:, 2] > B[:, 2].max() - 2].mean(0)
    lum = Lumen(g)
    sinuses = trace_sinuses(g, lum, ex, bulbs)
    # this patient's carotid between the cervical segment (TotalSegmentator) and the cavernous one (TopBrain)
    cstart, cend = {}, {}
    for side in ("R", "L"):
        C = ts_points("headneck_bones_vessels/internal_carotid_artery_" + ("right" if side == "R" else "left"), ct_fossa, ct_R)
        cstart[side] = C[C[:, 2] > C[:, 2].max() - 1.5].mean(0)
        T = topbrain_surface("Internal carotid artery", side, ct_fossa, ct_R)
        cend[side] = T[np.argmin(T[:, 2])]
    carotids = trace_carotids(g, lum, cstart, cend, carotid_guide)
    smalls = small_arteries(g, ex, ct_fossa, ct_R)
    return {"routes": routes, "report": report, "landmarks": landmarks, "checks": checks, "sinuses": sinuses,
            "carotids": carotids, "small": smalls}


# ---------------------------------------------------------------- vessels traced through the CT's contrast
VENOUS_HU = (110.0, 320.0)   # the contrast in this angiogram's veins (the jugular vein's middle half: about 120-165 HU)
ARTERIAL_HU = (150.0, 550.0) # in its large arteries (the carotids' middle: 250-320 HU; partial volume with bone above)
CORE_MM = 1.5                # a trace point counts as in the lumen this deep inside the contrast range


class Lumen:
    """The CT on the bone grid, and how deep each voxel lies inside a contrast range (mm)."""

    def __init__(self, g: NV.Grid):
        img = nib.load(NV.CT_PATH)
        hu = np.asanyarray(img.dataobj).astype(np.float32)
        ijk = np.indices(g.bone.shape).reshape(3, -1).T
        q = nib.affines.apply_affine(np.linalg.inv(img.affine), nib.affines.apply_affine(g.a, ijk)).T
        self.HU = ndimage.map_coordinates(hu, q, order=1, mode="nearest").reshape(g.bone.shape)
        self.g = g
        self._depth = {}

    def depth(self, rng: tuple[float, float], exclude_bone: bool) -> np.ndarray:
        key = (rng, exclude_bone)
        if key not in self._depth:
            m = (self.HU > rng[0]) & (self.HU < rng[1])
            if exclude_bone:
                m &= ~self.g.bone
            self._depth[key] = ndimage.distance_transform_edt(m) * self.g.step
        return self._depth[key]


def trace_lumen(g: NV.Grid, depth: np.ndarray, guide: np.ndarray, start, end, sigma: float, corridor: float,
                bone_cost: float | None) -> tuple[np.ndarray, np.ndarray, dict]:
    """The least-cost path from start to end near a guiding course, where each step costs less the deeper it lies
    inside a contrast-filled lumen (so it follows the lumen's middle, not a blurred edge whose values pass through the
    same range) and more the further it is from the guide; bone costs bone_cost times more (None: no extra cost, for a
    lumen that runs inside a bony canal). Returns the path (frame mm), the lumen depth along it (smoothed; the drawn
    radius) and a report."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import dijkstra
    lo = np.maximum(np.floor(g.to_ijk(guide).min(0) - corridor / g.step - 2).astype(int), 0)
    hi = np.minimum(np.ceil(g.to_ijk(guide).max(0) + corridor / g.step + 2).astype(int), g.bone.shape)
    sub = tuple(slice(a, b) for a, b in zip(lo, hi))
    shape = tuple(hi - lo)
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(guide, axis=0), axis=1))]
    u = np.arange(0, s[-1] + 1e-6, 0.25)
    dense = np.stack([np.interp(u, s, guide[:, k]) for k in range(3)], 1)
    seed = np.zeros(shape, bool)
    qi = np.rint(g.to_ijk(dense) - lo).astype(int)
    ok = (qi >= 0).all(1) & (qi < np.array(shape)).all(1)
    seed[tuple(qi[ok].T)] = True
    dist = ndimage.distance_transform_edt(~seed) * g.step
    d = depth[sub]
    cost = (1.0 + (dist / sigma) ** 2) * (1.0 + 8.0 * np.clip(CORE_MM + 1.0 - d, 0, None))
    if bone_cost:
        cost = np.where(g.bone[sub], cost * bone_cost, cost)
    nodes = np.argwhere(dist <= corridor)
    idx = -np.ones(shape, np.int64)
    idx[tuple(nodes.T)] = np.arange(len(nodes))
    rows, cols, w = [], [], []
    for dv in [(i, j, k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1) if (i, j, k) > (0, 0, 0)]:
        nb = nodes + np.array(dv)
        okn = (nb >= 0).all(1) & (nb < np.array(shape)).all(1)
        a_, j_ = np.nonzero(okn)[0], idx[tuple(nb[okn].T)]
        keep = j_ >= 0
        a_, j_ = a_[keep], j_[keep]
        rows.append(a_); cols.append(j_)
        w.append(0.5 * (cost[tuple(nodes[a_].T)] + cost[tuple(nodes[j_].T)]) * np.sqrt(sum(x * x for x in dv)) * g.step)
    rows, cols, w = map(np.concatenate, (rows, cols, w))
    G = coo_matrix((np.r_[w, w], (np.r_[rows, cols], np.r_[cols, rows])), shape=(len(nodes),) * 2).tocsr()

    def nearest(p):
        return int(np.argmin(np.linalg.norm(nodes - (g.to_ijk(p)[0] - lo), axis=1)))
    a0, b0 = nearest(start), nearest(end)
    _, pred = dijkstra(G, indices=a0, return_predecessors=True)
    path = [b0]
    while path[-1] != a0:
        path.append(int(pred[path[-1]]))
    V = nodes[path[::-1]]
    dd = d[tuple(V.T)]
    P = ndimage.gaussian_filter1d(g.to_frame(V + lo), 2, axis=0, mode="nearest")
    rad = ndimage.gaussian_filter1d(dd, 3)
    length = float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum())
    rep = {"lengthMm": round(length, 1), "inLumenShare": round(float((dd >= CORE_MM).mean()), 2),
           "medianRadiusMm": round(float(np.median(rad)), 1), "boneCrossedMm": round(float(g.bone[sub][tuple(V.T)].mean() * length), 1)}
    return P, rad, rep


def trace_sinuses(g: NV.Grid, lum: Lumen, ex: dict, bulb: dict) -> dict:
    """Each side's sigmoid and transverse sinus, traced through this CT's own enhanced lumen (trace_lumen) from the
    jugular bulb (the top of TotalSegmentator's internal jugular vein) to the fitted transverse sinus' medial end, near
    the fitted course; bone (it lies in a groove on it, never through it) costs COST_BONE times more. Split into sigmoid
    and transverse sinus at the point nearest the fitted junction of the two."""
    depth = lum.depth(VENOUS_HU, True)
    out = {}
    for side in ("R", "L"):
        S = np.array(ex["lines"][f"Sigmoid sinus.{side.lower()}"]["runs"][0])[:, :3]
        T = np.array(ex["lines"][f"Transverse sinus.{side.lower()}"]["runs"][0])[:, :3]
        guide = np.vstack([bulb[side], S[::-1], T[::-1]])
        P, rad, rep = trace_lumen(g, depth, guide, bulb[side], T[0], sigma=10.0, corridor=20.0, bone_cost=NV.COST_BONE)
        k = int(np.argmin(np.linalg.norm(P - S[0], axis=1)))
        rad = np.maximum(rad, 1.0)
        out[side] = {"sigmoid": (P[: k + 1], rad[: k + 1]), "transverse": (P[k:], rad[k:]), "report": rep}
    return out


def trace_carotids(g: NV.Grid, lum: Lumen, start: dict, end: dict, guide: dict) -> dict:
    """This patient's internal carotid artery through the carotid canal and the foramen lacerum: traced (trace_lumen)
    through its contrast-filled lumen from the top of TotalSegmentator's cervical carotid to the lowest point of
    TopBrain's carotid label, near the registered OpenEar specimen's carotid (guide). The canal's bone around it is not
    penalised: the lumen is inside it."""
    depth = lum.depth(ARTERIAL_HU, False)
    out = {}
    for side in ("R", "L"):
        G = np.vstack([start[side], guide[side], end[side]])
        P, rad, rep = trace_lumen(g, depth, G, start[side], end[side], sigma=6.0, corridor=10.0, bone_cost=None)
        rep["medianFromSpecimenMm"] = round(float(np.median(cKDTree(guide[side]).query(P)[0])), 1)
        rep.pop("boneCrossedMm")   # the bone mask's thin-bone margin reaches into the contrast-filled canal: says nothing here
        out[side] = {"path": P, "radius": np.maximum(rad, 1.0), "report": rep}
    return out


# ---------------------------------------------------------------- small arteries the CT does not resolve
# the fitted Z-Anatomy branches (Skull base v2) that this angiogram cannot show, each moved to start on this patient's own
# parent vessel (TopBrain's label), or routed through the CT's openings where it crosses bone; drawn as approximate
TOPBRAIN = {"Internal carotid artery": {"R": [4], "L": [6]}, "Basilar artery": {"R": [1], "L": [1]}, "Middle cerebral artery (M1 segment)": {"R": [5], "L": [7]},
            "Vertebral artery": {"R": [23], "L": [24]}, "Ophthalmic artery": {"R": [33], "L": [34]}}
ANCHORED = [  # name, parent (TopBrain), artery system
    ("Proximal lateral striate branches", "Middle cerebral artery (M1 segment)", "Middle cerebral artery"),
    ("Distal lateral striate branches", "Middle cerebral artery (M1 segment)", "Middle cerebral artery"),
    ("Medial pontine branches of basilar artery", "Basilar artery", "Basilar artery"),
    ("Lateral pontine branches of basilar artery", "Basilar artery", "Basilar artery"),
    ("Anterior spinal artery", "Vertebral artery", "Vertebral artery"),
]
# long branches whose distal course the fit places well (the anterior inferior cerebellar artery's loop at the internal
# acoustic meatus, by the petrous bone): their origin moved onto this patient's parent vessel, the move fading out along
# the first FADE_MM of their course (the fitted line from skullbase_v3_skull.py: v2 leaves it out)
FADED = [("Anterior inferior cerebellar artery", "Basilar artery", "Basilar artery")]
FADE_MM = 15.0
ROUTED_ARTERIES = [  # name, parent (TopBrain, or None), artery system
    ("Anterior ethmoidal artery", "Ophthalmic artery", "Ethmoidal arteries"),
    ("Posterior ethmoidal artery", "Ophthalmic artery", "Ethmoidal arteries"),
    ("Accessory branch of middle meningeal artery", None, "Middle meningeal artery"),
]


def topbrain_surface(parent: str, side: str, ct_fossa, ct_R) -> np.ndarray:
    lab = nib.load(ROOT / "data" / "raw" / "topbrain" / "topcow_ct_011.nii.gz")
    L = np.asanyarray(lab.dataobj)
    m = np.isin(L, TOPBRAIN[parent][side])
    edge = m & ~ndimage.binary_erosion(m)
    return (nib.affines.apply_affine(lab.affine, np.argwhere(edge)) - ct_fossa) @ ct_R


def small_arteries(g: NV.Grid, ex: dict, ct_fossa, ct_R) -> dict:
    """{(name, side): {"runs": [(P, r)], "system", "how", "moved"}}"""
    out = {}
    cache = {}

    def surf(parent, side):
        if (parent, side) not in cache:
            cache[(parent, side)] = cKDTree(topbrain_surface(parent, side, ct_fossa, ct_R))
        return cache[(parent, side)]
    for name, parent, system in ANCHORED:
        for side in ("R", "L"):
            runs, moves = [], []
            for r in ex["lines"][f"{name}.{side.lower()}"]["runs"]:
                R = np.array(r)
                if len(R) < 2:
                    continue
                t = surf(parent, side)
                ends = [0, len(R) - 1]
                d = [t.query(R[e, :3])[0] for e in ends]
                origin = ends[int(np.argmin(d))]
                shift = t.data[t.query(R[origin, :3])[1]] - R[origin, :3]
                runs.append((R[:, :3] + shift, R[:, 3]))
                moves.append(float(np.linalg.norm(shift)))
            out[(name, side)] = {"runs": runs, "system": system, "moved": round(float(np.median(moves)), 1), "parent": parent,
                                 "how": f"each branch moved, unchanged in shape, to start on this patient's {parent.lower()} (TopBrain's label)"}
    for name, parent, system in FADED:
        for side in ("R", "L"):
            key = f"{name}.{side.lower()}"
            if key not in ex["lines"]:
                continue
            R = np.vstack([np.array(r) for r in ex["lines"][key]["runs"] if len(r) > 1])
            t = surf(parent, side)
            if t.query(R[-1, :3])[0] < t.query(R[0, :3])[0]:
                R = R[::-1]
            shift = t.data[t.query(R[0, :3])[1]] - R[0, :3]
            arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(R[:, :3], axis=0), axis=1))]
            f = np.clip(1 - arc / FADE_MM, 0, 1)
            f = f * f * (3 - 2 * f)                 # smooth
            out[(name, side)] = {"runs": [(R[:, :3] + f[:, None] * shift, R[:, 3])], "system": system,
                                 "moved": round(float(np.linalg.norm(shift)), 1), "parent": parent,
                                 "how": f"its origin moved onto this patient's {parent.lower()} (TopBrain's label), the move fading out "
                                        f"over its first {FADE_MM:.0f} mm, the rest where the fit puts it"}
    for name, parent, system in ROUTED_ARTERIES:
        for side in ("R", "L"):
            R = np.vstack([np.array(r) for r in ex["lines"][f"{name}.{side.lower()}"]["runs"] if len(r) > 1])
            F = R[:, :3]
            start, end = F[0], F[-1]
            if parent:
                t = surf(parent, side)
                if t.query(F[-1])[0] < t.query(F[0])[0]:
                    F, R = F[::-1], R[::-1]
                start = t.data[t.query(F[0])[1]]
                end = F[-1]
            P = NV.route(g, F, start, end)
            if P is None:
                continue
            out[(name, side)] = {"runs": [(P, np.full(len(P), max(float(np.median(R[:, 3])), 0.3)))], "system": system,
                                 "moved": round(float(cKDTree(F).query(P)[0].max()), 1), "parent": parent,
                                 "how": ("from this patient's " + parent.lower() + " (TopBrain's label), " if parent else "")
                                        + "routed through the CT near its fitted course, crossing bone only through an opening"}
    return out
