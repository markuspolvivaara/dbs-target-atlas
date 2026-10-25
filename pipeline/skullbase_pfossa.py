"""Skull base v3: the cerebellum, brainstem and fourth ventricle fitted into this CT's posterior fossa, and the cerebellar
tonsils drawn apart (the telovelar view).

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_pfossa.py      (after skullbase_ct.py; then skullbase_v3.py)

A CT angiogram shows neither the cerebellum nor the brainstem well enough to segment them, so they are the Z-Anatomy
model's (one adult, BodyParts3D): the cerebellum by lobule, the brainstem and the fourth ventricle, exported by
skullbase_pfossa_export.py and carried onto this CT by Skull base v2's fit of the Z-Anatomy model (skullbase_ct.py writes
them to pfossa.json). That fit follows the bones, not the brain: it leaves this patient's basilar and vertebral arteries
inside the brainstem. So the contents are fitted again, by a smooth deformation (brain_deform: an affine map, then
Gaussian radial basis functions; phi: frame -> the carried model), found by minimising together (weights in STAGES):
  the posterior fossa: the contents' hull TABLE_GAP_MM inside the CT's cavity behind the petrous bones (the suboccipital
  surface, where the cerebellum lies against the bone; a modelling choice for the meninges), at least TABLE_MIN_MM inside
  it everywhere, and never within BONE_GAP_MM of bone;
  this patient's arteries (TopBrain's labels as centre lines with their radius: basilar, vertebral, posterior cerebral
  P1-P2, superior and posterior inferior cerebellar) outside the brainstem and cerebellum;
  the fitted tentorium above the cerebellum;
  a penalty wherever the local volume would shrink below JAC_MIN of the overall scale, so that it never folds.
The model's meshes are carried through it (GridPhi inversion).

The telovelar shape (morph target "telovelar", a slider) draws both tonsils apart and lifts the inferior vermis, as the
approach's retraction holds them: each tonsil moved TV_MM laterally and a little up (TV_UP), the rest of its hemisphere
following with a weight that falls from 1 at the tonsil to 0 TV_REACH_MM from it; and the nodule and uvula moved
TV_VERMIS_MM up and back (TV_VERMIS_BACK: back by this share of up), off the roof of the fourth ventricle, the rest of
the cerebellum following with a weight falling to 0 TV_VERMIS_REACH_MM from them. The brainstem and the fourth ventricle
stay. Each displacement changes by at most its size over its reach per mm, so the two together by at most
TV_MM / TV_REACH_MM + TV_VERMIS_MM / TV_VERMIS_REACH_MM; below 1 they cannot fold the cerebellum. The arteries stay where
the CT shows them. A shape, not a simulation of the tissue.

The retrosigmoid shape (morph target "retrosigmoid") draws the right cerebellar hemisphere back from the petrous bone,
opening the cerebellopontine angle as gentle retraction and the release of cerebrospinal fluid let it fall away. The
corridor runs from the right internal acoustic meatus (the registered ear's, Skull base v3's landmark) out through the
retrosigmoid craniotomy just inside its keypoint, the opening's corner at the junction of the transverse and sigmoid sinuses
(skullbase_v3_approach.py), along the back of the petrous bone: each point of the right hemisphere and tonsil is moved RS_MM away from it, square to it and
towards the hemisphere's centre, with a weight falling from 1 on the corridor to 0 RS_REACH_MM from it (RS_MM /
RS_REACH_MM below 1: it cannot fold), then kept off bone and the arteries as the telovelar shape is.

Writes pipeline/data/build/skullbase-v3/pf_*.glb and pfossa.json (the items for the manifest and the fit report).
"""
from __future__ import annotations

import hashlib
import json
import sys
import time
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage
from scipy.interpolate import griddata
from scipy.optimize import minimize
from scipy.spatial import cKDTree
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import brain_deform as BD  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402
from meshcheck import signed_volume  # noqa: E402
from skullbase_brain import ball, fill, sdf  # noqa: E402

KIND = "skullbase-v3"
BUILD = ROOT / "data" / "build" / KIND
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
LABELS = ROOT / "data" / "raw" / "topbrain" / "topcow_ct_011.nii.gz"

GRID_LO, GRID_HI = np.array([-75.0, -120.0, -80.0]), np.array([75.0, 20.0, 45.0])   # the posterior fossa (frame mm)
TABLE_GAP_MM = 1.5         # the hull's distance inside the cavity behind the petrous bones (meninges, CSF): a modelling choice
TABLE_MIN_MM = 1.0         # ... and its least distance inside it anywhere
BONE_GAP_MM = 1.0          # never within this of bone
SUBOCCIPITAL_BEHIND_MM = 20.0   # "behind the petrous bones": this far behind the internal acoustic meatuses
CAVITY_SEAL_MM = 5         # the bone dilated this much to close the foramina when the cavity is found
FM_SHUT_MM = 6.0           # ... and shut below this far above the foramen magnum's centre
VESSEL_MARGIN_MM = 0.3
VESSEL_CODES = {1: "Basilar artery", 2: "P1-P2 R", 3: "P1-P2 L", 23: "Vertebral artery R", 24: "Vertebral artery L",
                25: "Superior cerebellar artery R", 26: "Superior cerebellar artery L",
                29: "Posterior inferior cerebellar artery R", 30: "Posterior inferior cerebellar artery L"}
CLEAR_SIGMA_MM = 2.5       # the clearance: each push spread over the parts around it with a Gaussian this wide ...
VESSEL_SIGMA_MM = 1.0      # ... an artery's push this wide
VESSEL_SLACK_MM = 0.6      # an artery cleared by this much more than its margin: half the vertices' spacing
CONTAIN_MAX_MM = 3.0       # a part's surface pushed in past a centre line inside it by at most this
CLEAR_ROUNDS = 12          # ... in this many rounds
DRAWN_VESSELS = ["Basilar artery", "Vertebral artery", "Superior cerebellar artery", "Posterior inferior cerebellar artery",
                 "Posterior cerebral artery (P1–P2)"]
JAC_MIN = 0.45
JAC_WEIGHT = 20.0
HULL_CLOSE_MM = 3
STAGES = [  # (control grid spacing = Gaussian width in mm, or 'affine'; ridge; term weights)
    ("affine", 0, dict(table=1.0, wall=1.0, bone=0.5, out=1.0, dura=0.2)),
    (14.0, 1e-4, dict(table=1.0, wall=1.0, bone=1.0, out=2.0, dura=0.5)),
    (9.0, 1e-4, dict(table=1.0, wall=2.0, bone=2.0, out=4.0, dura=0.5)),
    (6.0, 3e-4, dict(table=1.0, wall=2.0, bone=2.0, out=4.0, dura=0.5)),
    (4.0, 1e-3, dict(table=1.0, wall=2.0, bone=2.0, out=8.0, dura=0.5)),
]
TV_MM = 6.0                # illustrative: how far each tonsil is drawn aside
TV_UP = 0.4                # ... laterally, and up by this share of it
TV_REACH_MM = 15.0         # the rest of the hemisphere follows, none this far from the tonsil
TV_VERMIS_MM = 5.0         # illustrative: how far the nodule and uvula are lifted
TV_VERMIS_BACK = 1.0       # ... up, and back by this share of it (away from the fourth ventricle's roof)
TV_VERMIS_REACH_MM = 15.0  # the rest of the cerebellum follows, none this far from them
INFERIOR_VERMIS = ["Nodule of vermis", "Uvula of vermis"]
assert TV_MM / TV_REACH_MM + TV_VERMIS_MM / TV_VERMIS_REACH_MM < 1, "the telovelar shape could fold the cerebellum"
RS_MM = 12.0               # illustrative: how far the right hemisphere is drawn back at the internal acoustic meatus
RS_REACH_MM = 40.0         # ... none this far from it
assert RS_MM / RS_REACH_MM < 1, "the retrosigmoid shape could fold the cerebellum"
GEN = ROOT.parent / "src" / "data" / "generated"

STEM = ["Midbrain", "Pons", "Medulla oblongata", "Fourth ventricle", "Superior cerebellar peduncle"]
HEMISPHERE = ["Anterior quadrangular lobule", "Posterior quadrangular lobule", "Superior semilunar lobule", "Inferior semilunar lobule",
              "Gracile lobule", "Biventral lobule", "Flocculus", "Peduncle of flocculus", "Wing of central lobule"]
VERMIS = ["Lingula of cerebellum", "Central lobule", "Culmen", "Declive", "Folium of vermis", "Tuber of vermis", "Pyramis of vermis",
          "Uvula of vermis", "Nodule of vermis"]
PIECES = [  # (id, name, Z-Anatomy parts, token, category, moves in the telovelar shape)
    ("pf_cerebellar_hemisphere", "Cerebellar hemisphere", HEMISPHERE, "sbBrain", "hindbrain", True),
    ("pf_tonsil", "Tonsil of cerebellum", ["Tonsil of cerebellum"], "sbTonsil", "hindbrain", True),
    ("pf_vermis", "Vermis", VERMIS, "sbBrain", "hindbrain", True),
    ("pf_superior_cerebellar_peduncle", "Superior cerebellar peduncle", ["Superior cerebellar peduncle"], "sbBrainstem", "hindbrain", False),
    ("pf_midbrain", "Midbrain", ["Midbrain"], "sbBrainstem", "hindbrain", False),
    ("pf_pons", "Pons", ["Pons"], "sbBrainstem", "hindbrain", False),
    ("pf_medulla", "Medulla oblongata", ["Medulla oblongata"], "sbBrainstem", "hindbrain", False),
    ("pf_fourth_ventricle", "Fourth ventricle", ["Fourth ventricle"], "sbCsf", "ventricle", False),
]


def side_of(name: str, verts: np.ndarray) -> np.ndarray:
    """'R'/'L' per vertex: a paired part's own side (Z-Anatomy .r/.l), a midline part's by x."""
    if name.endswith(".r"):
        return np.full(len(verts), "R")
    if name.endswith(".l"):
        return np.full(len(verts), "L")
    return np.where(verts[:, 0] >= 0, "R", "L")


# ---------------------------------------------------------------- the patient's posterior fossa
class Fossa:
    """The CT's posterior fossa on a 1 mm grid of the frame: the cavity below the fitted tentorium and above the foramen
    magnum, its wall (the inner table, and the bone just outside it), and TopBrain's arteries there as centre lines."""

    def __init__(self, ex2: dict):
        c = np.load(CT_BUILD / "bone.npz")
        f = np.load(CT_BUILD / "frame.npz")
        R, fossa = f["R"], f["fossa"]
        b, a = c["b"].astype(np.float32) > 0.4, c["a"]
        st = 1.0
        ax = [np.arange(GRID_LO[k], GRID_HI[k] + 1e-6, st) for k in range(3)]
        G = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
        q = nib.affines.apply_affine(np.linalg.inv(a), G @ R.T + fossa).T
        B = ndimage.map_coordinates(b.astype(np.float32), q, order=1, mode="constant").reshape(tuple(len(x) for x in ax)) > 0.5
        del G, q
        lm = {l["name"]: np.array(l["ras"], float) for l in ex2["landmarks"]}
        self.fm = lm["Foramen magnum"]
        iam_y = np.mean([l["ras"][1] for l in ex2["landmarks"] if l["name"] == "Internal acoustic meatus"] or [-20.0])
        Bd = ndimage.binary_dilation(B, ball(CAVITY_SEAL_MM))
        # shut a little above the foramen magnum's centre: its plane tilts (the front of its rim is higher), and below it
        # the cavity would run out to the neck
        Bd[:, :, : int(round((self.fm[2] + FM_SHUT_MM - GRID_LO[2]) / st))] = True
        Bd[[0, -1]] = True
        Bd[:, [0, -1]] = True
        Bd[:, :, -1] = True
        lab, _ = ndimage.label(~Bd)
        seed = np.rint((np.array([0.0, -10.0, 35.0]) - GRID_LO) / st).astype(int)     # in the cerebrum: the cavity is one space
        cav = lab == lab[tuple(seed)]
        cav = ndimage.binary_fill_holes(ndimage.binary_dilation(cav, ball(CAVITY_SEAL_MM)) & ~B)
        self.cavity = BD.Field(-sdf(cav, st), GRID_LO, st, -30.0)       # positive inside
        self.bone = BD.Field(sdf(B, st), GRID_LO, st, 30.0)              # positive outside bone
        edge = cav & ~ndimage.binary_erosion(cav)
        shell = ndimage.binary_dilation(cav, ball(2)) & ~cav & B
        tent = np.vstack([np.array(ex2["soft"][f"Tentorium cerebelli.{s}"]["verts"]) for s in "rl"])

        def infratentorial(P):
            zt = griddata(tent[:, :2], tent[:, 2], P[:, :2], method="linear")
            zn = griddata(tent[:, :2], tent[:, 2], P[:, :2], method="nearest")
            below = (np.isfinite(zt) & (P[:, 2] < zt - 1.0)) | (~np.isfinite(zt) & (P[:, 1] < -10) & (P[:, 2] < zn - 1.0))
            return below & (P[:, 2] > self.fm[2]) & (P[:, 1] < -5)
        rng = np.random.default_rng(0)
        T = GRID_LO + np.argwhere(edge) * st
        T = T[infratentorial(T)]
        S = GRID_LO + np.argwhere(shell) * st
        S = S[infratentorial(S)]
        behind = T[:, 1] < iam_y - SUBOCCIPITAL_BEHIND_MM
        self.table = T[behind][rng.choice(behind.sum(), min(8000, behind.sum()), replace=False)]
        self.wall = T[rng.choice(len(T), min(8000, len(T)), replace=False)]
        self.shell = S[rng.choice(len(S), min(8000, len(S)), replace=False)]
        self.dura = tent[rng.choice(len(tent), min(2000, len(tent)), replace=False)]
        # TopBrain's arteries around the brainstem and cerebellum, as centre lines with radius
        img = nib.load(LABELS)
        L = np.asarray(img.dataobj)
        vox = float(np.sqrt((img.affine[:3, :3] ** 2).sum(0)).mean())
        self.lines = {}
        for code in VESSEL_CODES:
            m = L == code
            if not m.any():
                continue
            sl = ndimage.find_objects(m.astype(np.uint8))[0]
            sl = tuple(slice(max(s_.start - 2, 0), s_.stop + 2) for s_ in sl)
            sub = m[sl]
            sk = skeletonize(sub)
            r = ndimage.distance_transform_edt(sub)[sk] * vox
            P = (nib.affines.apply_affine(img.affine, np.argwhere(sk) + np.array([s_.start for s_ in sl])) - fossa) @ R
            self.lines[code] = np.c_[P, r]
        # the vessel surfaces the model draws (v2's), for the clearance
        vs = [(np.array(m["verts"], float), np.array(m["tris"], int)) for n, m in ex2["meshes"].items() if n.split(".")[0] in DRAWN_VESSELS]
        self.vessel_pts = np.vstack([v for v, _ in vs])
        self.vessel_nrm = np.vstack([trimesh.Trimesh(v, t, process=False).vertex_normals for v, t in vs])
        self.vessel_tree = cKDTree(self.vessel_pts)

    def vessel_sdf(self, P: np.ndarray):
        """Signed distance off the nearest drawn vessel surface (along its normal), and that normal."""
        d, j = self.vessel_tree.query(P)
        s = ((P - self.vessel_pts[j]) * self.vessel_nrm[j]).sum(1)
        return np.where(d < 3.0, s, d), self.vessel_nrm[j]


# ---------------------------------------------------------------- the model carried by v2's fit
class Model:
    """The Z-Anatomy posterior fossa as v2's fit placed it (pfossa.json), and its distance fields."""

    def __init__(self):
        pf = json.loads((CT_BUILD / "pfossa.json").read_text())
        # each part wound outward: Z-Anatomy's mirrored halves come inside out (by their signed volume; some parts are
        # not quite closed, but each encloses a clear volume)
        self.meshes = {}
        for n, m in pf["meshes"].items():
            v, t = np.array(m["verts"], float), np.array(m["tris"], int)
            self.meshes[n] = (v, t[:, ::-1].copy() if signed_volume(v, t) < 0 else t)
        self.texts = pf["texts"]
        allv = np.vstack([v for v, _ in self.meshes.values()])
        self.lo = allv.min(0) - 12
        st = 0.5
        shape = tuple(np.ceil((allv.max(0) + 12 - self.lo) / st).astype(int) + 1)
        solid = np.zeros(shape, bool)
        for v, t in self.meshes.values():
            solid |= fill(v, t, self.lo, shape, st)
        self.solid = BD.Field(sdf(solid, st), self.lo, st, 30.0)
        r = int(round(HULL_CLOSE_MM / st))
        pad = r + 2
        hull = ndimage.binary_fill_holes(ndimage.binary_closing(np.pad(solid, pad), ball(r))[pad:-pad, pad:-pad, pad:-pad])
        self.hull = BD.Field(sdf(hull, st), self.lo, st, 30.0)
        self.solid_ml = float(solid.sum() * st ** 3 / 1000)


def fit(md: Model, fs: Fossa, cache: Path) -> tuple:
    if cache.exists():
        z = np.load(cache)
        rbfs = [BD.RBF(z["lo"], z["hi"], h, h) for h in z["specs"]]
        return z["A"], z["b"], rbfs, [z[f"W{i}"] for i in range(len(rbfs))], json.loads(str(z["report"]))
    OUT = np.vstack(list(fs.lines.values()))
    r_out = np.maximum(OUT[:, 3], fs.vessel_tree.query(OUT[:, :3])[0])     # the drawn surface's radius there
    groups = {"table": fs.table, "wall": fs.wall, "shell": fs.shell, "out": OUT[:, :3], "dura": fs.dura}
    wts = dict(STAGES[-1][2])

    def energy(Q):
        E, G, rep = 0.0, {}, {}

        def add(key, e, g):
            nonlocal E
            E += e
            G[key] = G.get(key, 0) + g
        s, gs = md.hull(Q["table"])
        e, de = BD.huber(s - TABLE_GAP_MM, 3.0)
        n = len(s)
        add("table", wts["table"] * e.mean(), wts["table"] * (de / n)[:, None] * gs)
        rep["tableMedianMm"] = float(np.median(np.abs(s - TABLE_GAP_MM)))
        s, gs = md.hull(Q["wall"])
        v = np.maximum(0, TABLE_MIN_MM - s)
        add("wall", wts["wall"] * (v ** 2).mean(), wts["wall"] * (-2 * v / len(s))[:, None] * gs)
        rep["wallWithinMinShare"] = float((s < TABLE_MIN_MM).mean())
        s, gs = md.hull(Q["shell"])
        v = np.maximum(0, BONE_GAP_MM - s)
        add("shell", wts["bone"] * (v ** 2).mean(), wts["bone"] * (-2 * v / len(s))[:, None] * gs)
        rep["boneInsideHullShare"] = float((s < 0).mean())
        s, gs = md.solid(Q["out"])
        v = np.maximum(0, r_out + VESSEL_MARGIN_MM - s)
        add("out", wts["out"] * (v ** 2).mean(), wts["out"] * (-2 * v / len(s))[:, None] * gs)
        rep["vesselInsideShare"] = float((s < 0).mean())
        s, gs = md.solid(Q["dura"])
        v = np.maximum(0, 0.5 - s)
        add("dura", wts["dura"] * (v ** 2).mean(), wts["dura"] * (-2 * v / len(s))[:, None] * gs)
        rep["tentoriumInsideShare"] = float((s < 0).mean())
        return E, G, rep

    _, _, rep0 = energy(groups)
    allP = np.vstack(list(groups.values()))
    lo, hi = allP.min(0) - 5, allP.max(0) + 5
    A, b = np.eye(3), np.zeros(3)
    rbfs, W = [], []
    t0 = time.time()
    JP_all = np.vstack([fs.wall, fs.table])
    for h, lam, w in STAGES:
        wts.update(w)
        base = {k: BD.phi(A, b, rbfs, W, P) for k, P in groups.items()}
        if h == "affine":
            def f(x):
                A_, b_ = x[:9].reshape(3, 3), x[9:]
                E, G, _ = energy({k: P @ A_.T + b_ for k, P in groups.items()})
                E += 10.0 * ((A_ - np.eye(3)) ** 2).sum()      # near the carried model's size and orientation
                g = np.r_[(sum(G[k].T @ groups[k] for k in groups) + 20.0 * (A_ - np.eye(3))).ravel(), sum(G[k].sum(0) for k in groups)]
                return E, g
            res = minimize(f, np.r_[A.ravel(), b], jac=True, method="L-BFGS-B", options={"maxiter": 300})
            A, b = res.x[:9].reshape(3, 3), res.x[9:]
            print("  affine", np.linalg.svd(A)[1].round(3), b.round(2), round(time.time() - t0), "s", flush=True)
            continue
        r = BD.RBF(lo, hi, h, h)
        Bs = {k: r.B(P) for k, P in groups.items()}
        ax = [np.arange(JP_all[:, k].min(), JP_all[:, k].max(), h / 2) for k in range(3)]
        JP = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
        JP = JP[fs.cavity(JP, grad=False) > 0]
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
    wts.update(STAGES[-1][2])
    _, _, rep = energy({k: BD.phi(A, b, rbfs, W, P) for k, P in groups.items()})
    ax = [np.arange(JP_all[:, k].min(), JP_all[:, k].max(), 2.0) for k in range(3)]
    JP = np.stack(np.meshgrid(*ax, indexing="ij"), -1).reshape(-1, 3)
    JP = JP[fs.cavity(JP, grad=False) > 0]
    det = np.linalg.det(BD.jacobian(A, b, rbfs, W, JP)) / np.linalg.det(A)
    rep = {**rep, "before": {k: round(v, 3) for k, v in rep0.items()}, "affineScale": [round(float(x), 3) for x in np.linalg.svd(A)[1]],
           "minRelativeVolume": float(det.min())}
    rep = {k: (round(v, 3) if isinstance(v, float) else v) for k, v in rep.items()}
    np.savez(cache, A=A, b=b, lo=lo, hi=hi, specs=np.array([r.h for r in rbfs]), report=json.dumps(rep), **{f"W{i}": w for i, w in enumerate(W)})
    return A, b, rbfs, W, rep


def clear(parts: dict, fs: Fossa) -> dict:
    """What the fit leaves inside an artery or within BONE_GAP_MM of bone pushed out. An artery is its centre line with
    the radius of the surface the model draws for it there, plus VESSEL_MARGIN_MM and VESSEL_SLACK_MM (half the spacing
    of the vertices: a thin artery can pass between them). Each push is spread over the parts around it of the same group
    (the brainstem with the fourth ventricle; the cerebellum) with a normalised Gaussian, so that an isolated push keeps
    its size: a bone push widely (CLEAR_SIGMA_MM: the parts move together), an artery's narrowly (VESSEL_SIGMA_MM: a dent
    where it lies, so the banks of a sulcus it runs in part instead of their pushes cancelling). Where the centre line runs
    inside a closed part, that part's surface around it is pushed in past it (along its inward normals). CLEAR_ROUNDS
    rounds."""
    names = list(parts)
    X = np.vstack([parts[n][0] for n in names])
    cut = np.cumsum([0] + [len(parts[n][0]) for n in names])
    group = np.concatenate([np.full(len(parts[n][0]), n.split(".")[0] in STEM) for n in names])
    OUT = np.vstack(list(fs.lines.values()))
    r_drawn = np.maximum(OUT[:, 3], fs.vessel_tree.query(OUT[:, :3])[0])      # the drawn surface's radius there
    reach = r_drawn + VESSEL_MARGIN_MM + VESSEL_SLACK_MM
    tree = cKDTree(OUT[:, :3])
    closed = [trimesh.Trimesh(parts[n][0], parts[n][1], process=False).is_watertight for n in names]

    def contained(X):
        """Pushes for centre lines inside a closed part: its surface around them, in past them (at most CONTAIN_MAX_MM)."""
        Dv = np.zeros_like(X)
        for k, n in enumerate(names):
            if not closed[k]:
                continue
            Xk, T = X[cut[k]:cut[k + 1]], parts[n][1]
            lo_, hi_ = Xk.min(0) - 1, Xk.max(0) + 1
            near = np.nonzero(np.all((OUT[:, :3] > lo_) & (OUT[:, :3] < hi_), 1))[0]
            if not len(near):
                continue
            shape = tuple(np.ceil((hi_ - lo_) / 0.5).astype(int) + 1)
            vol = fill(Xk, T, lo_, shape, 0.5)
            ijk = np.clip(np.rint((OUT[near, :3] - lo_) / 0.5).astype(int), 0, np.array(shape) - 1)
            inside = near[vol[tuple(ijk.T)]]
            if not len(inside):
                continue
            m = trimesh.Trimesh(Xk, T, process=False)
            nrm = m.vertex_normals * (1 if m.volume > 0 else -1)
            tk = cKDTree(Xk)
            depth = tk.query(OUT[inside, :3])[0]
            for q, dq in zip(inside, depth):
                for jj in tk.query_ball_point(OUT[q, :3], dq + reach[q]):
                    p_ = -min(dq + reach[q] + 0.1, CONTAIN_MAX_MM) * nrm[jj]
                    if (p_ ** 2).sum() > (Dv[cut[k] + jj] ** 2).sum():
                        Dv[cut[k] + jj] = p_
        return Dv

    def pushes(X):
        d, j = tree.query(X)
        need_v = reach[j] - d
        Dv = np.where((need_v > 0)[:, None], (need_v + 0.1)[:, None] * (X - OUT[j, :3]) / np.maximum(d, 1e-6)[:, None], 0.0)
        sb, gb = fs.bone(X)
        need_b = BONE_GAP_MM - sb
        gbn = gb / np.maximum(np.linalg.norm(gb, axis=1, keepdims=True), 1e-9)
        Db = np.where((need_b > 0)[:, None], (need_b + 0.1)[:, None] * gbn, 0.0)
        return Dv, Db, int((need_v > 0).sum()), int((sb < 0).sum())

    def spread(X, D, sigma):
        out = np.zeros_like(X)
        for g in (True, False):
            idx = np.nonzero(group == g)[0]
            src = idx[np.abs(D[idx]).sum(1) > 0]
            if not len(src):
                continue
            nb = cKDTree(X[src]).query_ball_point(X[idx], 3 * sigma)
            rows = np.repeat(np.arange(len(idx)), [len(n) for n in nb])
            cols = np.concatenate([np.asarray(n, int) for n in nb])
            w = np.exp(-((X[idx][rows] - X[src][cols]) ** 2).sum(1) / (2 * sigma ** 2))
            num = np.zeros((len(idx), 3))
            np.add.at(num, rows, w[:, None] * D[src][cols])
            out[idx] = num / np.maximum(np.bincount(rows, w, len(idx)), 1.0)[:, None]
        return out
    Dc = contained(X)
    n_contained = int((np.abs(Dc).sum(1) > 0).sum())
    step = spread(X, Dc, VESSEL_SIGMA_MM)
    X = X + step
    moved = np.linalg.norm(step, axis=1)
    Dv, Db, nv0, nb0 = pushes(X)
    nv, nb_ = nv0, nb0
    for _ in range(CLEAR_ROUNDS):
        if not (nv or (np.abs(Db).sum(1) > 0).any()):
            break
        step = spread(X, Dv, VESSEL_SIGMA_MM) + spread(X, Db, CLEAR_SIGMA_MM)
        X = X + step
        moved += np.linalg.norm(step, axis=1)
        Dv, Db, nv, nb_ = pushes(X)
    for k, n in enumerate(names):
        parts[n] = (X[cut[k]:cut[k + 1]], parts[n][1], parts[n][2])
    return {"containedPushed": n_contained, "inVesselBefore": nv0, "inBoneBefore": nb0, "inVesselAfter": nv, "inBoneAfter": nb_,
            "maxMovedMm": round(float(moved.max()), 2)}


def telovelar(parts: dict, fs: Fossa) -> dict:
    """Each part's displacement for the telovelar shape: the tonsils TV_MM laterally (and TV_UP of that up), the
    cerebellar hemisphere following with a weight falling to 0 TV_REACH_MM from its tonsil; the nodule and uvula
    TV_VERMIS_MM up and back, the cerebellum following with a weight falling to 0 TV_VERMIS_REACH_MM from them; the
    brainstem and fourth ventricle still. The few points it would carry within BONE_GAP_MM of bone, or into an artery the
    model draws, are moved back off it."""
    tons = {s: np.vstack([v[side == s] for n, (v, _, side) in parts.items() if n.startswith("Tonsil of cerebellum")]) for s in "RL"}
    trees = {s: cKDTree(tons[s]) for s in "RL"}
    inferior = cKDTree(np.vstack([parts[n][0] for n in INFERIOR_VERMIS]))
    lift = np.array([0.0, -TV_VERMIS_BACK, 1.0]) / np.hypot(1.0, TV_VERMIS_BACK)
    out = {}
    for n, (v, _, side) in parts.items():
        D = np.zeros_like(v)
        if n.startswith("Tonsil of cerebellum") or any(n.startswith(h) for h in HEMISPHERE):
            for s, sgn in (("R", 1.0), ("L", -1.0)):
                m = side == s
                if not m.any():
                    continue
                d = trees[s].query(v[m])[0]
                w = np.clip(1 - d / TV_REACH_MM, 0, 1)
                dirn = np.array([sgn, 0.0, TV_UP]) / np.hypot(1.0, TV_UP)
                D[m] = TV_MM * w[:, None] * dirn
        if n.startswith("Tonsil of cerebellum") or any(n.startswith(h) for h in HEMISPHERE + VERMIS):
            w = np.clip(1 - inferior.query(v)[0] / TV_VERMIS_REACH_MM, 0, 1)
            D += TV_VERMIS_MM * w[:, None] * lift
        moved = np.abs(D).sum(1) > 0
        if moved.any():
            sb, gb = fs.bone(v[moved] + D[moved])
            near = sb < BONE_GAP_MM
            gbn = gb / np.maximum(np.linalg.norm(gb, axis=1, keepdims=True), 1e-9)
            D[np.nonzero(moved)[0][near]] += (BONE_GAP_MM + 0.1 - sb[near])[:, None] * gbn[near]
            sv, nv = fs.vessel_sdf(v[moved] + D[moved])
            hit = sv < VESSEL_MARGIN_MM
            D[np.nonzero(moved)[0][hit]] += (VESSEL_MARGIN_MM + 0.1 - sv[hit])[:, None] * nv[hit]
        out[n] = D
    return out


def unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def meatus_r() -> np.ndarray:
    """The right internal acoustic meatus (the registered ear's porus: Skull base v3's landmark, sbv3-landmarks.json)."""
    return np.array(next(lm["ras"] for lm in json.loads((GEN / "sbv3-landmarks.json").read_text())
                         if lm["name"] == "Internal acoustic meatus" and lm.get("side") == "R"), float)


RS_INTO_OPENING = 0.15     # the corridor ends this share of the way from the keypoint to the opening's centre
def corridor() -> tuple[np.ndarray, np.ndarray]:
    """The retrosigmoid corridor: from the right internal acoustic meatus out through the craniotomy, just inside it from
    its keypoint (the opening's front upper corner, at the sinuses' junction: approach.json)."""
    ap = json.loads((BUILD / "approach.json").read_text())["retrosigmoid"]
    key, c = np.array(ap["keypoint"], float), np.array(ap["removed"]["verts"], float).mean(0)
    return meatus_r(), key + RS_INTO_OPENING * (c - key)


def to_corridor(P: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    t = np.clip(((P - a) @ (b - a)) / ((b - a) @ (b - a)), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * (b - a)), axis=1)


def retrosigmoid(parts: dict, fs: Fossa) -> dict:
    """Each part's displacement for the retrosigmoid shape: the right hemisphere and tonsil drawn RS_MM away from the
    corridor (meatus to keypoint), square to it towards the hemisphere's centre, with a weight falling to 0 RS_REACH_MM
    from it; then kept off bone and the arteries (as telovelar)."""
    iam, key = corridor()
    axis = unit(key - iam)
    right = [n for n in parts if n.startswith("Tonsil of cerebellum") or any(n.startswith(h) for h in HEMISPHERE)]
    centre = np.vstack([parts[n][0][parts[n][2] == "R"] for n in right]).mean(0) - iam
    dirn = unit(centre - (centre @ axis) * axis)
    out = {}
    for n, (v, _, side) in parts.items():
        D = np.zeros_like(v)
        if n in right:
            m = side == "R"
            w = np.clip(1 - to_corridor(v[m], iam, key) / RS_REACH_MM, 0, 1)
            D[m] = RS_MM * w[:, None] * dirn
            moved = np.abs(D).sum(1) > 0
            if moved.any():
                sb, gb = fs.bone(v[moved] + D[moved])
                near = sb < BONE_GAP_MM
                gbn = gb / np.maximum(np.linalg.norm(gb, axis=1, keepdims=True), 1e-9)
                D[np.nonzero(moved)[0][near]] += (BONE_GAP_MM + 0.1 - sb[near])[:, None] * gbn[near]
                sv, nv = fs.vessel_sdf(v[moved] + D[moved])
                hit = sv < VESSEL_MARGIN_MM
                D[np.nonzero(moved)[0][hit]] += (VESSEL_MARGIN_MM + 0.1 - sv[hit])[:, None] * nv[hit]
        out[n] = D
    return out


def inside_ventricle(parts: dict):
    """Whether points lie inside the fourth ventricle's surface (by the normal at its nearest vertex, within 4 mm)."""
    X, t, _ = parts["Fourth ventricle"]
    m = trimesh.Trimesh(X, t, process=True)
    if m.volume < 0:
        m.invert()
    tree, vn = cKDTree(m.vertices), m.vertex_normals

    def f(P):
        d, j = tree.query(P)
        return (d < 4.0) & (((P - m.vertices[j]) * vn[j]).sum(1) < 0)
    return f


def params_hash() -> str:
    keys = {k: v for k, v in globals().items() if k.isupper() and isinstance(v, (int, float, str, list, dict, tuple)) and not k.startswith(("TV_", "RS_"))}
    keys["inputs"] = [hashlib.sha1(p.read_bytes()).hexdigest() for p in (CT_BUILD / "bone.npz", CT_BUILD / "pfossa.json")]
    return hashlib.sha1(json.dumps(keys, sort_keys=True, default=str).encode()).hexdigest()[:16]


def normals(v, t):
    return trimesh.Trimesh(v, t, process=False).vertex_normals.copy()


def retro_report(parts: dict, moves: dict, fs: Fossa) -> dict:
    """How far the retrosigmoid shape moves the hemisphere, whether it stays clear, and how far the cerebellum is from the
    internal acoustic meatus at rest and drawn back."""
    iam, key = corridor()
    mv = np.vstack([moves[n] for n in parts])
    Xm = np.vstack([parts[n][0] + moves[n] for n in parts])
    moved = np.linalg.norm(mv, axis=1) > 0.1
    cereb = [n for n in parts if not any(n.startswith(m) for m in STEM)]
    gap = lambda f: round(float(min(np.linalg.norm(f(n), axis=1).min() for n in cereb)), 2)   # noqa: E731
    return {"maxMovedMm": round(float(np.linalg.norm(mv, axis=1).max()), 2), "moved": int(moved.sum()),
            "inBoneAfter": int((fs.bone(Xm[moved], grad=False) < 0).sum()),
            "inVesselAfter": int((fs.vessel_sdf(Xm[moved])[0] < 0).sum()),
            "meatusToCerebellumMm": {"rest": gap(lambda n: parts[n][0] - iam), "moved": gap(lambda n: parts[n][0] + moves[n] - iam)},
            # the cerebellum's points within 4 mm of the corridor (the meatus to where it meets the bone: four fifths of the way)
            "inCorridor": {k: int(sum((to_corridor(parts[n][0] + (moves[n] if k == "moved" else 0), iam, iam + 0.8 * (key - iam)) < 4).sum()
                                      for n in cereb)) for k in ("rest", "moved")}}


def main() -> int:
    t0 = time.time()
    BUILD.mkdir(parents=True, exist_ok=True)
    ex2 = json.loads((CT_BUILD / "export.json").read_text())
    md, fs = Model(), Fossa(ex2)
    print("model and fossa", round(time.time() - t0), "s; model", round(md.solid_ml), "ml", flush=True)
    A, b, rbfs, W, rep = fit(md, fs, BUILD / f"pfossa_fit_{params_hash()}.npz")
    print("fit", rep, round(time.time() - t0), "s", flush=True)
    allv = np.vstack([v for v, _ in md.meshes.values()])
    gp = BD.GridPhi(A, b, rbfs, W, allv.min(0) - 20, allv.max(0) + 20, step=1.0)
    parts, residual = {}, 0.0
    for n, (v, t) in md.meshes.items():
        X, res = gp.invert(v)
        residual = max(residual, float(res.max()))
        parts[n] = (X, t, side_of(n, v))
    rc = clear(parts, fs)
    print("cleared", rc, flush=True)
    moves = telovelar(parts, fs)
    rs_moves = retrosigmoid(parts, fs)
    # GLBs: each piece as L and R nodes
    items = []
    for pid, name, members, tok, cat, moving in PIECES:
        nodes, cent = [], {}
        for s in ("L", "R"):
            Vs, Ts, Ds, off = [], [], [], 0
            for n, (X, t, side) in parts.items():
                if not any(n == m or n.startswith(m + ".") for m in members):
                    continue
                fsel = (side[t] == s).sum(1) >= 2
                if not fsel.any():
                    continue
                used, inv = np.unique(t[fsel], return_inverse=True)
                Vs.append(X[used])
                Ds.append(np.c_[moves[n][used], rs_moves[n][used]])
                Ts.append(inv.reshape(-1, 3) + off)
                off += len(used)
            if not Vs:
                continue
            v, tt, DD = np.vstack(Vs), np.vstack(Ts), np.vstack(Ds)
            D, DR = DD[:, :3], DD[:, 3:]
            node = {"name": s, "positions": v, "normals": normals(v, tt), "indices": tt, "mode": TRIANGLES}
            if moving:
                node["targets"] = [{"name": "telovelar", "positions": D, "normals": normals(v + D, tt) - node["normals"]},
                                   {"name": "retrosigmoid", "positions": DR, "normals": normals(v + DR, tt) - node["normals"]}]
            nodes.append(node)
            cent[s] = v.mean(0).round(2).tolist()
        write_glb(BUILD / f"{pid}.glb", nodes, {"id": pid})
        items.append({"id": pid, "name": name, "token": tok, "category": cat, "morph": moving, "centroid": cent,
                      "parts": members})
    # the telovelar shape: how far it moves the tonsils, whether it stays in the cavity and clear of the brainstem
    mv = np.vstack([moves[n] for n in parts])
    Xm = np.vstack([parts[n][0] + moves[n] for n in parts])
    moved = np.linalg.norm(mv, axis=1) > 0.1
    medulla = cKDTree(np.vstack([parts[n][0] for n in parts if n.startswith("Medulla oblongata")]))
    tons = [n for n in parts if n.startswith("Tonsil of cerebellum")]
    cereb = [n for n in parts if not any(n.startswith(m) for m in STEM)]
    in4 = inside_ventricle(parts)
    inferior = [n for n in parts if n in INFERIOR_VERMIS]
    report = {"fit": rep, "inverseResidualMm": round(residual, 4), "clear": rc,
              "modelMl": round(md.solid_ml, 1),
              "telovelar": {"maxMovedMm": round(float(np.linalg.norm(mv, axis=1).max()), 2), "moved": int(moved.sum()),
                            "inBoneAfter": int((fs.bone(Xm[moved], grad=False) < 0).sum()),
                            "inVesselAfter": int((fs.vessel_sdf(Xm[moved])[0] < 0).sum()),
                            "tonsilToMedullaMm": {"rest": round(float(min(medulla.query(parts[n][0])[0].min() for n in tons)), 2),
                                                  "moved": round(float(min(medulla.query(parts[n][0] + moves[n])[0].min() for n in tons)), 2)},
                            "vermisLiftMm": round(float(min(np.linalg.norm(moves[n], axis=1).min() for n in inferior)), 2),
                            "uvulaToMedullaMm": {"rest": round(float(min(medulla.query(parts[n][0])[0].min() for n in inferior)), 2),
                                                 "moved": round(float(min(medulla.query(parts[n][0] + moves[n])[0].min() for n in inferior)), 2)},
                            "inVentricle": {"rest": int(sum(in4(parts[n][0]).sum() for n in cereb)),
                                            "moved": int(sum(in4(parts[n][0] + moves[n]).sum() for n in cereb))}},
              "retrosigmoid": retro_report(parts, rs_moves, fs),
              "params": {"rsMm": RS_MM, "rsReachMm": RS_REACH_MM, "tableGapMm": TABLE_GAP_MM, "tableMinMm": TABLE_MIN_MM, "boneGapMm": BONE_GAP_MM, "tvMm": TV_MM, "tvUp": TV_UP,
                         "tvReachMm": TV_REACH_MM, "tvVermisMm": TV_VERMIS_MM, "tvVermisBack": TV_VERMIS_BACK,
                         "tvVermisReachMm": TV_VERMIS_REACH_MM, "jacMin": JAC_MIN}}
    (BUILD / "pfossa.json").write_text(json.dumps({"items": items, "texts": md.texts, "report": report}, indent=1))
    print("posterior fossa done", report["telovelar"], report["retrosigmoid"], round(time.time() - t0), "s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
