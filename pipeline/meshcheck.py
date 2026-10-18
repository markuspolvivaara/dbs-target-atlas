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


def signed_volume(V, F):
    """Volume enclosed by a triangle mesh, positive when its triangles are wound outward (counter-clockwise seen from
    outside); taken about the centroid, so it means something for closed meshes only."""
    t = V[F] - V.mean(0)
    return float(np.einsum("ij,ij->i", t[:, 0], np.cross(t[:, 1], t[:, 2])).sum() / 6)


def is_closed(F, max_open=0.001):
    """Every edge shared by two triangles (up to a small share of open edges, e.g. from decimation)."""
    e = np.sort(np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]]), 1)
    _, counts = np.unique(e, axis=0, return_counts=True)
    return (counts == 1).mean() <= max_open


def orient_outward(V, F):
    """The triangles wound outward: a closed mesh enclosing a negative volume is turned inside in. The viewer draws
    only the side a triangle's winding faces, so an inside-out mesh shows its far wall instead of its near one."""
    return F[:, ::-1].copy() if is_closed(F) and signed_volume(V, F) < 0 else F
