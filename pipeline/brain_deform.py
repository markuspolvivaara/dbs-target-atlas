"""Deformation tools for fitting a template brain into a patient and for opening it (pipeline/skullbase_brain.py).

A backward warp phi: patient frame -> template space is an affine map plus a sum of normalised Gaussians on control grids
(RBF). It is fitted by L-BFGS on terms that sample template-space distance fields at phi(patient points), so every
patient feature stays fixed and only phi moves; GridPhi then inverts it (Newton on a sampled grid) to carry template
surfaces into the patient.

ARAP is as-rigid-as-possible surface deformation (Sorkine O, Alexa M. As-rigid-as-possible surface modeling. Proc.
Eurographics Symposium on Geometry Processing 2007: 109-116): cotangent weights, a best rotation per vertex, a sparse
solve. Extra "virtual" edges between facing banks of a sulcus make the two banks move together, as the tissue between
them would.
"""
from __future__ import annotations

import numpy as np
import scipy.sparse as sp
from scipy import ndimage
from scipy.sparse.linalg import factorized
from scipy.spatial import cKDTree


# ---------------------------------------------------------------- the warp
class RBF:
    """Gaussians of width sigma on a grid of spacing h over [lo, hi] (one control point beyond each side), cut at
    trunc * sigma, normalised so that a constant coefficient gives (nearly) that displacement."""

    def __init__(self, lo, hi, h: float, sigma: float, trunc: float = 2.5):
        self.h, self.sigma, self.trunc = h, sigma, trunc
        ax = [np.arange(lo[k] - h, hi[k] + h + 1e-6, h) for k in range(3)]
        self.C = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
        self.tree = cKDTree(self.C)
        self.norm = (sigma * np.sqrt(2 * np.pi) / h) ** 3

    def B(self, P: np.ndarray) -> sp.csr_matrix:
        nb = self.tree.query_ball_point(P, self.trunc * self.sigma)
        rows = np.repeat(np.arange(len(P)), [len(n) for n in nb])
        cols = np.concatenate([np.asarray(n, int) for n in nb]) if len(P) else np.zeros(0, int)
        w = np.exp(-((P[rows] - self.C[cols]) ** 2).sum(1) / (2 * self.sigma ** 2)) / self.norm
        return sp.csr_matrix((w, (rows, cols)), shape=(len(P), len(self.C)))

    def Bgrad(self, P: np.ndarray) -> list[sp.csr_matrix]:
        """d/dx_d of each Gaussian at P, d = 0, 1, 2."""
        B = self.B(P).tocoo()
        d = P[B.row] - self.C[B.col]
        return [sp.csr_matrix((-d[:, k] / self.sigma ** 2 * B.data, (B.row, B.col)), shape=B.shape) for k in range(3)]


def phi(A, b, rbfs, W, P: np.ndarray, chunk: int = 40000) -> np.ndarray:
    Q = P @ A.T + b
    for s in range(0, len(P), chunk):
        for r, w in zip(rbfs, W):
            Q[s:s + chunk] += r.B(P[s:s + chunk]) @ w
    return Q


def jacobian(A, b, rbfs, W, P: np.ndarray, h: float = 0.25) -> np.ndarray:
    J = np.zeros((len(P), 3, 3))
    for d in range(3):
        e = np.zeros(3)
        e[d] = h
        J[:, :, d] = (phi(A, b, rbfs, W, P + e) - phi(A, b, rbfs, W, P - e)) / (2 * h)
    return J


def cofactor(J: np.ndarray) -> np.ndarray:
    """d det(J) / dJ for a stack of 3x3 matrices."""
    C = np.empty_like(J)
    C[:, 0, 0] = J[:, 1, 1] * J[:, 2, 2] - J[:, 1, 2] * J[:, 2, 1]
    C[:, 0, 1] = J[:, 1, 2] * J[:, 2, 0] - J[:, 1, 0] * J[:, 2, 2]
    C[:, 0, 2] = J[:, 1, 0] * J[:, 2, 1] - J[:, 1, 1] * J[:, 2, 0]
    C[:, 1, 0] = J[:, 0, 2] * J[:, 2, 1] - J[:, 0, 1] * J[:, 2, 2]
    C[:, 1, 1] = J[:, 0, 0] * J[:, 2, 2] - J[:, 0, 2] * J[:, 2, 0]
    C[:, 1, 2] = J[:, 0, 1] * J[:, 2, 0] - J[:, 0, 0] * J[:, 2, 1]
    C[:, 2, 0] = J[:, 0, 1] * J[:, 1, 2] - J[:, 0, 2] * J[:, 1, 1]
    C[:, 2, 1] = J[:, 0, 2] * J[:, 1, 0] - J[:, 0, 0] * J[:, 1, 2]
    C[:, 2, 2] = J[:, 0, 0] * J[:, 1, 1] - J[:, 0, 1] * J[:, 1, 0]
    return C


class Field:
    """Trilinear sampling of a grid (origin lo, spacing step): value and central-difference gradient."""

    def __init__(self, a: np.ndarray, lo, step: float, outside: float):
        self.a, self.lo, self.step, self.out = a, np.asarray(lo, float), float(step), outside

    def __call__(self, Q: np.ndarray, grad: bool = True):
        g = ((Q - self.lo) / self.step).T
        v = ndimage.map_coordinates(self.a, g, order=1, mode="constant", cval=self.out)
        if not grad:
            return v
        G = np.zeros((len(Q), 3))
        for k in range(3):
            e = np.zeros((3, 1))
            e[k] = 0.5
            G[:, k] = (ndimage.map_coordinates(self.a, g + e, order=1, mode="constant", cval=self.out)
                       - ndimage.map_coordinates(self.a, g - e, order=1, mode="constant", cval=self.out)) / self.step
        return v, G


class Near:
    """Unsigned distance to a point set, with its gradient."""

    def __init__(self, P: np.ndarray):
        self.t, self.P = cKDTree(P), P

    def __call__(self, Q: np.ndarray):
        d, j = self.t.query(Q)
        return d, (Q - self.P[j]) / np.maximum(d, 1e-6)[:, None]


def huber(x: np.ndarray, d: float):
    a = np.abs(x)
    return np.where(a <= d, 0.5 * x * x, d * (a - 0.5 * d)), np.where(a <= d, x, d * np.sign(x))


class GridPhi:
    """phi sampled on a regular grid of the patient frame: trilinear value and Jacobian, and Newton inversion."""

    def __init__(self, A, b, rbfs, W, lo, hi, step: float = 1.0, chunk: int = 200000):
        self.lo, self.step, self.A, self.b = np.asarray(lo, float), step, A, b
        ax = [np.arange(lo[k], hi[k] + 1e-6, step) for k in range(3)]
        self.shape = tuple(len(a) for a in ax)
        G = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
        Q = np.empty_like(G)
        for s in range(0, len(G), chunk):
            Q[s:s + chunk] = phi(A, b, rbfs, W, G[s:s + chunk])
        self.Q = [Q[:, k].reshape(self.shape) for k in range(3)]

    def __call__(self, X: np.ndarray, jac: bool = False):
        g = ((X - self.lo) / self.step).T
        v = np.stack([ndimage.map_coordinates(q, g, order=1, mode="nearest") for q in self.Q], 1)
        if not jac:
            return v
        J = np.zeros((len(X), 3, 3))
        for d in range(3):
            e = np.zeros((3, 1))
            e[d] = 0.5
            for i in range(3):
                J[:, i, d] = (ndimage.map_coordinates(self.Q[i], g + e, order=1, mode="nearest")
                              - ndimage.map_coordinates(self.Q[i], g - e, order=1, mode="nearest")) / self.step
        return v, J

    def invert(self, V: np.ndarray, iters: int = 12):
        """Patient points X with phi(X) = V (template points), and the residual |phi(X) - V| per point."""
        X = (V - self.b) @ np.linalg.inv(self.A).T
        for _ in range(iters):
            q, J = self(X, jac=True)
            X = X - np.linalg.solve(J, (q - V)[:, :, None])[:, :, 0]
        return X, np.linalg.norm(self(X) - V, axis=1)


# ---------------------------------------------------------------- ARAP
def adjacency(F: np.ndarray, n: int) -> sp.csr_matrix:
    e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    return ((A + A.T) > 0).astype(float)


def cot_weights(V: np.ndarray, F: np.ndarray) -> sp.csr_matrix:
    I, J, w = [], [], []
    for k in range(3):
        a, b, c = F[:, k], F[:, (k + 1) % 3], F[:, (k + 2) % 3]
        u, v = V[b] - V[a], V[c] - V[a]
        I.append(b)
        J.append(c)
        w.append(0.5 * (u * v).sum(1) / np.maximum(np.linalg.norm(np.cross(u, v), axis=1), 1e-12))  # the angle at a
    I, J, w = np.concatenate(I), np.concatenate(J), np.concatenate(w)
    n = len(V)
    Wm = sp.coo_matrix((np.r_[w, w], (np.r_[I, J], np.r_[J, I])), shape=(n, n)).tocsr()
    Wm.data = np.clip(Wm.data, 1e-3, None)          # obtuse triangles: keep the system positive definite
    return Wm


def facing_pairs(V: np.ndarray, F: np.ndarray, normals: np.ndarray, reach: float, exclude=None) -> np.ndarray:
    """Vertex pairs on facing banks of a sulcus: closer than reach, not neighbours on the surface, normals opposed.
    exclude(i, j) -> bool mask drops pairs (banks that are meant to part)."""
    pairs = cKDTree(V).query_pairs(reach, output_type="ndarray")
    if not len(pairs):
        return pairs
    A = adjacency(F, len(V))
    ring2 = (A @ A + A).tocsr()
    near = np.asarray(ring2[pairs[:, 0], pairs[:, 1]]).ravel() > 0
    opposed = (normals[pairs[:, 0]] * normals[pairs[:, 1]]).sum(1) < -0.3
    keep = ~near & opposed
    if exclude is not None:
        keep &= ~exclude(pairs[:, 0], pairs[:, 1])
    return pairs[keep]


def _rotations(S: np.ndarray) -> np.ndarray:
    U, _, Vt = np.linalg.svd(S)
    R = np.transpose(Vt, (0, 2, 1)) @ np.transpose(U, (0, 2, 1))
    bad = np.linalg.det(R) < 0
    if bad.any():
        U2 = U[bad].copy()
        U2[:, :, 2] *= -1
        R[bad] = np.transpose(Vt[bad], (0, 2, 1)) @ np.transpose(U2, (0, 2, 1))
    return R


class ARAP:
    """ARAP on a surface (rest positions V), with optional virtual edges (pairs, weight per pair). `fixed` vertices take
    given positions at every solve."""

    def __init__(self, V: np.ndarray, F: np.ndarray, fixed: np.ndarray, pairs: np.ndarray | None = None, pair_w: float = 0.0):
        self.V, self.n = V, len(V)
        W = cot_weights(V, F)
        if pairs is not None and len(pairs):
            Wv = sp.coo_matrix((np.full(2 * len(pairs), pair_w), (np.r_[pairs[:, 0], pairs[:, 1]], np.r_[pairs[:, 1], pairs[:, 0]])),
                               shape=W.shape).tocsr()
            W = (W + Wv).tocsr()
        W = W.tocoo()
        self.i, self.j, self.w = W.row, W.col, W.data
        L = (sp.diags(np.asarray(W.sum(1)).ravel()) - W.tocsr()).tocsr()
        self.free, self.con = np.nonzero(~fixed)[0], np.nonzero(fixed)[0]
        self.solve = factorized(L[self.free][:, self.free].tocsc())
        self.Lfc = L[self.free][:, self.con]
        self.E = V[self.i] - V[self.j]

    def run(self, Pc: np.ndarray, X0: np.ndarray | None = None, iters: int = 15) -> np.ndarray:
        X = self.V.copy() if X0 is None else X0.copy()
        X[self.con] = Pc
        for _ in range(iters):
            Ed = X[self.i] - X[self.j]
            S = np.zeros((self.n, 3, 3))
            np.add.at(S, self.i, self.w[:, None, None] * self.E[:, :, None] * Ed[:, None, :])
            R = _rotations(S)
            rhs = 0.5 * self.w[:, None] * np.einsum("nab,nb->na", R[self.i] + R[self.j], self.E)
            b = np.zeros((self.n, 3))
            np.add.at(b, self.i, rhs)
            bf = b[self.free] - self.Lfc @ X[self.con]
            X[self.free] = np.stack([self.solve(bf[:, k]) for k in range(3)], 1)
        return X
