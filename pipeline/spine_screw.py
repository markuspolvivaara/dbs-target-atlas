"""Virtual-screw data for the spine section's lumbar region: pedicle measurements, technique start positions and the
bone distance fields the browser uses to find cortical breaches.

  pipeline/.venv/bin/python -I pipeline/spine_screw.py      (after spine_build.py, whose meshes it reads)

For L1-L5 (VerSe masks with the CT, the same bone as the drawn vertebrae) and S1 (TotalSegmentator sacrum, as drawn):
  * a frame per vertebra: e_z normal to the superior endplate (plane fitted to its top surface), e_y from the canal
    centre to the body centre within that plane, e_x patient right;
  * per pedicle: the isthmus (the narrowest cross-section normal to the pedicle axis) with its width and height, the
    axis (line through the cross-section centroids), its transverse and sagittal angles, the entry point (where the axis
    leaves the dorsal bone surface) and the chord (entry to the anterior cortex);
  * technique start positions (see TECHNIQUES in src/spine/content.ts for the sources): traditional trajectory along
    the measured pedicle axis; cortical bone trajectory from the inferomedial border of the pedicle at the published
    angles; S1 tricortical parallel to the endplate with medial convergence towards the promontory apex;
  * a signed distance field of the bone (mm; 1 mm grid; int8 in 0.1 mm steps) and points on the surfaces of the
    structures at risk nearby (dural sac, roots, ganglia), together in one gzip file per level.
Writes public/assets/spine/screw_<level>.bin.gz and src/data/generated/spine-screw.json. Nothing is typed in except the
published technique angles (TECHNIQUE_ANGLES, with their sources).
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spine_build as B  # noqa: E402
import spine_geom as G  # noqa: E402

LEVELS = ["L1", "L2", "L3", "L4", "L5"]
SDF_STEP = 1.0      # mm, the shipped grid
SDF_SCALE = 0.1     # mm per int8 unit
SDF_CLAMP = 8.0     # mm: values beyond are stored as +-8 (the grades end at "more than 6 mm"); keeps the files small
CROP_MM = 12.0      # margin around the bone kept in the distance field
RISK_MARGIN = 30.0  # mm around the vertebra within which structures at risk are listed
RISK_SPACING = 1.0  # mm between the surface points of a structure at risk
STEP = 0.25         # mm, sampling of the measurement planes
# Published technique angles (degrees). Cortical bone trajectory: cranial and lateral angle per level, Matsukawa et al.
# 2013 as quoted by Zhao 2021 (also Matsukawa 2017: 25-26 deg cranial, 8-9 deg lateral at every level). S1
# tricortical: parallel to the S1 superior endplate with ~20 deg medial convergence towards the promontory apex (Koeck 2026).
CBT_ANGLES = {"L1": (26.2, 8.6), "L2": (25.5, 8.5), "L3": (26.2, 9.1), "L4": (26.0, 9.1), "L5": (25.8, 8.8)}
S1_CONVERGENCE = 20.0
S1_BELOW_ENDPLATE = 5.0  # mm: drawing choice, the S1 screw axis this far below the endplate so the screw stays under it
RISK_IDS = ["sp_dural_sac"] + [f"sp_root_{x}" for x in ("l1", "l2", "l3", "l4", "l5", "s1")] + \
    [f"sp_drg_{x}" for x in ("l1", "l2", "l3", "l4", "l5", "s1")]


class Bone:
    """One bone as a signed distance field (mm; negative inside) on its CT voxel grid, sampled trilinearly at scene
    points (RAS mm with the origin at the centre of the L5 body)."""

    def __init__(self, inside: np.ndarray, aff_scene: np.ndarray):
        vox = np.abs(np.diag(aff_scene)[:3])
        h = float(vox.mean())
        d_out = ndimage.distance_transform_edt(~inside, sampling=vox)
        d_in = ndimage.distance_transform_edt(inside, sampling=vox)
        # voxel centres: the surface lies half a voxel between an inside and an outside voxel
        self.sdf = np.where(inside, -(d_in - h / 2), d_out - h / 2).astype(np.float32)
        self.aff = aff_scene
        self.inv = np.linalg.inv(aff_scene)

    def __call__(self, pts: np.ndarray) -> np.ndarray:
        pts = np.asarray(pts, float)
        ijk = nib.affines.apply_affine(self.inv, pts.reshape(-1, 3)).T
        return ndimage.map_coordinates(self.sdf, ijk, order=1, mode="nearest").reshape(pts.shape[:-1])

    def box(self) -> tuple[np.ndarray, np.ndarray]:
        corners = np.array([[i, j, k] for i in (0, self.sdf.shape[0] - 1) for j in (0, self.sdf.shape[1] - 1)
                            for k in (0, self.sdf.shape[2] - 1)], float)
        c = nib.affines.apply_affine(self.aff, corners)
        return c.min(0), c.max(0)


def crop_of(sel: np.ndarray, vox: np.ndarray, margin_mm: float) -> tuple:
    idx = np.argwhere(sel)
    m = np.ceil(margin_mm / vox).astype(int)
    lo, hi = np.maximum(idx.min(0) - m, 0), np.minimum(idx.max(0) + m + 1, sel.shape)
    return tuple(slice(a, b) for a, b in zip(lo, hi)), lo


def largest(mask: np.ndarray) -> np.ndarray:
    lab, n = ndimage.label(mask)
    if n <= 1:
        return mask
    sizes = ndimage.sum(mask, lab, range(1, n + 1))
    return lab == (int(np.argmax(sizes)) + 1)


def endplate_normal(pts: np.ndarray, c: np.ndarray, ez0: np.ndarray, radius: float = 14.0) -> np.ndarray:
    """Normal (cranial) of the plane fitted to the top surface of a vertebral body: within `radius` mm of the axis
    through c along ez0, the highest bone point of each 2 mm column."""
    ex0 = np.cross([0, 1.0, 0], ez0)
    ex0 /= np.linalg.norm(ex0)
    ey0 = np.cross(ez0, ex0)
    rel = pts - c
    a, b, hgt = rel @ ex0, rel @ ey0, rel @ ez0
    keep = (a * a + b * b < radius * radius) & (hgt > 0)
    a, b, hgt, p = a[keep], b[keep], hgt[keep], pts[keep]
    cols = {}
    for i, key in enumerate(zip(np.floor(a / 2).astype(int), np.floor(b / 2).astype(int))):
        if key not in cols or hgt[i] > hgt[cols[key]]:
            cols[key] = i
    top = p[list(cols.values())]
    q = top - top.mean(0)
    n = np.linalg.svd(q, full_matrices=False)[2][2]
    return n if n @ ez0 > 0 else -n


def frame_of(ez: np.ndarray, ey_hint: np.ndarray) -> np.ndarray:
    ey = ey_hint - (ey_hint @ ez) * ez
    ey /= np.linalg.norm(ey)
    ex = np.cross(ey, ez)
    return np.stack([ex, ey, ez])


def section(bone: Bone, p: np.ndarray, a1: np.ndarray, a2: np.ndarray, half: float = 20.0, through_p: bool = False) -> dict | None:
    """Cross-section of the bone in the plane through p spanned by a1 (cranial) and a2: the component containing p, or
    the nearest one within 3 mm. Returns its area and centroid (3D), and its width along a2 through the centroid and
    height along a1 through the centroid (outer cortex to outer cortex, as on mid-pedicle CT slices)."""
    s = np.arange(-half, half + STEP, STEP)
    A2, A1 = np.meshgrid(s, s, indexing="ij")
    pts = p + A2[..., None] * a2 + A1[..., None] * a1
    m = bone(pts) < 0
    lab, n = ndimage.label(m)
    if not n:
        return None
    c = len(s) // 2
    k = lab[c, c]
    if not k:
        d = ndimage.distance_transform_edt(lab == 0, return_indices=True)[1]
        i, j = d[0][c, c], d[1][c, c]
        if np.hypot(i - c, j - c) * STEP > 3:
            return None
        k = lab[i, j]
    comp = lab == k
    i2, i1 = np.nonzero(comp)
    m2, m1 = (c, c) if through_p else (int(round(i2.mean())), int(round(i1.mean())))

    def run(line: np.ndarray, at: int) -> float:
        """Length of the run of True through index `at` (0 if `at` is not in the component)."""
        if not line[at]:
            return 0.0
        lo_ = at - int(np.argmin(line[at::-1])) + 1 if not line[:at + 1].all() else 0
        hi_ = at + int(np.argmin(line[at:])) - 1 if not line[at:].all() else len(line) - 1
        return float((hi_ - lo_ + 1) * STEP)
    return {"area": float(comp.sum() * STEP * STEP), "centre": p + s[i2].mean() * a2 + s[i1].mean() * a1,
            "width": run(comp[:, m1], m2), "height": run(comp[m2, :], m1),
            "touches": bool(comp[0].any() or comp[-1].any() or comp[:, 0].any() or comp[:, -1].any())}


def surface_along(bone: Bone, p: np.ndarray, d: np.ndarray, t_max: float = 80.0) -> float | None:
    """Distance from p (inside bone) along d to where the line leaves the bone for good (outside for 3 mm)."""
    ts = np.arange(0, t_max, 0.1)
    out = bone(p + ts[:, None] * d) > 0
    for i in range(len(ts)):
        if out[i] and out[i:i + 30].all():
            return float(ts[i])
    return None


def first_entry(bone: Bone, p_far: np.ndarray, d: np.ndarray, t_max: float = 120.0) -> float | None:
    """From a point outside the bone, distance along d to the first bone surface."""
    ts = np.arange(0, t_max, 0.1)
    inside = bone(p_far + ts[:, None] * d) < 0
    i = int(np.argmax(inside))
    return float(ts[i]) if inside[i] else None


def angles(d: np.ndarray, F: np.ndarray, sg: int) -> tuple[float, float]:
    """Transverse angle (medial convergence positive) and sagittal angle (cranial positive) of a direction d pointing
    into the bone, in the vertebra's frame."""
    x, y, z = d @ F[0], d @ F[1], d @ F[2]
    return float(np.degrees(np.arctan2(-sg * x, y))), float(np.degrees(np.arcsin(np.clip(z, -1, 1))))


def direction(F: np.ndarray, sg: int, medial: float, cranial: float) -> np.ndarray:
    m, c = np.radians(medial), np.radians(cranial)
    d = np.cos(c) * (np.cos(m) * F[1] - sg * np.sin(m) * F[0]) + np.sin(c) * F[2]
    return d / np.linalg.norm(d)


def isthmus_centre(bone: Bone, c: np.ndarray, F: np.ndarray, can: dict, sg: int) -> tuple[np.ndarray, float]:
    """Centre of the pedicle's isthmus on one side (sg -1 left, +1 right) and the radius of the largest sphere that passes
    through it: the bottleneck of the widest bony path from the vertebral body to the bone behind the canal, within
    that side's half of the vertebra (the pedicle is the only bony link there)."""
    sdf = bone.sdf
    ijk = np.indices(sdf.shape).reshape(3, -1).T
    rel = nib.affines.apply_affine(bone.aff, ijk) - c
    u, v = (rel @ F[0]).reshape(sdf.shape), (rel @ F[1]).reshape(sdf.shape)
    half = sg * u > 0
    v_post = (can["vMin"] + can["vMax"]) / 2 - 4  # behind the middle of the canal: pars, laminae, processes
    post = half & (v < v_post)
    seed = tuple(np.round(nib.affines.apply_affine(bone.inv, c + sg * 6 * F[0])).astype(int))  # in the body, this side

    def body_comp(r: float) -> np.ndarray | None:
        lab, _ = ndimage.label(half & (sdf < -r))
        k = lab[seed]
        return (lab == k) if k else None

    lo_r, hi_r = 0.5, 12.0
    for _ in range(14):
        mid = (lo_r + hi_r) / 2
        comp = body_comp(mid)
        if comp is not None and (comp & post).any():
            lo_r = mid
        else:
            hi_r = mid
    # the pinch: what joins the body's part to the posterior part just below the bottleneck radius but not just above it
    r_lo, r_hi = max(lo_r - 0.3, 0.1), lo_r + 0.3
    joined = body_comp(r_lo)
    lab, _ = ndimage.label(half & (sdf < -r_hi))
    k_body = lab[seed]
    k_post = np.unique(lab[post & (lab > 0)])
    apart = (lab == k_body) | np.isin(lab, k_post)
    pinch = joined & ~apart & (v < can["vMax"]) & (v >= v_post)
    pts = nib.affines.apply_affine(bone.aff, np.argwhere(pinch))
    w = -sdf[pinch]  # weighted towards the middle of the channel
    return (pts * w[:, None]).sum(0) / w.sum(), lo_r


def best_axis(bone: Bone, centre: np.ndarray, F: np.ndarray, sg: int, back: float = 14.0, ahead: float = 30.0) -> np.ndarray:
    """The widest bony channel through the isthmus centre: the direction whose segment from `back` mm behind it to
    `ahead` mm into the body keeps the largest smallest distance to the bone surface (ties, common in wide pedicles,
    go to the path with more bone around it on average)."""
    ts = np.linspace(-back, ahead, 53)

    def score(ta: float, sa: float) -> float:
        clearance = -bone(centre + ts[:, None] * direction(F, sg, ta, sa))
        return float(clearance.min() + 0.1 * clearance.mean())
    best = max(((score(ta, sa), ta, sa) for ta in np.arange(-15, 50, 2.0) for sa in np.arange(-30, 31, 2.0)))
    _, ta0, sa0 = best
    best = max(((score(ta, sa), ta, sa) for ta in np.arange(ta0 - 2, ta0 + 2.01, 0.25) for sa in np.arange(sa0 - 2, sa0 + 2.01, 0.25)))
    return direction(F, sg, best[1], best[2])


def run_span(bone: Bone, p: np.ndarray, axis: np.ndarray, half: float = 15.0) -> tuple[float, float] | None:
    """The run of bone along a line through p: its ends, as offsets from p along `axis` (None if p is not in bone)."""
    s = np.arange(-half, half + STEP / 2, STEP)
    line = bone(p + s[:, None] * axis) < 0
    c = len(s) // 2
    if not line[c]:
        return None
    lo = c - (int(np.argmin(line[c::-1])) if not line[:c + 1].all() else c + 1) + 1
    hi = c + (int(np.argmin(line[c:])) if not line[c:].all() else len(s) - c) - 1
    return float(s[lo] - STEP / 2), float(s[hi] + STEP / 2)


def run_through(bone: Bone, p: np.ndarray, axis: np.ndarray, half: float = 15.0) -> float:
    """Length of the bone along a line through p (outer surface to outer surface), 0 if p is not in bone."""
    r = run_span(bone, p, axis, half)
    return r[1] - r[0] if r else 0.0


def pedicle(bone: Bone, c: np.ndarray, F: np.ndarray, can: dict, sg: int) -> dict:
    """Measure one pedicle (sg -1 left, +1 right)."""
    centre, r = isthmus_centre(bone, c, F, can, sg)
    d = best_axis(bone, centre, F, sg)
    # cross-sections normal to the axis around the centre: the narrowest is the isthmus
    a1 = F[2] - (F[2] @ d) * d
    a1 /= np.linalg.norm(a1)
    a2 = np.cross(a1, d)
    # narrowest width (across the axis, in the endplate plane; within 6 mm of the isthmus centre, so at L5 it is found
    # clear of the transverse process) and narrowest height (along the vertebra's axis, within 3 mm), each through the
    # axis; the isthmus is where the width is least
    across = np.cross(F[2], d)
    across /= np.linalg.norm(across)
    ts = np.arange(-6, 6.25, 0.25)
    widths = np.array([run_through(bone, centre + t * d, across) for t in ts])
    heights = np.array([run_through(bone, centre + t * d, F[2]) if abs(t) <= 3 else 0.0 for t in ts])
    k = int(np.argmin(np.where(widths > 0, widths, np.inf)))
    isth = {"width": float(widths[k]), "height": float(heights[heights > 0].min()), "centre": centre + ts[k] * d}
    back = surface_along(bone, centre, -d)
    front = surface_along(bone, centre, d)
    entry = centre - back * d
    ta, sa = angles(d, F, sg)
    rel = isth["centre"] - c
    return {"width": round(isth["width"], 1), "height": round(isth["height"], 1), "transverseAngle": round(ta, 1),
            "sagittalAngle": round(sa, 1), "chord": round(back + front, 1), "inscribedRadius": round(r, 2),
            "isthmus": centre.round(2).tolist(), "isthmusUvw": [round(float(rel @ F[i]), 1) for i in range(3)],
            "entry": entry.round(2).tolist(), "dir": d.round(4).tolist()}


def promontory_screw(bone: Bone, c: np.ndarray, F: np.ndarray, sg: int, r: float) -> dict:
    """S1 tricortical start position: an axis parallel to the S1 endplate, S1_BELOW_ENDPLATE mm under it, converging
    S1_CONVERGENCE deg towards the promontory; its tip at the anterior cortex beside the midline (the two screws' tips
    r + 1 mm either side of it, a drawing choice so they do not overlap); the entry where it leaves the dorsal bone."""
    top = surface_along(bone, c, F[2])
    h = top - S1_BELOW_ENDPLATE
    p0 = c + h * F[2] + sg * (r + 1) * F[0]
    ant = surface_along(bone, p0, F[1])
    tip = p0 + ant * F[1]
    d = direction(F, sg, S1_CONVERGENCE, 0.0)
    back = surface_along(bone, tip - 1.0 * d, -d) + 1.0
    return {"entry": (tip - back * d).round(2).tolist(), "dir": d.round(4).tolist(), "chord": round(back, 1),
            "promontory": tip.round(2).tolist()}


def tt_start(bone: Bone, F: np.ndarray, ped: dict, sg: int) -> dict:
    """Traditional-trajectory start position: through the isthmus centre at the pedicle's measured transverse angle,
    parallel to the superior endplate (a choice for the start: the measured axis tilts towards the superior articular
    process, which would put the entry far behind the pedicle); the entry where it leaves the dorsal bone."""
    centre = np.array(ped["isthmus"])
    d = direction(F, sg, ped["transverseAngle"], 0.0)
    back = surface_along(bone, centre, -d)
    return {"entry": (centre - back * d).round(2).tolist(), "dir": d.round(4).tolist(), "chord": round(back + surface_along(bone, centre, d), 1)}


def cbt_start(bone: Bone, F: np.ndarray, ped: dict, sg: int, lv: str) -> dict:
    """Cortical bone trajectory start position: the entry projects (antero-posteriorly) onto the inferomedial border of
    the pedicle, the 5 o'clock (left) or 7 o'clock (right) point of the pedicle's outline seen from behind
    (Matsukawa 2017); it lies where that line first meets the dorsal bone. Direction: CBT_ANGLES."""
    centre = np.array(ped["isthmus"])
    w, h = ped["width"] / 2, ped["height"] / 2
    target = centre - sg * 0.5 * w * F[0] - np.sqrt(3) / 2 * h * F[2]  # 30 deg medial of 6 o'clock on the outline
    far = target - 60 * F[1]
    t = first_entry(bone, far, F[1])
    entry = far + t * F[1]
    cranial, lateral = CBT_ANGLES[lv]
    return {"entry": entry.round(2).tolist(), "dir": direction(F, sg, -lateral, cranial).round(4).tolist()}


def sdf_grid(bone: Bone) -> tuple[dict, np.ndarray]:
    """The bone's distance field resampled onto a grid aligned with the scene axes, quantised to int8."""
    lo, hi = bone.box()
    dims = np.floor((hi - lo) / SDF_STEP).astype(int) + 1
    g = np.stack(np.meshgrid(*[lo[i] + SDF_STEP * np.arange(dims[i]) for i in range(3)], indexing="ij"), -1)
    q = np.round(np.clip(bone(g), -SDF_CLAMP, SDF_CLAMP) / SDF_SCALE).astype(np.int8)
    # x fastest: index = i + nx * (j + ny * k)
    return ({"origin": lo.round(3).tolist(), "dims": dims.tolist(), "step": SDF_STEP, "scale": SDF_SCALE, "clamp": SDF_CLAMP},
            q.transpose(2, 1, 0).copy())


class Shipped:
    """The quantised grid as the browser sees it (trilinear, clamped at the edges): the reference for its results."""

    def __init__(self, meta: dict, q: np.ndarray):
        self.o, self.step = np.array(meta["origin"]), meta["step"]
        self.v = q.transpose(2, 1, 0).astype(np.float32) * meta["scale"]  # back to [i, j, k]

    def __call__(self, pts: np.ndarray) -> np.ndarray:
        ijk = ((np.asarray(pts, float).reshape(-1, 3) - self.o) / self.step).T
        return ndimage.map_coordinates(self.v, ijk, order=1, mode="nearest").reshape(np.shape(pts)[:-1])


def risk_points(box_lo: np.ndarray, box_hi: np.ndarray) -> list[tuple[str, np.ndarray]]:
    """Points about RISK_SPACING apart on the surfaces of the structures at risk within the box."""
    out = []
    rng = np.random.default_rng(0)
    for sid in RISK_IDS:
        f = B.BUILD / f"{sid}.glb"
        if not f.exists():
            continue
        mesh = trimesh.load(f, force="scene").to_geometry()
        cen = mesh.triangles_center
        keep = np.all((cen >= box_lo) & (cen <= box_hi), axis=1)
        if not keep.any():
            continue
        sub = mesh.submesh([np.nonzero(keep)[0]], append=True)
        n = int(min(6000, max(50, sub.area / RISK_SPACING ** 2)))
        pts, _ = trimesh.sample.sample_surface_even(sub, n, radius=RISK_SPACING * 0.7, seed=rng)
        out.append((sid, np.vstack([pts, sub.vertices])))
    return out


def seated(b: np.ndarray, ts: np.ndarray, radius: float) -> float:
    """Where the screw is first wholly inside the bone (its surface everywhere under the bone surface there); before
    that it is still entering through the dorsal cortex, which is no breach. A screw that never gets wholly inside is
    counted from two radii on."""
    inside = np.nonzero(b <= 0)[0]
    return float(ts[inside[0]]) if len(inside) else 2 * radius


def screw_result(sdf, F: np.ndarray, sg: int, entry: np.ndarray, d: np.ndarray, length: float, radius: float,
                 risks: list[tuple[str, np.ndarray]]) -> dict:
    """What the browser computes for a screw (src/spine/screw.ts): the deepest breach of the screw's surface beyond the
    bone surface by direction, its Gertzbein-Robbins grade, and the nearest structures at risk."""
    ts = np.arange(0, length + 1e-6, 0.5)
    pts = entry + ts[:, None] * d
    b = sdf(pts) + radius
    t_in = seated(b, ts, radius)
    worst = {}
    for t, p, bk in zip(ts, pts, b):
        if bk <= 0 or t < t_in:
            continue
        g = np.array([(sdf(p + 0.5 * e) - sdf(p - 0.5 * e)) for e in np.eye(3)])
        n = g / (np.linalg.norm(g) or 1)
        x, y, z = sg * (n @ F[0]), n @ F[1], n @ F[2]
        k = int(np.argmax(np.abs([x, y, z])))
        name = [("lateral", "medial"), ("anterior", "posterior"), ("superior", "inferior")][k][0 if [x, y, z][k] > 0 else 1]
        if name != "posterior":
            worst[name] = max(worst.get(name, 0.0), float(bk))
    wall = max([v for k, v in worst.items() if k != "anterior"], default=0.0)
    grade = "A" if wall <= 0 else "B" if wall <= 2 else "C" if wall <= 4 else "D" if wall <= 6 else "E"
    tip = entry + length * d
    near = []
    for sid, q in risks:
        ab = tip - entry
        tt = np.clip(((q - entry) @ ab) / (ab @ ab), 0, 1)
        dist = np.linalg.norm(q - (entry + tt[:, None] * ab), axis=1) - radius
        near.append((float(dist.min()), sid))
    near.sort()
    return {"grade": grade, "seated": t_in, "breach": {k: round(v, 2) for k, v in sorted(worst.items())},
            "nearest": [{"id": sid, "mm": round(dm, 2)} for dm, sid in near[:3]]}


DEFAULT_SIZE = {"tt": (6.5, 45.0), "cbt": (None, None), "s1": (5.5, None)}  # see TECHNIQUES in src/spine/content.ts
# Cortical bone trajectory sizes, Zhao 2021: reference diameter per level; the screw length is the trajectory length
# (until the screw would reach the cortex) rounded down to 20, 25, 30 or 35 mm
CBT_DIAMETER = {"L1": 4.0, "L2": 4.5, "L3": 5.5, "L4": 5.5, "L5": 5.5}
CBT_LENGTHS = (20.0, 25.0, 30.0, 35.0)


def trajectory_length(sdf, entry: np.ndarray, d: np.ndarray, radius: float, t_max: float = 70.0) -> float:
    """From the entry, how far the screw goes, once wholly inside the bone, before its surface would reach the bone
    surface (Zhao 2021: the tip just touching the upper endplate)."""
    ts = np.arange(0, t_max, 0.5)
    b = sdf(entry + ts[:, None] * d) + radius
    t_in = seated(b, ts, radius)
    out = np.nonzero((b > 0) & (ts > t_in))[0]
    return float(ts[out[0]]) if len(out) else t_max


def region(path: Path, cr: tuple) -> np.ndarray:
    """Read only the lumbar block of a volume, a few slices at a time: whole-volume arrays of this CT
    (512 x 512 x 1214, the CT stored as float64) are 0.3-2.5 GB each."""
    return B.read_block(path, cr)


def s1_bone(sac: np.ndarray, aff_c: np.ndarray, vox: np.ndarray, o: np.ndarray, c: np.ndarray) -> Bone:
    """The sacrum around S1 (60 mm box) as drawn: the TotalSegmentator mask smoothed and taken at 0.5."""
    ijk_c = np.floor(nib.affines.apply_affine(np.linalg.inv(aff_c), c + o)).astype(int)
    half = np.ceil(60 / vox).astype(int)
    lo = np.maximum(ijk_c - half, 0)
    hi = np.minimum(ijk_c + half + 1, sac.shape)
    cr = tuple(slice(a, b) for a, b in zip(lo, hi))
    inside = largest(ndimage.gaussian_filter(sac[cr].astype(np.float32), 1.0) > 0.5)
    a_s = aff_c.copy()
    a_s[:3, 3] = nib.affines.apply_affine(aff_c, lo) - o
    return Bone(inside, a_s)


def main() -> int:
    img = nib.load(B.MASK)
    aff = img.affine
    vox = np.abs(np.diag(aff)[:3])
    o = B.origin()
    ctd = json.loads(B.CTD.read_text())
    C_ras = {c["label"]: nib.affines.apply_affine(aff, [c["X"], c["Y"], c["Z"]]) for c in ctd if "label" in c}
    # the lumbar block: T12 to 90 mm below L5, 80 mm around the spine
    pts = np.array([C_ras[B.LABEL_OF[x]] for x in ["T12"] + LEVELS])
    lo_r = pts.min(0) - [80, 80, 90]
    hi_r = pts.max(0) + [80, 80, 30]
    ijk = nib.affines.apply_affine(np.linalg.inv(aff), np.array([[a, b, c] for a in (lo_r[0], hi_r[0]) for b in (lo_r[1], hi_r[1])
                                                                for c in (lo_r[2], hi_r[2])]))
    lo_i = np.maximum(np.floor(ijk.min(0)).astype(int), 0)
    hi_i = np.minimum(np.ceil(ijk.max(0)).astype(int) + 1, img.shape)
    block = tuple(slice(a, b) for a, b in zip(lo_i, hi_i))
    aff_c = aff.copy()
    aff_c[:3, 3] = nib.affines.apply_affine(aff, lo_i)
    m = region(B.MASK, block).astype(np.uint8)
    ct = region(B.CT, block)
    body_mask = region(B.TS / "vertebrae_body" / "vertebrae_body.nii.gz", block) > 0
    sac = (region(B.TS / "total" / "sacrum.nii.gz", block) > 0) | (region(B.TS / "total" / "vertebrae_S1.nii.gz", block) > 0)
    C = {k: v - o for k, v in C_ras.items()}
    aff = aff_c
    out, report, fails = {}, {}, []
    B.PUBLIC.joinpath("spine").mkdir(parents=True, exist_ok=True)
    for lv in LEVELS + ["S1"]:
        if lv == "S1":
            # S1 body centre: TotalSegmentator's vertebral-body component below L5 that no VerSe label covers
            l5 = C[B.LABEL_OF["L5"]]
            lab_b, nb = ndimage.label(body_mask)
            best = None
            for k in range(1, nb + 1):
                comp = lab_b == k
                if comp.sum() < 2000 or (m[comp] > 0).mean() > 0.2:
                    continue
                cen = nib.affines.apply_affine(aff, np.argwhere(comp).mean(0)) - o
                if cen[2] < l5[2] and (best is None or np.linalg.norm(cen - l5) < np.linalg.norm(best[0] - l5)):
                    best = (cen, comp)
            del lab_b
            if best is None:
                raise SystemExit("S1: no vertebral body below L5")
            c, s1_body = best
            bone = s1_bone(sac, aff, vox, o, c)
            ez0 = (l5 - c) / np.linalg.norm(l5 - c)
            ez = endplate_normal(nib.affines.apply_affine(aff, np.argwhere(s1_body)) - o, c, ez0)
        else:
            lab = B.LABEL_OF[lv]
            sel = m == lab
            cr, lo = crop_of(sel, vox, CROP_MM)
            vol = B.bone_volume(ct[cr].astype(np.float32), sel[cr], float(vox.mean()))
            inside = largest(ndimage.gaussian_filter(vol, B.SIGMA_VOX) > B.BONE_HU)
            a_s = aff.copy()
            a_s[:3, 3] = nib.affines.apply_affine(aff, lo) - o
            bone = Bone(inside, a_s)
            c = C[lab]
            up, down = C.get(lab - 1), C.get(lab + 1)
            ez0 = (up - down) if down is not None else (up - c)
            ez0 = ez0 / np.linalg.norm(ez0)
            body_pts = nib.affines.apply_affine(a_s, np.argwhere(body_mask[cr] & inside))
            ez = endplate_normal(body_pts, c, ez0)
        grid = G.Grid((bone.sdf < 0).astype(np.uint8), bone.aff)
        can0 = G.canal(grid, 1, c, frame_of(ez, np.array([0, 1.0, 0])))
        F = frame_of(ez, (c - np.array(can0["centre"])) if can0 else np.array([0, 1.0, 0]))
        can = G.canal(grid, 1, c, F) if lv != "S1" else None
        meta, q = sdf_grid(bone)
        shipped = Shipped(meta, q)
        lo_b, hi_b = bone.box()
        # stored as int16 in 0.1 mm: the reference results below use the stored points, as the browser does
        risks = [(sid, np.round(pts / 0.1).astype("<i2")) for sid, pts in risk_points(lo_b - RISK_MARGIN, hi_b + RISK_MARGIN)]
        risks_mm = [(sid, q.astype(np.float64) * 0.1) for sid, q in risks]
        lvl = {"frame": {"origin": c.round(2).tolist(), "ex": F[0].round(5).tolist(), "ey": F[1].round(5).tolist(),
                         "ez": F[2].round(5).tolist()}}
        starts = {}
        if lv == "S1":
            dia = DEFAULT_SIZE["s1"][0]
            starts["s1"] = {sd: promontory_screw(bone, c, F, sg, dia / 2) for sd, sg in (("L", -1), ("R", 1))}
        else:
            ped = {sd: pedicle(bone, c, F, can, sg) for sd, sg in (("L", -1), ("R", 1))}
            lvl["pedicle"] = ped
            starts["tt"] = {sd: tt_start(bone, F, ped[sd], sg) for sd, sg in (("L", -1), ("R", 1))}
            starts["cbt"] = {sd: cbt_start(bone, F, ped[sd], sg, lv) for sd, sg in (("L", -1), ("R", 1))}
        lvl["start"] = starts
        # what the default screws give on the shipped grid (the browser must agree: tests/unit/spine-screw.test.ts)
        checks = {}
        for tech, per in starts.items():
            for sd, sg in (("L", -1), ("R", 1)):
                st = per[sd]
                dia, length = DEFAULT_SIZE[tech]
                if tech == "cbt":
                    dia = CBT_DIAMETER[lv]
                    st["trajectory"] = trajectory_length(shipped, np.array(st["entry"]), np.array(st["dir"]), dia / 2)
                    length = max([x for x in CBT_LENGTHS if x <= st["trajectory"]], default=CBT_LENGTHS[0])
                ln = length if length else st["chord"]
                st["size"] = {"diameter": dia, "length": ln}
                checks[f"{tech}.{sd}"] = screw_result(shipped, F, sg, np.array(st["entry"]), np.array(st["dir"]), ln, dia / 2, risks_mm)
        lvl["check"] = checks
        # binary: int8 distance field, then int16 risk points (0.1 mm)
        blob = bytearray(q.tobytes())
        if len(blob) % 2:
            blob += b"\0"
        lvl["risk"] = []
        for sid, q16 in risks:
            lvl["risk"].append({"id": sid, "offset": len(blob), "count": int(len(q16))})
            blob += q16.tobytes()
        lvl["sdf"] = {**meta, "offset": 0}
        name = f"screw_{lv.lower()}.bin.gz"
        data = gzip.compress(bytes(blob), 9, mtime=0)
        (B.PUBLIC / "spine" / name).write_bytes(data)
        lvl["file"] = f"assets/spine/{name}"
        lvl["bytes"] = len(data)
        out[lv] = lvl
        report[lv] = {"pedicle": lvl.get("pedicle"), "check": checks, "bytes": len(data)}
        summary = {sd: {k: v for k, v in p.items() if k in ("width", "height", "transverseAngle", "sagittalAngle", "chord")}
                   for sd, p in lvl.get("pedicle", {}).items()}
        print(lv, f"{len(data) / 1024:.0f} KB", summary, {k: (v["grade"], v["breach"]) for k, v in checks.items()})
    fails += validate(out)
    (B.GEN / "spine-screw.json").write_text(json.dumps({"levels": out}, indent=1))
    (B.BUILD / "screw_report.json").write_text(json.dumps(report, indent=1, default=float))
    for f in fails:
        print("FAIL", f)
    print(f"spine screw: {len(out)} levels, {'all checks passed' if not fails else f'{len(fails)} failures'}")
    return 1 if fails else 0


def validate(out: dict) -> list[str]:
    """Plausibility of the measurements (wide bounds around published lumbar values) and of the start positions."""
    fails = []
    for lv, d in out.items():
        F = np.array([d["frame"]["ex"], d["frame"]["ey"], d["frame"]["ez"]])
        c = np.array(d["frame"]["origin"])
        for sd, sg in (("L", -1), ("R", 1)):
            p = d.get("pedicle", {}).get(sd)
            if p:
                if not 4 <= p["width"] <= 24:
                    fails.append(f"{lv}{sd}: pedicle width {p['width']}")
                if not 8 <= p["height"] <= 24:
                    fails.append(f"{lv}{sd}: pedicle height {p['height']}")
                if not 0 <= p["transverseAngle"] <= 40:
                    fails.append(f"{lv}{sd}: transverse angle {p['transverseAngle']}")
                if not 30 <= p["chord"] <= 90:
                    fails.append(f"{lv}{sd}: chord {p['chord']}")
            for tech, per in d["start"].items():
                e = np.array(per[sd]["entry"]) - c
                if not (e @ F[1] < -15 and sg * (e @ F[0]) > 0):
                    fails.append(f"{lv}{sd} {tech}: entry not behind the body on its own side ({(e @ F).round(1)})")
            if lv != "S1" and d["check"][f"tt.{sd}"]["grade"] not in "AB":
                fails.append(f"{lv}{sd}: the default traditional-trajectory screw breaches ({d['check'][f'tt.{sd}']})")
    return fails


if __name__ == "__main__":
    sys.exit(main())
