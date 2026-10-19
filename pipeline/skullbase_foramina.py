"""Foramina the Z-Anatomy model does not label, located from what passes through them (skullbase_build.py, both models).

Each opening is where a nerve or vessel of the model passes through the bone. Along its centre line, the share of rays
cast across it (ENCLOSURE_RAYS directions perpendicular to the line, ENCLOSURE_MM long) that meet bone says whether the
line runs in the open or inside bone (a canal or foramen). The opening is where that share rises above, or falls below,
ENCLOSED for at least a few millimetres:

  Internal acoustic meatus  facial and vestibulocochlear nerves: where they enter the bone (the meatus's opening; it is
                            wide, so the lower share FISSURE counts)
  Stylomastoid foramen      facial nerve: where it leaves the bone for good (the share FISSURE: its mastoid course runs
                            among air cells)
  Jugular foramen           glossopharyngeal, vagus and accessory nerves: the middle of their passage through the bone
  Superior orbital fissure  oculomotor, trochlear, ophthalmic and abducens nerves: where they reach the bone at the orbital
                            apex (the fissure is a slit, so a lower share counts: FISSURE)
  Carotid canal             internal carotid artery: where it enters the bone from below (the canal's external opening)
                            and where its passage through the bone ends (its internal opening, where it turns upwards)
  Foramen lacerum           FL_BELOW_MM below the internal carotid artery, FL_BEYOND_MM beyond where it leaves the
                            carotid canal (the canal opens at the foramen's posterolateral margin; the artery's lacerum
                            segment lies just above it)
  Cribriform plate          olfactory nerve filaments: the middle of their short passages through the bone

On each side the points of the structures named are averaged. Each passage is measured against the bones that form the
opening only (FORMED_BY). Each landmark records how it was found ("how").
"""
from __future__ import annotations

import re

import numpy as np
from scipy.spatial import cKDTree

ENCLOSURE_RAYS = 16
ENCLOSURE_MM = 6.0
ENCLOSED = 0.75      # share of rays meeting bone: inside a canal
FISSURE = 0.5        # a fissure is open along its length
SUSTAIN_MM = 2.0     # a change counts when it lasts this long along the line
STEP_MM = 0.5        # the centre lines are resampled to this spacing
FL_BELOW_MM = 3.0
FL_BEYOND_MM = 3.0


def resample(run: np.ndarray, step: float = STEP_MM) -> np.ndarray:
    seg = np.linalg.norm(np.diff(run, axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    if s[-1] < step:
        return run
    t = np.arange(0, s[-1], step)
    return np.stack([np.interp(t, s, run[:, k]) for k in range(3)], 1)


class Bone:
    """The model's bone surface as triangles, with ray casting (Moeller-Trumbore) against the triangles near a point."""

    def __init__(self, meshes: list[tuple[np.ndarray, np.ndarray]]):
        tris = [v[t] for v, t in meshes if len(t)]
        self.tri = np.concatenate(tris)
        self.cent = self.tri.mean(1)
        self.tree = cKDTree(self.cent)
        self.vtree = cKDTree(np.concatenate([v for v, _ in meshes]))

    def hits(self, o: np.ndarray, d: np.ndarray, reach: float) -> np.ndarray:
        """For rays from o (n, 3) along unit d (n, 3): whether each meets bone within reach."""
        out = np.zeros(len(o), bool)
        near = self.tree.query_ball_point(o.mean(0), reach + float(np.linalg.norm(o - o.mean(0), axis=1).max()) + 2.0)
        if not near:
            return out
        tri = self.tri[near]
        e1, e2 = tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]
        pv = np.cross(d[:, None, :], e2[None])
        det = np.einsum("rfk,fk->rf", pv, e1)
        with np.errstate(divide="ignore", invalid="ignore"):
            inv = 1.0 / det
            tv = o[:, None, :] - tri[None, :, 0]
            u = np.einsum("rfk,rfk->rf", tv, pv) * inv
            qv = np.cross(tv, e1[None])
            v = np.einsum("rfk,rk->rf", qv, d) * inv
            t = np.einsum("rfk,fk->rf", qv, e2) * inv
        hit = (np.abs(det) > 1e-12) & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 0) & (t <= reach)
        return hit.any(1)

    def enclosure(self, p: np.ndarray, tangent: np.ndarray, reach: float = ENCLOSURE_MM) -> float:
        a = np.array([1.0, 0, 0]) if abs(tangent[0]) < 0.9 else np.array([0, 1.0, 0])
        n1 = np.cross(tangent, a)
        n1 /= np.linalg.norm(n1)
        n2 = np.cross(tangent, n1)
        ang = np.linspace(0, 2 * np.pi, ENCLOSURE_RAYS, endpoint=False)
        d = np.cos(ang)[:, None] * n1 + np.sin(ang)[:, None] * n2
        return float(self.hits(np.repeat(p[None], len(d), 0), d, reach).mean())


def profile(bone: Bone, run: np.ndarray, reach: float = ENCLOSURE_MM) -> np.ndarray:
    t = np.gradient(run, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True) + 1e-12
    return np.array([bone.enclosure(p, tt, reach) for p, tt in zip(run, t)])


def stretches(enc: np.ndarray, level: float) -> list[tuple[int, int]]:
    """Index ranges [i, j] where the share stays at or above level for at least SUSTAIN_MM (short dips bridged)."""
    n = int(round(SUSTAIN_MM / STEP_MM))
    on = enc >= level
    # bridge dips shorter than the sustain length
    i = 0
    while i < len(on):
        if not on[i]:
            j = i
            while j < len(on) and not on[j]:
                j += 1
            if 0 < i and j < len(on) and j - i < n:
                on[i:j] = True
            i = j
        else:
            i += 1
    out, i = [], 0
    while i < len(on):
        if on[i]:
            j = i
            while j + 1 < len(on) and on[j + 1]:
                j += 1
            if j - i + 1 >= n:
                out.append((i, j))
            i = j + 1
        else:
            i += 1
    return out


# ---------------------------------------------------------------- the rules
JUGULAR_MM = 10.0    # the jugular foramen is about a centimetre across: longer rays
CAROTID_MM = 10.0    # so is the carotid canal, and the artery need not run in its middle
FISSURE_NERVES = ["Oculomotor nerve (III)", "Trochlear nerve (IV)", "Ophthalmic nerve", "Abducens nerve (VI)"]


def trunk(lines: dict, name: str, side: str, proximal) -> np.ndarray | None:
    """A structure's longest run on one side, resampled and oriented to start at its proximal end (the end where
    proximal(point) is smaller)."""
    ln = lines.get(f"{name}.{side.lower()}") or lines.get(name)
    if not ln:
        return None
    runs = [np.array(r, float)[:, :3] for r in ln["runs"] if len(r) > 1]
    if not runs:
        return None
    r = resample(max(runs, key=lambda q: np.linalg.norm(np.diff(q, axis=0), axis=1).sum()))
    return r if proximal(r[0]) <= proximal(r[-1]) else r[::-1]


def first(enc: np.ndarray, level: float) -> tuple[int, int] | None:
    st = stretches(enc, level)
    return st[0] if st else None


# the bones that form each opening: its passage is measured against these only (the carotid, for one, is still enclosed
# by the sphenoid after it leaves the temporal bone's canal)
FORMED_BY = {"Internal acoustic meatus": ["Temporal bone"], "Stylomastoid foramen": ["Temporal bone"],
             "Jugular foramen": ["Temporal bone", "Occipital bone"], "Superior orbital fissure": ["Sphenoid bone"],
             "Carotid canal": ["Temporal bone"], "Cribriform plate": ["Ethmoid bone"]}


def derive(bones: dict[str, tuple[np.ndarray, np.ndarray]], lines: dict) -> list[dict]:
    """The foramina on each side of a model: [{name, side, ras, how, from}] (from: the structures used). bones: by name
    (Z-Anatomy names, paired bones with .l / .r)."""
    out = []
    cache: dict = {}

    def bone_for(key: str, side: str) -> Bone:
        names = [n for n in bones if re.sub(r"\.[lr]$", "", n) in FORMED_BY[key]]
        names = [n for n in names if not (n.endswith(".l") or n.endswith(".r")) or n.endswith("." + side.lower())]
        k = (key, side)
        if k not in cache:
            cache[k] = Bone([bones[n] for n in names])
        return cache[k]

    medial = lambda p: abs(p[0])          # noqa: E731  cranial nerves start at the brainstem, near the midline
    below = lambda p: p[2]                # noqa: E731  the carotid comes up from the neck
    back = lambda p: p[1]                 # noqa: E731  the orbital nerves run forwards
    for side in ("L", "R"):
        def add(name, pts, how, used):
            if pts:
                out.append({"name": name, "side": side, "ras": np.mean(pts, 0).round(3).tolist(), "how": how, "from": used})

        # internal acoustic meatus: where the facial and vestibulocochlear nerves enter the bone
        bone = bone_for("Internal acoustic meatus", side)
        pts, used = [], []
        for n in ("Facial nerve (VII)", "Vestibulocochlear nerve (VIII)"):
            r = trunk(lines, n, side, medial)
            if r is None:
                continue
            st = first(profile(bone, r), FISSURE)
            if st:
                pts.append(r[st[0]]); used.append(n)
        add("Internal acoustic meatus", pts, "where the model's facial and vestibulocochlear nerves enter the temporal bone (rays cast "
            f"across each nerve meet bone on at least {FISSURE:.0%} of sides within {ENCLOSURE_MM:.0f} mm: the meatus is wide), averaged", used)

        # stylomastoid foramen: where the facial nerve leaves the bone for good
        bone = bone_for("Stylomastoid foramen", side)
        r = trunk(lines, "Facial nerve (VII)", side, medial)
        if r is not None:
            st = stretches(profile(bone, r), FISSURE)
            if st:
                add("Stylomastoid foramen", [r[st[-1][1]]], "where the model's facial nerve leaves the temporal bone for the last time "
                    f"(the end of its last passage through bone: rays across it meet bone on at least {FISSURE:.0%} of sides within "
                    f"{ENCLOSURE_MM:.0f} mm)", ["Facial nerve (VII)"])

        # jugular foramen: the middle of the passage of IX, X and XI through the bone
        bone = bone_for("Jugular foramen", side)
        pts, used = [], []
        for n in ("Glossopharyngeal nerve (IX)", "Vagus nerve (X)", "Accessory nerve (XI)"):
            r = trunk(lines, n, side, medial)
            if r is None:
                continue
            enc = profile(bone, r, JUGULAR_MM)
            st = first(enc, FISSURE)
            if st:
                pts.append(r[(st[0] + st[1]) // 2]); used.append(n)
        add("Jugular foramen", pts, "the middle of the passage of the model's glossopharyngeal, vagus and accessory nerves through "
            f"the skull base (rays across each nerve meet bone on at least {FISSURE:.0%} of sides within {JUGULAR_MM:.0f} mm), averaged", used)

        # superior orbital fissure: where the orbital nerves bundle most tightly, among points the bone partly encloses
        bone = bone_for("Superior orbital fissure", side)
        runs = {n: trunk(lines, n, side, back) for n in FISSURE_NERVES}
        runs = {n: r for n, r in runs.items() if r is not None}
        if len(runs) >= 3:
            best = None
            for n, r in runs.items():
                enc = profile(bone, r)
                others = [cKDTree(q) for m, q in runs.items() if m != n]
                spread = np.sum([t.query(r)[0] for t in others], axis=0)
                spread[enc < FISSURE] = np.inf
                i = int(np.argmin(spread))
                if np.isfinite(spread[i]) and (best is None or spread[i] < best[0]):
                    best = (spread[i], r[i])
            if best is not None:
                p0 = best[1]
                pts = [r[int(np.argmin(np.linalg.norm(r - p0, axis=1)))] for r in runs.values()]
                add("Superior orbital fissure", pts, "where the model's oculomotor, trochlear, ophthalmic and abducens nerves run closest "
                    f"together, among points where the bone encloses them on at least {FISSURE:.0%} of sides (rays of "
                    f"{ENCLOSURE_MM:.0f} mm); the nerves' nearest points to it, averaged", list(runs))

        # carotid canal: where the internal carotid artery enters the temporal bone from below and where it leaves it
        bone = bone_for("Carotid canal", side)
        r = trunk(lines, "Internal carotid artery", side, below)
        if r is not None:
            st = stretches(profile(bone, r, CAROTID_MM), ENCLOSED)
            if st:
                i0 = st[0][0]
                # the canal: from the first passage to the last one that starts within 15 mm of it (short gaps)
                j0 = max(j for i, j in st if (i - st[0][1]) * STEP_MM <= 15)
                add("External opening of carotid canal", [r[i0]], "where the model's internal carotid artery enters the temporal bone from below "
                    f"(rays across it meet the temporal bone on at least {ENCLOSED:.0%} of sides within {CAROTID_MM:.0f} mm)", ["Internal carotid artery"])
                add("Internal opening of carotid canal", [r[j0]], "where the model's internal carotid artery leaves the carotid canal "
                    "(the end of its passage through the temporal bone)", ["Internal carotid artery"])
                k = min(len(r) - 1, j0 + int(round(FL_BEYOND_MM / STEP_MM)))
                add("Foramen lacerum", [r[k] - np.array([0, 0, FL_BELOW_MM])], f"{FL_BELOW_MM:.0f} mm below the model's internal carotid "
                    f"artery, {FL_BEYOND_MM:.0f} mm beyond where it leaves the carotid canal (the canal opens at the foramen's posterolateral "
                    "margin, and the artery's lacerum segment lies just above it)", ["Internal carotid artery"])

        # cribriform plate: the middle of the olfactory filaments' passages through the bone
        bone = bone_for("Cribriform plate", side)
        ln = lines.get(f"Olfactory nerve (I).{side.lower()}")
        if ln:
            pts = []
            for r in ln["runs"]:
                r = resample(np.array(r, float)[:, :3])
                if len(r) < 4:
                    continue
                if r[0, 2] < r[-1, 2]:   # from the olfactory bulb downwards
                    r = r[::-1]
                st = first(profile(bone, r, 3.0), FISSURE)
                if st:
                    pts.append(r[(st[0] + st[1]) // 2])
            if len(pts) >= 3:
                add("Cribriform plate", pts, "the middle of the olfactory filaments' passages through the bone (rays of 3 mm across each "
                    f"meet bone on at least {FISSURE:.0%} of sides), averaged over {len(pts)} filaments", ["Olfactory nerve (I)"])
    return out
