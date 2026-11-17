"""A vessel cut where the drawn medulla ends.

The skull base models draw no spinal cord: the medulla is cut about a centimetre below the foramen magnum (13 mm
below its centre on Skull base v3, 11 mm on the Z-Anatomy model) and nothing is drawn below it. The anterior spinal
artery, which runs down the front of the medulla onto the cord, was drawn on past that cut, into empty space (5.5 and
9.0 mm past it on Skull base v3, 2.0 mm on the Z-Anatomy model): seen in the far lateral view, where it is drawn since
November 2026 (the audit's AP-08), it hung below the brainstem's stump. The owner's decision of 17 November 2026:
cut it where the medulla is cut.

  end_plane(medulla): the medulla's cut end as a plane. Its faces at the lower end that face away from the brainstem
      lie in one plane (a flat cut); the plane is fitted to them, and the fit fails loudly if they are not flat.
  trim(vessel, plane): the vessel's mesh cut by that plane, what lies past it removed, the cut closed with a cap; a
      shape of the brain the vessel carries (a morph target) is kept, its offsets interpolated at the new points.

Used by skullbase_v3_clearance.py (v3) and skullbase_v1_ends.py (v1). Cutting a mesh that already ends at the plane
changes nothing, so either can run again.
"""
from __future__ import annotations

import numpy as np

# the vessels that run on down the spinal cord, and what their cards say of the cut
VESSELS = ("Anterior spinal artery",)
NOTE = " Cut where the drawn medulla ends: it runs on down the spinal cord, which this model does not show (vessel_end.py)."
PAST_MM = 0.05         # the check: none of such a vessel further than this past the medulla's cut end
LOWER_SHARE = 0.3      # the medulla's lower end: this share of its surface along its own axis
FACING = 0.5           # a face of the cut looks away from the brainstem (cosine to the axis, first guess) ...
IN_PLANE = 0.95        # ... and, once the cut's direction is known, along it (cosine)
MIN_AREA_MM2 = 50.0    # a cut end smaller than this is not one
MAX_RMS_MM = 0.5       # ... nor one whose faces lie further than this from a plane
ON_PLANE_MM = 1e-3      # (a point stored on the plane reads back a few millionths of a millimetre off it)


def merged(nodes: dict) -> tuple[np.ndarray, np.ndarray]:
    """A structure's halves as one triangle soup: positions and faces."""
    P, T, off = [], [], 0
    for nd in nodes.values():
        P.append(np.asarray(nd["positions"], float))
        T.append(np.asarray(nd["indices"]).reshape(-1, 3) + off)
        off += len(nd["positions"])
    return np.vstack(P), np.vstack(T)


def end_plane(nodes: dict) -> tuple[np.ndarray, np.ndarray, dict]:
    """The medulla's cut end: a point on it, its unit normal (pointing out of the medulla, towards where the cord would
    be) and what was measured (the cut's area, how flat it is)."""
    P, T = merged(nodes)
    a, b, c = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    fn = np.cross(b - a, c - a)
    area = np.linalg.norm(fn, axis=1) / 2
    fn = fn / (2 * area[:, None] + 1e-12)
    cen = (a + b + c) / 3
    # the medulla's axis: from its lowest part up to its middle
    mid = P.mean(0)
    axis = mid - P[P[:, 2] <= np.quantile(P[:, 2], 0.02)].mean(0)
    axis /= np.linalg.norm(axis)
    low = (cen - mid) @ axis < np.quantile((P - mid) @ axis, LOWER_SHARE)
    sel = low & (fn @ -axis > FACING)
    if not sel.any():
        raise SystemExit("vessel_end: the medulla has no faces at its lower end that face away from it")
    n = (fn[sel] * area[sel, None]).sum(0)
    n /= np.linalg.norm(n)
    for _ in range(3):
        sel = low & (fn @ n > IN_PLANE)
        n = (fn[sel] * area[sel, None]).sum(0)
        n /= np.linalg.norm(n)
    c0 = (cen[sel] * area[sel, None]).sum(0) / area[sel].sum()
    rms = float(np.sqrt((((cen[sel] - c0) @ n) ** 2 * area[sel]).sum() / area[sel].sum()))
    rep = {"point": c0.round(2).tolist(), "normal": n.round(4).tolist(), "areaMm2": round(float(area[sel].sum()), 1), "rmsMm": round(rms, 2)}
    if rep["areaMm2"] < MIN_AREA_MM2 or rms > MAX_RMS_MM:
        raise SystemExit(f"vessel_end: the medulla's lower end is not a flat cut ({rep})")
    return c0, n, rep


def trim(nodes: dict, c0: np.ndarray, n: np.ndarray) -> dict:
    """Cut each half of a vessel by the plane (in place): the triangles past it removed, those across it clipped, the
    cut closed with a fan of triangles round each loop's middle. Returns per half how far the vessel ran past the plane
    (mm) and how many of its points lay there; a half that does not reach the plane is left as it is."""
    out = {}
    for side, nd in nodes.items():
        P = np.asarray(nd["positions"], float)
        T = np.asarray(nd["indices"]).reshape(-1, 3)
        d = (P - c0) @ n
        past = d > ON_PLANE_MM
        out[side] = {"pastMm": round(float(max(d.max(), 0.0)), 2), "pointsPast": int(past.sum()), "points": int(len(P))}
        if not past.any():
            continue
        if past.all():
            raise SystemExit(f"vessel_end: the whole of the vessel's {side} half lies past the medulla's end")
        deltas = [np.asarray(t["positions"], float) for t in nd["targets"]]
        new_p, new_d = [], [[] for _ in deltas]
        on_edge: dict[tuple[int, int], int] = {}

        def cross(i: int, j: int) -> int:
            """The point where the edge from i (kept) to j (past) meets the plane: made once per edge."""
            key = (i, j)
            if key not in on_edge:
                t = d[i] / (d[i] - d[j])
                on_edge[key] = len(P) + len(new_p)
                new_p.append(P[i] + t * (P[j] - P[i]))
                for k, D in enumerate(deltas):
                    new_d[k].append(D[i] + t * (D[j] - D[i]))
            return on_edge[key]

        faces, rim = [], []       # rim: the cut's edges, each in the direction its kept triangle runs it
        for tri in T:
            k = ~past[tri]
            if k.all():
                faces.append(tri)
            elif k.any():
                # walk the triangle's corners in order, keeping the kept ones and adding the crossings
                poly = []
                for e in range(3):
                    i, j = int(tri[e]), int(tri[(e + 1) % 3])
                    if not past[i]:
                        poly.append(i)
                        if past[j]:
                            poly.append(cross(i, j))
                    elif not past[j]:
                        poly.append(cross(j, i))
                for q in range(1, len(poly) - 1):
                    faces.append([poly[0], poly[q], poly[q + 1]])
                made = [v for v in poly if v >= len(P)]
                # the two crossings are neighbours in the polygon: in its own order
                i0, i1 = poly.index(made[0]), poly.index(made[1])
                rim.append((made[0], made[1]) if (i0 + 1) % len(poly) == i1 else (made[1], made[0]))
        Q = np.vstack([P, np.array(new_p)]) if new_p else P
        faces = [np.asarray(f) for f in faces]
        # close the cut: each loop of rim edges fanned from its middle, turned to face out of the medulla
        nxt = dict(rim)
        seen, extra_p, extra_d = set(), [], [[] for _ in deltas]
        for start in list(nxt):
            if start in seen:
                continue
            loop, v = [], start
            while v not in seen and v in nxt:
                seen.add(v)
                loop.append(v)
                v = nxt[v]
            if len(loop) < 3 or v != start:
                raise SystemExit(f"vessel_end: the cut through the vessel's {side} half is not a closed loop")
            centre = len(Q) + len(extra_p)
            extra_p.append(Q[loop].mean(0))
            for k, D in enumerate(deltas):
                extra_d[k].append(np.vstack([D, np.array(new_d[k])])[loop].mean(0) if new_d[k] else D[loop].mean(0))
            for q in range(len(loop)):
                faces.append(np.array([loop[(q + 1) % len(loop)], loop[q], centre]))   # against the rim: outward
        Q = np.vstack([Q, np.array(extra_p)])
        F = np.vstack(faces)
        # drop the points no triangle uses any more
        used = np.zeros(len(Q), bool)
        used[F.ravel()] = True
        idx = np.cumsum(used) - 1
        nd["positions"] = Q[used]
        nd["indices"] = idx[F]
        nd["normals"] = None
        for k, t in enumerate(nd["targets"]):
            D = np.vstack([deltas[k]] + ([np.array(new_d[k])] if new_d[k] else []) + [np.array(extra_d[k])])
            t["positions"] = D[used]
            t["normals"] = None
        # the cap faces out of the medulla
        cap = F[-len(seen):]          # (one triangle per rim edge, added last)
        a, b, c = Q[cap[:, 0]], Q[cap[:, 1]], Q[cap[:, 2]]
        if (np.cross(b - a, c - a) @ n).sum() < 0:
            raise SystemExit(f"vessel_end: the cap on the vessel's {side} half faces into the medulla")
        after = (nd["positions"] - c0) @ n
        out[side].update({"loops": len(extra_p), "pointsAfter": int(len(nd["positions"])), "pastAfterMm": round(float(max(after.max(), 0.0)), 4)})
    return out
