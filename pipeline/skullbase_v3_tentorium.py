"""Skull base v3: the tentorium cerebelli as a surface anchored on this CT: the boundary that the cerebrum's fit
(skullbase_brain.py) and the hindbrain's (skullbase_pfossa.py) share.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_tentorium.py      (prints its report; the two fits build it themselves)

A CT angiogram shows the tentorium itself only faintly, but it shows what the tentorium is attached to and what runs in
it. The surface is drawn through three of this CT's own structures:
  the transverse sinuses, traced through this CT's enhanced lumen (skullbase_v3_base.traced_sinuses): they lie in the
  tentorium's posterior attachment;
  the straight sinus (TopBrain's label, skeletonised): it runs where the falx meets the tentorium, the tentorium's
  ridge in the midline;
  the petrous ridges, on this CT's bone: the crest of the cranial floor seen from above, sought RIDGE_SEARCH_MM to
  either side of the fitted superior petrosal sinus (v2's Z-Anatomy fit, used only as a guide to where to look, its
  lateral end moved onto this CT's sigmoid-transverse junction): the tentorium's anterolateral attachment.
It is the thin-plate spline through them: its height over the frame's horizontal plane (SMOOTHING lets it pass an
anchor by a fraction of a millimetre). That is a modelling choice: between the ridge in the midline and its attachments
the tentorium is taken to be the smoothest sheet.

The sheet covers the footprint of the Z-Anatomy model's tentorium as fitted onto this CT in Skull base v2, as far out
as this CT's own attachments (the outline of the anchors), so its free edge round the midbrain (the incisura) is the
model's and not this patient's: a CT does not show it. Inside the incisura there is no sheet and nothing is held back.

What it replaces: until November 2026 both fits took that fitted model's tentorium itself, as a soft term. Against
this CT it lies 12 mm (right) and 10 mm (left) above the traced transverse sinuses at its rim and 6 mm (up to 15 mm)
below the straight sinus's centre line in the midline (report()); the cerebellum was fitted up to it, the cerebrum
was not held by it, and the two overlapped by 21 ml on a 1 mm grid, with the transverse sinuses inside both (the
audit of November 2026, finding MB-03).

Both fits now treat it as a wall: the cerebrum's cavity ends on it from above, the cerebellum's from below, and both
keep off the traced transverse sinuses and the labelled straight sinus by their radius, and off the superior petrosal
sinuses on the ridges (walls()).
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.interpolate import RBFInterpolator
from scipy.spatial import Delaunay, cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
BUILD = ROOT / "data" / "build" / "skullbase-v3"
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
LABELS = ROOT / "data" / "raw" / "topbrain" / "topcow_ct_011.nii.gz"
STRAIGHT_SINUS = 36          # TopBrain's label "StS"
RIDGE_SEARCH_MM = 12.0       # the petrous ridge's crest is sought this far to either side of its guide ...
RIDGE_STEP_MM = 1.5          # ... every this far along it
RIDGE_Z_MM = 8.0             # ... and within this of its height
ANCHOR_CELL_MM = 1.5         # one anchor per cell of this size (the spline's system stays well posed)
SMOOTHING = 2.0              # the thin-plate spline's smoothing
FLOOR_LO, FLOOR_HI, FLOOR_STEP = (-85.0, -130.0, -70.0), (85.0, 85.0, 120.0), 1.0   # the grid the cranial floor is read on (frame mm)
CAVITY_SEAL_MM = 5           # as skullbase_brain.py: the bone dilated this much to close the foramina
CAVITY_FLOOR_Z = -40.0
FOOT_STEP_MM = 1.0           # the sheet's footprint, rasterised this finely
FOOT_MARGIN_MM = 2.0         # ... and kept to within this of the outline of the surface's anchors
SINUS_MIN_MM = 1.0           # a sinus's radius as a wall: at least this
PETROSAL_MM = 1.2            # the superior petrosal sinus on the ridge's crest, as a wall: a tube of this radius (its own and a gap)
FOSSA_MARGIN_MM = 8.0        # the posterior fossa's outline reaches this far beyond the transverse sinuses (the bone behind them)


def _ball(r: int) -> np.ndarray:
    g = np.mgrid[-r:r + 1, -r:r + 1, -r:r + 1]
    return (g ** 2).sum(0) <= r * r


def cranial_floor() -> tuple[np.ndarray, np.ndarray]:
    """The cranial floor seen from above, on a FLOOR_STEP grid of the frame: each column's lowest point of the
    intracranial cavity (nan where the column holds none), and the cavity itself (as skullbase_brain.Patient finds it)."""
    c = np.load(CT_BUILD / "bone.npz")
    f = np.load(CT_BUILD / "frame.npz")
    b, a = c["b"].astype(np.float32) > 0.4, c["a"]
    lo, st = np.array(FLOOR_LO), FLOOR_STEP
    ax = [np.arange(lo[k], FLOOR_HI[k] + 1e-6, st) for k in range(3)]
    G = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
    q = nib.affines.apply_affine(np.linalg.inv(a), G @ f["R"].T + f["fossa"]).T
    B = ndimage.map_coordinates(b.astype(np.float32), q, order=1, mode="constant").reshape(tuple(len(x) for x in ax)) > 0.5
    del b, G, q
    Bd = ndimage.binary_dilation(B, _ball(CAVITY_SEAL_MM))
    Bd[:, :, : int(round((CAVITY_FLOOR_Z - lo[2]) / st))] = True
    Bd[[0, -1]] = True
    Bd[:, [0, -1]] = True
    Bd[:, :, -1] = True
    lab, _ = ndimage.label(~Bd)
    cav = lab == lab[tuple(np.rint((np.array([0.0, -10.0, 35.0]) - lo) / st).astype(int))]
    cav = ndimage.binary_fill_holes(ndimage.binary_dilation(cav, _ball(CAVITY_SEAL_MM)) & ~B)
    return np.where(cav.any(2), lo[2] + np.argmax(cav, axis=2) * st, np.nan), cav


def label_line(code: int) -> np.ndarray:
    """A TopBrain label's centre line with its radius, in the frame: (n, 4), sorted from back to front."""
    from skimage.morphology import skeletonize
    f = np.load(CT_BUILD / "frame.npz")
    img = nib.load(LABELS)
    m = np.asarray(img.dataobj) == code
    vox = float(np.sqrt((img.affine[:3, :3] ** 2).sum(0)).mean())
    sl = tuple(slice(max(s.start - 2, 0), s.stop + 2) for s in ndimage.find_objects(m.astype(np.uint8))[0])
    sub = m[sl]
    sk = skeletonize(sub)
    r = ndimage.distance_transform_edt(sub)[sk] * vox
    P = (nib.affines.apply_affine(img.affine, np.argwhere(sk) + np.array([s.start for s in sl])) - f["fossa"]) @ f["R"]
    o = np.argsort(P[:, 1])
    return np.c_[P, r][o]


def ridge_guide(fitted: np.ndarray, junction: np.ndarray) -> np.ndarray:
    """Where to look for a petrous ridge: the fitted superior petrosal sinus, its lateral end moved onto this CT's own
    sigmoid-transverse junction (the traced transverse sinus's lateral end, where the sinus on the ridge drains), the
    move fading to none at the petrous apex. The fitted model's junction lies about 10 mm outside and above this CT's,
    on the cranial wall, where there is no ridge to find."""
    g = fitted if np.linalg.norm(fitted[0] - junction) < np.linalg.norm(fitted[-1] - junction) else fitted[::-1]
    arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(g, axis=0), axis=1))]
    return g + (1 - arc / arc[-1])[:, None] * (junction - g[0])


def ridge_crest(guide: np.ndarray, floor: np.ndarray) -> np.ndarray:
    """A petrous ridge's crest: along the guide (points, frame mm), every RIDGE_STEP_MM, the cranial floor's local
    summit nearest the guide within RIDGE_SEARCH_MM across it (horizontally) and RIDGE_Z_MM of its height; a summit has
    floor on both sides (the cranial wall, where the floor's map ends, is none). Smoothed along the ridge."""
    lo, st = np.array(FLOOR_LO), FLOOR_STEP
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(guide[:, :2], axis=0), axis=1))]
    u = np.arange(0, d[-1], RIDGE_STEP_MM)
    gx = np.stack([np.interp(u, d, guide[:, k]) for k in range(2)], 1)
    gz = np.interp(u, d, guide[:, 2])
    t = np.gradient(gx, axis=0)
    t /= np.linalg.norm(t, axis=1, keepdims=True)
    n = np.c_[-t[:, 1], t[:, 0]]
    ss = np.arange(-RIDGE_SEARCH_MM, RIDGE_SEARCH_MM + 0.01, 0.5)
    pts = []
    for i in range(len(gx)):
        xy = gx[i] + ss[:, None] * n[i]
        ij = np.rint((xy - lo[:2]) / st).astype(int)
        ok = (ij >= 0).all(1) & (ij < np.array(floor.shape)).all(1)
        h = np.full(len(xy), np.nan)
        h[ok] = floor[tuple(ij[ok].T)]
        if not np.isfinite(h).any():
            continue
        hs = ndimage.gaussian_filter1d(np.where(np.isfinite(h), h, np.nanmin(h)), 2)
        peaks = [k for k in range(1, len(ss) - 1) if hs[k] >= hs[k - 1] and hs[k] >= hs[k + 1]
                 and np.isfinite(h[k - 1:k + 2]).all() and abs(h[k] - gz[i]) <= RIDGE_Z_MM]
        if peaks:
            k = min(peaks, key=lambda k: abs(ss[k]))
            pts.append([*xy[k], h[k]])
    return ndimage.gaussian_filter1d(np.array(pts), 2, axis=0, mode="nearest")


def _source_key() -> str:
    """What the anchors depend on: the CT's bone and labels, v2's fitted model, and the code that reads them."""
    h = hashlib.sha1()
    for p in (CT_BUILD / "bone.npz", CT_BUILD / "frame.npz", CT_BUILD / "export.json", LABELS, Path(__file__),
              ROOT / "skullbase_v3_base.py", ROOT / "skullbase_nerves.py"):
        h.update(hashlib.sha1(p.read_bytes()).digest())
    return h.hexdigest()[:16]


class Tentorium:
    """The surface, its footprint and the sinuses in it. Built once per set of inputs (tentorium.npz)."""

    def __init__(self, ex2: dict | None = None):
        cache = BUILD / "tentorium.npz"
        key = _source_key()
        if cache.exists():
            z = np.load(cache, allow_pickle=False)
            if str(z["key"]) == key:
                self._take({k: z[k] for k in z.files})
                return
        ex2 = ex2 or json.loads((CT_BUILD / "export.json").read_text())
        d = self._build(ex2)
        BUILD.mkdir(parents=True, exist_ok=True)
        np.savez(cache, key=key, **d)
        self._take(d)

    # ------------------------------------------------------------ construction
    @staticmethod
    def _build(ex2: dict) -> dict:
        import skullbase_v3_base as BASE
        f = np.load(CT_BUILD / "frame.npz")
        sin = BASE.traced_sinuses(ex2, f["fossa"], f["R"])
        tr = {s: np.c_[sin[s]["transverse"][0], sin[s]["transverse"][1]] for s in ("R", "L")}
        sts = label_line(STRAIGHT_SINUS)
        floor, _ = cranial_floor()
        ridge = {s: ridge_crest(ridge_guide(np.array(ex2["lines"][f"Superior petrosal sinus.{s.lower()}"]["runs"][0])[:, :3], tr[s][0, :3]), floor)
                 for s in ("R", "L")}
        A = np.vstack([tr["R"][::4, :3], tr["L"][::4, :3], sts[::3, :3], ridge["R"][::2], ridge["L"][::2]])
        kind = np.concatenate([np.full(len(tr["R"][::4]), 0), np.full(len(tr["L"][::4]), 0), np.full(len(sts[::3]), 1),
                               np.full(len(ridge["R"][::2]), 2), np.full(len(ridge["L"][::2]), 2)])
        _, keep = np.unique(np.rint(A[:, :2] / ANCHOR_CELL_MM).astype(int), axis=0, return_index=True)
        keep = np.sort(keep)
        A, kind = A[keep], kind[keep]
        # the sheet's footprint: where the fitted model's tentorium lies, seen from above
        V = [np.array(ex2["soft"][f"Tentorium cerebelli.{s}"]["verts"], float) for s in "rl"]
        T = [np.array(ex2["soft"][f"Tentorium cerebelli.{s}"]["tris"], int) for s in "rl"]
        allv = np.vstack(V)
        lo = np.floor(allv[:, :2].min(0)) - 3
        shape = tuple(np.ceil((allv[:, :2].max(0) + 3 - lo) / FOOT_STEP_MM).astype(int) + 1)
        W = np.zeros(shape, bool)
        for v, t in zip(V, T):
            for tri in v[t][:, :, :2]:
                mn = np.floor((tri.min(0) - lo) / FOOT_STEP_MM).astype(int)
                mx = np.ceil((tri.max(0) - lo) / FOOT_STEP_MM).astype(int)
                ii, jj = np.meshgrid(np.arange(mn[0], mx[0] + 1), np.arange(mn[1], mx[1] + 1), indexing="ij")
                p = lo + np.c_[ii.ravel(), jj.ravel()] * FOOT_STEP_MM
                a0, b0, c0 = tri
                den = (b0[1] - c0[1]) * (a0[0] - c0[0]) + (c0[0] - b0[0]) * (a0[1] - c0[1])
                if abs(den) < 1e-9:
                    continue
                w1 = ((b0[1] - c0[1]) * (p[:, 0] - c0[0]) + (c0[0] - b0[0]) * (p[:, 1] - c0[1])) / den
                w2 = ((c0[1] - a0[1]) * (p[:, 0] - c0[0]) + (a0[0] - c0[0]) * (p[:, 1] - c0[1])) / den
                ins = (w1 >= -0.05) & (w2 >= -0.05) & (w1 + w2 <= 1.05)
                W[ii.ravel()[ins], jj.ravel()[ins]] = True
        W = ndimage.binary_closing(W, iterations=2)
        # ... as far as this CT's own attachments: the fitted model's rim lies a few millimetres outside the traced
        # sinuses and the ridges' crests, over bone and over the middle fossa in front of the ridges, where the surface
        # carried on past its anchors would shut the temporal lobes off from the floor they lie on
        gx = lo + np.stack(np.meshgrid(np.arange(shape[0]), np.arange(shape[1]), indexing="ij"), -1).reshape(-1, 2) * FOOT_STEP_MM
        inside = (Delaunay(A[:, :2]).find_simplex(gx) >= 0) | (cKDTree(A[:, :2]).query(gx)[0] <= FOOT_MARGIN_MM)
        W &= inside.reshape(shape)
        return {"anchors": A, "kind": kind, "foot": W, "foot_lo": lo, "fitted": allv[::3],
                "tr_R": tr["R"], "tr_L": tr["L"], "sts": sts, "ridge_R": ridge["R"], "ridge_L": ridge["L"]}

    def _take(self, d: dict) -> None:
        self.anchors, self.kind = np.asarray(d["anchors"], float), np.asarray(d["kind"], int)
        self.foot, self.foot_lo = np.asarray(d["foot"], bool), np.asarray(d["foot_lo"], float)
        self.fitted = np.asarray(d["fitted"], float)
        self.transverse = {"R": np.asarray(d["tr_R"], float), "L": np.asarray(d["tr_L"], float)}
        self.straight = np.asarray(d["sts"], float)
        self.ridge = {"R": np.asarray(d["ridge_R"], float), "L": np.asarray(d["ridge_L"], float)}
        self._rbf = RBFInterpolator(self.anchors[:, :2], self.anchors[:, 2], kernel="thin_plate_spline", smoothing=SMOOTHING)
        self._hull = Delaunay(self.anchors[:, :2])
        self._back = cKDTree(self.anchors[self.kind == 0, :2])
        # the sinuses in it, as points with a radius (for walls()): the traced transverse sinuses, the labelled straight
        # sinus, and the superior petrosal sinuses, which run on the petrous ridges in the sheet's attached margin
        # (skullbase_v3_petrosal.py draws them resting on the crest: here a tube of PETROSAL_MM radius lying on it)
        crest = []
        for sd in ("R", "L"):
            C = self.ridge[sd]
            d = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
            u = np.arange(0.0, d[-1], 0.5)
            C = np.stack([np.interp(u, d, C[:, k]) for k in range(3)], 1)
            crest.append(np.c_[C[:, :2], C[:, 2] + PETROSAL_MM, np.full(len(C), PETROSAL_MM)])
        S = np.vstack([self.transverse["R"], self.transverse["L"], self.straight, *crest])
        self._sinus_tree, self._sinus_r = cKDTree(S[:, :3]), np.maximum(S[:, 3], SINUS_MIN_MM)

    # ------------------------------------------------------------ queries
    def height(self, xy: np.ndarray) -> np.ndarray:
        """The surface's height (frame z) over points (x, y)."""
        return self._rbf(np.asarray(xy, float)[:, :2])

    def covers(self, xy: np.ndarray) -> np.ndarray:
        """Whether the sheet lies over (x, y): inside its footprint."""
        ij = np.rint((np.asarray(xy, float)[:, :2] - self.foot_lo) / FOOT_STEP_MM).astype(int)
        ok = (ij >= 0).all(1) & (ij < np.array(self.foot.shape)).all(1)
        out = np.zeros(len(ij), bool)
        out[ok] = self.foot[tuple(ij[ok].T)]
        return out

    def fossa(self, xy: np.ndarray) -> np.ndarray:
        """Whether (x, y) lies over the posterior fossa: within the outline of the surface's attachments (the incisura
        included), under the sheet, or within FOSSA_MARGIN_MM of a transverse sinus (the occipital bone behind it)."""
        xy = np.asarray(xy, float)[:, :2]
        back = self._back.query(xy)[0] < FOSSA_MARGIN_MM
        return (self._hull.find_simplex(xy) >= 0) | self.covers(xy) | back

    def below(self, P: np.ndarray, by: float = 0.0) -> np.ndarray:
        """Points over the posterior fossa more than `by` mm below the surface (the surface carried on smoothly across
        the incisura): the infratentorial space."""
        P = np.asarray(P, float)
        out = np.zeros(len(P), bool)
        f = self.fossa(P)
        out[f] = P[f, 2] < self.height(P[f]) - by
        return out

    def sinus_depth(self, P: np.ndarray) -> np.ndarray:
        """How far inside a traced transverse sinus, the labelled straight sinus or a superior petrosal sinus's place on
        its ridge each point lies (positive inside), mm."""
        d, j = self._sinus_tree.query(np.asarray(P, float)[:, :3])
        return self._sinus_r[j] - d

    def walls(self, lo: np.ndarray, shape: tuple, step: float, side: str) -> np.ndarray:
        """On a grid of the frame, what the tentorium shuts off for the tissue on one side of it: for the cerebrum
        (side "above") everything under the sheet, for the cerebellum (side "below") everything over it; for both, the
        inside of the transverse and straight sinuses."""
        ax = [lo[k] + np.arange(shape[k]) * step for k in range(3)]
        XY = np.stack(np.meshgrid(ax[0], ax[1], indexing="ij"), -1).reshape(-1, 2)
        cov = self.covers(XY)
        h = np.full(len(XY), np.nan)
        h[cov] = self.height(XY[cov])
        h = h.reshape(shape[:2])[:, :, None]
        z = ax[2][None, None, :]
        with np.errstate(invalid="ignore"):
            wall = (z <= h) if side == "above" else (z >= h)
        # the sinuses: only near them
        S = self._sinus_tree.data
        rmax = float(self._sinus_r.max())
        i0 = np.maximum(np.floor((S.min(0) - rmax - lo) / step).astype(int), 0)
        i1 = np.minimum(np.ceil((S.max(0) + rmax - lo) / step).astype(int) + 1, np.array(shape))
        if (i1 > i0).all():
            sub = np.stack(np.meshgrid(*[ax[k][i0[k]:i1[k]] for k in range(3)], indexing="ij"), -1).reshape(-1, 3)
            ins = (self.sinus_depth(sub) > 0).reshape(tuple(i1 - i0))
            wall[i0[0]:i1[0], i0[1]:i1[1], i0[2]:i1[2]] |= ins
        return wall

    def sheet_points(self, step: float = 2.0) -> np.ndarray:
        """Points on the sheet, every `step` mm (for the fits' dura terms)."""
        n = np.ceil(np.array(self.foot.shape) * FOOT_STEP_MM / step).astype(int)
        xy = self.foot_lo + np.stack(np.meshgrid(np.arange(n[0]), np.arange(n[1]), indexing="ij"), -1).reshape(-1, 2) * step
        xy = xy[self.covers(xy)]
        return np.c_[xy, self.height(xy)]

    def content_hash(self) -> str:
        """What the two fits depend on (their caches are keyed by it)."""
        h = hashlib.sha1()
        for a in (self.anchors.round(3), self.foot, self.foot_lo, self._sinus_tree.data.round(3), self._sinus_r.round(3)):
            h.update(np.ascontiguousarray(a).tobytes())
        h.update(json.dumps([SMOOTHING, FOOT_STEP_MM, SINUS_MIN_MM, FOSSA_MARGIN_MM, PETROSAL_MM]).encode())
        return h.hexdigest()[:16]

    def report(self) -> dict:
        """For the fit reports and the Methods text: the anchors, how closely the surface passes them, and how far the
        fitted model's tentorium lies from it."""
        res = self.height(self.anchors) - self.anchors[:, 2]
        fz = self.fitted[self.covers(self.fitted)]
        off = fz[:, 2] - self.height(fz)
        names = {0: "transverseSinus", 1: "straightSinus", 2: "petrousRidge"}
        at = {}
        for s in ("R", "L"):
            P = self.transverse[s][:, :3]
            d = self.fitted[cKDTree(self.fitted[:, :2]).query(P[:, :2])[1], 2] - P[:, 2]
            at[f"fittedAboveTransverseSinus{s}Mm"] = round(float(np.median(d)), 1)
        d = self.fitted[cKDTree(self.fitted[:, :2]).query(self.straight[:, :2])[1], 2] - self.straight[:, 2]
        return {"anchors": {names[k]: int((self.kind == k).sum()) for k in names},
                "anchorMissMm": {"median": round(float(np.median(np.abs(res))), 2), "max": round(float(np.abs(res).max()), 2)},
                "footprintCm2": round(float(self.foot.sum() * FOOT_STEP_MM ** 2 / 100), 1),
                "fittedModelMinusSurfaceMm": {"median": round(float(np.median(off)), 1), "p5": round(float(np.percentile(off, 5)), 1),
                                              "p95": round(float(np.percentile(off, 95)), 1)},
                **at, "fittedBelowStraightSinusMm": {"median": round(float(np.median(-d)), 1), "max": round(float((-d).max()), 1)},
                "straightSinusRadiusMm": round(float(np.median(self.straight[:, 3])), 1),
                "transverseSinusRadiusMm": round(float(np.median(np.r_[self.transverse["R"][:, 3], self.transverse["L"][:, 3]])), 1)}


CEREBRUM = ("br_frontal_lobe", "br_parietal_lobe", "br_temporal_lobe", "br_occipital_lobe", "br_insula", "br_cingulate_gyrus", "br_medial_wall")
CEREBELLUM = ("pf_cerebellar_hemisphere", "pf_vermis", "pf_tonsil")
BETWEEN_LO, BETWEEN_HI = (-80.0, -115.0, -60.0), (80.0, 10.0, 50.0)   # the grid the two are compared on (frame mm)
OVERLAP_MAX_ML = 1.0         # the cerebrum and the cerebellum may share at most this much space
SINUS_MAX_SHARE = 0.05       # ... and at most this share of the lumen of the sinuses in the tentorium (walls()) may lie in either


def between(build: Path = BUILD, step: float = 1.0) -> dict:
    """The cerebrum and the cerebellum as built (at rest), against each other, the sheet and the sinuses in it, on a
    grid: the space they share (each hemisphere is the closed surface its pieces make together; each cerebellar piece
    is closed on its own), how much of each lies on the other's side of the sheet, and the share of the transverse
    and straight sinuses' lumen that lies inside either."""
    from glb import read_glb_full
    from skullbase_brain import fill
    t = Tentorium()
    lo = np.array(BETWEEN_LO)
    shape = tuple(np.ceil((np.array(BETWEEN_HI) - lo) / step).astype(int) + 1)
    cer = np.zeros(shape, bool)
    sides: dict = {}
    for f in CEREBRUM:
        for name, nd in read_glb_full(build / f"{f}.glb").items():
            sides.setdefault(name, []).append((nd["positions"], nd["indices"]))
    for parts in sides.values():
        off = np.cumsum([0] + [len(P) for P, _ in parts])
        cer |= fill(np.vstack([P for P, _ in parts]), np.vstack([T + o for (_, T), o in zip(parts, off)]), lo, shape, step)
    cb = np.zeros(shape, bool)
    for f in CEREBELLUM:
        for nd in read_glb_full(build / f"{f}.glb").values():
            cb |= fill(nd["positions"], nd["indices"], lo, shape, step)
    ax = [lo[k] + np.arange(shape[k]) * step for k in range(3)]
    XY = np.stack(np.meshgrid(ax[0], ax[1], indexing="ij"), -1).reshape(-1, 2)
    cov = t.covers(XY)
    h = np.full(len(XY), np.nan)
    h[cov] = t.height(XY[cov])
    h = h.reshape(shape[:2])[:, :, None]
    z = ax[2][None, None, :]
    with np.errstate(invalid="ignore"):
        under, over = cer & (z < h), cb & (z > h)
        deep = float(np.max(np.where(under, h - z, 0.0), initial=0.0))
        high = float(np.max(np.where(over, z - h, 0.0), initial=0.0))
    G = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
    lumen = (t.sinus_depth(G) > 0).reshape(shape)
    ml = step ** 3 / 1000
    return {"gridMm": step, "cerebrumMl": round(float(cer.sum() * ml), 1), "cerebellumMl": round(float(cb.sum() * ml), 1),
            "overlapMl": round(float((cer & cb).sum() * ml), 2),
            "cerebrumUnderSheetMl": round(float(under.sum() * ml), 2), "cerebrumDeepestUnderMm": round(deep, 1),
            "cerebellumOverSheetMl": round(float(over.sum() * ml), 2), "cerebellumHighestOverMm": round(high, 1),
            "sinusLumenMl": round(float(lumen.sum() * ml), 2),
            "sinusInCerebrumShare": round(float((lumen & cer).sum() / max(lumen.sum(), 1)), 3),
            "sinusInCerebellumShare": round(float((lumen & cb).sum() / max(lumen.sum(), 1)), 3)}


def check(b: dict) -> list[tuple[bool, str]]:
    """For skullbase_v3.py's validation, on between()'s report."""
    return [(b["overlapMl"] <= OVERLAP_MAX_ML, f"cerebrum and cerebellum share {b['overlapMl']} ml"),
            (b["sinusInCerebrumShare"] <= SINUS_MAX_SHARE, f"{100 * b['sinusInCerebrumShare']:.0f} % of the tentorium's sinuses' lumen inside the cerebrum"),
            (b["sinusInCerebellumShare"] <= SINUS_MAX_SHARE, f"{100 * b['sinusInCerebellumShare']:.0f} % of the tentorium's sinuses' lumen inside the cerebellum")]


def main() -> int:
    t = Tentorium()
    print(json.dumps(t.report(), indent=1))
    print("content", t.content_hash())
    b = between()
    print(json.dumps(b, indent=1))
    for ok, msg in check(b):
        print("ok  " if ok else "FAIL", msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
