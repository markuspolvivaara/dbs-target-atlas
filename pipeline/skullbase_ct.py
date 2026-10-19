"""The detailed skull base (a second skull-base model, switchable from the first): one head CT angiogram of the
TopBrain 2025 release (case topcow_ct_011, University Hospital Zurich; open use with attribution, non-commercial),
its expert vessel labels, and the Z-Anatomy model fitted onto it for what a CT does not show.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_ct.py
  then: pipeline/skullbase_build.py ct, node pipeline/compress.mjs skullbase-ct, pipeline/skullbase_build.py ct finalize

Inputs
  pipeline/data/raw/topbrain/topcow_ct_011_0000.nii.gz   CTA, 0.5 mm isotropic
  pipeline/data/raw/topbrain/topcow_ct_011.nii.gz        TopBrain vessel labels (40 classes; 35 in this case)
  pipeline/data/build/skullbase_ct/ts/craniofacial_structures/skull.nii.gz   TotalSegmentator skull (restricts the bone)
  pipeline/data/build/skullbase/export.json              the Z-Anatomy export (skullbase_export.py)
Writes
  pipeline/data/build/skullbase_ct/export.json   the same format as the Z-Anatomy export, plus vessel meshes:
    bones     the CT's bone surface (400 HU, thin bone down to 170 HU next to it, and the walls of the air sinuses;
              outside the labelled vessels), split into the cranial bones by the
              nearest bone of the fitted Z-Anatomy model
    meshes    TopBrain's arteries and veins as surfaces of their labels
    lines     the Z-Anatomy cranial nerves, and the vessels TopBrain does not label, fitted onto this skull
    soft      Z-Anatomy soft tissue (cavernous sinus, pituitary, tentorium, falx, chiasm), fitted
    landmarks Z-Anatomy's named landmarks, fitted (and kept on the bone they belong to)

Frame: the CT is moved rigidly (true size kept) into the Z-Anatomy model's frame, origin at the (fitted)
hypophysial fossa, so the cut-away views and camera presets work as in the first model. The fit of Z-Anatomy onto
the CT: a similarity transform (with scale) by ICP, then a smooth non-rigid deformation (Gaussian-weighted
displacements from closest-point correspondences, coarse to fine); the residual distance is reported.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from build import isosurface  # noqa: E402

RAW = ROOT / "data" / "raw" / "topbrain"
CASE = "topcow_ct_011"   # both posterior communicating arteries labelled; 0.5 mm isotropic
CT = RAW / f"{CASE}_0000.nii.gz"
LABELS = RAW / f"{CASE}.nii.gz"
BUILD = ROOT / "data" / "build" / "skullbase-ct"   # its GLBs here too: compress.mjs skullbase-ct
TS_SKULL = BUILD / "ts" / "craniofacial_structures" / "skull.nii.gz"
ZEXPORT = ROOT / "data" / "build" / "skullbase" / "export.json"

BONE_HU = 400.0      # above contrast-filled vessels (lumens 150-300 HU here), below cortical bone
THIN_HU = 170.0      # thin bone (orbital roofs, wings, sellar floor) falls below BONE_HU at this resolution: voxels down to
THIN_REACH_MM = 1.5  # this value count as bone when they touch it and lie within this far of bone above BONE_HU
GRID_MM = 0.5        # the CT is resampled to this grid before its surface is taken
# the walls of the air sinuses (sphenoid, ethmoid, mastoid air cells): where the bone is thinner than a voxel its HU is
# averaged with the air (the sellar floor over the sphenoid sinus comes out at soft-tissue values), so no threshold finds
# it. Air enclosed in the skull is walled by bone, so a thin shell around it is drawn as bone.
SINUS_AIR_HU = -400.0    # air
SINUS_OPEN_MM = 1.0      # narrow openings (ostia) closed before air enclosed in the skull is told from outside air
SINUS_ML = (0.02, 50.0)  # enclosed air spaces of this size (the largest sinus here is about 6 ml)
SINUS_SHELL_MM = 1.0     # the wall drawn around them, where it is not air itself
SHELL_MIN_HU = -750.0    # voxels in the wall are partial volume: above this (the air inside is about -900)
SURFACE_LEVEL = 0.4      # the bone surface at this level of the smoothed mask (0.5 thins plates one voxel thick away)
SKULL_REACH_MM = 3.0  # bone within this far of TotalSegmentator's skull
# the cranial bones the fit uses (Z-Anatomy names; paired bones with .l / .r); the face is cut off in this CT
FIT_BONES = ["Frontal bone", "Parietal bone.l", "Parietal bone.r", "Occipital bone", "Temporal bone.l", "Temporal bone.r",
             "Sphenoid bone", "Ethmoid bone", "Zygomatic bone.l", "Zygomatic bone.r"]


def load_ct():
    img = nib.load(CT)
    return np.asanyarray(img.dataobj).astype(np.float32), img.affine


def resample(vol: np.ndarray, aff: np.ndarray, step: float, order: int) -> tuple[np.ndarray, np.ndarray]:
    zooms = np.sqrt((aff[:3, :3] ** 2).sum(0))
    f = zooms / step
    out = ndimage.zoom(vol, f, order=order, mode="nearest", grid_mode=False)
    a = aff.copy()
    a[:3, :3] = aff[:3, :3] * ((np.array(vol.shape) - 1) / (np.array(out.shape) - 1))
    return out, a


def bone_mask(ct: np.ndarray, lab: np.ndarray, skull: np.ndarray, zooms: np.ndarray) -> np.ndarray:
    """Bone: the CT above BONE_HU within reach of TotalSegmentator's skull, outside the labelled vessels; plus the
    thin bone that partial volume darkens (hysteresis): voxels above THIN_HU connected to that bone and within
    THIN_REACH_MM of it."""
    reach = max(1, int(round(SKULL_REACH_MM / float(zooms.min()))))
    near = ndimage.binary_dilation(skull, iterations=reach)
    vessels = ndimage.binary_dilation(lab > 0, iterations=2)
    strong = (ct > BONE_HU) & near & ~vessels
    dist = ndimage.distance_transform_edt(~strong, sampling=zooms)
    weak = (ct > THIN_HU) & near & ~vessels & (dist <= THIN_REACH_MM)
    lab_w, _ = ndimage.label(weak | strong)
    keep = np.unique(lab_w[strong])
    return np.isin(lab_w, keep[keep > 0])


def sinus_walls(ct: np.ndarray, lab: np.ndarray, zooms: np.ndarray) -> np.ndarray:
    """A shell around the air enclosed in the skull (sinuses, air cells): its walls, bone even where they are thinner
    than a voxel. Enclosed air: the components of the air, with narrow openings closed (an erosion), that do not reach
    the edge of the scan and are no larger than a sinus; grown back within the air."""
    vessels = ndimage.binary_dilation(lab > 0, iterations=2)
    air = ct < SINUS_AIR_HU
    it = max(1, int(round(SINUS_OPEN_MM / float(zooms.min()))))
    core = ndimage.binary_erosion(air, iterations=it)
    cl, n = ndimage.label(core)
    edge = set(np.unique(np.concatenate([cl[0].ravel(), cl[-1].ravel(), cl[:, 0].ravel(), cl[:, -1].ravel(),
                                         cl[:, :, 0].ravel(), cl[:, :, -1].ravel()])).tolist())
    ml = ndimage.sum(core, cl, index=np.arange(1, n + 1)) * float(np.prod(zooms)) / 1000.0
    keep = [i for i in range(1, n + 1) if i not in edge and SINUS_ML[0] <= ml[i - 1] <= SINUS_ML[1]]
    sinus = ndimage.binary_propagation(np.isin(cl, keep), mask=air)
    shell_it = max(1, int(round(SINUS_SHELL_MM / float(zooms.min()))))
    return ndimage.binary_dilation(sinus, iterations=shell_it) & ~sinus & ~vessels & (ct > SHELL_MIN_HU)


def similarity(src: np.ndarray, dst: np.ndarray) -> tuple[float, np.ndarray, np.ndarray]:
    """Umeyama: s, R, t minimising |s R src + t - dst|."""
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    U, S, Vt = np.linalg.svd(b.T @ a / len(src))
    D = np.eye(3)
    if np.linalg.det(U @ Vt) < 0:
        D[2, 2] = -1
    R = U @ D @ Vt
    s = float(np.trace(np.diag(S) @ D) / (a ** 2).sum(1).mean())
    return s, R, md - s * R @ ms


def icp_similarity(src: np.ndarray, dst: np.ndarray, iters: int = 60, s0=1.0, R0=None, t0=None):
    """Similarity ICP of the src points onto the dst cloud, trimmed (the closest 80 % of pairs)."""
    tree = cKDTree(dst)
    s, R, t = s0, (np.eye(3) if R0 is None else R0), (np.zeros(3) if t0 is None else t0)
    for _ in range(iters):
        cur = s * src @ R.T + t
        d, j = tree.query(cur)
        keep = d <= np.percentile(d, 80)
        s, R, t = similarity(src[keep], dst[j[keep]])
    cur = s * src @ R.T + t
    d, _ = tree.query(cur)
    return s, R, t, float(np.median(d))


def rot(axis: int, deg: float) -> np.ndarray:
    a = np.radians(deg)
    c, s_ = np.cos(a), np.sin(a)
    m = np.eye(3)
    i, j = [k for k in range(3) if k != axis]
    m[i, i], m[i, j], m[j, i], m[j, j] = c, -s_, s_, c
    return m


def gauss(p: np.ndarray, ctrl: np.ndarray, vals: np.ndarray, sigma: float, mask: np.ndarray | None = None) -> tuple[np.ndarray, np.ndarray]:
    """Gaussian-weighted sum of vals at ctrl, evaluated at p (within 3 sigma): (weighted sum, weight sum)."""
    import scipy.sparse as sp
    idx = cKDTree(ctrl).query_ball_point(p, 3 * sigma)
    rows = np.repeat(np.arange(len(p)), [len(i) for i in idx])
    cols = np.fromiter((c for i in idx for c in i), int, count=len(rows))
    d2 = ((p[rows] - ctrl[cols]) ** 2).sum(1)
    w = np.exp(-d2 / (2 * sigma ** 2)) * (1.0 if mask is None else mask[cols])
    W = sp.csr_matrix((w, (rows, cols)), shape=(len(p), len(ctrl)))
    return W @ vals, np.asarray(W.sum(1)).ravel()


class Warp:
    """A smooth displacement field: Gaussian-weighted displacements at control points, applied level by level
    (coarse to fine); far from every control point the field fades to zero."""

    def __init__(self):
        self.levels: list[tuple[np.ndarray, np.ndarray, float]] = []

    def __call__(self, p: np.ndarray) -> np.ndarray:
        p = np.array(p, float)
        for ctrl, disp, sigma in self.levels:
            s, wsum = gauss(p, ctrl, disp, sigma)
            p = p + s / np.maximum(wsum, 1e-9)[:, None] * np.minimum(wsum, 1.0)[:, None]
        return p


def nonrigid(src: np.ndarray, dst: np.ndarray, sigmas=(24.0, 14.0, 9.0, 6.0), steps: int = 6, max_d: float = 6.0) -> Warp:
    """Fit src onto dst by a smooth displacement field: at each scale, move every control point (a subsample of src)
    halfway to its closest dst point (pairs further than max_d ignored), smooth the moves with a Gaussian of that
    scale, repeat. Returns the accumulated warp."""
    warp = Warp()
    tree = cKDTree(dst)
    pts = src.copy()
    for sigma in sigmas:
        # control points spaced about a third of the scale apart (one per grid cell), so each sees a few hundred
        cell = np.floor(pts / (sigma / 3)).astype(np.int64)
        _, first = np.unique(cell, axis=0, return_index=True)
        ctrl = pts[np.sort(first)].copy()
        for _ in range(steps):
            d, j = tree.query(ctrl)
            ok = (d < max_d).astype(float)
            disp = 0.5 * (dst[j] - ctrl) * ok[:, None]
            s, wsum = gauss(ctrl, ctrl, disp, sigma, ok)
            sm = s / np.maximum(wsum, 1e-9)[:, None]
            warp.levels.append((ctrl.copy(), sm, sigma))
            ctrl = ctrl + sm
        pts = warp(src)
    return warp


def ct_bone() -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """The CT's bone mask on the GRID_MM grid (with the sinus walls), the same without them (the fit uses it: the model's
    bones have no sinus linings or septa), its affine (scanner RAS), and the vessel labels on that grid (cached in
    BUILD/bone.npz: it takes minutes on the full-resolution CT)."""
    cache = BUILD / "bone.npz"
    if cache.exists() and cache.stat().st_mtime > max(CT.stat().st_mtime, TS_SKULL.stat().st_mtime, Path(__file__).stat().st_mtime):
        c = np.load(cache)
        return c["b"], c["p"], c["a"], c["lab"]
    ct, aff = load_ct()
    lab = np.asanyarray(nib.load(LABELS).dataobj).astype(np.uint8)
    skull = np.asanyarray(nib.load(TS_SKULL).dataobj) > 0
    zooms = np.sqrt((aff[:3, :3] ** 2).sum(0))
    plain = bone_mask(ct, lab, skull, zooms)
    walls = sinus_walls(ct, lab, zooms)
    b, a = resample((plain | walls).astype(np.float32), aff, GRID_MM, 1)
    p, _ = resample(plain.astype(np.float32), aff, GRID_MM, 1)
    lab_g, _ = resample(lab.astype(np.float32), aff, GRID_MM, 0)
    np.savez_compressed(cache, b=b.astype(np.float16), p=p.astype(np.float16), a=a, lab=lab_g.astype(np.uint8))
    return b, p, a, lab_g.astype(np.uint8)


def surface_points(mask: np.ndarray, aff: np.ndarray, n: int = 60000) -> np.ndarray:
    """Points on a mask's boundary (scanner RAS), subsampled evenly."""
    m = mask > 0.5
    edge = m & ~ndimage.binary_erosion(m)
    p = nib.affines.apply_affine(aff, np.argwhere(edge).astype(float))
    return p[:: max(1, len(p) // n)]


def zanatomy_points(ex: dict, names: list[str]) -> np.ndarray:
    return np.vstack([np.array(ex["bones"][n]["verts"]) for n in names if n in ex["bones"]])


def fit(ex: dict, ct_pts: np.ndarray) -> tuple[float, np.ndarray, np.ndarray, Warp, dict]:
    """Z-Anatomy (its frame) onto the CT (scanner RAS): the best similarity over a few starting rotations, then the
    non-rigid warp. Returns s, R, t, the warp (in scanner RAS, applied after the similarity) and a report."""
    z = zanatomy_points(ex, FIT_BONES)
    zs = z[:: max(1, len(z) // 20000)]
    t0 = ct_pts.mean(0) - zs.mean(0)
    best = None
    for ax, deg in [(0, 0), (0, 15), (0, -15), (2, 15), (2, -15), (1, 10), (1, -10), (0, 30), (0, -30)]:
        R0 = rot(ax, deg)
        t_ = ct_pts.mean(0) - zs.mean(0) @ R0.T
        s, R, t, med = icp_similarity(zs, ct_pts, 40, 1.0, R0, t_)
        if best is None or med < best[3]:
            best = (s, R, t, med)
    s, R, t, med = best
    lin = s * z @ R.T + t
    warp = nonrigid(lin[:: max(1, len(lin) // 40000)], ct_pts)
    d0, _ = cKDTree(ct_pts).query(lin)
    d1, _ = cKDTree(ct_pts).query(warp(lin))
    rep = {"scale": round(s, 3), "similarityMedianMm": round(float(np.median(d0)), 2), "similarityP90Mm": round(float(np.percentile(d0, 90)), 2),
           "warpedMedianMm": round(float(np.median(d1)), 2), "warpedP90Mm": round(float(np.percentile(d1, 90)), 2)}
    return s, R, t, warp, rep


# TopBrain CTA labels: (name, side, kind); the names follow the first model's where it has the vessel
TOPBRAIN = {
    1: ("Basilar artery", None, "artery"), 2: ("Posterior cerebral artery (P1–P2)", "R", "artery"),
    3: ("Posterior cerebral artery (P1–P2)", "L", "artery"), 4: ("Internal carotid artery", "R", "artery"),
    5: ("Middle cerebral artery (M1 segment)", "R", "artery"), 6: ("Internal carotid artery", "L", "artery"),
    7: ("Middle cerebral artery (M1 segment)", "L", "artery"), 8: ("Posterior communicating artery", "R", "artery"),
    9: ("Posterior communicating artery", "L", "artery"), 10: ("Anterior communicating artery", None, "artery"),
    11: ("Anterior cerebral artery (A1–A2)", "R", "artery"), 12: ("Anterior cerebral artery (A1–A2)", "L", "artery"),
    13: ("Anterior cerebral artery (A3)", "R", "artery"), 14: ("Anterior cerebral artery (A3)", "L", "artery"),
    15: ("Third anterior cerebral artery (A2)", None, "artery"), 16: ("Third anterior cerebral artery (A3)", None, "artery"),
    17: ("Middle cerebral artery (M2 segment)", "R", "artery"), 18: ("Middle cerebral artery (M3 segment)", "R", "artery"),
    19: ("Middle cerebral artery (M2 segment)", "L", "artery"), 20: ("Middle cerebral artery (M3 segment)", "L", "artery"),
    21: ("Posterior cerebral artery (P3–P4)", "R", "artery"), 22: ("Posterior cerebral artery (P3–P4)", "L", "artery"),
    23: ("Vertebral artery", "R", "artery"), 24: ("Vertebral artery", "L", "artery"),
    25: ("Superior cerebellar artery", "R", "artery"), 26: ("Superior cerebellar artery", "L", "artery"),
    27: ("Anterior inferior cerebellar artery", "R", "artery"), 28: ("Anterior inferior cerebellar artery", "L", "artery"),
    29: ("Posterior inferior cerebellar artery", "R", "artery"), 30: ("Posterior inferior cerebellar artery", "L", "artery"),
    31: ("Anterior choroidal artery", "R", "artery"), 32: ("Anterior choroidal artery", "L", "artery"),
    33: ("Ophthalmic artery", "R", "artery"), 34: ("Ophthalmic artery", "L", "artery"),
    35: ("Great cerebral vein (of Galen)", None, "vein"), 36: ("Straight sinus", None, "vein"),
    37: ("Internal cerebral veins", None, "vein"), 38: ("Basal vein (of Rosenthal)", "R", "vein"),
    39: ("Basal vein (of Rosenthal)", "L", "vein"), 40: ("Superior sagittal sinus", None, "vein"),
}
# Z-Anatomy vessels kept (fitted) because TopBrain does not label them
Z_ARTERIES = {"Middle meningeal artery", "Accessory branch of middle meningeal artery", "Anterior ethmoidal artery",
              "Posterior ethmoidal artery", "Maxillary artery", "Posterior septal branches of sphenopalatine artery",
              "Posterior lateral nasal branches of sphenopalatine artery", "Artery of pterygoid canal", "Anterior spinal artery",
              "Medial pontine branches of basilar artery", "Lateral pontine branches of basilar artery",
              "Proximal lateral striate branches", "Distal lateral striate branches"}
Z_VEINS_REPLACED = {"Superior sagittal sinus", "Straight sinus"}
BONE_FACES = 640_000   # the CT bone surface, all bones together, after decimation (the sinus walls add surface)
# the bones drawn: the cranial bones (the scan cuts the face off in front, so its bones would be fragments)
CRANIAL = {"Frontal bone", "Parietal bone.l", "Parietal bone.r", "Occipital bone", "Temporal bone.l", "Temporal bone.r",
           "Sphenoid bone", "Ethmoid bone"}
AO_SIGMA_MM, AO_OFFSET_MM, AO_OPEN, AO_SHUT = 2.0, 1.0, 0.35, 0.80


def base_name(n: str) -> str:
    import re
    return re.sub(r"\.[lr]$", "", n).rstrip(".")


def main() -> int:
    import re
    import trimesh
    BUILD.mkdir(parents=True, exist_ok=True)
    ex = json.loads(ZEXPORT.read_text())
    b, plain, a, lab = ct_bone()
    pts = surface_points(plain, a)
    s, R, t, warp, rep = fit(ex, pts)
    print("fit", rep)
    zmap = lambda q: warp(s * np.asarray(q, float) @ R.T + t)  # noqa: E731  Z-Anatomy frame -> scanner RAS
    # the frame: the CT moved rigidly into the Z-Anatomy frame (R inverse), origin at the fitted fossa
    fossa_z = np.array(next(lm["ras"] for lm in ex["landmarks"] if lm["name"] == "Hypophysial fossa"))
    fossa_ct = zmap(fossa_z[None])[0]
    to_frame = lambda q: (np.asarray(q, float) - fossa_ct) @ R  # noqa: E731  scanner RAS -> output frame (R^T applied)
    zz = lambda q: to_frame(zmap(q))  # noqa: E731
    out = {"origin": {"pin": "Hypophysial fossa (fitted)", "note": "mm, the CT moved rigidly into the Z-Anatomy frame, origin at the fitted hypophysial fossa"},
           "box": ex["box"], "bones": {}, "soft": {}, "lines": {}, "meshes": {}, "landmarks": [], "texts": dict(ex["texts"]),
           "fit": rep, "case": CASE}

    # ---- bones: the CT surface, split by the nearest fitted Z-Anatomy bone
    a_f = a.copy()
    a_f[:3, :3] = R.T @ a[:3, :3]
    a_f[:3, 3] = (a[:3, 3] - fossa_ct) @ R
    mesh = isosurface(b, a_f, SURFACE_LEVEL, 0.6, BONE_FACES)
    V, F = np.asarray(mesh.vertices), np.asarray(mesh.faces)
    znames = [n for n in ex["bones"] if not n.startswith("Sinus of")]
    zp, zl = [], []
    for k, n in enumerate(znames):
        v = np.array(ex["bones"][n]["verts"])[::2]
        zp.append(zz(v)); zl.append(np.full(len(v), k))
    zp, zl = np.vstack(zp), np.concatenate(zl)
    dist, j = cKDTree(zp).query(V)
    vlab = zl[j]
    flab = np.array([np.bincount(r, minlength=len(znames)).argmax() for r in vlab[F]])
    # ambient occlusion: the share of bone around each vertex, sampled out along its normal
    occ = ndimage.gaussian_filter((b > 0.5).astype(np.float32), AO_SIGMA_MM / GRID_MM)
    inv = np.linalg.inv(a_f)
    q = nib.affines.apply_affine(inv, V + AO_OFFSET_MM * np.asarray(mesh.vertex_normals)).T
    around = ndimage.map_coordinates(occ, q, order=1, mode="nearest")
    ao = np.clip((AO_SHUT - around) / (AO_SHUT - AO_OPEN), 0, 1)
    for k, n in enumerate(znames):
        sel = F[flab == k]
        if n not in CRANIAL or len(sel) < 50:
            continue
        used, inv_i = np.unique(sel, return_inverse=True)
        out["bones"][n] = {"verts": V[used].round(3).tolist(), "tris": inv_i.reshape(-1, 3).tolist(), "ao": ao[used].round(3).tolist()}
    print("bones", {n: len(v["tris"]) for n, v in out["bones"].items()})

    # ---- TopBrain vessels: the surface of each label (on a 0.3 mm grid)
    ct_img = nib.load(LABELS)
    lab_full = np.asanyarray(ct_img.dataobj).astype(np.uint8)
    for k, (name, side, kind) in TOPBRAIN.items():
        m = lab_full == k
        if m.sum() < 30:
            continue
        idx = np.argwhere(m)
        lo, hi = np.maximum(idx.min(0) - 4, 0), np.minimum(idx.max(0) + 5, m.shape)
        cr = tuple(slice(x, y) for x, y in zip(lo, hi))
        aff = ct_img.affine.copy()
        aff[:3, 3] = nib.affines.apply_affine(ct_img.affine, lo)
        sub, aff2 = resample(m[cr].astype(np.float32), aff, 0.3, 1)
        aff3 = aff2.copy()
        aff3[:3, :3] = R.T @ aff2[:3, :3]
        aff3[:3, 3] = (aff2[:3, 3] - fossa_ct) @ R
        vm = isosurface(sub, aff3, 0.5, 1.0, 12000, min_area_frac=0.002)
        key = name + ({"L": ".l", "R": ".r"}[side] if side else "")
        out["meshes"][key] = {"kind": kind, "verts": np.asarray(vm.vertices).round(3).tolist(), "tris": np.asarray(vm.faces).tolist(),
                              "label": k}
    print("vessels", len(out["meshes"]))

    # ---- Z-Anatomy parts carried over by the fit: nerves, the vessels TopBrain lacks, soft tissue, landmarks
    for n, ln in ex["lines"].items():
        bn = base_name(n)
        if ln["kind"] == "artery" and bn not in Z_ARTERIES:
            continue
        if ln["kind"] == "vein" and bn in Z_VEINS_REPLACED:
            continue
        runs = []
        for r in ln["runs"]:
            r = np.array(r, float)
            runs.append(np.hstack([zz(r[:, :3]), r[:, 3:4] * s]).round(3).tolist())
        out["lines"][n] = {**ln, "runs": runs, "fitted": True}
    for n, sm in ex["soft"].items():
        out["soft"][n] = {"verts": zz(np.array(sm["verts"])).round(3).tolist(), "tris": sm["tris"], "fitted": True}
    bone_pts = {n: np.array(v["verts"]) for n, v in out["bones"].items()}
    trees = {n: cKDTree(p_) for n, p_ in bone_pts.items()}
    allb = cKDTree(np.vstack(list(bone_pts.values())))
    for lm in ex["landmarks"]:
        p_ = zz(np.array([lm["ras"]]))[0]
        own = lm["bone"] if lm["bone"] in trees else next((k for k in trees if base_name(k) == lm["bone"] and
                                                            (k.endswith(".l") == (p_[0] < 0))), None)
        if lm["distanceToBoneMm"] <= 0.5 and own:
            d_, i_ = trees[own].query(p_)
            if d_ <= 4.0:   # a point on its bone: onto that bone's surface here
                p_ = bone_pts[own][i_]
        d_all, _ = allb.query(p_)
        out["landmarks"].append({**lm, "ras": [round(float(x), 3) for x in p_], "distanceToBoneMm": round(float(d_all), 1),
                                 "pinEnds": [], "fitted": True})
    out["landmarks"] = [lm for lm in out["landmarks"]]
    # the fossa is the origin (its fitted position, not snapped)
    for lm in out["landmarks"]:
        if lm["name"] == "Hypophysial fossa":
            lm["ras"] = [0.0, 0.0, 0.0]
    for k, (name, side, kind) in TOPBRAIN.items():
        out["texts"].setdefault(name, None)
    (BUILD / "export.json").write_text(json.dumps(out))
    print("export:", len(out["bones"]), "bones,", len(out["meshes"]), "vessel meshes,", len(out["lines"]), "lines,",
          len(out["soft"]), "soft,", len(out["landmarks"]), "landmarks")
    return 0


if __name__ == "__main__" and sys.argv[1:] == ["fit"]:
    ex = json.loads(ZEXPORT.read_text())
    _, plain, a, _ = ct_bone()
    pts = surface_points(plain, a)
    s, R, t, warp, rep = fit(ex, pts)
    print(rep)
    np.savez(BUILD / "fit.npz", s=s, R=R, t=t)
elif __name__ == "__main__":
    sys.exit(main())
