"""Self-intersection check for triangle meshes (used on the decimated cortical surfaces).

An edge that passes through a triangle it does not share a vertex with marks a crossing. Candidate triangles for each
edge are the K triangles whose centroids lie nearest its midpoint, which suits the near-uniform cortical meshes.
"""
import numpy as np
from scipy.spatial import cKDTree


def self_intersections(V, F, K=48):
    E = np.unique(np.sort(np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), 1), axis=0)
    C = V[F].mean(1)
    R = np.linalg.norm(V[F] - C[:, None], axis=2).max(1)
    em = (V[E[:, 0]] + V[E[:, 1]]) / 2
    el = np.linalg.norm(V[E[:, 1]] - V[E[:, 0]], axis=1)
    tree = cKDTree(C)
    rad = R.max() + el.max() / 2
    out = []
    for k0 in range(0, len(E), 20000):
        ks = np.arange(k0, min(k0 + 20000, len(E)))
        _, nn = tree.query(em[ks], k=K)
        ei = np.repeat(ks, K); fi = nn.ravel()
        out.append(_test(V, F, E, ei, fi))
    h = np.unique(np.concatenate(out))
    return h, C  # crossed triangle indices, triangle centroids


def _test(V, F, E, ei, fi):
    # drop triangles sharing a vertex with the edge
    share = (F[fi] == E[ei, 0:1]).any(1) | (F[fi] == E[ei, 1:2]).any(1)
    ei, fi = ei[~share], fi[~share]
    o = V[E[ei, 0]]; d = V[E[ei, 1]] - o
    a, b, c = V[F[fi, 0]], V[F[fi, 1]], V[F[fi, 2]]
    e1, e2 = b - a, c - a
    p = np.cross(d, e2); det = (e1 * p).sum(1)
    ok = np.abs(det) > 1e-12
    inv = np.where(ok, 1 / np.where(ok, det, 1), 0)
    t = o - a
    u = (t * p).sum(1) * inv
    q = np.cross(t, e1)
    v = (d * q).sum(1) * inv
    s = (e2 * q).sum(1) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (s >= 0) & (s <= 1)
    return np.unique(fi[hit])
