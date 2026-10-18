"""Fit the Z-Anatomy brainstem into MNI space (ICBM 2009b), for the brainstem section.

The template's own images give the target: the brainstem is bordered by cerebrospinal fluid (the cisterns in front
and at the sides, the fourth ventricle and the aqueduct behind), which is bright on the T2 template. The tissue-fluid
boundary (an isosurface of the smoothed T2 template) is the surface the model's brainstem is fitted to; only pairs
whose normals agree are used (the model's outer surface towards fluid), so the cut faces of the model (towards the
diencephalon, the cerebellar peduncles and the midline faces of its halves) and the cerebellum's own surfaces are
ignored. The template is
symmetrised (averaged with its mirror image) and the model kept on the midline. The fit: a similarity transform
(a rotation about the left-right axis, a shift in the midline plane, one scale) by trimmed ICP, started from the
model's aqueduct placed at the Harvard AAN atlas's periaqueductal grey, then a smooth non-rigid deformation
(Gaussian-weighted displacements of control points, coarse to fine).

Used by brainstem_build.py; cached in pipeline/data/build/brainstem/fit.npz.
"""
from __future__ import annotations

import json
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage import measure

from skullbase_ct import Warp, gauss

ROOT = Path(__file__).resolve().parent
BUILD = ROOT / "data" / "build" / "brainstem"
EXPORT = BUILD / "export.json"
T2 = ROOT / "data" / "raw" / "t2.nii"
AAN = ROOT / "data" / "raw" / "aan" / "AAN_Brainstem_MNI152_1mm_v2p0.nii"
CACHE = BUILD / "fit.npz"

PARTS = ["Midbrain.l", "Midbrain.r", "Pons.l", "Pons.r", "Medulla oblongata.l", "Medulla oblongata.r"]
# the fluid spaces inside: they hold the fit along the brainstem's long axis, which the outer surface (nearly a tube)
# leaves loose; their walls face the fluid from outside, so their normals are turned inwards
VENTRICLES = ["Aqueduct of midbrain", "Fourth ventricle"]
CROP = (np.array([-32.0, -60.0, -70.0]), np.array([32.0, 12.0, 8.0]))   # MNI mm box around the brainstem
SMOOTH_MM = 0.5        # Gaussian smoothing of the T2 template before its isosurface
FLUID_LEVEL = 78.0     # T2 template: brainstem tissue about 45-65, cisternal fluid about 95-100 (sampled along the midline)
NORMAL_COS = 0.5       # a pair counts only when the normals agree within 60 degrees
SIGMAS = (12.0, 8.0, 5.0, 3.5)
PAG_LABEL = 7203


def vertex_normals(v: np.ndarray, t: np.ndarray) -> np.ndarray:
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    n = np.zeros_like(v)
    for k in range(3):
        np.add.at(n, t[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)


def source_points(ex: dict) -> tuple[np.ndarray, np.ndarray]:
    """The model's brainstem surface (its six halves, without the midline faces where the halves meet) and the walls
    of its aqueduct and fourth ventricle, with normals pointing towards the fluid."""
    vs, ns = [], []
    for p in PARTS:
        v, t = np.array(ex["meshes"][p]["verts"], float), np.array(ex["meshes"][p]["tris"])
        n = vertex_normals(v, t)
        keep = ~((np.abs(v[:, 0]) < 0.6) & (np.abs(n[:, 0]) > 0.8))
        vs.append(v[keep])
        ns.append(n[keep])
    for p in VENTRICLES:
        v, t = np.array(ex["meshes"][p]["verts"], float), np.array(ex["meshes"][p]["tris"])
        vs.append(v)
        ns.append(-vertex_normals(v, t))
    return np.vstack(vs), np.vstack(ns)


def fluid_boundary() -> tuple[np.ndarray, np.ndarray]:
    """Points and unit normals (towards fluid) of the T2 template's tissue-fluid boundary around the brainstem. The
    template is averaged with its mirror image (x -> -x) first: the model is symmetric, and the asymmetric template's
    cisterns (wider on one side) otherwise pull the fit sideways."""
    img = nib.load(T2)
    a = img.affine
    full = np.asarray(img.dataobj, np.float32)
    lo, hi = CROP
    i0 = np.floor(nib.affines.apply_affine(np.linalg.inv(a), lo)).astype(int)
    i1 = np.ceil(nib.affines.apply_affine(np.linalg.inv(a), hi)).astype(int)
    vol = full[i0[0]:i1[0], i0[1]:i1[1], i0[2]:i1[2]]
    ac = a.copy()
    ac[:3, 3] = nib.affines.apply_affine(a, i0)
    grid = np.stack(np.meshgrid(*[np.arange(n) for n in vol.shape], indexing="ij"), -1).reshape(-1, 3)
    world = nib.affines.apply_affine(ac, grid)
    world[:, 0] *= -1
    mirrored = ndimage.map_coordinates(full, nib.affines.apply_affine(np.linalg.inv(a), world).T, order=1).reshape(vol.shape)
    vol = (vol + mirrored) / 2
    zoom = float(np.sqrt((a[:3, :3] ** 2).sum(0)).mean())
    sm = ndimage.gaussian_filter(vol, SMOOTH_MM / zoom)
    v, _, n, _ = measure.marching_cubes(sm, FLUID_LEVEL, gradient_direction="ascent")
    n = n @ np.linalg.inv(ac[:3, :3])   # gradient directions into world space (isotropic grid: a scaling)
    return nib.affines.apply_affine(ac, v), n / np.linalg.norm(n, axis=1, keepdims=True)


class Matcher:
    def __init__(self, tp: np.ndarray, tn: np.ndarray):
        self.tp, self.tn, self.tree = tp, tn, cKDTree(tp)

    def __call__(self, p: np.ndarray, nrm: np.ndarray, max_d: float, k: int = 12):
        """For each point: the nearest target point within max_d whose normal agrees with the point's normal."""
        d, j = self.tree.query(p, k=k, distance_upper_bound=max_d)
        ok = np.isfinite(d)
        jj = np.where(ok, j, 0)
        good = ok & (np.einsum("ikj,ij->ik", self.tn[jj], nrm) > NORMAL_COS)
        first = np.argmax(good, axis=1)
        r = np.arange(len(p))
        return good[r, first], jj[r, first], d[r, first]


def midline_similarity(src: np.ndarray, dst: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    """s, R, t minimising |s R src + t - dst| with R a rotation about the left-right axis only (pitch) and no
    left-right shift: the model and the (symmetrised) target are both symmetric about x = 0."""
    a, b = src[:, 1:], dst[:, 1:]
    ma, mb = a.mean(0), b.mean(0)
    H = (b - mb).T @ (a - ma)
    th = np.arctan2(H[1, 0] - H[0, 1], H[0, 0] + H[1, 1])
    c, sn = np.cos(th), np.sin(th)
    R = np.array([[1.0, 0, 0], [0, c, -sn], [0, sn, c]])
    rp = src @ R.T
    n = len(src)
    A = np.zeros((3 * n, 3))
    A[0::3, 0], A[1::3, 0], A[2::3, 0] = rp[:, 0], rp[:, 1], rp[:, 2]
    A[1::3, 1] = 1.0
    A[2::3, 2] = 1.0
    sol = np.linalg.lstsq(A, dst.reshape(-1), rcond=None)[0]
    return float(sol[0]), R, np.array([0.0, sol[1], sol[2]])


def pag_centroid() -> np.ndarray:
    img = nib.load(AAN)
    d = np.asarray(img.dataobj)
    return nib.affines.apply_affine(img.affine, np.argwhere(d == PAG_LABEL).mean(0))


def fit(ex: dict) -> tuple[float, np.ndarray, np.ndarray, Warp, dict]:
    sv, sn = source_points(ex)
    tp, tn = fluid_boundary()
    match = Matcher(tp, tn)
    aq = np.array(ex["meshes"]["Aqueduct of midbrain"]["verts"]).mean(0)
    t0 = pag_centroid() - aq
    s, R, t = 1.0, np.eye(3), np.array([0.0, t0[1], t0[2]])
    for it in range(60):
        cur, cn = s * sv @ R.T + t, sn @ R.T
        has, j, d = match(cur, cn, 8.0 if it < 20 else 5.0 if it < 40 else 3.0)
        sel = has & (d <= np.percentile(d[has], 85))
        s, R, t = midline_similarity(sv[sel], tp[j[sel]])
    lin, ln = s * sv @ R.T + t, sn @ R.T
    has0, _, d0 = match(lin, ln, 4.0)
    warp, pts = Warp(), lin.copy()
    flip = np.array([-1.0, 1.0, 1.0])
    for sigma in SIGMAS:
        # control points on the right half only, mirrored to the left with mirrored moves: the warp stays symmetric
        # (picking control points per grid cell is not, and its small bias adds up over the iterations)
        right = pts[:, 0] >= 0
        cell = np.floor(pts[right] / (sigma / 3)).astype(np.int64)
        _, first = np.unique(cell, axis=0, return_index=True)
        ci = np.nonzero(right)[0][np.sort(first)]
        half, hn = pts[ci].copy(), ln[ci]
        for _ in range(6):
            has, j, _d = match(half, hn, 4.0)
            ok = has.astype(float)
            disp = 0.5 * (tp[j] - half) * ok[:, None]
            ctrl, dsp, okk = np.vstack([half, half * flip]), np.vstack([disp, disp * flip]), np.r_[ok, ok]
            sm, ws = gauss(ctrl, ctrl, dsp, sigma, okk)
            step = sm / np.maximum(ws, 1e-9)[:, None]
            warp.levels.append((ctrl.copy(), step, sigma))
            half = half + step[: len(half)]
        pts = warp(lin)
    has1, _, d1 = match(pts, ln, 4.0)
    rot = float(np.degrees(np.arccos(np.clip((np.trace(R) - 1) / 2, -1, 1))))
    rep = {"scale": round(s, 3), "rotationDeg": round(rot, 1),
           "similarityMatchedShare": round(float(has0.mean()), 2), "similarityMedianMm": round(float(np.median(d0[has0])), 2),
           "warpedMatchedShare": round(float(has1.mean()), 2), "warpedMedianMm": round(float(np.median(d1[has1])), 2),
           "warpedP90Mm": round(float(np.percentile(d1[has1], 90)), 2)}
    return s, R, t, warp, rep


def load_fit(ex: dict) -> tuple[float, np.ndarray, np.ndarray, Warp, dict]:
    """The fit, from the cache when it is newer than its inputs and this file."""
    deps = [EXPORT, T2, AAN, Path(__file__)]
    if CACHE.exists() and CACHE.stat().st_mtime > max(p.stat().st_mtime for p in deps):
        c = np.load(CACHE, allow_pickle=False)
        w = Warp()
        for k in range(int(c["n"])):
            w.levels.append((c[f"c{k}"], c[f"d{k}"], float(c[f"s{k}"])))
        return float(c["s"]), c["R"], c["t"], w, json.loads(str(c["rep"]))
    s, R, t, w, rep = fit(ex)
    arrs = {"s": s, "R": R, "t": t, "n": len(w.levels), "rep": json.dumps(rep)}
    for k, (cc, dd, sg) in enumerate(w.levels):
        arrs[f"c{k}"], arrs[f"d{k}"], arrs[f"s{k}"] = cc, dd, sg
    np.savez_compressed(CACHE, **arrs)
    return s, R, t, w, rep


class Fitted:
    """Maps model coordinates into MNI space: the similarity, then the warp."""

    def __init__(self, ex: dict):
        self.s, self.R, self.t, self.warp, self.report = load_fit(ex)

    def __call__(self, p) -> np.ndarray:
        p = np.atleast_2d(np.asarray(p, float))
        return self.warp(self.s * p @ self.R.T + self.t)
