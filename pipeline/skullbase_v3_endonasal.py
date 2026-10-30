"""Skull base v3's endoscopic endonasal (transsphenoidal) view: the CT around the sphenoid as fields the browser can
cut away with a burr, seen through a 0 degree endoscope from one nostril.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_endonasal.py   (after skullbase_ct.py and skullbase_v3.py)

On the grid of Skull base v2's bone (bone.npz: 0.5 mm, scanner RAS), cropped to BOX (mm in the model's frame, origin at
the fitted hypophysial fossa), stored as uint8 one after another (C order):
  * bone   the bone as Skull base v2/v3 draws it: its smoothed mask (with the walls of the air cells, which are thinner
           than a voxel) around its surface level, FIELD_ISO at BONE_LEVEL, BONE_SCALE units per unit of the mask;
  * solid  what is not air: the CT (smoothed as the bone) around AIR_HU, FIELD_ISO there, SOLID_HU_STEP HU per unit, and
           never less than the bone (the walls of the air cells): its surface is the lining the endoscope sees (the
           mucosa of the nasal cavity, the walls of the sphenoid sinus);
  * density the CT, from DENSITY_MIN_HU in DENSITY_STEP_HU steps (to colour the cut and the lining);
  * the distance (mm, in DIST_STEP_MM steps) to the vessels TopBrain labels (the carotids above all), to the nerves (the
    optic nerves TotalSegmentator segments, the chiasm fitted from Z-Anatomy, the oculomotor, trochlear, trigeminal and
    abducens nerves routed through this CT), to the sellar contents (the pituitary and the cavernous sinuses, fitted)
    and to the brain (the fitted frontal and temporal lobes, the brainstem), these two only where the CT shows soft
    tissue (see in_soft): the burr stops at them.
The solid field's thinnest walls have their holes closed (CLOSE_VOX), and a corridor is opened through each side of the
nose for the scope (CORRIDOR_*). The pieces taken away step by step (PIECES: the sinus's front
wall, its septa, the sellar floor, the tuberculum and planum, the upper clivus) are stored as a label and a level (their
condition, in PIECE_STEP_MM steps about 128, so their cut surfaces are smooth). Writes public/assets/skullbase-v3/endonasal.bin.gz and
src/data/generated/sbv3-endonasal.json (the grid, the scope's entry in each nostril as far forward as the scan reaches,
its corridor, the sphenoid sinus and measurements on this CT).
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
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
V3_BUILD = ROOT / "data" / "build" / "skullbase-v3"
TS = CT_BUILD / "ts"
CT_PATH = ROOT / "data" / "raw" / "topbrain" / "topcow_ct_011_0000.nii.gz"
REPO = ROOT.parent
OUT_BIN = REPO / "public" / "assets" / "skullbase-v3" / "endonasal.bin.gz"
OUT_JSON = REPO / "src" / "data" / "generated" / "sbv3-endonasal.json"

BOX = ((-26.0, 26.0), (-18.0, 45.0), (-38.0, 26.0))   # mm in the model's frame: x right, y forwards, z up
FIELD_ISO = 128
BONE_LEVEL, BONE_SIGMA_VOX, BONE_SCALE = 0.4, 0.6, 200.0   # as skullbase_ct.py takes the bone's surface
AIR_HU, SOLID_HU_STEP = -400.0, 2.0     # (soft tissue saturates: the field is flat away from the air)
GRID_MM = 0.5
DENSITY_REACH_VOX = 3
DENSITY_MIN_HU, DENSITY_STEP_HU = -200.0, 7.0
DIST_STEP_MM = 0.2
DIST_MAX_MM = 25.0
SURFACE_SAMPLE_MM = 0.3
ENTRY_SLAB_MM = 4.0      # the scope's entry: the middle of the nasal cavity in its front-most this many mm in the scan
SINUS_OPEN_VOX = 3
CLOSE_VOX = 2
SINUS_SEED = (0.0, 2.0, -3.0)   # mm in the frame: under the sellar floor, in the sphenoid sinus (its air, on this CT)
# the scope's way through each side of the nose: the path through the nasal cavity (TotalSegmentator's, NASAL_PAD_VOX
# wider) from the entry to the sinus that keeps the most room round it (CORRIDOR_ROOM_MM wanted), as far as the last
# air before the sinus (the sphenoethmoidal recess, at the sinus's opening), smoothed over CORRIDOR_SMOOTH_MM; then
# opened to CORRIDOR_MM across (a 4-mm scope), the turbinates and the mucosa pushed aside as the surgeon does (a drawing
# choice: the CT's passages are narrower than the scope), stopping CORRIDOR_SHORT_MM short of its end and
# CORRIDOR_FACE_MM from the sinus (its front wall is left for the burr)
NASAL_PAD_VOX = 2
CORRIDOR_ROOM_MM = 2.0
CORRIDOR_SMOOTH_MM = 4.0
CORRIDOR_MM = 4.0
CORRIDOR_SHORT_MM = 2.5
CORRIDOR_FACE_MM = 1.5
CORRIDOR_RAMP = 64.0     # field units a mm across the opened corridor's wall (its surface smooth)
NERVES_V3 = ["tb_oculomotor_nerve_iii", "tb_trochlear_nerve_iv", "tb_trigeminal_nerve_v", "tb_trigeminal_ganglion", "tb_abducens_nerve_vi"]
SELLAR = ["sb_adenohypophysis", "sb_neurohypophysis", "sb_cavernous_sinus", "sb_anterior_intercavernous_sinus", "sb_posterior_intercavernous_sinus"]
BRAIN_V3 = ["br_frontal_lobe", "br_temporal_lobe", "br_medial_wall", "pf_midbrain", "pf_pons", "pf_medulla"]


def surface_points(path: Path) -> np.ndarray | None:
    if not path.exists():
        return None
    m = trimesh.util.concatenate(list(trimesh.load(path, force="scene").dump()))
    pts, _ = trimesh.sample.sample_surface_even(m, max(int(m.area / SURFACE_SAMPLE_MM ** 2), 500), seed=1)
    return np.vstack([pts, m.vertices])


def label_at(cl: np.ndarray, aff: np.ndarray, p) -> int:
    """The component label at a frame point (0 outside the grid)."""
    q = np.round(nib.affines.apply_affine(np.linalg.inv(aff), p)).astype(int)
    return int(cl[tuple(q)]) if np.all((q >= 0) & (q < np.array(cl.shape))) else 0


def resample(P: np.ndarray, step: float) -> np.ndarray:
    """A polyline at even steps along it."""
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    t = np.r_[np.arange(0, s[-1], step), s[-1]]
    return np.stack([np.interp(t, s, P[:, i]) for i in range(3)], 1)


def smooth(P: np.ndarray, w: int) -> np.ndarray:
    """A moving average over up to w points each side (fewer near the ends, which stay where they are)."""
    Q = P.copy()
    for i in range(1, len(P) - 1):
        hw = min(i, len(P) - 1 - i, w)
        Q[i] = P[i - hw:i + hw + 1].mean(0)
    return Q


def u8_dist(d: np.ndarray) -> np.ndarray:
    """Distances in DIST_STEP_MM steps; beyond DIST_MAX_MM stored as 255 (far: the file stays small)."""
    u = np.clip(np.round(d / DIST_STEP_MM), 0, 255).astype(np.uint8)
    u[d > DIST_MAX_MM] = 255
    return u


# ---- what can be taken away step by step, in the order of the operation (ids, names): each a region made of smooth
# conditions (distances, planes; mm in the frame), kept PIECE_CLEAR_MM off what the burr must not enter, an earlier
# piece's voxels not a later one's. The walls between air spaces (the sinus's front wall, its septa) go
# whole; those against the dura (BONE_ONLY: the sellar floor, the planum, the clivus) only their bone and the mucosa
# on its air faces (PIECE_MUCOSA_MM), the dura and what lies behind it left
# (the back of the nasal septum is not one: through one nostril it hardly changes what the scope sees)
PIECES = [
    ("face", "Front wall of the sphenoid sinus"),
    ("septa", "Septa of the sinus"),
    ("floor", "Sellar floor"),
    ("dura", "Dura over the sella"),
    ("cs_R", "Medial wall of the right cavernous sinus"),
    ("cs_L", "Medial wall of the left cavernous sinus"),
    ("planum", "Tuberculum sellae and planum"),
    ("clivus", "Upper clivus"),
]
PIECE_MUCOSA_MM = 1.2
PIECE_CLEAR_MM = {"vessel": 0.8, "nerve": 0.6, "sellar": 0.4, "brain": 0.4}
PIECE_REACH_MM = 1.5      # a piece's level is stored this far outside it (its cut surface smooth)
PIECE_STEP_MM = 0.05      # the level in these steps about 128
SEPTA_CLOSE_MM = 2.0
BONE_ONLY = {"floor", "planum", "clivus"}
# the cavernous sinus's medial wall (each side): the bone and lining between the sphenoid sinus and it (CS_FROM_SINUS_MM
# of the sinus's air, CS_NEAR_MM of it), and its venous space (skullbase_v3_cavernous.py's model), up to the carotid's
# wall (as the burr goes) and CS_KEEP_MM off its nerves and the hypophysis
CS_FROM_SINUS_MM, CS_NEAR_MM, CS_KEEP_MM = 3.5, 2.5, 0.4
CS_COND = V3_BUILD / "cavernous_cond.npz"


def ball(r_vox: int) -> np.ndarray:
    return np.sum((np.indices((2 * r_vox + 1,) * 3) - r_vox) ** 2, axis=0) <= r_vox ** 2


def signed(mask: np.ndarray, vox: float) -> np.ndarray:
    """Signed distance to a mask's surface (mm): negative inside."""
    return ndimage.distance_transform_edt(~mask, sampling=vox) - ndimage.distance_transform_edt(mask, sampling=vox)


def build_pieces(bone, solid, s_mask, nasal_l, nasal_r, dist: dict, Pg, vox: float, off_gland):
    """Each piece's condition (<= 0 inside, mm); returns (label, level) uint8 fields and a summary per piece."""
    air = solid < FIELD_ISO
    dA = ndimage.distance_transform_edt(~s_mask, sampling=vox)
    dL = ndimage.distance_transform_edt(~(nasal_l & air & ~s_mask), sampling=vox)
    dR = ndimage.distance_transform_edt(~(nasal_r & air & ~s_mask), sampling=vox)
    dN = np.minimum(dL, dR)
    x, y, z = Pg[..., 0], Pg[..., 1], Pg[..., 2]
    # bone (with half a mm round it) and the mucosa on its faces to the sinus and the nose
    tissue = np.minimum.reduce([signed(bone >= FIELD_ISO, vox) - 0.5, dA - PIECE_MUCOSA_MM, dN - PIECE_MUCOSA_MM])
    clear = np.maximum.reduce([PIECE_CLEAR_MM[k] - dist[k] for k in PIECE_CLEAR_MM])
    # the dura over the gland goes up to the gland itself
    clear_dura = np.maximum.reduce([PIECE_CLEAR_MM[k] - dist[k] for k in PIECE_CLEAR_MM if k != "sellar"])
    # the cavernous sinus's medial wall goes up to the carotid's wall, clear of the nerves, the gland and the brain
    clear_cs = np.maximum.reduce([0.0 - dist["vessel"], CS_KEEP_MM - dist["nerve"], CS_KEEP_MM - off_gland, PIECE_CLEAR_MM["brain"] - dist["brain"]])
    cs_cond = dict(np.load(CS_COND)) if CS_COND.exists() else {}
    # (and those against the dura keep the dura's thickness off the gland: the dura over the sella is a step of its own)
    base = np.maximum.reduce([tissue, clear, HYPO_DURA_MM - off_gland])
    front = float(Pg[s_mask & (np.abs(x) < 8)][:, 1].max()) if s_mask.any() else 25.0
    env = ndimage.binary_closing(s_mask, structure=ball(int(round(SEPTA_CLOSE_MM / vox))))
    cond = {
        # between the sinus and the nose, across the face of the sphenoid
        "face": [dA - 5.5, dN - 5.5, np.abs(x) - 10.0, (front - 7.0) - y],
        # inside the sinus's outline (its air closed over walls thinner than a few mm)
        "septa": [signed(env, vox) + 0.25, dA - 2.0],
        # between the sinus and the pituitary, between the carotids
        "floor": [dA - 3.0, dist["sellar"] - 3.5, np.abs(x) - 7.0],
        # the layer between the opened floor and the gland (the dura, with the CT's soft tissue there)
        "dura": [0.05 - off_gland, off_gland - (HYPO_DURA_MM + 0.4), dA - 4.5, np.abs(x) - 6.5],
        **{f"cs_{sd}": [np.minimum(cs_cond[sd].astype(np.float32),                        # its venous space, or
                                   np.maximum.reduce([dA - CS_FROM_SINUS_MM,                  # the wall between it and the sinus
                                                      ndimage.distance_transform_edt(cs_cond[sd] > 0, sampling=vox) - CS_NEAR_MM]))]
           for sd in ("R", "L") if sd in cs_cond},
        # above the front of the sella: the tuberculum, then the planum over the sinus
        "planum": [dA - 3.0, 7.0 - z, 2.0 - y, y - 16.0, np.abs(x) - 7.0],
        # behind and below the sella: the clival recess's bone
        "clivus": [dA - 5.0, y + 1.0, z - 2.0, np.abs(x) - 8.0],
    }
    shape = solid.shape
    best = np.full(shape, np.inf, np.float32)
    label = np.zeros(shape, np.uint8)
    earlier: list[np.ndarray] = []
    summary = []
    for i, (pid, name) in enumerate([p_ for p_ in PIECES if p_[0] in cond], start=1):
        own = base if pid in BONE_ONLY else clear_dura if pid == "dura" else clear_cs if pid.startswith("cs_") else clear
        c = np.maximum.reduce([own, *cond[pid], *[-e for e in earlier]]).astype(np.float32)
        inside = (c < 0) & ~air
        take = c < best
        near = take & (c < PIECE_REACH_MM)
        best[near] = c[near]
        label[near] = i
        earlier.append(c)
        pts = Pg[inside]
        summary.append({"id": pid, "name": name, "label": i, "mm3": round(float(inside.sum()) * vox ** 3, 1),
                        "boneMm3": round(float((inside & (bone >= FIELD_ISO)).sum()) * vox ** 3, 1),
                        "centre": pts.mean(0).round(1).tolist() if len(pts) else None})
        print(f"piece {pid}: {summary[-1]['mm3']} mm3 ({summary[-1]['boneMm3']} of bone), centre {summary[-1]['centre']}")
    level = np.where(label > 0, np.clip(np.round(128 + best / PIECE_STEP_MM), 0, 255), 255).astype(np.uint8)
    return label, level, summary


# v2's fitted structures v3 takes over (its pituitary is replaced by the one modelled in this CT's fossa: HYPO_*)
CARRIED = ["sb_anterior_intercavernous_sinus", "sb_posterior_intercavernous_sinus", "sb_optic_chiasm",
           # the veins joining the cavernous sinus (skullbase_v3_cavernous.py draws the sinus itself)
           "sb_superior_petrosal_sinus", "sb_inferior_petrosal_sinus", "sb_superior_ophthalmic_vein", "sb_inferior_ophthalmic_vein"]
REPLACED = ["sb_adenohypophysis", "sb_neurohypophysis", "sb_cavernous_sinus"]
CAV_ITEMS = V3_BUILD / "cavernous_items.json"   # skullbase_v3_cavernous.py's items (the sinus, the triangles, veins drawn)
HYPO_ITEMS = V3_BUILD / "hypophysis.json"     # the modelled pituitary's manifest items (skullbase_v3.py takes them too)

# ---- the hypophysis, modelled in this CT's fossa: what is not bone in it, HYPO_DURA_MM inside the bone (the dura, which
# the CT does not tell from the gland), under the diaphragma sellae (the plane from the tuberculum's back to the dorsum's
# top, found on the CT), its upper surface HYPO_CONCAVE_MM lower in the middle (concave, the commonest shape), at most
# HYPO_HALF_WIDTH_MM from the midline and HYPO_CAROTID_MM off the carotids (the cavernous sinuses' medial walls, which the
# CT does not show either). The posterior lobe is drawn by rule: an ellipsoid (HYPO_NEURO_RADII) at the back of the gland
# in the midline; the stalk too: a tube from the top of the gland where the lobes meet up and back to behind the chiasm.
HYPO_DURA_MM = 1.0
HYPO_HALF_WIDTH_MM = 6.2
HYPO_CAROTID_MM = 1.5
HYPO_CONCAVE_MM = 0.5
HYPO_SEED = (0.0, 0.0, 6.5)
HYPO_NEURO_RADII = (3.5, 2.8, 2.5)
HYPO_STALK_MM = (1.0, 1.4)       # its radius where it joins the gland, and at the hypothalamus
HYPO_STALK_RISE_MM = 5.0         # how far above the diaphragma it reaches, and how far back (mm)
HYPO_STALK_BACK_MM = 2.5


def build_hypophysis(bone, d_art, Pg, vox: float, a_crop) -> dict:
    """The pituitary in this CT's fossa (HYPO_*): its parts' conditions (mm, <= 0 inside), masks, meshes and a summary."""
    from skimage import measure
    x, y, z = Pg[..., 0], Pg[..., 1], Pg[..., 2]
    bm = bone >= FIELD_ISO
    mid = bm & (np.abs(x) < 1.5)
    # the dorsum's top: the highest bone behind the fossa; the tuberculum: the furthest back bone in front of it, above its floor
    dors = Pg[mid & (y > -10) & (y < -2) & (z > 3) & (z < 14)]
    dorsum = dors[np.argmax(dors[:, 2])]
    tub = Pg[mid & (y > 2) & (y < 10) & (z >= dorsum[2]) & (z < 14)]
    tuberculum = tub[np.lexsort((-tub[:, 2], tub[:, 1]))[0]]
    slope = (tuberculum[2] - dorsum[2]) / (tuberculum[1] - dorsum[1])
    top = dorsum[2] + (y - dorsum[1]) * slope - HYPO_CONCAVE_MM * np.clip(1 - (x / HYPO_HALF_WIDTH_MM) ** 2, 0, 1)
    off_bone = ndimage.distance_transform_edt(~bm, sampling=vox)
    # (in front of the dorsum and behind the tuberculum: round the dorsum's sides the plane would let it out behind)
    c = np.maximum.reduce([HYPO_DURA_MM - off_bone, z - top, np.abs(x) - HYPO_HALF_WIDTH_MM, HYPO_CAROTID_MM - d_art,
                           (dorsum[1] + HYPO_DURA_MM) - y, y - tuberculum[1], np.abs(z - 6.0) - 10.0]).astype(np.float32)
    lab, _ = ndimage.label(c <= 0)
    seed = tuple(np.round(nib.affines.apply_affine(np.linalg.inv(a_crop), HYPO_SEED)).astype(int))
    gland = lab == lab[seed]
    c = np.where(gland | (c > 0), c, np.float32(0.5))      # other pockets out
    gp = Pg[gland]
    y_back = float(gp[np.abs(gp[:, 0]) < 1.5][:, 1].min())
    floor_mid = float(gp[(np.abs(gp[:, 0]) < 1.5) & (np.abs(gp[:, 1] - (y_back + 2.5)) < 1)][:, 2].min())
    top_mid = float(gp[(np.abs(gp[:, 0]) < 1.5) & (np.abs(gp[:, 1] - (y_back + 2.5)) < 1)][:, 2].max())
    centre = np.array([0.0, y_back + HYPO_NEURO_RADII[1] - 0.2, (floor_mid + top_mid) / 2])
    ell = (np.sqrt((((Pg - centre) / np.array(HYPO_NEURO_RADII)) ** 2).sum(-1)) - 1) * min(HYPO_NEURO_RADII)
    neuro_c = np.maximum(c, ell)
    adeno_c = np.maximum(c, -ell)
    # the stalk: from the top of the gland where the lobes meet, up and back
    ins_y = centre[1] + HYPO_NEURO_RADII[1] * 0.6
    ins = np.array([0.0, ins_y, float(dorsum[2] + (ins_y - dorsum[1]) * slope) - HYPO_CONCAVE_MM - 0.5])
    tip = ins + np.array([0.0, -HYPO_STALK_BACK_MM, HYPO_STALK_RISE_MM + 0.5])
    ax = tip - ins
    t = np.clip(((Pg - ins) @ ax) / (ax @ ax), 0, 1)
    rad = HYPO_STALK_MM[0] + (HYPO_STALK_MM[1] - HYPO_STALK_MM[0]) * t
    stalk_c = (np.linalg.norm(Pg - (ins + t[..., None] * ax), axis=-1) - rad).astype(np.float32)
    parts = {}
    for pid, cc in (("adeno", adeno_c), ("neuro", neuro_c), ("stalk", stalk_c)):
        f = ndimage.gaussian_filter(cc, 0.6)
        idx = np.argwhere(f <= 0.5)
        lo_, hi_ = np.maximum(idx.min(0) - 3, 0), np.minimum(idx.max(0) + 4, np.array(f.shape))
        sub = f[lo_[0]:hi_[0], lo_[1]:hi_[1], lo_[2]:hi_[2]]
        v, tri, _, _ = measure.marching_cubes(sub, 0.0)
        v = nib.affines.apply_affine(a_crop, v + lo_)
        mesh = trimesh.Trimesh(v, tri[:, ::-1], process=True)
        trimesh.smoothing.filter_taubin(mesh, iterations=10)
        if mesh.volume < 0:   # (wound outward whichever way the crop's affine turns it)
            mesh.invert()
        parts[pid] = {"mask": cc <= 0, "cond": cc, "mesh": mesh, "mm3": round(float((cc <= 0).sum()) * vox ** 3, 1)}
    gx = Pg[gland]
    summary = {"diaphragma": {"tuberculum": tuberculum.round(1).tolist(), "dorsum": dorsum.round(1).tolist()},
               "gland": {"widthMm": round(float(np.ptp(gx[:, 0])) + vox, 1), "lengthMm": round(float(np.ptp(gx[np.abs(gx[:, 0]) < 1.5][:, 1])) + vox, 1),
                         "heightMm": round(float(top_mid - floor_mid) + vox, 1), "mm3": round(float(gland.sum()) * vox ** 3, 1)},
               "adenoMm3": parts["adeno"]["mm3"], "neuroMm3": parts["neuro"]["mm3"], "stalkMm3": parts["stalk"]["mm3"],
               "stalk": {"from": ins.round(1).tolist(), "to": tip.round(1).tolist()}}
    print("hypophysis", json.dumps(summary))
    return {"gland": gland, "parts": parts, "summary": summary}


def write_hypophysis(parts: dict, summary: dict) -> list[dict]:
    """The modelled pituitary's meshes (into v3's build, cut at the midline as v3's midline structures are) and its
    manifest items (HYPO_ITEMS)."""
    sys.path.insert(0, str(ROOT))
    import skullbase_build as SB
    from glb import TRIANGLES, write_glb
    import skullbase_v3 as V3
    g = summary["gland"]
    common = ("Modelled in this CT's pituitary fossa (Skull base v3's endonasal view, pipeline/skullbase_v3_endonasal.py): "
              f"what is not bone in it, {HYPO_DURA_MM} mm inside the bone (the dura, which the CT does not tell from the gland), "
              "under the diaphragma sellae taken as the plane from the tuberculum's back to the dorsum's top on this CT, its upper "
              f"surface {HYPO_CONCAVE_MM} mm lower in the middle, at most {HYPO_HALF_WIDTH_MM} mm from the midline and "
              f"{HYPO_CAROTID_MM} mm off the carotids (the cavernous sinuses' medial walls, which a CT does not show). The gland "
              f"so drawn measures {g['widthMm']} mm across, {g['lengthMm']} mm front to back and {g['heightMm']} mm high "
              f"({g['mm3']} mm³). ")
    spec = {
        "adeno": ("tb_adenohypophysis", "Adenohypophysis (anterior lobe)", ["Anterior pituitary", "Pars distalis"],
                  common + "The anterior lobe is the gland less the posterior lobe (drawn by rule).", False),
        "neuro": ("tb_neurohypophysis", "Neurohypophysis (posterior lobe)", ["Posterior pituitary", "Pars nervosa"],
                  common + "The posterior lobe is drawn by rule (no measured source here): an ellipsoid "
                  f"{2 * HYPO_NEURO_RADII[0]:g} × {2 * HYPO_NEURO_RADII[1]:g} × {2 * HYPO_NEURO_RADII[2]:g} mm at the back of the gland in the midline.", True),
        "stalk": ("tb_pituitary_stalk", "Pituitary stalk", ["Infundibulum", "Hypophyseal stalk"],
                  "Drawn by rule (no measured source here): a tube from the top of the gland modelled in this CT's fossa, where its lobes "
                  f"meet, {HYPO_STALK_RISE_MM:g} mm up and {HYPO_STALK_BACK_MM:g} mm back to behind the (fitted) optic chiasm, "
                  f"{2 * HYPO_STALK_MM[0]:g} mm thick at the gland and {2 * HYPO_STALK_MM[1]:g} mm above.", True),
    }
    items = []
    for pid, (sid, name, aliases, deriv, schematic) in spec.items():
        m = parts[pid]["mesh"]
        halves = SB.mesh_split(np.asarray(m.vertices), np.asarray(m.faces), np.ones(len(m.vertices)))
        nodes, cent = [], {}
        for side, (v, t, _) in sorted(halves.items()):
            nodes.append({"name": side, "positions": v, "normals": SB.normals(v, t), "indices": t, "mode": TRIANGLES})
            cent[side] = v.mean(0).round(2).tolist()
        write_glb(V3_BUILD / f"{sid}.glb", nodes, {"id": sid})
        items.append({"id": sid, "name": name, "aliases": aliases, "type": "soft", "file": f"assets/skullbase-v3/{sid}.glb", "bytes": 0,
                      "colour": V3.colour("sbSoft"), "dataset": "rule", "source": "Modelled on the TopBrain CT's pituitary fossa",
                      "licence": "GPL-3.0 (the project's own drawing, on the TopBrain CT)", "citation": [], "citationUrls": [], "refIds": [],
                      "category": "soft", **({"schematic": True} if schematic else {}),
                      "derivation": "Cut at the midline (x = 0) into left and right halves. " + deriv, "centroid": cent})
    HYPO_ITEMS.write_text(json.dumps(items, indent=1, ensure_ascii=False))
    return items


def carry_sellar() -> None:
    """The sellar structures Skull base v2 fits from Z-Anatomy (the pituitary, the cavernous and intercavernous sinuses,
    the optic chiasm) into v3's manifest, by reference to v2's meshes (as v3 takes v2's carotid); skullbase_v3.py carries
    them too when it is run again."""
    gen = REPO / "src" / "data" / "generated"
    v2 = {s["id"]: s for s in json.loads((gen / "sbct-manifest.json").read_text())["structures"]}
    p = gen / "sbv3-manifest.json"
    man = json.loads(p.read_text())
    man["structures"] = [s for s in man["structures"] if s["id"] not in REPLACED]
    have = {s["id"] for s in man["structures"]}
    for sid in CARRIED:
        if sid in v2 and sid not in have:
            man["structures"].append({**v2[sid]})
    hypo = (json.loads(HYPO_ITEMS.read_text()) if HYPO_ITEMS.exists() else []) + (json.loads(CAV_ITEMS.read_text()) if CAV_ITEMS.exists() else [])
    for it in hypo:     # (the compressed file's size where there is one already: finalize sets it again)
        f = REPO / "public" / it["file"]
        if f.exists():
            it["bytes"] = f.stat().st_size
    man["structures"] = [s for s in man["structures"] if s["id"] not in {h["id"] for h in hypo}] + hypo
    # the optic chiasm drawn by rule in place of the fitted block (skullbase_v3_chiasm.py), kept when this is run again
    import skullbase_v3_chiasm as CH
    man = CH.merge(man)
    # the tumours (skullbase_v3_tumours.py), kept when this is run again
    import skullbase_v3_tumours as TM
    if TM.TM_ITEMS.exists():
        tm = json.loads(TM.TM_ITEMS.read_text())
        ids = {t["id"] for t in tm}
        for it in tm:
            f = REPO / "public" / it["file"]
            if f.exists():
                it["bytes"] = f.stat().st_size
        man["structures"] = [s for s in man["structures"] if s["id"] not in ids] + tm
    # the nerves skullbase_v3_cavernous.py re-routed through the cavernous sinus say so
    import skullbase_v3_cavernous as CAV
    if CAV.CAV_JSON.exists():
        for it in man["structures"]:
            note = CAV.REROUTE_NOTE.get(it["name"])
            if note and note not in it["derivation"]:
                it["derivation"] = it["derivation"].rstrip() + " " + note
    p.write_text(json.dumps(man, indent=1, ensure_ascii=False))


def ct_grid(box=BOX) -> dict:
    """The grid over box (default BOX) (aligned with the model's frame, GRID_MM apart) and this CT's bone and TopBrain labels on it:
    shape, a_crop (grid -> frame), P (the frame points, flat), S (scanner RAS), bone (the field), lab (labels), the
    frame (R, fossa). Shared with skullbase_v3_cavernous.py."""
    bz = np.load(CT_BUILD / "bone.npz")
    b, a, lab = bz["b"].astype(np.float32), bz["a"], bz["lab"]
    fr = np.load(CT_BUILD / "frame.npz")
    R, fossa = fr["R"], fr["fossa"]
    # a frame point is (p - fossa) @ R for a scanner point p
    shape = tuple(int(round((h - l) / GRID_MM)) + 1 for l, h in box)
    a_crop = np.diag([GRID_MM, GRID_MM, GRID_MM, 1.0])
    a_crop[:3, 3] = [l for l, _ in box]
    P = nib.affines.apply_affine(a_crop, np.indices(shape).reshape(3, -1).T)
    S = P @ R.T + fossa                                  # scanner RAS
    # bone, as v2/v3 draw it (their smoothed mask, sampled)
    bone_s = ndimage.map_coordinates(ndimage.gaussian_filter(b, BONE_SIGMA_VOX), nib.affines.apply_affine(np.linalg.inv(a), S).T, order=1).reshape(shape)
    bone = np.clip(np.round(FIELD_ISO + (bone_s - BONE_LEVEL) * BONE_SCALE), 0, 255).astype(np.uint8)
    lab_s = ndimage.map_coordinates(lab, nib.affines.apply_affine(np.linalg.inv(a), S).T, order=0).reshape(shape)
    return {"shape": shape, "a_crop": a_crop, "P": P, "S": S, "bone": bone, "lab": lab_s, "R": R, "fossa": fossa}


def main() -> int:
    g = ct_grid()
    shape, a_crop, P, S, bone, lab_s, R, fossa = (g[k] for k in ("shape", "a_crop", "P", "S", "bone", "lab", "R", "fossa"))
    print("grid", shape, "voxels", int(np.prod(shape)))
    # ---- the CT (smoothed as the bone), sampled
    img = nib.load(CT_PATH)
    ct = np.asanyarray(img.dataobj).astype(np.float32)
    scan = nib.affines.apply_affine(np.linalg.inv(img.affine), S)
    inscan = np.all((scan >= 0) & (scan <= np.array(ct.shape) - 1), axis=1).reshape(shape)
    hu = ndimage.map_coordinates(ndimage.gaussian_filter(ct, BONE_SIGMA_VOX), scan.T, order=1, mode="nearest").reshape(shape)
    del ct
    solid = np.clip(np.round(FIELD_ISO + (hu - AIR_HU) / SOLID_HU_STEP), 0, 255).astype(np.uint8)
    solid = np.maximum(solid, bone)
    # holes in the thinnest walls (the CT's values dipping just under the level where a septum is thinner than a voxel
    # and runs across the grid) closed: a grey closing with a ball CLOSE_VOX across (gaps of air up to about a mm close
    # with them)
    ball = np.sum((np.indices((2 * CLOSE_VOX + 1,) * 3) - CLOSE_VOX) ** 2, axis=0) <= CLOSE_VOX ** 2
    closed = ndimage.grey_closing(solid, footprint=ball)
    print("pinholes closed:", int(((solid < FIELD_ISO) & (closed >= FIELD_ISO)).sum()), "voxels")
    solid = closed
    # beyond the scan: closed (nothing to see there), its edge smooth (closing the last mm in it)
    solid = np.maximum(solid, np.clip(np.round(FIELD_ISO + (1.0 - ndimage.distance_transform_edt(inscan, sampling=GRID_MM)) * CORRIDOR_RAMP), 0, 255).astype(np.uint8))
    print("outside the scan:", round(float((~inscan).mean()) * 100, 1), "% of the box")
    vox = GRID_MM

    # ---- distances to what the burr must not enter
    vessels = lab_s > 0
    d_art = ndimage.distance_transform_edt(~vessels, sampling=vox) if vessels.any() else np.full(shape, 99.0)

    def dist_to(pts: list[np.ndarray]) -> np.ndarray:
        pts = [p for p in pts if p is not None and len(p)]
        if not pts:
            return np.full(shape, 99.0)
        return cKDTree(np.vstack(pts)).query(P, distance_upper_bound=52.0)[0].reshape(shape)

    optic = []
    for side in ("left", "right"):     # TotalSegmentator's optic nerves, as points in the frame
        m = np.asanyarray(nib.load(TS / "head_glands_cavities" / f"optic_nerve_{side}.nii.gz").dataobj) > 0
        tsa = nib.load(TS / "head_glands_cavities" / f"optic_nerve_{side}.nii.gz").affine
        edge = m & ~ndimage.binary_erosion(m)
        optic.append((nib.affines.apply_affine(tsa, np.argwhere(edge)) - fossa) @ R)
    nerves = optic + [surface_points(CT_BUILD / "sb_optic_chiasm.glb")] + [surface_points(V3_BUILD / f"{n}.glb") for n in NERVES_V3]
    d_nerve = dist_to(nerves)
    def in_soft(pts: np.ndarray | None) -> np.ndarray | None:
        """A fitted structure's points where the CT shows soft tissue: those it puts in bone or in air (the fit is
        approximate: the pituitary's lower surface in the sellar floor, the neurohypophysis through it into the sinus)
        are left out, so that the burr can open the bone up to it."""
        if pts is None:
            return None
        q = np.clip(np.round(nib.affines.apply_affine(np.linalg.inv(a_crop), pts)).astype(int), 0, np.array(shape) - 1)
        keep = (bone[tuple(q.T)] < FIELD_ISO) & (solid[tuple(q.T)] >= FIELD_ISO)
        return pts[keep]

    hypo = build_hypophysis(bone, d_art, P.reshape(shape + (3,)), vox, a_crop)
    gland_pts = np.vstack([np.asarray(hypo["parts"][k]["mesh"].vertices) for k in ("adeno", "neuro")])
    # (not the cavernous sinus: the burr may go through its venous space down onto the carotid, an exercise in anatomy)
    d_sellar = dist_to([gland_pts] + [in_soft(surface_points(CT_BUILD / f"{n}.glb")) for n in SELLAR if n not in REPLACED])
    d_brain = dist_to([in_soft(surface_points(V3_BUILD / f"{n}.glb")) for n in BRAIN_V3])
    # ---- the scope's entry in each nostril: the middle of the nasal cavity in its front-most ENTRY_SLAB_MM in the scan
    entry = {}
    for sd, side in (("L", "left"), ("R", "right")):
        f = TS / "head_glands_cavities" / f"nasal_cavity_{side}.nii.gz"
        m = np.asanyarray(nib.load(f).dataobj) > 0
        pts = (nib.affines.apply_affine(nib.load(f).affine, np.argwhere(m)) - fossa) @ R
        front = pts[pts[:, 1] > pts[:, 1].max() - ENTRY_SLAB_MM]
        entry[sd] = np.median(front, 0).round(2).tolist()
    # ---- the sphenoid sinus: the air (not solid: the walls of the air cells count as bone even where the CT reads them as
    # air) joined to the point SINUS_SEED below the sella
    air = solid < FIELD_ISO
    core = ndimage.binary_erosion(air, iterations=SINUS_OPEN_VOX)     # openings (its ostium) up to about 1.5 mm closed
    cl, n = ndimage.label(core)
    Pg = P.reshape(shape + (3,))
    seed = np.round(nib.affines.apply_affine(np.linalg.inv(a_crop), SINUS_SEED)).astype(int)
    sinus = {}
    s_mask = np.zeros(shape, bool)
    k = int(cl[tuple(seed)])
    if k:
        s_mask = ndimage.binary_dilation(cl == k, iterations=SINUS_OPEN_VOX) & air
        sp = Pg[s_mask]
        sinus = {"seed": list(SINUS_SEED), "centre": sp.mean(0).round(2).tolist(), "volumeMl": round(float(s_mask.sum()) * vox ** 3 / 1000, 2),
                 "lo": sp.min(0).round(1).tolist(), "hi": sp.max(0).round(1).tolist(),
                 # how far back under the sella its air reaches (the fossa at y = 0): sellar pneumatisation if behind it
                 "backMm": round(float(sp[:, 1].min()), 1),
                 # whether it opens into the nasal cavity in this CT (its air joined to the entries')
                 "opensToNose": any(label_at(cl, a_crop, entry[sd]) == k for sd in entry)}
    # ---- the scope's corridor through each side of the nose (see CORRIDOR_*), then opened in the bone and the lining
    clr = ndimage.distance_transform_edt(air, sampling=vox)
    to_sinus = ndimage.distance_transform_edt(~s_mask, sampling=vox) if sinus else np.full(shape, 99.0)
    corridor = {}
    nasal_side = {}
    for sd, side in (("L", "left"), ("R", "right")):
        f = TS / "head_glands_cavities" / f"nasal_cavity_{side}.nii.gz"
        im = nib.load(f)
        nasal = ndimage.map_coordinates((np.asanyarray(im.dataobj) > 0).astype(np.uint8), nib.affines.apply_affine(np.linalg.inv(im.affine), S).T, order=0).reshape(shape) > 0
        nasal_side[sd] = nasal
        nasal = ndimage.binary_dilation(nasal, iterations=NASAL_PAD_VOX)
        cost = np.where(air, 1 + 30 * np.clip(CORRIDOR_ROOM_MM - clr, 0, None), np.where(bone >= FIELD_ISO, 300.0, 60.0))
        cost[~(nasal | s_mask)] = np.inf
        start = tuple(np.round(nib.affines.apply_affine(np.linalg.inv(a_crop), entry[sd])).astype(int))
        mcp = MCP_Geometric(cost)
        mcp.find_costs([start], [tuple(seed)])
        path = np.array(mcp.traceback(tuple(seed)))
        inside = s_mask[tuple(path.T)]
        first = int(np.argmax(inside))
        recess = max(i for i in range(first) if air[tuple(path[i])])
        C = smooth(resample(Pg[tuple(path[:recess + 1].T)], 0.5), int(CORRIDOR_SMOOTH_MM / 0.5))
        C = resample(C, 1.0)
        length = float(np.sum(np.linalg.norm(np.diff(C, axis=0), axis=1)))
        opened = resample(C, 0.25)
        opened = opened[np.r_[0, np.cumsum(np.linalg.norm(np.diff(opened, axis=0), axis=1))] <= length - CORRIDOR_SHORT_MM]
        dd = cKDTree(opened).query(P, distance_upper_bound=CORRIDOR_MM)[0].reshape(shape)
        # the opened tube's wall, and its limits (inside the nasal cavity, off the sinus's front wall), all as levels a
        # mm apart (so the cut's surface is smooth where it meets them): the field is lowered to the highest of them
        inside_nasal = ndimage.distance_transform_edt(nasal, sampling=vox) - ndimage.distance_transform_edt(~nasal, sampling=vox)
        level = np.maximum.reduce([(dd - CORRIDOR_MM / 2), (0.5 - inside_nasal), (CORRIDOR_FACE_MM - to_sinus)])
        wall = np.clip(np.round(FIELD_ISO + level * CORRIDOR_RAMP), 0, 255).astype(np.uint8)
        open_ = dd < CORRIDOR_MM
        before = int(((solid >= FIELD_ISO) & open_ & (wall < FIELD_ISO)).sum())
        bone[open_] = np.minimum(bone[open_], wall[open_])
        solid[open_] = np.minimum(solid[open_], wall[open_])
        corridor[sd] = {"points": C.round(2).tolist(), "lengthMm": round(length, 1), "openedMm": round(length - CORRIDOR_SHORT_MM, 1),
                        "recess": C[-1].round(2).tolist(),
                        "openedMm3": round(before * vox ** 3, 1)}
        print(sd, "corridor", round(length, 1), "mm, to", C[-1].round(1), "opened", round(before * vox ** 3), "mm3")
    # ---- the pieces taken away step by step (PIECES)
    off_gland = signed(hypo["gland"], vox)      # (negative inside it)
    piece, piece_level, pieces = build_pieces(bone, solid, s_mask, nasal_side["L"], nasal_side["R"],
                                              {"vessel": d_art, "nerve": d_nerve, "sellar": d_sellar, "brain": d_brain}, Pg, vox, off_gland)
    # the gland's parts where the lining may show them (1 anterior lobe, 2 posterior lobe, 3 stalk)
    gland_label = np.zeros(shape, np.uint8)
    for i_, k_ in ((3, "stalk"), (1, "adeno"), (2, "neuro")):
        gland_label[hypo["parts"][k_]["cond"] <= 0.2] = i_     # (its surface: the dura, half a mm off, is not it)
    write_hypophysis(hypo["parts"], hypo["summary"])
    # the CT only near the surfaces (where it colours them, the corridor's too): the rest stored empty, so the file stays small
    near = ndimage.binary_dilation(((solid > 64) & (solid < 192)) | ((bone > 64) & (bone < 192)), iterations=DENSITY_REACH_VOX)
    density = np.clip(np.round((hu - DENSITY_MIN_HU) / DENSITY_STEP_HU), 0, 255).astype(np.uint8)
    density[~inscan | ~near] = 0
    fields = [bone, solid, density, u8_dist(d_art), u8_dist(d_nerve), u8_dist(d_sellar), u8_dist(d_brain), piece, piece_level, gland_label]
    OUT_BIN.parent.mkdir(parents=True, exist_ok=True)
    data = gzip.compress(b"".join(np.ascontiguousarray(f).tobytes() for f in fields), 9, mtime=0)
    OUT_BIN.write_bytes(data)
    print("written", OUT_BIN.name, f"{len(data) / 1e6:.2f} MB")

    # ---- the distance between the carotids, by height through the sella (their lumens within 6 mm front to back of it)
    vv = Pg[vessels]
    icd = []
    for z in range(-10, 16, 2):
        sl = vv[(np.abs(vv[:, 2] - z) < 1.0) & (np.abs(vv[:, 1]) < 6) & (np.abs(vv[:, 0]) < 22)]
        l, r = sl[sl[:, 0] < -3], sl[sl[:, 0] > 3]
        if len(l) and len(r):
            icd.append({"z": z, "mm": round(float(cKDTree(l).query(r)[0].min()), 1)})
    out = {"params": {"fieldIso": FIELD_ISO, "boneLevel": BONE_LEVEL, "boneScale": BONE_SCALE, "airHu": AIR_HU, "solidHuStep": SOLID_HU_STEP,
                      "densityMinHu": DENSITY_MIN_HU, "densityStepHu": DENSITY_STEP_HU, "distStepMm": DIST_STEP_MM,
                      "pieceStepMm": PIECE_STEP_MM, "pieceClearMm": PIECE_CLEAR_MM,
                      "fields": ["bone", "solid", "density", "vessel", "nerve", "sellar", "brain", "piece", "pieceLevel", "gland"]},
           "file": "assets/skullbase-v3/endonasal.bin.gz", "bytes": len(data), "dims": list(shape), "affine": np.round(a_crop, 5).tolist(),
           "box": [list(b_) for b_ in BOX], "entry": entry, "corridor": corridor, "corridorMm": CORRIDOR_MM,
           "sinus": sinus, "intercarotid": icd, "pieces": pieces, "hypophysis": hypo["summary"]}
    OUT_JSON.write_text(json.dumps(out, indent=1))
    carry_sellar()
    # the last of v3's steps to write its manifest: then its arteries kept out of the brainstem, and its vessels joined
    # where their sources stop short of one another (the confluence of the sinuses drawn)
    import skullbase_v3_clearance as CLEAR
    import skullbase_v3_junctions as JUNC
    CLEAR.main()
    JUNC.main()
    print(json.dumps({k: out[k] for k in ("entry", "sinus", "intercarotid")}, indent=0)[:1500])
    return 0


if __name__ == "__main__":
    sys.exit(main())
