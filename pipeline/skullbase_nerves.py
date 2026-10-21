"""The cranial nerves of Skull base v3, routed through this CT's own foramina.

The fitted Z-Anatomy nerves of Skull base v2 give each nerve's course (where it leaves the brainstem, which way it runs),
but their crossing of the skull base is a few millimetres off the CT's real openings. Each nerve here is the least-cost
path, through the CT, from its fitted brainstem end to a point past the skull base on its fitted course:

  bone (the same mask the model's bone surface is drawn from) costs COST_BONE times more per step: so much that a path
  goes round it through any opening near its course, while a small canal that the 0.5 mm mask closes with a voxel of
  blurred bone (foramen rotundum on one side here) can still be passed; how much bone each path crosses is reported;
  air (the sinuses) and the lumens of the labelled vessels cost COST_AVOID times more;
  every step costs more the further it is from the fitted course: 1 + (distance / SIGMA_MM)^2.

So a nerve keeps to its fitted course in soft tissue and the cisterns, and passes the skull base where this CT has an
opening near it. The path is then smoothed, kept out of bone, and drawn as a tube of the fitted radius.
"""
from __future__ import annotations

from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

ROOT = Path(__file__).resolve().parent
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
CT_PATH = ROOT / "data" / "raw" / "topbrain" / "topcow_ct_011_0000.nii.gz"

SURFACE_LEVEL = 0.4       # as skullbase_ct.SURFACE_LEVEL: the bone the model draws
AIR_HU = -300.0
COST_AVOID = 25.0
COST_BONE = 60.0
SIGMA_MM = 4.0
CORRIDOR_MM = 14.0


class Grid:
    """The CT on v2's 0.5 mm bone grid, in the frame: bone, air and vessel lumens."""

    def __init__(self):
        c = np.load(CT_BUILD / "bone.npz")
        self.bone = c["b"].astype(np.float32) > SURFACE_LEVEL
        self.a = c["a"]
        self.inv = np.linalg.inv(self.a)
        self.vessel = c["lab"] > 0
        f = np.load(CT_BUILD / "frame.npz")
        self.R, self.fossa = f["R"], f["fossa"]
        img = nib.load(CT_PATH)
        hu = np.asanyarray(img.dataobj).astype(np.float32)
        ijk = np.indices(self.bone.shape).reshape(3, -1).T
        sc = nib.affines.apply_affine(self.a, ijk)
        q = nib.affines.apply_affine(np.linalg.inv(img.affine), sc).T
        self.air = (ndimage.map_coordinates(hu, q, order=1, mode="nearest") < AIR_HU).reshape(self.bone.shape)
        self.step = float(np.sqrt((self.a[:3, :3] ** 2).sum(0)).mean())

    def to_ijk(self, P):
        sc = np.atleast_2d(P) @ self.R.T + self.fossa
        return nib.affines.apply_affine(self.inv, sc)

    def to_frame(self, ijk):
        sc = nib.affines.apply_affine(self.a, np.atleast_2d(ijk).astype(float))
        return (sc - self.fossa) @ self.R

    def in_bone(self, P) -> np.ndarray:
        q = np.rint(self.to_ijk(P)).astype(int)
        ok = (q >= 0).all(1) & (q < np.array(self.bone.shape)).all(1)
        out = np.zeros(len(q), bool)
        out[ok] = self.bone[tuple(q[ok].T)]
        return out


def route(g: Grid, fitted: np.ndarray, start: np.ndarray, end: np.ndarray, corridor: float = CORRIDOR_MM,
          sigma: float = SIGMA_MM) -> np.ndarray | None:
    """The least-cost path from start to end (frame mm) near the fitted course `fitted` (frame mm, any number of points).
    Returns the path in frame mm (start to end), or None when bone closes every way within the corridor."""
    F = np.vstack([fitted, start, end])
    lo = np.floor(g.to_ijk(F).min(0) - corridor / g.step - 2).astype(int)
    hi = np.ceil(g.to_ijk(F).max(0) + corridor / g.step + 2).astype(int)
    lo, hi = np.maximum(lo, 0), np.minimum(hi, g.bone.shape)
    sub = tuple(slice(a, b) for a, b in zip(lo, hi))
    shape = tuple(hi - lo)
    # distance of every voxel of the box from the fitted course (densely resampled)
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(fitted, axis=0), axis=1))]
    u = np.arange(0, s[-1] + 1e-6, 0.25)
    dense = np.stack([np.interp(u, s, fitted[:, k]) for k in range(3)], 1)
    seed = np.zeros(shape, bool)
    qi = np.rint(g.to_ijk(dense) - lo).astype(int)
    ok = (qi >= 0).all(1) & (qi < np.array(shape)).all(1)
    seed[tuple(qi[ok].T)] = True
    dist = ndimage.distance_transform_edt(~seed) * g.step
    free = dist <= corridor
    cost = 1.0 + (dist / sigma) ** 2
    cost = np.where(g.air[sub] | g.vessel[sub], cost * COST_AVOID, cost)
    cost = np.where(g.bone[sub], cost * COST_BONE, cost)
    idx = -np.ones(shape, np.int64)
    nodes = np.argwhere(free)
    idx[tuple(nodes.T)] = np.arange(len(nodes))
    rows, cols, w = [], [], []
    for d in [(i, j, k) for i in (-1, 0, 1) for j in (-1, 0, 1) for k in (-1, 0, 1) if (i, j, k) > (0, 0, 0)]:
        nb = nodes + np.array(d)
        okn = (nb >= 0).all(1) & (nb < np.array(shape)).all(1)
        a_, b_ = np.nonzero(okn)[0], nb[okn]
        j_ = idx[tuple(b_.T)]
        keep = j_ >= 0
        a_, j_ = a_[keep], j_[keep]
        length = np.sqrt(sum(x * x for x in d)) * g.step
        c = 0.5 * (cost[tuple(nodes[a_].T)] + cost[tuple(nodes[j_].T)]) * length
        rows.append(a_); cols.append(j_); w.append(c)
    rows, cols, w = np.concatenate(rows), np.concatenate(cols), np.concatenate(w)
    G = coo_matrix((np.r_[w, w], (np.r_[rows, cols], np.r_[cols, rows])), shape=(len(nodes), len(nodes))).tocsr()

    soft_nodes = np.nonzero(~g.bone[sub][tuple(nodes.T)])[0]

    def nearest_node(p):
        """The open-tissue node nearest p (an end the fitted model puts inside bone moves out of it)."""
        q = g.to_ijk(p)[0] - lo
        return int(soft_nodes[np.argmin(np.linalg.norm(nodes[soft_nodes] - q, axis=1))])
    a0, b0 = nearest_node(start), nearest_node(end)
    d, pred = dijkstra(G, indices=a0, return_predecessors=True)
    if not np.isfinite(d[b0]):
        return None
    path = [b0]
    while path[-1] != a0:
        path.append(int(pred[path[-1]]))
    P = g.to_frame(nodes[path[::-1]] + lo)
    return smooth_out_of_bone(g, P)


def smooth_out_of_bone(g: Grid, P: np.ndarray, sigma_pts: float = 2.0) -> np.ndarray:
    """Resample every 0.3 mm and smooth; where smoothing cuts into bone the path did not cross, keep the unsmoothed
    point."""
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    u = np.arange(0, s[-1] + 1e-6, 0.3)
    R_ = np.stack([np.interp(u, s, P[:, k]) for k in range(3)], 1)
    S_ = ndimage.gaussian_filter1d(R_, sigma_pts, axis=0, mode="nearest")
    bad = g.in_bone(S_) & ~g.in_bone(R_)
    S_[bad] = R_[bad]
    S_[0], S_[-1] = R_[0], R_[-1]
    return S_


def bone_crossings(g: Grid, P: np.ndarray, near_mm: float = 2.0) -> list[tuple[int, int]]:
    """Stretches of a path that run within near_mm of bone on most sides (through a foramen or canal): index ranges."""
    q = np.rint(g.to_ijk(P)).astype(int)
    r = int(round(near_mm / g.step))
    enclosed = []
    for p in q:
        box = g.bone[max(p[0] - r, 0):p[0] + r + 1, max(p[1] - r, 0):p[1] + r + 1, max(p[2] - r, 0):p[2] + r + 1]
        enclosed.append(box.mean() > 0.45)
    enclosed = np.array(enclosed)
    lab, n = ndimage.label(enclosed)
    return [(int(np.nonzero(lab == k)[0][0]), int(np.nonzero(lab == k)[0][-1])) for k in range(1, n + 1)]


def bone_crossed_mm(g: Grid, P: np.ndarray) -> float:
    """How much of a path (resampled every 0.3 mm) runs inside the bone mask."""
    return float(g.in_bone(P).sum() * 0.3)
