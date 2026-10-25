"""Skull base v3: a brain fitted into this patient's CT, and its shapes for the surgical views (the right Sylvian fissure
opened, the frontal lobe lifted, the right hemisphere held off the falx).

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_brain.py      (then skullbase_v3.py takes its items)

A CT angiogram does not show the cortex well enough to segment it (sulci and grey matter barely differ from each other in
this one), so the brain is a template: the Lead-DBS MNI 2009b pial surface with its Destrieux and DKT labels (the cortex
section's). It is fitted into this CT (TopBrain case 011, Skull base v2's frame) by a smooth deformation, phi: frame ->
template, found by minimising together (weights in STAGES):
  the inner table: the brain's hull (sulci bridged) TABLE_GAP_MM inside the CT's intracranial cavity (a layer for the
  meninges and CSF, a modelling choice), and never within BONE_GAP_MM of bone;
  this patient's arteries and veins (TopBrain's labels, as centre lines with their radius): each outside the cortex; the
  M2 segments on the insula and the M3 segments in the Sylvian fissure (the insular and opercular segments: Gibo 1981,
  Tanriover 2004), which places the template's fissure where this patient's middle cerebral artery runs;
  the falx and tentorium (the Z-Anatomy model fitted onto this CT in Skull base v2) outside the cortex;
  a penalty on any place where the deformation shrinks the local volume below JAC_MIN of the overall scale, so it never
  folds;
in stages from an affine map to Gaussian radial basis functions on finer grids. The template surfaces (decimated) are
carried through it, and the contacts left are pushed clear (ARAP on the surface: brain_deform.ARAP) to CLEAR_CAVITY_MM
inside the cavity, CLEAR_VESSEL_MM off each vessel the model draws and CLEAR_FALX_MM on the hemisphere's own side of the
falx (where the falx is: the fit keeps the cortex off the dura only on average, and each hemisphere is carried alone).

The opening is a shape deformation, not a simulation of tissue: the lips of the right fissure (the opercula near the
brain's surface) are moved apart, the frontal and parietal opercula up by OPEN_FRONTAL_MM, the temporal down by
OPEN_TEMPORAL_MM (illustrative), each along the line between the two banks; the insula and the brain beyond OPEN_ROI_MM
stay; the rest follows as rigidly as possible (ARAP), with facing banks of other sulci held together and the brain kept
inside the cavity. The opened surface is the fitted one's morph target "open" (a slider).

A second shape, on top of the opening (target "lift"), lifts the frontal lobe off the orbital roof as a spatula would,
opening a subfrontal corridor: the orbital surface along the line from the right anterior clinoid process forward over
the orbital roof to the frontal pole (LIFT_ALONG) raised by LIFT_MM (illustrative), the anterior insula with it, the
temporal lobe and posterior insula still. Both the pterional and the lateral supraorbital views use it.

A third (target "interhemispheric", from the fitted surface) holds the right hemisphere off the falx over the
interhemispheric craniotomy (its span from skullbase_v3_approach.py's approach.json): a smooth shift to the right, IH_MM
at the midline (illustrative), only above the corpus callosum (retract_medial says how, and why it cannot fold).

The middle cerebral artery's M2 and M3 segments stay where they are, except where they lie on cortex that is moved on
purpose: on the frontal and parietal opercula they rise with them as the fissure opens, on the frontal lobe and the
insula as these are lifted (each vertex the mean displacement of the cortex it follows within SKIN_MM, the rest counted
as still).

Writes pipeline/data/build/skullbase-v3/br_*.glb and pipeline/data/build/skullbase-v3/brain.json (the items for the
manifest, and the fit report, with the anterior cerebral arteries TopBrain labels on this CT).
"""
from __future__ import annotations

import hashlib
import json
import re
import sys
import time
from pathlib import Path

import nibabel as nib
import numpy as np
import scipy.io as sio
import scipy.sparse as sp
import trimesh
from scipy import ndimage
from scipy.interpolate import griddata
from scipy.optimize import minimize
from scipy.spatial import Delaunay, cKDTree
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import brain_deform as BD  # noqa: E402
import cortex_build as CB  # noqa: E402
import cortex_labels as CL  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402
from meshcheck import self_intersections  # noqa: E402

REPO = ROOT.parent
RAW = ROOT / "data" / "raw"
KIND = "skullbase-v3"
BUILD = ROOT / "data" / "build" / KIND
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
LABELS = RAW / "topbrain" / "topcow_ct_011.nii.gz"
LABEL_MAP = RAW / "topbrain" / "labelmap_topbrain_ct.txt"
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())
CITES = json.loads((ROOT / "sources" / "citations.json").read_text())

FACES = {"R": 120_000, "L": 60_000}   # per hemisphere after decimation: the opened side finer
HULL_CLOSE_MM = 4          # the hull bridges sulci narrower than twice this
TABLE_GAP_MM = 2.0         # the hull's distance inside the cavity (meninges, CSF): a modelling choice
BONE_GAP_MM = 1.0          # ... and at least this far from bone
CAVITY_SEAL_MM = 5         # the bone is dilated this much to close the foramina when the cavity is found
CAVITY_FLOOR_Z = -40.0     # below this (the foramen magnum is at about -46 in the frame) is not the cerebrum's space
INS_REACH_MM = 1.0         # an M2 point counts as on the insula within its radius plus this
INS_CAP_MM = 5.0           # ... and is pulled only when closer than this beyond it (TopBrain's M2 runs on past the insula)
FIS_REACH_MM = 1.5         # an M2 or M3 point counts as in the fissure within its radius plus this
VESSEL_MARGIN_MM = 0.3
JAC_MIN = 0.45             # local volume change, relative to the overall scale, below which the fit is penalised
JAC_WEIGHT = 20.0
STAGES = [  # (control grid spacing = Gaussian width in mm, or 'affine'; ridge; term weights)
    ("affine", 0, dict(table=1.0, bone=0.0, out=0.0, ins=0.3, fis=0.0, m3hull=0.0, dura=0.0)),
    (18.0, 1e-4, dict(table=1.0, bone=0.0, out=0.0, ins=2.0, fis=1.0, m3hull=0.0, dura=0.0)),
    (12.0, 1e-4, dict(table=1.0, bone=0.5, out=0.5, ins=2.0, fis=1.0, m3hull=0.5, dura=0.2)),
    (8.0, 1e-4, dict(table=1.0, bone=2.0, out=4.0, ins=2.0, fis=1.0, m3hull=1.0, dura=0.5)),
    (5.0, 3e-4, dict(table=1.0, bone=2.0, out=4.0, ins=2.0, fis=1.0, m3hull=1.0, dura=0.5)),
]
REPORT_WEIGHTS = STAGES[-1][2]
OUTSIDE_CODES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 31, 32, 35, 36, 38, 39, 40]
M2_CODES = {"R": 17, "L": 19}
M3_CODES = {"R": 18, "L": 20}
FISSURE_LABELS = set(CL.INSULA_LABELS) | {"Lat_Fis-post", "Lat_Fis-ant-Horizont", "Lat_Fis-ant-Vertical", "G_temp_sup-Plan_polar",
                                           "G_temp_sup-G_T_transv", "G_temp_sup-Plan_tempo", "S_temporal_transverse"}
CLEAR_CAVITY_MM = 1.0
CLEAR_VESSEL_MM = 0.3
CLEAR_FALX_MM = 0.5         # ... and this far on its own side of the falx
FALX_GRID_MM = 0.5          # (the falx as a height field over the sagittal plane, on this grid)
FALX_NEAR_MM = 8.0          # (a vertex further than this from the falx is not near it)
CLEAR_ROUNDS = 6
CLEAR_REACH_MM = 12.0      # around the vertices pushed clear, the surface follows within this; beyond it stays
PAIR_REACH_MM = 2.5        # facing sulcal banks closer than this are held together while the surface moves
PAIR_WEIGHT = 0.5
OPEN_FRONTAL_MM = 6.0      # illustrative: how far the frontal and parietal lips are lifted at full opening
OPEN_TEMPORAL_MM = 6.0     # ... and the temporal lip lowered
LIP_DEPTH_MM = 4.0         # opercular surface within this of the brain's hull: the lips that are moved
OPEN_ROI_MM = 35.0         # the brain further than this from the opercula does not move
HOLD_MM = 3.0              # cortex this close to the inner table is held by it (does not move) ...
HOLD_FREE_MM = 10.0        # ... unless this close to a lip
SKIN_MM = 3.0
ARAP_ITERS = 15
LIFT_MM = 8.0              # illustrative: how far the frontal lobe's orbital surface is lifted
LIFT_ALONG = [             # the lift runs along the orbital roof through these fitted landmarks (right side; offsets mm),
    ("Anterior clinoid process", (0.0, 0.0, 0.0)),          # from the anterior clinoid process
    ("Orbital part of frontal bone", (0.0, 0.0, 0.0)),      # over the middle of the orbital roof
    ("(Supra-orbital notch)", (0.0, -4.0, 8.0)),            # to behind the orbital rim, under the frontal pole
]
LIFT_CORE_MM = 10.0        # full within this of that line ...
LIFT_REACH_MM = 22.0       # ... fading to none at this distance
LIFT_INSULA_SHARE = 0.5    # the anterior insula rises this share of the lift (none at its middle, all at its front)
LIFT_ROI_MM = 45.0         # the brain further than this from what is lifted does not move
IH_MM = 8.0                # illustrative: how far the right hemisphere's medial surface is held off the falx
IH_FLAT_MM = 3.0           # ... all of it within this of the midline (the medial surface) ...
IH_REACH_MM = 25.0         # ... falling to none this far from it
IH_ABOVE_CC_MM = 4.0       # ... and from none at the top of the medial wall (the callosum) to full this far above it
IH_FADE_MM = 20.0          # full over the craniotomy's length (front to back), fading to none this far beyond it


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


def topbrain_names() -> dict[int, str]:
    out = {}
    for line in LABEL_MAP.read_text().splitlines():
        if line.strip() and not line.startswith("#"):
            out[int(line.split()[0])] = line.split('"')[1]
    return out


# ---------------------------------------------------------------- the template
def fill(v: np.ndarray, f: np.ndarray, lo: np.ndarray, shape: tuple, step: float) -> np.ndarray:
    """Inside of a closed surface on a grid: parity of the crossings along z."""
    P = v[f]
    i0 = np.ceil((P[:, :, 0].min(1) - lo[0]) / step).astype(int)
    i1 = np.floor((P[:, :, 0].max(1) - lo[0]) / step).astype(int)
    j0 = np.ceil((P[:, :, 1].min(1) - lo[1]) / step).astype(int)
    j1 = np.floor((P[:, :, 1].max(1) - lo[1]) / step).astype(int)
    ni, nj = np.maximum(i1 - i0 + 1, 0), np.maximum(j1 - j0 + 1, 0)
    cnt = ni * nj
    fi = np.repeat(np.arange(len(f)), cnt)
    r = np.arange(cnt.sum()) - np.repeat(np.cumsum(cnt) - cnt, cnt)
    nj_f = np.maximum(nj[fi], 1)
    I, J = i0[fi] + r // nj_f, j0[fi] + r % nj_f
    x, y = lo[0] + step * I, lo[1] + step * J
    A, B, C = P[fi, 0], P[fi, 1], P[fi, 2]
    det = (B[:, 0] - A[:, 0]) * (C[:, 1] - A[:, 1]) - (C[:, 0] - A[:, 0]) * (B[:, 1] - A[:, 1])
    det = np.where(np.abs(det) < 1e-12, np.nan, det)
    u = ((x - A[:, 0]) * (C[:, 1] - A[:, 1]) - (C[:, 0] - A[:, 0]) * (y - A[:, 1])) / det
    w = ((B[:, 0] - A[:, 0]) * (y - A[:, 1]) - (x - A[:, 0]) * (B[:, 1] - A[:, 1])) / det
    ok = (u >= 0) & (w >= 0) & (u + w < 1)
    z = A[:, 2] + u * (B[:, 2] - A[:, 2]) + w * (C[:, 2] - A[:, 2])
    I, J, z = I[ok], J[ok], z[ok]
    ray = I * shape[1] + J
    o = np.lexsort((z, ray))
    ray, z = ray[o], z[o]
    first = np.r_[True, ray[1:] != ray[:-1]]
    rank = np.arange(len(ray)) - np.maximum.accumulate(np.where(first, np.arange(len(ray)), 0))
    n_on = np.bincount(ray, minlength=shape[0] * shape[1])[ray]
    st = (rank % 2 == 0) & (rank + 1 < n_on)
    k = np.nonzero(st)[0]
    s_i = np.clip(np.ceil((z[k] - lo[2]) / step).astype(int), 0, shape[2] - 1)
    e_i = np.clip(np.floor((z[k + 1] - lo[2]) / step).astype(int), 0, shape[2] - 1)
    diff = np.zeros((shape[0] * shape[1], shape[2] + 1), np.int16)
    np.add.at(diff, (ray[k], s_i), 1)
    np.add.at(diff, (ray[k], e_i + 1), -1)
    return (np.cumsum(diff[:, :-1], 1) > 0).reshape(shape)


def sdf(mask: np.ndarray, step: float) -> np.ndarray:
    """Signed distance (mm), positive outside the mask."""
    return ((ndimage.distance_transform_edt(~mask) - ndimage.distance_transform_edt(mask)) * step).astype(np.float32)


def ball(r: int) -> np.ndarray:
    return np.linalg.norm(np.mgrid[-r:r + 1, -r:r + 1, -r:r + 1], axis=0) <= r


class Template:
    """The full surfaces (for the fields), the decimated ones (to show and deform) and their labels."""

    def __init__(self):
        s = sio.loadmat(RAW / "cortex" / "CortexHiRes.mat", simplify_cells=True)
        des, dkt = CB.read_annot("annot_a2009.mat"), CB.read_annot("annot_DKT.mat")
        self.full, self.dec = {}, {}
        for side, h in (("R", "rh"), ("L", "lh")):
            V = np.asarray(s[f"Vertices_{h}"], float)
            F = np.asarray(s[f"Faces_{h}"], int) - 1
            self.full[side] = {"V": V, "F": F, "des": des[side][0], "dkt": dkt[side][0]}
            m = trimesh.Trimesh(V, F, process=False).simplify_quadric_decimation(face_count=FACES[side])
            Vd, Fd = np.asarray(m.vertices), np.asarray(m.faces)
            Vd, tangle = CB.untangle(Vd, Fd)
            _, near = cKDTree(V).query(Vd)
            names = sorted(set(des[side][0]))
            li = CB.smooth_labels(np.array([names.index(x) for x in des[side][0][near]]), Fd, len(names))
            dl = np.array(names)[li]
            kn = sorted(set(dkt[side][0]))
            ki = CB.smooth_labels(np.array([kn.index(x) for x in dkt[side][0][near]]), Fd, len(kn))
            lobe = np.array([CL.DK_LOBE.get(x, "") for x in np.array(kn)[ki]], dtype=object)
            ins = np.isin(dl, CL.INSULA_LABELS)
            lobe[ins] = "insula"
            lobe[lobe == ""] = "medial"
            oper = CB.smooth_mask(CB.opercular(Vd, dl, side), Fd, ins)
            self.dec[side] = {"V": Vd, "F": Fd, "des": dl, "lobe": lobe, "ins": ins, "oper": oper, "untangle": tangle}
            print(side, "decimated", len(Fd), "faces;", tangle)

    def fields(self) -> dict:
        allv = np.vstack([self.full[s]["V"] for s in "RL"])
        lo5 = allv.min(0) - 10
        sh5 = tuple(np.ceil((allv.max(0) + 10 - lo5) / 0.5).astype(int) + 1)
        pial = np.zeros(sh5, bool)
        for s in "RL":
            pial |= fill(self.full[s]["V"], self.full[s]["F"], lo5, sh5, 0.5)
        pial_sdf = sdf(pial, 0.5)
        del pial
        lo1 = allv.min(0) - 12
        sh1 = tuple(np.ceil((allv.max(0) + 12 - lo1) / 1.0).astype(int) + 1)
        M = np.zeros(sh1, bool)
        for s in "RL":
            M |= fill(self.full[s]["V"], self.full[s]["F"], lo1, sh1, 1.0)
        pad = HULL_CLOSE_MM + 2
        hull = ndimage.binary_fill_holes(ndimage.binary_closing(np.pad(M, pad), ball(HULL_CLOSE_MM))[pad:-pad, pad:-pad, pad:-pad])
        sets = {}
        for s in "RL":
            f = self.full[s]
            ins = np.isin(f["des"], CL.INSULA_LABELS)
            oper = CB.opercular(f["V"], f["des"], s)
            fis = ins | (np.isin(f["des"], list(FISSURE_LABELS)) & (oper | ins))
            sets[f"ins_{s}"], sets[f"fis_{s}"] = f["V"][ins], f["V"][fis]
        return {"pial": BD.Field(pial_sdf, lo5, 0.5, 30.0), "hull": BD.Field(sdf(hull, 1.0), lo1, 1.0, 30.0),
                "near": {k: BD.Near(v) for k, v in sets.items()}}


# ---------------------------------------------------------------- the patient
class Patient:
    """The CT's intracranial cavity, the inner table and the bone just outside it, the vessels as centre lines and as the
    surfaces the model draws, and the fitted falx and tentorium; all in the frame."""

    def __init__(self, ex2: dict):
        c = np.load(CT_BUILD / "bone.npz")
        f = np.load(CT_BUILD / "frame.npz")
        self.R, self.fossa = f["R"], f["fossa"]
        b, a = c["b"].astype(np.float32) > 0.4, c["a"]      # the bone the model draws (skullbase_nerves.SURFACE_LEVEL)
        lo, hi, st = np.array([-85.0, -130.0, -70.0]), np.array([85.0, 85.0, 120.0]), 1.0
        ax = [np.arange(lo[k], hi[k] + 1e-6, st) for k in range(3)]
        G = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
        q = nib.affines.apply_affine(np.linalg.inv(a), G @ self.R.T + self.fossa).T
        B = ndimage.map_coordinates(b.astype(np.float32), q, order=1, mode="constant").reshape(tuple(len(x) for x in ax)) > 0.5
        del b, G, q
        Bd = ndimage.binary_dilation(B, ball(CAVITY_SEAL_MM))
        Bd[:, :, : int(round((CAVITY_FLOOR_Z - lo[2]) / st))] = True
        Bd[[0, -1]] = True
        Bd[:, [0, -1]] = True
        Bd[:, :, -1] = True
        lab, _ = ndimage.label(~Bd)
        cav = lab == lab[tuple(np.rint((np.array([0.0, -10.0, 35.0]) - lo) / st).astype(int))]
        cav = ndimage.binary_fill_holes(ndimage.binary_dilation(cav, ball(CAVITY_SEAL_MM)) & ~B)
        self.cavity_ml = float(cav.sum() * st ** 3 / 1000)
        self.cavity = BD.Field(-sdf(cav, st), lo, st, -30.0)          # positive inside the cavity
        edge = cav & ~ndimage.binary_erosion(cav)
        shell = ndimage.binary_dilation(cav, ball(2)) & ~cav & B
        rng = np.random.default_rng(0)
        T = lo + np.argwhere(edge) * st
        S = lo + np.argwhere(shell) * st
        # the posterior fossa (below the fitted tentorium) and the sella's surroundings hold no cerebrum
        tent = np.vstack([np.array(ex2["soft"][f"Tentorium cerebelli.{s}"]["verts"]) for s in "rl"])
        falx = np.array(ex2["soft"]["Falx cerebri"]["verts"])

        def supratentorial(P):
            zt = griddata(tent[:, :2], tent[:, 2], P[:, :2], method="linear")
            zn = griddata(tent[:, :2], tent[:, 2], P[:, :2], method="nearest")
            below = (np.isfinite(zt) & (P[:, 2] < zt + 1.0)) | ((P[:, 1] < -10) & (P[:, 2] < zn))
            sella = (np.abs(P[:, 0]) < 22) & (P[:, 2] < 8) & (P[:, 1] > -30) & (P[:, 1] < 22)
            return ~below & ~sella
        T = T[supratentorial(T)]
        S = S[supratentorial(S)]
        self.table = T[rng.choice(len(T), min(20000, len(T)), replace=False)]
        self.shell = S[rng.choice(len(S), min(15000, len(S)), replace=False)]
        dura = np.vstack([falx, tent])
        self.dura = dura[rng.choice(len(dura), min(3000, len(dura)), replace=False)]
        # TopBrain's labels as centre lines with radius
        img = nib.load(LABELS)
        L = np.asarray(img.dataobj)
        vox = float(np.sqrt((img.affine[:3, :3] ** 2).sum(0)).mean())
        self.lines = {}
        for code in sorted(set(np.unique(L).tolist()) - {0}):
            m = L == code
            sl = ndimage.find_objects(m.astype(np.uint8))[0]
            sl = tuple(slice(max(s_.start - 2, 0), s_.stop + 2) for s_ in sl)
            sub = m[sl]
            sk = skeletonize(sub)
            r = ndimage.distance_transform_edt(sub)[sk] * vox
            P = (nib.affines.apply_affine(img.affine, np.argwhere(sk) + np.array([s_.start for s_ in sl])) - self.fossa) @ self.R
            self.lines[int(code)] = np.c_[P, r]
        # the vessel surfaces the model draws (v2's), for the clearances
        vs = [(np.array(m["verts"], float), np.array(m["tris"], int)) for m in ex2["meshes"].values()]
        V = np.vstack([v for v, _ in vs])
        N = np.vstack([trimesh.Trimesh(v, t, process=False).vertex_normals for v, t in vs])
        self.vessel_pts, self.vessel_nrm, self.vessel_tree = V, N, cKDTree(V)
        # the falx (v2's fitted one, an open sheet, nearly sagittal) as a height field: its x at each (y, z) it covers,
        # on a FALX_GRID_MM grid (its triangles are long and skewed, so their normals are no guide)
        fx = ex2["soft"]["Falx cerebri"]
        Vf, Tf = np.array(fx["verts"], float), np.array(fx["tris"], int)
        self.falx_lo = Vf[:, 1:].min(0) - 1.0
        n_yz = np.ceil((Vf[:, 1:].max(0) + 1.0 - self.falx_lo) / FALX_GRID_MM).astype(int) + 1
        self.falx_x = np.full(n_yz, np.nan)
        for tri in Vf[Tf]:
            yz = tri[:, 1:]
            E = np.array([yz[1] - yz[0], yz[2] - yz[0]]).T
            if abs(np.linalg.det(E)) < 1e-9:
                continue
            i0 = np.floor((yz.min(0) - self.falx_lo) / FALX_GRID_MM).astype(int)
            i1 = np.ceil((yz.max(0) - self.falx_lo) / FALX_GRID_MM).astype(int)
            gi = np.stack(np.meshgrid(np.arange(i0[0], i1[0] + 1), np.arange(i0[1], i1[1] + 1), indexing="ij"), -1).reshape(-1, 2)
            lam = np.linalg.solve(E, (self.falx_lo + gi * FALX_GRID_MM - yz[0]).T).T
            ok = (lam >= -1e-6).all(1) & (lam.sum(1) <= 1 + 1e-6)
            self.falx_x[gi[ok, 0], gi[ok, 1]] = tri[0, 0] + lam[ok] @ (tri[1:, 0] - tri[0, 0])

    def falx_sdf(self, P: np.ndarray, side: str):
        """Signed distance from the falx towards a hemisphere's own side, along x (negative: across it), and that
        direction; only where the falx is (not below its free edge) and within FALX_NEAR_MM of it, else large."""
        sgn = 1.0 if side == "R" else -1.0
        i = np.rint((P[:, 1:] - self.falx_lo) / FALX_GRID_MM).astype(int)
        ok = (i >= 0).all(1) & (i < self.falx_x.shape).all(1)
        fx = np.full(len(P), np.nan)
        fx[ok] = self.falx_x[i[ok, 0], i[ok, 1]]
        sd = (P[:, 0] - fx) * sgn
        n = np.zeros_like(P)
        n[:, 0] = sgn
        return np.where(np.isfinite(sd) & (np.abs(np.nan_to_num(sd)) < FALX_NEAR_MM), sd, 30.0), n

    def vessel_sdf(self, P: np.ndarray):
        """Signed distance off the nearest drawn vessel surface (along its normal), and that normal."""
        d, j = self.vessel_tree.query(P)
        s = ((P - self.vessel_pts[j]) * self.vessel_nrm[j]).sum(1)
        return np.where(d < 3.0, s, d), self.vessel_nrm[j]


# ---------------------------------------------------------------- the fit
def fit(tp: Template, fields: dict, pt: Patient, cache: Path) -> tuple:
    if cache.exists():
        z = np.load(cache)
        rbfs = [BD.RBF(z["lo"], z["hi"], h, h) for h in z["specs"]]
        return z["A"], z["b"], rbfs, [z[f"W{i}"] for i in range(len(rbfs))], json.loads(str(z["report"]))
    pial, hull, near = fields["pial"], fields["hull"], fields["near"]
    line = lambda c: pt.lines.get(c, np.zeros((0, 4)))   # noqa: E731
    OUT = np.vstack([line(c) for c in OUTSIDE_CODES])
    groups = {"table": pt.table, "shell": pt.shell, "out": OUT[:, :3], "dura": pt.dura}
    for s in "RL":
        groups[f"M2{s}"], groups[f"M3{s}"] = line(M2_CODES[s])[:, :3], line(M3_CODES[s])[:, :3]
    wts = dict(REPORT_WEIGHTS)

    def energy(Q):
        E, G, rep = 0.0, {}, {}

        def add(key, e, g):
            nonlocal E
            E += e
            G[key] = G.get(key, 0) + g
        q = Q["table"]
        s, gs = hull(q)
        e, de = BD.huber(s - TABLE_GAP_MM, 3.0)
        add("table", wts["table"] * e.mean(), wts["table"] * (de / len(q))[:, None] * gs)
        rep["tableMedianMm"] = float(np.median(np.abs(s - TABLE_GAP_MM)))
        q = Q["shell"]
        s, gs = hull(q)
        v = np.maximum(0, BONE_GAP_MM - s)
        add("shell", wts["bone"] * (v ** 2).mean(), wts["bone"] * (-2 * v / len(q))[:, None] * gs)
        rep["boneInsideHullShare"] = float((s < 0).mean())
        q = Q["out"]
        s, gs = pial(q)
        v = np.maximum(0, OUT[:, 3] + VESSEL_MARGIN_MM - s)
        add("out", wts["out"] * (v ** 2).mean(), wts["out"] * (-2 * v / len(q))[:, None] * gs)
        rep["vesselInCortexShare"] = float((s < OUT[:, 3] * 0.5).mean())
        for side in "RL":
            r2, r3 = line(M2_CODES[side])[:, 3], line(M3_CODES[side])[:, 3]
            q = Q[f"M2{side}"]
            d, gd = near[f"ins_{side}"](q)
            x = np.maximum(0, d - (r2 + INS_REACH_MM))
            e, de = BD.huber(x, 2.0)
            far = x > INS_CAP_MM
            e = np.where(far, BD.huber(np.array([INS_CAP_MM]), 2.0)[0][0], e)
            de = np.where(far, 0.0, de)
            d2, gd2 = near[f"fis_{side}"](q)
            e2, de2 = BD.huber(np.maximum(0, d2 - (r2 + FIS_REACH_MM)), 2.0)
            s, gs = pial(q)
            v = np.maximum(0, r2 + VESSEL_MARGIN_MM - s)
            add(f"M2{side}", wts["ins"] * e.mean() + wts["fis"] * e2.mean() + wts["out"] * (v ** 2).mean(),
                (wts["ins"] * de[:, None] * gd + wts["fis"] * de2[:, None] * gd2 - 2 * wts["out"] * v[:, None] * gs) / len(q))
            rep[f"m2InsulaMedianMm{side}"] = float(np.median(d))
            rep[f"m2InCortexShare{side}"] = float((s < r2 * 0.5).mean())
            q = Q[f"M3{side}"]
            d, gd = near[f"fis_{side}"](q)
            e, de = BD.huber(np.maximum(0, d - (r3 + FIS_REACH_MM)), 2.0)
            s, gs = pial(q)
            v = np.maximum(0, r3 + VESSEL_MARGIN_MM - s)
            sh, gh = hull(q)
            vh = np.maximum(0, sh - 1.0)
            add(f"M3{side}", wts["fis"] * e.mean() + wts["out"] * (v ** 2).mean() + wts["m3hull"] * (vh ** 2).mean(),
                (wts["fis"] * de[:, None] * gd - 2 * wts["out"] * v[:, None] * gs + 2 * wts["m3hull"] * vh[:, None] * gh) / len(q))
            rep[f"m3FissureMedianMm{side}"] = float(np.median(d))
            rep[f"m3InCortexShare{side}"] = float((s < r3 * 0.5).mean())
        q = Q["dura"]
        s, gs = pial(q)
        v = np.maximum(0, 0.5 - s)
        add("dura", wts["dura"] * (v ** 2).mean(), wts["dura"] * (-2 * v / len(q))[:, None] * gs)
        rep["duraInCortexShare"] = float((s < 0).mean())
        return E, G, rep

    allP = np.vstack(list(groups.values()))
    lo, hi = allP.min(0) - 5, allP.max(0) + 5
    # start: the template's hull centred in the cavity's, scaled to its size
    Tc, Ts = pt.table.mean(0), pt.table.std(0)
    Hp = np.vstack([tp.full[s]["V"] for s in "RL"])
    A = np.diag(Hp.std(0) / Ts)
    b = Hp.mean(0) - A @ Tc
    rbfs, W = [], []
    hull_pts = Delaunay(pt.table[::4])
    t0 = time.time()
    for h, lam, w in STAGES:
        wts.update(w)
        base = {k: BD.phi(A, b, rbfs, W, P) for k, P in groups.items()}
        if h == "affine":
            def f(x):
                A_, b_ = x[:9].reshape(3, 3), x[9:]
                E, G, _ = energy({k: P @ A_.T + b_ for k, P in groups.items()})
                return E, np.r_[sum(G[k].T @ groups[k] for k in groups).ravel(), sum(G[k].sum(0) for k in groups)]
            res = minimize(f, np.r_[A.ravel(), b], jac=True, method="L-BFGS-B", options={"maxiter": 300})
            A, b = res.x[:9].reshape(3, 3), res.x[9:]
            print("  affine", np.linalg.svd(A)[1].round(3), round(time.time() - t0), "s", flush=True)
            continue
        r = BD.RBF(lo, hi, h, h)
        Bs = {k: r.B(P) for k, P in groups.items()}
        ax = [np.arange(pt.table[:, k].min(), pt.table[:, k].max(), h / 2) for k in range(3)]
        JP = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
        JP = JP[hull_pts.find_simplex(JP) >= 0]
        J0 = BD.jacobian(A, b, rbfs, W, JP)
        Bd = r.Bgrad(JP)
        det_ref = np.linalg.det(A)
        K = len(r.C)

        def f(x):
            w_ = x.reshape(K, 3)
            E, G, _ = energy({k: base[k] + Bs[k] @ w_ for k in groups})
            g = sum(Bs[k].T @ G[k] for k in groups)
            J = J0.copy()
            for d in range(3):
                J[:, :, d] += Bd[d] @ w_
            det = np.linalg.det(J) / det_ref
            v = np.maximum(0, JAC_MIN - det)
            E += JAC_WEIGHT * (v ** 2).sum()
            dJ = (JAC_WEIGHT * -2 * v / det_ref)[:, None, None] * BD.cofactor(J)
            for d in range(3):
                g += Bd[d].T @ dJ[:, :, d]
            return E + lam * (w_ ** 2).sum(), (g + 2 * lam * w_).ravel()
        res = minimize(f, np.zeros(K * 3), jac=True, method="L-BFGS-B", options={"maxiter": 500})
        rbfs.append(r)
        W.append(res.x.reshape(K, 3))
        print(f"  rbf {h:g} mm: {res.nit} iterations", round(time.time() - t0), "s", flush=True)
    wts.update(REPORT_WEIGHTS)
    _, _, rep = energy({k: BD.phi(A, b, rbfs, W, P) for k, P in groups.items()})
    ax = [np.arange(pt.table[:, k].min(), pt.table[:, k].max(), 2.0) for k in range(3)]
    JP = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
    JP = JP[hull_pts.find_simplex(JP) >= 0]
    det = np.linalg.det(BD.jacobian(A, b, rbfs, W, JP)) / np.linalg.det(A)
    rep.update({"affineScale": [round(float(x), 3) for x in np.linalg.svd(np.linalg.inv(A))[1]], "minRelativeVolume": float(det.min()),
                "tablePoints": len(pt.table), "cavityMl": round(pt.cavity_ml)})
    rep = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in rep.items()}
    np.savez(cache, A=A, b=b, lo=lo, hi=hi, specs=np.array([r.h for r in rbfs]), report=json.dumps(rep), **{f"W{i}": w for i, w in enumerate(W)})
    return A, b, rbfs, W, rep


# ---------------------------------------------------------------- the surface: carried, cleared, opened
def pairs_for(V, F, exclude=None):
    nrm = trimesh.Trimesh(V, F, process=False).vertex_normals
    return BD.facing_pairs(V, F, nrm, PAIR_REACH_MM, exclude)


def clear(V: np.ndarray, F: np.ndarray, pt: Patient, side: str) -> tuple[np.ndarray, dict]:
    """Push the vertices still in bone's way, in a vessel or across the falx clear, the surface around them following
    (ARAP)."""
    pairs = pairs_for(V, F)
    X = V.copy()
    first = None
    for rnd in range(CLEAR_ROUNDS):
        sc, gc = pt.cavity(X)
        sv, nv = pt.vessel_sdf(X)
        sf, nf = pt.falx_sdf(X, side)
        bad_c, bad_v, bad_f = sc < CLEAR_CAVITY_MM, sv < CLEAR_VESSEL_MM, sf < CLEAR_FALX_MM
        if first is None:
            first = {"inBoneWay": int(bad_c.sum()), "inVessel": int(bad_v.sum()), "acrossFalx": int((sf < 0).sum())}
        bad = bad_c | bad_v | bad_f
        if not bad.any():
            break
        target = X.copy()
        gn = gc / np.maximum(np.linalg.norm(gc, axis=1, keepdims=True), 1e-9)
        target[bad_c] += ((CLEAR_CAVITY_MM + 0.2 - sc[bad_c]))[:, None] * gn[bad_c]
        target[bad_v] += ((CLEAR_VESSEL_MM + 0.2 - sv[bad_v]))[:, None] * nv[bad_v]
        target[bad_f] += ((CLEAR_FALX_MM + 0.2 - sf[bad_f]))[:, None] * nf[bad_f]
        reach = cKDTree(X[bad]).query(X, distance_upper_bound=CLEAR_REACH_MM)[0] < np.inf
        fixed = bad | ~reach
        solver = BD.ARAP(X, F, fixed, pairs, PAIR_WEIGHT * np.median(BD.cot_weights(X, F).data))
        X = solver.run(target[fixed], X0=X, iters=8)
    sc, _ = pt.cavity(X)
    sv, _ = pt.vessel_sdf(X)
    sf, _ = pt.falx_sdf(X, side)
    return X, {**{f"{k}Before": v for k, v in first.items()}, "inBoneWayAfter": int((sc < CLEAR_CAVITY_MM - 0.3).sum()),
               "inVesselAfter": int((sv < 0).sum()), "acrossFalxAfter": int((sf < 0).sum()),
               "maxMovedMm": round(float(np.linalg.norm(X - V, axis=1).max()), 2)}


def open_fissure(d: dict, V: np.ndarray, hull_sdf: np.ndarray, pt: Patient) -> tuple[np.ndarray, dict]:
    """The right fissure opened: lips moved apart, insula and distant brain fixed, the rest as rigid as possible."""
    F, lobe, ins, oper = d["F"], d["lobe"], d["ins"], d["oper"]
    front = oper & np.isin(lobe, ["frontal", "parietal"])
    temp = oper & (lobe == "temporal")
    lip_f, lip_t = front & (hull_sdf > -LIP_DEPTH_MM), temp & (hull_sdf > -LIP_DEPTH_MM)
    # each lip moves along the line between the banks (from the other bank's nearest point), smoothed along the lip
    dirs = np.zeros_like(V)
    _, j = cKDTree(V[temp]).query(V[lip_f])
    dirs[lip_f] = V[lip_f] - V[temp][j]
    _, j = cKDTree(V[front]).query(V[lip_t])
    dirs[lip_t] = V[front][j] - V[lip_t]
    dirs /= np.maximum(np.linalg.norm(dirs, axis=1, keepdims=True), 1e-9)
    lips = lip_f | lip_t
    A = BD.adjacency(F, len(V)) + sp.identity(len(V))
    for _ in range(30):
        dirs = (A @ (dirs * lips[:, None])) / np.maximum(A @ lips.astype(float), 1e-9)[:, None]
        dirs[~lips] = 0
    dirs /= np.maximum(np.linalg.norm(dirs, axis=1, keepdims=True), 1e-9)
    target = V.copy()
    target[lip_f] += OPEN_FRONTAL_MM * dirs[lip_f]
    target[lip_t] -= OPEN_TEMPORAL_MM * dirs[lip_t]
    roi = cKDTree(V[oper]).query(V)[0] <= OPEN_ROI_MM
    # the banks that part (frontal and parietal opercula from the temporal; the opercula from the insula) are not held
    side = np.where(front, 1, np.where(temp, 2, np.where(ins, 3, 0)))
    pairs = pairs_for(V, F, exclude=lambda i, j: (side[i] > 0) & (side[j] > 0) & (side[i] != side[j]))
    w_pair = PAIR_WEIGHT * np.median(BD.cot_weights(V, F).data)
    sc, _ = pt.cavity(V)
    held_by_skull = (sc < HOLD_MM) & (cKDTree(V[lips]).query(V)[0] > HOLD_FREE_MM)
    fixed = ~roi | ins | lips | held_by_skull
    X = BD.ARAP(V, F, fixed, pairs, w_pair).run(target[fixed], iters=ARAP_ITERS)
    # kept inside the cavity: what the opening pushed out is held at the cavity's edge, and solved again
    held = np.zeros(len(V), bool)
    for _ in range(3):
        sc, gc = pt.cavity(X)
        out = (sc < CLEAR_CAVITY_MM) & roi & ~fixed
        if not out.any():
            break
        held |= out
        gn = gc / np.maximum(np.linalg.norm(gc, axis=1, keepdims=True), 1e-9)
        target[out] = X[out] + (CLEAR_CAVITY_MM + 0.2 - sc[out])[:, None] * gn[out]
        fx = fixed | held
        X = BD.ARAP(V, F, fx, pairs, w_pair).run(target[fx], X0=X, iters=ARAP_ITERS)
    disp = np.linalg.norm(X - V, axis=1)
    sc, _ = pt.cavity(X)
    return X, {"lipsFrontal": int(lip_f.sum()), "lipsTemporal": int(lip_t.sum()), "heldBySkull": int((held_by_skull & roi).sum()),
               "moved": int((disp > 0.1).sum()),
               "maxMovedMm": round(float(disp.max()), 2), "heldAtCavity": int(held.sum()),
               "outsideCavityAfter": int((sc[roi] < 0).sum())}


def lift_frontal(d: dict, V: np.ndarray, X_open: np.ndarray, line: tuple, pt: Patient) -> tuple[np.ndarray, dict]:
    """The frontal lobe lifted off the orbital roof, as a spatula would hold it along a subfrontal corridor: the orbital
    surface along `line` (a polyline from the anterior clinoid process forward over the orbital roof to the frontal pole)
    raised by LIFT_MM, fading out
    by LIFT_REACH_MM from it; the anterior
    insula raised by up to LIFT_INSULA_SHARE of it; the temporal lobe, the posterior insula, the cortex held by the vault
    and the brain beyond LIFT_ROI_MM where the opening left them; the rest as rigid as possible. Solved from the fitted
    surface with the opening's temporal side in place, so opening and lifting together give this shape exactly."""
    F, lobe, ins = d["F"], d["lobe"], d["ins"]
    nrm = trimesh.Trimesh(V, F, process=False).vertex_normals
    up = np.array([0.0, 0.0, 1.0])
    frontal = lobe == "frontal"
    r = np.full(len(V), np.inf)
    for a, b in zip(line[:-1], line[1:]):          # distance to the polyline
        t = np.clip(((V - a) @ (b - a)) / ((b - a) @ (b - a)), 0, 1)
        r = np.minimum(r, np.linalg.norm(V - (a + t[:, None] * (b - a)), axis=1))
    w = np.clip((LIFT_REACH_MM - r) / (LIFT_REACH_MM - LIFT_CORE_MM), 0, 1)
    base = frontal & (nrm @ up < -0.3) & (w > 0.05)          # the orbital surface, facing the orbital roof
    yi = V[ins, 1]
    w_ins = np.zeros(len(V))
    w_ins[ins] = LIFT_INSULA_SHARE * np.clip((V[ins, 1] - np.median(yi)) / (yi.max() - np.median(yi)), 0, 1)
    ins_front = ins & (w_ins > 0.02)
    target = X_open.copy()
    target[base] += LIFT_MM * w[base, None] * up
    target[ins_front] += LIFT_MM * w_ins[ins_front, None] * up
    handles = base | ins_front
    roi = cKDTree(V[handles]).query(V)[0] <= LIFT_ROI_MM
    sc, _ = pt.cavity(V)
    held_by_skull = (sc < HOLD_MM) & (cKDTree(V[handles]).query(V)[0] > HOLD_FREE_MM)
    fixed = ~roi | handles | (lobe == "temporal") | (ins & ~ins_front) | held_by_skull
    side = np.where(np.isin(lobe, ["frontal", "parietal"]), 1, np.where(lobe == "temporal", 2, np.where(ins, 3, 0)))
    pairs = pairs_for(V, F, exclude=lambda i, j: (side[i] > 0) & (side[j] > 0) & (side[i] != side[j]))
    w_pair = PAIR_WEIGHT * np.median(BD.cot_weights(V, F).data)
    X = BD.ARAP(V, F, fixed, pairs, w_pair).run(target[fixed], X0=X_open, iters=ARAP_ITERS)
    held = np.zeros(len(V), bool)
    for _ in range(3):
        sc, gc = pt.cavity(X)
        out = (sc < CLEAR_CAVITY_MM) & roi & ~fixed
        if not out.any():
            break
        held |= out
        gn = gc / np.maximum(np.linalg.norm(gc, axis=1, keepdims=True), 1e-9)
        target[out] = X[out] + (CLEAR_CAVITY_MM + 0.2 - sc[out])[:, None] * gn[out]
        fx = fixed | held
        X = BD.ARAP(V, F, fx, pairs, w_pair).run(target[fx], X0=X, iters=ARAP_ITERS)
    disp = np.linalg.norm(X - X_open, axis=1)
    sc, _ = pt.cavity(X)
    return X, {"orbitalHandles": int(base.sum()), "insulaHandles": int(ins_front.sum()), "moved": int((disp > 0.1).sum()),
               "maxMovedMm": round(float(disp.max()), 2), "heldAtCavity": int(held.sum()), "outsideCavityAfter": int((sc[roi] < 0).sum()),
               "line": [np.round(p, 1).tolist() for p in line]}


def retract_medial(d: dict, V: np.ndarray, span: tuple, midline: float, pt: Patient) -> tuple[np.ndarray, dict]:
    """The right hemisphere held off the falx, as a retractor blade would hold it for an interhemispheric corridor: every
    point of it moved to the right by IH_MM x w(y) x g(z) x f(x), where w is 1 over the craniotomy's length (span: its
    back and front, y in mm) fading to 0 IH_FADE_MM beyond it; g is 0 below the top of the template's medial wall (its cut
    through the corpus callosum) at that y and 1 from IH_ABOVE_CC_MM above it, so the callosum and the brain beneath it
    stay; and f is 1 within IH_FLAT_MM of the midline falling to 0 IH_REACH_MM from it, so the cortex further out (and
    so the vault's side) stays. A displacement along x that falls off in x more slowly than 1 mm per mm keeps every line
    of constant (y, z) in order: the map is one to one and the surface cannot fold or cross itself
    (IH_MM < IH_REACH_MM - IH_FLAT_MM). The few
    points it would carry out of the cranial cavity are moved back inside. Solved from the fitted surface (not combined
    with the opening or the lift)."""
    lobe = d["lobe"]
    wall = V[lobe == "medial"]
    # the medial wall's top at each y (2 mm bins, smoothed; constant beyond its ends)
    ys = np.arange(np.floor(wall[:, 1].min()), np.ceil(wall[:, 1].max()) + 2, 2.0)
    top = np.array([wall[np.abs(wall[:, 1] - y) <= 2, 2].max(initial=-np.inf) for y in ys])
    ok = np.isfinite(top)
    top = ndimage.gaussian_filter1d(np.interp(ys, ys[ok], top[ok]), 1.0)
    z_cc = np.interp(V[:, 1], ys, top)
    y0, y1 = span
    w = np.clip(1 - np.maximum(np.maximum(y0 - V[:, 1], V[:, 1] - y1), 0) / IH_FADE_MM, 0, 1)
    t = np.clip((V[:, 2] - z_cc) / IH_ABOVE_CC_MM, 0, 1)
    g = t * t * (3 - 2 * t)
    f = np.clip((IH_REACH_MM - (V[:, 0] - midline)) / (IH_REACH_MM - IH_FLAT_MM), 0, 1)
    X = V.copy()
    X[:, 0] += IH_MM * w * g * f
    held = np.zeros(len(V), bool)
    for _ in range(3):         # carried out of the cavity: back inside along the cavity's gradient
        sc, gc = pt.cavity(X)
        out = (sc < CLEAR_CAVITY_MM) & (np.abs(X - V).sum(1) > 0)
        if not out.any():
            break
        held |= out
        gn = gc / np.maximum(np.linalg.norm(gc, axis=1, keepdims=True), 1e-9)
        X[out] += (CLEAR_CAVITY_MM + 0.2 - sc[out])[:, None] * gn[out]
    disp = np.linalg.norm(X - V, axis=1)
    sc, _ = pt.cavity(X)
    assert IH_MM < IH_REACH_MM - IH_FLAT_MM, "the shift would fold the surface"
    return X, {"moved": int((disp > 0.1).sum()), "fullyMoved": int((disp > IH_MM - 0.1).sum()), "maxMovedMm": round(float(disp.max()), 2),
               "heldAtCavity": int(held.sum()), "outsideCavityAfter": int(((sc < 0) & (disp > 0)).sum()),
               "span": [round(float(y0), 1), round(float(y1), 1)], "midline": round(float(midline), 2),
               "callosumTopMm": [round(float(z_cc[w > 0].min()), 1), round(float(z_cc[w > 0].max()), 1)]}


def centre_line_length(P: np.ndarray, origin: np.ndarray) -> float:
    """Length of a vessel's skeleton (voxel centres, 0.5 mm grid) from its end nearest `origin` (where it arises) to its
    farthest point along the skeleton (an early branch running beside the trunk is not walked out and back), measured
    along the path smoothed over a few voxels."""
    from scipy.sparse.csgraph import dijkstra
    pairs = cKDTree(P).query_pairs(0.9, output_type="ndarray")
    d = np.linalg.norm(P[pairs[:, 0]] - P[pairs[:, 1]], axis=1)
    G = sp.coo_matrix((np.r_[d, d], (np.r_[pairs[:, 0], pairs[:, 1]], np.r_[pairs[:, 1], pairs[:, 0]])), shape=(len(P), len(P))).tocsr()
    s0 = int(np.argmin(cKDTree(origin).query(P)[0]))
    a, pred = dijkstra(G, indices=s0, return_predecessors=True)
    path = [int(np.argmax(np.where(np.isfinite(a), a, -1)))]
    while path[-1] != s0:
        path.append(int(pred[path[-1]]))
    X = ndimage.gaussian_filter1d(P[path[::-1]], 2.0, axis=0, mode="nearest")   # off the voxel staircase
    return float(np.linalg.norm(np.diff(X, axis=0), axis=1).sum())


def skin(P: np.ndarray, rest: np.ndarray, moved: np.ndarray, follow: np.ndarray) -> np.ndarray:
    """Displacement of each point: the mean displacement of the brain vertices within SKIN_MM (weighted by closeness),
    counting only the vertices it follows (`follow`); the others count as still. So an artery on the cortex it follows
    moves with it, one on cortex it does not follow stays, and one between the two moves part of the way."""
    t = cKDTree(rest)
    d, j = t.query(P, k=16, distance_upper_bound=SKIN_MM)
    w = np.where(np.isfinite(d), 1.0 / (0.5 + d), 0.0)
    jj = np.where(np.isfinite(d), j, 0)
    D = np.where(follow[:, None], moved - rest, 0.0)[jj]
    s = w.sum(1, keepdims=True)
    return np.where(s > 0, (w[:, :, None] * D).sum(1) / np.maximum(s, 1e-9), 0.0)


# ---------------------------------------------------------------- outputs
PIECES = [  # (id, name, lobes, token)
    ("br_frontal_lobe", "Frontal lobe", ["frontal"], "sbBrain"),
    ("br_parietal_lobe", "Parietal lobe", ["parietal"], "sbBrain"),
    ("br_temporal_lobe", "Temporal lobe", ["temporal"], "sbBrain"),
    ("br_occipital_lobe", "Occipital lobe", ["occipital"], "sbBrain"),
    ("br_insula", "Insula", ["insula"], "sbInsula"),
    ("br_cingulate_gyrus", "Cingulate gyrus", ["cingulate"], "sbBrain"),
    ("br_medial_wall", "Medial wall (cut through the corpus callosum)", ["medial"], "sbMedialWall"),
]
MORPHED_VESSELS = ["Middle cerebral artery (M2 segment)", "Middle cerebral artery (M3 segment)"]


def normals(v, t):
    return trimesh.Trimesh(v, t, process=False).vertex_normals.copy()


def piece(V, F, faces_sel, targets=None):
    """A part of a surface; with targets [(name, shape, base)], the morph target of that name is shape - base (the lift
    is on top of the opening: its base is the opened shape, so the two add up)."""
    sel = F[faces_sel]
    used, inv = np.unique(sel, return_inverse=True)
    t = inv.reshape(-1, 3)
    v = V[used]
    node = {"positions": v, "normals": normals(v, t), "indices": t, "mode": TRIANGLES}
    if targets:
        node["targets"] = []
        for name, X, X0 in targets:
            x, x0 = X[used], X0[used]
            node["targets"].append({"name": name, "positions": x - x0, "normals": normals(x, t) - normals(x0, t)})
    return node


OPENING_KEYS = ("OPEN_", "LIP_", "HOLD_", "SKIN_", "ARAP_", "MORPHED_", "PIECES", "LIFT_", "IH_")


def params_hash(fit_only: bool = False) -> str:
    """The parameters (with fit_only, those the fit and the cleared surface depend on) and the CT's bone mask."""
    keys = {k: v for k, v in globals().items() if k.isupper() and isinstance(v, (int, float, str, list, dict, tuple))
            and not (fit_only and k.startswith(OPENING_KEYS))}
    for k in ("PALETTE", "CITES", "OPENING_KEYS"):
        keys.pop(k, None)
    keys["bone"] = hashlib.sha1((CT_BUILD / "bone.npz").read_bytes()).hexdigest()
    return hashlib.sha1(json.dumps(keys, sort_keys=True, default=str).encode()).hexdigest()[:16]


def main() -> int:
    t0 = time.time()
    BUILD.mkdir(parents=True, exist_ok=True)
    ex2 = json.loads((CT_BUILD / "export.json").read_text())
    tp = Template()
    fields = tp.fields()
    pt = Patient(ex2)
    print("template and patient", round(time.time() - t0), "s; cavity", round(pt.cavity_ml), "ml")
    key = params_hash(fit_only=True)
    A, b, rbfs, W, rep = fit(tp, fields, pt, BUILD / f"brain_fit_{key}.npz")
    print("fit", rep, round(time.time() - t0), "s")
    out, report = {}, {"fit": rep, "untangle": {s: tp.dec[s]["untangle"] for s in "RL"}}
    mesh_cache = BUILD / f"brain_mesh_{key}.npz"
    if mesh_cache.exists():
        z = np.load(mesh_cache, allow_pickle=False)
        out = {s: z[s] for s in "RL"}
        report.update(json.loads(str(z["report"])))
    else:
        allP = np.vstack([pt.table, pt.shell])
        gp = BD.GridPhi(A, b, rbfs, W, allP.min(0) - 15, allP.max(0) + 15, step=1.0)
        part = {}
        for s in "RL":
            d = tp.dec[s]
            V, res = gp.invert(d["V"])
            part.setdefault("inverseResidualMm", {})[s] = round(float(res.max()), 4)
            V, rc = clear(V, d["F"], pt, s)
            part.setdefault("clear", {})[s] = rc
            crossed = len(self_intersections(V, d["F"])[0])
            part.setdefault("crossedTriangles", {})[s] = {"template": d["untangle"]["crossedAfter"], "fitted": crossed}
            out[s] = V
            print(s, "carried and cleared", rc, "crossed", crossed, round(time.time() - t0), "s")
        report.update(part)
        np.savez(mesh_cache, R=out["R"], L=out["L"], report=json.dumps(part))
    d = tp.dec["R"]
    # the lips: opercular surface near the template's hull (measured in the template, where the hull was made)
    X, ro = open_fissure(d, out["R"], fields["hull"](d["V"], grad=False), pt)
    ro["crossedTriangles"] = len(self_intersections(X, d["F"])[0])
    report["open"] = ro
    print("opened", ro, round(time.time() - t0), "s")
    # the frontal lobe lifted off the orbital roof, along the corridor between two fitted landmarks (right side)
    def landmark_r(name, off):
        p = next(np.array(lm["ras"], float) for lm in ex2["landmarks"] if lm["name"] == name)
        p[0] = abs(p[0])
        return p + np.array(off)
    XL, rl = lift_frontal(d, out["R"], X, [landmark_r(n, o) for n, o in LIFT_ALONG], pt)
    rl["crossedTriangles"] = len(self_intersections(XL, d["F"])[0])
    report["lift"] = rl
    print("lifted", rl, round(time.time() - t0), "s")
    # the right hemisphere held off the falx over the interhemispheric craniotomy (skullbase_v3_approach.py: its span)
    ih = json.loads((BUILD / "approach.json").read_text())["interhemispheric"]
    falx = np.array(ex2["soft"]["Falx cerebri"]["verts"], float)
    XI, ri = retract_medial(d, out["R"], tuple(ih["span"]), float(np.median(falx[:, 0])), pt)
    ri["crossedTriangles"] = len(self_intersections(XI, d["F"])[0])
    report["interhemispheric"] = ri
    print("retracted", ri, round(time.time() - t0), "s")
    # GLBs: the brain by part (right hemisphere: the opening, the lift on top of it, and the interhemispheric retraction
    # as named morph targets)
    shapes = [("open", X, out["R"]), ("lift", XL, X), ("interhemispheric", XI, out["R"])]
    items = []
    for pid, name, lobes, tok in PIECES:
        nodes, cent = [], {}
        for s in "LR":
            dd = tp.dec[s]
            fsel = np.isin(dd["lobe"][dd["F"]], lobes).sum(1) >= 2
            if not fsel.any():
                continue
            node = piece(out[s], dd["F"], fsel, shapes if s == "R" else None)
            node["name"] = s
            nodes.append(node)
            cent[s] = node["positions"].mean(0).round(2).tolist()
        write_glb(BUILD / f"{pid}.glb", nodes, {"id": pid})
        items.append({"id": pid, "name": name, "token": tok, "centroid": {"L": cent["L"], "R": cent["R"]}, "morph": True})
    # the middle cerebral artery's M2 and M3 segments: they stay where they are, except on cortex that is moved away
    # from them on purpose: the frontal and parietal opercula when the fissure opens, the frontal lobe and the anterior
    # insula when they are lifted
    lob = tp.dec["R"]["lobe"]
    follow_open = np.isin(lob, ["frontal", "parietal"])
    follow_lift = follow_open | (lob == "insula")
    for vname in MORPHED_VESSELS:
        nodes, cent, moved = [], {}, {}
        for s in "LR":
            m = ex2["meshes"][f"{vname}.{s.lower()}"]
            v, t = np.array(m["verts"], float), np.array(m["tris"], int)
            node = {"name": s, "positions": v, "normals": normals(v, t), "indices": t, "mode": TRIANGLES}
            if s == "R":
                D0 = skin(v, out["R"], X, follow_open)
                D1 = skin(v, out["R"], XL, follow_lift) - D0
            else:
                D0 = D1 = np.zeros_like(v)
            node["targets"] = [{"name": "open", "positions": D0, "normals": np.zeros_like(v)},
                               {"name": "lift", "positions": D1, "normals": np.zeros_like(v)}]
            nodes.append(node)
            cent[s] = v.mean(0).round(2).tolist()
            moved[s] = {"open": round(float(np.linalg.norm(D0, axis=1).max()), 2), "lift": round(float(np.linalg.norm(D1, axis=1).max()), 2)}
        sid = "sb_" + re.sub(r"[^a-z0-9]+", "_", vname.lower()).strip("_")
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        report.setdefault("vesselsMovedMaxMm", {})[vname] = moved
        items.append({"id": sid, "vessel": vname, "file": f"assets/{KIND}/{sid}.glb"})
    # this patient's M1 (TopBrain's label), from the carotid bifurcation (its end nearest the carotid's label)
    report["m1LengthMm"] = {s: round(centre_line_length(pt.lines[{"R": 5, "L": 7}[s]][:, :3], pt.lines[{"R": 4, "L": 6}[s]][:, :3]), 1)
                            for s in "RL"}
    # the anterior cerebral arteries TopBrain labels on this CT: which A3 segments, and the gap between the third
    # artery's A2 and the anterior communicating artery (0: the labels touch)
    img = nib.load(LABELS)
    lab = np.asarray(img.dataobj)
    vox = float(np.sqrt((img.affine[:3, :3] ** 2).sum(0)).max())
    a3 = [k for k, code in (("R", 13), ("L", 14), ("third", 16)) if (lab == code).any()]
    gap = None
    if (lab == 15).any() and (lab == 10).any():
        P15, P10 = (nib.affines.apply_affine(img.affine, np.argwhere(lab == c)) for c in (15, 10))
        gap = round(max(0.0, float(cKDTree(P10).query(P15)[0].min()) - vox * np.sqrt(3)), 1)
    report["aca"] = {"a3": a3, "thirdA2ToAcomMm": gap}
    report["params"] = {"tableGapMm": TABLE_GAP_MM, "boneGapMm": BONE_GAP_MM, "openFrontalMm": OPEN_FRONTAL_MM,
                        "openTemporalMm": OPEN_TEMPORAL_MM, "openRoiMm": OPEN_ROI_MM, "liftMm": LIFT_MM, "liftCoreMm": LIFT_CORE_MM,
                        "liftReachMm": LIFT_REACH_MM, "liftInsulaShare": LIFT_INSULA_SHARE, "interhemisphericMm": IH_MM,
                        "interhemisphericFadeMm": IH_FADE_MM, "interhemisphericReachMm": IH_REACH_MM, "interhemisphericFlatMm": IH_FLAT_MM,
                        "interhemisphericAboveCallosumMm": IH_ABOVE_CC_MM, "faces": FACES, "jacMin": JAC_MIN}
    (BUILD / "brain.json").write_text(json.dumps({"items": items, "report": report}, indent=1))
    print("brain done", round(time.time() - t0), "s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
