"""Skull base v1 (the Z-Anatomy model): the endoscopic endonasal view as Skull base v3 draws it on its CT, on Z-Anatomy's
own skull, sinus, hypophysis, vessels, nerves and v1's brain.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_endonasal.py
  (after skullbase_v1_skull.py, skullbase_v1_nerves.py, skullbase_v1_brain.py and skullbase_v1_pfossa.py)

The same fields and pieces as skullbase_v3_endonasal.py (its rules and parameters reused), from the model instead of a
CT, on a grid over BOX:
  * bone   v1's bone field (skullbase_v1_skull.py: Z-Anatomy's bones rasterised), at its surface level;
  * solid  the same: Z-Anatomy has no mucosa, so the lining the scope sees is the bone's surface (the sinus's and the
           nose's walls bare); and what lies outside the space the bones enclose closed (Z-Anatomy has no face or scalp
           there: v3's CT has tissue), so the scope sees the nose and the sinus, not past them;
  * density the bone field as a CT-like value (air to bone), to colour the cut;
  * the distances to the arteries (Z-Anatomy's centre lines with the radius it draws), the nerves (the optic nerves and
    chiasm as v1 draws them, III to VI), the sellar contents (Z-Anatomy's adeno- and neurohypophysis and their stalk,
    the intercavernous sinuses) and the brain (v1's frontal and temporal lobes, midbrain, pons, medulla);
  * the sphenoid sinus: the air inside Z-Anatomy's "Sinus of sphenoid bone" (both halves, either side of its septum;
    each side's scope aimed at its own half); the nose: the air the bones enclose (the
    bone closed by NASAL_CLOSE_MM), in front of the sinus and below the anterior fossa, split at the midline (the
    septum's cartilage is not part of the model);
  * the hypophysis: Z-Anatomy's own (no gland is modelled in the fossa, as v3 must): what its two meshes enclose
    together, the lobes parted at the plane of their common rim, the narrow neck above the gland as the stalk
    (skullbase_v1_stalk.py); the diaphragma from its tuberculum and dorsum sellae; its cavernous sinuses' medial walls
    from its own sinuses.
Writes public/assets/skullbase/endonasal.bin.gz and src/data/generated/sb-endonasal.json.
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
from scipy.spatial import cKDTree
from skimage.graph import MCP_Geometric

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_build as SB  # noqa: E402
import skullbase_v3_endonasal as ENDO  # noqa: E402
from skullbase_brain import fill  # noqa: E402

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"
OUT_BIN = REPO / "public" / "assets" / "skullbase" / "endonasal.bin.gz"
OUT_JSON = GEN / "sb-endonasal.json"
BOX = ((-24.0, 24.0), (-18.0, 88.0), (-44.0, 26.0))
NASAL_CLOSE_MM = 5.0
WALL_CROSS_MM = 4.0
NOSE_HALF_MM = 12.0
LINE_MM = 6.0
# the way is opened at least this far round its line whatever lies there (bone, or the closure of the outside): the
# scope's clear core (2.5 mm across: ENDO_SCOPE_ROOM_MM in src/skullbase/endonasal.ts) and a voxel. Under Z-Anatomy's
# nasal bones the space the bones enclose is a slit 2-3 mm high, where the scope stopped 26 mm in on both sides and
# never came to the sinus
WAY_CORE_MM = 1.75
FAKE_HU = (-1000.0, 1000.0)     # (the bone field 0..1 as a CT-like value, to colour the cut)
NERVES = ["sb_optic_nerve_ii", "sb_optic_chiasm", "sb_oculomotor_nerve_iii", "sb_trochlear_nerve_iv", "sb_trigeminal_nerve_v", "sb_abducens_nerve_vi"]
SELLAR = ["sb_adenohypophysis", "sb_neurohypophysis", "sb_pituitary_stalk", "sb_anterior_intercavernous_sinus", "sb_posterior_intercavernous_sinus"]
BRAIN = ["br_frontal_lobe", "br_temporal_lobe", "pf_midbrain", "pf_pons", "pf_medulla"]


def grid() -> dict:
    shape = tuple(int(round((h - l) / ENDO.GRID_MM)) + 1 for l, h in BOX)
    a_crop = np.diag([ENDO.GRID_MM] * 3 + [1.0])
    a_crop[:3, 3] = [l for l, _ in BOX]
    P = nib.affines.apply_affine(a_crop, np.indices(shape).reshape(3, -1).T)
    c = np.load(BUILD / "skull_bone.npz")
    b, a = c["b"].astype(np.float32), c["a"]
    bs = ndimage.map_coordinates(ndimage.gaussian_filter(b, ENDO.BONE_SIGMA_VOX), nib.affines.apply_affine(np.linalg.inv(a), P).T,
                                 order=1, mode="constant", cval=0.0).reshape(shape)
    return {"shape": shape, "a_crop": a_crop, "P": P, "b": bs}


def mesh_inside(V: np.ndarray, T: np.ndarray, a_crop: np.ndarray, shape: tuple) -> np.ndarray:
    m = trimesh.Trimesh(V, T, process=True)
    lo = a_crop[:3, 3]
    if m.is_watertight:
        return fill(np.asarray(m.vertices), np.asarray(m.faces), lo, shape, ENDO.GRID_MM)
    sh = np.zeros(shape, bool)
    # (sampled with a seed of its own: trimesh draws from its own generator, which numpy's seed in main does not set, so
    # two runs gave Z-Anatomy's lobes and the pieces round them volumes 1 % apart)
    P = np.vstack([m.vertices, trimesh.sample.sample_surface(m, int(m.area / (0.25 * ENDO.GRID_MM ** 2)), seed=0)[0]])
    ijk = np.rint((P - lo) / ENDO.GRID_MM).astype(int)
    ok = np.all((ijk >= 0) & (ijk < np.array(shape)), 1)
    sh[tuple(ijk[ok].T)] = True
    return ndimage.binary_fill_holes(ndimage.binary_dilation(sh))


def main() -> int:
    np.random.seed(0)
    ex = json.loads((BUILD / "export.json").read_text())
    lms = {(l["name"], l.get("side")): np.array(l["ras"], float) for l in json.loads((GEN / "sb-landmarks.json").read_text())}
    g = grid()
    shape, a_crop, P = g["shape"], g["a_crop"], g["P"]
    Pg = P.reshape(shape + (3,))
    vox = ENDO.GRID_MM
    print("grid", shape, int(np.prod(shape)), "voxels")
    bone = np.clip(np.round(ENDO.FIELD_ISO + (g["b"] - ENDO.BONE_LEVEL) * ENDO.BONE_SCALE), 0, 255).astype(np.uint8)
    solid = bone.copy()
    # (the box's own edge closed, as v3 closes what lies beyond its scan: nothing to see there, its edge smooth)
    inbox = np.zeros(shape, bool)
    inbox[1:-1, 1:-1, 1:-1] = True
    solid = np.maximum(solid, np.clip(np.round(ENDO.FIELD_ISO + (1.0 - ndimage.distance_transform_edt(inbox, sampling=ENDO.GRID_MM)) * ENDO.CORRIDOR_RAMP), 0, 255).astype(np.uint8))
    hu = FAKE_HU[0] + (FAKE_HU[1] - FAKE_HU[0]) * np.clip(g["b"], 0, 1)
    air = solid < ENDO.FIELD_ISO

    def dist_to(pts: list) -> np.ndarray:
        pts = [p for p in pts if p is not None and len(p)]
        return cKDTree(np.vstack(pts)).query(P, distance_upper_bound=52.0)[0].reshape(shape) if pts else np.full(shape, 99.0)
    # the arteries: Z-Anatomy's centre lines with their radius, as a lumen mask
    box_lo, box_hi = np.array([l for l, _ in BOX]) - 5, np.array([h for _, h in BOX]) + 5
    art = []
    for ln in ex["lines"].values():
        if ln.get("kind") != "artery":
            continue
        for run in ln["runs"]:
            R = SB.resample(np.array(run, float))
            if len(R) and np.any(np.all((R[:, :3] > box_lo) & (R[:, :3] < box_hi), 1)):
                art.append(R)
    A = np.vstack(art)
    d_c, j = cKDTree(A[:, :3]).query(P, distance_upper_bound=40.0)
    rad = np.where(np.isfinite(d_c), A[np.minimum(j, len(A) - 1), 3], 0.0)
    vessels = (d_c <= rad).reshape(shape)
    d_art = ndimage.distance_transform_edt(~vessels, sampling=vox)
    d_nerve = dist_to([ENDO.surface_points(BUILD / f"{n}.glb") for n in NERVES])
    d_sellar = dist_to([ENDO.surface_points(BUILD / f"{n}.glb") for n in SELLAR])
    d_brain = dist_to([ENDO.surface_points(BUILD / f"{n}.glb") for n in BRAIN])
    # the sphenoid sinus: the air in Z-Anatomy's sinus
    import skullbase_v1_skull as SK
    sv = ex["bones"]["Sinus of sphenoid bone"]
    s_mask = SK.parity_inside(trimesh.Trimesh(np.array(sv["verts"], float), np.array(sv["tris"], int), process=True), a_crop[:3, 3], shape) & air
    lab, _ = ndimage.label(s_mask)                 # (its halves, either side of its septum, both kept)
    sz = np.bincount(lab.ravel())
    sz[0] = 0
    s_mask = np.isin(lab, np.nonzero(sz >= 0.1 * sz.max())[0])
    sp = Pg[s_mask]
    seed_p = sp[np.argmin(np.linalg.norm(sp - sp.mean(0), axis=1))]
    seed = tuple(np.round(nib.affines.apply_affine(np.linalg.inv(a_crop), seed_p)).astype(int))
    seeds = {}                                     # (each side's scope aimed at the sinus's half on its side)
    for sd, sg in (("L", -1.0), ("R", 1.0)):
        half = sp[sg * sp[:, 0] > 0] if (sg * sp[:, 0] > 0).any() else sp
        q = half[np.argmin(np.linalg.norm(half - half.mean(0), axis=1))]
        seeds[sd] = tuple(np.round(nib.affines.apply_affine(np.linalg.inv(a_crop), q)).astype(int))
    # the nose: the air the bones enclose, in front of the sinus, below the anterior fossa's floor, split at the midline
    r = int(round(NASAL_CLOSE_MM / vox))
    bm = bone >= ENDO.FIELD_ISO
    pad = r + 1
    enclosed = ndimage.binary_closing(np.pad(bm, pad), ENDO.ball(r))[pad:-pad, pad:-pad, pad:-pad]
    x, y, z = Pg[..., 0], Pg[..., 1], Pg[..., 2]
    nose = air & enclosed & ~s_mask & (y > float(sp[:, 1].min())) & (z < float(sp[:, 2].max())) & (np.abs(x) < 20)
    lab, _ = ndimage.label(nose)
    keep = np.bincount(lab.ravel())
    keep[0] = 0
    nose = np.isin(lab, np.nonzero(keep > 0.02 * keep.max())[0])
    nasal_side = {"L": nose & (x < 0), "R": nose & (x >= 0)}
    # what lies outside the space the bones enclose (the face and the scalp, which Z-Anatomy has as air beyond its bones)
    # closed, as v3's CT closes it with tissue, so the scope sees the nose and the sinus, not past them: a ramp a mm across
    keep_open = ndimage.binary_dilation(nose | s_mask, iterations=2)
    out_ = ~enclosed & air & ~keep_open
    if out_.any():
        ramp = np.clip(np.round(ENDO.FIELD_ISO + (1.0 - ndimage.distance_transform_edt(~out_, sampling=vox)) * ENDO.CORRIDOR_RAMP), 0, 255).astype(np.uint8)
        solid = np.maximum(solid, ramp)
        air = solid < ENDO.FIELD_ISO
    entry = {}
    for sd in ("L", "R"):
        pts = Pg[nasal_side[sd]]
        front = pts[pts[:, 1] > pts[:, 1].max() - ENDO.ENTRY_SLAB_MM]
        entry[sd] = np.median(front, 0).round(2).tolist()
    sinus = {"seed": seed_p.round(2).tolist(), "centre": sp.mean(0).round(2).tolist(), "volumeMl": round(float(s_mask.sum()) * vox ** 3 / 1000, 2),
             "lo": sp.min(0).round(1).tolist(), "hi": sp.max(0).round(1).tolist(), "backMm": round(float(sp[:, 1].min()), 1),
             "opensToNose": bool((ndimage.binary_dilation(s_mask, iterations=3) & nose).any())}
    # the corridor, as v3's (skullbase_v3_endonasal.main)
    to_sinus = ndimage.distance_transform_edt(~s_mask, sampling=vox)
    corridor = {}
    clr = ndimage.distance_transform_edt(air, sampling=vox)
    for sd in ("L", "R"):
        nasal = ndimage.binary_dilation(nasal_side[sd], iterations=ENDO.NASAL_PAD_VOX)
        cost = np.where(air, 1 + 30 * np.clip(ENDO.CORRIDOR_ROOM_MM - clr, 0, None), np.where(bone >= ENDO.FIELD_ISO, 300.0, 60.0))
        # (Z-Anatomy's sinus opening may be closed by its bone: the way may cross up to WALL_CROSS_MM of the wall between
        # the nose and the sinus, at bone's cost, so it takes the thinnest)
        between = ndimage.binary_dilation(nasal, iterations=int(round(WALL_CROSS_MM / vox))) & ndimage.binary_dilation(s_mask, iterations=int(round(WALL_CROSS_MM / vox)))
        # (and keeps to the nose's middle: within NOSE_HALF_MM of the midline, or within LINE_MM of the straight line from
        # the entry to its half of the sinus; the lateral meati and the air beyond them are not the way)
        a_, b_ = np.array(entry[sd]), nib.affines.apply_affine(a_crop, seeds[sd])
        t_ = np.clip(((Pg - a_) @ (b_ - a_)) / ((b_ - a_) @ (b_ - a_)), 0, 1)
        line = np.linalg.norm(Pg - (a_ + t_[..., None] * (b_ - a_)), axis=-1) <= LINE_MM
        cost[~(((nasal & (np.abs(x) <= NOSE_HALF_MM)) | s_mask | between) | line)] = np.inf
        start = tuple(np.round(nib.affines.apply_affine(np.linalg.inv(a_crop), entry[sd])).astype(int))
        mcp = MCP_Geometric(cost)
        mcp.find_costs([start], [seeds[sd]])
        path = np.array(mcp.traceback(seeds[sd]))
        inside = s_mask[tuple(path.T)]
        first = int(np.argmax(inside))
        recess = max(i for i in range(max(first, 1)) if air[tuple(path[i])])
        C = ENDO.smooth(ENDO.resample(Pg[tuple(path[:recess + 1].T)], 0.5), int(ENDO.CORRIDOR_SMOOTH_MM / 0.5))
        C = ENDO.resample(C, 1.0)
        length = float(np.sum(np.linalg.norm(np.diff(C, axis=0), axis=1)))
        opened = ENDO.resample(C, 0.25)
        opened = opened[np.r_[0, np.cumsum(np.linalg.norm(np.diff(opened, axis=0), axis=1))] <= length - ENDO.CORRIDOR_SHORT_MM]
        dd = cKDTree(opened).query(P, distance_upper_bound=ENDO.CORRIDOR_MM)[0].reshape(shape)
        inside_nasal = ndimage.distance_transform_edt(nasal, sampling=vox) - ndimage.distance_transform_edt(~nasal, sampling=vox)
        level = np.maximum.reduce([(dd - ENDO.CORRIDOR_MM / 2), np.minimum(0.5 - inside_nasal, dd - WAY_CORE_MM), (ENDO.CORRIDOR_FACE_MM - to_sinus)])
        wall = np.clip(np.round(ENDO.FIELD_ISO + level * ENDO.CORRIDOR_RAMP), 0, 255).astype(np.uint8)
        open_ = dd < ENDO.CORRIDOR_MM
        before = int(((solid >= ENDO.FIELD_ISO) & open_ & (wall < ENDO.FIELD_ISO)).sum())
        bone[open_] = np.minimum(bone[open_], wall[open_])
        solid[open_] = np.minimum(solid[open_], wall[open_])
        corridor[sd] = {"points": C.round(2).tolist(), "lengthMm": round(length, 1), "openedMm": round(length - ENDO.CORRIDOR_SHORT_MM, 1),
                        "recess": C[-1].round(2).tolist(), "openedMm3": round(before * vox ** 3, 1)}
        print(sd, "corridor", round(length, 1), "mm; opened", round(before * vox ** 3), "mm3")
        corridor[sd]["_opened"] = opened
    # how wide the way is as drawn (the audit's MC-16: tighter against the septum than the CORRIDOR_MM it is opened to):
    # along its opened part, twice the distance from the way to the nearest lining, on the grid (so in steps of a voxel)
    room = ndimage.distance_transform_edt(solid < ENDO.FIELD_ISO, sampling=vox)
    for sd in ("L", "R"):
        q = np.round(nib.affines.apply_affine(np.linalg.inv(a_crop), corridor[sd].pop("_opened"))).astype(int)
        w = 2 * room[tuple(q.T)]
        corridor[sd]["freeMm"] = {"least": round(float(w.min()), 1), "median": round(float(np.median(w)), 1),
                                  "underShare": round(float((w < ENDO.CORRIDOR_MM - vox).mean()), 2)}
        print(sd, "the way's free width", corridor[sd]["freeMm"])
    # the hypophysis: Z-Anatomy's own. Its two meshes are open shells that close each other along one flat rim, so the
    # hypophysis is what the two enclose together (each alone encloses nothing: taken one by one, as this step did, each
    # was only its surface a voxel thick, and the "gland" a hollow skin). The lobes meet at the rim's plane, and the
    # narrow neck above skullbase_v1_stalk.neck_level is the stalk. Its parts' conditions (mm, <= 0 inside)
    import skullbase_v1_stalk as ST
    whole = ST.closed(ex)
    hyp_mask = fill(np.asarray(whole.vertices), np.asarray(whole.faces), a_crop[:3, 3], shape, ENDO.GRID_MM)
    rim_c, rim_n, rim_off = ST.rim_plane(ex)
    assert rim_off < 0.25, f"the lobes' common rim is not flat ({rim_off:.2f} mm)"
    neck = ST.neck_level(ex)
    front = (Pg - rim_c) @ rim_n > 0
    masks = {"stalk": hyp_mask & (Pg[..., 2] > neck["z"])}
    masks["adeno"] = hyp_mask & ~masks["stalk"] & front
    masks["neuro"] = hyp_mask & ~masks["stalk"] & ~front
    parts = {pid: ENDO.signed(m, vox).astype(np.float32) for pid, m in masks.items()}
    off_gland = ENDO.signed(hyp_mask, vox)        # (the pieces keep off all of it, the stalk too)
    tub, dors = lms[("Tuberculum sellae", "M")], lms[("Dorsum sellae", "M")]
    # (the audit's AP-11: Z-Anatomy's gland is high, and reaches above the sella; so also what of it lies below the
    # diaphragma, the plane through its tuberculum and dorsum sellae, level from side to side.) Sizes and volumes from
    # the meshes as cut (exact: the 0.5 mm grid holds 6 % less than the closed mesh does)
    cut, _ = ST.split(ex)
    gv = np.vstack([cut[n][0] for n in ST.LOBES])
    sv_ = cut[ST.STALK][0]
    z_dv = tub[2] + (dors[2] - tub[2]) * (gv[:, 1] - tub[1]) / (dors[1] - tub[1])
    up, at_neck = np.array([0.0, 0.0, 1.0]), np.array([0.0, 0.0, neck["z"]])
    dia_n = np.array([0.0, -(dors[2] - tub[2]), dors[1] - tub[1]])
    dia_n = dia_n / np.linalg.norm(dia_n) * (1.0 if dia_n[2] > 0 else -1.0)      # (the diaphragma's plane, its normal up)
    vol = lambda planes: round(ST.volume_within(whole, planes), 1)   # noqa: E731
    hypo = {"diaphragma": {"tuberculum": tub.round(1).tolist(), "dorsum": dors.round(1).tolist()},
            "gland": {"widthMm": round(float(np.ptp(gv[:, 0])), 1), "lengthMm": round(float(np.ptp(gv[:, 1])), 1),
                      "heightMm": round(float(np.ptp(gv[:, 2])), 1), "mm3": vol([(at_neck, -up)]),
                      "aboveDiaphragmaMm": round(float((gv[:, 2] - z_dv).max()), 1),
                      "belowDiaphragma": {"heightMm": round(float(-(gv[:, 2] - z_dv).min()), 1), "mm3": vol([(tub, -dia_n)])}},
            "adenoMm3": vol([(at_neck, -up), (rim_c, rim_n)]), "neuroMm3": vol([(at_neck, -up), (rim_c, -rim_n)]),
            "stalkMm3": vol([(at_neck, up)]),
            "stalk": {"fromZ": neck["z"], "heightMm": round(float(np.ptp(sv_[:, 2])), 1), "widthMm": round(float(np.ptp(sv_[:, 0])), 1),
                      "glandWidestMm": neck["widestMm"], "widthShare": round(ST.STALK_WIDTH_SHARE, 3)}}
    print("hypophysis", json.dumps(hypo), "the rim's plane", rim_c.round(2).tolist(), rim_n.round(3).tolist(), "flat within", round(rim_off, 2), "mm")
    # its cavernous sinuses (Z-Anatomy's), for their medial walls as a step
    cs = {}
    for sd in ("R", "L"):
        m_ = ex["soft"][f"Cavernous sinus.{sd.lower()}"]
        cm = mesh_inside(np.array(m_["verts"], float), np.array(m_["tris"], int), a_crop, shape)
        print("cavernous sinus", sd, round(float(cm.sum()) * vox ** 3), "mm3 on the grid; its mesh encloses",
              round(abs(float(trimesh.Trimesh(np.array(m_["verts"], float), np.array(m_["tris"], int), process=True).volume))), "mm3")
        cs[sd] = ENDO.signed(cm, vox).astype(np.float16)
    np.savez_compressed(BUILD / "cavernous_cond.npz", **cs)
    ENDO.CS_COND = BUILD / "cavernous_cond.npz"
    piece, piece_level, pieces = ENDO.build_pieces(bone, solid, s_mask, nasal_side["L"], nasal_side["R"],
                                                   {"vessel": d_art, "nerve": d_nerve, "sellar": d_sellar, "brain": d_brain}, Pg, vox, off_gland)
    gland_label = np.zeros(shape, np.uint8)
    for i_, k_ in ((3, "stalk"), (1, "adeno"), (2, "neuro")):      # (as v3 labels them: its surface, 0.2 mm off, with it)
        gland_label[parts[k_] <= 0.2] = i_
    near = ndimage.binary_dilation(((solid > 64) & (solid < 192)) | ((bone > 64) & (bone < 192)), iterations=ENDO.DENSITY_REACH_VOX)
    density = np.clip(np.round((hu - ENDO.DENSITY_MIN_HU) / ENDO.DENSITY_STEP_HU), 0, 255).astype(np.uint8)
    density[~near] = 0
    fields = [bone, solid, density, ENDO.u8_dist(d_art), ENDO.u8_dist(d_nerve), ENDO.u8_dist(d_sellar), ENDO.u8_dist(d_brain), piece, piece_level, gland_label]
    OUT_BIN.parent.mkdir(parents=True, exist_ok=True)
    data = gzip.compress(b"".join(np.ascontiguousarray(f).tobytes() for f in fields), 9, mtime=0)
    OUT_BIN.write_bytes(data)
    print("written", OUT_BIN.name, f"{len(data) / 1e6:.2f} MB")
    vv = Pg[vessels]
    icd = []
    for zz in range(-10, 16, 2):
        sl = vv[(np.abs(vv[:, 2] - zz) < 1.0) & (np.abs(vv[:, 1]) < 6) & (np.abs(vv[:, 0]) < 22)]
        l_, r_ = sl[sl[:, 0] < -3], sl[sl[:, 0] > 3]
        if len(l_) and len(r_):
            icd.append({"z": zz, "mm": round(float(cKDTree(l_).query(r_)[0].min()), 1)})
    out = {"params": {"fieldIso": ENDO.FIELD_ISO, "boneLevel": ENDO.BONE_LEVEL, "boneScale": ENDO.BONE_SCALE, "airHu": ENDO.AIR_HU,
                      "solidHuStep": ENDO.SOLID_HU_STEP, "densityMinHu": ENDO.DENSITY_MIN_HU, "densityStepHu": ENDO.DENSITY_STEP_HU,
                      "distStepMm": ENDO.DIST_STEP_MM, "pieceStepMm": ENDO.PIECE_STEP_MM, "pieceClearMm": ENDO.PIECE_CLEAR_MM,
                      "fields": ["bone", "solid", "density", "vessel", "nerve", "sellar", "brain", "piece", "pieceLevel", "gland"]},
           "file": "assets/skullbase/endonasal.bin.gz", "bytes": len(data), "dims": list(shape), "affine": np.round(a_crop, 5).tolist(),
           "box": [list(b_) for b_ in BOX], "entry": entry, "corridor": corridor, "corridorMm": ENDO.CORRIDOR_MM, "corridorCoreMm": 2 * WAY_CORE_MM,
           # (a piece with nothing in it on this model is not a step: the clivus when the sinus does not reach behind the sella)
           "sinus": sinus, "intercarotid": icd, "pieces": [p_ for p_ in pieces if p_["mm3"] > 0], "hypophysis": hypo}
    OUT_JSON.write_text(json.dumps(out, indent=1))
    print(json.dumps({k: out[k] for k in ("entry", "sinus", "intercarotid")})[:800])
    return 0


if __name__ == "__main__":
    sys.exit(main())
