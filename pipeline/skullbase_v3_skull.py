"""Skull base v3: the skull completed beyond the CT's field of view. TopBrain's CT angiogram is a box around the head
that cuts off the front of the face, the lower maxillae and part of the vault, and v2 draws only the cranial bones in it.
Here every bone of the Z-Anatomy model is drawn: the CT's own bone wherever the scan reaches, and beyond it the Z-Anatomy
model fitted onto this CT, joined so that the seam does not show.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_skull.py      (before skullbase_v3_approach.py)

How:
  1. The Z-Anatomy model is fitted onto the CT's bone as v2 fits it (skullbase_ct.fit: a similarity by ICP, then a smooth
     non-rigid warp), and carried into v2's frame.
  2. Its face is fitted again on its own: the whole-skull fit scales the model to the cranium, and this patient's face
     is larger than the model's would then be. The model's facial bones (FACE_BONES), where they lie in the scan, are
     fitted onto the CT's bone there by an affine map held close to a rotation (trimmed ICP, FACE_PAIR_MM, the ridge
     FACE_RIDGE), and that correction is spread smoothly (Gaussian, FACE_SIGMA_MM) from the face onto the rest, fading
     with distance, so the face continues past the scan's edge where the CT's face does.
     Near the scan's edge it is then fitted again, more finely: its points within EDGE_FIT_MM inside the edge are drawn onto
     the CT's bone surface there (skullbase_ct.nonrigid at EDGE_SIGMAS, pairs within EDGE_NEAR_MM), and that local
     correction carries on, fading, past the edge. So where the scan stops, the model continues the CT's own surface.
  3. The bones are rasterised on the CT's 0.5 mm grid, extended to hold them, with a soft edge like the CT's mask (each
     voxel near a bone's surface occupied by 0.5 minus its signed distance to it), so the model's part shows no grid
     steps (solid where the mesh is closed, a SHELL_MM shell where it is not).
  4. One bone field on that grid: the CT's bone mask inside the scan, the fitted model outside it, the CT giving way to
     the model over the last BLEND_MM inside the edge. The face (FACE_BONES) is the fitted model throughout, in the scan
     too: this CT resolves the thin facial bones (the orbital floors, the walls of the maxillary sinuses) only as beads,
     and its rule-drawn sinus walls as one-voxel shells, which mesh as a terraced sheet. Every voxel goes to the face or
     the cranium by the nearest bone of the fitted model, and the two are blended across that boundary (the sutures)
     over SEAM_MM. Its surface is taken exactly as v2 takes the CT's (level,
     smoothing, face density, baked shading), so the CT's part and the model's part are one surface.
     v2's bone mask is hard voxels (its rule-drawn bone, the walls around enclosed air and the plates closing the orbital
     roofs, one-voxel shells), which mesh as terraces where a surface runs gently sloping across the grid (the forehead,
     the front wall of the frontal sinus under the brow). Here it is softened: the CT's bone by a Gaussian of CT_SOFT_MM
     rescaled by CT_GAIN, the rule-drawn bone by WALL_SOFT_MM and WALL_GAIN, so a plate one voxel thick keeps its surface
     and thick bone moves by about a tenth of a millimetre. On the skull's outer surface (within OUTER_MM of the head's
     bone envelope, its holes closed over ENVELOPE_MM) the rule-drawn walls are not this patient's surface but ridges and
     a shelf over the frontal sinus: there, and within PATCH_REACH_MM of them, the fitted model stands in for the CT,
     blended in over PATCH_MM.
  5. That surface is split into bones by the nearest bone of the fitted model (as v2 splits the CT's).
It also carries Z-Anatomy vessels v2 leaves out (FITTED_LINES: the anterior inferior cerebellar arteries, which TopBrain
labels in other cases but not in this one, and the superior cerebellar arteries, of which it labels only the first
centimetre) into the frame by the same fit: each point moved as the model's bone around it
moved (a Gaussian-weighted mean of the bone's displacements within LINE_SIGMA_MM; these vessels run within a few
centimetres of the petrous bone and the clivus).
Writes pipeline/data/build/skullbase-v3/skull.json (bones {name: verts, tris, ao}, each bone's share beyond the scan,
the fitted lines {name: {runs}} as v2's export has them, the fit report) and skull_bone.npz (the bone field and its affine, in v2's frame: skullbase_v3_approach.py cuts its
craniotomies out of it).
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_ct as K  # noqa: E402
from build import isosurface  # noqa: E402

CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
ZEXPORT = ROOT / "data" / "build" / "skullbase" / "export.json"
BUILD = ROOT / "data" / "build" / "skullbase-v3"
STEP = K.GRID_MM
EDGE_FIT_MM = 25.0          # the model is fitted again onto the CT's bone within this inside the scan's edge ...
EDGE_NEAR_MM = 4.0          # ... each of its points paired with CT bone within this ...
EDGE_SIGMAS = (12.0, 7.0, 4.0)   # ... at these scales (mm), the correction fading past the edge over about three times them
EDGE_SKIP_MM = 1.0          # (the CT's surface this close to the edge is the scan's cut, not bone surface)
FACE_BONES = ("Maxilla", "Zygomatic bone", "Nasal bone", "Lacrimal bone", "Palatine bone", "Vomer", "Inferior nasal concha bone")
FACE_PAIR_MM = (10.0, 7.0, 5.0, 4.0)   # the face's ICP: pairs within these (mm), coarse to fine, 10 rounds each
FACE_RIDGE = 0.2            # ... its linear part held towards a rotation by this share of the points' spread
FACE_SIGMA_MM = 20.0        # ... and spread from the face with a Gaussian this wide
SEAM_MM = 1.5               # the face's model and the cranium's CT blended across the sutures with a Gaussian this wide
CT_SOFT_MM = 0.5            # the CT's bone softened by a Gaussian this wide ...
CT_GAIN = 1.4               # ... and rescaled by this (a one-voxel plate still reaches the surface level)
WALL_SOFT_MM = 0.75         # the CT's rule-drawn walls and plates softened by a Gaussian this wide ...
WALL_GAIN = 2.0             # ... and rescaled by this (a 1 mm wall peaks near 1 again)
OUTER_MM = 3.0              # the rule-drawn walls this close to the skull's outer surface are replaced by the model ...
ENVELOPE_MM = 20.0          # ... the surface taken from the bone with gaps up to twice this closed (the orbits, the nose) ...
PATCH_REACH_MM = 5.0        # ... and in this much around them (the CT's beads of thin bone next to them go too) ...
PATCH_MM = 2.0              # ... blended in with a Gaussian this wide
BLEND_MM = 6.0              # the CT gives way to the model over this, inside the edge
PAD_MM = 6.0                # the grid is extended this far beyond the fitted model
SHELL_MM = 1.0              # a bone mesh that is not closed is drawn as a shell this thick
FACES = 720_000             # the whole skull's surface after decimation (v2: 640,000 for the cranial bones in the scan)
SINUSES = ("Sinus of frontal bone", "Sinus of sphenoid bone")
FITTED_LINES = ["Anterior inferior cerebellar artery.r", "Anterior inferior cerebellar artery.l",
                "Superior cerebellar artery.r", "Superior cerebellar artery.l"]
LINE_SIGMA_MM = 8.0         # a line point moves as the model's bone within about twice this moved


def frame_affine(a: np.ndarray, R: np.ndarray, fossa: np.ndarray) -> np.ndarray:
    """A scanner-RAS grid affine carried into v2's frame (a point p is at (p - fossa) @ R there)."""
    f = a.copy()
    f[:3, :3] = R.T @ a[:3, :3]
    f[:3, 3] = (a[:3, 3] - fossa) @ R
    return f


def edge_distance(shape: tuple, ijk: np.ndarray) -> np.ndarray:
    """Distance (mm) of grid points (indices on the CT's grid) to the scan's edge: positive inside, negative outside."""
    n = np.array(shape) - 1
    d = np.minimum(ijk, n - ijk).min(1)
    return d * STEP


def edge_grid(shape: tuple) -> np.ndarray:
    """edge_distance for every point of a grid of that shape (mm, float32), from three 1-D distances."""
    d = [np.minimum(np.arange(n), n - 1 - np.arange(n)).astype(np.float32) * STEP for n in shape]
    return np.minimum(np.minimum(d[0][:, None, None], d[1][None, :, None]), d[2][None, None, :])


def outer_zone(bone: np.ndarray, cavity: np.ndarray) -> np.ndarray:
    """The voxels within OUTER_MM inside the skull's outer surface: the envelope of the bone and the cranial cavity
    (closed over ENVELOPE_MM, which shuts the orbits and the nose, then filled) near the outside: the cavity and the
    sinuses are inside it."""
    r = ENVELOPE_MM / STEP
    closed = ndimage.distance_transform_edt(ndimage.distance_transform_edt(~(bone | cavity)) <= r) > r   # dilated, eroded by r
    env = ndimage.binary_fill_holes(closed | bone | cavity)
    return env & (ndimage.distance_transform_edt(env) <= OUTER_MM / STEP)


def params_hash() -> str:
    """The whole-skull fit's inputs (it depends on nothing set here)."""
    h = hashlib.sha1()
    for p in (CT_BUILD / "bone.npz", CT_BUILD / "frame.npz", ZEXPORT, ROOT / "skullbase_ct.py"):
        h.update(hashlib.sha1(p.read_bytes()).digest())
    return h.hexdigest()[:16]


def fitted_model(ex: dict, p: np.ndarray, a: np.ndarray, R: np.ndarray, fossa: np.ndarray) -> tuple[dict, dict]:
    """Step 1: every Z-Anatomy bone fitted onto the CT (v2's fit), in v2's frame. Cached by its inputs."""
    cache = BUILD / f"skull_fit_{params_hash()}.npz"
    if cache.exists():
        c = np.load(cache, allow_pickle=False)
        return {n: c[f"v_{i}"] for i, n in enumerate(json.loads(str(c["names"])))}, json.loads(str(c["report"]))
    s, Rz, t, warp, rep = K.fit(ex, K.surface_points(p, a))
    out = {}
    for n, b in ex["bones"].items():
        v = np.array(b["verts"], float)
        out[n] = (warp(s * v @ Rz.T + t) - fossa) @ R
    names = list(out)
    np.savez(cache, names=json.dumps(names), report=json.dumps(rep), **{f"v_{i}": out[n] for i, n in enumerate(names)})
    return out, rep


def carry_lines(ex: dict, model: dict) -> dict:
    """FITTED_LINES carried by the fit (the model's bone vertices before and after it: their displacement, interpolated)."""
    src = np.vstack([np.array(ex["bones"][n]["verts"], float) for n in model if n in ex["bones"]])
    dst = np.vstack([model[n] for n in model if n in ex["bones"]])
    sub = slice(None, None, max(1, len(src) // 60000))
    src, disp = src[sub], (dst - np.vstack([np.array(ex["bones"][n]["verts"], float) for n in model if n in ex["bones"]]))[sub]
    out = {}
    for name in FITTED_LINES:
        runs = []
        for r in ex["lines"][name]["runs"]:
            R = np.array(r, float)
            num, wsum = K.gauss(R[:, :3], src, disp, LINE_SIGMA_MM)
            runs.append(np.c_[R[:, :3] + num / np.maximum(wsum, 1e-9)[:, None], R[:, 3:]].round(3).tolist())
        out[name] = {"kind": ex["lines"][name].get("kind"), "runs": runs, "fitted": True}
    return out


def is_face(name: str) -> bool:
    return name.rsplit(".", 1)[0] in FACE_BONES if name.endswith((".l", ".r")) else name in FACE_BONES


def fit_face(model: dict, names: list, ct_pts: np.ndarray, inside) -> tuple:
    """Step 2: the model's face fitted onto the CT's: an affine map (ridge towards a rotation) by trimmed ICP, spread as a
    smooth displacement (a Warp level). Pairs both ways: each point of the CT's facial bone with the nearest point of the
    model's face (wherever that lies: the CT's face reaching the scan's edge pulls the model's face out past it), and each
    point of the model's face that lies in the scan with the nearest CT bone. Fitting only the model's points in the scan
    would pull the face into it, where more of them find bone. Returns (warp, report)."""
    X = np.vstack([model[n] for n in names if is_face(n)])
    X = X[:: max(1, len(X) // 20000)]
    allz = np.vstack([model[n] for n in names])
    lab = np.concatenate([np.full(len(model[n]), is_face(n)) for n in names])
    _, j = cKDTree(allz).query(ct_pts)
    C = ct_pts[lab[j] & (cKDTree(X).query(ct_pts)[0] < FACE_PAIR_MM[0] * 2)]     # the CT's facial bone
    C = C[:: max(1, len(C) // 20000)]
    ct_tree = cKDTree(C)
    A, t = np.eye(3), np.zeros(3)

    def residual(A, t):
        Y = X @ A.T + t
        d1 = cKDTree(Y).query(C)[0]
        d2 = ct_tree.query(Y[inside(Y)])[0]
        return np.r_[d1, d2]
    r0 = residual(A, t)
    for pair in FACE_PAIR_MM:
        for _ in range(10):
            Y = X @ A.T + t
            d1, j1 = cKDTree(Y).query(C)
            ok = inside(Y)
            d2, j2 = ct_tree.query(Y[ok])
            src = np.vstack([X[j1[d1 < pair]], X[ok][d2 < pair]])
            dst = np.vstack([C[d1 < pair], C[j2[d2 < pair]]])
            mx, my = src.mean(0), dst.mean(0)
            Xc, Yc = src - mx, dst - my
            lam = FACE_RIDGE * (Xc ** 2).sum() / 3
            U, _, Vt = np.linalg.svd(A)       # the linear part held towards its nearest rotation (Procrustes) by the ridge
            Rn = U @ Vt
            A = np.linalg.solve(Xc.T @ Xc + lam * np.eye(3), Xc.T @ Yc + lam * Rn.T).T
            t = my - mx @ A.T
    r1 = residual(A, t)
    warp = K.Warp()
    cell = np.floor(X / (FACE_SIGMA_MM / 3)).astype(np.int64)
    _, first = np.unique(cell, axis=0, return_index=True)
    ctrl = X[np.sort(first)]
    warp.levels.append((ctrl, ctrl @ A.T + t - ctrl, FACE_SIGMA_MM))
    lim = FACE_PAIR_MM[-1]
    rep = {"ctPoints": int(len(C)), "medianBeforeMm": round(float(np.median(r0[r0 < lim])), 2), "withinBefore": round(float(np.mean(r0 < lim)), 3),
           "medianAfterMm": round(float(np.median(r1[r1 < lim])), 2), "withinAfter": round(float(np.mean(r1 < lim)), 3),
           "scales": [round(float(x), 3) for x in np.linalg.svd(A, compute_uv=False)],
           "shiftMm": [round(float(x), 1) for x in (X @ A.T + t - X).mean(0)]}
    return warp, rep


def rasterise(V: np.ndarray, T: np.ndarray, inv: np.ndarray, shape: tuple) -> tuple[np.ndarray, tuple]:
    """A bone mesh as an occupancy (0..1) on the grid, with a soft edge like the CT's mask (whose bone is partial volume),
    not the grid's steps: each voxel near the surface is occupied by 0.5 minus its signed distance to the surface (in
    voxels; the sign from the face's normal), clipped; voxels further inside are 1. A closed mesh is solid (filled); an
    open one a shell SHELL_MM thick around its surface. Returns the occupancy in the mesh's own box of the grid and that
    box (slices)."""
    ijk = nib.affines.apply_affine(inv, V)
    lo = np.maximum(np.floor(ijk.min(0)).astype(int) - 4, 0)
    hi = np.minimum(np.ceil(ijk.max(0)).astype(int) + 5, shape)
    box = tuple(slice(x, y) for x, y in zip(lo, hi))
    tri = ijk[T] - lo
    fn = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-12)
    # the surface sampled at a third of a voxel, each point with its face's normal
    edge = np.linalg.norm(tri - np.roll(tri, 1, axis=1), axis=2).max(1)
    k = np.maximum(1, np.ceil(edge * 3).astype(int))
    pts, nrm = [], []
    for n in np.unique(k):
        sel = np.nonzero(k == n)[0]
        u, w = np.meshgrid(np.arange(n + 1), np.arange(n + 1), indexing="ij")
        ok = u + w <= n
        bc = np.c_[u[ok], w[ok]] / n
        t3 = tri[sel]
        q = t3[:, None, 0] + bc[None, :, :1] * (t3[:, None, 1] - t3[:, None, 0]) + bc[None, :, 1:] * (t3[:, None, 2] - t3[:, None, 0])
        pts.append(q.reshape(-1, 3))
        nrm.append(np.repeat(fn[sel], len(bc), axis=0))
    pts, nrm = np.vstack(pts), np.vstack(nrm)
    m = np.zeros(hi - lo, bool)
    q = np.rint(pts).astype(int)
    q = q[((q >= 0) & (q < m.shape)).all(1)]
    m[tuple(q.T)] = True
    import trimesh
    closed = trimesh.Trimesh(V, T, process=True).is_watertight     # (duplicate vertices merged first)
    near = ndimage.binary_dilation(m, iterations=3 if closed else 3 + int(np.ceil(SHELL_MM / STEP)))
    idx = np.argwhere(near)
    d, j = cKDTree(pts).query(idx)
    sd = ((idx - pts[j]) * nrm[j]).sum(1)                   # signed distance, voxels (positive outside)
    sd = np.where(d > 1.5, np.sign(sd) * d, sd)             # far from the nearest sample: its distance, with the side
    occ = np.zeros(m.shape, np.float32)
    if closed:
        # filled from a surface thickened by a voxel, so small gaps between samples do not let the filling leak (the
        # surface's own voxels take the soft edge below)
        occ[ndimage.binary_fill_holes(ndimage.binary_closing(ndimage.binary_dilation(m), iterations=2))] = 1.0
        occ[tuple(idx.T)] = np.clip(0.5 - sd, 0, 1)
    else:
        half = SHELL_MM / STEP / 2
        occ[tuple(idx.T)] = np.clip(0.5 + half - np.abs(sd), 0, 1)
    return occ, box


def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)
    ex = json.loads(ZEXPORT.read_text())
    c = np.load(CT_BUILD / "bone.npz")
    b, p, a = c["b"].astype(np.float32), c["p"].astype(np.float32), c["a"]
    # the CT's rule-drawn bone (walls around enclosed air, the orbital roofs' plates) softened; its own bone as it is
    walls = (b > 0.5) & (p < 0.5)
    b = np.maximum(np.clip(ndimage.gaussian_filter(p, CT_SOFT_MM / STEP) * CT_GAIN, 0, 1),
                   np.clip(ndimage.gaussian_filter(walls.astype(np.float32), WALL_SOFT_MM / STEP) * WALL_GAIN, 0, 1))
    fr = np.load(CT_BUILD / "frame.npz")
    R, fossa = fr["R"], fr["fossa"]
    a_f = frame_affine(a, R, fossa)
    inv_f = np.linalg.inv(a_f)
    model, fit_rep = fitted_model(ex, p, a, R, fossa)
    model0 = dict(model)                        # (the whole-skull fit, for the lines it carries)
    print("fit", fit_rep)
    names = [n for n in model if n not in SINUSES]

    # ---- 2. the face fitted again on its own, then the whole model near the scan's edge, onto the CT's bone there
    edge = ndimage.binary_erosion(b > 0.5) ^ (b > 0.5)
    e_idx = np.argwhere(edge)
    e_d = edge_distance(b.shape, e_idx)
    pe = ndimage.binary_erosion(p > 0.5) ^ (p > 0.5)       # the face fit: the CT's bone without the sinus walls (as v2's fit)
    pe_idx = np.argwhere(pe)
    face_pts = nib.affines.apply_affine(a_f, pe_idx[edge_distance(b.shape, pe_idx) > EDGE_SKIP_MM].astype(float))
    inside = lambda P: edge_distance(b.shape, nib.affines.apply_affine(inv_f, P)) > EDGE_SKIP_MM   # noqa: E731
    fwarp, face_rep = fit_face(model, names, face_pts, inside)
    print("face fit", face_rep)
    model = {n: fwarp(v) for n, v in model.items()}
    ct_pts = nib.affines.apply_affine(a_f, e_idx[(e_d > EDGE_SKIP_MM) & (e_d < EDGE_FIT_MM + EDGE_NEAR_MM)].astype(float))
    allv = np.vstack([model[n] for n in names])
    d_in = edge_distance(b.shape, nib.affines.apply_affine(inv_f, allv))
    band = allv[(d_in > EDGE_SKIP_MM) & (d_in < EDGE_FIT_MM)]
    before = cKDTree(ct_pts).query(band)[0]
    warp = K.nonrigid(band[:: max(1, len(band) // 30000)], ct_pts, sigmas=EDGE_SIGMAS, steps=6, max_d=EDGE_NEAR_MM)
    tuned = {n: warp(model[n]) for n in model}
    after = cKDTree(ct_pts).query(warp(band))[0]
    near_b, near_a = before[before < EDGE_NEAR_MM], after[before < EDGE_NEAR_MM]
    edge_rep = {"bandPoints": int(len(band)), "pairedShare": round(float(np.mean(before < EDGE_NEAR_MM)), 3),
                "medianBeforeMm": round(float(np.median(near_b)), 2), "medianAfterMm": round(float(np.median(near_a)), 2),
                "p90BeforeMm": round(float(np.percentile(near_b, 90)), 2), "p90AfterMm": round(float(np.percentile(near_a, 90)), 2)}
    print("edge fit", edge_rep)

    # ---- 3. the grid extended to hold the model, and the model rasterised on it
    allt = np.vstack([tuned[n] for n in names])
    ijk = nib.affines.apply_affine(inv_f, allt)
    pad = int(np.ceil(PAD_MM / STEP))
    lo = np.minimum(np.floor(ijk.min(0)).astype(int) - pad, 0)
    hi = np.maximum(np.ceil(ijk.max(0)).astype(int) + pad + 1, b.shape)
    shape = tuple(hi - lo)
    a_x = a_f.copy()
    a_x[:3, 3] = nib.affines.apply_affine(a_f, lo)
    inv_x = np.linalg.inv(a_x)
    print("grid", b.shape, "->", shape, "offset", lo)
    zocc = np.zeros(shape, np.float32)
    for n in names:
        m, box = rasterise(tuned[n], np.array(ex["bones"][n]["tris"], int), inv_x, shape)
        zocc[box] = np.maximum(zocc[box], m)
    for n in SINUSES:    # the air sinuses are not bone (the model's frontal and sphenoid bones enclose them), but a wall
        if n in tuned:   # SHELL_MM thick is kept around them
            m, box = rasterise(tuned[n], np.array(ex["bones"][n]["tris"], int), inv_x, shape)
            air = ndimage.binary_erosion(m > 0.5, iterations=int(round(SHELL_MM / STEP)))
            zocc[box] = np.where(air, 0.0, zocc[box])

    # ---- 4. one bone field: the CT inside the scan, the model beyond it, blended over BLEND_MM inside the edge
    sl = tuple(slice(-x, -x + n) for x, n in zip(lo, b.shape))
    w = np.zeros(shape, np.float32)
    inside_mm = edge_grid(b.shape)
    w[sl] = np.clip(inside_mm / BLEND_MM, 0, 1)
    # the outer surface's rule-drawn walls: the model there instead (the surface taken from the completed skull, which,
    # unlike the CT's, encloses the cranial cavity: the scan cuts the vault open)
    whole = zocc > 0.5
    whole[sl] |= b > 0.5
    outer_walls = walls & outer_zone(whole, K.cavity(whole.astype(np.float32), a_x, STEP))[sl]
    del whole, walls
    print("rule-drawn walls on the outer surface (ml)", round(float(outer_walls.sum()) * STEP ** 3 / 1000, 1))
    patch = ndimage.gaussian_filter((ndimage.distance_transform_edt(~outer_walls) * STEP <= PATCH_REACH_MM).astype(np.float32), PATCH_MM / STEP)
    del outer_walls
    w[sl] *= 1 - np.clip(patch * 2, 0, 1)
    field = (1 - w) * zocc
    field[sl] += w[sl] * b
    del w
    # the face: the model throughout, blended into the cranium's field across the sutures
    near = ndimage.binary_dilation((field > 0.05) | (zocc > 0.05), iterations=int(np.ceil(3 * SEAM_MM / STEP)))
    idx = np.argwhere(near)
    zp_all = np.vstack([tuned[n][::2] for n in names])
    zf_all = np.concatenate([np.full(len(tuned[n][::2]), is_face(n)) for n in names])
    face = np.zeros(shape, np.float32)
    for ch in np.array_split(np.arange(len(idx)), max(1, len(idx) // 2_000_000)):
        _, j = cKDTree(zp_all).query(nib.affines.apply_affine(a_x, idx[ch]))
        face[tuple(idx[ch].T)] = zf_all[j]
    del idx, near
    face = ndimage.gaussian_filter(face, SEAM_MM / STEP)
    field = face * zocc + (1 - face) * field
    beyond = np.ones(shape, bool)        # where the model contributes: beyond the scan, near its edge, and the face
    beyond[sl] = (inside_mm < BLEND_MM) | (patch > 0.25)
    del patch
    beyond |= face > 0.5
    del face

    # ---- 5. its surface, split into bones by the nearest bone of the fitted model
    mesh = isosurface(field, a_x, K.SURFACE_LEVEL, 0.6, FACES)
    V, F = np.asarray(mesh.vertices), np.asarray(mesh.faces)
    zp = np.vstack([tuned[n][::2] for n in names])
    zl = np.concatenate([np.full(len(tuned[n][::2]), k) for k, n in enumerate(names)])
    _, j = cKDTree(zp).query(V)
    flab = np.array([np.bincount(r, minlength=len(names)).argmax() for r in zl[j][F]])
    occ = ndimage.gaussian_filter((field > 0.5).astype(np.float32), K.AO_SIGMA_MM / K.GRID_MM)
    q = nib.affines.apply_affine(inv_x, V + K.AO_OFFSET_MM * np.asarray(mesh.vertex_normals)).T
    ao = np.clip((K.AO_SHUT - ndimage.map_coordinates(occ, q, order=1, mode="nearest")) / (K.AO_SHUT - K.AO_OPEN), 0, 1)
    vij = np.rint(nib.affines.apply_affine(inv_x, V)).astype(int).clip(0, np.array(shape) - 1)
    v_beyond = beyond[tuple(vij.T)]
    bones, share = {}, {}
    for k, n in enumerate(names):
        sel = F[flab == k]
        if len(sel) < 50:
            continue
        used, inv_i = np.unique(sel, return_inverse=True)
        bones[n] = {"verts": V[used].round(3).tolist(), "tris": inv_i.reshape(-1, 3).tolist(), "ao": ao[used].round(3).tolist()}
        share[n] = round(float(v_beyond[used].mean()), 3)
    print("bones", {n: (len(bones[n]["tris"]), share[n]) for n in bones})
    report = {"fit": fit_rep, "face": face_rep, "edge": edge_rep, "faceBones": list(FACE_BONES), "seamMm": SEAM_MM, "blendMm": BLEND_MM, "edgeFitMm": EDGE_FIT_MM, "edgeSigmasMm": list(EDGE_SIGMAS),
              "beyondScanShare": share, "faces": int(len(F))}
    (BUILD / "skull.json").write_text(json.dumps({"bones": bones, "lines": carry_lines(ex, model0), "report": report}))
    np.savez_compressed(BUILD / "skull_bone.npz", b=field.astype(np.float16), a=a_x)
    return 0


if __name__ == "__main__":
    sys.exit(main())
