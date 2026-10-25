"""Ventricles section: this CT's lateral ventricles and a virtual frontal ventriculostomy from Kocher's point, along the
freehand trajectories Chen 2025 compared. In Skull base v2's frame (millimetres from the fitted hypophysial fossa), on
its bone.

  pipeline/.venv/bin/python -I -W ignore pipeline/ventricles_build.py          (after skullbase_ct.py, skullbase_v3.py)
  node pipeline/compress.mjs ventricles
  pipeline/.venv/bin/python -I -W ignore pipeline/ventricles_build.py finalize

The CT is Skull base v2's (TopBrain 2025 case 011, a CT angiogram). What comes from where:
  - The lateral ventricles: this CT's own. In its brain window the ventricular fluid is darker than the brain around
    it (about 5 to 20 HU where the ventricles are a few millimetres wide, once smoothed by SMOOTH_MM, against about
    44 HU for the deep white matter). The fluid below CSF_HU, at least DEPTH_MM inside the cranial cavity (the
    subarachnoid spaces against the inner table left out) and away from the labelled vessels, is taken; the
    ventricles are the largest such body. Its surface is drawn at CSF_HU, split into left and right at the falx's
    plane. The threshold sets the size of narrow ventricles, so the surface is approximate to about a millimetre.
  - The coronal suture, on the outer table: between the CT's frontal and parietal bone (named after the Z-Anatomy model
    fitted onto it, Skull base v2; the two names overlap there by about a centimetre, so the suture is taken midway).
  - Kocher's point: KOCHER_ANTERIOR_MM in front of the suture, along the outer table, and KOCHER lateral to the midline
    (Chen 2025: 25 mm; Park 2020: 30 mm).
  - The external acoustic meatus: the ear canal is the shortest way through air from the tympanic membrane (OpenEar's,
    registered into each temporal bone in Skull base v3) to outside the head; the meatus is where it leaves the bone.
  - The medial canthi: this CT stops at the forehead, so they are placed CANTHUS_MM to each side of the midline (half
    the mean intercanthal distance of Chen 2025's 206 CTs). Only their distance from the midline is used: Chen
    projects them onto the line between the two external acoustic meatus.
  - The trajectories (Chen 2025): from Kocher's point towards the point on the line between the external acoustic
    meatus level with the ipsilateral medial canthus (IMC), the midpoint between the meatus (MAM), the contralateral
    medial canthus (CMC), or perpendicular to the skull (P). Each is followed into the brain to the first ventricle it
    meets: the depth from the outer table, which side, and its course through the ventricle.

Writes pipeline/data/build/ventricles/*.glb (compress.mjs -> public/assets/ventricles/) and
src/data/generated/ve-{manifest,landmarks,trajectories}.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage.graph import MCP_Geometric

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_ct as K  # noqa: E402
import skullbase_v3_approach as A  # noqa: E402
from build import isosurface  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402

REPO = ROOT.parent
KIND = "ventricles"
PREFIX = "ve"
BUILD = ROOT / "data" / "build" / KIND
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
V3_BUILD = ROOT / "data" / "build" / "skullbase-v3"
GEN = REPO / "src" / "data" / "generated"
PUBLIC = REPO / "public" / "assets"
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())
CITES = json.loads((ROOT / "sources" / "citations.json").read_text())

GRID_LO, GRID_HI, STEP = np.array([-60.0, -95.0, -15.0]), np.array([60.0, 60.0, 85.0]), 0.5   # the cerebrum (frame mm)
SMOOTH_MM = 1.0
CSF_HU = 27.0              # between the ventricular fluid (about 5-20 HU, smoothed) and the deep white matter (about 44 HU)
DEPTH_MM = 10.0            # at least this far inside the cranial cavity
VESSEL_GAP_MM = 1.0        # and this far from the labelled vessels (the choroid plexus and veins enhance)
KOCHER = {"chen": 25.0, "park": 30.0}    # Kocher's point: this far lateral to the midline (Chen 2025; Park 2020) ...
KOCHER_ANTERIOR_MM = 10.0  # ... and this far in front of the coronal suture (both)
AP_OFFSETS = [-10.0, 0.0, 10.0]          # the entry moved this far forward (+) or back from Kocher's point (teaching)
CANTHUS_MM = 32.7 / 2      # half Chen 2025's mean intercanthal distance (206 CTs): this CT has no face
TARGETS = ["IMC", "MAM", "CMC", "P"]
THIRD_ML = (0.1, 3.0)      # the third ventricle's body of fluid: this large ...
THIRD_HALF_MM = 5.0        # ... and within this of the midline
FRONTAL_MM = 25.0          # the frontal horns: the ventricles' front this far
MAX_DEPTH_MM = 110.0
RAY_STEP_MM = 0.25
BONE_LEVEL = 0.4           # the bone the model draws (skullbase_nerves.SURFACE_LEVEL)


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


def unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


# ---------------------------------------------------------------- the CT on a grid of the frame
class Grid:
    """The CT resampled onto a STEP grid of the frame over the cerebrum: smoothed HU, depth inside the cranial cavity,
    the labelled vessels."""

    def __init__(self):
        ct, aff = K.load_ct()
        f = np.load(CT_BUILD / "frame.npz")
        self.R, self.fossa = f["R"], f["fossa"]
        self.ax = [np.arange(GRID_LO[k], GRID_HI[k] + 1e-6, STEP) for k in range(3)]
        self.shape = tuple(len(a) for a in self.ax)
        G = np.stack(np.meshgrid(*self.ax, indexing="ij"), -1).reshape(-1, 3)
        q = nib.affines.apply_affine(np.linalg.inv(aff), G @ self.R.T + self.fossa).T
        self.hu = ndimage.gaussian_filter(ndimage.map_coordinates(ct, q, order=1, cval=-1000).reshape(self.shape), SMOOTH_MM / STEP)
        lab = np.asanyarray(nib.load(K.LABELS).dataobj)
        self.vessel = ndimage.map_coordinates((lab > 0).astype(np.float32), q, order=1).reshape(self.shape) > 0.3
        del q, ct, lab
        c = np.load(CT_BUILD / "bone.npz")
        b, a = c["b"].astype(np.float32), c["a"]
        af = a.copy()
        af[:3, :3] = self.R.T @ a[:3, :3]
        af[:3, 3] = (a[:3, 3] - self.fossa) @ self.R
        cav = K.cavity(b, af)
        qc = np.rint(nib.affines.apply_affine(np.linalg.inv(af), G)).astype(int)
        ok = np.all((qc >= 0) & (qc < np.array(cav.shape)), 1)
        inside = np.zeros(len(G), bool)
        inside[ok] = cav[tuple(qc[ok].T)]
        self.depth = ndimage.distance_transform_edt(inside.reshape(self.shape)) * STEP
        self.aff = np.diag([STEP, STEP, STEP, 1.0])
        self.aff[:3, 3] = GRID_LO

    def ijk(self, P: np.ndarray) -> np.ndarray:
        return np.rint((np.atleast_2d(P) - GRID_LO) / STEP).astype(int)


def ventricles(g: Grid, midline: float) -> tuple[np.ndarray, np.ndarray | None, dict]:
    """The lateral ventricles' mask: the largest body of fluid below CSF_HU deep in the cavity, away from the vessels;
    and the third ventricle's: the body of that fluid on the midline (within THIRD_HALF_MM) below and between them,
    when there is one (in a narrow third ventricle the CT shows it only in part)."""
    vgap = max(1, int(round(VESSEL_GAP_MM / STEP)))
    csf = (g.hu < CSF_HU) & (g.hu > -200) & (g.depth > DEPTH_MM) & ~ndimage.binary_dilation(g.vessel, iterations=vgap)
    lab, n = ndimage.label(csf)
    sizes = np.bincount(lab.ravel())
    sizes[0] = 0
    m = lab == int(np.argmax(sizes))
    P = GRID_LO + np.argwhere(m) * STEP
    right = P[:, 0] > midline
    third, best = None, 0
    com = ndimage.center_of_mass(csf, lab, index=np.arange(1, n + 1))
    for i, c in enumerate(com, start=1):
        c = GRID_LO + np.array(c) * STEP
        ml = sizes[i] * STEP ** 3 / 1000
        if i == int(np.argmax(sizes)) or not THIRD_ML[0] <= ml <= THIRD_ML[1]:
            continue
        Q = GRID_LO + np.argwhere(lab == i) * STEP
        on_mid = np.abs(Q[:, 0] - midline).max() <= THIRD_HALF_MM
        between = P[:, 1].min() < c[1] < P[:, 1].max() and c[2] < P[:, 2].mean()
        if on_mid and between and sizes[i] > best:
            third, best = lab == i, sizes[i]
    rep = {"volumeMl": {"R": round(float(right.sum() * STEP ** 3 / 1000), 2), "L": round(float((~right).sum() * STEP ** 3 / 1000), 2),
                        "third": round(float(best * STEP ** 3 / 1000), 2)},
           "extentMm": {"lo": P.min(0).round(1).tolist(), "hi": P.max(0).round(1).tolist()}}
    return m, third, rep


def frontal_horns(mask: np.ndarray, g: Grid) -> dict:
    """The frontal horns' greatest width across both (their lateral walls, on an axial slice through their front
    FRONTAL_MM), and the cranial cavity's greatest inner width on that slice: Evans' index, their ratio."""
    P = GRID_LO + np.argwhere(mask) * STEP
    front = P[P[:, 1] > P[:, 1].max() - FRONTAL_MM]
    best = (0.0, None)
    for z in np.unique(front[:, 2]):
        q = front[front[:, 2] == z]
        w = q[:, 0].max() - q[:, 0].min()
        if w > best[0]:
            best = (float(w), float(z))
    w, z = best
    k = int(round((z - GRID_LO[2]) / STEP))
    inside = g.depth[:, :, k] > 0
    xs = GRID_LO[0] + np.argwhere(inside.any(1))[:, 0] * STEP
    inner = float(xs.max() - xs.min())
    return {"widthMm": round(w + STEP, 1), "atZ": round(z, 1), "innerSkullMm": round(inner, 1), "evansIndex": round((w + STEP) / inner, 3)}


def ventricle_mesh(g: Grid, mask: np.ndarray, side: str, midline: float) -> trimesh.Trimesh:
    """Its surface drawn at CSF_HU (sub-voxel), on one side of the midline."""
    x = GRID_LO[0] + np.arange(g.shape[0]) * STEP
    half = (x > midline) if side == "R" else (x <= midline)
    region = ndimage.binary_dilation(mask & half[:, None, None], iterations=2) & half[:, None, None]
    # positive in the fluid, negative in the brain and outside the region (and isosurface's zero padding stays outside:
    # the level is a hair above zero, 0.5 HU)
    field = np.where(region, CSF_HU - g.hu, -100.0).astype(np.float32)
    return isosurface(field, g.aff, 0.5, 0.0, 30000)


# ---------------------------------------------------------------- the skull: suture, Kocher's point, ear canals
def suture_point(S: A.Skull, x0: float) -> np.ndarray:
    """The coronal suture on the outer table at x = x0: midway between the rearmost frontal and the foremost parietal
    surface there (the two names overlap by about a centimetre)."""
    F = np.array(S.ex["bones"]["Frontal bone"]["verts"], float)
    side = "Parietal bone.r" if x0 > 0 else "Parietal bone.l"
    P = np.array(S.ex["bones"][side]["verts"], float)
    top = F[:, 2].max()
    f = F[(np.abs(F[:, 0] - x0) < 2) & (F[:, 2] > top - 35)]
    p = P[(np.abs(P[:, 0] - x0) < 2) & (P[:, 2] > top - 35)]
    y = 0.5 * (f[:, 1].min() + p[:, 1].max())
    z = max(f[f[:, 1] < f[:, 1].min() + 5, 2].max(), p[p[:, 1] > p[:, 1].max() - 5, 2].max())
    return S.surface(np.array([x0, y, z]), np.array([0.0, 0.0, 1.0]))


def along_surface(S: A.Skull, p: np.ndarray, direction: np.ndarray, mm: float) -> np.ndarray:
    """A point mm along the outer table from p, heading in direction (projected onto the surface), backwards when
    mm < 0."""
    sgn = 1.0 if mm >= 0 else -1.0
    left, cur = abs(mm), p.copy()
    while left > 1e-6:
        n = S.outward(cur)
        t = direction - (direction @ n) * n
        t = unit(t) * sgn
        stepmm = min(0.5, left)
        nxt = S.surface(cur + stepmm * t, S.outward(cur + stepmm * t), reach=10.0)
        left -= float(np.linalg.norm(nxt - cur))
        cur = nxt
    return cur


def skull_normal(S: A.Skull, p: np.ndarray) -> np.ndarray:
    """The outer table's outward normal at p: from the bone's smoothed gradient."""
    ijk = nib.affines.apply_affine(S.inv, p)
    lo = np.floor(ijk).astype(int) - 12
    sub = S.b[tuple(slice(max(l_, 0), l_ + 25) for l_ in lo)].astype(np.float32)
    gr = np.gradient(ndimage.gaussian_filter(sub, 4.0))
    c = np.clip(np.rint(ijk - np.maximum(lo, 0)).astype(int), 0, np.array(sub.shape) - 1)
    gv = np.array([gr[k][tuple(c)] for k in range(3)])
    n = -(S.a[:3, :3] @ gv)          # towards less bone: outwards from the skull's outer surface
    n = unit(n)
    return n if n @ (p - S.centre) > 0 else -n


def ear_canal(S: A.Skull, side: str) -> tuple[np.ndarray, list]:
    """The external acoustic meatus: along the shortest way through air from the tympanic membrane (OpenEar's, Skull
    base v3) out of the head, the last point with bone around it. Returns it and the canal's course."""
    from winding_check import read_nodes
    tm = next(P for name, P, _, _ in read_nodes(V3_BUILD / "tb_tympanic_membrane.glb") if name == side).mean(0)
    ct, aff = K.load_ct()
    sg = 1.0 if side == "R" else -1.0
    xs = np.arange(30, 85, STEP) * sg
    ys = np.arange(tm[1] - 30, tm[1] + 30, STEP)
    zs = np.arange(tm[2] - 30, tm[2] + 30, STEP)
    G = np.stack(np.meshgrid(xs, ys, zs, indexing="ij"), -1)
    f = np.load(CT_BUILD / "frame.npz")
    q = nib.affines.apply_affine(np.linalg.inv(aff), G.reshape(-1, 3) @ f["R"].T + f["fossa"]).T
    v = ndimage.map_coordinates(ct, q, order=1, cval=-1000).reshape(G.shape[:3])
    air = v < -300
    idx = np.argwhere(air)
    starts = idx[np.linalg.norm(G[tuple(idx.T)] - tm, axis=1) < 4]
    ends = np.argwhere(air[-1])
    ends = np.c_[np.full(len(ends), air.shape[0] - 1), ends]
    mcp = MCP_Geometric(np.where(air, 1.0, np.inf))
    cum, _ = mcp.find_costs([tuple(x) for x in starts], [tuple(x) for x in ends[::7]], find_all_ends=False)
    e = ends[int(np.argmin(cum[tuple(ends.T)]))]
    path = np.array(mcp.traceback(tuple(e)))
    P = G[tuple(path.T)]                                           # from the tympanic membrane outwards
    bd = ndimage.distance_transform_edt(~(v > 300)) * STEP
    bony = np.nonzero(bd[tuple(path.T)] < 3.0)[0]
    meatus = P[bony.max()]
    return meatus, P[:: max(1, len(P) // 24)].round(2).tolist()


# ---------------------------------------------------------------- the trajectories
def trajectory(entry: np.ndarray, d: np.ndarray, vent: dict[str, np.ndarray], g: Grid, bone_at) -> dict:
    """Follow the line from the entry on the outer table: the bone crossed, then the first ventricle met (its side, the
    depth from the outer table, the length inside it), or, if none, how close it passes to the nearest."""
    ts = np.arange(0, MAX_DEPTH_MM, RAY_STEP_MM)
    P = entry + ts[:, None] * d
    ijk = g.ijk(P)
    ok = np.all((ijk >= 0) & (ijk < np.array(g.shape)), 1)
    hit = {}
    for s, m in vent.items():
        h_ = np.zeros(len(P), bool)
        h_[ok] = m[tuple(ijk[ok].T)]
        hit[s] = h_
    bone = bone_at(P)
    inner = int(np.argmax(~bone & (ts > 1.0))) if (~bone).any() else 0      # leaves the bone: the inner table
    first = {s: (int(np.argmax(h_)) if h_.any() else None) for s, h_ in hit.items()}
    met = [s for s in first if first[s] is not None]
    out = {"boneMm": round(float(ts[inner]), 1)}
    if not met:
        dist = {s: float(cKDTree(GRID_LO + np.argwhere(m) * STEP).query(P[ts < 80])[0].min()) for s, m in vent.items()}
        s = min(dist, key=dist.get)
        return {**out, "ventricle": None, "nearestSide": s, "missMm": round(dist[s], 1)}
    s = min(met, key=lambda k: first[k])
    i0 = first[s]
    i1 = i0 + int(np.argmax(~hit[s][i0:])) if (~hit[s][i0:]).any() else len(ts) - 1
    return {**out, "ventricle": s, "depthMm": round(float(ts[i0]), 1), "insideMm": round(float(ts[i1] - ts[i0]), 1),
            "entersAt": P[i0].round(1).tolist()}


def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)
    S = A.Skull()
    ex2 = S.ex
    falx = np.array(ex2["soft"]["Falx cerebri"]["verts"], float)
    midline = float(np.median(falx[:, 0]))
    g = Grid()
    mask, third, vrep = ventricles(g, midline)
    vrep["frontalHorns"] = frontal_horns(mask, g)
    print("ventricles", vrep, flush=True)
    x = GRID_LO[0] + np.arange(g.shape[0]) * STEP
    vent = {"R": mask & (x > midline)[:, None, None], "L": mask & (x <= midline)[:, None, None]}
    nodes, cent = [], {}
    for s in ("L", "R"):
        m = ventricle_mesh(g, mask, s, midline)
        v, t = np.asarray(m.vertices), np.asarray(m.faces)
        nodes.append({"name": s, "positions": v, "normals": np.asarray(m.vertex_normals), "indices": t, "mode": TRIANGLES})
        cent[s] = v.mean(0).round(2).tolist()
    write_glb(BUILD / "ve_lateral_ventricle.glb", nodes, {"id": "ve_lateral_ventricle"})
    if third is not None:
        nodes3 = []
        for s in ("L", "R"):
            m = ventricle_mesh(g, third, s, midline)
            v, t = np.asarray(m.vertices), np.asarray(m.faces)
            nodes3.append({"name": s, "positions": v, "normals": np.asarray(m.vertex_normals), "indices": t, "mode": TRIANGLES})
            cent[f"third{s}"] = v.mean(0).round(2).tolist()
        write_glb(BUILD / "ve_third_ventricle.glb", nodes3, {"id": "ve_third_ventricle"})
    # the skull's landmarks
    bregma = A.bregma(S)
    sut = {f"{s}{int(d)}": suture_point(S, midline + (d if s == "R" else -d)) for s in ("R", "L") for d in (15.0, 25.0, 30.0, 40.0)}
    meatus, canal = {}, {}
    for s in ("R", "L"):
        meatus[s], canal[s] = ear_canal(S, s)
    print("meatus", {s: m.round(1).tolist() for s, m in meatus.items()}, flush=True)
    kocher = {}
    for name, d in KOCHER.items():
        for s in ("R", "L"):
            sp = sut[f"{s}{int(d)}"]
            for off in AP_OFFSETS:
                kocher[(name, s, off)] = along_surface(S, sp, np.array([0.0, 1.0, 0.0]), KOCHER_ANTERIOR_MM + off)
    # the trajectories
    eam_l, eam_r = meatus["L"], meatus["R"]
    on_line = lambda xx: eam_r + (xx - eam_r[0]) / (eam_l[0] - eam_r[0]) * (eam_l - eam_r)   # noqa: E731

    def bone_at(P):
        return S.bone_at(P)
    rows = []
    for (name, s, off), e in kocher.items():
        sg = 1.0 if s == "R" else -1.0
        n = skull_normal(S, e)
        for tgt in TARGETS:
            if tgt == "P":
                d = -n
                aim = None
            else:
                xt = {"IMC": midline + sg * CANTHUS_MM, "MAM": midline, "CMC": midline - sg * CANTHUS_MM}[tgt]
                aim = on_line(xt)
                d = unit(aim - e)
            r = trajectory(e, d, vent, g, bone_at)
            rows.append({"kocher": name, "side": s, "offsetMm": off, "target": tgt, "entry": e.round(2).tolist(), "direction": d.round(4).tolist(),
                         **({"aim": aim.round(2).tolist()} if aim is not None else {}),
                         "angleToNormalDeg": round(float(np.degrees(np.arccos(np.clip(d @ -n, -1, 1)))), 1), **r})
    for r in rows:
        if r["offsetMm"] == 0:
            print(r["kocher"], r["side"], r["target"], r.get("ventricle"), r.get("depthMm"), r.get("missMm"), flush=True)
    landmarks = [{"id": "lm_bregma", "name": "Bregma", "ras": bregma.round(2).tolist(), "side": "M",
                  "how": "Where this CT's frontal and parietal bones meet at the midline, on the outer table (the names from the fitted Z-Anatomy model)."}]
    for s in ("R", "L"):
        landmarks.append({"id": f"lm_meatus_{s.lower()}", "name": "External acoustic meatus", "ras": meatus[s].round(2).tolist(), "side": s,
                          "how": "The ear canal is the shortest way through air from the registered tympanic membrane to outside; the meatus is where it leaves the bone."})
        for name, d in KOCHER.items():
            landmarks.append({"id": f"lm_kocher_{name}_{s.lower()}", "name": f"Kocher's point ({'Chen 2025' if name == 'chen' else 'Park 2020'})",
                              "ras": kocher[(name, s, 0.0)].round(2).tolist(), "side": s,
                              "how": f"{KOCHER_ANTERIOR_MM:.0f} mm in front of the coronal suture along the outer table, {d:.0f} mm from the midline."})
        landmarks.append({"id": f"lm_canthus_{s.lower()}", "name": "Medial canthus (projected)", "ras": on_line(midline + (CANTHUS_MM if s == "R" else -CANTHUS_MM)).round(2).tolist(),
                          "side": s, "how": f"Not in this CT (it stops at the forehead): {CANTHUS_MM:.2f} mm from the midline (half Chen 2025's mean intercanthal distance), on the line between the external acoustic meatus, as Chen projects it."})
    suture = {k: v.round(2).tolist() for k, v in sut.items()}
    out = {"midline": round(midline, 2), "ventricles": vrep, "suture": suture, "canal": canal, "canthusMm": round(CANTHUS_MM, 2),
           "params": {"csfHu": CSF_HU, "smoothMm": SMOOTH_MM, "depthMm": DEPTH_MM, "kocher": KOCHER, "kocherAnteriorMm": KOCHER_ANTERIOR_MM,
                      "apOffsets": AP_OFFSETS, "maxDepthMm": MAX_DEPTH_MM}, "trajectories": rows}
    (BUILD / "trajectories.json").write_text(json.dumps(out, indent=1))
    (BUILD / "landmarks.json").write_text(json.dumps(landmarks, indent=1))
    write_manifest(cent, vrep, third is not None)
    (GEN / f"{PREFIX}-landmarks.json").write_text(json.dumps(landmarks, indent=1, ensure_ascii=False))
    (GEN / f"{PREFIX}-trajectories.json").write_text(json.dumps({k: v for k, v in out.items() if k != "canal"} | {"canal": canal}, indent=1))
    print("ventricles done")
    return 0


DATASET_NOTE = ("One adult's CT angiogram (TopBrain 2025 case 011, Skull base v2's): the bone and these ventricles are this "
                "patient's; the brain around them is a template fitted into the CT (Skull base v3). Teaching tool, not for planning.")


def write_manifest(cent: dict, vrep: dict, has_third: bool) -> None:
    """ve-manifest.json: this section's ventricles, with v2's bones and v3's fitted brain by reference."""
    import skullbase_build as SB
    v2 = json.loads((GEN / "sbct-manifest.json").read_text())
    v3 = json.loads((GEN / "sbv3-manifest.json").read_text())
    cite = [CITES[c]["citation"] for c in ("topbrain2025",)]
    url = [CITES[c]["url"] for c in ("topbrain2025",)]
    lic = "TopBrain data: open use with attribution, non-commercial (University Hospital Zurich)"
    items = [{
        "id": "ve_lateral_ventricle", "name": "Lateral ventricle", "aliases": [], "type": "soft",
        "file": f"assets/{KIND}/ve_lateral_ventricle.glb", "bytes": 0, "colour": colour("sbCsf"), "dataset": "topbrain",
        "source": "This CT (TopBrain 2025 case 011), segmented here", "licence": lic, "citation": cite, "citationUrls": url, "refIds": [],
        "category": "ventricle", "layer": "nuclei",
        "derivation": (f"This CT's own: the fluid darker than {CSF_HU:.0f} HU in its brain window (smoothed by {SMOOTH_MM:.0f} mm), at least "
                       f"{DEPTH_MM:.0f} mm inside the cranial cavity and away from the labelled vessels; the largest such body, its surface drawn at "
                       f"{CSF_HU:.0f} HU and split at the falx's plane. {vrep['volumeMl']['R']} ml on the right, {vrep['volumeMl']['L']} ml on the left: this "
                       "patient's ventricles are narrow, and where they are only a few millimetres wide the threshold sets their size (approximate to "
                       "about a millimetre)."),
        "centroid": {"L": cent["L"], "R": cent["R"]},
    }]
    if has_third:
        items.append({**items[0], "id": "ve_third_ventricle", "name": "Third ventricle", "file": f"assets/{KIND}/ve_third_ventricle.glb",
                      "derivation": (f"This CT's own, as far as it shows it: the body of fluid darker than {CSF_HU:.0f} HU on the midline below and "
                                     f"between the lateral ventricles ({vrep['volumeMl']['third']} ml). The third ventricle is a narrow cleft; the CT shows "
                                     "only its widest part, so its recesses and floor are missing."),
                      "centroid": {"L": cent["thirdL"], "R": cent["thirdR"]}})
    for it in v2["structures"]:
        if it["type"] == "bone":
            items.append({**it})
    for it in v3["structures"]:
        if it.get("category") == "brain":
            items.append({**it})
    m = {"space": "millimetres from the fitted hypophysial fossa, the CT turned into the Z-Anatomy model's frame (as Skull base v2)",
         "generatedBy": "pipeline/ventricles_build.py + pipeline/compress.mjs", "structures": items,
         "dataset": {"name": "TopBrain 2025 CT angiogram (case 011)", "licence": lic, "url": "https://zenodo.org/records/16878417",
                     "note": DATASET_NOTE, "attribution": [a for a in v3["dataset"]["attribution"] if "TopBrain" in a],
                     "citation": cite, "citationUrls": url}}
    (GEN / f"{PREFIX}-manifest.json").write_text(json.dumps(m, indent=1, ensure_ascii=False))


def finalize() -> int:
    """After compress.mjs: file sizes, the manifest next to the assets; then the checks."""
    import shutil
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
    fails, n = [], 0

    def check(ok, msg):
        nonlocal n
        n += 1
        if not ok:
            fails.append(msg)
    t = json.loads((GEN / f"{PREFIX}-trajectories.json").read_text())
    lms = {l["id"]: l for l in json.loads((GEN / f"{PREFIX}-landmarks.json").read_text())}
    v = t["ventricles"]
    for s in ("R", "L"):
        check(0.5 <= v["volumeMl"][s] <= 30, f"{s} lateral ventricle {v['volumeMl'][s]} ml")
    fh = v["frontalHorns"]
    check(10 <= fh["widthMm"] <= 60 and 0.1 <= fh["evansIndex"] <= 0.45, f"frontal horns {fh}")
    mr, ml_ = np.array(lms["lm_meatus_r"]["ras"]), np.array(lms["lm_meatus_l"]["ras"])
    check(abs(mr[0] + ml_[0]) < 8 and abs(mr[1] - ml_[1]) < 8 and abs(mr[2] - ml_[2]) < 8, f"the two meatus are not mirror images: {mr} {ml_}")
    check(40 < mr[0] < 70 and -70 < ml_[0] < -40, f"meatus off the temporal bones: {mr} {ml_}")
    br = np.array(lms["lm_bregma"]["ras"])
    for name, d in KOCHER.items():
        for s in ("r", "l"):
            k = np.array(lms[f"lm_kocher_{name}_{s}"]["ras"])
            check(abs(abs(k[0] - t["midline"]) - d) < 2.0, f"Kocher ({name}, {s}) {abs(k[0] - t['midline']):.1f} mm from the midline")
            check(0 < k[1] - br[1] < 25, f"Kocher ({name}, {s}) {k[1] - br[1]:.1f} mm in front of bregma")
    rows = t["trajectories"]
    check(len(rows) == len(KOCHER) * 2 * len(AP_OFFSETS) * len(TARGETS), f"{len(rows)} trajectories")
    for r in rows:
        if r.get("ventricle"):
            check(15 <= r["depthMm"] <= 90, f"{r['kocher']} {r['side']} {r['target']} {r['offsetMm']}: depth {r['depthMm']}")
        check(2 <= r["boneMm"] <= 15, f"{r['kocher']} {r['side']} {r['target']} {r['offsetMm']}: bone {r['boneMm']} mm")
        check(abs(np.linalg.norm(r["direction"]) - 1) < 1e-3, "direction not a unit vector")
    m = json.loads((GEN / f"{PREFIX}-manifest.json").read_text())
    for it in m["structures"]:
        check((REPO / "public" / it["file"]).exists(), f"missing {it['file']}")
    print(f"ventricles validation: {n - len(fails)}/{n} checks passed")
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(finalize() if sys.argv[1:] == ["finalize"] else main())
