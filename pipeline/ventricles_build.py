"""Ventricles section: this CT's lateral ventricles and a virtual frontal ventriculostomy from Kocher's point, along the
freehand trajectories Chen 2025 compared. In Skull base v2's frame (millimetres from the fitted hypophysial fossa), on
its bone.

  pipeline/.venv/bin/python -I -W ignore pipeline/ventricles_build.py          (after skullbase_ct.py, skullbase_v3.py)
  node pipeline/compress.mjs ventricles
  pipeline/.venv/bin/python -I -W ignore pipeline/ventricles_build.py finalize

The CT is Skull base v2's (TopBrain 2025 case 011, a CT angiogram). What comes from where:
  - The ventricles as this CT shows them. In its brain window the ventricular fluid is darker than the brain around
    it (about 5 to 20 HU where the ventricles are a few millimetres wide, once smoothed by SMOOTH_MM, against about
    44 HU for the deep white matter). The fluid below CSF_HU, at least DEPTH_MM inside the cranial cavity (the
    subarachnoid spaces against the inner table left out) and away from the labelled vessels, is taken; the lateral
    ventricles are the largest such body above LATERAL_Z_MIN, the third ventricle the body of it on the midline below
    them, the fourth ventricle the fluid near the model's (placed by the similarity below). The threshold sets the size
    of narrow ventricles, so this is approximate to about a millimetre; and it misses what is narrower than the CT
    resolves (the temporal horns, the foramina of Monro, the third ventricle's floor, the aqueduct, most of the fourth
    ventricle) and the atria's enhancing choroid plexus.
  - The ventricles as drawn: the Z-Anatomy model's ventricles (one adult, BodyParts3D; exported by ventricles_export.py)
    fitted onto the CT's: scaled as Skull base v2 scaled the model, a similarity (ICP, CT onto the model's lateral and
    third ventricles), then a smooth deformation in which each point of the CT's surface pulls the nearest point of the model's
    within FIT_PAIR_MM and each point of the model's is pulled onto the CT's within FIT_BACK_MM (shorter: where the CT
    shows no fluid the model stays), Gaussian-averaged at FIT_SIGMAS_MM. The drawn surface is the union of the CT's
    ventricles, the fitted model and the foramina, its signed distance smoothed by SOFT_MM and drawn DRAW_OUT_MM outside
    it (a softer, slightly larger surface, within the CT's uncertainty), split by the part each point is nearest.
  - The aqueduct: the fitted model's course, drawn as a tube of the diameters Xiao 2025 measured (AQUEDUCT_MM), run
    on into the third and fourth ventricles, so the drawn ventricles are one cavity.
  - The foramina of Monro, drawn by rule: a tube of the mean cross-section Jean 2019 measured (MONRO_AREA_MM2, as a
    circle) between the points where the fitted lateral ventricle comes closest to the fitted third ventricle, which is
    at the junction of the third ventricle's roof and anterior wall, where Azab 2014 places the foramina.
  - The coronal suture, on the outer table: between the CT's frontal and parietal bone (named after the Z-Anatomy model
    fitted onto it, Skull base v2; the two names overlap there by about a centimetre, so the suture is taken midway).
  - Kocher's point: KOCHER_ANTERIOR_MM in front of the suture, along the outer table, and KOCHER lateral to the midline
    (Chen 2025: 25 mm; Park 2020: 30 mm).
  - The external acoustic meatus: the ear canal is the shortest way through air from the tympanic membrane (OpenEar's,
    registered into each temporal bone in Skull base v3) to outside the head; the meatus is where it leaves the bone.
  - The medial canthi: this CT stops at the forehead, so they are placed CANTHUS_MM to each side of the midline (half
    the mean intercanthal distance of Chen 2025's 206 CTs). Only their distance from the midline is used: Chen
    projects them onto the line between the two external acoustic meatus.
  - The trajectories (Chen 2025): from Kocher's point towards the point on the line between the external acoustic
    meatus level with the ipsilateral medial canthus (IMC), the midpoint between the meatus (MAM), the contralateral
    medial canthus (CMC), or perpendicular to the skull (P). Each is followed MAX_DEPTH_MM from the outer table (Chen:
    with no fluid by 65 mm the catheter is withdrawn and re-aimed) to the first lateral ventricle (as drawn) it meets:
    the depth from the outer table, which side, and its course through the ventricle.

Writes pipeline/data/build/ventricles/*.glb (compress.mjs -> public/assets/ventricles/) and
src/data/generated/ve-{manifest,landmarks,trajectories}.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage.graph import MCP_Geometric

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_ct as K  # noqa: E402
import skullbase_v3_approach as A  # noqa: E402
import ventricles_etv as E  # noqa: E402
from build import isosurface  # noqa: E402
from skullbase_brain import fill, sdf  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402

REPO = ROOT.parent
KIND = "ventricles"
PREFIX = "ve"
BUILD = ROOT / "data" / "build" / KIND
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
V3_BUILD = ROOT / "data" / "build" / "skullbase-v3"
GEN = REPO / "src" / "data" / "generated"
PUBLIC = REPO / "public" / "assets"
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())
CITES = json.loads((ROOT / "sources" / "citations.json").read_text())

GRID_LO, GRID_HI, STEP = np.array([-60.0, -95.0, -45.0]), np.array([60.0, 60.0, 85.0]), 0.5   # the brain (frame mm)
LATERAL_Z_MIN = -15.0      # the lateral and third ventricles looked for above this height (the posterior fossa's cisterns below)
SMOOTH_MM = 1.0
CSF_HU = 27.0              # between the ventricular fluid (about 5-20 HU, smoothed) and the deep white matter (about 44 HU)
DEPTH_MM = 10.0            # at least this far inside the cranial cavity
VESSEL_GAP_MM = 1.0        # and this far from the labelled vessels (the choroid plexus and veins enhance)
ICV_LABEL = 37             # TopBrain's internal cerebral veins: the drawn ventricles are kept ICV_GAP_MM clear of them
# the arteries at the skull base, which stay where they are when the ventricles enlarge (the hydrocephalus shape is
# draped over them): TopBrain's basilar, P1-P2, carotids, posterior communicating, A1-A2 and anterior communicating,
# vertebral, superior, anterior inferior and posterior inferior cerebellar arteries (not the pericallosal arteries or
# the deep veins, which ride on the brain that moves)
FIXED_VESSELS = (1, 2, 3, 4, 6, 8, 9, 10, 11, 12, 23, 24, 25, 26, 27, 28, 29, 30)
ICV_GAP_MM = 0.5
KOCHER = {"chen": 25.0, "park": 30.0}    # Kocher's point: this far lateral to the midline (Chen 2025; Park 2020) ...
KOCHER_ANTERIOR_MM = 10.0  # ... and this far in front of the coronal suture (both)
AP_OFFSETS = [-10.0, 0.0, 10.0]          # the entry moved this far forward (+) or back from Kocher's point (teaching)
CANTHUS_MM = 32.7 / 2      # half Chen 2025's mean intercanthal distance (206 CTs): this CT has no face
TARGETS = ["IMC", "MAM", "CMC", "P"]
THIRD_ML = (0.1, 3.0)      # the third ventricle's body of fluid: this large ...
THIRD_HALF_MM = 5.0        # ... and within this of the midline
FRONTAL_MM = 25.0          # the frontal horns: the ventricles' front this far
EXPORT = BUILD / "ventricles_export.json"   # Z-Anatomy's lateral and third ventricles (ventricles_export.py)
MODEL_NAMES = {"Lateral ventricle.r": "R", "Lateral ventricle.l": "L", "Third ventricle": "third", "Aqueduct of midbrain": "aqueduct",
               "Fourth ventricle": "fourth"}
SHOWN = ("R", "L", "third")   # the parts the CT shows above the posterior fossa: the similarity is fitted to these
FOURTH_NEAR_MM = 6.0       # the CT's fourth ventricle: its fluid within this of the model's (placed by the similarity) ...
FOURTH_MIN_ML = 0.05       # ... in bodies at least this large
FIT_SIGMAS_MM = (10.0, 6.0, 4.0)   # the model's fit onto the CT's ventricles: Gaussian scales, coarse to fine ...
FIT_STEPS = 8                      # ... this many steps each, half of the mean pull applied in each
FIT_PAIR_MM = 5.0          # a point of the CT's surface pulls the nearest point of the model's within this ...
FIT_BACK_MM = 2.5          # ... and a point of the model's is pulled onto the CT's within this
FIT_SAMPLES = 6000         # points sampled on each model mesh; pulls averaged over at most FIT_RESIDUALS
FIT_RESIDUALS = 6000
TEMPORAL_Z_MM = 14.0       # the fitted lateral ventricle below this height (frame mm): the temporal horn (for the check)
MONRO_AREA_MM2 = 5.23      # the foramen of Monro's mean opening, 30 adults without hydrocephalus (Jean 2019)
MONRO_INTO_MM = 1.0        # the tube runs on this far into the lateral and the third ventricle
AQUEDUCT_MM = (1.98, 1.27, 2.49)   # the aqueduct's diameter at its opening, narrowest and at its outlet (Xiao 2025: 30 healthy adults)
AQUEDUCT_BINS = 12         # its course: the fitted model's aqueduct in this many slices along it
AQUEDUCT_INTO_MM = 1.0     # ... run on this far into the third and the fourth ventricle
SOFT_MM = 0.75             # the drawn surface: the union's signed distance smoothed by this (Gaussian sigma) ...
DRAW_OUT_MM = 0.5          # ... and drawn this far outside it
DRAWN_FACES = 140000
DRAWN_SMOOTH = 10          # ... smoothed again after decimation (Taubin rounds)
MIDLINE = ("third", "aqueduct", "fourth")   # drawn in left and right halves
SEPTUM_HALF_MM = 0.5       # the drawn lateral ventricles kept apart within this of the midline (the septum pellucidum) ...
SEPTUM_SPARE_MM = 2.0      # ... except this near the third ventricle and the foramina
MAX_DEPTH_MM = 65.0        # each trajectory followed this far: with no fluid by 65 mm the catheter is withdrawn and re-aimed (Chen 2025)
RAY_STEP_MM = 0.25
BONE_LEVEL = 0.4           # the bone the model draws (skullbase_nerves.SURFACE_LEVEL)


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


def unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# ---------------------------------------------------------------- the CT on a grid of the frame
class Grid:
    """The CT resampled onto a STEP grid of the frame over the cerebrum: smoothed HU, depth inside the cranial cavity,
    the labelled vessels."""

    def __init__(self):
        ct, aff = K.load_ct()
        f = np.load(CT_BUILD / "frame.npz")
        self.R, self.fossa = f["R"], f["fossa"]
        self.ax = [np.arange(GRID_LO[k], GRID_HI[k] + 1e-6, STEP) for k in range(3)]
        self.shape = tuple(len(a) for a in self.ax)
        G = np.stack(np.meshgrid(*self.ax, indexing="ij"), -1).reshape(-1, 3)
        q = nib.affines.apply_affine(np.linalg.inv(aff), G @ self.R.T + self.fossa).T
        self.hu = ndimage.gaussian_filter(ndimage.map_coordinates(ct, q, order=1, cval=-1000).reshape(self.shape), SMOOTH_MM / STEP)
        lab = np.asanyarray(nib.load(K.LABELS).dataobj)
        self.vessel = ndimage.map_coordinates((lab > 0).astype(np.float32), q, order=1).reshape(self.shape) > 0.3
        # the internal cerebral veins (TopBrain's label 37): in the roof of the third ventricle, outside the ventricles
        self.icv = ndimage.map_coordinates((lab == ICV_LABEL).astype(np.float32), q, order=1).reshape(self.shape) > 0.3
        self.fixed = ndimage.map_coordinates(np.isin(lab, FIXED_VESSELS).astype(np.float32), q, order=1).reshape(self.shape) > 0.3
        del q, ct, lab
        c = np.load(CT_BUILD / "bone.npz")
        b, a = c["b"].astype(np.float32), c["a"]
        af = a.copy()
        af[:3, :3] = self.R.T @ a[:3, :3]
        af[:3, 3] = (a[:3, 3] - self.fossa) @ self.R
        cav = K.cavity(b, af)
        qc = np.rint(nib.affines.apply_affine(np.linalg.inv(af), G)).astype(int)
        ok = np.all((qc >= 0) & (qc < np.array(cav.shape)), 1)
        inside = np.zeros(len(G), bool)
        inside[ok] = cav[tuple(qc[ok].T)]
        self.depth = ndimage.distance_transform_edt(inside.reshape(self.shape)) * STEP
        self.aff = np.diag([STEP, STEP, STEP, 1.0])
        self.aff[:3, 3] = GRID_LO

    def ijk(self, P: np.ndarray) -> np.ndarray:
        return np.rint((np.atleast_2d(P) - GRID_LO) / STEP).astype(int)


def fluid(g: Grid) -> np.ndarray:
    """The fluid below CSF_HU, at least DEPTH_MM inside the cranial cavity and VESSEL_GAP_MM from the labelled vessels."""
    vgap = max(1, int(round(VESSEL_GAP_MM / STEP)))
    return (g.hu < CSF_HU) & (g.hu > -200) & (g.depth > DEPTH_MM) & ~ndimage.binary_dilation(g.vessel, iterations=vgap)


def ventricles(g: Grid, midline: float) -> tuple[np.ndarray, np.ndarray | None, dict]:
    """The lateral ventricles' mask: the largest body of that fluid above LATERAL_Z_MIN; and the third ventricle's: the
    body of it on the midline (within THIRD_HALF_MM) below and between them, when there is one (in a narrow third
    ventricle the CT shows it only in part)."""
    z = GRID_LO[2] + np.arange(g.shape[2]) * STEP
    csf = fluid(g) & (z >= LATERAL_Z_MIN)[None, None, :]
    lab, n = ndimage.label(csf)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    m = lab == int(np.argmax(sizes))
    P = GRID_LO + np.argwhere(m) * STEP
    right = P[:, 0] > midline
    third, best = None, 0
    com = ndimage.center_of_mass(csf, lab, index=np.arange(1, n + 1))
    for i, c in enumerate(com, start=1):
        c = GRID_LO + np.array(c) * STEP
        ml = sizes[i] * STEP ** 3 / 1000
        if i == int(np.argmax(sizes)) or not THIRD_ML[0] <= ml <= THIRD_ML[1]:
            continue
        Q = GRID_LO + np.argwhere(lab == i) * STEP
        on_mid = np.abs(Q[:, 0] - midline).max() <= THIRD_HALF_MM
        between = P[:, 1].min() < c[1] < P[:, 1].max() and c[2] < P[:, 2].mean()
        if on_mid and between and sizes[i] > best:
            third, best = lab == i, sizes[i]
    rep = {"volumeMl": {"R": round(float(right.sum() * STEP ** 3 / 1000), 2), "L": round(float((~right).sum() * STEP ** 3 / 1000), 2),
                        "third": round(float(best * STEP ** 3 / 1000), 2)},
           "extentMm": {"lo": P.min(0).round(1).tolist(), "hi": P.max(0).round(1).tolist()}}
    return m, third, rep


def frontal_horns(mask: np.ndarray, g: Grid) -> dict:
    """The frontal horns' greatest width across both (their lateral walls, on an axial slice through their front
    FRONTAL_MM), and the cranial cavity's greatest inner width on that slice: Evans' index, their ratio."""
    P = GRID_LO + np.argwhere(mask) * STEP
    front = P[P[:, 1] > P[:, 1].max() - FRONTAL_MM]
    best = (0.0, None)
    for z in np.unique(front[:, 2]):
        q = front[front[:, 2] == z]
        w = q[:, 0].max() - q[:, 0].min()
        if w > best[0]:
            best = (float(w), float(z))
    w, z = best
    k = int(round((z - GRID_LO[2]) / STEP))
    inside = g.depth[:, :, k] > 0
    xs = GRID_LO[0] + np.argwhere(inside.any(1))[:, 0] * STEP
    inner = float(xs.max() - xs.min())
    return {"widthMm": round(w + STEP, 1), "atZ": round(z, 1), "innerSkullMm": round(inner, 1), "evansIndex": round((w + STEP) / inner, 3)}


# ---------------------------------------------------------------- the model fitted onto the CT's ventricles
def boundary_points(mask: np.ndarray) -> np.ndarray:
    """The centres of a mask's boundary voxels (frame mm)."""
    return GRID_LO + np.argwhere(mask & ~ndimage.binary_erosion(mask)) * STEP


def thin(P: np.ndarray, cell: float) -> np.ndarray:
    """One point per cell of this size (their indices, in order)."""
    _, first = np.unique(np.floor(P / cell).astype(np.int64), axis=0, return_index=True)
    return np.sort(first)


def fit_model(g: Grid, ct: np.ndarray, scale: float) -> tuple[dict, np.ndarray, dict, object]:
    """Z-Anatomy's ventricles fitted onto the CT's (ct: the lateral and third ventricles' mask): a similarity onto the
    lateral and third; then the CT's fourth ventricle, the fluid near the model's (placed by the similarity); then the
    smooth deformation onto all the CT shows. Returns {"R", "L", "third", "aqueduct", "fourth": (V, F)} in the frame,
    the CT's fourth ventricle, the fit's report and the fit itself (model points -> frame), which carries the structures
    around the ventricles."""
    ex = json.loads(EXPORT.read_text())["meshes"]
    V0 = {MODEL_NAMES[n]: scale * np.array(m["verts"], float) for n, m in ex.items()}
    F = {MODEL_NAMES[n]: np.array(m["tris"], int) for n, m in ex.items()}
    sample = {k: trimesh.sample.sample_surface_even(trimesh.Trimesh(V0[k], F[k], process=False), FIT_SAMPLES, seed=1)[0] for k in V0}
    P = boundary_points(ct)
    s, R, t, _ = K.icp_similarity(P, np.vstack([sample[k] for k in SHOWN]), 60)
    inv = lambda X: ((X - t) @ R) / s  # noqa: E731   model -> CT (the ICP maps the CT onto the model)
    d_sim = cKDTree(inv(np.vstack([sample[k] for k in SHOWN]))).query(P)[0]
    # the CT's fourth ventricle: its fluid near the model's, clipped to FOURTH_NEAR_MM of it
    near4 = ndimage.distance_transform_edt(~fill(inv(V0["fourth"]), F["fourth"], GRID_LO, g.shape, STEP)) * STEP <= FOURTH_NEAR_MM
    lab, _ = ndimage.label(fluid(g) & ~ct)
    ids = np.unique(lab[near4 & (lab > 0)])
    ct4 = np.isin(lab, ids) & near4
    lab4, n4 = ndimage.label(ct4)
    keep = [i for i in range(1, n4 + 1) if (lab4 == i).sum() * STEP ** 3 / 1000 >= FOURTH_MIN_ML]
    ct4 = np.isin(lab4, keep)
    P = boundary_points(ct | ct4)
    pts = inv(np.vstack([sample[k] for k in V0]))
    warp, rng = K.Warp(), np.random.default_rng(0)
    for sigma in FIT_SIGMAS_MM:
        for _ in range(FIT_STEPS):
            d1, j1 = cKDTree(P).query(pts)
            ok1 = d1 < FIT_BACK_MM
            d2, j2 = cKDTree(pts).query(P)
            ok2 = d2 < FIT_PAIR_MM
            rp = np.vstack([pts[ok1], pts[j2[ok2]]])
            rv = np.vstack([P[j1[ok1]] - pts[ok1], P[ok2] - pts[j2[ok2]]])
            if len(rp) > FIT_RESIDUALS:
                k = rng.choice(len(rp), FIT_RESIDUALS, replace=False)
                rp, rv = rp[k], rv[k]
            ctrl = pts[thin(pts, sigma / 3)]
            sm, wsum = K.gauss(ctrl, rp, rv, sigma)
            warp.levels.append((ctrl.copy(), 0.5 * sm / np.maximum(wsum, 1e-9)[:, None], sigma))
            step = K.Warp()
            step.levels = warp.levels[-1:]
            pts = step(pts)
    d_fit = cKDTree(pts).query(P)[0]
    parts = {k: (warp(inv(V0[k])), F[k]) for k in V0}
    d4 = cKDTree(np.vstack([warp(inv(sample["fourth"]))])).query(boundary_points(ct4))[0] if ct4.any() else np.zeros(1)
    # the deformation's Jacobian at the model's vertices: positive everywhere, so it does not fold the model
    X = np.vstack([inv(V0[k]) for k in V0])
    J = np.stack([(warp(X + 0.25 * e) - warp(X - 0.25 * e)) / 0.5 for e in np.eye(3)], -1)
    det = np.linalg.det(J)
    rep = {"modelScale": round(scale, 3), "similarityScale": round(1 / s, 3),
           "similarityMedianMm": round(float(np.median(d_sim)), 2), "similarityP90Mm": round(float(np.percentile(d_sim, 90)), 2),
           "fitMedianMm": round(float(np.median(d_fit)), 2), "fitP90Mm": round(float(np.percentile(d_fit, 90)), 2),
           "fitMaxMm": round(float(d_fit.max()), 2), "jacobianMin": round(float(det.min()), 3), "jacobianMax": round(float(det.max()), 3),
           "modelMl": {k: round(abs(trimesh.Trimesh(*parts[k], process=False).volume) / 1000, 2) for k in parts},
           "fourthCtMl": round(float(ct4.sum() * STEP ** 3 / 1000), 2), "fourthFitMedianMm": round(float(np.median(d4)), 2)}
    return parts, ct4, rep, lambda X: warp(inv(scale * np.asarray(X, float)))


def monro(parts: dict) -> dict:
    """Each foramen: the points where the fitted lateral ventricle comes closest to the fitted third ventricle, the tube
    between them run on MONRO_INTO_MM into each."""
    V3 = parts["third"][0]
    lo3, hi3 = V3.min(0), V3.max(0)
    out = {}
    for s in ("R", "L"):
        V = parts[s][0]
        d, j = cKDTree(V3).query(V)
        i = int(np.argmin(d))
        a, b = V[i], V3[j[i]]
        u = unit(b - a) if d[i] > 1e-3 else unit(V3.mean(0) - V.mean(0))
        out[s] = {"a": a - MONRO_INTO_MM * u, "b": b + MONRO_INTO_MM * u, "gapMm": round(float(d[i]), 2),
                  # where on the third ventricle, 0 to 1 from its back to its front (y) and from its floor to its top (z)
                  "onThird": {"front": round(float((b[1] - lo3[1]) / (hi3[1] - lo3[1])), 2), "up": round(float((b[2] - lo3[2]) / (hi3[2] - lo3[2])), 2)}}
    return out


def tube_sd(pts: np.ndarray, radii: np.ndarray, lo: np.ndarray, shape: tuple) -> np.ndarray:
    """The signed distance (mm, negative inside) from a tube along the polyline pts, its radius changing linearly
    between the radii at its points, on a grid (corner lo, STEP); 30 mm beyond 3 mm from it."""
    out = np.full(shape, 30.0, np.float32)
    i0 = np.maximum(np.floor((pts.min(0) - radii.max() - 3.0 - lo) / STEP).astype(int), 0)
    i1 = np.minimum(np.ceil((pts.max(0) + radii.max() + 3.0 - lo) / STEP).astype(int) + 1, np.array(shape))
    G = lo + (np.stack(np.meshgrid(*[np.arange(a, b) for a, b in zip(i0, i1)], indexing="ij"), -1)) * STEP
    best = np.full(G.shape[:3], 30.0)
    for a, b, ra, rb in zip(pts[:-1], pts[1:], radii[:-1], radii[1:]):
        ab = b - a
        t = np.clip(((G - a) @ ab) / max(float(ab @ ab), 1e-9), 0, 1)
        best = np.minimum(best, np.linalg.norm(G - (a + t[..., None] * ab), axis=-1) - (ra + t * (rb - ra)))
    out[tuple(slice(a, b) for a, b in zip(i0, i1))] = best
    return out


def aqueduct(parts: dict) -> tuple[np.ndarray, np.ndarray, dict]:
    """The aqueduct's course: the fitted model's aqueduct in AQUEDUCT_BINS slices along it (their centres), from the
    third ventricle to the fourth, each end run on AQUEDUCT_INTO_MM into the ventricle it opens into; its diameter
    Xiao 2025's at the opening, the narrowest (put midway) and the outlet, in between linearly. Returns the course, the
    radius at each of its points and a report."""
    A = parts["aqueduct"][0]
    c = A.mean(0)
    u = np.linalg.svd(A - c, full_matrices=False)[2][0]
    s = (A - c) @ u
    edges = np.linspace(s.min(), s.max(), AQUEDUCT_BINS + 1)
    pts = np.array([A[(s >= a) & (s <= b)].mean(0) for a, b in zip(edges[:-1], edges[1:])])
    V3, V4 = parts["third"][0], parts["fourth"][0]
    if np.linalg.norm(pts[0] - V3.mean(0)) > np.linalg.norm(pts[-1] - V3.mean(0)):
        pts = pts[::-1]
    length = float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum())
    ends, gaps = [], []
    for end, V in ((pts[0], V3), (pts[-1], V4)):
        d, j = cKDTree(V).query(end)
        u_ = unit(V[j] - end) if d > 1e-3 else unit(V.mean(0) - end)
        ends.append(V[j] + AQUEDUCT_INTO_MM * u_)
        gaps.append(round(float(d), 2))
    sl = np.r_[0, np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))] / max(length, 1e-9)
    d_open, d_narrow, d_out = AQUEDUCT_MM
    r = np.interp(sl, [0, 0.5, 1], [d_open / 2, d_narrow / 2, d_out / 2])
    course = np.vstack([ends[0], pts, ends[1]])
    radii = np.r_[r[0], r, r[-1]]
    return course, radii, {"modelLengthMm": round(length, 1), "gapToThirdMm": gaps[0], "gapToFourthMm": gaps[1],
                           "courseMm": round(float(np.linalg.norm(np.diff(course, axis=0), axis=1).sum()), 1)}


def drawn(groups: dict[str, np.ndarray], tubes: dict[str, np.ndarray], lo: np.ndarray, midline: float,
          joined: list[str], carve: np.ndarray | None = None) -> tuple[trimesh.Trimesh, np.ndarray, np.ndarray, np.ndarray]:
    """The drawn surface on a grid (corner lo, STEP): the union of the groups' masks, its signed distance smoothed by
    SOFT_MM and drawn DRAW_OUT_MM outside it, with the tubes (their signed distances, not smoothed, so that narrow ones
    keep their calibre) drawn DRAW_OUT_MM outside too; kept apart at the midline (the septum pellucidum between the
    lateral ventricles) except within SEPTUM_SPARE_MM of the joined groups (the midline ventricles and the tubes); and
    drawn round carve (a signed distance, positive outside what it carves: the mammillary bodies). Returns the mesh, each vertex's group (the nearest, as an index into groups), the drawn inside and each voxel's
    group."""
    keys = list(groups)
    U = np.any(np.stack([groups[k] for k in keys]), 0)
    sd = ndimage.gaussian_filter(sdf(U, STEP), SOFT_MM / STEP)
    # positive inside the drawn surface; isosurface's zero padding stays outside (the level is a hair above zero)
    field = np.clip(DRAW_OUT_MM - sd, -5.0, 5.0).astype(np.float32)
    for t in tubes.values():
        field = np.maximum(field, np.clip(DRAW_OUT_MM - t, -5.0, 5.0))
    x = lo[0] + np.arange(U.shape[0]) * STEP
    near = ndimage.distance_transform_edt(~np.any(np.stack([groups[k] for k in joined]), 0)) * STEP <= SEPTUM_SPARE_MM
    septum = (np.abs(x - midline) <= SEPTUM_HALF_MM)[:, None, None] & ~near
    field[septum] = np.minimum(field[septum], -0.5)
    if carve is not None:
        field = np.minimum(field, carve.astype(np.float32))
    # specks the carving leaves (a voxel or two apart from the cavity) dropped: the drawn ventricles are one cavity
    cl, ncl = ndimage.label(field > 0.01)
    if ncl > 1:
        sizes = np.bincount(cl.ravel())
        sizes[0] = 0
        field[(cl > 0) & (sizes[cl] < sizes.max())] = -0.5
    aff = np.diag([STEP, STEP, STEP, 1.0])
    aff[:3, 3] = lo
    mesh = isosurface(field, aff, 0.01, 0.0, DRAWN_FACES)
    # smoothed again after the decimation, which leaves flat facets and creases that the endoscope's light shows
    # (Taubin's: it keeps the volume)
    trimesh.smoothing.filter_taubin(mesh, lamb=0.5, nu=0.53, iterations=DRAWN_SMOOTH)
    dist = np.stack([ndimage.distance_transform_edt(~groups[k]).astype(np.float32) for k in keys])
    q = ((np.asarray(mesh.vertices) - lo) / STEP).T
    vlab = np.argmin(np.stack([ndimage.map_coordinates(d, q, order=1, mode="nearest") for d in dist]), 0)
    inside = field > 0.01
    return mesh, vlab, inside, np.argmin(dist, 0)


def split(mesh: trimesh.Trimesh, vlab: np.ndarray) -> dict[int, tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]]:
    """The drawn surface split by group (a face goes with the group of most of its vertices), each piece with the
    whole surface's normals so the seams do not show, and its vertices' indices in the whole."""
    Fa = np.asarray(mesh.faces)
    l3 = vlab[Fa]
    flab = np.where((l3[:, 0] == l3[:, 1]) | (l3[:, 0] == l3[:, 2]), l3[:, 0], np.where(l3[:, 1] == l3[:, 2], l3[:, 1], l3[:, 0]))
    Vn, N = np.asarray(mesh.vertices), np.asarray(mesh.vertex_normals)
    out = {}
    for k in np.unique(flab):
        f = Fa[flab == k]
        used, inv = np.unique(f, return_inverse=True)
        out[int(k)] = (Vn[used], N[used], inv.reshape(-1, 3), used)
    return out


def piece_node(name: str, V: np.ndarray, N: np.ndarray, T: np.ndarray) -> dict:
    return {"name": name, "positions": V, "normals": N, "indices": T, "mode": TRIANGLES}


def contrast(hu: np.ndarray, region: np.ndarray, others: np.ndarray, vessel: np.ndarray) -> dict:
    """The CT's mean HU in a region and in the brain 2.5 to 5 mm around it (not in the other ventricles or vessels)."""
    out = ndimage.distance_transform_edt(~region) * STEP
    shell = (out > 2.5) & (out < 5.0) & ~others & ~vessel
    return {"insideHu": round(float(hu[region].mean()), 1), "aroundHu": round(float(hu[shell].mean()), 1)}


# ---------------------------------------------------------------- the skull: suture, Kocher's point, ear canals
def suture_point(S: A.Skull, x0: float) -> np.ndarray:
    """The coronal suture on the outer table at x = x0: midway between the rearmost frontal and the foremost parietal
    surface there (the two names overlap by about a centimetre)."""
    F = np.array(S.ex["bones"]["Frontal bone"]["verts"], float)
    side = "Parietal bone.r" if x0 > 0 else "Parietal bone.l"
    P = np.array(S.ex["bones"][side]["verts"], float)
    top = F[:, 2].max()
    f = F[(np.abs(F[:, 0] - x0) < 2) & (F[:, 2] > top - 35)]
    p = P[(np.abs(P[:, 0] - x0) < 2) & (P[:, 2] > top - 35)]
    y = 0.5 * (f[:, 1].min() + p[:, 1].max())
    z = max(f[f[:, 1] < f[:, 1].min() + 5, 2].max(), p[p[:, 1] > p[:, 1].max() - 5, 2].max())
    return S.surface(np.array([x0, y, z]), np.array([0.0, 0.0, 1.0]))


def along_surface(S: A.Skull, p: np.ndarray, direction: np.ndarray, mm: float) -> np.ndarray:
    """A point mm along the outer table from p, heading in direction (projected onto the surface), backwards when
    mm < 0."""
    sgn = 1.0 if mm >= 0 else -1.0
    left, cur = abs(mm), p.copy()
    while left > 1e-6:
        n = S.outward(cur)
        t = direction - (direction @ n) * n
        t = unit(t) * sgn
        stepmm = min(0.5, left)
        nxt = S.surface(cur + stepmm * t, S.outward(cur + stepmm * t), reach=10.0)
        left -= float(np.linalg.norm(nxt - cur))
        cur = nxt
    return cur


def skull_normal(S: A.Skull, p: np.ndarray) -> np.ndarray:
    """The outer table's outward normal at p: from the bone's smoothed gradient."""
    ijk = nib.affines.apply_affine(S.inv, p)
    lo = np.floor(ijk).astype(int) - 12
    sub = S.b[tuple(slice(max(l_, 0), l_ + 25) for l_ in lo)].astype(np.float32)
    gr = np.gradient(ndimage.gaussian_filter(sub, 4.0))
    c = np.clip(np.rint(ijk - np.maximum(lo, 0)).astype(int), 0, np.array(sub.shape) - 1)
    gv = np.array([gr[k][tuple(c)] for k in range(3)])
    n = -(S.a[:3, :3] @ gv)          # towards less bone: outwards from the skull's outer surface
    n = unit(n)
    return n if n @ (p - S.centre) > 0 else -n


def ear_canal(S: A.Skull, side: str) -> tuple[np.ndarray, list]:
    """The external acoustic meatus: along the shortest way through air from the tympanic membrane (OpenEar's, Skull
    base v3) out of the head, the last point with bone around it. Returns it and the canal's course."""
    from winding_check import read_nodes
    tm = next(P for name, P, _, _ in read_nodes(V3_BUILD / "tb_tympanic_membrane.glb") if name == side).mean(0)
    ct, aff = K.load_ct()
    sg = 1.0 if side == "R" else -1.0
    xs = np.arange(30, 85, STEP) * sg
    ys = np.arange(tm[1] - 30, tm[1] + 30, STEP)
    zs = np.arange(tm[2] - 30, tm[2] + 30, STEP)
    G = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), -1)
    f = np.load(CT_BUILD / "frame.npz")
    q = nib.affines.apply_affine(np.linalg.inv(aff), G.reshape(-1, 3) @ f["R"].T + f["fossa"]).T
    v = ndimage.map_coordinates(ct, q, order=1, cval=-1000).reshape(G.shape[:3])
    air = v < -300
    idx = np.argwhere(air)
    starts = idx[np.linalg.norm(G[tuple(idx.T)] - tm, axis=1) < 4]
    ends = np.argwhere(air[-1])
    ends = np.c_[np.full(len(ends), air.shape[0] - 1), ends]
    mcp = MCP_Geometric(np.where(air, 1.0, np.inf))
    cum, _ = mcp.find_costs([tuple(x) for x in starts], [tuple(x) for x in ends[::7]], find_all_ends=False)
    e = ends[int(np.argmin(cum[tuple(ends.T)]))]
    path = np.array(mcp.traceback(tuple(e)))
    P = G[tuple(path.T)]                                           # from the tympanic membrane outwards
    bd = ndimage.distance_transform_edt(~(v > 300)) * STEP
    bony = np.nonzero(bd[tuple(path.T)] < 3.0)[0]
    meatus = P[bony.max()]
    return meatus, P[:: max(1, len(P) // 24)].round(2).tolist()


# ---------------------------------------------------------------- the trajectories
def trajectory(entry: np.ndarray, d: np.ndarray, vent: dict[str, np.ndarray], g: Grid, bone_at) -> dict:
    """Follow the line from the entry on the outer table: the bone crossed, then the first ventricle met (its side, the
    depth from the outer table, the length inside it), or, if none, how close it passes to the nearest."""
    ts = np.arange(0, MAX_DEPTH_MM, RAY_STEP_MM)
    P = entry + ts[:, None] * d
    ijk = g.ijk(P)
    ok = np.all((ijk >= 0) & (ijk < np.array(g.shape)), 1)
    hit = {}
    for s, m in vent.items():
        h_ = np.zeros(len(P), bool)
        h_[ok] = m[tuple(ijk[ok].T)]
        hit[s] = h_
    bone = bone_at(P)
    inner = int(np.argmax(~bone & (ts > 1.0))) if (~bone).any() else 0      # leaves the bone: the inner table
    first = {s: (int(np.argmax(h_)) if h_.any() else None) for s, h_ in hit.items()}
    met = [s for s in first if first[s] is not None]
    out = {"boneMm": round(float(ts[inner]), 1)}
    if not met:
        dist = {s: float(cKDTree(GRID_LO + np.argwhere(m) * STEP).query(P)[0].min()) for s, m in vent.items()}
        s = min(dist, key=dist.get)
        return {**out, "ventricle": None, "nearestSide": s, "missMm": round(dist[s], 1)}
    s = min(met, key=lambda k: first[k])
    i0 = first[s]
    i1 = i0 + int(np.argmax(~hit[s][i0:])) if (~hit[s][i0:]).any() else len(ts) - 1
    return {**out, "ventricle": s, "depthMm": round(float(ts[i0]), 1), "insideMm": round(float(ts[i1] - ts[i0]), 1),
            "entersAt": P[i0].round(1).tolist()}


def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)
    S = A.Skull()
    ex2 = S.ex
    falx = np.array(ex2["soft"]["Falx cerebri"]["verts"], float)
    midline = float(np.median(falx[:, 0]))
    g = Grid()
    mask, third, vrep = ventricles(g, midline)
    vrep["frontalHorns"] = frontal_horns(mask, g)
    print("ventricles", vrep, flush=True)
    if third is None:
        third = np.zeros_like(mask)
    # the model fitted onto the CT's ventricles, and the foramina between its lateral and third ventricles
    parts, fourth, fit, carry = fit_model(g, mask | third, float(ex2["fit"]["scale"]))
    vrep["volumeMl"]["fourth"] = fit["fourthCtMl"]
    fm = monro(parts)
    fit["monro"] = {s: {k: v for k, v in f.items() if k in ("gapMm", "onThird")} for s, f in fm.items()}
    print("model fitted", fit, flush=True)
    # the structures around the ventricles (the endoscopic view), carried by the same fit; the mammillary bodies placed
    deep, frame, etv = E.carried(carry, json.loads(EXPORT.read_text()).get("deep", {}), midline, parts["third"][0])
    print("around the ventricles", etv, flush=True)
    # the drawn surface, on a crop of the grid around the ventricles
    allV = np.vstack([V for V, _ in parts.values()] + [boundary_points(mask | third | fourth)])
    i0 = np.maximum(np.floor((allV.min(0) - 6.0 - GRID_LO) / STEP).astype(int), 0)
    i1 = np.minimum(np.ceil((allV.max(0) + 6.0 - GRID_LO) / STEP).astype(int) + 1, np.array(g.shape))
    crop = tuple(slice(a, b) for a, b in zip(i0, i1))
    lo, shape = GRID_LO + i0 * STEP, tuple(i1 - i0)
    x = lo[0] + np.arange(shape[0]) * STEP
    right = (x > midline)[:, None, None]
    model = {k: fill(V, F, lo, shape, STEP) for k, (V, F) in parts.items()}
    groups = {"R": (mask[crop] & right) | model["R"], "L": (mask[crop] & ~right) | model["L"], "third": third[crop] | model["third"],
              "fourth": fourth[crop] | model["fourth"]}
    r_monro = float(np.sqrt(MONRO_AREA_MM2 / np.pi))
    tubes = {f"monro{s}": tube_sd(np.array([fm[s]["a"], fm[s]["b"]]), np.array([r_monro, r_monro]), lo, shape) for s in ("R", "L")}
    course, radii, fit["aqueduct"] = aqueduct(parts)
    tubes["aqueduct"] = tube_sd(course, radii, lo, shape)
    groups["aqueduct"] = (tubes["aqueduct"] <= 0) & ~groups["third"] & ~groups["fourth"]
    for s in ("R", "L"):
        groups[f"monro{s}"] = (tubes[f"monro{s}"] <= 0) & ~groups[s] & ~groups["third"]
    keys = list(groups)
    mb_sd = E.solid_sd([(V, F) for _, V, F in deep["ve_mammillary_body"]], lo, shape, STEP, fill, sdf)
    # drawn round the mammillary bodies (they bulge into the floor) and this patient's internal cerebral veins (the
    # fitted model's ventricles reach over them in places; the CT's own fluid does not)
    icv_sd = sdf(g.icv[crop], STEP) if g.icv[crop].any() else np.full(shape, 30.0, np.float32)
    # but not across the foramina or the aqueduct (the veins begin at the foramina's back): the cavity stays one
    near_tube = np.min(np.stack([tubes[k] for k in ("monroR", "monroL", "aqueduct")]), 0) <= 1.5
    icv_sd = np.where(near_tube, 30.0, icv_sd)
    mesh, vlab, inside, lab = drawn(groups, tubes, lo, midline, ["third", "monroR", "monroL", "aqueduct", "fourth"],
                                    carve=np.minimum(mb_sd - E.MB_GAP_MM, icv_sd - ICV_GAP_MM))
    pieces = split(mesh, vlab)
    # the endoscopic view's target, and the basilar apex (this CT's: the top of TopBrain's label)
    import skullbase_v3_base as BASE
    rec, etv_tgt, trep = E.target_point(pieces[keys.index("third")][0], frame, -E.MB_BEHIND_AC_MM[0])
    ba = BASE.topbrain_surface("Basilar artery", "R", g.fossa, g.R)
    apex = ba[np.argmax(ba[:, 2])]
    # the hydrocephalus shape (a morph target): the walls moved so the ventricles measure as Rosu 2026's medians
    Vm, Nm, Fm = np.asarray(mesh.vertices), np.asarray(mesh.vertex_normals), np.asarray(mesh.faces)
    kind = {"R": "lateral", "L": "lateral", "monroR": "monro", "monroL": "monro", "third": "third"}
    part = np.array([kind.get(keys[i], "still") for i in vlab])
    monro_c = np.array([0.5 * (fm[s]["a"] + fm[s]["b"]) for s in ("R", "L")])
    # this CT's arteries at the skull base: the shaped walls keep clear of them (their signed distance on the grid, mm)
    i0v = np.maximum(np.floor((Vm.min(0) - 25 - GRID_LO) / STEP).astype(int), 0)
    i1v = np.minimum(np.ceil((Vm.max(0) + 25 - GRID_LO) / STEP).astype(int) + 1, np.array(g.shape))
    vm = g.fixed[tuple(slice(a, b) for a, b in zip(i0v, i1v))]
    vdist = ((ndimage.distance_transform_edt(~vm) - ndimage.distance_transform_edt(vm)) * STEP).astype(np.float32)   # negative inside
    lo_v = GRID_LO + i0v * STEP

    def vessel_dist(P: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(vdist, ((np.atleast_2d(P) - lo_v) / STEP).T, order=1, mode="nearest")
    hfield, hrep = E.hydrocephalus(Vm, Nm, part, midline, etv_tgt, apex, vrep["frontalHorns"]["innerSkullMm"], monro_c, vessel_dist)
    # the mammillary bodies with the shape: where da Silva measured them in hydrocephalus; the floor is draped over them
    def verts(id_):
        return np.vstack([V for _, V, _ in deep[id_]])
    frame_h = E.ACPC(verts("ve_anterior_commissure") + hfield(verts("ve_anterior_commissure")),
                     verts("ve_posterior_commissure") + hfield(verts("ve_posterior_commissure")), midline)
    third_v = Vm[part == "third"]
    mb_shift, hrep["mammillary"] = E.mammillary_hydro(deep["ve_mammillary_body"], frame_h, third_v + hfield(third_v))
    mbv = np.vstack([verts("ve_mammillary_body"), verts("ve_mammillary_body") + mb_shift])     # at rest and shaped
    lo_m = mbv.min(0) - 8
    shape_m = tuple(np.ceil((mbv.max(0) + 8 - lo_m) / STEP).astype(int) + 1)
    mb_sd_h = E.solid_sd([(V + mb_shift, F) for _, V, F in deep["ve_mammillary_body"]], lo_m, shape_m, STEP, fill, sdf)

    def obstacle(P: np.ndarray) -> np.ndarray:
        """The skull-base arteries (kept VESSEL_CLEAR_MM clear) and the shaped mammillary bodies (MB_GAP_MM: the floor
        rests on them)."""
        q = ((np.atleast_2d(P) - lo_m) / STEP).T
        mbd = ndimage.map_coordinates(mb_sd_h, q, order=1, mode="nearest", cval=30.0)
        return np.minimum(vessel_dist(P), mbd + (E.VESSEL_CLEAR_MM - E.MB_GAP_MM))
    Dm, drep = E.drape(Vm, Fm, hfield(Vm), obstacle)
    hrep.update(drep)
    # the floor wrapped onto the mammillary bodies, so each shows as a bulge
    Dm, hrep["mammillaryWrap"] = E.wrap_floor(Vm, Fm, Dm, part == "third", lambda P: ndimage.map_coordinates(
        mb_sd_h, ((np.atleast_2d(P) - lo_m) / STEP).T, order=1, mode="nearest"), frame_h.z)
    print("floor wrapped", hrep["mammillaryWrap"], flush=True)
    # what the walls measure as drawn (draped), the target moving with the floor under it
    j_tgt = int(np.argmin(np.linalg.norm(Vm - etv_tgt, axis=1)))
    hrep["hydrocephalus"] = E.measures(Vm, part, etv_tgt, apex, vrep["frontalHorns"]["innerSkullMm"], float(monro_c[:, 2].mean()), Dm, Dm[j_tgt])
    Nh = np.asarray(trimesh.Trimesh(Vm + Dm, Fm, process=False).vertex_normals)
    print("hydrocephalus", hrep, flush=True)

    def tnode(name: str, idx: np.ndarray, T: np.ndarray) -> dict:
        n = piece_node(name, Vm[idx], Nm[idx], T)
        n["targets"] = [{"name": "hydrocephalus", "positions": Dm[idx], "normals": Nh[idx] - Nm[idx]}]
        return n
    nodes, cent = {}, {}
    for i, k in enumerate(keys):
        V, N, T, whole = pieces[i]
        if k in MIDLINE:     # a midline ventricle in its left and right halves, as the other sections draw them
            c = V[T].mean(1)[:, 0] > midline
            for s, sel in (("R", c), ("L", ~c)):
                used, inv = np.unique(T[sel], return_inverse=True)
                nodes.setdefault(k, []).append(tnode(s, whole[used], inv.reshape(-1, 3)))
                cent[f"{k}{s}"] = V[used].mean(0).round(2).tolist()
        else:
            s = k[-1]
            nodes.setdefault("monro" if k.startswith("monro") else "lateral", []).append(tnode(s, whole, T))
            cent[k] = V.mean(0).round(2).tolist()
    write_glb(BUILD / "ve_lateral_ventricle.glb", sorted(nodes["lateral"], key=lambda n: n["name"]), {"id": "ve_lateral_ventricle"})
    write_glb(BUILD / "ve_third_ventricle.glb", nodes["third"], {"id": "ve_third_ventricle"})
    write_glb(BUILD / "ve_cerebral_aqueduct.glb", nodes["aqueduct"], {"id": "ve_cerebral_aqueduct"})
    write_glb(BUILD / "ve_fourth_ventricle.glb", nodes["fourth"], {"id": "ve_fourth_ventricle"})
    write_glb(BUILD / "ve_interventricular_foramen.glb", sorted(nodes["monro"], key=lambda n: n["name"]), {"id": "ve_interventricular_foramen"})
    # the walls: each structure that forms one pushed out of the drawn cavity
    etv["wallsMovedMm"] = E.walls(deep, inside, lo, STEP, sdf, Vm, Nm)
    # with the hydrocephalus shape: the field's moves, each structure then kept out of the shaped cavity
    hmoves, hrep["wallsPushedMm"] = E.shaped_walls(deep, hfield, Vm + Dm, Fm, Nh, fill, sdf, STEP)
    hmoves["ve_mammillary_body"] = [np.tile(mb_shift, (len(V), 1)) for _, V, _ in deep["ve_mammillary_body"]]
    monro_h = {s: 0.5 * (fm[s]["a"] + fm[s]["b"]) + Dm[part == "monro"][(Vm[part == "monro", 0] > midline) == (s == "R")].mean(0) for s in ("R", "L")}
    thal_h = np.vstack([V + D for (_, V, _), D in zip(deep["ve_thalamus"], hmoves["ve_thalamus"])])
    hmoves["ve_choroid_plexus"], hrep["plexusAtMonro"] = E.plexus_on_thalamus(deep["ve_choroid_plexus"], hmoves["ve_choroid_plexus"], thal_h,
                                                                              monro_h, Vm + Dm, Nh)
    print("plexus at the foramina", hrep["plexusAtMonro"], flush=True)
    for id_, *_ in E.DEEP:
        nd = E.nodes(deep[id_], midline, hmoves[id_])
        write_glb(BUILD / f"{id_}.glb", nd, {"id": id_})
        for n in nd:
            cent[f"{id_}{n['name']}"] = n["positions"].mean(0).round(2).tolist()
    print("walls", etv["wallsMovedMm"], flush=True)
    hrep["jacobianMinAround"] = round(E.jacobian_min(hfield, np.vstack([V for pcs in deep.values() for _, V, _ in pcs])[::3]), 3)
    tgt_h = etv_tgt + Dm[j_tgt]
    # what is drawn: its volumes, and (for the trajectories) each side's lateral ventricle with its foramen
    vrep["drawnMl"] = {k: round(float((inside & (lab == i)).sum() * STEP ** 3 / 1000), 2) for i, k in enumerate(keys)}
    np.savez_compressed(BUILD / "drawn.npz", inside=inside, lab=lab.astype(np.uint8), lo=lo, keys=np.array(keys),
                        model=np.stack([model[k] for k in ("R", "L", "third", "aqueduct", "fourth")]))
    vent = {}
    for s in ("R", "L"):
        full = np.zeros(g.shape, bool)
        full[crop] = inside & np.isin(lab, [keys.index(s), keys.index(f"monro{s}")])
        vent[s] = full
    # checks on the CT: is it darker along the fitted temporal horns and the foramina than in the brain around them?
    z = lo[2] + np.arange(shape[2]) * STEP
    ctv = (mask | third | fourth)[crop]
    allv = np.any(np.stack(list(groups.values())), 0)
    fit["temporalHorn"] = {s: contrast(g.hu[crop], model[s] & (z < TEMPORAL_Z_MM)[None, None, :] & ~ctv, allv, g.vessel[crop]) for s in ("R", "L")}
    fit["monroCt"] = {s: contrast(g.hu[crop], tubes[f"monro{s}"] <= 0, allv, g.vessel[crop]) for s in ("R", "L")}
    fit["monroRadiusMm"] = round(r_monro, 2)
    # the aqueduct and the fourth ventricle: the CT along the model's (where the CT does not already show fluid), and
    # whether the drawn ventricles are one cavity, lateral to fourth
    fit["aqueductCt"] = contrast(g.hu[crop], groups["aqueduct"] & ~ctv, allv, g.vessel[crop])
    fit["fourthCt"] = contrast(g.hu[crop], model["fourth"] & ~ctv, allv, g.vessel[crop])
    cl, ncl = ndimage.label(inside)
    big = np.bincount(cl.ravel())[1:]
    fit["drawnPieces"] = int(ncl)
    fit["drawnLargestShare"] = round(float(big.max() / big.sum()), 4)
    vrep["fit"] = fit
    print("drawn", vrep["drawnMl"], "temporal horns", fit["temporalHorn"], "foramina", fit["monroCt"], "aqueduct", fit["aqueductCt"],
          "fourth", fit["fourthCt"], "pieces", ncl, fit["drawnLargestShare"], flush=True)
    # the skull's landmarks
    bregma = A.bregma(S)
    sut = {f"{s}{int(d)}": suture_point(S, midline + (d if s == "R" else -d)) for s in ("R", "L") for d in (15.0, 25.0, 30.0, 40.0)}
    meatus, canal = {}, {}
    for s in ("R", "L"):
        meatus[s], canal[s] = ear_canal(S, s)
    print("meatus", {s: m.round(1).tolist() for s, m in meatus.items()}, flush=True)
    kocher = {}
    for name, d in KOCHER.items():
        for s in ("R", "L"):
            sp = sut[f"{s}{int(d)}"]
            for off in AP_OFFSETS:
                kocher[(name, s, off)] = along_surface(S, sp, np.array([0.0, 1.0, 0.0]), KOCHER_ANTERIOR_MM + off)
    # the trajectories
    eam_l, eam_r = meatus["L"], meatus["R"]
    on_line = lambda xx: eam_r + (xx - eam_r[0]) / (eam_l[0] - eam_r[0]) * (eam_l - eam_r)   # noqa: E731

    def bone_at(P):
        return S.bone_at(P)
    rows = []
    for (name, s, off), e in kocher.items():
        sg = 1.0 if s == "R" else -1.0
        n = skull_normal(S, e)
        for tgt in TARGETS:
            if tgt == "P":
                d = -n
                aim = None
            else:
                xt = {"IMC": midline + sg * CANTHUS_MM, "MAM": midline, "CMC": midline - sg * CANTHUS_MM}[tgt]
                aim = on_line(xt)
                d = unit(aim - e)
            r = trajectory(e, d, vent, g, bone_at)
            rows.append({"kocher": name, "side": s, "offsetMm": off, "target": tgt, "entry": e.round(2).tolist(), "direction": d.round(4).tolist(),
                         **({"aim": aim.round(2).tolist()} if aim is not None else {}),
                         "angleToNormalDeg": round(float(np.degrees(np.arccos(np.clip(d @ -n, -1, 1)))), 1), **r})
    for r in rows:
        if r["offsetMm"] == 0:
            print(r["kocher"], r["side"], r["target"], r.get("ventricle"), r.get("depthMm"), r.get("missMm"), flush=True)
    landmarks = [{"id": "lm_bregma", "name": "Bregma", "ras": bregma.round(2).tolist(), "side": "M",
                  "how": "Where this CT's frontal and parietal bones meet at the midline, on the outer table (the names from the fitted Z-Anatomy model)."}]
    for s in ("R", "L"):
        landmarks.append({"id": f"lm_meatus_{s.lower()}", "name": "External acoustic meatus", "ras": meatus[s].round(2).tolist(), "side": s,
                          "how": "The ear canal is the shortest way through air from the registered tympanic membrane to outside; the meatus is where it leaves the bone."})
        for name, d in KOCHER.items():
            landmarks.append({"id": f"lm_kocher_{name}_{s.lower()}", "name": f"Kocher's point ({'Chen 2025' if name == 'chen' else 'Park 2020'})",
                              "ras": kocher[(name, s, 0.0)].round(2).tolist(), "side": s,
                              "how": f"{KOCHER_ANTERIOR_MM:.0f} mm in front of the coronal suture along the outer table, {d:.0f} mm from the midline."})
        landmarks.append({"id": f"lm_canthus_{s.lower()}", "name": "Medial canthus (projected)", "ras": on_line(midline + (CANTHUS_MM if s == "R" else -CANTHUS_MM)).round(2).tolist(),
                          "side": s, "how": f"Not in this CT (it stops at the forehead): {CANTHUS_MM:.2f} mm from the midline (half Chen 2025's mean intercanthal distance), on the line between the external acoustic meatus, as Chen projects it."})
    # the endoscopic third ventriculostomy: its target, the landmarks around it, Sousa 2025's line through each foramen
    mb_pts = np.vstack([V for _, V, _ in deep["ve_mammillary_body"]])
    etv.update(trep)
    etv["basilarApexAcpcMm"] = frame.of(apex)[0].round(2).tolist()
    etv["targetToBasilarApexMm"] = round(float(np.linalg.norm(etv_tgt - apex)), 2)
    etv["frame"] = {"origin": frame.o.round(2).tolist(), "y": frame.y.round(4).tolist(), "z": frame.z.round(4).tolist()}
    etv["points"] = {"target": etv_tgt.round(2).tolist(), "infundibularRecess": rec.round(2).tolist(), "basilarApex": apex.round(2).tolist(),
                     "mammillaryBodies": mb_pts.mean(0).round(2).tolist(),
                     "monro": {s: (0.5 * (fm[s]["a"] + fm[s]["b"])).round(2).tolist() for s in ("R", "L")}}
    etv["trajectories"] = {s: E.trajectory(etv_tgt, 0.5 * (fm[s]["a"] + fm[s]["b"]), bone_at, frame, lambda x0: suture_point(S, x0))
                           for s in ("R", "L")}
    hrep["points"] = {"target": tgt_h.round(2).tolist(), "monro": {s: monro_h[s].round(2).tolist() for s in ("R", "L")},
                      "mammillaryBodies": (mb_pts + mb_shift).mean(0).round(2).tolist()}
    hrep["trajectories"] = {s: E.trajectory(tgt_h, monro_h[s], bone_at, frame, lambda x0: suture_point(S, x0)) for s in ("R", "L")}
    etv["hydrocephalus"] = hrep
    print("etv", {k: v for k, v in etv.items() if k not in ("points", "frame")}, flush=True)
    np.savez_compressed(BUILD / "etv.npz", **{f"{id_}|{n}|{sd}|{k}": a for id_, pcs in deep.items() for n, (sd, V, F) in enumerate(pcs)
                                               for k, a in (("V", V), ("F", F))})
    (GEN / f"{PREFIX}-etv.json").write_text(json.dumps(etv, indent=1))
    suture = {k: v.round(2).tolist() for k, v in sut.items()}
    out = {"midline": round(midline, 2), "ventricles": vrep, "suture": suture, "canal": canal, "canthusMm": round(CANTHUS_MM, 2),
           "params": {"csfHu": CSF_HU, "smoothMm": SMOOTH_MM, "depthMm": DEPTH_MM, "kocher": KOCHER, "kocherAnteriorMm": KOCHER_ANTERIOR_MM,
                      "apOffsets": AP_OFFSETS, "maxDepthMm": MAX_DEPTH_MM, "fitSigmasMm": list(FIT_SIGMAS_MM), "fitPairMm": FIT_PAIR_MM,
                      "fitBackMm": FIT_BACK_MM, "temporalZMm": TEMPORAL_Z_MM, "monroAreaMm2": MONRO_AREA_MM2, "aqueductMm": list(AQUEDUCT_MM), "softMm": SOFT_MM,
                      "drawOutMm": DRAW_OUT_MM}, "trajectories": rows}
    (BUILD / "trajectories.json").write_text(json.dumps(out, indent=1))
    (BUILD / "landmarks.json").write_text(json.dumps(landmarks, indent=1))
    write_manifest(cent, vrep, etv)
    (GEN / f"{PREFIX}-landmarks.json").write_text(json.dumps(landmarks, indent=1, ensure_ascii=False))
    (GEN / f"{PREFIX}-trajectories.json").write_text(json.dumps({k: v for k, v in out.items() if k != "canal"} | {"canal": canal}, indent=1))
    print("ventricles done")
    return 0


# from Skull base v3 (this CT's own vessels, the nerves routed through it, the fitted brainstem): what the endoscopic
# view shows through the floor of the third ventricle and around it
ETV_REFERENCED = ("sb_basilar_artery", "sb_posterior_cerebral_artery_p1_p2", "sb_posterior_communicating_artery", "sb_superior_cerebellar_artery",
                  "sb_internal_cerebral_veins", "sb_basal_vein_of_rosenthal", "sb_great_cerebral_vein_of_galen", "sb_anterior_cerebral_artery_a1_a2",
                  "sb_anterior_communicating_artery", "sb_internal_carotid_artery", "tb_oculomotor_nerve_iii", "tb_optic_nerve_ii", "pf_midbrain", "pf_pons")
DATASET_NOTE = ("One adult's CT angiogram (TopBrain 2025 case 011, Skull base v2's): the bone is this patient's, and so are "
                "the ventricles where the CT shows them; where it does not (the temporal horns, the foramina of Monro, the third "
                "ventricle's floor, the aqueduct, most of the fourth ventricle), they are the Z-Anatomy model's, fitted onto them. "
                "The brain around them is a template fitted "
                "into the CT (Skull base v3). Teaching tool, not for planning.")
LICENCE = ("TopBrain data: open use with attribution, non-commercial (University Hospital Zurich); the fitted model: Z-Anatomy "
           "CC BY-SA 4.0 (BodyParts3D CC BY-SA 2.1 Japan)")


def write_manifest(cent: dict, vrep: dict, etv: dict) -> None:
    """ve-manifest.json: this section's ventricles and the structures around them, with v2's bones, v3's fitted brain
    and the vessels and nerves of the endoscopic view by reference."""
    v2 = json.loads((GEN / "sbct-manifest.json").read_text())
    v3 = json.loads((GEN / "sbv3-manifest.json").read_text())
    cite = [CITES[c]["citation"] for c in ("topbrain2025", "mitsuhashi2009")]
    url = [CITES[c]["url"] for c in ("topbrain2025", "mitsuhashi2009")]
    v, fit, d = vrep["volumeMl"], vrep["fit"], vrep["drawnMl"]
    aq = fit["aqueduct"]
    th = fit["temporalHorn"]
    drawn_how = (f"The drawn surface joins the two, softened (its signed distance smoothed by {SOFT_MM} mm) and drawn {DRAW_OUT_MM} mm outside "
                 f"them, within the CT's uncertainty; it is kept {ICV_GAP_MM} mm clear of this patient's internal cerebral veins (the fitted "
                 "model reaches over them in places) and drawn round the mammillary bodies. The hydrocephalus slider shapes it as "
                 "the Sources page describes (a shape, not a simulation of the tissue).")
    model_how = (f"Where the CT does not show it, the Z-Anatomy model's (one adult, BodyParts3D), fitted onto the CT's ventricles by a smooth "
                 f"deformation: the CT's surface lies a median {fit['fitMedianMm']} mm from the fitted model's ({fit['fitP90Mm']} mm at the 90th "
                 "percentile).")
    base = {"aliases": [], "type": "soft", "bytes": 0, "colour": colour("sbCsf"), "dataset": "topbrain",
            "source": "This CT (TopBrain 2025 case 011), and the Z-Anatomy model fitted onto it", "licence": LICENCE,
            "citation": cite, "citationUrls": url, "refIds": [], "category": "ventricle", "layer": "nuclei"}
    items = [{
        **base, "id": "ve_lateral_ventricle", "name": "Lateral ventricle", "file": f"assets/{KIND}/ve_lateral_ventricle.glb",
        "derivation": (f"This CT's own where it shows it: the fluid darker than {CSF_HU:.0f} HU in its brain window (smoothed by {SMOOTH_MM:.0f} mm), "
                       f"at least {DEPTH_MM:.0f} mm inside the cranial cavity and away from the labelled vessels, its largest body ({v['R']} ml on the "
                       f"right, {v['L']} ml on the left; this patient's ventricles are narrow, and where they are a few millimetres wide the threshold "
                       f"sets their size). {model_how} The temporal horns, too narrow for this CT to show, are the model's: along them the CT is "
                       f"{th['R']['insideHu']} and {th['L']['insideHu']} HU (right, left), against {th['R']['aroundHu']} and {th['L']['aroundHu']} HU "
                       f"in the brain 2.5 to 5 mm around, so they lie on its faint fluid. The atria's enhancing choroid plexus, which a threshold "
                       f"leaves out, is inside the model's. {drawn_how} As drawn: {d['R']} ml right, {d['L']} ml left."),
        "centroid": {"L": cent["L"], "R": cent["R"]},
    }, {
        **base, "id": "ve_third_ventricle", "name": "Third ventricle", "file": f"assets/{KIND}/ve_third_ventricle.glb",
        "derivation": (f"This CT's own as far as it shows it: the body of fluid darker than {CSF_HU:.0f} HU on the midline below and between the "
                       f"lateral ventricles ({v['third']} ml), only its widest part. {model_how} Its recesses and floor are the model's. {drawn_how} "
                       f"As drawn: {d['third']} ml."),
        "centroid": {"L": cent["thirdL"], "R": cent["thirdR"]},
    }, {
        **base, "id": "ve_interventricular_foramen", "name": "Interventricular foramen (of Monro)", "aliases": ["Foramen of Monro"],
        "file": f"assets/{KIND}/ve_interventricular_foramen.glb",
        "source": "Drawn by rule between the fitted lateral and third ventricles (Jean 2019; Azab 2014)",
        "derivation": (f"Drawn by rule: this CT does not resolve it. A tube of the mean cross-section Jean 2019 measured in 30 adults without "
                       f"hydrocephalus ({MONRO_AREA_MM2} mm², here a circle {2 * fit['monroRadiusMm']:.1f} mm across) between the points where the "
                       f"fitted lateral ventricle comes closest to the fitted third ventricle ({fit['monro']['R']['gapMm']} mm apart on the right, "
                       f"{fit['monro']['L']['gapMm']} mm on the left): the third ventricle's front upper corner, the junction of its roof and anterior "
                       f"wall, where Azab 2014 places the foramina. Drawn {DRAW_OUT_MM} mm wider, like the ventricles."),
        "centroid": {"L": cent["monroL"], "R": cent["monroR"]},
    }, {
        **base, "id": "ve_cerebral_aqueduct", "name": "Cerebral aqueduct (of Sylvius)", "aliases": ["Aqueduct of midbrain", "Aqueduct of Sylvius"],
        "file": f"assets/{KIND}/ve_cerebral_aqueduct.glb",
        "source": "The fitted Z-Anatomy model's course, drawn at the calibre Xiao 2025 measured",
        "derivation": (f"This CT does not resolve it. Its course is the fitted Z-Anatomy model's aqueduct ({aq['modelLengthMm']} mm long; its ends "
                       f"{aq['gapToThirdMm']} and {aq['gapToFourthMm']} mm from the fitted third and fourth ventricles), run on "
                       f"{AQUEDUCT_INTO_MM:.0f} mm into each ({aq['courseMm']} mm in all). Its diameter is the mean Xiao 2025 measured in 30 healthy adults "
                       f"aged 61 to 88: {AQUEDUCT_MM[0]} mm where it leaves the third ventricle, {AQUEDUCT_MM[1]} mm at its narrowest (put midway: "
                       f"the paper does not say clearly where) and {AQUEDUCT_MM[2]} mm where it opens into the fourth; drawn {DRAW_OUT_MM} mm wider, "
                       f"like the ventricles. Along it the CT is {fit['aqueductCt']['insideHu']} HU, against {fit['aqueductCt']['aroundHu']} HU around."),
        "centroid": {"L": cent["aqueductL"], "R": cent["aqueductR"]},
    }, {
        **base, "id": "ve_fourth_ventricle", "name": "Fourth ventricle", "file": f"assets/{KIND}/ve_fourth_ventricle.glb",
        "derivation": (f"This CT's own where it shows it: the fluid darker than {CSF_HU:.0f} HU within {FOURTH_NEAR_MM:.0f} mm of the model's fourth "
                       f"ventricle ({v['fourth']} ml: its upper part; lower down this CT does not show it). {model_how} "
                       f"The CT's part lies a median {fit['fourthFitMedianMm']} mm from the fitted model's; along the rest of the model the CT is "
                       f"{fit['fourthCt']['insideHu']} HU, against {fit['fourthCt']['aroundHu']} HU around. Its lateral recesses and the foramina of "
                       f"Luschka and Magendie are not modelled. {drawn_how} As drawn: {d['fourth']} ml."),
        "centroid": {"L": cent["fourthL"], "R": cent["fourthR"]},
    }]
    mb = etv["mammillary"]
    moved = etv["wallsMovedMm"]
    carried = ("The Z-Anatomy model's (one adult, BodyParts3D), carried onto this CT by the fit that fits the model's ventricles onto this "
               "CT's (so it keeps its place around them); this CT does not show it.")
    for id_, name, objs, tok, cat in E.DEEP:
        it = {**base, "id": id_, "name": name, "file": f"assets/{KIND}/{id_}.glb", "colour": colour(tok), "category": cat,
              "source": "The Z-Anatomy model, carried onto this CT by the ventricles' fit", "fitted": True,
              "centroid": {s: cent[f"{id_}{s}"] for s in ("L", "R") if f"{id_}{s}" in cent}}
        if id_ == "ve_mammillary_body":
            it["derivation"] = (f"{carried} The model's mammillary bodies (the two small bodies of its hypothalamus) are thin plates "
                                f"({mb['modelVolumeMm3'][0]:g} and {mb['modelVolumeMm3'][1]:g} mm3), which a floor drawn over them does not show as "
                                f"bulges; each is drawn instead as a sphere where the model's lies, of half the two bodies' volume Vann 2022's growth "
                                f"curve gives at {E.MB_AGE_Y:.0f} years (from 250 MRIs at 6 to 24 years): {mb['volumeMm3']:g} mm3, "
                                f"{mb['diameterMm']:.1f} mm across, drawn a little larger ({mb['drawnDiameterMm']:.1f} mm across, further apart with "
                                f"it, so that they show as the bulges an endoscopist sees: a display choice, as is the round shape). The model's lie "
                                f"{-mb['modelAcpcMm'][0]:.1f} mm behind the anterior commissure; da Silva 2024 measured "
                                f"{-mb['daSilvaAcpcMm'][0]:.2f} mm in 200 MRIs (their anterosuperior point, along the AC-PC line from the anterior "
                                f"commissure's posterosuperior border, {-mb['daSilvaAcpcMm'][1]:.2f} mm below it). They are moved "
                                f"({mb['movedMm']} mm) to lie that far behind it, at the height of the model's floor there "
                                f"({-mb['placedAcpcMm'][1]:.1f} mm below the commissure), and the ventricle is drawn round them, so they bulge into its floor. "
                                f"With the hydrocephalus slider they move to where da Silva measured them in 24 MRIs with hydrocephalus (their "
                                f"anterosuperior point a median {E.MB_HYDRO_BEHIND_AC_MM[0]:.2f} mm behind the commissure, which moves with the shape), "
                                f"their tops {E.MB_PROTRUDE_MM:g} mm above the floor there, and the floor, coming down, rests on them and is wrapped "
                                "down onto each (the two bulges endoscopists see; the height and the wrap are modelling choices).")
            it["refIds"] = ["dasilva2024", "vann2022"]
        elif id_ in E.IN_CAVITY:
            pm = etv["hydrocephalus"]["plexusAtMonro"]
            it["derivation"] = (f"{carried} It lies in the ventricles, as drawn, and follows them with the hydrocephalus slider. There the "
                                "foramina of Monro grow backwards, and at each the plexus is shifted with them, towards the thalamus (the "
                                "foramen's posterior border; the plexus's tela is fixed along the choroidal fissure by the teniae of the "
                                f"thalamus and the fornix: Azab 2014) until it lies against it (by {pm['R']['shiftMm']:g} mm on the right "
                                f"and {pm['L']['shiftMm']:g} mm on the left, fading out {E.PLEXUS_MONRO_MM[1]:.0f} mm from the foramen), "
                                "so it does not hang across the widened opening.")
            it["refIds"] = ["azab2014"]
        else:
            mv = moved.get(id_, 0.0)
            it["derivation"] = carried + " With the hydrocephalus slider it follows the ventricles' walls." + (f" Where this CT shows the ventricles larger than the model, it is pushed out to their wall (by at "
                                          f"most {mv} mm), so that it forms the wall rather than lying in the fluid." if mv > 0.05 else "")
        items.append(it)
    for it in v2["structures"]:
        if it["type"] == "bone":
            items.append({**it})
    for it in v3["structures"]:
        if it.get("category") == "brain" or it["id"] in ETV_REFERENCED:
            items.append({**it})
    attribution = [a for a in v3["dataset"]["attribution"] if "TopBrain" in a or "BodyParts3D" in a or "Z-Anatomy" in a]
    m = {"space": "millimetres from the fitted hypophysial fossa, the CT turned into the Z-Anatomy model's frame (as Skull base v2)",
         "generatedBy": "pipeline/ventricles_build.py + pipeline/compress.mjs", "structures": items,
         "dataset": {"name": "TopBrain 2025 CT angiogram (case 011), with the Z-Anatomy ventricles fitted onto it", "licence": LICENCE,
                     "url": "https://zenodo.org/records/16878417", "note": DATASET_NOTE, "attribution": attribution,
                     "citation": cite, "citationUrls": url}}
    (GEN / f"{PREFIX}-manifest.json").write_text(json.dumps(m, indent=1, ensure_ascii=False))


def finalize() -> int:
    """After compress.mjs: file sizes, the manifest next to the assets; then the checks."""
    import shutil
    p = GEN / f"{PREFIX}-manifest.json"
    m = json.loads(p.read_text())
    own = {Path(it["file"]).name for it in m["structures"] if it["file"].startswith(f"assets/{KIND}/")}
    for f in (PUBLIC / KIND).glob("*.glb"):
        if f.name not in own:
            f.unlink()
    for it in m["structures"]:
        it["bytes"] = (REPO / "public" / it["file"]).stat().st_size
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    shutil.copy(p, PUBLIC / f"{PREFIX}-manifest.json")
    return validate()


def validate() -> int:
    fails, n = [], 0

    def check(ok, msg):
        nonlocal n
        n += 1
        if not ok:
            fails.append(msg)
    t = json.loads((GEN / f"{PREFIX}-trajectories.json").read_text())
    lms = {l["id"]: l for l in json.loads((GEN / f"{PREFIX}-landmarks.json").read_text())}
    v = t["ventricles"]
    for s in ("R", "L"):
        check(0.5 <= v["volumeMl"][s] <= 30, f"{s} lateral ventricle {v['volumeMl'][s]} ml")
    fh = v["frontalHorns"]
    check(10 <= fh["widthMm"] <= 60 and 0.1 <= fh["evansIndex"] <= 0.45, f"frontal horns {fh}")
    # the model's fit: close to the CT's ventricles, without folding; its temporal horns on the CT's faint fluid; the
    # foramina at the third ventricle's front upper corner (Azab 2014), short; the drawn ventricles holding the CT's
    fit, d = v["fit"], v["drawnMl"]
    check(fit["fitMedianMm"] <= 1.2 and fit["fitP90Mm"] <= 3.0, f"model fit {fit['fitMedianMm']} / {fit['fitP90Mm']} mm")
    check(fit["jacobianMin"] > 0.2, f"the model's deformation folds or crushes it: Jacobian {fit['jacobianMin']}")
    for s in ("R", "L"):
        th = fit["temporalHorn"][s]
        check(th["insideHu"] <= th["aroundHu"] + 2.0, f"{s} temporal horn brighter on the CT than around it: {th}")
        mo = fit["monro"][s]
        check(mo["gapMm"] < 6.0, f"{s} foramen of Monro {mo['gapMm']} mm long")
        check(mo["onThird"]["front"] >= 0.6 and mo["onThird"]["up"] >= 0.6, f"{s} foramen not at the third ventricle's front upper corner: {mo}")
        check(d[s] >= v["volumeMl"][s] and d[f"monro{s}"] > 0, f"{s} drawn {d[s]} ml, CT {v['volumeMl'][s]} ml; foramen {d[f'monro{s}']} ml")
    check(d["third"] >= v["volumeMl"]["third"], f"third ventricle drawn {d['third']} ml, CT {v['volumeMl']['third']} ml")
    check(fit["drawnPieces"] == 1, f"the drawn ventricles are {fit['drawnPieces']} pieces, not one cavity")
    aq = fit["aqueduct"]
    check(aq["gapToThirdMm"] < 3.0 and aq["gapToFourthMm"] < 3.0, f"the model's aqueduct does not reach the third and fourth ventricles: {aq}")
    check(12.0 <= aq["courseMm"] <= 26.0, f"aqueduct {aq['courseMm']} mm long")
    check(d["aqueduct"] > 0 and d["fourth"] >= v["volumeMl"]["fourth"] > 0, f"aqueduct {d['aqueduct']} ml, fourth ventricle drawn {d['fourth']} ml, CT {v['volumeMl']['fourth']} ml")
    check(fit["fourthFitMedianMm"] <= 1.5, f"the model's fourth ventricle {fit['fourthFitMedianMm']} mm from the CT's")
    for k in ("aqueductCt", "fourthCt"):
        check(fit[k]["insideHu"] <= fit[k]["aroundHu"] + 2.0, f"{k}: brighter on the CT than around it: {fit[k]}")
    mr, ml_ = np.array(lms["lm_meatus_r"]["ras"]), np.array(lms["lm_meatus_l"]["ras"])
    check(abs(mr[0] + ml_[0]) < 8 and abs(mr[1] - ml_[1]) < 8 and abs(mr[2] - ml_[2]) < 8, f"the two meatus are not mirror images: {mr} {ml_}")
    check(40 < mr[0] < 70 and -70 < ml_[0] < -40, f"meatus off the temporal bones: {mr} {ml_}")
    br = np.array(lms["lm_bregma"]["ras"])
    for name, d in KOCHER.items():
        for s in ("r", "l"):
            k = np.array(lms[f"lm_kocher_{name}_{s}"]["ras"])
            check(abs(abs(k[0] - t["midline"]) - d) < 2.0, f"Kocher ({name}, {s}) {abs(k[0] - t['midline']):.1f} mm from the midline")
            check(0 < k[1] - br[1] < 25, f"Kocher ({name}, {s}) {k[1] - br[1]:.1f} mm in front of bregma")
    rows = t["trajectories"]
    check(len(rows) == len(KOCHER) * 2 * len(AP_OFFSETS) * len(TARGETS), f"{len(rows)} trajectories")
    for r in rows:
        if r.get("ventricle"):
            check(15 <= r["depthMm"] <= MAX_DEPTH_MM, f"{r['kocher']} {r['side']} {r['target']} {r['offsetMm']}: depth {r['depthMm']}")
        check(2 <= r["boneMm"] <= 15, f"{r['kocher']} {r['side']} {r['target']} {r['offsetMm']}: bone {r['boneMm']} mm")
        check(abs(np.linalg.norm(r["direction"]) - 1) < 1e-3, "direction not a unit vector")
    m = json.loads((GEN / f"{PREFIX}-manifest.json").read_text())
    for it in m["structures"]:
        check((REPO / "public" / it["file"]).exists(), f"missing {it['file']}")
    print(f"ventricles validation: {n - len(fails)}/{n} checks passed")
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(finalize() if sys.argv[1:] == ["finalize"] else main())
