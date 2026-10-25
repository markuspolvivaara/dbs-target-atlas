"""Skull base v3: the temporal bone in detail, on the CT of Skull base v2.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3.py
  then: node pipeline/compress.mjs skullbase-v3, pipeline/.venv/bin/python -I pipeline/skullbase_v3.py finalize

Bone and the labelled vessels are the CT angiogram's (TopBrain 2025, case 011): v2's meshes, reused as they are. A CT does
not show the nerves, and this one blurs the canals, so the contents of the temporal bone come from a real ear: the OpenEar
library (Sieber et al. 2019, CC BY 4.0), whose eight cadaver temporal bones were imaged by cone-beam CT and micro-slicing
and segmented at 0.125 mm. Specimen ALPHA (SPECIMEN) is registered onto each temporal bone of this CT: a similarity
transform (rotation, shift and one scale) that maximises the correlation between the specimen's bone and the CT's bone
within ROI_MM of its labyrinth (a global search over rotations, then a local optimisation), started from a point picked
by hand on the CT's slices (START). The left ear is the specimen mirrored. Its facial nerve, chorda tympani,
cochleovestibular nerve, perilymphatic spaces (cochlea, vestibule, semicircular canals), ossicles, tympanic membrane and
petrous carotid then follow the transform, consistent with each other as they were in that ear. CROSSCHECK specimens are
registered the same way and their landmarks compared, as a measure of how far a different ear would put them.
The greater petrosal nerve, which no specimen segments, is drawn by rule (see gspn()).

Inputs: the CT and its labels (pipeline/data/raw/topbrain/), v2's frame (pipeline/data/build/skullbase-ct/frame.npz, written
by skullbase_ct.py), v2's manifest (src/data/generated/sbct-manifest.json) and the OpenEar volumes (fetch_openear.py).
Writes pipeline/data/build/skullbase-v3/*.glb, src/data/generated/sbv3-{manifest,landmarks,definitions,fit}.json.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage, optimize
from scipy.sparse import csgraph, coo_matrix
from scipy.spatial import cKDTree
from scipy.spatial.transform import Rotation
from skimage.morphology import skeletonize

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import nrrd_read  # noqa: E402
from build import isosurface  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402

REPO = ROOT.parent
KIND = "skullbase-v3"
PREFIX = "sbv3"
BUILD = ROOT / "data" / "build" / KIND
GEN = REPO / "src" / "data" / "generated"
PUBLIC = REPO / "public" / "assets"
CT_PATH = ROOT / "data" / "raw" / "topbrain" / "topcow_ct_011_0000.nii.gz"
FRAME = ROOT / "data" / "build" / "skullbase-ct" / "frame.npz"
ZEXPORT = ROOT / "data" / "build" / "skullbase" / "export.json"     # Z-Anatomy's definitions (Wikipedia texts)
OPENEAR = ROOT / "data" / "raw" / "openear"
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())
DATASET_V2_LICENCE = "TopBrain data: open use with attribution, non-commercial (University Hospital Zurich); Z-Anatomy CC BY-SA 4.0"

IAM = "Nerves in the internal acoustic meatus (VII, VIII)"
SPEC_CAROTID = "Internal carotid artery (petrous part)"     # the specimen's: guides the trace of this patient's own
CAROTID = "Internal carotid artery (petrous and lacerum parts)"
OVER_SSC = "Bone over the superior semicircular canal"   # where the arcuate eminence is, when it marks the canal
SPECIMEN = "ALPHA"                 # the best fit of the eight on both sides (correlation, scale near 1, and its carotid,
CROSSCHECK = ["EPSILON", "ZETA"]   # nerve and ear canal falling in the CT's lumen, fluid and air): see the fit report
# the labyrinth of each ear on the CT, picked by hand on its axial slices (scanner mm): only the search's starting point
START = {"R": (31.0, 132.0, -293.0), "L": (-43.0, 145.0, -289.0)}
ROI_MM = 14.0          # the registration compares bone within this radius of the labyrinth
SCALE_RANGE = (0.85, 1.18)
MIN_CORRELATION = 0.6   # below this a fit is taken to have failed
SHIFT_MAX_MM = 10.0
CT_BONE = (300.0, 1400.0)  # HU mapped to 0..1 bone for the comparison
SPEC_BLUR_MM = 0.7          # the specimen's 0.125 mm bone is blurred to about the CT's resolution

# the specimen's segments carried over: our name, category, colour token, faces; matched on lower-case name fragments
PARTS = [
    ("Facial nerve (VII)", "nerve", "sbNerve", 12000, ("facial",)),
    ("Chorda tympani", "nerve", "sbNerve", 3000, ("chorda",)),
    # OpenEar's "cochleovestibular nerve" fills the canal's lumen (ALPHA: 222 mm3), so it stands for all the canal holds
    (IAM, "nerve", "sbNerve", 8000, ("cochleo", "vestibulo", "vestibuc", "vestibulc", "cochlear vest")),
    ("Scala tympani", "labyrinth", "sbLabyrinth", 8000, ("scala tymp",)),
    ("Scala vestibuli, vestibule and semicircular canals", "labyrinth", "sbLabyrinth", 14000, ("scala vest", "scala_vest")),
    ("Malleus", "ossicle", "sbBone", 4000, ("malleus",)),
    ("Incus", "ossicle", "sbBone", 4000, ("incus",)),
    ("Stapes", "ossicle", "sbBone", 2000, ("stapes",)),
    ("Tympanic membrane", "membrane", "sbMembrane", 4000, ("tympanic m", "tympanic d", "tympanic_m")),
    ("Internal carotid artery (petrous part)", "artery", "sbArtery", 8000, ("carot",)),
]


def unit(v):
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


# ---------------------------------------------------------------- the CT, the frame and the specimens
class CT:
    def __init__(self):
        img = nib.load(CT_PATH)
        self.aff = img.affine
        self.inv = np.linalg.inv(img.affine)
        hu = np.asanyarray(img.dataobj).astype(np.float32)
        self.hu = hu
        self.bone = np.clip((hu - CT_BONE[0]) / (CT_BONE[1] - CT_BONE[0]), 0, 1)
        f = np.load(FRAME)
        self.R, self.fossa = f["R"], f["fossa"]

    def sample(self, vol, P):
        q = (self.inv @ np.c_[P, np.ones(len(P))].T)[:3]
        return ndimage.map_coordinates(vol, q, order=1, mode="constant", cval=0)

    def to_frame(self, P):
        return (np.atleast_2d(P) - self.fossa) @ self.R

    def frame_affine(self) -> np.ndarray:
        F = np.eye(4)
        F[:3, :3] = self.R.T
        F[:3, 3] = -self.R.T @ self.fossa
        return F


class Specimen:
    def __init__(self, name: str):
        self.name = name
        bone, _, self.a_bone = nrrd_read.read(OPENEAR / name / "Bone.nrrd")
        seg, f, self.a_seg = nrrd_read.read(OPENEAR / name / "Segmentation.seg.nrrd")
        self.names = [g["name"] for g in f["segments"]]
        vs = abs(np.linalg.det(self.a_bone[:3, :3])) ** (1 / 3)
        self.blur = ndimage.gaussian_filter(bone.astype(np.float32), SPEC_BLUR_MM / vs)
        self.inv_bone = np.linalg.inv(self.a_bone)
        self.masks = {}
        for name_, cat, tok, faces, keys in PARTS:
            idx = [i for i, n in enumerate(self.names) if any(k in n.lower() for k in keys)]
            if idx:
                self.masks[name_] = np.any(seg[idx] > 0, axis=0)
        for i, n in enumerate(self.names):      # the round window, where the specimen has it
            if n.strip().lower() in ("rw", "round window"):
                self.masks["Round window"] = seg[i] > 0
        del seg
        lab = self.masks["Scala tympani"] | self.masks["Scala vestibuli, vestibule and semicircular canals"]
        self.c_lab = (self.a_seg @ np.r_[np.argwhere(lab).mean(0), 1])[:3]

    def sample_bone(self, P):
        q = (self.inv_bone @ np.c_[P, np.ones(len(P))].T)[:3]
        return ndimage.map_coordinates(self.blur, q, order=1, mode="constant", cval=-1)

    def points(self, part: str, every: int = 1) -> np.ndarray:
        idx = np.argwhere(self.masks[part])[::every]
        return (self.a_seg @ np.c_[idx, np.ones(len(idx))].T)[:3].T


# ---------------------------------------------------------------- registration
def _matrix(params, mirror):
    M = Rotation.from_rotvec(params[:3]).as_matrix() * np.exp(params[6])
    return M @ np.diag([-1.0, 1, 1]) if mirror else M


def register(ct: CT, sp: Specimen, side: str) -> dict:
    """The similarity transform taking this CT's ear (scanner mm) to the specimen: p_spec = M (p_ct - c_ct) + c_lab + t.
    Searched over 1500 rotations, the specimen as it is and mirrored, then the best twelve optimised locally. Cached in
    the build folder under a key of everything it depends on."""
    import hashlib
    key = hashlib.sha256(repr((sp.name, side, START[side], ROI_MM, SCALE_RANGE, SHIFT_MAX_MM, CT_BONE, SPEC_BLUR_MM, 2)).encode()).hexdigest()[:16]
    cache = BUILD / f"reg_{sp.name}_{side}_{key}.npz"
    if cache.exists():
        z = np.load(cache)
        return {"M": z["M"], "Minv": np.linalg.inv(z["M"]), "t": z["t"], "c_ct": z["c_ct"], "c_sp": z["c_sp"],
                "mirror": bool(z["mirror"]), "scale": float(z["scale"]), "correlation": float(z["correlation"])}
    reg = _register(ct, sp, side)
    BUILD.mkdir(parents=True, exist_ok=True)
    np.savez(cache, **{k: v for k, v in reg.items() if k != "Minv"})
    return reg


def _register(ct: CT, sp: Specimen, side: str) -> dict:
    c_ct = np.array(START[side])

    def grid(step):
        g = np.arange(-ROI_MM, ROI_MM + 1e-6, step)
        G = np.stack(np.meshgrid(g, g, g, indexing="ij"), -1).reshape(-1, 3)
        return G[np.linalg.norm(G, axis=1) <= ROI_MM]

    def score(params, G, F, mirror):
        if not (SCALE_RANGE[0] <= np.exp(params[6]) <= SCALE_RANGE[1]) or np.linalg.norm(params[3:6]) > SHIFT_MAX_MM:
            return 1.0
        m = sp.sample_bone(G @ _matrix(params, mirror).T + sp.c_lab + params[3:6])
        ok = m >= 0
        if ok.mean() < 0.6:
            return 1.0
        a, b = F[ok] - F[ok].mean(), m[ok] - m[ok].mean()
        return -(a * b).sum() / (np.sqrt((a * a).sum() * (b * b).sum()) + 1e-9)

    Gc = grid(1.5)
    Fc = ct.sample(ct.bone, Gc + c_ct)
    starts = []
    for mirror in (0, 1):
        for rv in Rotation.random(1500, random_state=0).as_rotvec():
            starts.append((score(np.r_[rv, 0, 0, 0, 0.0], Gc, Fc, mirror), mirror, rv))
    starts.sort(key=lambda s: s[0])
    G = grid(0.75)
    F = ct.sample(ct.bone, G + c_ct)
    best = None
    for _, mirror, rv in starts[:12]:
        r = optimize.minimize(score, np.r_[rv, 0, 0, 0, 0.0], args=(G, F, mirror), method="Powell",
                              options={"xtol": 1e-3, "ftol": 1e-5, "maxfev": 4000})
        if best is None or r.fun < best[0]:
            best = (r.fun, mirror, r.x)
    fun, mirror, x = best
    M = _matrix(x, mirror)
    return {"M": M, "Minv": np.linalg.inv(M), "t": x[3:6], "c_ct": c_ct, "c_sp": sp.c_lab, "mirror": bool(mirror),
            "scale": float(np.exp(x[6])), "correlation": float(-fun)}


def spec_to_scanner(reg: dict, P: np.ndarray) -> np.ndarray:
    return (np.atleast_2d(P) - reg["c_sp"] - reg["t"]) @ reg["Minv"].T + reg["c_ct"]


def voxel_to_frame(ct: CT, reg: dict, a_vox: np.ndarray) -> np.ndarray:
    """Affine from a specimen grid's voxels to the frame (through the specimen's mm, the CT's scanner mm)."""
    S = np.eye(4)
    S[:3, :3] = reg["Minv"]
    S[:3, 3] = -reg["Minv"] @ (reg["c_sp"] + reg["t"]) + reg["c_ct"]
    return ct.frame_affine() @ S @ a_vox


# ---------------------------------------------------------------- the facial nerve's course and landmarks
def centre_line(mask: np.ndarray, a_vox: np.ndarray) -> np.ndarray:
    """The longest path through the skeleton of a tube-like mask (its trunk; branch stubs dropped), in mm, smoothed, and
    carried on at each end along its direction to where the mask ends (a skeleton stops about one radius short)."""
    sk = np.argwhere(skeletonize(mask))
    t = cKDTree(sk)
    pairs = t.query_pairs(1.75, output_type="ndarray")
    w = np.linalg.norm(sk[pairs[:, 0]] - sk[pairs[:, 1]], axis=1)
    g = coo_matrix((np.r_[w, w], (np.r_[pairs[:, 0], pairs[:, 1]], np.r_[pairs[:, 1], pairs[:, 0]])), shape=(len(sk),) * 2)
    d0 = csgraph.dijkstra(g, indices=0)
    a = int(np.nanargmax(np.where(np.isinf(d0), -1, d0)))
    da, pred = csgraph.dijkstra(g, indices=a, return_predecessors=True)
    b = int(np.nanargmax(np.where(np.isinf(da), -1, da)))
    path = [b]
    while path[-1] != a:
        path.append(int(pred[path[-1]]))
    P = (a_vox @ np.c_[sk[path], np.ones(len(path))].T)[:3].T
    # resample every 0.25 mm and smooth over about 1 mm
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    u = np.arange(0, s[-1], 0.25)
    P = np.stack([np.interp(u, s, P[:, k]) for k in range(3)], 1)
    P = ndimage.gaussian_filter1d(P, 4, axis=0, mode="nearest")
    inv = np.linalg.inv(a_vox)
    soft = ndimage.gaussian_filter(mask.astype(np.float32), 1.0)

    def inside(p):
        return ndimage.map_coordinates(soft, (inv @ np.r_[p, 1])[:3, None], order=1)[0] > 0.5
    ends = []
    for end, prev in ((P[0], P[min(8, len(P) - 1)]), (P[-1], P[max(0, len(P) - 9)])):
        d, ext = unit(end - prev), []
        for k in range(1, 13):                  # up to 3 mm
            q = end + 0.25 * k * d
            if not inside(q):
                break
            ext.append(q)
        ends.append(np.array(ext).reshape(-1, 3))
    return np.vstack([ends[0][::-1], P, ends[1]])


def turning(P: np.ndarray, i: int, win: int = 12) -> float:
    a, b = P[i] - P[max(0, i - win)], P[min(len(P) - 1, i + win)] - P[i]
    return float(np.degrees(np.arccos(np.clip(np.dot(unit(a), unit(b)), -1, 1))))


def facial_landmarks(line: np.ndarray, viii_end: np.ndarray) -> dict:
    """On the facial nerve's centre line (frame mm, any direction). Its proximal end, nearer the canal's contents, is where
    the specimen's facial nerve leaves the internal acoustic meatus (the fundus). The geniculate ganglion is the first genu:
    the sharpest turn within 8 mm of it (Gupta 2013: a 75 degree turn posteriorly). The second genu is spread over several
    millimetres, so it is taken where the nerve has turned half way from its tympanic direction (2-7 mm behind the
    geniculate ganglion) to its mastoid direction (its last 8 mm). Returns indices and the angle between the two."""
    if np.linalg.norm(line[0] - viii_end) > np.linalg.norm(line[-1] - viii_end):
        line = line[::-1]
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(line, axis=0), axis=1))]
    near = np.nonzero(s <= 8.0)[0]
    gen = int(max(near[4:-4], key=lambda i: turning(line, i, 8)))
    i2, i7 = np.searchsorted(s, s[gen] + 2.0), np.searchsorted(s, s[gen] + 7.0)
    tymp = unit(line[i7] - line[i2])
    j8 = np.searchsorted(s, s[-1] - 8.0)
    mast = unit(line[-1] - line[j8])
    total = float(np.degrees(np.arccos(np.clip(tymp @ mast, -1, 1))))
    second = len(line) - 1
    for i in range(i2, j8):
        tan = unit(line[min(i + 4, len(line) - 1)] - line[max(i - 4, 0)])
        if np.degrees(np.arccos(np.clip(tan @ tymp, -1, 1))) >= total / 2:
            second = i
            break
    return {"line": line, "fundus": 0, "geniculate": gen, "second": second, "genuAngle": 180.0 - total}


def seg_length(line, i, j) -> float:
    return float(np.linalg.norm(np.diff(line[min(i, j):max(i, j) + 1], axis=0), axis=1).sum())


# ---------------------------------------------------------------- one ear
def ear(ct: CT, sp: Specimen, side: str, meshes: bool = True) -> dict:
    reg = register(ct, sp, side)
    out = {"reg": reg, "parts": {}, "landmarks": {}}
    a_frame = voxel_to_frame(ct, reg, sp.a_seg)
    # the fit's checks: the CT's values inside the carried-over structures (cores, so partial volume at edges matters less)
    checks = {}
    for part in (IAM, "Internal carotid artery (petrous part)"):
        if part in sp.masks:
            core = ndimage.binary_erosion(sp.masks[part], iterations=2)
            idx = np.argwhere(core)[::5]
            P = spec_to_scanner(reg, (sp.a_seg @ np.c_[idx, np.ones(len(idx))].T)[:3].T)
            checks[part] = float(np.median(ct.sample(ct.hu, P)))
    out["checks"] = checks
    if meshes:
        for name, cat, tok, faces, _ in PARTS:
            if name in sp.masks and sp.masks[name].sum() > 50:
                m = isosurface(sp.masks[name].astype(np.float32), a_frame, 0.5, 1.0, faces)
                out["parts"][name] = (np.asarray(m.vertices), np.asarray(m.faces))
    # landmarks (frame mm)
    viii = ct.to_frame(spec_to_scanner(reg, sp.points(IAM, 7)))
    lab = ct.to_frame(spec_to_scanner(reg, sp.points("Scala vestibuli, vestibule and semicircular canals", 5)))
    coch = ct.to_frame(spec_to_scanner(reg, sp.points("Scala tympani", 3)))
    # the cochleovestibular nerve's lateral end: its point nearest the labyrinth
    viii_end = viii[np.argmin(cKDTree(np.vstack([lab, coch])).query(viii)[0])]
    fl = facial_landmarks(centre_line(sp.masks["Facial nerve (VII)"], a_frame), viii_end)
    line = fl["line"]
    out["facial"] = fl
    L = out["landmarks"]
    L["Fundus of internal acoustic meatus"] = line[fl["fundus"]]
    L["Geniculate ganglion"] = line[fl["geniculate"]]
    L["Second genu of facial nerve"] = line[fl["second"]]
    L["Distal end of the specimen's facial nerve"] = line[-1]
    if "Stapes" in sp.masks:
        st = ct.to_frame(spec_to_scanner(reg, sp.points("Stapes")))
        # the footplate: the stapes' end nearest the vestibule
        d = cKDTree(lab).query(st)[0]
        L["Oval window"] = st[d <= np.percentile(d, 15)].mean(0)
    if "Round window" in sp.masks:
        L["Round window"] = ct.to_frame(spec_to_scanner(reg, sp.points("Round window"))).mean(0)
    # the superior semicircular canal's top, and the bone surface over it (the arcuate eminence)
    top = lab[np.argmax(lab[:, 2])]
    L["Superior semicircular canal (top)"] = top
    out["ssc_top"] = top
    return out


def bone_surface_above(ct: CT, p_frame: np.ndarray, reach: float = 15.0) -> np.ndarray | None:
    """The first point above p (frame +z) where the CT's bone ends: the bone surface over it."""
    Rinv = ct.R.T
    zs = np.arange(0, reach, 0.25)
    P = p_frame + zs[:, None] * np.array([0, 0, 1.0])
    sc = P @ Rinv + ct.fossa
    v = ct.sample(ct.hu, sc)
    inside = v > 400
    if not inside.any():
        return None
    k = int(np.argmax(inside))           # first bone above (should be at once)
    out = np.nonzero(~inside[k:])[0]
    return P[k + out[0]] if len(out) else None


# ---------------------------------------------------------------- the greater petrosal nerve (rule-built)
GSPN_MM = 13.78   # Nguyen 2026: geniculate ganglion to GSPN ("true GSPN") length, mean of 42 sides
GSPN_CLEAR_MM = 1.0   # its centre line kept this far from the carried-over carotid's surface


def gspn(ct: CT, gen: np.ndarray, carotid: np.ndarray, side_sign: float) -> np.ndarray:
    """The greater petrosal nerve, drawn by rule: from the geniculate ganglion forwards and medially (Gupta 2013: it leaves
    the geniculate ganglion anteriorly and runs along the anterior surface of the temporal bone towards the pterygoid
    canal), aimed over the carried-over petrous carotid's anteromedial end (towards the foramen lacerum); the straight
    line there is lifted onto the middle fossa floor (the CT's bone surface above it, 0.6 mm over it) and drawn for
    GSPN_MM, the published mean length."""
    tip = carotid[np.argmax(carotid[:, 1] - side_sign * carotid[:, 0])]   # most anterior and medial
    end = bone_surface_above(ct, tip, reach=25.0)
    end = tip if end is None else end
    pts = []
    for s in np.linspace(0, 1, 40):
        p = gen + s * (end - gen)
        q = bone_surface_above(ct, p - np.array([0, 0, 6.0]), reach=14.0)
        pts.append((q if q is not None else p) + np.array([0, 0, 0.6]))
    P = np.array(pts)
    P[0] = gen
    P = ndimage.gaussian_filter1d(P, 2, axis=0, mode="nearest")
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    u = np.arange(0, min(GSPN_MM, s[-1]) + 1e-6, 0.4)
    P = np.stack([np.interp(u, s, P[:, k]) for k in range(3)], 1)
    # where the carotid canal's roof is too thin for the CT, the floor found can be the carotid itself: the path is pushed
    # away from the carotid's nearest point until GSPN_CLEAR_MM clear, smoothed, and pushed again (the ends stay)
    tree = cKDTree(carotid)
    for it in range(6):
        d, j = tree.query(P)
        close = d < GSPN_CLEAR_MM
        close[0] = False
        if not close.any():
            break
        away = P[close] - carotid[j[close]]
        away /= np.linalg.norm(away, axis=1, keepdims=True) + 1e-9
        P[close] = carotid[j[close]] + away * GSPN_CLEAR_MM
        if it < 5:
            P[1:] = ndimage.gaussian_filter1d(P, 1, axis=0, mode="nearest")[1:]
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]   # the length again, after the pushing
    keep = s <= GSPN_MM + 1e-6
    return P[keep]


# ---------------------------------------------------------------- output
def mesh_normals(v, t):
    n = np.zeros_like(v)
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    for k in range(3):
        np.add.at(n, t[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.where(ln == 0, 1, ln)


def tube_mesh_var(P: np.ndarray, r: np.ndarray):
    import skullbase_build as SB
    return SB.tube(np.c_[P, r])


def tube_mesh(P: np.ndarray, r: float):
    import skullbase_build as SB
    v, n, t = SB.tube(np.c_[P, np.full(len(P), r)])
    return v, n, t


def main() -> int:
    ct = CT()
    BUILD.mkdir(parents=True, exist_ok=True)
    for old in BUILD.glob("tb_*.glb"):      # its own; the brain (br_), the craniotomy and the vessels the brain module
        old.unlink()                        # carries are written by skullbase_brain.py and skullbase_v3_approach.py
    ears, fits = {}, {}
    sp = Specimen(SPECIMEN)
    for side in ("R", "L"):
        ears[side] = ear(ct, sp, side)
        r = ears[side]["reg"]
        fits[side] = {"specimen": SPECIMEN, "correlation": round(r["correlation"], 3), "scale": round(r["scale"], 3),
                      "mirrored": r["mirror"], "checksHU": {k: round(v) for k, v in ears[side]["checks"].items()}}
        print(side, fits[side])
    del sp
    # cross-check: other ears registered the same way, their landmarks against the chosen one's
    cross = {}
    for name in CROSSCHECK:
        other = Specimen(name)
        for side in ("R", "L"):
            o = ear(ct, other, side, meshes=False)
            if o["reg"]["correlation"] < MIN_CORRELATION:   # a failed fit says nothing about where another ear puts things
                cross.setdefault(side, {})[name] = {"correlation": round(o["reg"]["correlation"], 3), "failed": True}
                print("cross-check", name, side, "failed fit", round(o["reg"]["correlation"], 3))
                continue
            d = {k: round(float(np.linalg.norm(o["landmarks"][k] - ears[side]["landmarks"][k])), 1)
                 for k in ("Fundus of internal acoustic meatus", "Geniculate ganglion", "Second genu of facial nerve", "Oval window")
                 if k in o["landmarks"] and k in ears[side]["landmarks"]}
            cross.setdefault(side, {})[name] = {"correlation": round(o["reg"]["correlation"], 3), "scale": round(o["reg"]["scale"], 3),
                                                "distanceMm": d}
            print("cross-check", name, side, cross[side][name])
        del other
    write_outputs(ct, ears, fits, cross)
    return 0


def porus_point(v: np.ndarray) -> np.ndarray:
    """The medial end of the internal acoustic meatus' contents (a mesh's vertices, frame mm): its opening."""
    c = v.mean(0)
    axis = np.linalg.svd(v - c)[2][0]
    t = (v - c) @ axis
    medial_end = 1 if abs((c + t.max() * axis)[0]) < abs((c + t.min() * axis)[0]) else -1
    t = t * medial_end
    return v[t >= t.max() - 1.0].mean(0)


def write_outputs(ct: CT, ears: dict, fits: dict, cross: dict) -> None:
    """GLBs (left and right ear as nodes L and R), the manifest (v2's CT bone and TopBrain vessels by reference, the
    carried-over structures, the cranial nerves routed through this CT, the vessels TotalSegmentator finds), landmarks,
    definitions and the fit report."""
    import skullbase_build as SB
    import skullbase_v3_base as BASE
    v2 = json.loads((GEN / "sbct-manifest.json").read_text())
    ex2 = json.loads((ROOT / "data" / "build" / "skullbase-ct" / "export.json").read_text())
    porus = {s: porus_point(ears[s]["parts"][IAM][0]) for s in ("L", "R")}
    base = BASE.build(ex2, ct.fossa, ct.R, porus, {s: ears[s]["parts"][SPEC_CAROTID][0] for s in ("L", "R")})
    # this patient's own carotid (traced in the CT) as a point cloud of its surface, for clearances
    carotid_surface = {}
    for s in ("L", "R"):
        c = base["carotids"][s]
        carotid_surface[s] = tube_mesh_var(c["path"], c["radius"])[0]
    items = []
    # v3's own skull (completed beyond the scan), else v2's bones; and the vessels the CT itself shows (not the Z-Anatomy
    # structures fitted onto it)
    own_skull = skull_items(items, v2)
    for it in v2["structures"]:
        if (it["type"] == "bone" and not own_skull) or (it.get("category") in ("artery", "vein") and not it.get("fitted")):
            items.append({**it})
    dataset = {
        "name": "TopBrain 2025 CT angiogram (case 011) with OpenEar temporal bone ALPHA registered onto it",
        "licence": "TopBrain data: open use with attribution, non-commercial (University Hospital Zurich); OpenEar: CC BY 4.0; "
                   "the nerves' courses derive from Z-Anatomy: CC BY-SA 4.0 (BodyParts3D CC BY-SA 2.1 Japan); "
                   "definitions Wikipedia CC BY-SA 3.0 (as shipped with Z-Anatomy); TotalSegmentator segmentations (Apache-2.0 models); "
                   "the surgical view's template brain: Lead-DBS, GPL-3.0 (FreeSurfer labels: research use)",
        "url": "https://zenodo.org/records/1473724",
        "cite": ["sieber2019", "topbrain2025", "topcow2023", "wasserthal2023", "mitsuhashi2009"],
    }
    CITES = SB.CITES
    for name, cat, tok, faces, _ in PARTS:
        if name == SPEC_CAROTID:    # drawn from this patient's own lumen instead (below); the specimen's only guides it
            continue
        sides = {s: ears[s]["parts"][name] for s in ("L", "R") if name in ears[s]["parts"]}
        if len(sides) < 2:
            continue
        sid = SB.slug(name).replace("sb_", "tb_", 1)
        nodes, cent = [], {}
        for s, (v, t) in sorted(sides.items()):
            n_ = mesh_normals(v, t)
            if name == "Facial nerve (VII)":     # with its routed cisternal part, brainstem to the meatus
                r_ = base["routes"][(name, s)]
                tv, tn, tt = tube_mesh(r_["path"], r_["radius"])
                v, n_, t = np.vstack([v, tv]), np.vstack([n_, tn]), np.vstack([t, tt + len(v)])
            nodes.append({"name": s, "positions": v, "normals": n_, "indices": t, "mode": TRIANGLES})
            cent[s] = v.mean(0).round(2).tolist()
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        items.append({
            "id": sid, "name": name, "aliases": [], "type": "soft", "file": f"assets/{KIND}/{sid}.glb", "bytes": 0,
            "colour": colour(tok), "dataset": "openear", "source": "OpenEar temporal bone ALPHA (Sieber et al. 2019)",
            "licence": "CC BY 4.0", "citation": [CITES["sieber2019"]["citation"]], "citationUrls": [CITES["sieber2019"]["url"]],
            "refIds": [], "category": cat, "layer": "nuclei" if cat == "ossicle" else "tracts" if cat in ("nerve", "artery") else "cortex",
            "cranialNerve": 7 if "Facial" in name or "Chorda" in name else 8 if name == IAM else None,
            "derivation": f"Segmented in OpenEar specimen {SPECIMEN} (cone-beam CT and micro-slicing, 0.125 mm) and carried onto "
                          "each temporal bone of this CT by the specimen's registration (the left ear mirrored)."
                          + (" Its cisternal part, from the brainstem to the internal acoustic meatus, is routed through this CT "
                             "from the fitted Z-Anatomy course (approximate)." if name == "Facial nerve (VII)" else ""),
            "centroid": {"L": cent["L"], "R": cent["R"]},
        })
    # the greater petrosal nerve, rule-built
    nodes, cent = [], {}
    for s, sign in (("L", -1.0), ("R", 1.0)):
        e = ears[s]
        P = gspn(ct, e["landmarks"]["Geniculate ganglion"], carotid_surface[s], sign)
        v, n, t = tube_mesh(P, 0.45)
        nodes.append({"name": s, "positions": v, "normals": n, "indices": t, "mode": TRIANGLES})
        cent[s] = P.mean(0).round(2).tolist()
        e["gspn"] = P
    sid = "tb_greater_petrosal_nerve"
    write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
    items.append({
        "id": sid, "name": "Greater petrosal nerve", "aliases": ["Greater superficial petrosal nerve"], "type": "soft",
        "file": f"assets/{KIND}/{sid}.glb", "bytes": 0, "colour": colour("sbNerve"), "dataset": "rule", "source": "Drawn by rule",
        "licence": "GPL-3.0 (the project's own drawing)", "citation": [], "citationUrls": [], "refIds": ["gupta2013"],
        "category": "nerve", "layer": "tracts", "cranialNerve": 7, "schematic": True,
        "derivation": "Drawn by rule (no specimen segments it): from the carried-over geniculate ganglion forwards and medially, "
                      "towards the foramen lacerum over the anteromedial end of this patient's petrous carotid, lifted onto "
                      f"this CT's middle fossa floor, kept 1 mm clear of the carotid, and stopped at {GSPN_MM} mm (the mean length in Nguyen 2026). Radius 0.45 mm, illustrative.",
        "centroid": {"L": cent["L"], "R": cent["R"]},
    })
    # the cranial nerves routed through this CT (VII's cisternal part is in the facial nerve above)
    cite_v2 = [CITES[c]["citation"] for c in ("topbrain2025", "mitsuhashi2009")]
    url_v2 = [CITES[c]["url"] for c in ("topbrain2025", "mitsuhashi2009")]
    names = [n for n, *_ in BASE.NERVES if n != "Facial nerve (VII)"] + [a for a, *_ in BASE.ARTERIES]
    for name in names:
        nodes, cent = [], {}
        for s in ("L", "R"):
            r_ = base["routes"][(name, s)]
            v, n_, t = tube_mesh(r_["path"], r_["radius"])
            nodes.append({"name": s, "positions": v, "normals": n_, "indices": t, "mode": TRIANGLES})
            cent[s] = r_["path"].mean(0).round(2).tolist()
        sid = SB.slug(name).replace("sb_", "tb_", 1)
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        artery = name in [a for a, *_ in BASE.ARTERIES]
        rep_ = base["report"][name]
        items.append({
            "id": sid, "name": name, "aliases": [], "type": "soft", "file": f"assets/{KIND}/{sid}.glb", "bytes": 0,
            "colour": colour("sbArtery" if artery else "sbNerve"), "dataset": "routed",
            "source": "Routed through the TopBrain CT from the fitted Z-Anatomy course", "licence": DATASET_V2_LICENCE,
            "citation": cite_v2, "citationUrls": url_v2, "refIds": [], "category": "artery" if artery else "nerve", "layer": "tracts",
            **({"system": "Middle meningeal artery"} if artery else {"cranialNerve": base["routes"][(name, "R")]["cn"]}),
            "derivation": "Its course from the Z-Anatomy model fitted onto this CT (Skull base v2), routed through the CT: the "
                          "least-cost path near that course that cannot cross bone except through an opening, so it passes the "
                          "skull base where this CT has its foramen. "
                          + "; ".join(f"{'right' if s_ == 'R' else 'left'}: {rep_[s_]['lengthMm']} mm drawn, at most "
                                      f"{rep_[s_]['maxFromFittedMm']} mm from the fitted course, {rep_[s_]['boneCrossedMm']} mm through "
                                      "bone the mask closes" for s_ in ("R", "L"))
                          + ". Its cisternal course is approximate (the brainstem is not in the CT); drawn to just past the skull base.",
            "centroid": {"L": cent["L"], "R": cent["R"]},
        })
    # the sigmoid and transverse sinuses, traced through this CT's enhanced lumen
    for part, name in (("sigmoid", "Sigmoid sinus"), ("transverse", "Transverse sinus")):
        nodes, cent = [], {}
        for s_ in ("L", "R"):
            P, rad = base["sinuses"][s_][part]
            import skullbase_build as SB_
            v, n_, t = SB_.tube(np.c_[P, rad])
            nodes.append({"name": s_, "positions": v, "normals": n_, "indices": t, "mode": TRIANGLES})
            cent[s_] = P.mean(0).round(2).tolist()
        sid = SB.slug(name).replace("sb_", "tb_", 1)
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        rp = {s_: base["sinuses"][s_]["report"] for s_ in ("R", "L")}
        items.append({
            "id": sid, "name": name, "aliases": [], "type": "soft", "file": f"assets/{KIND}/{sid}.glb", "bytes": 0,
            "colour": colour("sbVein"), "dataset": "traced", "source": "Traced through the TopBrain CT's enhanced lumen",
            "licence": DATASET_V2_LICENCE, "citation": cite_v2, "citationUrls": url_v2, "refIds": [], "category": "vein", "layer": "tracts",
            "derivation": "Traced through this CT's own contrast-filled lumen, from the jugular bulb (the top of TotalSegmentator's "
                          "internal jugular vein) to the transverse sinus near the midline, near the fitted Z-Anatomy course and along "
                          "the middle of the enhanced channel; drawn as thick as the lumen is deep. "
                          + "; ".join(f"{'right' if s_ == 'R' else 'left'}: {round(rp[s_]['inLumenShare'] * 100)} % of the trace at least "
                                      f"1.5 mm inside the lumen, median radius {rp[s_]['medianRadiusMm']} mm" for s_ in ("R", "L"))
                          + ". Split from the transverse sinus at the fitted junction of the two.",
            "centroid": {"L": cent["L"], "R": cent["R"]},
        })
    # this patient's carotid through the carotid canal and foramen lacerum, traced in its contrast-filled lumen
    nodes, cent = [], {}
    for s_ in ("L", "R"):
        c = base["carotids"][s_]
        v, n_, t = tube_mesh_var(c["path"], c["radius"])
        nodes.append({"name": s_, "positions": v, "normals": n_, "indices": t, "mode": TRIANGLES})
        cent[s_] = c["path"].mean(0).round(2).tolist()
    sid = SB.slug(CAROTID).replace("sb_", "tb_", 1)
    write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
    cr = {s_: base["carotids"][s_]["report"] for s_ in ("R", "L")}
    items.append({
        "id": sid, "name": CAROTID, "aliases": ["Petrous internal carotid artery"], "type": "soft", "file": f"assets/{KIND}/{sid}.glb",
        "bytes": 0, "colour": colour("sbArtery"), "dataset": "traced", "source": "Traced through the TopBrain CT's contrast-filled lumen",
        "licence": DATASET_V2_LICENCE, "citation": cite_v2, "citationUrls": url_v2, "refIds": [], "category": "artery", "layer": "tracts",
        "system": "Internal carotid artery",
        "derivation": "This patient's own carotid, traced through its contrast-filled lumen from the top of the cervical carotid "
                      "(TotalSegmentator) through the carotid canal and the foramen lacerum to the cavernous carotid (TopBrain's label), "
                      "near the registered OpenEar specimen's carotid; drawn as thick as the lumen is deep. "
                      + "; ".join(f"{'right' if s_ == 'R' else 'left'}: {round(cr[s_]['inLumenShare'] * 100)} % of the trace at least 1.5 mm "
                                  f"inside the lumen, median radius {cr[s_]['medianRadiusMm']} mm, a median {cr[s_]['medianFromSpecimenMm']} mm "
                                  "from the specimen's carotid" for s_ in ("R", "L")) + ".",
        "centroid": {"L": cent["L"], "R": cent["R"]},
    })
    # the small arteries this CT cannot show: anchored to this patient's parent vessels, or routed (approximate)
    names_small = sorted({n for n, _ in base["small"]})
    for name in names_small:
        nodes, cent = [], {}
        sides_ok = [s_ for s_ in ("L", "R") if (name, s_) in base["small"]]
        if len(sides_ok) < 2:
            continue
        for s_ in sides_ok:
            vs, ns, ts, off = [], [], [], 0
            for P, r in base["small"][(name, s_)]["runs"]:
                v, n_, t = tube_mesh_var(P, np.maximum(r, 0.3))
                vs.append(v); ns.append(n_); ts.append(t + off); off += len(v)
            V = np.vstack(vs)
            nodes.append({"name": s_, "positions": V, "normals": np.vstack(ns), "indices": np.vstack(ts), "mode": TRIANGLES})
            cent[s_] = V.mean(0).round(2).tolist()
        sid = SB.slug(name).replace("sb_", "tb_", 1)
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        info = base["small"][(name, "R")]
        items.append({
            "id": sid, "name": name, "aliases": [], "type": "soft", "file": f"assets/{KIND}/{sid}.glb", "bytes": 0,
            "colour": colour("sbArtery"), "dataset": "fitted", "source": "Z-Anatomy, fitted onto the TopBrain CT and anchored to it",
            "licence": DATASET_V2_LICENCE, "citation": cite_v2, "citationUrls": url_v2, "refIds": [], "category": "artery", "layer": "tracts",
            "system": info["system"], "fitted": True,
            "derivation": "Too small for this angiogram to show: the Z-Anatomy branch fitted onto this CT (Skull base v2), "
                          + info["how"] + f" (a median {info['moved']} mm on the right, {base['small'][(name, 'L')]['moved']} mm on the left)."
                          " Its course is approximate.",
            "centroid": {"L": cent["L"], "R": cent["R"]},
        })
    # vessels TotalSegmentator segments in this CT
    for name, rel, cat in (("Internal carotid artery (cervical part)", "internal_carotid_artery", "artery"),
                           ("Internal jugular vein", "internal_jugular_vein", "vein")):
        nodes, cent = [], {}
        for s, suf in (("L", "left"), ("R", "right")):
            img = nib.load(BASE.TS / "headneck_bones_vessels" / f"{rel}_{suf}.nii.gz")
            m = isosurface((np.asanyarray(img.dataobj) > 0).astype(np.float32), ct.frame_affine() @ img.affine, 0.5, 0.8, 6000)
            v, t = np.asarray(m.vertices), np.asarray(m.faces)
            nodes.append({"name": s, "positions": v, "normals": mesh_normals(v, t), "indices": t, "mode": TRIANGLES})
            cent[s] = v.mean(0).round(2).tolist()
        sid = SB.slug(name).replace("sb_", "tb_", 1)
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        items.append({
            "id": sid, "name": name, "aliases": [], "type": "soft", "file": f"assets/{KIND}/{sid}.glb", "bytes": 0,
            "colour": colour("sbArtery" if cat == "artery" else "sbVein"), "dataset": "totalsegmentator",
            "source": "TotalSegmentator (headneck_bones_vessels) on the TopBrain CT", "licence": DATASET_V2_LICENCE,
            "citation": [CITES["wasserthal2023"]["citation"]], "citationUrls": [CITES["wasserthal2023"]["url"]], "refIds": [],
            "category": cat, "layer": "tracts", **({"system": "Internal carotid artery"} if cat == "artery" else {}),
            "derivation": "Segmented in this CT by TotalSegmentator's headneck_bones_vessels task, up to the skull base.",
            "centroid": {"L": cent["L"], "R": cent["R"]},
        })
    brain_items(items, ex2, v2)
    pfossa_items(items)
    approach_items(items, ex2)
    for it in items:
        if it.get("cranialNerve") is None:
            it.pop("cranialNerve", None)
        if it["id"].startswith("tb_") and it["category"] == "artery" and not it.get("system"):
            it["system"] = "Internal carotid artery"    # listed under its trunk, as the CT's own arteries are
    # landmarks
    landmarks = []
    for s in ("R", "L"):
        e = ears[s]
        lm = dict(e["landmarks"])
        ae = bone_surface_above(ct, e["ssc_top"])
        if ae is not None:
            lm[OVER_SSC] = ae
        lm.pop("Superior semicircular canal (top)", None)
        for name, p in lm.items():
            landmarks.append({"id": SB.slug(name).replace("sb_", "lm_", 1) + "_" + s.lower(), "name": name, "bone": "Temporal bone",
                              "part": "Petrous part", "ras": np.round(p, 2).tolist(), "side": s,
                              "boneFrom": "carried over from OpenEar specimen " + SPECIMEN if name != OVER_SSC
                              else "the CT's bone surface over the carried-over superior semicircular canal",
                              "distanceToBoneMm": 0.0})
    # relations measured on the model, to compare with the published ones (Nguyen 2026)
    relations = {}
    for s in ("R", "L"):
        e = ears[s]
        gg = e["landmarks"]["Geniculate ganglion"]
        coch = e["parts"]["Scala tympani"][0]
        car = carotid_surface[s]
        relations[s] = {"geniculateToCochlea": round(float(cKDTree(coch).query(gg)[0]), 1),
                        "geniculateToSuperiorCanal": round(float(np.linalg.norm(gg - e["ssc_top"])), 1),
                        "gspnLength": round(seg_length(e["gspn"], 0, len(e["gspn"]) - 1), 1),
                        "gspnToCarotid": round(float(cKDTree(car).query(e["gspn"])[0].min()), 1)}
    for lm in base["landmarks"]:
        sfx = "" if lm["side"] == "M" else "_" + lm["side"].lower()
        landmarks.append({"id": SB.slug(lm["name"]).replace("sb_", "lm_", 1) + sfx, "name": lm["name"],
                          "bone": "Occipital bone" if lm["name"] in ("Foramen magnum", "Hypoglossal canal", "Jugular foramen")
                          else "Temporal bone" if lm["name"] in ("External opening of carotid canal", "Internal acoustic meatus", "Foramen lacerum")
                          else "Sphenoid bone", "part": None, "ras": np.round(lm["ras"], 2).tolist(), "side": lm["side"],
                          "boneFrom": "located on this CT", "distanceToBoneMm": 0.0, "how": lm["how"], "from": lm["from"]})
    # facial nerve segments, measured on the carried-over centre line
    seglen = {}
    for s in ("R", "L"):
        fl = ears[s]["facial"]
        line = fl["line"]
        seglen[s] = {"labyrinthine": round(seg_length(line, fl["fundus"], fl["geniculate"]), 1),
                     "tympanic": round(seg_length(line, fl["geniculate"], fl["second"]), 1),
                     "mastoid": round(seg_length(line, fl["second"], len(line) - 1), 1),
                     "secondGenuAngle": round(fl["genuAngle"])}
    GEN.mkdir(parents=True, exist_ok=True)
    manifest = {
        "space": "millimetres from the fitted hypophysial fossa, the CT turned into the Z-Anatomy model's frame (as Skull base v2)",
        "generatedBy": "pipeline/skullbase_ct.py + pipeline/skullbase_v3.py + pipeline/compress.mjs",
        "structures": items,
        "arterySystems": v2["arterySystems"],
        "dataset": {"name": dataset["name"], "licence": dataset["licence"], "url": dataset["url"],
                    "note": "The bone and the labelled vessels are one adult's CT angiogram (TopBrain case 011); the cervical carotids, "
                            "jugular veins and optic nerves are TotalSegmentator's segmentations of it. The temporal bone's contents "
                            "(facial nerve, chorda tympani, cochleovestibular nerve, perilymphatic spaces, ossicles, tympanic membrane, "
                            "petrous carotid) are a real ear's: OpenEar specimen ALPHA, registered onto each temporal bone of this CT, the "
                            "left ear mirrored. The cranial nerves are routed through this CT's foramina from the Z-Anatomy model fitted "
                            "onto it (their cisternal courses approximate). The greater petrosal nerve is drawn by rule. "
                            "The surgical view's brain is a template (the Lead-DBS MNI 2009b pial surface, GPL-3.0) fitted into "
                            "this CT, and its craniotomy is cut out of the CT's bone by rule.",
                    "attribution": [
                        "OpenEar library (Sieber D, Erfurt P, John S, et al.), specimen ALPHA: segmentations - "
                        "https://zenodo.org/records/1473724 - CC BY 4.0",
                        *[a for a in v2["dataset"]["attribution"] if "TopBrain" in a or "BodyParts3D" in a or "Z-Anatomy" in a],
                    ],
                    "citation": [CITES[c]["citation"] for c in dataset["cite"]],
                    "citationUrls": [CITES[c]["url"] for c in dataset["cite"]]},
    }
    (GEN / f"{PREFIX}-manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    (GEN / f"{PREFIX}-landmarks.json").write_text(json.dumps(landmarks, indent=1, ensure_ascii=False))
    (GEN / f"{PREFIX}-fit.json").write_text(json.dumps({"fit": fits, "crossCheck": cross, "facialSegmentsMm": seglen, "relationsMm": relations,
                                                   "nerves": base["report"], "nerveChecks": base["checks"],
                                                   "sinuses": {s_: base["sinuses"][s_]["report"] for s_ in ("R", "L")},
                                                   "carotids": {s_: base["carotids"][s_]["report"] for s_ in ("R", "L")},
                                                   **({"brain": json.loads((BUILD / "brain.json").read_text())["report"]}
                                                      if (BUILD / "brain.json").exists() else {}),
                                                   **({"pfossa": json.loads((BUILD / "pfossa.json").read_text())["report"]}
                                                      if (BUILD / "pfossa.json").exists() else {}),
                                                   **({"skull": {k: v for k, v in json.loads((BUILD / "skull.json").read_text())["report"].items()
                                                                 if k != "beyondScanShare"}}
                                                      if (BUILD / "skull.json").exists() else {})}, indent=1))
    # definitions: the Wikipedia texts Z-Anatomy ships, for the names shown
    ex = json.loads(ZEXPORT.read_text())
    if (BUILD / "pfossa.json").exists():          # the posterior fossa's (skullbase_pfossa_export.py)
        ex["texts"] = {**json.loads((BUILD / "pfossa.json").read_text())["texts"], **ex["texts"]}
    want = {it["name"] for it in items} | {lm["name"] for lm in landmarks} | {"Cochlea", "Vestibule", "Semicircular canals"}
    alias = {"Facial nerve (VII)": "Facial nerve", IAM: "Internal acoustic meatus",
             "Internal carotid artery (petrous part)": "Internal carotid artery", CAROTID: "Internal carotid artery"}
    defs = {}
    for n in sorted(want):          # (sorted: a set's order changes from run to run)
        raw = ex["texts"].get(n) or ex["texts"].get(alias.get(n, n)) or ex["texts"].get(n + ".r")
        d = SB.definition(raw)
        if d:
            defs[n] = d
    (GEN / f"{PREFIX}-definitions.json").write_text(json.dumps(defs, indent=1, ensure_ascii=False))
    print("v3:", len(items), "structures,", len(landmarks), "landmarks,", len(defs), "definitions; facial segments", seglen)


LEAD_DBS = {
    "licence": "GPL-3.0, non-commercial (the Lead-DBS template surface and the FreeSurfer labels shipped with it; FreeSurfer: "
               "research use); its fit into this CT uses the TopBrain data (non-commercial)",
    "cite": ["leaddbs3", "destrieux2010", "topbrain2025"],
}


def brain_items(items: list, ex2: dict, v2: dict) -> None:
    """The brain fitted into this CT and its surgical shapes (pipeline/skullbase_brain.py, brain.json): the lobes of both
    hemispheres, the right one with the fissure's opening, the frontal lift and the interhemispheric retraction as named
    morph targets; the middle cerebral artery's M2 and M3 segments again, with the displacement the opening and the lift
    give them as theirs; and v2's falx (the Z-Anatomy model's, fitted onto this CT) for the interhemispheric view."""
    p = BUILD / "brain.json"
    if not p.exists():
        return
    import skullbase_build as SB
    br = json.loads(p.read_text())
    rep = br["report"]
    fit, op = rep["fit"], rep["open"]
    falx = next(it for it in v2["structures"] if it["name"] == "Falx cerebri")
    items.append({**falx})
    for b in br["items"]:
        if "vessel" in b:     # the artery v2 draws, now with a morph target: same mesh, this build's file
            it = next(i for i in items if i["name"] == b["vessel"])
            it["file"] = b["file"]
            it["morph"] = True
            continue
        items.append({
            "id": b["id"], "name": b["name"], "aliases": [], "type": "soft", "file": f"assets/{KIND}/{b['id']}.glb", "bytes": 0,
            "colour": colour(b["token"]), "dataset": "template", "source": "Lead-DBS MNI 2009b template surface, fitted into this CT",
            "licence": LEAD_DBS["licence"], "citation": [SB.CITES[c]["citation"] for c in LEAD_DBS["cite"]],
            "citationUrls": [SB.CITES[c]["url"] for c in LEAD_DBS["cite"]], "refIds": [], "category": "brain", "layer": "cortex",
            "morph": True,
            "derivation": ("The template's medial wall: where its pial surface is cut at the midline, through the corpus callosum and "
                           "the diencephalon (a cut, not a surface of the brain). " if b["id"] == "br_medial_wall" else "") +
                          "A template brain, not this patient's: the Lead-DBS MNI 2009b pial surface (decimated), split into lobes by "
                          "its Desikan-Killiany labels (the insula by its Destrieux labels), fitted into this CT by a smooth "
                          f"deformation: its hull {rep['params']['tableGapMm']} mm inside the cranial cavity (median error "
                          f"{fit['tableMedianMm']} mm), this patient's arteries outside the cortex, each hemisphere on its own side of the falx, the M2 segments on the insula "
                          f"(median {fit['m2InsulaMedianMmR']} mm on the right) and the M3 segments in the Sylvian fissure (median "
                          f"{fit['m3FissureMedianMmR']} mm). Its sulci and gyri are the template's. The right hemisphere opens at the "
                          f"Sylvian fissure (the first slider): the lips moved apart {rep['params']['openFrontalMm']:.0f} mm up and "
                          f"{rep['params']['openTemporalMm']:.0f} mm down, the rest following as rigidly as possible; and its frontal lobe "
                          f"lifts off the orbital roof (the second slider: {rep['params']['liftMm']:.0f} mm along a corridor from the "
                          "anterior clinoid process forward to the frontal pole, the front of the insula with it; in the lateral supraorbital "
                          f"view {rep['params']['lsoLiftMm']:.0f} mm along that approach's corridor, out over the lateral orbital roof). In the interhemispheric "
                          f"view its medial surface is held {rep['params']['interhemisphericMm']:.0f} mm off the falx over the craniotomy's "
                          "length, the medial wall and the callosum staying. Shapes, not a simulation of the tissue.",
            "centroid": b["centroid"],
        })


ZANATOMY = {
    "licence": "Z-Anatomy CC BY-SA 4.0 (BodyParts3D CC BY-SA 2.1 Japan); its fit into this CT uses the TopBrain data (non-commercial)",
    "cite": ["mitsuhashi2009", "topbrain2025"],
}


def pfossa_items(items: list) -> None:
    """The cerebellum, brainstem and fourth ventricle fitted into this CT's posterior fossa, the tonsils drawn apart for
    the telovelar view (pipeline/skullbase_pfossa.py, pfossa.json)."""
    p = BUILD / "pfossa.json"
    if not p.exists():
        return
    import skullbase_build as SB
    pf = json.loads(p.read_text())
    rep = pf["report"]
    f, c, tv = rep["fit"], rep["clear"], rep["params"]
    for b in pf["items"]:
        items.append({
            "id": b["id"], "name": b["name"], "aliases": [], "type": "soft", "file": f"assets/{KIND}/{b['id']}.glb", "bytes": 0,
            "colour": colour(b["token"]), "dataset": "zanatomy", "fitted": True,
            "source": "Z-Anatomy model (BodyParts3D), carried onto this CT by Skull base v2's fit and fitted into its posterior fossa",
            "licence": ZANATOMY["licence"], "citation": [SB.CITES[x]["citation"] for x in ZANATOMY["cite"]],
            "citationUrls": [SB.CITES[x]["url"] for x in ZANATOMY["cite"]], "refIds": [], "category": b["category"], "layer": "cortex",
            "morph": b["morph"],
            "derivation": f"One adult's (Z-Anatomy, from BodyParts3D: {', '.join(b['parts']).lower()}), not this patient's: carried onto this CT by the "
                          "fit of the Z-Anatomy model to its bones, then fitted into its posterior fossa by a smooth deformation: the "
                          f"contents' hull {tv['tableGapMm']} mm inside the cavity behind the petrous bones (median error {f['tableMedianMm']} mm), "
                          f"this patient's basilar, vertebral, superior and posterior inferior cerebellar arteries outside them ({round(f['before']['vesselInsideShare'] * 100)} % "
                          f"of their centre-line points inside before, {round(f['vesselInsideShare'] * 100)} % after), the tentorium above; then the "
                          f"{c['inVesselBefore']} vertices still in an artery's way and the {c['inBoneBefore']} in bone's pushed clear."
                          + (f" The telovelar slider draws the tonsils {tv['tvMm']:.0f} mm apart (laterally, a little up) and lifts the nodule "
                             f"and uvula {tv['tvVermisMm']:.0f} mm up and back, the rest of the cerebellum following; a shape, not a simulation "
                             "of the tissue." if b["morph"] else ""),
            "centroid": b["centroid"],
        })


def bone_nodes(sides: dict) -> tuple[list, dict]:
    """A bone's GLB nodes from its meshes by side ('M': one midline mesh, cut at x = 0 into L and R), with the baked
    shading as vertex colours; and its centroid by side."""
    import skullbase_build as SB
    from meshcheck import orient_outward
    parts = {}
    for side, (v, t, ao) in sides.items():
        t = orient_outward(v, t)
        parts.update(SB.mesh_split(v, t, ao) if side == "M" else {side: (v, t, ao)})
    nodes, cent = [], {}
    for side, (v, t, ao) in sorted(parts.items()):
        nodes.append({"name": side, "positions": v, "normals": SB.normals(v, t), "indices": t, "mode": TRIANGLES,
                      "colors": np.repeat((SB.AO_FLOOR + (1 - SB.AO_FLOOR) * ao)[:, None], 3, axis=1)})
        cent[side] = v.mean(0).round(2).tolist()
    return nodes, cent


def skull_bones() -> dict | None:
    """v3's skull (pipeline/skullbase_v3_skull.py, skull.json): {Z-Anatomy bone name: (verts, tris, ao)}, or None."""
    p = BUILD / "skull.json"
    if not p.exists():
        return None
    return {n: (np.array(b["verts"], float), np.array(b["tris"], int), np.array(b["ao"], float))
            for n, b in json.loads(p.read_text())["bones"].items()}


def skull_items(items: list, v2: dict) -> bool:
    """v3's own skull: every bone of the Z-Anatomy model, the CT's bone where the scan reaches and the fitted model beyond
    it (pipeline/skullbase_v3_skull.py); False if it has not been built (v2's bones are used)."""
    bones = skull_bones()
    if bones is None:
        return False
    import skullbase_build as SB
    rep = json.loads((BUILD / "skull.json").read_text())["report"]
    v2b = {it["name"]: it for it in v2["structures"] if it["type"] == "bone"}
    tmpl = next(iter(v2b.values()))
    by_base: dict[str, dict] = {}
    beyond: dict[str, float] = {}
    for n, mesh in bones.items():
        base, side = SB.split_pair(n)
        by_base.setdefault(base, {})[side or "M"] = mesh
        beyond[base] = max(beyond.get(base, 0.0), rep["beyondScanShare"][n])
    for base, sides in sorted(by_base.items()):
        nodes, cent = bone_nodes(sides)
        sid = SB.slug(base)
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        src = v2b.get(base, tmpl)
        share = round(beyond[base] * 100)
        face = base in rep.get("faceBones", [])
        where = (f"The face is the Z-Anatomy model fitted onto this CT throughout (another person's anatomy, not this patient's): "
                 "this CT resolves the thin facial bones only in pieces. The model's face was fitted again on its own onto the "
                 f"CT's facial bone (median distance {rep['face']['medianBeforeMm']} mm before, {rep['face']['medianAfterMm']} mm "
                 f"after) and blended into the CT's cranium across the sutures over {rep['seamMm']} mm. " if face else
                 "All of it lies within the scan. " if share == 0 else
                 f"Beyond the scan's edge, and on the skull's outer surface where v2 drew walls around enclosed air by rule (about "
                 f"{share} % of its surface in all), it is the Z-Anatomy model itself, fitted onto this CT "
                 f"and fitted again onto the CT's bone within {rep['edgeFitMm']:.0f} mm of the edge (median distance "
                 f"{rep['edge']['medianBeforeMm']} mm before, {rep['edge']['medianAfterMm']} mm after), the CT giving way to it "
                 f"over the last {rep['blendMm']:.0f} mm inside the edge, so the two make one surface (a fitted model, another "
                 "person's anatomy, not this patient's). ")
        items.append({**{k: src[k] for k in ("colour", "dataset", "source", "licence", "citation", "citationUrls")},
                      "aliases": src["aliases"] if base in v2b else [], "id": sid, "name": base, "type": "bone",
                      "file": f"assets/{KIND}/{sid}.glb", "bytes": 0, "refIds": [], "category": "bone",
                      "derivation": ("Cut at the midline (x = 0) into left and right halves. " if "M" in sides else "")
                                    + ("" if face else "The CT angiogram's bone surface where the scan reaches (as in Skull base v2: "
                                       "400 HU, thin bone down to 170 HU next to it and the walls of the air sinuses, outside the labelled "
                                       "vessels; holes in the thin orbital roofs closed by rule), the part nearest this bone of the "
                                       "Z-Anatomy model fitted onto it. ") + where + "Shading darkened where neighbouring bone encloses it.",
                      "centroid": {"L": cent.get("L", cent.get("R")), "R": cent.get("R", cent.get("L"))}})
    return True


def approach_items(items: list, ex2: dict) -> None:
    """The right pterional craniotomy (pipeline/skullbase_v3_approach.py, approach.json): each bone it cuts again, with
    the cut (it replaces the whole bone in the transsylvian view), and the bone removed as one mesh."""
    p = BUILD / "approach.json"
    if not p.exists():
        return
    import skullbase_build as SB
    from meshcheck import orient_outward
    aps = json.loads(p.read_text())
    whole: dict[str, dict] = {}
    own = skull_bones()
    for n, mesh in (own.items() if own is not None else
                    ((n, (np.array(b["verts"], float), np.array(b["tris"], int), np.array(b["ao"], float))) for n, b in ex2["bones"].items())):
        base, side = SB.split_pair(n)
        whole.setdefault(base, {})[side or "M"] = mesh
    cut_of = {it["id"]: it for it in items}
    summary = {}
    for aid, ap in aps.items():
        ids = []
        by_base: dict[str, dict] = {}
        for n, b in ap["bones"].items():
            base, side = SB.split_pair(n)
            by_base.setdefault(base, {})[side or "M"] = (np.array(b["verts"], float), np.array(b["tris"], int), np.array(b["ao"], float))
        for base, cut_sides in sorted(by_base.items()):
            sides = dict(whole[base])
            sides.update(cut_sides)
            nodes, cent = bone_nodes(sides)
            sid = f"sb_appr_{aid}__{SB.slug(base)[3:]}"
            write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
            src = cut_of[SB.slug(base)]
            items.append({**{k: src[k] for k in ("aliases", "colour", "dataset", "source", "licence", "citation", "citationUrls")},
                          "id": sid, "name": base, "type": "bone", "file": f"assets/{KIND}/{sid}.glb", "bytes": 0, "refIds": [],
                          "category": "bone", "approach": aid, "replaces": SB.slug(base),
                          "derivation": f"The CT's {base.lower()} with the bone of the {ap['name'].lower()} removed "
                                        "(pipeline/skullbase_v3_approach.py).",
                          "centroid": {"L": cent.get("L", cent.get("R")), "R": cent.get("R", cent.get("L"))}})
            ids.append(sid)
        v, t = np.array(ap["removed"]["verts"], float), np.array(ap["removed"]["tris"], int)
        t = orient_outward(v, t)
        sid = f"sb_appr_{aid}__removed"
        write_glb(BUILD / f"{sid}.glb", [{"name": "R", "positions": v, "normals": SB.normals(v, t), "indices": t, "mode": TRIANGLES}], {"id": sid})
        c = v.mean(0).round(2).tolist()
        items.append({"id": sid, "name": "Bone removed", "aliases": [], "type": "soft", "file": f"assets/{KIND}/{sid}.glb", "bytes": 0,
                      "colour": colour("sbRemoved"), "dataset": "rule", "source": "Cut out of the CT's bone by rule",
                      "licence": DATASET_V2_LICENCE, "citation": [], "citationUrls": [], "refIds": [], "category": "removed",
                      "approach": aid, "layer": "nuclei",
                      "derivation": f"The bone the {ap['name'].lower()} removes: {ap['removedMl']} ml. {ap['how']}", "centroid": {"L": c, "R": c}})
        summary[aid] = {"name": ap["name"], "side": ap["side"], "how": ap["how"], "removedMl": ap["removedMl"], "bones": ids,
                        "removed": sid, "burrHoles": ap["burrHoles"]}
    (GEN / f"{PREFIX}-approaches.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False))


def finalize() -> int:
    """After compress.mjs: file sizes, stale files, the manifest next to the assets, and checks."""
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
    m = json.loads((GEN / f"{PREFIX}-manifest.json").read_text())
    fit = json.loads((GEN / f"{PREFIX}-fit.json").read_text())
    lms = json.loads((GEN / f"{PREFIX}-landmarks.json").read_text())
    fails, n = [], 0

    def check(ok, msg):
        nonlocal n
        n += 1
        if not ok:
            fails.append(msg)
    for s, f in fit["fit"].items():
        check(f["correlation"] >= MIN_CORRELATION, f"{s}: correlation {f['correlation']}")
        check(SCALE_RANGE[0] < f["scale"] < SCALE_RANGE[1], f"{s}: scale {f['scale']}")
        check(f["mirrored"] == (s == "L"), f"{s}: mirrored {f['mirrored']} (specimen {SPECIMEN} is a right ear)")
        hu = f["checksHU"]
        check(hu.get(IAM, 999) < 250, f"{s}: canal contents at {hu.get(IAM)} HU (the canal's fluid)")
        check(150 < hu.get("Internal carotid artery (petrous part)", 0) < 600, f"{s}: carotid at {hu.get('Internal carotid artery (petrous part)')} HU (the enhanced lumen)")
    for s, seg in fit["facialSegmentsMm"].items():
        check(2 <= seg["labyrinthine"] <= 8, f"{s}: labyrinthine segment {seg['labyrinthine']} mm")
        check(6 <= seg["tympanic"] <= 16, f"{s}: tympanic segment {seg['tympanic']} mm")
    aps = json.loads((GEN / f"{PREFIX}-approaches.json").read_text())
    for it in m["structures"]:
        check((REPO / "public" / it["file"]).exists(), f"missing {it['file']}")
        if it["file"].startswith(f"assets/{KIND}/"):
            c = it["centroid"]
            if it.get("category") == "removed" and aps[it["approach"]]["side"] == "M":     # a midline craniotomy
                check(abs(c["R"][0]) < 5, f"{it['id']}: not on the midline {c}")
            elif it.get("category") == "removed":     # one side only: the craniotomy is on the right
                check(c["R"][0] > 0, f"{it['id']}: not on the right {c}")
            else:
                check(c["L"][0] < 0 < c["R"][0], f"{it['id']}: sides {c}")
    for nerve, sides in fit["nerves"].items():
        for s, r in sides.items():
            check(r["boneCrossedMm"] <= 2.0, f"{nerve} {s}: crosses {r['boneCrossedMm']} mm of bone")
            check(r["maxFromFittedMm"] <= 8.0, f"{nerve} {s}: {r['maxFromFittedMm']} mm from its fitted course")
    ck = fit["nerveChecks"]
    systems = {"Middle meningeal artery": "Middle meningeal artery", "Proximal lateral striate branches": "Middle cerebral artery",
               "Medial pontine branches of basilar artery": "Basilar artery", "Anterior spinal artery": "Vertebral artery",
               "Anterior ethmoidal artery": "Ethmoidal arteries"}
    for it in m["structures"]:
        if it["name"] in systems:
            check(it.get("system") == systems[it["name"]], f"{it['name']}: listed under {it.get('system')}")
    for s in ("R", "L"):
        check(ck["mandibularNerveToOvaleHoleMm"][s] is not None and ck["mandibularNerveToOvaleHoleMm"][s] <= 2.5,
              f"{s}: foramen ovale {ck['mandibularNerveToOvaleHoleMm'][s]} mm from the floor's hole")
        check(ck["opticNerveToSegmentationMm"][s] <= 2.0, f"{s}: optic nerve {ck['opticNerveToSegmentationMm'][s]} mm from TotalSegmentator's")
        check(all(v <= 7.0 for v in ck["jugularNervesToBulbMm"][s].values()), f"{s}: jugular foramen nerves {ck['jugularNervesToBulbMm'][s]}")
    for s, r in fit["carotids"].items():
        check(r["inLumenShare"] >= 0.9, f"{s}: carotid trace {r['inLumenShare']} in the lumen")
        check(r["medianFromSpecimenMm"] <= 3.5, f"{s}: carotid trace {r['medianFromSpecimenMm']} mm from the specimen's")
        check(1.5 <= r["medianRadiusMm"] <= 4, f"{s}: carotid radius {r['medianRadiusMm']}")
    for s, r in fit["sinuses"].items():
        check(r["inLumenShare"] >= 0.8, f"{s}: sinus trace {r['inLumenShare']} in the lumen")
        check(r["boneCrossedMm"] <= 1.0, f"{s}: sinus trace crosses {r['boneCrossedMm']} mm of bone")
        check(1.5 <= r["medianRadiusMm"] <= 6, f"{s}: sinus radius {r['medianRadiusMm']}")
    names = {lm["name"] for lm in lms}
    for need in ("Geniculate ganglion", "Fundus of internal acoustic meatus", "Second genu of facial nerve", "Oval window", OVER_SSC,
                 "Optic canal", "Superior orbital fissure", "Foramen rotundum", "Foramen ovale", "Foramen spinosum", "Hypoglossal canal",
                 "Jugular foramen", "Foramen magnum", "Foramen lacerum", "Internal acoustic meatus", "External opening of carotid canal"):
        check(need in names, f"landmark {need} missing")
    # the surgical view: the craniotomy's cut bones stand in for whole ones; the brain fitted, cleared and opened
    ids = {it["id"]: it for it in m["structures"]}
    check({"pterional", "lso", "interhemispheric", "suboccipital"} <= set(aps), f"craniotomies: {sorted(aps)}")
    for aid, ap in aps.items():
        check((2 if aid == "suboccipital" else 4) <= ap["removedMl"] <= 30, f"{aid}: removes {ap['removedMl']} ml")   # the squama is thin below the inion
        check(ap["removed"] in ids and all(b in ids for b in ap["bones"]), f"{aid}: structures missing")
        for b in ap["bones"]:
            check(ids.get(ids[b].get("replaces", ""), {}).get("type") == "bone", f"{aid}: {b} replaces no bone")
    brain = [it for it in m["structures"] if it.get("category") == "brain"]
    check(len(brain) == 7 and all(it.get("morph") for it in brain), f"{len(brain)} brain pieces, all with the surgical shapes as morph targets")
    check(any(it["name"] == "Falx cerebri" for it in m["structures"]), "the falx is missing")
    check(sum(1 for it in m["structures"] if it.get("category") == "artery" and it.get("morph")) == 2, "M2 and M3 carry the opening")
    b = fit.get("brain")
    check(b is not None, "the brain's report is missing")
    if b:
        f_ = b["fit"]
        check(f_["tableMedianMm"] <= 1.5, f"brain hull {f_['tableMedianMm']} mm from its place in the cavity")
        check(f_["m2InsulaMedianMmR"] <= 2.0 and f_["m3FissureMedianMmR"] <= 2.0, f"right M2 / M3 {f_['m2InsulaMedianMmR']} / {f_['m3FissureMedianMmR']} mm off the insula / fissure")
        check(f_["m2InCortexShareR"] <= 0.1 and f_["m3InCortexShareR"] <= 0.1, "right M2 / M3 inside the cortex")
        check(f_["minRelativeVolume"] > 0, f"the deformation folds (relative volume {f_['minRelativeVolume']})")
        for s in ("R", "L"):
            check(b["clear"][s]["inBoneWayAfter"] == 0 and b["clear"][s]["inVesselAfter"] == 0, f"{s}: brain still in bone's way or in a vessel")
            check(b["clear"][s]["acrossFalxAfter"] == 0, f"{s}: {b['clear'][s]['acrossFalxAfter']} vertices across the falx")
        o = b["open"]
        check(min(b["params"]["openFrontalMm"], b["params"]["openTemporalMm"]) - 0.5 <= o["maxMovedMm"] <= max(b["params"]["openFrontalMm"], b["params"]["openTemporalMm"]) + 2,
              f"opening moves the brain up to {o['maxMovedMm']} mm")
        lf = b["lift"]
        check(b["params"]["liftMm"] - 0.5 <= lf["maxMovedMm"] <= b["params"]["liftMm"] + 2, f"the lift moves the brain up to {lf['maxMovedMm']} mm")
        check(lf["orbitalHandles"] > 100 and lf["insulaHandles"] > 100, f"the lift holds {lf['orbitalHandles']} orbital, {lf['insulaHandles']} insular vertices")
        ll = b["lsoLift"]
        check(b["params"]["lsoLiftMm"] - 0.5 <= ll["maxMovedMm"] <= b["params"]["lsoLiftMm"] + 2, f"the LSO lift moves the brain up to {ll['maxMovedMm']} mm")
        check(ll["orbitalHandles"] > 100, f"the LSO lift holds {ll['orbitalHandles']} orbital vertices")
        check(ll["crossedTriangles"] <= b["crossedTriangles"]["R"]["fitted"] + 800,
              f"the LSO lift crosses {ll['crossedTriangles']} triangles (fitted: {b['crossedTriangles']['R']['fitted']})")
        ih = b["interhemispheric"]
        check(b["params"]["interhemisphericMm"] - 0.5 <= ih["maxMovedMm"] <= b["params"]["interhemisphericMm"] + 2,
              f"the interhemispheric retraction moves the brain up to {ih['maxMovedMm']} mm")
        check(ih["fullyMoved"] > 300 and ih["outsideCavityAfter"] == 0, f"the retraction moves {ih['fullyMoved']} vertices fully, "
              f"{ih['outsideCavityAfter']} left outside the cavity")
        check(ih["crossedTriangles"] <= b["crossedTriangles"]["R"]["fitted"] + 20,
              f"the retraction crosses {ih['crossedTriangles']} triangles (fitted: {b['crossedTriangles']['R']['fitted']})")
        check("third" in b["aca"]["a3"] and b["aca"]["thirdA2ToAcomMm"] is not None, f"anterior cerebral arteries {b['aca']}")
        for name, mv in b["vesselsMovedMaxMm"].items():
            check(mv["L"]["open"] == 0 and mv["L"]["lift"] == 0 and mv["L"]["lsoLift"] == 0, f"{name}: the left side moves {mv['L']}")
            check(0.5 < mv["R"]["open"] <= b["params"]["openFrontalMm"] + 1, f"{name}: the opening moves it {mv['R']['open']} mm")
            check(mv["R"]["lift"] <= b["params"]["liftMm"] + 1, f"{name}: the lift moves it {mv['R']['lift']} mm")
            check(mv["R"]["lsoLift"] <= b["params"]["lsoLiftMm"] + 1, f"{name}: the LSO lift moves it {mv['R']['lsoLift']} mm")
    # the telovelar view: the cerebellum, brainstem and fourth ventricle fitted into the posterior fossa, the tonsils drawn apart
    pf = [it for it in m["structures"] if it.get("category") in ("hindbrain", "ventricle")]
    check(len(pf) == 8 and {it["name"] for it in pf if it.get("morph")} == {"Cerebellar hemisphere", "Tonsil of cerebellum", "Vermis"},
          f"{len(pf)} posterior fossa pieces")
    pr = fit.get("pfossa")
    check(pr is not None, "the posterior fossa's report is missing")
    if pr:
        f_, c_, t_ = pr["fit"], pr["clear"], pr["telovelar"]
        check(f_["tableMedianMm"] <= 1.5 and f_["vesselInsideShare"] <= 0.1 and f_["minRelativeVolume"] > 0,
              f"posterior fossa fit: table {f_['tableMedianMm']} mm, vessels inside {f_['vesselInsideShare']}, volume {f_['minRelativeVolume']}")
        check(c_["inBoneAfter"] == 0 and c_["inVesselAfter"] <= 20, f"posterior fossa clearance {c_}")
        tp_ = pr["params"]
        check(tp_["tvMm"] - 0.5 <= t_["maxMovedMm"] <= tp_["tvMm"] + tp_["tvVermisMm"] + 1.5 and t_["inBoneAfter"] == 0 and t_["inVesselAfter"] == 0,
              f"telovelar shape {t_}")
        check(t_["tonsilToMedullaMm"]["moved"] > t_["tonsilToMedullaMm"]["rest"], f"the tonsils do not part from the medulla {t_}")
        check(tp_["tvVermisMm"] - 0.5 <= t_["vermisLiftMm"] <= tp_["tvVermisMm"] + 1.5 and t_["uvulaToMedullaMm"]["moved"] > t_["uvulaToMedullaMm"]["rest"],
              f"the vermis lift {t_}")
        check(t_["inVentricle"]["moved"] <= t_["inVentricle"]["rest"], f"the lift carries the cerebellum into the fourth ventricle {t_['inVentricle']}")
    print(f"skull base v3 validation: {n - len(fails)}/{n} checks passed")
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["finalize"]:
        sys.exit(finalize())
    sys.exit(main())
