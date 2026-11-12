"""The bone as drawn, as a field a structure placed by rule is kept out of: a schematic root or artery of the spine
(spine_build.py).

A path is first led round the bone where its centre line runs inside it (thread: the cheapest way through open space
on the grid), then pushed clear of it (clear)."""
from __future__ import annotations

import numpy as np
from scipy import ndimage

PATH_STEP_MM = 1.0     # a schematic path is sampled this finely before it is kept out of the bone: the bone between two
                       # sparse points would go unseen, by the pushes and by the check on the finished tube's vertices
PUSH_PASSES = 16       # rounds of pushing a path out of the bone (DrawnBone.clear)
THREAD_NEAR = 4.0      # threading a path round the bone: a step this much dearer per mm2 of missing clearance,
THREAD_IN = 40.0       # and this much dearer per mm of depth inside the bone (finite: a way is always found)
THREAD_MARGIN_MM = 14.0
THREAD_STEP_MM = 0.75


def _apply(aff: np.ndarray, P: np.ndarray) -> np.ndarray:
    return np.asarray(P, float) @ aff[:3, :3].T + aff[:3, 3]


class DrawnBone:
    """The bone as drawn on a block of the CT (drawn_solid), as a signed distance (mm, positive outside): what a
    structure placed by rule (a root, its ganglion, the vertebral artery) is kept out of. Until November 2026 the
    roots were cleared of the CT's bright voxels alone: a pedicle's cancellous core is darker than BONE_HU and read as
    open space, so a root pushed "out of the bone" came to rest inside it, and the build's report called it clear (the
    audit's finding MC-05)."""

    def __init__(self, solid: np.ndarray, affine: np.ndarray):
        self.vox = np.abs(np.diag(affine)[:3])
        self.sd = (ndimage.distance_transform_edt(~solid, sampling=self.vox)
                   - ndimage.distance_transform_edt(solid, sampling=self.vox)).astype(np.float32)
        self.affine, self.inv = affine, np.linalg.inv(affine)

    def dist(self, P: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(self.sd, _apply(self.inv, np.atleast_2d(P)).T, order=1, mode="nearest")

    def deepest(self, P: np.ndarray) -> float:
        """How far the deepest of these points (RAS) lies inside the bone (mm; 0: none inside)."""
        return round(float(np.clip(-self.dist(P), 0, None).max()), 2)

    def clear(self, P: np.ndarray, clearance: float, fixed: int = 0) -> tuple[np.ndarray, float]:
        """Points (RAS) pushed out of the bone to `clearance` mm from it, along its distance's gradient, the pushes
        smoothed along the path (a root bends rather than kinks); the first `fixed` stay. Midway between two walls
        nearer than twice the clearance there is no way out (the gradient vanishes there): such a point stays, and a
        push that would bring a point nearer the bone is halved until it does not. Returns the points and what
        intrusion is left (mm)."""
        P = P.copy()
        for _ in range(PUSH_PASSES):
            d0 = self.dist(P)
            need = np.clip(clearance - d0, 0, None)
            need[:fixed] = 0
            if need.max() < 0.05:
                break
            g = np.stack([(self.dist(P + 0.3 * e) - self.dist(P - 0.3 * e)) / 0.6 for e in np.eye(3)], 1)
            mag = np.linalg.norm(g, axis=1)
            g /= np.maximum(mag, 1e-6)[:, None]
            need *= np.clip(mag / 0.5, 0, 1)
            D = need[:, None] * g
            for _ in range(3):   # spread along the path, each point still moved at least its own way out
                D[1:-1] = 0.5 * D[1:-1] + 0.25 * (D[:-2] + D[2:])
            D += np.clip(need - np.einsum("ij,ij->i", D, g), 0, None)[:, None] * g
            D[:fixed] = 0
            step = np.ones(len(P))
            for _ in range(4):
                worse = self.dist(P + step[:, None] * D) < np.minimum(d0, clearance) - 1e-3
                if not worse.any():
                    break
                step[worse] *= 0.5
            else:
                step[worse] = 0
            if not (step[:, None] * D).any():
                break
            P += step[:, None] * D
        return P, float(np.clip(clearance - self.dist(P), 0, None)[fixed:].max(initial=0.0))

    def thread(self, P: np.ndarray, clearance: float, pins: tuple = (), near: float = THREAD_NEAR) -> tuple[np.ndarray, float]:
        """A path (RAS points) whose stretches with their centre line inside the bone are led round it: each such
        stretch, from the last point before it with `clearance` to the first after, is replaced by the cheapest way
        between the two on the CT's grid (a step costs more the less clearance it has, and far more inside the bone),
        resampled and smoothed. Pushing alone moves each buried point to its nearest surface, and two neighbours can
        come out on opposite sides of a wall, the path then crossing it. `pins`: indices of points the path must
        still pass (a foramen's centre: the cheapest way round a narrow foramen is otherwise past it, outside the
        bone); a stretch is cut there and each part led on its own. `near`: how much dearer a step is per mm2 of
        missing clearance (low for a path that has to pass a narrow place rather than go round it). Returns the path
        and the length replaced (mm)."""
        from skimage.graph import MCP_Geometric
        d = self.dist(P)
        if not (d < 0).any():
            return P, 0.0
        n = len(P)
        pins = sorted(set(int(k) for k in pins))
        raw, i = [], 0
        while i < n:
            if d[i] >= 0:
                i += 1
                continue
            j = i
            while j < n and d[j] < 0:
                j += 1
            a, b = max(i - 1, 0), min(j, n - 1)
            while a > 0 and d[a] < clearance and i - a < 8 and a not in pins:
                a -= 1
            while b < n - 1 and d[b] < clearance and b - j < 8 and b not in pins:
                b += 1
            if raw and a <= raw[-1][1]:
                raw[-1] = (raw[-1][0], b)
            else:
                raw.append((a, b))
            i = b + 1
        runs = []
        for a, b in raw:
            cuts = [a] + [k for k in pins if a < k < b] + [b]
            runs += list(zip(cuts, cuts[1:]))
        out, new, at, replaced = [], [], 0, 0.0
        shape = np.array(self.sd.shape)
        for a, b in runs:
            out.append(P[at:a]); new.append(np.zeros(len(out[-1]), bool))
            ends = _apply(self.inv, P[[a, b]])
            lo = np.maximum(np.floor(ends.min(0) - THREAD_MARGIN_MM / self.vox).astype(int), 0)
            hi = np.minimum(np.ceil(ends.max(0) + THREAD_MARGIN_MM / self.vox).astype(int) + 1, shape)
            sd = self.sd[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
            short = np.clip(clearance - sd, 0, clearance)
            cost = 1.0 + near * short ** 2 + THREAD_IN * np.clip(-sd, 0, None)
            ia, ib = (tuple(np.clip(np.rint(e).astype(int) - lo, 0, np.array(sd.shape) - 1)) for e in ends)
            mcp = MCP_Geometric(cost, sampling=tuple(self.vox))
            mcp.find_costs([ia], [ib])
            way = _apply(self.affine, np.array(mcp.traceback(ib), float) + lo)
            way = np.vstack([P[a], way[1:-1], P[b]])
            seg = np.linalg.norm(np.diff(way, axis=0), axis=1)
            t = np.concatenate([[0], np.cumsum(seg)])
            m = max(int(np.ceil(t[-1] / THREAD_STEP_MM)), 2)
            way = np.stack([np.interp(np.linspace(0, t[-1], m + 1), t, way[:, k]) for k in range(3)], 1)
            for _ in range(6):   # the grid's staircase smoothed out; the ends stay
                way[1:-1] = 0.5 * way[1:-1] + 0.25 * (way[:-2] + way[2:])
            replaced += float(np.linalg.norm(np.diff(P[a:b + 1], axis=0), axis=1).sum())
            if at > a:           # (this stretch starts at the pin the last one ended on)
                way = way[1:]
            out.append(way); new.append(np.ones(len(way), bool))
            at = b + 1
        out.append(P[at:]); new.append(np.zeros(len(out[-1]), bool))
        Q, new = np.vstack([x for x in out if len(x)]), np.concatenate(new)
        new[[0, -1]] = False
        for _ in range(2):       # across the joins (a pin moves a little with its neighbours)
            Q[new] = (0.5 * Q + 0.25 * (np.roll(Q, 1, axis=0) + np.roll(Q, -1, axis=0)))[new]
        return Q, round(replaced, 1)
