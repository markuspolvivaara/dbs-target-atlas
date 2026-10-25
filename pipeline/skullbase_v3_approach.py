"""Skull base v3: craniotomies cut out of the CT's bone for the surgical views: the right pterional, the right lateral
supraorbital (LSO) and the right parasagittal one of the interhemispheric approach.

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
BAND_MM = 3.0           # a cut bone keeps v2's mesh farther than this from the cut
FLOOR_REACH_MM = 12.0   # a flap keeps the cranial floor's level this far in front of / beside the cavity
FLOOR_NEAR_MM = 6.0     # bone is floor when its nearest cavity, within this, lies mostly straight above it
RIDGE_RADIUS_MM = 6.0   # the lateral sphenoid ridge is drilled this far around its line (illustrative)
RIDGE_STOP_MM = 12.0    # ... stopping this short of the anterior clinoid process (illustrative)
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

    def region(self, pred, centre: np.ndarray, radius: float) -> np.ndarray:
        """Grid mask of the bone within radius of centre where pred(points in the frame) holds."""
        corners = np.array([centre - radius, centre + radius])
        ijk, P = self._grid_box(np.array([[x, y, z] for x in corners[:, 0] for y in corners[:, 1] for z in corners[:, 2]]))
        sel = (np.linalg.norm(P - centre, axis=1) <= radius) & pred(P)
        mask = np.zeros(self.b.shape, bool)
        mask[tuple(ijk[sel].T)] = True
        return mask & (self.b > K.SURFACE_LEVEL)

    def cut_bones(self, cut: np.ndarray, only: set[str], soft_mm: float = 0.0) -> dict:
        """The bones in `only`, cut: v2's mesh away from the cut, the cut mask's surface within BAND_MM of it (each new face
        given to the bone of the nearest v2 face); with soft_mm, the cut's edge smoothed (soft_cut).
        {bone name: {verts, tris, ao}}"""
        new = self.mesh_bones(self.b * (1.0 - soft_cut(cut, soft_mm)), only=None, split=False)
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
        out = {}
        for n in sorted(only):
            v, t, ao = orig[n]
            dv = dist_at(v)
            gone = (dv <= BAND_MM)[t].any(1)
            keep = t[~gone]
            reach = float(dv[t[gone]].max()) + 0.5 if gone.any() else BAND_MM    # the patch covers every face taken away
            patch = NF[(new_lab == names.index(n)) & (new_d <= reach)]
            used_o, inv_o = np.unique(keep, return_inverse=True)
            used_p, inv_p = np.unique(patch, return_inverse=True)
            V2, T2, A2 = np.vstack([v[used_o], NV[used_p]]), np.vstack([inv_o.reshape(-1, 3), inv_p.reshape(-1, 3) + len(used_o)]), np.r_[ao[used_o], NA[used_p]]
            if soft_mm > 0:
                V2, T2, A2 = drop_flakes(V2, T2, A2, dist_at)
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


def drop_flakes(V: np.ndarray, T: np.ndarray, ao: np.ndarray, dist_at) -> tuple:
    """A cut bone without the loose pieces its smoothed edge leaves where the bone is thin: connected pieces under
    FLAKE_MM2 within BAND_MM of the cut (the CT's own small pieces elsewhere stay)."""
    import trimesh
    m = trimesh.Trimesh(V, T, process=False)
    lab = trimesh.graph.connected_component_labels(m.face_adjacency, node_count=len(T))
    area = np.bincount(lab, weights=m.area_faces)
    near = np.bincount(lab, weights=(dist_at(m.triangles_center) <= BAND_MM).astype(float)) > 0
    keep = ~(near & (area < FLAKE_MM2))[lab]
    used, inv = np.unique(T[keep], return_inverse=True)
    return V[used], inv.reshape(-1, 3), ao[used]


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
    outline = np.array([frontal, keyhole, root, post])
    m = S.flap(outline, n_p)
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
           f"Burr holes: {fmt(keyhole)}, {fmt(frontal)}, {fmt(root)}, {fmt(post)}.")
    return {"id": "pterional", "name": "Pterional (frontotemporal) craniotomy", "cut": m | drill, "how": how,
            "burrHoles": [keyhole.round(1).tolist(), frontal.round(1).tolist(), root.round(1).tolist(), post.round(1).tolist()]}


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


def main() -> int:
    S = Skull()
    res = {}
    for ap in (pterional(S), lateral_supraorbital(S), interhemispheric(S), suboccipital(S), retrosigmoid(S)):
        cut, soft = ap["cut"], ap.get("softMm", 0.0)
        touched = set(S.bone_names(cut))
        bones = S.cut_bones(cut, only=touched, soft_mm=soft)
        # the bone removed: where the cut takes more than half of the bone (its smoothed edge, as the cut bones have it)
        removed = isosurface(np.minimum(S.b, soft_cut(cut, soft)) if soft else cut.astype(np.float32), S.a,
                             K.SURFACE_LEVEL if soft else 0.5, 0.6, 60_000)
        res[ap["id"]] = {"name": ap["name"], "how": ap["how"], "side": ap.get("side", "R"), "bones": bones, "burrHoles": ap["burrHoles"],
                         **{k: ap[k] for k in ("bregma", "span", "keypoint") if k in ap},
                         "removed": {"verts": np.asarray(removed.vertices).round(3).tolist(), "tris": np.asarray(removed.faces).tolist()},
                         "removedMl": round(float(cut.sum()) * STEP ** 3 / 1000, 1)}
        print(ap["id"], ": bones", sorted(bones), "removed", res[ap["id"]]["removedMl"], "ml")
    BUILD.mkdir(parents=True, exist_ok=True)
    (BUILD / "approach.json").write_text(json.dumps(res))
    return 0


if __name__ == "__main__":
    sys.exit(preview(sys.argv[2]) if sys.argv[1:2] == ["preview"] else main())
