"""Skull base v3: craniotomies cut out of the CT's bone for the surgical views: the right pterional, the right lateral
supraorbital (LSO), the right parasagittal one of the interhemispheric approach, the midline suboccipital and right
retrosigmoid ones, the right orbitozygomatic (the pterional flap and a second, orbitozygomatic piece: Yilmaz 2025) and the
right far lateral craniectomy (Pai 2018, Bruneau 2008).

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_approach.py      (then skullbase_v3.py takes its items)

The bone is v3's skull (pipeline/skullbase_v3_skull.py: the CT's own bone where the scan reaches, the fitted Z-Anatomy
model beyond it; skull_bone.npz on the CT's 0.5 mm grid, the surface the model draws), or without it Skull base v2's mask
(pipeline/data/build/skullbase-ct/bone.npz). The flap is drawn as an outline through burr holes on this skull, seen along the outward direction at
the pterion: the bone it removes is, along each line of sight through the outline, the first run of bone from outside
(the skull's thickness there; gaps under FLAP_GAP_MM, the diploe and air cells, bridged, but never across the cranial
cavity, so the floor beyond it stays; the run lying on the cavity when there are more, so a thin shell outside the skull is
passed over), where that run starts near the outer surface (not more than FLAP_DEEPER_MM deeper
than the flap's median). The pterional then has the lateral sphenoid ridge drilled. Its
burr holes follow Yilmaz 2025 and Sevgi 2026; the LSO's single burr hole and basal drilling follow Cha 2012 and
Choque-Velasquez 2018, its outline placed by hand on this skull (cited on the page, src/skullbase/approaches.ts); where the
sources give no number the drawing says so ("illustrative"). The landmarks are the Z-Anatomy model's fitted onto this CT
(Skull base v2).

A bone the cut touches keeps its own mesh (v3's skull, else v2's) except within BAND_MM of the cut; there it takes the
surface of the cut mask, meshed as that skull was meshed (same level, smoothing, face density and baked shading), each
new face going to the bone of the nearest of its faces. So the cut bone meets its untouched neighbours exactly as in v2,
with no gap or overlap; only the cut's walls and the band around them are new.
Writes pipeline/data/build/skullbase-v3/approach.json (the cut bones, the bone removed, how it was drawn).
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
import skullbase_ct as K  # noqa: E402
from build import isosurface  # noqa: E402

CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
BUILD = ROOT / "data" / "build" / "skullbase-v3"
SKULL = BUILD / "skull_bone.npz"        # v3's skull (skullbase_v3_skull.py), when built
STEP = 0.5
FLAP_GAP_MM = 8.0       # bridged within a run: the diploe and air cells (the cranial cavity behind is wider)
FLAP_DEEPER_MM = 10.0
OUT_MM = 40.0           # lines of sight start this far outside the outline's centre
SUTURE_MM = 0.5         # (cut_bones: by a suture, a new face this close to a whole bone's face is that bone's; else a cut bone's)
BAND_MM = 3.0           # a cut bone keeps v2's mesh farther than this from the cut
FLOOR_REACH_MM = 12.0   # a flap keeps the cranial floor's level this far in front of / beside the cavity
FLOOR_NEAR_MM = 6.0     # bone is floor when its nearest cavity, within this, lies mostly straight above it
SLOT_MM = 1.5           # a slot or pocket narrower than about twice this, left by a flap in the bone it keeps, is not cut
SEAL_APART_MM = 1.5     # (a pinhole: open to the outside this far or more from the opening)
SEAL_MM = 2.0           # a pinhole the smoothed cut edge would wear through thin bone beside a flap: the bone this far round it kept
RIDGE_RADIUS_MM = 6.0   # the lateral sphenoid ridge is drilled this far around its line (illustrative)
RIDGE_STOP_MM = 12.0    # ... stopping this short of the anterior clinoid process (illustrative)
PT_BULGE = (0.03, 0.15, 0.15, 0.15)   # the pterional flap: a smooth curve through its burr holes (frontal, keyhole, root,
                        # posterior), each side bowed out by this share of its length at its middle (an oval, as a
                        # craniotome cuts it; illustrative)
PT_ROUND_MM = 2.5       # the corners the floor's rule leaves in it rounded over this (a Gaussian of the cut, within the flap)
PT_SOFT_MM = 1.0        # its edge smoothed as the LSO's (illustrative)
PT_EDGE_MM = 5.0        # within this of its outline its smoothed edge never takes bone outside the cut (Skull.soft)
LSO_MEAN_AREA = 1275.4  # mm2: the mean LSO craniotomy in Cha 2012 (61 patients; the flap "about 3 x 4 cm")
# the LSO outline, placed by hand on this skull (hand placement is allowed in v3, and labelled): offsets in mm from the
# fitted landmarks (right side), drawn wider than the mean on purpose, to show the anatomy, but not much taller
# (illustrative)
LSO_OUTLINE = [
    ("(Supra-orbital notch)", (12.0, -2.0, 4.0)),               # basal, medial: at the orbital roof's level, behind the field of view's edge
    ("Zygomatic process of frontal bone", (0.0, -2.0, 5.0)),    # basal: just above the frontozygomatic suture, at the floor's level
    ("Sphenoidal angle of parietal bone", (0.0, 4.0, 3.0)),     # basal, lateral: at the pterion (the sphenoid ridge's end)
    ("Sphenoidal angle of parietal bone", (0.0, -12.0, 16.0)),  # the burr hole: posteriorly, just below the temporal line
    ("Sphenoidal angle of parietal bone", (-5.0, -8.0, 36.0)),  # upper, posterior (in front of the coronal suture)
    ("Zygomatic process of frontal bone", (-7.0, -3.0, 40.0)),  # upper, anterior
    ("(Supra-orbital notch)", (12.0, -7.0, 30.0)),              # upper, medial
]
LSO_BURR_HOLE = 3
LSO_SOFT_MM = 1.0       # the LSO's cut edge smoothed over this (Gaussian), its outline rounded through the points above and the
                        # depth of the cut smoothed between neighbouring lines of sight, so the rim is not jagged (illustrative)
SMOOTH_DEPTH_MM = 1.5   # (that depth smoothing's width)
FLAKE_MM2 = 30.0        # with a smoothed edge, loose pieces of bone smaller than this left at the cut are dropped
IH_FRONT_MM = 40.0      # the interhemispheric craniotomy: from this far in front of bregma ...
IH_BACK_MM = 20.0       # ... to this far behind it (illustrative; "precoronal parasagittal", Nair 2016) ...
IH_WIDTH_MM = 40.0      # ... and this wide, from the midline to the right (illustrative)
RS_FLAP_MM = (28.0, 35.0)   # the retrosigmoid flap's edges: back along the transverse sinus, down along the sigmoid (larger
                            # than Jian 2021's keyhole of 18-20 x 20-25 mm; Tang 2025: craniotomies a mean 3.8 cm across)
RS_CORNER_CUTS = 3          # its corners rounded by this many rounds of corner cutting (Chaikin)
RS_SINUS_GAP_MM = 0.0       # ... this far off the sinuses' margins (Jian 2021: the window's margins against them)
RS_DRILL_BEHIND_MM = 3.5    # its burr hole this far behind and below the keypoint (Jian 2021: the keypoint 3-4 mm
                            # anterosuperior to the drilling point)
RS_SOFT_MM = 1.0            # its edge smoothed as the LSO's
SO_BELOW_IOP_MM = 10.0  # the suboccipital craniotomy: its upper edge this far below the internal occipital protuberance
                        # (the confluence of the sinuses) ...
SO_HALF_WIDTH_MM = 25.0  # ... this far to each side of the midline (illustrative) ...
SO_RIM_HALF_MM = 12.0   # ... down to the foramen magnum, its posterior rim taken this far to each side of the midline ...
SO_PAST_RIM_MM = 4.0    # ... the outline's lower edge this far inside the opening, so the rim goes with the flap
SO_DEEPER_MM = 25.0     # the squama curves from upright to nearly flat over the flap: its outer surface lies up to this much
                        # deeper than the median along the line of sight (the clivus, seen through the foramen, lies deeper)

OZ_NOTCH_LATERAL_MM = 4.0   # the orbitozygomatic bar: from this far lateral to the supraorbital notch (Yilmaz 2025: the
#                             first orbital cut lateral to the supraorbital ridge) ...
OZ_PAST_FZ_MM = 5.0         # ... to this far lateral to the frontozygomatic suture (the last cut "just lateral" to it) ...
OZ_ROOF_MM = 25.0           # ... with the orbital roof this far back from the rim (towards the superior orbital fissure; illustrative)
OZ_RIM_ABOVE_MM = 8.0       # (the rim's bone from this far above the frontozygomatic process's landmark ...
OZ_RIM_BELOW_MM = 8.0       # ... to this far below it)
OZ_ARCH_FRONT_MM = 8.0      # the zygomatic arch: from this far in front of the zygomatic bone's back end ...
OZ_ARCH_ROOT_Y = 0.0        # ... back to its root in front of the articular tubercle (y in the frame; illustrative) ...
OZ_ARCH_HALF_MM = 7.0       # ... the arch's bone this far above and below its line, lateral of OZ_ARCH_LATERAL_MM
OZ_ARCH_LATERAL_MM = 50.0
OZ_ZYGOMA_BELOW_MM = 5.0    # the zygoma's body taken down to this far below the arch's level (about 1 cm below its processes'
#                             junction; illustrative) ...
OZ_ZYGOMA_LATERAL_MM = 33.0 # ... lateral of this (the infraorbital rim's medial part, the maxillary process, kept; illustrative)
FL_TRANSVERSE_MM = 30.0     # the far lateral craniectomy: its upper edge along the transverse sinus' lower margin for
#                             this far from the junction (illustrative) ...
FL_SIGMOID_MM = 35.0        # ... its lateral edge along the sigmoid sinus' posterior margin for this far down it (towards
#                             the jugular bulb, beside the condyle; illustrative) ...
FL_RIM_MM = (3.0, 16.0)     # ... and below, the foramen magnum's posterior rim taken from x = 3 to 16 mm (to the
#                             condyle), the outline SO_PAST_RIM_MM inside the opening so the rim goes with it
FL_CORNER_CUTS = 3          # its corners rounded by this many rounds of corner cutting (Chaikin)
FL_BOW = 0.22               # its medial edge bowed outwards by this share of its length (illustrative)
FL_CONDYLE_SHARE = 1 / 3    # the occipital condyle's posterior third drilled (Pai 2018: the posterior 30-40 %)
FL_CONDYLE_MM = 11.0        # (the condyle's bone within this of its landmark)


def unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def fmt(p) -> str:
    return "(" + ", ".join(f"{x:.0f}" for x in p) + ") mm"


def rounded(poly: np.ndarray, per: int = 16) -> np.ndarray:
    """A closed outline (2-D points in order) as a smooth curve through them: a centripetal Catmull-Rom spline, which
    does not overshoot between unevenly spaced points (a craniotome cuts curves, not corners)."""
    n, out = len(poly), []
    for i in range(n):
        p0, p1, p2, p3 = poly[i - 1], poly[i], poly[(i + 1) % n], poly[(i + 2) % n]
        t0 = 0.0
        t1 = t0 + np.linalg.norm(p1 - p0) ** 0.5
        t2 = t1 + np.linalg.norm(p2 - p1) ** 0.5
        t3 = t2 + np.linalg.norm(p3 - p2) ** 0.5
        for t in np.linspace(t1, t2, per, endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    return np.array(out)


def smooth_depth(depth: np.ndarray, inside: np.ndarray) -> np.ndarray:
    """A cut's depth per line of sight (NaN: none) made even: inside the outline, lines without one take their nearest
    neighbour's, then a Gaussian of SMOOTH_DEPTH_MM over the outline (normalised by the lines inside it), so single lines
    that kept or lost bone do not leave spikes on the rim."""
    ok = inside & ~np.isnan(depth)
    if not ok.any():
        return depth
    _, near = ndimage.distance_transform_edt(~ok, return_indices=True)
    filled = depth[tuple(near)]
    w = ndimage.gaussian_filter(inside.astype(float), SMOOTH_DEPTH_MM / STEP)
    sm = ndimage.gaussian_filter(np.where(inside, filled, 0.0), SMOOTH_DEPTH_MM / STEP) / np.maximum(w, 1e-6)
    return np.where(inside, sm, np.nan)


def in_polygon(pts: np.ndarray, poly: np.ndarray) -> np.ndarray:
    """Even-odd test of 2-D points against a polygon (its vertices in order)."""
    x, y = pts[:, 0], pts[:, 1]
    inside = np.zeros(len(pts), bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi, xj, yj = poly[i, 0], poly[i, 1], poly[j, 0], poly[j, 1]
        inside ^= ((yi > y) != (yj > y)) & (x < (xj - xi) * (y - yi) / np.where(yj - yi == 0, 1e-12, yj - yi) + xi)
        j = i
    return inside


class Skull:
    """The CT's bone on v2's grid in the frame, its named bone surfaces and the fitted landmarks."""

    def __init__(self):
        self.ex = json.loads((CT_BUILD / "export.json").read_text())
        if SKULL.exists():      # v3's skull, already in the frame
            import skullbase_v3_skull as SK
            c = np.load(SKULL)
            self.a, self.b = c["a"], c["b"].astype(np.float32)
            self.bones = json.loads((BUILD / "skull.json").read_text())["bones"]
            self.faces = SK.FACES
        else:
            c = np.load(CT_BUILD / "bone.npz")
            f = np.load(CT_BUILD / "frame.npz")
            a, R, fossa = c["a"], f["R"], f["fossa"]
            self.a = a.copy()
            self.a[:3, :3] = R.T @ a[:3, :3]
            self.a[:3, 3] = (a[:3, 3] - fossa) @ R
            self.b = c["b"].astype(np.float32)
            self.bones = self.ex["bones"]
            self.faces = K.BONE_FACES
        self.inv = np.linalg.inv(self.a)
        self.znames = list(self.bones)
        pts = [np.array(self.bones[n]["verts"], float)[::2] for n in self.znames]
        self.zp = np.vstack(pts)
        self.zl = np.concatenate([np.full(len(p), k) for k, p in enumerate(pts)])
        self.lms = {}
        for lm in self.ex["landmarks"]:
            self.lms.setdefault(lm["name"], np.array(lm["ras"], float))
        bone = np.argwhere(self.b > 0.5)
        self.centre = nib.affines.apply_affine(self.a, bone[:: max(1, len(bone) // 20000)]).mean(0)
        self.cavity = self._cavity()

    def _cavity(self) -> np.ndarray:
        """The cranial cavity on the bone grid (skullbase_ct.cavity: the foramina closed, grown back to the inner table)."""
        return K.cavity(self.b, self.a, STEP)

    def cavity_at(self, p: np.ndarray) -> np.ndarray:
        ijk = np.rint(nib.affines.apply_affine(self.inv, np.atleast_2d(p))).astype(int)
        ok = (ijk >= 0).all(1) & (ijk < np.array(self.cavity.shape)).all(1)
        out = np.zeros(len(ijk), bool)
        out[ok] = self.cavity[tuple(ijk[ok].T)]
        return out

    def bone_at(self, p: np.ndarray) -> np.ndarray:
        ijk = nib.affines.apply_affine(self.inv, np.atleast_2d(p)).T
        return ndimage.map_coordinates(self.b, ijk, order=1, mode="constant") > K.SURFACE_LEVEL

    def lm(self, name: str) -> np.ndarray:
        p = self.lms[name].copy()
        p[0] = abs(p[0])          # the right side
        return p

    def surface(self, p: np.ndarray, n: np.ndarray, reach: float = OUT_MM) -> np.ndarray:
        """The first bone met coming from p + reach*n towards p (and on past it, up to reach)."""
        t = np.arange(reach, -reach, -0.25)
        q = p + t[:, None] * n
        hit = self.bone_at(q)
        if not hit.any():
            raise SystemExit(f"no bone along the line through {p.round(1)}")
        return q[int(np.argmax(hit))]

    def outward(self, p: np.ndarray) -> np.ndarray:
        return unit(p - self.centre)

    def bone_names(self, mask: np.ndarray) -> list[str]:
        pts = nib.affines.apply_affine(self.a, np.argwhere(mask))
        _, j = cKDTree(self.zp).query(pts[:: max(1, len(pts) // 20000)])
        lab, cnt = np.unique(self.zl[j], return_counts=True)
        return [self.znames[k] for k, c in zip(lab, cnt) if c >= 20]

    def _grid_box(self, corners: np.ndarray):
        ijk = nib.affines.apply_affine(self.inv, corners)
        lo = np.maximum(np.floor(ijk.min(0)).astype(int), 0)
        hi = np.minimum(np.ceil(ijk.max(0)).astype(int) + 1, self.b.shape)
        idx = np.stack(np.meshgrid(*[np.arange(lo[k], hi[k]) for k in range(3)], indexing="ij"), -1).reshape(-1, 3)
        return idx, nib.affines.apply_affine(self.a, idx)

    def flap(self, outline: np.ndarray, n: np.ndarray, floor: bool = True, deeper: float = FLAP_DEEPER_MM, smooth: bool = False) -> np.ndarray:
        """Grid mask of the bone a flap removes: outline (points in the frame, in order) seen along n (outward); along each
        line of sight inside it, the first run of bone from outside; with floor, the cranial floor kept (keep_floor). With
        smooth, the outline is rounded (rounded) and the cut's depth made even between lines of sight (smooth_depth)."""
        n = unit(n)
        c = outline.mean(0)
        e1 = unit(np.cross(n, [0, 0, 1.0]) if abs(n[2]) < 0.9 else np.cross(n, [1.0, 0, 0]))
        e2 = np.cross(n, e1)
        poly = np.c_[(outline - c) @ e1, (outline - c) @ e2]
        if smooth:
            poly = rounded(poly)
        us = np.arange(poly[:, 0].min() - 1, poly[:, 0].max() + 1, STEP)
        vs = np.arange(poly[:, 1].min() - 1, poly[:, 1].max() + 1, STEP)
        U, V = np.meshgrid(us, vs, indexing="ij")
        inside = in_polygon(np.c_[U.ravel(), V.ravel()], poly).reshape(U.shape)
        ws = np.arange(OUT_MM, -OUT_MM, -STEP)
        start = np.full(U.shape, np.nan)
        end = np.full(U.shape, np.nan)
        gap = int(round(FLAP_GAP_MM / STEP))
        for i in range(len(us)):
            if not inside[i].any():
                continue
            P = c + U[i][:, None, None] * e1 + V[i][:, None, None] * e2 + ws[None, :, None] * n
            hit = self.bone_at(P.reshape(-1, 3)).reshape(len(vs), len(ws))
            cav = self.cavity_at(P.reshape(-1, 3)).reshape(len(vs), len(ws))
            for j in np.nonzero(inside[i])[0]:
                h = np.nonzero(hit[j])[0]
                if not len(h):
                    continue
                # runs of bone from outside (split at a wide gap or the cavity); the one lying on the cavity is the skull's
                # wall (a thin shell outside it, such as the CT's headrest, is passed over); else the first
                runs, k0 = [], h[0]
                k1 = k0
                for k in list(h[1:]) + [None]:
                    if k is None or k - k1 > gap + 1 or cav[j, k1 + 1:k].any():
                        runs.append((k0, k1))
                        if k is None or cav[j, k1 + 1:k].any():
                            break
                        k0 = k
                    k1 = k if k is not None else k1
                walls = [r for r in runs if cav[j, r[1] + 1:r[1] + gap + 2].any()]
                k0, k1 = walls[0] if walls else runs[0]
                start[i, j], end[i, j] = ws[k0] + STEP, ws[k1] - STEP
        # lines of sight that pass under the skull's edge meet deeper bone first: keep only runs that start near the outer
        # surface (within FLAP_DEEPER_MM of the median start)
        deep = start < np.nanmedian(start) - deeper
        start[deep], end[deep] = np.nan, np.nan
        if smooth:
            start, end = smooth_depth(start, inside), smooth_depth(end, inside)
        corners = np.array([c + u * e1 + v * e2 + w * n for u in (us[0], us[-1]) for v in (vs[0], vs[-1]) for w in (OUT_MM, -OUT_MM)])
        ijk, P = self._grid_box(corners)
        P = P - c
        iu = np.rint((P @ e1 - us[0]) / STEP).astype(int)
        iv = np.rint((P @ e2 - vs[0]) / STEP).astype(int)
        w = P @ n
        ok = (iu >= 0) & (iu < len(us)) & (iv >= 0) & (iv < len(vs))
        sel = np.zeros(len(ijk), bool)
        k = np.nonzero(ok)[0]
        s_, e_ = start[iu[k], iv[k]], end[iu[k], iv[k]]
        sel[k] = inside[iu[k], iv[k]] & ~np.isnan(s_) & (w[k] <= s_) & (w[k] >= e_)
        mask = np.zeros(self.b.shape, bool)
        mask[tuple(ijk[sel].T)] = True
        mask &= self.b > K.SURFACE_LEVEL
        return self.keep_floor(mask) if floor else mask

    def keep_floor(self, mask: np.ndarray) -> np.ndarray:
        """A flap stops at the cranial floor. Floor is bone whose nearest cranial cavity lies mostly straight above it (within
        FLOOR_NEAR_MM): the orbital roofs and the fossae's floors, not the side walls. A flap keeps it, and in front of or
        beside the cavity (within FLOOR_REACH_MM of floor, where no cavity lies above) it keeps everything below the floor's
        level there, so a basal edge "drilled flush" leaves the orbital rim and roof whole."""
        idx = np.argwhere(mask)
        if not len(idx):
            return mask
        pad = int(np.ceil((FLOOR_REACH_MM + FLOOR_NEAR_MM) / STEP))
        lo = np.maximum(idx.min(0) - pad, 0)
        hi = np.minimum(idx.max(0) + pad + 1, self.b.shape)
        box = tuple(slice(a, b) for a, b in zip(lo, hi))
        cav = self.cavity[box]
        bone = self.b[box] > K.SURFACE_LEVEL
        _, near = ndimage.distance_transform_edt(~cav, return_indices=True)
        grid = np.indices(cav.shape)
        vec = np.einsum("ij,jxyz->ixyz", self.a[:3, :3], (near - grid).astype(np.float32))    # to the nearest cavity, mm
        del near, grid
        d = np.linalg.norm(vec, axis=0)
        floor = bone & (d <= FLOOR_NEAR_MM) & (vec[2] >= 0.7 * np.maximum(d, 1e-6))
        # the floor's level, per column of the frame (1 mm), where the floor is
        fi = np.argwhere(floor)
        F = nib.affines.apply_affine(self.a, fi + lo)
        top = {}
        for (x, y), z in zip(np.round(F[:, :2]).astype(int).tolist(), F[:, 2]):
            top[(x, y)] = max(top.get((x, y), -np.inf), z)
        local = idx - lo
        P = nib.affines.apply_affine(self.a, idx)
        drop = floor[tuple(local.T)]
        # columns with no cavity above the voxel (in front of or beside it): the nearest floor column's level
        has_cav = np.zeros(len(P), bool)
        for dz in np.arange(1.0, 40.0, 1.0):
            has_cav |= self.cavity_at(P + [0.0, 0.0, dz])
        if top:
            keys = np.array(list(top.keys()), float)
            dd, j = cKDTree(keys).query(P[:, :2])
            level = np.array(list(top.values()))[j]
            drop |= ~has_cav & (dd <= FLOOR_REACH_MM) & (P[:, 2] < level + 0.5)
        mask[tuple(idx[drop].T)] = False
        return mask

    def keep_below_cavity(self, mask: np.ndarray) -> np.ndarray:
        """For a flap over the anterior fossa: keep every voxel below the lowest point of the cranial cavity in its column
        of the frame (the sloping orbital roof under the flap's basal edge stays whole). Not for flaps on the side wall,
        where a vertical column can graze the cavity above the wall."""
        idx = np.argwhere(mask)
        if not len(idx):
            return mask
        P = nib.affines.apply_affine(self.a, idx)
        key = np.round(P[:, :2] * 2) / 2
        zs = np.arange(-20.0, 110.0, 0.5)
        low = {}
        for c in np.unique(key, axis=0):
            cv = self.cavity_at(np.c_[np.full(len(zs), c[0]), np.full(len(zs), c[1]), zs])
            low[(c[0], c[1])] = zs[np.argmax(cv)] if cv.any() else -np.inf
        # columns with no cavity (in front of it, over the orbital rim): the nearest column's, within FLOOR_REACH_MM
        known = np.array([k for k, v in low.items() if np.isfinite(v)])
        if len(known):
            d, j = cKDTree(known).query(np.array(list(low.keys())))
            for (k, v), dd, jj in zip(list(low.items()), d, j):
                if not np.isfinite(v) and dd <= FLOOR_REACH_MM:
                    low[k] = low[tuple(known[jj])]
        zf = np.array([low[(a, b)] for a, b in key])
        mask[tuple(idx[P[:, 2] < zf - 0.5].T)] = False
        return mask

    def soft(self, cut: np.ndarray, soft_mm: float, guard: np.ndarray | None = None, keep: np.ndarray | None = None) -> np.ndarray:
        """soft_cut, sealed: in `keep` (the bones the cut leaves whole), nothing is taken; in `guard` (by a flap's
        outline), bone outside the cut is eased but never taken; and where
        the smoothed edge would wear through thin bone (the orbit's walls), making a pinhole apart from the opening
        (SEAL_APART_MM), the bone there is left whole (SEAL_MM round it)."""
        g = soft_cut(cut, soft_mm)
        if soft_mm <= 0:
            return g
        bone = self.b > K.SURFACE_LEVEL
        if keep is not None:
            g[keep & ~cut] = 0.0
        if guard is not None:   # (weak bone, as by the frontal sinus, not worn below the surface level)
            floor = K.SURFACE_LEVEL + 0.05
            out = guard & ~cut & (self.b > 0)
            g[out] = np.minimum(g[out], np.maximum(0.0, 1.0 - floor / self.b[out]))
        if not hasattr(self, "_outside"):
            air, _ = ndimage.label(~bone & ~self.cavity)
            edge = np.unique(np.r_[air[[0, -1]].ravel(), air[:, [0, -1]].ravel(), air[:, :, [0, -1]].ravel()])
            self._outside = np.isin(air, edge[edge > 0])
        near_out = ndimage.binary_dilation(self._outside)
        for _ in range(4):
            open_ = bone & ~(self.b * (1.0 - g) > K.SURFACE_LEVEL) & near_out
            lab, n = ndimage.label(open_, np.ones((3, 3, 3)))
            if n < 2:
                break
            main = lab == np.argmax(np.bincount(lab.ravel())[1:]) + 1
            holes = (lab > 0) & ~main & ~ndimage.binary_dilation(main, iterations=int(round(SEAL_APART_MM / STEP)))
            if not holes.any():
                break
            holes = np.isin(lab, np.unique(lab[holes]))
            seal = ndimage.binary_dilation(holes, iterations=int(round(SEAL_MM / STEP))) & ~cut
            g[seal | holes] = 0.0
        return g

    def near_bones(self, cut: np.ndarray, cutb: set[str]) -> set[str]:
        """The bones (other than cutb) with a face within BAND_MM of the cut."""
        dist = (ndimage.distance_transform_edt(~cut) * STEP).astype(np.float32)
        out = set()
        for n, b in self.bones.items():
            if n in cutb:
                continue
            v = np.array(b["verts"], float)
            ijk = nib.affines.apply_affine(self.inv, v)
            inb = (ijk >= 0).all(1) & (ijk < np.array(cut.shape) - 1).all(1)
            if inb.any() and (ndimage.map_coordinates(dist, ijk[inb].T, order=1) <= BAND_MM).any():
                out.add(n)
        return out

    def whole_bones(self, cut: np.ndarray, touched: set[str]) -> np.ndarray:
        """The bone near a cut (within BAND_MM) that belongs to a bone the cut leaves whole (by the nearest of the model's
        bone surfaces): its mesh is kept as it is, so a smoothed edge must not wear it."""
        near = (ndimage.distance_transform_edt(~cut) * STEP <= BAND_MM) & (self.b > 0.05) & ~cut
        idx = np.argwhere(near)
        _, j = cKDTree(self.zp).query(nib.affines.apply_affine(self.a, idx))
        other = ~np.isin(np.array(self.znames)[self.zl[j]], list(touched))
        out = np.zeros(cut.shape, bool)
        out[tuple(idx[other].T)] = True
        return out

    def region(self, pred, centre: np.ndarray, radius: float) -> np.ndarray:
        """Grid mask of the bone within radius of centre where pred(points in the frame) holds."""
        corners = np.array([centre - radius, centre + radius])
        ijk, P = self._grid_box(np.array([[x, y, z] for x in corners[:, 0] for y in corners[:, 1] for z in corners[:, 2]]))
        sel = (np.linalg.norm(P - centre, axis=1) <= radius) & pred(P)
        mask = np.zeros(self.b.shape, bool)
        mask[tuple(ijk[sel].T)] = True
        return mask & (self.b > K.SURFACE_LEVEL)

    def cut_bones(self, cut: np.ndarray, only: set[str], soft_mm: float = 0.0, guard: np.ndarray | None = None,
                  keep: np.ndarray | None = None) -> dict:
        """The bones in `only`, cut: v2's mesh away from the cut, the cut mask's surface within BAND_MM of it (each new face
        given to the bone of the nearest v2 face); with soft_mm, the cut's edge smoothed (soft_cut).
        {bone name: {verts, tris, ao}}"""
        new = self.mesh_bones(self.b * (1.0 - self.soft(cut, soft_mm, guard, keep)), only=None, split=False)
        dist = (ndimage.distance_transform_edt(~cut) * STEP).astype(np.float32)

        def dist_at(P):
            return ndimage.map_coordinates(dist, nib.affines.apply_affine(self.inv, P).T, order=1, mode="nearest")
        orig = {n: (np.array(b["verts"], float), np.array(b["tris"], int), np.array(b["ao"], float)) for n, b in self.bones.items()}
        names = list(orig)
        cent = np.vstack([v[t].mean(1) for v, t, _ in orig.values()])
        lab = np.concatenate([np.full(len(t), k) for k, (_, t, _) in enumerate(orig.values())])
        NV, NF, NA = new["verts"], new["tris"], new["ao"]
        _, j = cKDTree(cent).query(NV[NF].mean(1))
        new_lab = lab[j]
        new_d = dist_at(NV[NF].mean(1))
        if soft_mm > 0:      # (the cut surface's loose pieces, judged on it whole: split into bones, a piece is not loose)
            loose = flakes(NV, NF, new_d <= BAND_MM)
            new_lab = np.where(loose, -1, new_lab)
        # by a suture with a bone the cut leaves whole, the new surface can lie nearer that bone's faces than the cut
        # bone's: where that bone's own surface is not there (farther than SUTURE_MM: the cut's wall), or where it lies
        # over a cut bone's faces taken away (within SUTURE_MM), the nearest cut bone takes it, or it would be left open
        ids = [names.index(o) for o in only]
        orphan_to = np.full(len(NF), -1)
        cand = np.nonzero((new_lab >= 0) & ~np.isin(new_lab, ids) & (new_d <= BAND_MM + 0.5))[0]
        if len(cand):
            C = NV[NF[cand]].mean(1)
            uncut = cKDTree(cent[~np.isin(lab, ids)])       # (the whole bones' faces, by their centres)
            gone_c = []
            for o in only:
                vo, to_, _ = orig[o]
                go = (dist_at(vo) <= BAND_MM)[to_].any(1)
                gone_c.append(vo[to_[go]].mean(1))
            over = cKDTree(np.vstack(gone_c)).query(C)[0] <= SUTURE_MM
            take = (uncut.query(C)[0] > SUTURE_MM) | over
            tc = cKDTree(cent[np.isin(lab, ids)])
            _, k = tc.query(C[take])
            orphan_to[cand[take]] = lab[np.isin(lab, ids)][k]
        out = {}
        for n in sorted(only):
            v, t, ao = orig[n]
            dv = dist_at(v)
            gone = (dv <= BAND_MM)[t].any(1)
            keep = t[~gone]
            reach = float(dv[t[gone]].max()) + 0.5 if gone.any() else BAND_MM    # the patch covers every face taken away
            own = ((new_lab == names.index(n)) | (orphan_to == names.index(n))) & (new_d <= reach)
            patch = NF[own]
            used_o, inv_o = np.unique(keep, return_inverse=True)
            used_p, inv_p = np.unique(patch, return_inverse=True)
            V2, T2, A2 = np.vstack([v[used_o], NV[used_p]]), np.vstack([inv_o.reshape(-1, 3), inv_p.reshape(-1, 3) + len(used_o)]), np.r_[ao[used_o], NA[used_p]]
            out[n] = {"verts": V2.round(3).tolist(), "tris": T2.tolist(), "ao": A2.round(3).tolist()}
        return out

    def mesh_bones(self, b: np.ndarray, only: set[str] | None, split: bool = True) -> dict:
        """The bone surface of a mask, meshed as skullbase_ct.py meshes v2's skull (level, smoothing, face density, baked
        shading), split into bones by the nearest of v2's bone surfaces: {bone name: {verts, tris, ao}} for `only`."""
        mesh = isosurface(b, self.a, K.SURFACE_LEVEL, 0.6, self.faces)
        V, F = np.asarray(mesh.vertices), np.asarray(mesh.faces)
        if not split:
            occ = ndimage.gaussian_filter((b > 0.5).astype(np.float32), K.AO_SIGMA_MM / K.GRID_MM)
            q = nib.affines.apply_affine(self.inv, V + K.AO_OFFSET_MM * np.asarray(mesh.vertex_normals)).T
            around = ndimage.map_coordinates(occ, q, order=1, mode="nearest")
            return {"verts": V, "tris": F, "ao": np.clip((K.AO_SHUT - around) / (K.AO_SHUT - K.AO_OPEN), 0, 1)}
        _, j = cKDTree(self.zp).query(V)
        vlab = self.zl[j]
        flab = np.array([np.bincount(r, minlength=len(self.znames)).argmax() for r in vlab[F]])
        occ = ndimage.gaussian_filter((b > 0.5).astype(np.float32), K.AO_SIGMA_MM / K.GRID_MM)
        q = nib.affines.apply_affine(self.inv, V + K.AO_OFFSET_MM * np.asarray(mesh.vertex_normals)).T
        around = ndimage.map_coordinates(occ, q, order=1, mode="nearest")
        ao = np.clip((K.AO_SHUT - around) / (K.AO_SHUT - K.AO_OPEN), 0, 1)
        out = {}
        for k, n in enumerate(self.znames):
            sel = F[flab == k]
            if n not in only or len(sel) < 50:
                continue
            used, inv_i = np.unique(sel, return_inverse=True)
            out[n] = {"verts": V[used].round(3).tolist(), "tris": inv_i.reshape(-1, 3).tolist(), "ao": ao[used].round(3).tolist()}
        return out


def flakes(V: np.ndarray, T: np.ndarray, near: np.ndarray) -> np.ndarray:
    """The faces of the loose pieces a smoothed cut edge leaves where the bone is thin: connected pieces of the cut
    surface (all bones together) under FLAKE_MM2 with a face near the cut (the CT's own small pieces elsewhere stay)."""
    import trimesh
    m = trimesh.Trimesh(V, T, process=False)
    lab = trimesh.graph.connected_component_labels(m.face_adjacency, node_count=len(T))
    area = np.bincount(lab, weights=m.area_faces)
    close = np.bincount(lab, weights=near.astype(float)) > 0
    return (close & (area < FLAKE_MM2))[lab]


def soft_cut(cut: np.ndarray, soft_mm: float) -> np.ndarray:
    """How much of the bone a cut removes, 0..1: the mask itself, or with soft_mm a Gaussian of it, so the cut's edge (where
    the bone left falls to the surface level) is a smooth curve rather than the grid's steps."""
    return ndimage.gaussian_filter(cut.astype(np.float32), soft_mm / STEP) if soft_mm > 0 else cut.astype(np.float32)


def pterional(S: Skull) -> dict:
    """Four burr holes joined (Yilmaz 2025; three in Sevgi 2026), and the lateral sphenoid ridge drilled."""
    lat = np.array([1.0, 0, 0])
    pter = S.lm("Sphenoidal angle of parietal bone")
    n_p = S.outward(pter)
    zyg = S.lm("Zygomatic process of frontal bone")
    keyhole = S.surface(zyg + np.array([0, -3.0, 6.0]), S.outward(zyg))
    so = S.lm("(Supra-orbital notch)")
    frontal = S.surface(so + np.array([10.0, -8.0, 20.0]), S.outward(so))
    fs = S.lm("Foramen spinosum")
    root = S.surface(np.array([0, fs[1], fs[2] + 14.0]) + lat * 30, lat)
    post = S.surface(pter + np.array([0, -30.0, 18.0]), S.outward(pter + np.array([0, -30.0, 18.0])))
    holes = np.array([frontal, keyhole, root, post])
    outline = oval(holes, n_p)
    # (the flap lies behind the zygomatic bone, which stays: its lines of sight pass through it to the squama and the
    # greater wing behind, and it is not cut)
    b0 = S.b
    S.b = np.where(zygomatic(S, outline), 0.0, b0).astype(np.float32)
    try:
        whole = S.flap(outline, n_p, smooth=True, floor=False)
        m = S.keep_floor(whole.copy())
    finally:
        S.b = b0
    # (the corners the floor's rule leaves, rounded: the flap's outline seen face on smoothed)
    m = round_footprint(S, whole, m, n_p, PT_ROUND_MM)
    free = inside_outline(S, whole, n_p, PT_EDGE_MM)
    m = no_slots(S, whole, m, n_p, SLOT_MM) | (m & free)
    acp = S.lm("Anterior clinoid process")
    ridge0 = S.surface(pter, n_p)
    stop = acp + RIDGE_STOP_MM * unit(ridge0 - acp)
    seg = stop - ridge0

    def near_ridge(P):
        t = np.clip(((P - ridge0) @ seg) / (seg @ seg), 0, 1)
        return np.linalg.norm(P - (ridge0 + t[:, None] * seg), axis=1) <= RIDGE_RADIUS_MM
    drill = S.region(near_ridge, (ridge0 + stop) / 2, np.linalg.norm(seg) / 2 + RIDGE_RADIUS_MM + 1)
    how = ("A flap through the skull joining four burr holes on this skull: the keyhole just above the frontozygomatic suture "
           "(Yilmaz 2025, Sevgi 2026; the model's zygomatic process of the frontal bone, raised 6 mm); a frontal hole near the "
           f"superior orbital rim (Yilmaz 2025; here 20 mm above and 10 mm lateral to the supraorbital notch, "
           f"{np.linalg.norm(frontal - keyhole):.0f} mm from the keyhole); a temporal hole on the squama near the zygomatic root "
           "(Sevgi 2026; here 14 mm above the level of the foramen spinosum); and a posterior hole below the superior temporal "
           "line (Yilmaz 2025: near the coronal suture; here 30 mm behind and 18 mm above the pterion, illustrative). Then the "
           f"lateral sphenoid ridge drilled (a {RIDGE_RADIUS_MM:.0f} mm radius along the ridge), stopping {RIDGE_STOP_MM:.0f} mm "
           "short of the anterior clinoid process (illustrative: Yilmaz 2025 limits this resection at the meningo-orbital artery "
           "in the orbitozygomatic approach, which the model does not show). "
           f"The flap is the oval round the four holes (seen face on, they lie on its margin), a smooth curve as a craniotome "
           f"cuts it, behind the zygomatic bone (which stays), leaving no slot under bone it keeps narrower than "
           f"{2 * SLOT_MM:g} mm, the "
           f"corners where the cranial floor is kept rounded over {PT_ROUND_MM:g} mm and its edge smoothed over {PT_SOFT_MM:.0f} mm (illustrative). "
           f"Burr holes: {fmt(keyhole)}, {fmt(frontal)}, {fmt(root)}, {fmt(post)}.")
    return {"id": "pterional", "name": "Pterional (frontotemporal) craniotomy", "cut": m | drill, "how": how, "softMm": PT_SOFT_MM, "guard": ~free,
            "burrHoles": [keyhole.round(1).tolist(), frontal.round(1).tolist(), root.round(1).tolist(), post.round(1).tolist()]}


def zygomatic(S: "Skull", near: np.ndarray, reach_mm: float = 45.0) -> np.ndarray:
    """The zygomatic bone's voxels on the bone grid (bone whose nearest model vertex is the zygomatic bone's), within
    reach_mm of the points `near`."""
    out = np.zeros(S.b.shape, bool)
    c = near.mean(0)
    ijk = np.argwhere(S.b > 0.3)
    P = nib.affines.apply_affine(S.a, ijk)
    close = np.linalg.norm(P - c, axis=1) < reach_mm
    _, j = cKDTree(S.zp).query(P[close])
    zyg = np.char.startswith(np.array(S.znames)[S.zl[j]].astype(str), "Zygomatic bone")
    out[tuple(ijk[close][zyg].T)] = True
    return out


def inside_outline(S: "Skull", whole: np.ndarray, n: np.ndarray, mm: float) -> np.ndarray:
    """The voxels of a flap's run (whole) whose line of sight (n) lies more than mm inside its outline, seen face on."""
    n = unit(n)
    e1 = unit(np.cross(n, [0, 0, 1.0]) if abs(n[2]) < 0.9 else np.cross(n, [1.0, 0, 0]))
    e2 = np.cross(n, e1)
    iw = np.argwhere(whole)
    P = nib.affines.apply_affine(S.a, iw)
    uv = np.c_[P @ e1, P @ e2]
    lo = uv.min(0) - 2 * mm
    ij = np.rint((uv - lo) / STEP).astype(int)
    F = np.zeros(tuple(ij.max(0) + int(2 * mm / STEP) + 2), bool)
    F[tuple(ij.T)] = True
    F = ndimage.binary_closing(F, iterations=2)
    deep = (ndimage.distance_transform_edt(F) * STEP)[tuple(ij.T)] > mm
    out = np.zeros_like(whole)
    out[tuple(iw[deep].T)] = True
    return out


def no_slots(S: "Skull", whole: np.ndarray, cut: np.ndarray, n: np.ndarray, mm: float) -> np.ndarray:
    """A cut that leaves no pocket narrower than about 2 x mm under bone it keeps (as under a thin layer the floor's
    rule keeps, by the outline): where the bone left, closed with a ball of radius mm, would fill the cut, and that lies
    behind a voxel kept (in whole, not in cut) along its line of sight (n, outward), it is not cut."""
    lo = np.maximum(np.argwhere(cut).min(0) - 10, 0)
    hi = np.argwhere(cut).max(0) + 11
    box = tuple(slice(l, h) for l, h in zip(lo, hi))
    r = int(round(mm / STEP))
    ball = np.linalg.norm(np.mgrid[-r:r + 1, -r:r + 1, -r:r + 1], axis=0) <= r
    left = (S.b[box] > K.SURFACE_LEVEL) & ~cut[box]
    shut = ndimage.binary_closing(np.pad(left, r), ball)[r:-r, r:-r, r:-r]
    fill = np.zeros_like(cut)
    fill[box] = shut & cut[box]
    n = unit(n)
    e1 = unit(np.cross(n, [0, 0, 1.0]) if abs(n[2]) < 0.9 else np.cross(n, [1.0, 0, 0]))
    e2 = np.cross(n, e1)
    iw = np.argwhere(whole)
    P = nib.affines.apply_affine(S.a, iw)
    _, key = np.unique(np.rint(np.c_[P @ e1, P @ e2] / STEP).astype(np.int64), axis=0, return_inverse=True)
    w = P @ n
    kept = ~cut[tuple(iw.T)]
    top_kept = np.full(key.max() + 1, -np.inf)
    np.maximum.at(top_kept, key[kept], w[kept])
    behind = np.zeros_like(cut)
    behind[tuple(iw[w < top_kept[key]].T)] = True
    out = cut.copy()
    out[fill & behind] = False
    return out


def round_footprint(S: "Skull", whole: np.ndarray, cut: np.ndarray, n: np.ndarray, sigma_mm: float) -> np.ndarray:
    """A flap's cut with its outline, seen along n, smoothed (a Gaussian of sigma_mm on its footprint, at half): along
    lines of sight inside both the cut keeps what it was; where the smoothed outline fills a corner it takes the whole
    run of the flap there; where it trims one, nothing. Never outside the flap (whole)."""
    n = unit(n)
    e1 = unit(np.cross(n, [0, 0, 1.0]) if abs(n[2]) < 0.9 else np.cross(n, [1.0, 0, 0]))
    e2 = np.cross(n, e1)
    iw = np.argwhere(whole)
    Pw = nib.affines.apply_affine(S.a, iw)
    uv = np.c_[Pw @ e1, Pw @ e2]
    lo = uv.min(0) - 3 * sigma_mm
    ij = np.rint((uv - lo) / STEP).astype(int)
    shape = tuple(ij.max(0) + int(3 * sigma_mm / STEP) + 2)
    in_cut = cut[tuple(iw.T)]
    F = np.zeros(shape, bool)
    F[tuple(ij[in_cut].T)] = True
    F = ndimage.binary_closing(F, iterations=2)
    Fs = ndimage.gaussian_filter(F.astype(np.float32), sigma_mm / STEP) > 0.5
    col_f, col_s = F[tuple(ij.T)], Fs[tuple(ij.T)]
    keep = (col_f & col_s & in_cut) | (~col_f & col_s)
    out = np.zeros_like(cut)
    out[tuple(iw[keep].T)] = True
    return out


def oval(points: np.ndarray, n: np.ndarray) -> np.ndarray:
    """A rounded outline through points (in order, seen along n): each side's middle bowed outward from their centre by
    PT_BULGE of the side's length (the front side, from the frontal hole to the keyhole, hardly: it would reach the
    zygomatic bone), the points and the bows to be joined by a smooth curve (flap(smooth=True))."""
    n = unit(n)
    c = points.mean(0)
    out = []
    for i in range(len(points)):
        p, q = points[i], points[(i + 1) % len(points)]
        mid = (p + q) / 2
        away = mid - c
        away = unit(away - (away @ n) * n)
        out += [p, mid + away * PT_BULGE[i] * np.linalg.norm(q - p)]
    return np.array(out)


def outline_area(outline: np.ndarray, n: np.ndarray) -> float:
    """Area (mm2) of an outline seen along n."""
    n = unit(n)
    e1 = unit(np.cross(n, [0, 0, 1.0]))
    e2 = np.cross(n, e1)
    c = outline.mean(0)
    x, y = (outline - c) @ e1, (outline - c) @ e2
    return float(0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1))))


def lateral_supraorbital(S: Skull) -> dict:
    """One burr hole posteriorly below the temporal line, a frontolateral flap over the orbital roof down to the anterior
    fossa floor (Cha 2012, Choque-Velasquez 2018); no sphenoid ridge drilling (that is the pterional's)."""
    pts = [S.lm(name) + np.array(off) for name, off in LSO_OUTLINE]
    centre = np.mean(pts, axis=0)
    n = S.outward(centre)
    outline = np.array([S.surface(p, S.outward(p)) for p in pts])
    m = S.keep_below_cavity(S.flap(outline, n, smooth=True))       # the basal part drilled flush with the floor, the roof kept
    # a frontal craniotomy: the cut keeps to the frontal bone (the outline's corner reaches the coronal suture)
    idx = np.argwhere(m)
    _, j = cKDTree(S.zp).query(nib.affines.apply_affine(S.a, idx))
    off = np.array(S.znames)[S.zl[j]] != "Frontal bone"
    m[tuple(idx[off].T)] = False
    area = outline_area(outline, n)
    how = ("A frontolateral flap over the orbital roof, with one burr hole posteriorly just below the temporal line (Cha 2012, "
           "Choque-Velasquez 2018), cut down to the anterior fossa floor (the basal part drilled off, Cha 2012); the sphenoid "
           f"ridge is not drilled. Its outline is placed by hand on this skull: about {area:.0f} mm² seen face on, larger than the "
           f"mean LSO craniotomy of {LSO_MEAN_AREA:.0f} mm² (Cha 2012) on purpose, to show the anatomy (illustrative), its basal edge "
           f"at the level of the orbital roof. The outline is a smooth curve through those points and the cut's edge is smoothed over "
           f"{LSO_SOFT_MM:.0f} mm (illustrative). Burr hole: {fmt(outline[LSO_BURR_HOLE])}.")
    return {"id": "lso", "name": "Lateral supraorbital craniotomy", "cut": m, "how": how, "burrHoles": [outline[LSO_BURR_HOLE].round(1).tolist()],
            "outline": outline.round(1).tolist(), "areaMm2": round(area), "softMm": LSO_SOFT_MM}


def retrosigmoid(S: Skull) -> dict:
    """A right retrosigmoid craniotomy, its upper edge along the transverse sinus' lower margin and its front edge along the
    sigmoid sinus' posterior margin (Jian 2021: the window's upper and front margins against them), here this CT's own
    sinuses (traced through its lumen, skullbase_v3.py: sinuses.json), RS_SINUS_GAP_MM off their margins. The keypoint is
    where the two margins meet (Jian 2021, 2022, 2024). The edges run RS_FLAP_MM along the sinuses (back along the
    transverse, down along the sigmoid); straight edges behind and below close the flap and its corners are rounded (a
    shape drawn by hand, larger than a keyhole to show the anatomy). Everything is drawn on the inner table and carried
    out through the bone. The burr hole RS_DRILL_BEHIND_MM behind and below the keypoint."""
    sin = json.loads((BUILD / "sinuses.json").read_text())
    sig = np.array(sin["sigmoid"]["R"]["path"])[::-1]     # from the junction down to the jugular bulb
    trn = np.array(sin["transverse"]["R"]["path"])        # from the junction back to the torcular
    r_s = np.array(sin["sigmoid"]["R"]["radius"])[::-1]
    r_t = np.array(sin["transverse"]["R"]["radius"])
    J = trn[0]
    n = S.outward(J)
    flat = lambda v: v - (v @ n) * n                      # noqa: E731  in the plane of the skull's surface there
    e_back = unit(flat(trn[min(len(trn) - 1, 12)] - J))
    e_down = unit(flat(sig[min(len(sig) - 1, 12)] - J) - (flat(sig[min(len(sig) - 1, 12)] - J) @ e_back) * e_back)

    def margin(path, rad, length, towards):
        """The sinus' margin on the flap's side: its centre line (to `length` mm along it) moved by its radius plus the
        gap, square to it in the surface's plane, towards the flap."""
        arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
        keep = arc <= length
        P, R = path[keep], rad[keep]
        T = np.gradient(P, axis=0)
        out = []
        for p_, t_, r_ in zip(P, T, R):
            side = flat(towards) - (flat(towards) @ unit(flat(t_))) * unit(flat(t_))
            out.append(p_ + (r_ + RS_SINUS_GAP_MM) * unit(side))
        return np.array(out)
    upper = margin(trn, r_t, RS_FLAP_MM[0], e_down)       # under the transverse sinus, from the junction back
    front = margin(sig, r_s, RS_FLAP_MM[1], e_back)       # behind the sigmoid sinus, from the junction down
    # the keypoint: where the two margins meet (their nearest points near the junction)
    i, j = np.unravel_index(np.argmin(np.linalg.norm(upper[:8, None] - front[None, :8], axis=2)), (min(8, len(upper)), min(8, len(front))))
    inner_key = (upper[i] + front[j]) / 2
    upper, front = np.vstack([inner_key, upper[i + 1:]]), np.vstack([inner_key, front[j + 1:]])
    # closed behind and below by straight edges (a back edge as long as the front one, parallel to it), the corners then
    # rounded by corner cutting: the long straight edges' corners round most, the edges along the sinuses keep their course
    K, U, F = inner_key, upper[-1], front[-1]
    B = U + (F - K)
    inner = np.vstack([upper, B[None], front[::-1][:-1]])
    for _ in range(RS_CORNER_CUTS):
        nxt = np.roll(inner, -1, axis=0)
        inner = np.vstack([np.c_[0.75 * inner + 0.25 * nxt, 0.25 * inner + 0.75 * nxt].reshape(-1, 3)])
    outline = np.array([S.surface(p_, n) for p_ in inner])
    key = S.surface(inner_key, n)
    drill = S.surface(inner_key + RS_DRILL_BEHIND_MM / np.sqrt(2) * (e_back + e_down), n)
    m = S.flap(outline, n, floor=False, smooth=True)
    area = outline_area(outline, n)
    how = (f"A right retrosigmoid craniotomy: its upper edge along the transverse sinus' lower margin for {RS_FLAP_MM[0]:.0f} mm and its "
           f"front edge along the sigmoid sinus' posterior margin for {RS_FLAP_MM[1]:.0f} mm (Jian 2021: the window's upper and front margins "
           "against the two sinuses), closed behind and below by straight edges, its corners rounded; larger than Jian 2021's keyhole "
           "(18-20 x 20-25 mm), about the size of the craniotomies in Tang 2025 (a mean 3.8 cm across), the shape drawn by hand "
           "(illustrative). The sinuses are this CT's own "
           f"(traced through its lumen), the edges {RS_SINUS_GAP_MM:.0f} mm off their margins, drawn on the inner table and carried out "
           "through the bone. The keypoint is where the two margins meet (Jian 2021, 2022, 2024); the burr hole "
           f"{RS_DRILL_BEHIND_MM} mm behind and below it (Jian 2021). About {area:.0f} mm² seen face on; its edge smoothed over "
           f"{RS_SOFT_MM:.0f} mm (illustrative). Keypoint: {fmt(key)}; burr hole: {fmt(drill)}.")
    return {"id": "retrosigmoid", "name": "Retrosigmoid craniotomy", "cut": m, "how": how, "burrHoles": [drill.round(1).tolist()],
            "keypoint": key.round(1).tolist(), "outline": outline.round(1).tolist(), "areaMm2": round(area), "softMm": RS_SOFT_MM}


def bregma(S: Skull) -> np.ndarray:
    """Where the coronal suture meets the midline, on this skull: midway between the rearmost frontal-bone point and the
    foremost parietal-bone point near the midline at the vertex (the two bones' labels overlap there by about a
    centimetre), on the outer surface."""
    F = np.array(S.bones["Frontal bone"]["verts"], float)
    P = np.vstack([np.array(S.bones[n]["verts"], float) for n in ("Parietal bone.r", "Parietal bone.l")])
    f = F[(np.abs(F[:, 0]) < 3) & (F[:, 2] > F[:, 2].max() - 25)]
    p = P[(np.abs(P[:, 0]) < 3) & (P[:, 2] > F[:, 2].max() - 25)]
    y = 0.5 * (f[:, 1].min() + p[:, 1].max())
    return S.surface(np.array([0.0, y, 80.0]), np.array([0.0, 0.0, 1.0]))


def interhemispheric(S: Skull) -> dict:
    """A right parasagittal craniotomy at the coronal suture, its medial edge on the midline over the superior sagittal
    sinus (Nair 2016: right precoronal parasagittal; Symss 2014: right frontoparietal midline)."""
    b = bregma(S)
    up = np.array([0.0, 0.0, 1.0])
    pts = []
    for y in np.linspace(b[1] - IH_BACK_MM, b[1] + IH_FRONT_MM, 9):         # the medial edge, on the midline
        pts.append(np.array([0.0, y, b[2]]))
    for y in np.linspace(b[1] + IH_FRONT_MM, b[1] - IH_BACK_MM, 9):         # the lateral edge
        pts.append(np.array([IH_WIDTH_MM, y, b[2] - 15.0]))
    outline = np.array([S.surface(p, S.outward(p) if p[0] > 0 else up) for p in pts])
    n = S.outward(outline.mean(0))
    m = S.flap(outline, n)
    idx = np.argwhere(m)                                   # the right side only: the medial edge stops at the midline
    m[tuple(idx[nib.affines.apply_affine(S.a, idx)[:, 0] < -1.0].T)] = False
    area = outline_area(outline, n)
    how = (f"A right parasagittal flap at the coronal suture, its medial edge on the midline (over the superior sagittal sinus): "
           f"from {IH_FRONT_MM:.0f} mm in front of bregma to {IH_BACK_MM:.0f} mm behind it and {IH_WIDTH_MM:.0f} mm wide, about "
           f"{area:.0f} mm² seen from above (illustrative: the sources describe a right precoronal parasagittal or frontoparietal "
           f"midline craniotomy without giving its size). Bregma here: {fmt(b)}, where this skull's frontal and parietal bones meet at the midline.")
    return {"id": "interhemispheric", "name": "Right parasagittal craniotomy", "cut": m, "how": how, "burrHoles": [b.round(1).tolist()],
            "bregma": b.round(1).tolist(), "span": [round(float(b[1]) - IH_BACK_MM, 1), round(float(b[1]) + IH_FRONT_MM, 1)],
            "areaMm2": round(area)}


def foramen_rim(S: Skull, x: float) -> np.ndarray:
    """The posterior rim of the foramen magnum at x: going back from the foramen's centre (the fitted landmark) within a
    few millimetres of its height, the foremost bone met (the rim's inner edge)."""
    fm = S.lms["Foramen magnum"]
    best = None
    for dz in np.arange(-8.0, 8.01, 1.0):
        P = np.array([fm[0] + x, fm[1], fm[2] + dz]) - np.arange(0, 40, 0.25)[:, None] * np.array([0.0, 1.0, 0.0])
        hit = S.bone_at(P)
        if hit.any() and not hit[0]:
            q = P[int(np.argmax(hit))]
            if best is None or q[1] > best[1]:
                best = q
    if best is None:
        raise SystemExit(f"no rim of the foramen magnum behind its centre at x = {x}")
    return best


def suboccipital(S: Skull) -> dict:
    """A midline suboccipital craniotomy for the telovelar approach: from below the confluence of the sinuses down to the
    foramen magnum, its posterior rim taken with the flap, the posterior arch of C1 left (Cho 2024: not removed in 39 of
    40 children)."""
    iop, fm = S.lms["Internal occipital protuberance"], S.lms["Foramen magnum"]
    z_top, z_bot = iop[2] - SO_BELOW_IOP_MM, fm[2] + 2.0
    y_at = lambda z: iop[1] + (fm[1] - 20.0 - iop[1]) * (z - iop[2]) / (fm[2] - iop[2])   # noqa: E731  roughly on the squama
    w = SO_HALF_WIDTH_MM
    right = [(0, z_top), (0.6 * w, z_top - 1), (w, z_top - 5), (1.1 * w, 0.5 * (z_top + z_bot))]
    left = [(-1.1 * w, 0.5 * (z_top + z_bot)), (-w, z_top - 5), (-0.6 * w, z_top - 1)]
    upper = lambda xz: [S.surface(np.array([x, y_at(z), z]), S.outward(np.array([x, y_at(z), z]))) for x, z in xz]   # noqa: E731
    # the lower edge: the foramen's posterior rim, right to left, carried SO_PAST_RIM_MM into the opening
    rim = []
    for x in np.linspace(SO_RIM_HALF_MM, -SO_RIM_HALF_MM, 5):
        q = foramen_rim(S, x)
        rim.append(q + SO_PAST_RIM_MM * unit(np.array([fm[0] - q[0], fm[1] - q[1], 0.0])))
    outline = np.array(upper(right) + rim + upper(left))
    n = S.outward(outline.mean(0))
    m = S.flap(outline, n, floor=False, deeper=SO_DEEPER_MM)
    area = outline_area(outline, n)
    how = (f"A midline suboccipital flap from {SO_BELOW_IOP_MM:.0f} mm below the internal occipital protuberance (the confluence of "
           f"the sinuses) down to the foramen magnum, its posterior rim taken {SO_RIM_HALF_MM:.0f} mm to each side of the midline; "
           f"{SO_HALF_WIDTH_MM:.0f} mm to each side above, "
           f"about {area:.0f} mm² seen from behind (illustrative: the sources describe a median suboccipital craniotomy or "
           "craniectomy without one size; a keyhole of about 2 cm in Wang 2023). The posterior arch of C1 is left (Cho 2024).")
    return {"id": "suboccipital", "name": "Midline suboccipital craniotomy", "side": "M", "cut": m, "how": how, "burrHoles": [], "areaMm2": round(area)}


def orbitozygomatic(S: Skull) -> dict:
    """The two-piece orbitozygomatic craniotomy (Yilmaz 2025): the pterional flap as drawn here, then a second piece, the
    superolateral orbital rim with the orbital roof behind it, from lateral to the supraorbital notch to just lateral to the
    frontozygomatic suture, and the zygomatic arch from in front of its root to the zygomatic bone (its anterior and
    posterior cuts)."""
    pt = pterional(S)
    notch, fz = S.lm("(Supra-orbital notch)"), S.lm("Zygomatic process of frontal bone")
    x0, x1 = notch[0] + OZ_NOTCH_LATERAL_MM, fz[0] + OZ_PAST_FZ_MM
    rim_y = min(notch[1], fz[1])
    z_lo, z_hi = fz[2] - OZ_RIM_BELOW_MM, max(notch[2], fz[2]) + OZ_RIM_ABOVE_MM

    def bar(P):     # the rim and the roof behind it: above the orbit, below the anterior fossa's floor level at the rim
        return (P[:, 0] >= x0) & (P[:, 0] <= x1) & (P[:, 1] >= rim_y - OZ_ROOF_MM) & (P[:, 2] >= z_lo) & (P[:, 2] <= z_hi)
    c = np.array([(x0 + x1) / 2, rim_y - OZ_ROOF_MM / 2, (z_lo + z_hi) / 2])
    orbit = S.region(bar, c, np.linalg.norm([x1 - x0, OZ_ROOF_MM + 15, z_hi - z_lo]) / 2 + 5)
    Z = np.array(S.bones["Zygomatic bone.r"]["verts"], float)
    back = Z[np.argmin(Z[:, 1])]
    y_front = back[1] + OZ_ARCH_FRONT_MM

    def arch(P):
        return (P[:, 0] >= OZ_ARCH_LATERAL_MM) & (P[:, 1] <= y_front) & (P[:, 1] >= OZ_ARCH_ROOT_Y) & (np.abs(P[:, 2] - back[2]) <= OZ_ARCH_HALF_MM)
    zyg = S.region(arch, np.array([back[0], (y_front + OZ_ARCH_ROOT_Y) / 2, back[2]]), 25.0)
    # the zygoma itself: its frontal process and its body above the lower cut (Yilmaz 2025: from the zygomatic body to the
    # inferior orbital fissure, about 1 cm below its frontal and temporal processes), lateral to the infraorbital rim
    zi = S.znames.index("Zygomatic bone.r")
    ztree = cKDTree(S.zp)

    def zygoma(P):
        return (S.zl[ztree.query(P)[1]] == zi) & (P[:, 2] >= back[2] - OZ_ZYGOMA_BELOW_MM) & (P[:, 0] >= OZ_ZYGOMA_LATERAL_MM)
    zyg |= S.region(zygoma, Z.mean(0), float(np.linalg.norm(np.ptp(Z, 0)) / 2 + 2))
    # (each piece with the faint bone at its surface, so no skin of it is left)
    orbit, zyg = (ndimage.binary_dilation(x, iterations=2) & (S.b > 0.05) for x in (orbit, zyg))
    how = (pt["how"].replace(" behind the zygomatic bone (which stays),", " behind the zygomatic bone,") + " Then the orbitozygomatic piece (the two-piece craniotomy, Yilmaz 2025): the superolateral orbital rim from "
           f"{OZ_NOTCH_LATERAL_MM:g} mm lateral to the supraorbital notch to {OZ_PAST_FZ_MM:g} mm lateral to the frontozygomatic suture "
           f"(the model's zygomatic process of the frontal bone), with the orbital roof {OZ_ROOF_MM:g} mm back from the rim (illustrative), "
           f"the zygoma's frontal process and its body down to {OZ_ZYGOMA_BELOW_MM:g} mm below the arch's level (Yilmaz 2025: the cut from the "
           "zygomatic body to the inferior orbital fissure about 1 cm below its frontal and temporal processes; its medial part with "
           f"the infraorbital rim, medial of x = {OZ_ZYGOMA_LATERAL_MM:g} mm, kept; illustrative), and the zygomatic arch from "
           f"{OZ_ARCH_FRONT_MM:g} mm in front of the zygomatic bone's back end back to its root in front of the articular tubercle "
           f"(y = {OZ_ARCH_ROOT_Y:g} mm here; illustrative).")
    return {"id": "orbitozygomatic", "name": "Orbitozygomatic craniotomy", "cut": pt["cut"] | orbit | zyg, "how": how,
            "softMm": pt["softMm"], "guard": pt["guard"] & ~orbit & ~zyg, "burrHoles": pt["burrHoles"]}


def far_lateral(S: Skull) -> dict:
    """A right far lateral (lateral suboccipital) craniectomy: from under the transverse sinus and behind the sigmoid sinus
    down through the foramen magnum's posterior rim, opening into the foramen, the occipital condyle's posterior third
    drilled (Pai 2018: a lateral suboccipital craniectomy reaching the sigmoid sinus and taking the foramen magnum's rim,
    a C1 hemilaminectomy, the posterior 30-40 % of the condyle drilled; Bruneau 2008). The atlas is not part of this
    model. The outline follows this CT's own sinuses (traced through its lumen, sinuses.json) as the retrosigmoid's does,
    its corners rounded."""
    sin = json.loads((BUILD / "sinuses.json").read_text())
    sig = np.array(sin["sigmoid"]["R"]["path"])[::-1]     # from the junction down to the jugular bulb
    trn = np.array(sin["transverse"]["R"]["path"])        # from the junction back to the torcular
    r_s = np.array(sin["sigmoid"]["R"]["radius"])[::-1]
    r_t = np.array(sin["transverse"]["R"]["radius"])
    J = trn[0]
    fm = S.lms["Foramen magnum"]
    rim = []
    for x in np.linspace(FL_RIM_MM[1], FL_RIM_MM[0], 5):  # the rim, lateral to medial, carried into the opening
        q = foramen_rim(S, x)
        rim.append(q + SO_PAST_RIM_MM * unit(np.array([fm[0] - q[0], fm[1] - q[1], 0.0])))
    rim = np.array(rim)
    n = S.outward(np.vstack([J, rim]).mean(0))
    flat = lambda v: v - (v @ n) * n                      # noqa: E731

    def margin(path, rad, length, towards):
        """A sinus' margin on the opening's side (its centre line moved by its radius, square to it, towards the
        opening), to `length` mm along it."""
        arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(path, axis=0), axis=1))]
        keep = arc <= length
        out = []
        for p_, t_, r_ in zip(path[keep], np.gradient(path[keep], axis=0), rad[keep]):
            side = flat(towards(p_)) - (flat(towards(p_)) @ unit(flat(t_))) * unit(flat(t_))
            out.append(p_ + (r_ + RS_SINUS_GAP_MM) * unit(side))
        return np.array(out)
    centre = (J + rim.mean(0)) / 2
    upper = margin(trn, r_t, FL_TRANSVERSE_MM, lambda p_: centre - p_)      # under the transverse sinus, from the junction back
    lateral = margin(sig, r_s, FL_SIGMOID_MM, lambda p_: centre - p_)       # behind the sigmoid sinus, from the junction down
    # round the outline: down the sigmoid's margin, across to the rim beside the condyle, along the rim to the midline
    # side, up to the transverse sinus' margin and back along it to the junction
    # the medial edge, from the rim up to the transverse sinus' margin, bowed outwards (a rounded window, not a straight cut)
    a_, b_ = rim[-1], upper[-1]
    mid = (a_ + b_) / 2
    away = unit(flat(mid - np.vstack([lateral, rim, upper]).mean(0)))
    chord = np.linalg.norm(flat(b_ - a_))
    bow = [a_ + t * (b_ - a_) + FL_BOW * chord * np.sin(np.pi * t) * away for t in (0.25, 0.5, 0.75)]
    inner = np.vstack([lateral[1:], rim, bow, upper[::-1][:-1]])
    for _ in range(FL_CORNER_CUTS):
        nxt = np.roll(inner, -1, axis=0)
        inner = np.c_[0.75 * inner + 0.25 * nxt, 0.25 * inner + 0.75 * nxt].reshape(-1, 3)
    outline = inner           # (seen along n: where its points lie along the line of sight does not matter)
    m = S.flap(outline, n, floor=False, deeper=SO_DEEPER_MM, smooth=True)
    # the condyle's posterior third (drilled, extradural)
    cond = S.lm("Occipital condyle")
    near = S.region(lambda P: np.ones(len(P), bool), cond, FL_CONDYLE_MM)
    P = nib.affines.apply_affine(S.a, np.argwhere(near))
    y_cut = P[:, 1].min() + FL_CONDYLE_SHARE * (P[:, 1].max() - P[:, 1].min())
    drill = S.region(lambda Q: Q[:, 1] <= y_cut, cond, FL_CONDYLE_MM)
    area = outline_area(outline, n)
    how = (f"A right lateral suboccipital craniectomy (Pai 2018: lateral suboccipital, reaching the sigmoid sinus, the foramen "
           f"magnum's rim taken), its outline following this CT's own sinuses (traced through their lumen): its upper edge along the "
           f"transverse sinus' lower margin for {FL_TRANSVERSE_MM:g} mm from the junction, its lateral edge along the sigmoid sinus' "
           f"posterior margin for {FL_SIGMOID_MM:g} mm down towards the jugular bulb, and below, the foramen magnum's posterior rim taken "
           f"from x = {FL_RIM_MM[0]:g} to {FL_RIM_MM[1]:g} mm, so that the opening runs into the foramen; its medial edge bowed outwards "
           f"and its corners rounded (the extents and shape illustrative), about {area:.0f} mm² seen face on. Then the posterior third of the right occipital condyle drilled "
           f"(Pai 2018: the posterior 30-40 %; here the third of the condyle's bone within {FL_CONDYLE_MM:g} mm of its fitted landmark "
           "that lies furthest back). The hemilaminectomy of C1 that goes with it is not shown: the atlas is not part of this model.")
    return {"id": "far_lateral", "name": "Far lateral craniectomy", "cut": m | drill, "how": how, "burrHoles": [], "areaMm2": round(area)}


def preview(path: str) -> int:
    """The cuts only (no meshing): each approach's removed voxels in the frame, for checking (npz)."""
    S = Skull()
    arrs = {}
    for ap in (pterional(S), lateral_supraorbital(S), interhemispheric(S), suboccipital(S), retrosigmoid(S)):
        pts = nib.affines.apply_affine(S.a, np.argwhere(ap["cut"]))
        arrs[ap["id"]] = pts
        print(ap["id"], f"{len(pts) * STEP ** 3 / 1000:.1f} ml", sorted(S.bone_names(ap["cut"])), ap.get("areaMm2", ""))
    np.savez(path, **arrs)
    return 0


def main(only: list[str] | None = None) -> int:
    """All the approaches, or (only) those named, the others' entries in approach.json kept as they are."""
    S = Skull()
    res = json.loads((BUILD / "approach.json").read_text()) if only and (BUILD / "approach.json").exists() else {}
    makers = {"pterional": pterional, "lso": lateral_supraorbital, "interhemispheric": interhemispheric,
              "suboccipital": suboccipital, "retrosigmoid": retrosigmoid, "orbitozygomatic": orbitozygomatic, "far_lateral": far_lateral}
    for ap in (makers[k](S) for k in makers if not only or k in only):
        cut, soft, guard = ap["cut"], ap.get("softMm", 0.0), ap.get("guard")
        cutb = set(S.bone_names(cut))
        # a whole bone whose surface lies within BAND_MM of the cut (across a suture) is remeshed with it, so the two
        # meet on one surface rather than at a seam between two meshings
        touched = cutb | S.near_bones(cut, cutb)
        keep = S.whole_bones(cut, cutb) if soft else None
        bones = S.cut_bones(cut, only=touched, soft_mm=soft, guard=guard, keep=keep)
        # the bone removed: where the cut takes more than half of the bone (its smoothed edge, as the cut bones have it)
        removed = isosurface(np.minimum(S.b, S.soft(cut, soft, guard, keep)) if soft else cut.astype(np.float32), S.a,
                             K.SURFACE_LEVEL if soft else 0.5, 0.6, 60_000)
        res[ap["id"]] = {"name": ap["name"], "how": ap["how"], "side": ap.get("side", "R"), "bones": bones, "cutBones": sorted(cutb),
                         "burrHoles": ap["burrHoles"],
                         **{k: ap[k] for k in ("bregma", "span", "keypoint") if k in ap},
                         "removed": {"verts": np.asarray(removed.vertices).round(3).tolist(), "tris": np.asarray(removed.faces).tolist()},
                         "removedMl": round(float(cut.sum()) * STEP ** 3 / 1000, 1)}
        print(ap["id"], ": bones", sorted(cutb), "remeshed with them", sorted(touched - cutb), "removed", res[ap["id"]]["removedMl"], "ml")
    BUILD.mkdir(parents=True, exist_ok=True)
    (BUILD / "approach.json").write_text(json.dumps(res))
    return 0


if __name__ == "__main__":
    sys.exit(preview(sys.argv[2]) if sys.argv[1:2] == ["preview"] else main(sys.argv[2:]) if sys.argv[1:2] == ["only"] else main())
