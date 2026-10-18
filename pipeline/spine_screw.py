"""Virtual-screw data for the spine section's lumbar and thoracic regions: pedicle measurements, technique start
positions and the bone distance fields the browser uses to find cortical breaches.

  pipeline/.venv/bin/python -I pipeline/spine_screw.py      (after spine_build.py, whose meshes it reads)

For T1-T12 and L1-L5 (VerSe masks with the CT, the same bone as the drawn vertebrae) and S1 (TotalSegmentator sacrum,
as drawn):
  * a frame per vertebra: e_z normal to the superior endplate (plane fitted to its top surface), e_y from the canal
    centre to the body centre within that plane, e_x patient right;
  * per pedicle: the isthmus (the narrowest cross-section normal to the pedicle axis) with its width and height, the
    axis (line through the cross-section centroids), its transverse and sagittal angles, the entry point (where the axis
    leaves the dorsal bone surface) and the chord (entry to the anterior cortex);
  * technique start positions (see TECHNIQUES in src/spine/content.ts for the sources): lumbar traditional trajectory
    through the isthmus at the measured transverse angle; cortical bone trajectory from the inferomedial border of the
    pedicle at the published angles; S1 tricortical parallel to the endplate with medial convergence towards the
    promontory apex; thoracic straight-forward (parallel to the superior endplate) and anatomic (along the measured
    pedicle axis) trajectories, sized from the measured pedicle width and vertebral body depth;
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

LUMBAR = ["L1", "L2", "L3", "L4", "L5"]
THORACIC = [f"T{i}" for i in range(1, 13)]
LATERAL_MASS = ["C3", "C4", "C5", "C6"]   # lateral mass screws; C7 takes a pedicle screw (small lateral mass, C8 root:
                                           # Rathinavelu 2021; Jiang 2024)
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
ROOTS = [f"c{i}" for i in range(3, 9)] + [x.lower() for x in THORACIC + LUMBAR + ["S1"]]
RISK_IDS = ["sp_dural_sac", "sp_vertebral_artery", "sp_ica_left", "sp_ica_right"] + [f"sp_root_{x}" for x in ROOTS] + [f"sp_drg_{x}" for x in ROOTS]
# Lateral mass techniques (Joaquim 2018): entry offset from the midpoint of the lateral mass (mm medial, mm cranial),
# lateral angle from the sagittal plane, and the sagittal inclination: Roy-Camille perpendicular to the lateral mass
# surface; Magerl parallel to the adjacent facet joints (20-30 deg lateral: the middle, 25); An 15 deg cephalad (taken
# from the perpendicular to the surface). Screws 3.5 mm (Rathinavelu 2021); start length: entry to where the screw
# leaves the lateral mass (bicortical), rounded down to the millimetre
LM_TECHNIQUES = {"rc": (0.0, 0.0, 10.0, "perpendicular"), "mg": (1.0, 1.0, 25.0, "facets"), "an": (1.0, 0.0, 30.0, "plus15")}
LM_DIAMETER = 3.5
C7_DIAMETER = 3.5    # Jiang 2024: 3.5 or 4.0 mm by the preoperative CT; the smaller as the start
# Thoracic start sizes, Mandelka 2023 (reviewing the literature): diameter FILL_RATIO x the pedicle's measured outer
# width (the screw diameter / pedicle width ratio with the fewest perforations, recommended for less experienced
# surgeons), rounded down to 0.5 mm and no less than MIN_DIAMETER (the tool's smallest screw); length rounded down to
# 5 mm so that the tip reaches no further than DEPTH_RATIO of the vertebral body's depth along the screw (against
# anterior perforation)
# Pedicle axis: fitted from AXIS_SPAN[0] mm behind the isthmus centre to AXIS_SPAN[1] mm into the body. The thoracic
# pedicle is short and the bone behind it (transverse process root, lamina) runs obliquely, which draws a longer fit
# off the pedicle (at T1-T3 to 10-25 deg more convergence than the published means)
AXIS_SPAN = {"lumbar": (14.0, 30.0), "thoracic": (5.0, 25.0), "cervical": (4.0, 15.0)}  # cervical: C7, short pedicle and body
# the isthmus is sought in front of this far (mm) behind the middle of the canal (negative: in front of the middle). At
# C7 the pedicle joins the lateral mass level with the canal: a pinch found further back lies in the pillar (its
# "height" spans the facets, 20 mm on this CT), and the axis through it swings between 25 and 50 deg
ISTHMUS_BACK = {"lumbar": 4.0, "thoracic": 4.0, "cervical": -4.0}
FILL_RATIO = 0.8
DEPTH_RATIO = 0.8
MIN_DIAMETER = 3.5
MIN_LENGTH = 15.0


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


def endplate_normal(pts: np.ndarray, c: np.ndarray, ez0: np.ndarray, radius: float = 14.0, below: bool = False) -> np.ndarray:
    """Normal (cranial) of the plane fitted to the top surface of a vertebral body: within `radius` mm of the axis
    through c along ez0, the highest bone point of each 2 mm column (with `below`, the bottom surface and the lowest
    point: the axis, whose top is the dens)."""
    ex0 = np.cross([0, 1.0, 0], ez0)
    ex0 /= np.linalg.norm(ex0)
    ey0 = np.cross(ez0, ex0)
    rel = pts - c
    a, b, hgt = rel @ ex0, rel @ ey0, rel @ ez0
    if below:
        hgt = -hgt
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


def isthmus_centre(bone: Bone, c: np.ndarray, F: np.ndarray, can: dict, sg: int, back: float = 4.0,
                   body: np.ndarray | None = None) -> tuple[np.ndarray, float]:
    """Centre of the pedicle's isthmus on one side (sg -1 left, +1 right) and the radius of the largest sphere that passes
    through it: the bottleneck of the widest bony path from the vertebral body to the bone behind the canal, within
    that side's half of the vertebra (the pedicle is the only bony link there)."""
    sdf = bone.sdf
    ijk = np.indices(sdf.shape).reshape(3, -1).T
    rel = nib.affines.apply_affine(bone.aff, ijk) - c
    u, v = (rel @ F[0]).reshape(sdf.shape), (rel @ F[1]).reshape(sdf.shape)
    half = sg * u > 0
    v_post = (can["vMin"] + can["vMax"]) / 2 - back  # behind the middle of the canal: pars, laminae, processes
    post = half & (v < v_post)
    # in the body, this side (`body`: the body's centre where it is not the vertebra's, as at the axis with its dens)
    seed = tuple(np.round(nib.affines.apply_affine(bone.inv, (c if body is None else body) + sg * 6 * F[0])).astype(int))

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


def pedicle(bone: Bone, c: np.ndarray, F: np.ndarray, can: dict, sg: int, span: tuple[float, float] = (14.0, 30.0),
            back: float = 4.0, body: np.ndarray | None = None) -> dict:
    """Measure one pedicle (sg -1 left, +1 right); `span`: the axis is fitted from span[0] mm behind the isthmus centre
    to span[1] mm into the body; the isthmus is sought in front of `back` mm behind the middle of the canal."""
    centre, r = isthmus_centre(bone, c, F, can, sg, back, body)
    d = best_axis(bone, centre, F, sg, back=span[0], ahead=span[1])
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


def lateral_mass(grid, n: int, c: np.ndarray, F: np.ndarray, can: dict, sg: int) -> dict | None:
    """The posterior face of a subaxial lateral mass on one side (sg -1 left, +1 right), seen from behind on labels from
    the CT's bone (`grid`, VerSe labels): its borders as Rathinavelu 2021 defines them. Medial: the junction with the
    lamina, where the lamina's backward slope (from the spinous process) flattens onto the face; lateral: the outer
    edge, where the surface drops forwards; above and below: the facet joint lines (where the vertebra above or below
    shows from behind). Returns the face's midpoint on the bone surface, its width and height, the unit normal of a
    plane fitted to the face (pointing forwards) and the sagittal inclination of the facet joints above and below."""
    S = 0.5
    us = np.arange(0, 40 + S, S)
    ws = np.arange(-25, 25 + S, S)
    vs = np.arange(-60, 10 + S, S)
    U, W, V = np.meshgrid(sg * us, ws, vs, indexing="ij")
    L = grid.sample(c + U[..., None] * F[0] + V[..., None] * F[1] + W[..., None] * F[2])
    hit = L > 0
    first = np.argmax(hit, axis=2)
    seen = hit.any(axis=2)
    D = np.where(seen, vs[first], np.nan)                       # depth of the first bone from behind (v)
    Lf = np.where(seen, np.take_along_axis(L, first[..., None], 2)[..., 0], 0)
    own = Lf == n
    hw = can["halfWidth"]
    # the rows through the pillar's middle: around the median height of the vertebra's own bone seen 0-12 mm lateral
    # of the canal (the frame follows the endplate, so the pillar can sit well above or below its origin)
    zone = own[(us >= hw) & (us <= hw + 12)]
    if not zone.any():
        return None
    w0 = float(np.median(ws[np.nonzero(zone)[1]]))
    mid_rows = np.abs(ws - w0) <= 6
    prof = np.array([np.nanmedian(np.where(own[i] & mid_rows, D[i], np.nan)) if (own[i] & mid_rows).any() else np.nan
                     for i in range(len(us))])
    plateau = np.nanmedian(prof[(us >= hw + 1) & (us <= hw + 11)])
    if np.isnan(plateau):
        return None
    inner = np.nonzero((us >= hw - 4) & (prof >= plateau - 1.5))[0]
    if not len(inner):
        return None
    i_m = inner[0]
    i_l = i_m
    for i in range(i_m, len(us)):
        if np.isnan(prof[i]) or prof[i] > plateau + 3:
            break
        i_l = i
    i_c = (i_m + i_l) // 2
    band = slice(max(i_c - 2, 0), i_c + 3)
    # the joint lines at the face's middle: own bone with the vertebra below (above) showing just beneath (above) it
    low = own[band, 1:] & (Lf[band, :-1] == n + 1)
    upp = own[band, :-1] & (Lf[band, 1:] == n - 1)
    if not low.any():
        return None
    w_low = float(ws[1:][np.nonzero(low)[1]].mean())
    col = own[i_c] & (np.abs(D[i_c] - plateau) < 6)
    w_up = float(ws[:-1][np.nonzero(upp)[1]].mean()) if upp.any() else float(ws[np.nonzero(col)[0]].max())
    w_c = (w_low + w_up) / 2
    j_c = int(np.argmin(np.abs(ws - w_c)))
    if np.isnan(D[i_c, j_c]):
        return None
    centre = c + sg * us[i_c] * F[0] + D[i_c, j_c] * F[1] + ws[j_c] * F[2]
    # plane through the face (own bone seen from behind within its borders)
    face = own[i_m:i_l + 1] & (ws[None, :] > w_low) & (ws[None, :] < w_up) & (np.abs(D[i_m:i_l + 1] - plateau) < 4)
    fi, fj = np.nonzero(face)
    pts = c + (sg * us[i_m + fi])[:, None] * F[0] + D[i_m + fi, fj][:, None] * F[1] + ws[fj][:, None] * F[2]
    if len(pts) < 30:
        return None
    nrm = np.linalg.svd(pts - pts.mean(0), full_matrices=False)[2][2]
    nrm = nrm if nrm @ F[1] > 0 else -nrm
    return {"centre": centre, "width": float(us[i_l] - us[i_m] + S), "height": float(w_up - w_low), "normal": nrm,
            "medial": float(us[i_m]), "lateral": float(us[i_l]), "wLow": w_low, "wUp": w_up, "depth": float(plateau)}


def facet_inclination(grid, n: int, c: np.ndarray, F: np.ndarray, lm: dict, sg: int, other: int) -> float | None:
    """Sagittal inclination (deg, upwards towards the front positive) of the facet joint between vertebra n and `other`
    on one side: a plane fitted to the points of n's bone within 1.5 mm of `other`'s, under the lateral mass face."""
    S = 0.5
    us = np.arange(lm["medial"], lm["lateral"] + S, S)
    ws = np.arange(-25, 25 + S, S)
    vs = np.arange(-35, 5 + S, S)
    U, W, V = np.meshgrid(sg * us, ws, vs, indexing="ij")
    P = c + U[..., None] * F[0] + V[..., None] * F[1] + W[..., None] * F[2]
    L = grid.sample(P)
    near_other = ndimage.binary_dilation(L == other, iterations=3)
    contact = (L == n) & near_other
    if contact.sum() < 30:
        return None
    pts = P[contact]
    nrm = np.linalg.svd(pts - pts.mean(0), full_matrices=False)[2][2]
    d = np.cross(nrm, F[0])                                   # the joint's line in the sagittal plane
    d = d if d @ F[1] > 0 else -d
    return float(np.degrees(np.arctan2(d @ F[2], d @ F[1])))


def lm_start(bone: Bone, F: np.ndarray, lm: dict, sg: int, tech: str, facets: list[float]) -> dict:
    """A lateral mass screw's start: direction from LM_TECHNIQUES in the vertebra's frame; the entry offset from the
    face's midpoint along the face (medial, cranial), then put on the bone surface along the screw."""
    med, cra, lateral, how = LM_TECHNIQUES[tech]
    n = lm["normal"]
    perp = float(np.degrees(np.arctan2(n @ F[2], n @ F[1])))      # the perpendicular's sagittal angle
    sag = perp if how == "perpendicular" else perp + 15.0 if how == "plus15" else float(np.mean(facets))
    d = direction(F, sg, -lateral, sag)
    e_med = -sg * F[0] - ((-sg * F[0]) @ n) * n
    e_cra = F[2] - (F[2] @ n) * n
    p = lm["centre"] + med * e_med / np.linalg.norm(e_med) + cra * e_cra / np.linalg.norm(e_cra)
    far = p - 15 * d
    t = first_entry(bone, far, d, 30.0)
    entry = far + (t if t is not None else 15.0) * d
    out = surface_along(bone, entry + 1.5 * d, d, 40.0)
    return {"entry": entry.round(2).tolist(), "dir": d.round(4).tolist(), "chord": round(float(out + 1.5), 1) if out else None,
            "sagittal": round(sag, 1)}


# ---------------------------------------------------------------- the atlas and the axis (C1-C2 fixation)
# Techniques (statements and sources in src/spine/content.ts): C1 lateral mass screw (Joaquim 2020: midportion of the
# lateral mass, 4-6 mm lateral to its medial border, at its junction with the lower edge of the posterior arch, about
# 15 deg medial, aimed at the anterior tubercle of C1 on the lateral view); C2 pedicle screw (Singh 2022: along the
# pedicle, 20-30 deg medial and cranial; here the measured axis); C2 pars screw (Singh 2022: entry 2-3 mm above and
# lateral to the medial end of the C2-C3 facet joint, 10 deg medial, 45 deg cranial); C2 translaminar screw (Singh
# 2022, Wright's technique: entry at the junction of the spinous process and the opposite lamina, the left screw near
# its upper margin and the right one near its lower margin, along the lamina); C1-C2 transarticular screw (Joaquim
# 2020: the pars screw's entry, steeper, through the pars into the lateral mass of C1, aimed at the anterior tubercle).
C1_MEDIAL = 15.0


def leaves_bone(bone: Bone, p: np.ndarray, d: np.ndarray, t_max: float = 60.0, margin: float = 1.0) -> float | None:
    """Distance from p along d to where the line leaves the bone for good: more than `margin` mm outside for 3 mm (a
    slit in the mask a fraction of a millimetre wide, as between the axis's pars and pedicle on this CT, is crossed)."""
    ts = np.arange(0, t_max, 0.1)
    out = bone(p + ts[:, None] * d) > margin
    for i in range(len(ts)):
        if out[i] and out[i:i + 30].all():
            return float(ts[i])
    return None


C1_LATERAL_OF_MEDIAL_BORDER = 5.0   # the middle of 4-6 mm
# C2 pedicle: entry searched this far lateral of the canal's lateral border (Ebraheim, as Kendirlioglu 2026 applies it:
# 7 mm), mm caudal of the lamina's upper border (Ebraheim: 5 mm); the medial angle
C2_PEDICLE_LATERAL = (7.0, 15.0)
C2_PEDICLE_BELOW = 5.0
C2_PEDICLE_MEDIAL = 45.0            # AO 30-45 deg (the most convergent); Ebraheim (Kendirlioglu 2026) 30 deg
C2_PEDICLE_SPAN = (5.0, 26.0)       # mm along the screw (past its entry) kept in the most bone
C2_PEDICLE_PLATEAU = 0.85           # of the best clearance: entries this good count as equally good
# C2 pars (AO Surgery Reference): entry 3-4 mm above the C2-C3 facet joint (the middle), straight forward
PARS_ABOVE_JOINT = 3.5
PARS_SPAN = (5.0, 18.0)             # mm along the screw (past its entry, to its length) kept in the most bone
TL_MARGIN = 0.08                    # of the lamina's height: the left screw that far above its middle, the right below
TL_ANGLES = (25.0, 65.0)            # deg from the midline searched for the lamina's axis (Zhou 2022: 49.4 +- 3.0)
OD_DIAMETER = 4.0                   # odontoid screw: González-Vargas 2026, the size most used
OD_APEX = 3.0                       # mm: the dens's tip, whose centre the odontoid screw aims at
TA_MEDIAL = 10.0                    # transarticular: Kendirlioglu 2026 measured 11.4 +- 2.2 deg
CC_DIAMETER = 3.5                   # Singh 2022: 3.5 mm screws at C2; Joaquim 2020 the same for C1
# start lengths: the C1 lateral mass screw bicortical (Joaquim 2020: to the far cortex); the others with the tip 1 mm
# short of where the line leaves the bone (Kendirlioglu 2026: the pedicle screw to the pedicle's anterior cortical
# boundary), the pars screw no longer than 18 mm (Singh 2022: 14-18 mm; AO: unicortical, over 16 mm), rounded down
CC_MAX_LENGTH = {"c2pars": 18.0, "c2tl": 32.0, "c2p": 27.0}   # c2tl: Zhou 2022's laminar length, 31.8 mm; c2p:
#   Kendirlioglu 2026's mean pedicle screw length, 26.8 mm
HRVA_PLANE = 3.0                    # mm lateral to the canal's lateral border (Kucherina 2026)


def ring_frame(pts: np.ndarray, c: np.ndarray, toward_up: np.ndarray) -> np.ndarray:
    """The atlas's frame: e_z normal to the plane of its ring (cranial), e_y forwards, e_x patient right."""
    ez = np.linalg.svd(pts - pts.mean(0), full_matrices=False)[2][2]
    ez = ez if ez @ toward_up > 0 else -ez
    return frame_of(ez, np.array([0, 1.0, 0]))


def c1_lateral_mass_start(labels, bone: Bone, c: np.ndarray, F: np.ndarray, sg: int) -> dict:
    """C1 lateral mass screw start on one side, measured on the atlas's labels: the lateral mass's medial border (the
    innermost bone of the atlas 3 mm below the arch's lower edge, between the arches), the entry 5 mm lateral of it on
    the lateral mass's posterior surface just under the arch, aimed 15 deg medially at the anterior tubercle."""
    S = 0.5
    us = np.arange(0, 40 + S, S)
    ws = np.arange(-20, 20 + S, S)
    vs = np.arange(-45, 25 + S, S)
    # the anterior tubercle: the most anterior atlas bone within 3 mm of the midline
    U, V = np.meshgrid(np.arange(-3, 3 + S, S), vs, indexing="ij")
    best = None
    for w in np.arange(-8, 8.01, 1.0):
        L = labels.sample(c + U[..., None] * F[0] + V[..., None] * F[1] + w * F[2]) == 1
        if L.any():
            v_max = vs[np.nonzero(L.any(axis=0))[0].max()]
            if best is None or v_max > best[0]:
                best = (v_max, w)
    tubercle = c + best[0] * F[1] + best[1] * F[2]
    # seen from behind, column by column: the first atlas bone from behind
    UU, WW, VV = np.meshgrid(sg * us, ws, vs, indexing="ij")
    L = labels.sample(c + UU[..., None] * F[0] + VV[..., None] * F[1] + WW[..., None] * F[2]) == 1
    seen = L.any(axis=2)
    D = np.where(seen, vs[np.argmax(L, axis=2)], np.nan)
    # the posterior arch: bone more than 12 mm behind the origin; its lower edge in the columns 8-16 mm from the midline
    arch = seen & (D < -12)
    cols = (us >= 8) & (us <= 16)
    arch_rows = np.nonzero(arch[cols].any(axis=0))[0]
    if not len(arch_rows):
        raise SystemExit("C1: posterior arch not found")
    w_arch = ws[arch_rows.min()]
    # medial border of the lateral mass: the innermost atlas bone 3 mm under the arch's lower edge, between the arches
    k = int(np.argmin(np.abs(ws - (w_arch - 3))))
    inner = np.nonzero((L[:, k, :] & (vs[None, :] > -10) & (vs[None, :] < 10)).any(axis=1))[0]
    if not len(inner):
        raise SystemExit("C1: lateral mass not found")
    u_med = us[inner.min()]
    u_e = u_med + C1_LATERAL_OF_MEDIAL_BORDER
    i_e = int(np.argmin(np.abs(us - u_e)))
    # just under the arch in this column (its lower edge falls laterally): the first row below it whose first bone
    # from behind is the lateral mass
    arch_here = np.nonzero(arch[i_e])[0]
    w_ae = ws[arch_here.min()] if len(arch_here) else w_arch
    rows = [j for j in range(len(ws)) if ws[j] < w_ae and seen[i_e, j] and D[i_e, j] >= -12]
    if not rows:
        raise SystemExit("C1: lateral mass surface under the arch not found")
    j_e = max(rows)
    target = c + sg * u_e * F[0] + D[i_e, j_e] * F[1] + ws[j_e] * F[2]
    rel = tubercle - target
    cranial = float(np.degrees(np.arctan2(rel @ F[2], rel @ F[1])))
    d = direction(F, sg, C1_MEDIAL, cranial)
    far = target - 15 * d
    t = first_entry(bone, far, d, 30.0)
    entry = far + (t if t is not None else 15.0) * d
    out = leaves_bone(bone, entry + 1.5 * d, d, 40.0)
    return {"entry": entry.round(2).tolist(), "dir": d.round(4).tolist(), "chord": round(float(out + 1.5), 1) if out else None,
            "medialBorder": round(float(u_med), 1), "tubercle": tubercle.round(2).tolist()}


def c2_posterior_view(labels, c: np.ndarray, F: np.ndarray, sg: int, S: float = 0.5):
    """The axis seen from behind on one side (its own bone only; the atlas's arch would hide its top): for each (u, w)
    the depth of the first bone, and the label first seen with every vertebra (for the facet joint lines)."""
    us = np.arange(0, 40 + S, S)
    ws = np.arange(-35, 25 + S, S)
    vs = np.arange(-60, 10 + S, S)
    UU, WW, VV = np.meshgrid(sg * us, ws, vs, indexing="ij")
    L = labels.sample(c + UU[..., None] * F[0] + VV[..., None] * F[1] + WW[..., None] * F[2])
    own = L == 2
    D = np.where(own.any(axis=2), vs[np.argmax(own, axis=2)], np.nan)
    hit = L > 0
    Lf = np.where(hit.any(axis=2), np.take_along_axis(L, np.argmax(hit, axis=2)[..., None], 2)[..., 0], 0)
    Dall = np.where(hit.any(axis=2), vs[np.argmax(hit, axis=2)], np.nan)
    return us, ws, vs, own, D, Lf, Dall


def c2_pedicle_start(labels, bone: Bone, c: np.ndarray, F: np.ndarray, can: dict, sg: int) -> dict:
    """C2 pedicle screw start, C2_PEDICLE_MEDIAL deg medial (the most convergent of the AO Surgery Reference's 30-45),
    its entry C2_PEDICLE_BELOW mm caudal to the superior border of the C2 lamina (Ebraheim, as Kendirlioglu 2026
    applies it): along the pedicle at that convergence, the entry (from Ebraheim's 7 mm lateral to the canal's lateral
    border outwards, C2_PEDICLE_LATERAL) and the cranial angle whose screw keeps the most bone around its first
    C2_PEDICLE_SPAN mm (the middle of the entries nearly as good as the best). (The AO entry, 2 mm lateral of the
    pars's midline at the lamina's upper border, leaves the pedicle superiorly on this CT; a more lateral entry is what
    lets a screw converge this much.)"""
    us, ws, vs, own, D, _, _ = c2_posterior_view(labels, c, F, sg)
    edge = can["uMax"] if sg > 0 else -can["uMin"]                # the canal's lateral border, |u|
    lam = (us >= edge - 4) & (us <= edge - 1)
    behind = (own & (vs[None, None, :] < can["vMin"] + 2)).any(axis=2)   # lamina: bone behind the canal
    tops = [ws[np.nonzero(behind[i])[0].max()] for i in np.nonzero(lam)[0] if behind[i].any()]
    if not tops:
        raise SystemExit("C2: the lamina's upper border was not found")
    w_top = float(max(tops))
    j = int(np.argmin(np.abs(ws - (w_top - C2_PEDICLE_BELOW))))
    ts = np.arange(*C2_PEDICLE_SPAN, 0.5)
    runs = []                                                     # per entry: (score, direction, entry, cranial, u)
    for u in np.arange(edge + C2_PEDICLE_LATERAL[0], edge + C2_PEDICLE_LATERAL[1] + 0.01, 1.0):
        i = int(np.argmin(np.abs(us - u)))
        if np.isnan(D[i, j]):
            continue
        p = c + sg * us[i] * F[0] + D[i, j] * F[1] + ws[j] * F[2]
        best = None
        for cr in np.arange(0.0, 70.5, 1.0):
            d = direction(F, sg, C2_PEDICLE_MEDIAL, cr)
            t = first_entry(bone, p - 15 * d, d, 35.0)
            e = p - 15 * d + (t if t is not None else 15.0) * d
            clear = -bone(e + ts[:, None] * d)
            score = float(clear.min() + 0.1 * clear.mean())
            if best is None or score > best[0]:
                best = (score, d, e, cr, float(us[i]))
        runs.append(best)
    if not runs:
        raise SystemExit("C2: no pedicle entry found")
    # the clearance is nearly flat over a few mm of entries: the middle of those within C2_PEDICLE_PLATEAU of the best
    top = max(r[0] for r in runs)
    good = [r for r in runs if r[0] >= C2_PEDICLE_PLATEAU * top]
    _, d, entry, cr, u_e = good[len(good) // 2]
    out = leaves_bone(bone, entry + 1.5 * d, d, 50.0)
    return {"entry": entry.round(2).tolist(), "dir": d.round(4).tolist(), "chord": round(float(out + 1.5), 1) if out else None,
            "laminaTop": round(w_top, 1), "canalEdge": round(float(edge), 1), "lateralOfCanal": round(u_e - float(edge), 1),
            "cranial": float(cr)}


def pars_start(labels, bone: Bone, c: np.ndarray, F: np.ndarray, can: dict, sg: int) -> dict:
    """C2 pars screw start (AO Surgery Reference): the entry at the midpoint of the pars mediolaterally, 3-4 mm above the
    C2-C3 facet joint; straight forward (no medial angulation), cranially along the pars: the angle whose screw keeps
    the most bone around it over PARS_SPAN. (Hugging the pars's dorsal cortex, the AO's "as dorsal as possible", is
    20 deg steeper on this CT.)"""
    us, ws, vs, own, D, Lf, Dall = c2_posterior_view(labels, c, F, sg)
    # the C2-C3 facet joint seen from behind: the axis over C3, at the inferior articular process's depth (the
    # shingled laminae meet further back)
    joint = (Lf[:, 1:] == 2) & (Lf[:, :-1] == 3) & (us[:, None] >= can["halfWidth"] + 1)
    ji, jj = np.nonzero(joint)
    if not len(ji):
        raise SystemExit("C2: the C2-C3 facet joint line was not found")
    d2 = Dall[ji, jj + 1]
    keep = np.abs(d2 - np.nanmedian(d2)) <= 4
    ji, jj = ji[keep], jj[keep]
    # the pars's posterior surface just above the joint: the face whose depth stays within 3 mm of its depth 3-12 mm
    # lateral of the canal (the laminae lie far behind it), its medial and lateral edges, and its midpoint
    j_row = int(np.argmin(np.abs(ws - (np.median(ws[1:][jj]) + 5))))
    row = D[:, j_row]
    zone = (us >= can["halfWidth"] + 3) & (us <= can["halfWidth"] + 12) & ~np.isnan(row)
    if not zone.any():
        raise SystemExit("C2: the pars's posterior surface was not found")
    face = float(np.median(row[zone]))
    i0 = int(np.argmin(np.abs(us - (can["halfWidth"] + 6))))
    i_m = i_l = i0
    while i_m > 0 and not np.isnan(row[i_m - 1]) and abs(row[i_m - 1] - face) <= 3:
        i_m -= 1
    while i_l < len(us) - 1 and not np.isnan(row[i_l + 1]) and abs(row[i_l + 1] - face) <= 3:
        i_l += 1
    i_e = (i_m + i_l) // 2
    near = np.abs(ji - i_e) <= 2
    w_joint = float(np.median(ws[1:][jj[near]])) if near.any() else float(np.median(ws[1:][jj]))
    j_e = int(np.argmin(np.abs(ws - (w_joint + PARS_ABOVE_JOINT))))
    if np.isnan(D[i_e, j_e]):
        raise SystemExit("C2: the pars's dorsal surface was not found")
    p = c + sg * us[i_e] * F[0] + D[i_e, j_e] * F[1] + ws[j_e] * F[2]
    ts = np.arange(*PARS_SPAN, 0.5)
    best = None
    for cr in np.arange(20.0, 90.01, 1.0):
        d = direction(F, sg, 0.0, cr)
        t = first_entry(bone, p - 15 * d, d, 35.0)
        e = p - 15 * d + (t if t is not None else 15.0) * d
        clear = -bone(e + ts[:, None] * d)
        score = float(clear.min() + 0.1 * clear.mean())
        if best is None or score > best[0]:
            best = (score, d, e)
    _, d, entry = best
    out = leaves_bone(bone, entry + 1.5 * d, d, 40.0)
    out = 40.0 if out is None else out                     # still in bone 40 mm on: the length cap decides
    # the transarticular screw's entry (Joaquim 2020: 3-5 mm above the C2-C3 junction, in a medial position): the
    # joint line's medial end, 2.5 mm lateral and 4 mm above it, on the surface (put on the bone along its own screw)
    k = int(np.argmin(us[ji]))
    i_t = int(np.argmin(np.abs(us - (us[ji[k]] + 2.5))))
    j_t2 = int(np.argmin(np.abs(ws - (ws[1:][jj[k]] + 4.0))))
    d_t = D[i_t, j_t2] if not np.isnan(D[i_t, j_t2]) else Dall[i_t, j_t2]
    ta_point = c + sg * us[i_t] * F[0] + d_t * F[1] + ws[j_t2] * F[2]
    return {"entry": entry.round(2).tolist(), "dir": d.round(4).tolist(), "chord": round(float(out + 1.5), 1),
            "transarticularPoint": ta_point.round(2).tolist(), "parsEdges": [round(float(us[i_m]), 1), round(float(us[i_l]), 1)], "jointHeight": round(w_joint, 1)}


def translaminar_start(bone: Bone, c: np.ndarray, F: np.ndarray, can: dict, sg: int) -> dict:
    """C2 translaminar screw in the lamina of side sg (Wright, as Singh 2022 describes it): along the lamina's long axis,
    the line through its core (the centroid of its front half, behind the canal) that keeps the most bone around it
    from 15 mm behind the core to 12 mm ahead, among directions TL_ANGLES deg from the midline (Zhou 2022's laminar
    angle 49.4 +- 3.0 deg lies within) and -15 to 25 deg up or down; the left screw above the lamina's middle, the right
    one below it (TL_MARGIN), so the two cross; entered where that line, carried back across the midline, meets the
    bone (at the junction of the spinous process and the opposite lamina)."""
    pts = nib.affines.apply_affine(bone.aff, np.argwhere(bone.sdf < 0))
    rel = (pts - c) @ F.T
    arch = rel[rel[:, 1] < can["vMin"] + 1]
    if len(arch) < 50:
        raise SystemExit("C2: lamina not found")
    tip = arch[np.argmin(arch[:, 1])]                     # the spinous process's most posterior point: the midline
    u0, v_back = tip[0], tip[1]
    lam = arch[(sg * (arch[:, 0] - u0) > 2) & (arch[:, 1] > v_back + 0.5 * (can["vMin"] - v_back))]
    if len(lam) < 50:
        raise SystemExit("C2: lamina not found")
    w_lo, w_hi = np.percentile(lam[:, 2], [5, 95])
    w_m = (w_lo + w_hi) / 2 + (TL_MARGIN if sg < 0 else -TL_MARGIN) * (w_hi - w_lo)
    band = lam[np.abs(lam[:, 2] - w_m) < 2]
    m = c + (band.mean(0) if len(band) > 20 else lam.mean(0)) @ F
    ts = np.linspace(-15, 12, 55)
    best = None
    for a in np.arange(TL_ANGLES[0], TL_ANGLES[1] + 0.01, 1.0):
        for cr in np.arange(-15, 25.01, 1.0):
            d = direction(F, sg, -a, cr)
            clear = -bone(m + ts[:, None] * d)
            score = float(clear.min() + 0.1 * clear.mean())
            if best is None or score > best[0]:
                best = (score, d, a)
    _, d, a = best
    t = first_entry(bone, m - 45 * d, d, 60.0)
    entry = m - 45 * d + (t if t is not None else 45.0) * d
    out = leaves_bone(bone, entry + 1.5 * d, d, 60.0)
    return {"entry": entry.round(2).tolist(), "dir": d.round(4).tolist(), "chord": round(float(out + 1.5), 1) if out else None,
            "laminaHeight": round(float(w_hi - w_lo), 1), "laminaAngle": round(float(a), 1)}


def isthmus_heights(labels, c: np.ndarray, F: np.ndarray, can: dict, sg: int) -> dict:
    """C2 isthmus height on the sagittal plane HRVA_PLANE mm lateral to the canal's lateral border (Kucherina 2026):
    the pars's narrowest height, the diameter of the largest disc that passes within the axis's bone from its superior
    articular surface (bone under the atlas) to its inferior facet (bone above C3). The internal height, the bone over
    the vertebral artery's groove, is measured where the groove is (foramen_roof): on this CT it does not reach this
    plane."""
    S = 0.25
    vs = np.arange(-45, 25 + S, S)
    ws = np.arange(-25, 30 + S, S)
    u0 = sg * (can["halfWidth"] + HRVA_PLANE)
    V, W = np.meshgrid(vs, ws, indexing="ij")
    L = labels.sample(c + u0 * F[0] + V[..., None] * F[1] + W[..., None] * F[2])
    axis = L == 2
    lab, n = ndimage.label(axis)
    if not n:
        return {}
    # the bone within 6 mm of the superior articular surface (under the atlas) and of the inferior facet (above C3)
    deep = int(round(6.0 / S))
    top = ndimage.binary_dilation(L == 1, iterations=deep) & axis
    bot = ndimage.binary_dilation(L == 3, iterations=deep) & axis
    edt = ndimage.distance_transform_edt(axis, sampling=S)
    lo_r, hi_r = 0.0, 15.0
    for _ in range(20):
        r = (lo_r + hi_r) / 2
        lr, _ = ndimage.label(edt >= r)
        a, b = set(np.unique(lr[top & (edt >= r)])) - {0}, set(np.unique(lr[bot & (edt >= r)])) - {0}
        if a & b:
            lo_r = r
        else:
            hi_r = r
    return {"isthmusHeight": round(2 * lo_r, 1)}


def foramen_roof(labels, c: np.ndarray, F: np.ndarray, can: dict, sg: int) -> dict | None:
    """The bone over the axis's foramen transversarium (the vertebral artery's groove) on one side: from the top of
    the foramen at its centre straight up to the superior articular surface (where the atlas begins), and how far the
    foramen's centre lies lateral to the canal's lateral border."""
    tf = G.transverse_foramina(labels, 2, c, F, can["halfWidth"] + 2)["L" if sg < 0 else "R"]
    if tf is None:
        return None
    rel = (np.array(tf["centre"]) - c) @ F.T
    ws = np.arange(rel[2], rel[2] + 30, 0.25)
    col = labels.sample(c + rel[0] * F[0] + rel[1] * F[1] + ws[:, None] * F[2])
    j = 0
    while j < len(ws) and col[j] != 2:           # inside the foramen
        j += 1
    k = top = j
    while k < len(ws) and col[k] != 1:           # the bone over it, across gaps under 1 mm, up to the atlas or air
        if col[k] == 2:
            top = k
        elif k - top > 4:
            break
        k += 1
    if j >= len(ws):
        return None
    return {"height": round(float((top - j + 1) * 0.25), 1), "lateralOfCanal": round(float(abs(rel[0]) - can["halfWidth"]), 1),
            "atlasAbove": bool(k < len(ws) and col[k] == 1)}


def odontoid_start(bone: Bone, c: np.ndarray, F: np.ndarray) -> dict:
    """Anterior odontoid screw start (Figà 2025, Sung 2018): in the midline, from the anterior-inferior point of the
    body of the axis (here the bone in the midsagittal plane furthest forwards and down, at 45 deg) to the apex of the
    dens (the centre of its top OD_APEX mm); the screw is meant to go through the apical cortex. "ventral": its angles are read
    looking backwards, its breaches along its own line (breach_frame)."""
    pts = nib.affines.apply_affine(bone.aff, np.argwhere(bone.sdf < 0))
    rel = (pts - c) @ F.T
    top = rel[np.abs(rel[:, 0]) < 6]
    apex = top[top[:, 2] > top[:, 2].max() - OD_APEX].mean(0)    # the centre of the dens's tip
    mid = rel[(np.abs(rel[:, 0] - apex[0]) < 1.0) & (rel[:, 2] < 0)]
    if len(mid) < 50:
        raise SystemExit("C2: the body's midsagittal outline was not found")
    corner = mid[np.argmax(mid[:, 1] - mid[:, 2])]
    corner[0] = apex[0]                                   # in the midline: no coronal deviation
    d_rel = (apex - corner) / np.linalg.norm(apex - corner)
    d = d_rel @ F
    p = c + corner @ F
    t = first_entry(bone, p - 15 * d, d, 35.0)
    entry = p - 15 * d + (t if t is not None else 15.0) * d
    out = leaves_bone(bone, entry + 1.5 * d, d, 70.0)
    return {"entry": entry.round(2).tolist(), "dir": d.round(4).tolist(), "chord": round(float(out + 1.5), 1) if out else None,
            "ventral": True, "apex": (c + apex @ F).round(2).tolist()}


def breach_frame(F: np.ndarray, st: dict) -> np.ndarray:
    """The frame a screw's breaches are named in (screw_result): the vertebra's, or for a ventral screw its own line
    (src/spine/screw.ts breachFrame): 'anterior' along the screw (its far cortex), 'superior' / 'inferior' its
    front and back walls, 'lateral' / 'medial' its sides."""
    if not st.get("ventral"):
        return F
    ey = np.array(st["dir"], float)
    ey /= np.linalg.norm(ey)
    ex = F[0] - (F[0] @ ey) * ey
    ex /= np.linalg.norm(ex)
    ez = np.cross(ex, ey)
    ez = ez if ez @ F[1] > 0 else -ez
    return np.array([ex, ey, ez])


def c1c2_bone(m: np.ndarray, ct: np.ndarray, aff: np.ndarray, vox: np.ndarray, o: np.ndarray) -> Bone:
    """The atlas and the axis as one bone, the atlanto-axial joints closed (a 3 mm closing): the transarticular screw
    is meant to cross them."""
    sel = (m == B.LABEL_OF["C1"]) | (m == B.LABEL_OF["C2"])
    cr, lo = crop_of(sel, vox, CROP_MM)
    vol = B.bone_volume(ct[cr].astype(np.float32), sel[cr], float(vox.mean()))
    inside = ndimage.gaussian_filter(vol, B.SIGMA_VOX) > B.BONE_HU
    it = max(1, int(round(3.0 / float(vox.mean()))))
    inside = largest(ndimage.binary_closing(np.pad(inside, it), iterations=it)[it:-it, it:-it, it:-it])
    a_s = aff.copy()
    a_s[:3, 3] = nib.affines.apply_affine(aff, lo) - o
    return Bone(inside, a_s)


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
    """Read only one region's block of a volume, a few slices at a time: whole-volume arrays of this CT
    (512 x 512 x 1214, the CT stored as float64) are 0.3-2.5 GB each."""
    return B.read_block(path, cr)


def canal_near(grid, c: np.ndarray, F: np.ndarray) -> dict | None:
    """The canal in the plane through the body centre, or in one a few mm off it where the ring does not close there
    (as spine_build.segment_geometry); offsets along the spine axis leave the in-plane coordinates unchanged."""
    for dw in (0.0, 3.0, 6.0, -3.0, 9.0, -6.0, -9.0, -12.0):  # the last ones for the axis, whose centroid sits up by the dens
        can = G.canal(grid, 1, c + dw * F[2], F)
        if can:
            return can
    return None


def thoracic_size(bone: Bone, c: np.ndarray, F: np.ndarray, can: dict, ped: dict, st: dict) -> dict:
    """Start size of a thoracic screw (FILL_RATIO, DEPTH_RATIO). Along the screw's own axis: from where it passes the
    back of the vertebral body (the plane of the canal's front border) to where it leaves the anterior cortex; the tip
    no further than DEPTH_RATIO of that way (the body is round, so a midline depth would let a converging screw out)."""
    dia = max(MIN_DIAMETER, np.floor(FILL_RATIO * ped["width"] / 0.5) * 0.5)
    e, d = np.array(st["entry"]), np.array(st["dir"])
    t_back = (can["vMax"] - (e - c) @ F[1]) / (d @ F[1])
    t_ant = surface_along(bone, e + t_back * d, d) + t_back
    t = t_back + DEPTH_RATIO * (t_ant - t_back)
    return {"diameter": float(dia), "length": float(max(MIN_LENGTH, 5 * np.floor(t / 5))),
            "bodyDepth": round(float(t_ant - t_back), 1)}


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


def main(only: list[str] | None = None) -> int:
    img = nib.load(B.MASK)
    aff0 = img.affine
    vox = np.abs(np.diag(aff0)[:3])
    o = B.origin()
    ctd = json.loads(B.CTD.read_text())
    C_ras = {c["label"]: nib.affines.apply_affine(aff0, [c["X"], c["Y"], c["Z"]]) for c in ctd if "label" in c}
    C = {k: v - o for k, v in C_ras.items()}
    out, report, fails = {}, {}, []
    B.PUBLIC.joinpath("spine").mkdir(parents=True, exist_ok=True)
    # one block per region, 80 mm around the spine: the thoracic one from C7 to L1; the lumbar one from T12 to 90 mm
    # below L5 (the sacrum)
    ctx: dict = {}
    for region_name, levels, chain, below in (("cervical", ["C1", "C2", "C1-C2"] + LATERAL_MASS + ["C7"], ["C1", "C2"] + LATERAL_MASS + ["C7", "T1"], 30),
                                              ("thoracic", THORACIC, ["C7"] + THORACIC + ["L1"], 30),
                                              ("lumbar", LUMBAR + ["S1"], ["T12"] + LUMBAR, 90)):
        pts = np.array([C_ras[B.LABEL_OF[x]] for x in chain])
        lo_r = pts.min(0) - [80, 80, below]
        hi_r = pts.max(0) + [80, 80, 30]
        ijk = nib.affines.apply_affine(np.linalg.inv(aff0), np.array([[a, b, c] for a in (lo_r[0], hi_r[0]) for b in (lo_r[1], hi_r[1])
                                                                     for c in (lo_r[2], hi_r[2])]))
        lo_i = np.maximum(np.floor(ijk.min(0)).astype(int), 0)
        hi_i = np.minimum(np.ceil(ijk.max(0)).astype(int) + 1, img.shape)
        block = tuple(slice(a, b) for a, b in zip(lo_i, hi_i))
        aff = aff0.copy()
        aff[:3, 3] = nib.affines.apply_affine(aff0, lo_i)
        m = region(B.MASK, block).astype(np.uint8)
        ct = region(B.CT, block)
        body_mask = region(B.TS / "vertebrae_body" / "vertebrae_body.nii.gz", block) > 0
        labels = None
        if region_name == "cervical":
            # the C2-C3 disc gives the axis's lower endplate (its body mask carries the dens)
            disc = region(B.TS / "vertebrae_body" / "intervertebral_discs.nii.gz", block) > 0
            lab_d, nd = ndimage.label(disc)
            mid = (C[B.LABEL_OF["C2"]] + C[B.LABEL_OF["C3"]]) / 2
            cents = [nib.affines.apply_affine(aff, x) - o for x in ndimage.center_of_mass(disc, lab_d, range(1, nd + 1))]
            k = int(np.argmin([np.linalg.norm(x - mid) for x in cents])) + 1
            dpts = nib.affines.apply_affine(aff, np.argwhere(lab_d == k)) - o
            n_d = np.linalg.svd(dpts - dpts.mean(0), full_matrices=False)[2][2]
            ctx["C2disc"] = n_d if n_d @ (C[B.LABEL_OF["C2"]] - C[B.LABEL_OF["C3"]]) > 0 else -n_d
            del disc, lab_d
            # the lateral masses are found on labels from the CT's bone (as spine_build does for the cervical foramina)
            bone_ct = ndimage.gaussian_filter(ct.astype(np.float32), B.SIGMA_VOX) > B.BONE_HU
            dist, ind = ndimage.distance_transform_edt(m == 0, sampling=vox, return_indices=True)
            ga = aff.copy()
            ga[:3, 3] -= o
            # the masks' cores count as bone too (cancellous bone can be darker than BONE_HU), as in bone_volume
            core = ndimage.binary_erosion(m > 0, iterations=3)
            labels = G.Grid(np.where(core | (bone_ct & (dist <= B.MASK_REACH_MM)), m[tuple(ind)], 0).astype(np.uint8), ga)
            del core
            del bone_ct, dist, ind
        sac = None
        if "S1" in levels:
            sac = (region(B.TS / "total" / "sacrum.nii.gz", block) > 0) | (region(B.TS / "total" / "vertebrae_S1.nii.gz", block) > 0)
        for lv in levels:
            if only and lv not in only:
                continue
            lvl, rep_ = level_data(lv, region_name, m, ct, body_mask, sac, aff, vox, o, C, labels, ctx)
            out[lv] = lvl
            report[lv] = rep_
        del m, ct, body_mask, sac, labels
    fails += validate(out)
    if only:  # a trial run: nothing is written but the levels' own data files
        for f in fails:
            print("FAIL", f)
        return 1 if fails else 0
    (B.GEN / "spine-screw.json").write_text(json.dumps({"levels": out}, indent=1))
    (B.BUILD / "screw_report.json").write_text(json.dumps(report, indent=1, default=float))
    for f in fails:
        print("FAIL", f)
    print(f"spine screw: {len(out)} levels, {'all checks passed' if not fails else f'{len(fails)} failures'}")
    return 1 if fails else 0


def level_data(lv: str, region_name: str, m: np.ndarray, ct: np.ndarray, body_mask: np.ndarray, sac, aff: np.ndarray,
               vox: np.ndarray, o: np.ndarray, C: dict, labels=None, ctx: dict | None = None) -> tuple[dict, dict]:
    """Everything the browser needs for one level, written to its gzip file; and the level's report."""
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
    elif lv == "C1-C2":
        # the atlas and axis together, in the axis's frame, for the transarticular screw
        bone = c1c2_bone(m, ct, aff, vox, o)
        c, ez = ctx["C2"]["c"], ctx["C2"]["F"][2]
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
        ez0 = (up - down) if up is not None and down is not None else (up - c) if up is not None else (c - down)
        ez0 = ez0 / np.linalg.norm(ez0)
        if lv == "C1":
            # no body: the plane of the atlas's ring
            ez = ring_frame(nib.affines.apply_affine(a_s, np.argwhere(inside)), c, C[B.LABEL_OF["C1"]] - C[B.LABEL_OF["C2"]])[2]
        else:
            body_pts = nib.affines.apply_affine(a_s, np.argwhere(body_mask[cr] & inside))
            ez = ctx["C2disc"] if lv == "C2" else endplate_normal(body_pts, c, ez0)
            body_c = body_pts.mean(0)
    grid = G.Grid((bone.sdf < 0).astype(np.uint8), bone.aff)
    can0 = canal_near(grid, c, frame_of(ez, np.array([0, 1.0, 0])))
    F = frame_of(ez, (c - np.array(can0["centre"])) if can0 else np.array([0, 1.0, 0]))
    if lv == "C1-C2":
        F = ctx["C2"]["F"]
    can = canal_near(grid, c, F) if lv not in ("S1", "C1-C2") else None
    if lv not in ("S1", "C1", "C1-C2") and can is None:
        raise SystemExit(f"{lv}: no canal found")
    meta, q = sdf_grid(bone)
    shipped = Shipped(meta, q)
    lo_b, hi_b = bone.box()
    # stored as int16 in 0.1 mm: the reference results below use the stored points, as the browser does
    risks = [(sid, np.round(pts / 0.1).astype("<i2")) for sid, pts in risk_points(lo_b - RISK_MARGIN, hi_b + RISK_MARGIN)]
    risks_mm = [(sid, q.astype(np.float64) * 0.1) for sid, q in risks]
    lvl = {"frame": {"origin": c.round(2).tolist(), "ex": F[0].round(5).tolist(), "ey": F[1].round(5).tolist(),
                     "ez": F[2].round(5).tolist()}}
    starts = {}
    if lv == "C1":
        starts["c1lm"] = {sd: c1_lateral_mass_start(labels, bone, c, F, sg) for sd, sg in (("L", -1), ("R", 1))}
        ctx["C1"] = {"tubercle": np.array(starts["c1lm"]["L"]["tubercle"]), "ez": F[2]}
    elif lv == "C2":
        # the axis's pedicle runs under its superior facet: the bottleneck measurement used elsewhere does not find it
        # (12-17 mm "wide", 50 deg on this CT), so its screw starts from the technique's landmarks and angles
        starts["c2pars"] = {sd: pars_start(labels, bone, c, F, can, sg) for sd, sg in (("L", -1), ("R", 1))}
        starts["c2p"] = {sd: c2_pedicle_start(labels, bone, c, F, can, sg) for sd, sg in (("L", -1), ("R", 1))}
        starts["c2tl"] = {sd: translaminar_start(bone, c, F, can, sg) for sd, sg in (("L", -1), ("R", 1))}
        od = odontoid_start(bone, c, F)                   # one midline screw: the same on both sides
        starts["od"] = {"L": od, "R": dict(od)}
        lvl["isthmus"] = {sd: {**isthmus_heights(labels, c, F, can, sg), "groove": foramen_roof(labels, c, F, can, sg)}
                          for sd, sg in (("L", -1), ("R", 1))}
        for sd in ("L", "R"):
            if lvl["isthmus"][sd]["groove"] is None:
                raise SystemExit(f"C2{sd}: the foramen transversarium was not found")
        ctx["C2"] = {"c": c, "F": F, "pars": starts["c2pars"]}
    elif lv == "C1-C2":
        # the medial entry above the C2-C3 joint, aimed (in the sagittal plane) at the atlas's anterior tubercle
        starts["ta"] = {}
        for sd, sg in (("L", -1), ("R", 1)):
            p_t = np.array(ctx["C2"]["pars"][sd]["transarticularPoint"])
            rel = ctx["C1"]["tubercle"] - p_t
            d = direction(F, sg, TA_MEDIAL, float(np.degrees(np.arctan2(rel @ F[2], rel @ F[1]))))
            t = first_entry(bone, p_t - 15 * d, d, 35.0)
            e = p_t - 15 * d + (t if t is not None else 15.0) * d
            out = leaves_bone(bone, e + 1.5 * d, d, 60.0)
            starts["ta"][sd] = {"entry": e.round(2).tolist(), "dir": d.round(4).tolist(), "chord": round(float(out + 1.5), 1) if out else None}
    elif lv == "S1":
        dia = DEFAULT_SIZE["s1"][0]
        starts["s1"] = {sd: promontory_screw(bone, c, F, sg, dia / 2) for sd, sg in (("L", -1), ("R", 1))}
    elif lv in LATERAL_MASS:
        n = B.LABEL_OF[lv]
        lms = {}
        for sd, sg in (("L", -1), ("R", 1)):
            lm = lateral_mass(labels, n, c, F, can, sg)
            if lm is None:
                raise SystemExit(f"{lv}{sd}: lateral mass not found")
            facets = [x for x in (facet_inclination(labels, n, c, F, lm, sg, n - 1), facet_inclination(labels, n, c, F, lm, sg, n + 1)) if x is not None]
            if not facets:
                raise SystemExit(f"{lv}{sd}: facet joints not found")
            lms[sd] = (lm, facets)
        lvl["lateralMass"] = {sd: {"width": round(lm["width"], 1), "height": round(lm["height"], 1),
                                   "facetInclination": [round(x, 1) for x in facets], "centre": lm["centre"].round(2).tolist()}
                              for sd, (lm, facets) in lms.items()}
        for tech in LM_TECHNIQUES:
            starts[tech] = {sd: lm_start(bone, F, lms[sd][0], sg, tech, lms[sd][1]) for sd, sg in (("L", -1), ("R", 1))}
    else:
        ped = {sd: pedicle(bone, c, F, can, sg, AXIS_SPAN[region_name], ISTHMUS_BACK[region_name]) for sd, sg in (("L", -1), ("R", 1))}
        lvl["pedicle"] = ped
        if lv == "C7":
            # Abumi's principle for C5-C7 as in thoracic straight-forward: through the isthmus at the measured
            # transverse angle, parallel to the upper endplate
            starts["cp"] = {sd: tt_start(bone, F, ped[sd], sg) for sd, sg in (("L", -1), ("R", 1))}
        elif region_name == "thoracic":
            # straight-forward: as the lumbar traditional start (through the isthmus at the measured transverse angle,
            # parallel to the superior endplate); anatomic: along the measured pedicle axis
            starts["st"] = {sd: tt_start(bone, F, ped[sd], sg) for sd, sg in (("L", -1), ("R", 1))}
            starts["at"] = {sd: {"entry": ped[sd]["entry"], "dir": ped[sd]["dir"], "chord": ped[sd]["chord"]} for sd in ("L", "R")}
        else:
            starts["tt"] = {sd: tt_start(bone, F, ped[sd], sg) for sd, sg in (("L", -1), ("R", 1))}
            starts["cbt"] = {sd: cbt_start(bone, F, ped[sd], sg, lv) for sd, sg in (("L", -1), ("R", 1))}
    lvl["start"] = starts
    # what the default screws give on the shipped grid (the browser must agree: tests/unit/spine-screw.test.ts)
    checks = {}
    for tech, per in starts.items():
        for sd, sg in (("L", -1), ("R", 1)):
            st = per[sd]
            if tech == "od":
                if st.get("chord") is None:
                    raise SystemExit(f"{lv}{sd} od: the start trajectory does not leave the bone ({st})")
                dia, ln = OD_DIAMETER, float(np.ceil(st["chord"]))   # to the apex's cortex, through it
            elif tech in ("c1lm", "c2p", "c2pars", "c2tl", "ta"):
                if st.get("chord") is None:
                    raise SystemExit(f"{lv}{sd} {tech}: the start trajectory does not leave the bone ({st})")
                ln = st["chord"] if tech == "c1lm" else min(st["chord"] - 1.0, CC_MAX_LENGTH.get(tech, 99.0))
                dia, ln = CC_DIAMETER, float(np.floor(ln))
            elif tech in LM_TECHNIQUES:
                dia, ln = LM_DIAMETER, float(np.floor(st["chord"]))
            elif tech == "cp":
                dia, ln = C7_DIAMETER, float(np.floor(st["chord"]))
            elif tech in ("st", "at"):
                size = thoracic_size(bone, c, F, can, lvl["pedicle"][sd], st)
                dia, ln = size["diameter"], size["length"]
                st["bodyDepth"] = size["bodyDepth"]
            else:
                dia, length = DEFAULT_SIZE[tech]
                if tech == "cbt":
                    dia = CBT_DIAMETER[lv]
                    st["trajectory"] = trajectory_length(shipped, np.array(st["entry"]), np.array(st["dir"]), dia / 2)
                    length = max([x for x in CBT_LENGTHS if x <= st["trajectory"]], default=CBT_LENGTHS[0])
                ln = length if length else st["chord"]
            st["size"] = {"diameter": dia, "length": ln}
            checks[f"{tech}.{sd}"] = screw_result(shipped, breach_frame(F, st), sg, np.array(st["entry"]), np.array(st["dir"]), ln,
                                                  dia / 2, risks_mm)
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
    report_lv = {"pedicle": lvl.get("pedicle"), "check": checks, "bytes": len(data)}
    summary = {sd: {k: v for k, v in p.items() if k in ("width", "height", "transverseAngle", "sagittalAngle", "chord")}
               for sd, p in lvl.get("pedicle", {}).items()}
    sizes = {k: (v[sd]["size"]["diameter"], v[sd]["size"]["length"]) for k, v in starts.items() for sd in ("L",)}
    print(lv, f"{len(data) / 1024:.0f} KB", summary, sizes, {k: (v["grade"], v["breach"]) for k, v in checks.items()})
    return lvl, report_lv


# wide plausibility bounds around published values (lumbar: Wang 2023, Moncada-Habib 2025; thoracic: the studies
# tabulated by Verma 2020, whose means run from 3.5 mm width at T4-T6 to 18.7 mm height at T12, and -10 to 35 deg;
# C7: Jiang 2024, axis 32-34 deg medial, screw width 5.5 mm, length 32-33 mm)
BOUNDS = {"lumbar": {"width": (4, 24), "height": (8, 24), "transverseAngle": (0, 40), "chord": (30, 90)},
          "thoracic": {"width": (2, 14), "height": (6, 24), "transverseAngle": (-15, 45), "chord": (25, 70)},
          "cervical": {"width": (3, 12), "height": (4, 14), "transverseAngle": (20, 50), "chord": (20, 50)}}


def validate(out: dict) -> list[str]:
    """Plausibility of the measurements (BOUNDS) and of the start positions."""
    fails = []
    for lv, d in out.items():
        F = np.array([d["frame"]["ex"], d["frame"]["ey"], d["frame"]["ez"]])
        c = np.array(d["frame"]["origin"])
        bounds = BOUNDS["thoracic" if lv.startswith("T") else "cervical" if lv.startswith("C") else "lumbar"]
        for sd, sg in (("L", -1), ("R", 1)):
            p = d.get("pedicle", {}).get(sd)
            if p:
                for k, (lo, hi) in bounds.items():
                    if not lo <= p[k] <= hi:
                        fails.append(f"{lv}{sd}: pedicle {k} {p[k]}")
            if lv in ("C1", "C2", "C1-C2"):
                for tech, per in d["start"].items():
                    e = np.array(per[sd]["entry"]) - c
                    if per[sd].get("ventral"):
                        if e @ F[1] < 5:
                            fails.append(f"{lv}{sd} {tech}: entry not in front of the {lv} ({(e @ F).round(1)})")
                    elif e @ F[1] > -3:
                        fails.append(f"{lv}{sd} {tech}: entry not behind the {lv} ({(e @ F).round(1)})")
                    if not 8 <= per[sd]["size"]["length"] <= 50:
                        fails.append(f"{lv}{sd} {tech}: start length {per[sd]['size']['length']}")
                    va = [x["mm"] for x in d["check"][f"{tech}.{sd}"]["nearest"] if x["id"] == "sp_vertebral_artery"]
                    if va and va[0] <= 0:
                        print(f"note: {lv}{sd} {tech}: the start screw reaches the vertebral artery ({va[0]} mm)")
                if lv == "C2":
                    ih = d["isthmus"][sd]
                    if not ih or not 2 <= ih["isthmusHeight"] <= 15:
                        fails.append(f"C2{sd}: isthmus height {ih}")
                continue
            for tech, per in d["start"].items():
                e = np.array(per[sd]["entry"]) - c
                if not (e @ F[1] < -15 and sg * (e @ F[0]) > 0):
                    fails.append(f"{lv}{sd} {tech}: entry not behind the body on its own side ({(e @ F).round(1)})")
            if lv in LATERAL_MASS:
                # lateral mass screws: none of the start screws may reach the vertebral artery; each is wholly in bone
                # somewhere along its course
                for tech in LM_TECHNIQUES:
                    ck = d["check"][f"{tech}.{sd}"]
                    va = [x["mm"] for x in ck["nearest"] if x["id"] == "sp_vertebral_artery"]
                    if va and va[0] <= 0:
                        fails.append(f"{lv}{sd} {tech}: the start screw reaches the vertebral artery ({ck})")
                    if not 6 <= d["start"][tech][sd]["size"]["length"] <= 24:
                        fails.append(f"{lv}{sd} {tech}: start length {d['start'][tech][sd]['size']['length']}")
                for k in ("width", "height"):
                    if not 5 <= d["lateralMass"][sd][k] <= 22:
                        fails.append(f"{lv}{sd}: lateral mass {k} {d['lateralMass'][sd][k]}")
                continue
            main_tech = "st" if lv.startswith("T") else "cp" if lv == "C7" else "tt"
            if lv != "S1" and d["check"][f"{main_tech}.{sd}"]["grade"] not in "AB":
                fails.append(f"{lv}{sd}: the default {main_tech} screw breaches ({d['check'][f'{main_tech}.{sd}']})")
    return fails


if __name__ == "__main__":
    # --only C7 [L4 ...]: measure and check just these levels, writing nothing but their data files
    sys.exit(main(sys.argv[2:] if sys.argv[1:2] == ["--only"] else None))
