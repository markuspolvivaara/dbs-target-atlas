"""The spine section's drilling volumes: for each pair of adjacent cervical and lumbar vertebrae, the bone as a field the
browser can cut away with a burr (a posterior foraminotomy drills both: the lower lamina and inferior articular process
of the one above, the superior articular process of the one below; a cervical laminectomy only the upper one).

For each pair, on the CT's own grid (0.72 x 0.72 x 0.7 mm), cropped to the two vertebrae and a margin:
  * each vertebra's bone field: the volume spine_build.py takes the vertebra's surface from (the CT within the
    vertebra's hand-corrected mask, its core held above BONE_HU, smoothed as there), stored as uint8 around BONE_HU
    (FIELD_ISO at BONE_HU, FIELD_HU_STEP HU per unit): its FIELD_ISO surface is the drawn vertebra's. The two are
    kept apart (a pair can later be distracted for an anterior discectomy);
  * the CT itself (smoothed as the bone field), uint8 from DENSITY_MIN_HU in DENSITY_STEP_HU steps: the cut surface is
    coloured by it (cortex against cancellous bone);
  * the distance (mm, uint8 in DIST_STEP_MM steps; the CT and the distances only within REACH_VOX of the bone) from each voxel to the dural sac (TotalSegmentator's segmentation of
    this CT), to the nerve roots and to the vertebral arteries (both schematic: spine_build.py's tubes; lumbar: no
    artery, the field left far).
Each vertebra also gets landmarks (spine frame, mm): its body centre (the bone still attached to it is what the flood
from there reaches) and its own axes, and its spinous process: the midline through it, its tip, and its base, put
SPINOUS_BASE of the way from the canal's back wall to the tip (a drawing choice: where a rongeur or an osteotome takes
it off the laminae); the browser takes the spinous process as the bone joined to its tip behind that base.
Writes public/assets/spine/drill_<pair>.bin.gz (the six fields one after another, C order) and
src/data/generated/spine-drill.json. Run after spine_build.py (it reads the roots' and arteries' meshes).
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
from skimage import measure

sys.path.insert(0, str(Path(__file__).resolve().parent))
import spine_build as B  # noqa: E402

PAIRS = [("C2", "C3"), ("C3", "C4"), ("C4", "C5"), ("C5", "C6"), ("C6", "C7"), ("C7", "T1"),
         ("L1", "L2"), ("L2", "L3"), ("L3", "L4"), ("L4", "L5")]   # (L5-S1: the sacrum is drawn from another segmentation)
SPINOUS_BASE = 0.22       # the spinous process's base: this share of the way from the canal's back wall to its tip
MIDLINE_MM = 1.5          # the midline strip (each side) the canal's back wall and the tip are found in
BIN_MM = 0.5
MARGIN_VOX = 8            # the crop round the two vertebrae (as spine_build.py's)
FIELD_ISO = 128           # the bone field's surface value (at BONE_HU) ...
FIELD_HU_STEP = 4.0       # ... and its HU per unit (BONE_HU +- 512 HU)
DENSITY_MIN_HU, DENSITY_STEP_HU = -200.0, 7.0   # the CT: -200 to 1585 HU
DIST_STEP_MM = 0.2        # distances to the structures at risk, to 51 mm
STRUCTURE_REACH_MM = 4.0  # ... and the distances also within this of each structure
REACH_VOX = 3             # the CT and the distances are kept only within this of the bone (where a burr can be): the
                          # rest is stored empty, so the files stay small
SURFACE_SAMPLE_MM = 0.25  # the schematic tubes' surfaces sampled this densely for their distances
CHECK_MEDIAN_MM, CHECK_P95_MM = 0.3, 0.8    # the field's surface against the drawn vertebra (decimated and smoothed: the lumbar
                                            # ones, larger for their triangles, lie a little further)
OUT = B.GEN / "spine-drill.json"


def label_of(name: str) -> int:
    return next(k for k, v in B.VERSE_LEVELS.items() if v == name)


def glb_points(sid: str) -> np.ndarray | None:
    """Points on a built structure's surface (spine frame: RAS mm about the origin), SURFACE_SAMPLE_MM apart."""
    f = B.BUILD / f"{sid}.glb"
    if not f.exists():
        return None
    m = trimesh.util.concatenate(list(trimesh.load(f, force="scene").dump()))
    n = max(int(m.area / SURFACE_SAMPLE_MM ** 2), 1000)
    pts, _ = trimesh.sample.sample_surface_even(m, n, seed=1)
    return np.vstack([pts, m.vertices])


def u8_dist(d: np.ndarray) -> np.ndarray:
    return np.clip(np.round(d / DIST_STEP_MM), 0, 255).astype(np.uint8)


def landmarks(m_full: np.ndarray, aff: np.ndarray, ctd: dict, name: str, o: np.ndarray) -> dict:
    """A vertebra's body centre, axes (lateral, anterior, up: towards the vertebra above) and spinous process (spine frame)."""
    lab = label_of(name)
    c = ctd[lab]
    F = B.G.frame(ctd.get(lab - 1, c), ctd.get(lab + 1, c))   # (one of the two neighbours is enough)
    P = nib.affines.apply_affine(aff, np.argwhere(m_full == lab)) - c
    U, V = P @ F[0], P @ F[1]
    # along the midline strip, backwards from the body: its back edge, the gap of the canal, then the arch to the tip
    mid = np.abs(U) < MIDLINE_MM
    occ = np.zeros(200, bool)
    k = np.floor(-V[mid & (V < 0)] / BIN_MM).astype(int)
    occ[k[k < 200]] = True
    gap = int(np.argmax(~occ))                       # first empty bin behind the body
    wall = gap + int(np.argmax(occ[gap:]))           # the canal's back wall (the arch's front at the midline)
    tip = 199 - int(np.argmax(occ[::-1]))
    v_wall, v_tip = -wall * BIN_MM, -(tip + 1) * BIN_MM
    v_base = v_wall + SPINOUS_BASE * (v_tip - v_wall)
    u_c = float(np.median(U[(V < (v_base + v_tip) / 2) & (np.abs(U) < 10)]))   # its midline, from its back half
    pt = lambda u, v: (c + u * F[0] + v * F[1] - o).round(2).tolist()
    return {"body": (c - o).round(2).tolist(), "axes": np.round(F, 5).tolist(),
            "spinous": {"base": pt(u_c, v_base), "tip": pt(u_c, v_tip), "wall": pt(u_c, v_wall)}}


def main() -> int:
    m_full, aff = B.load_mask()
    boxes = ndimage.find_objects(m_full)
    o = B.origin()
    vox = np.abs(np.diag(aff)[:3])
    ctd = {c["label"]: nib.affines.apply_affine(aff, [c["X"], c["Y"], c["Z"]]) for c in json.loads(B.CTD.read_text()) if "label" in c}
    trees = {}
    for region, ids in (("cervical", [f"sp_root_c{i}" for i in range(3, 9)]), ("lumbar", [f"sp_root_l{i}" for i in range(1, 6)] + ["sp_root_s1"])):
        pts = [p for p in (glb_points(x) for x in ids) if p is not None]
        trees[region] = cKDTree(np.vstack(pts)) if pts else None
    va = glb_points("sp_vertebral_artery")
    va_tree = cKDTree(va) if va is not None else None
    out = {"params": {"fieldIso": FIELD_ISO, "fieldHuStep": FIELD_HU_STEP, "boneHu": B.BONE_HU, "densityMinHu": DENSITY_MIN_HU,
                      "densityStepHu": DENSITY_STEP_HU, "distStepMm": DIST_STEP_MM,
                      "fields": ["upper", "lower", "density", "dura", "root", "artery"]},
           "pairs": []}
    fails = []
    for up, lo_ in PAIRS:
        lu, ll = label_of(up), label_of(lo_)
        if boxes[lu - 1] is None or boxes[ll - 1] is None:
            fails.append(f"{up}-{lo_}: missing in the mask")
            continue
        cr = tuple(slice(max(min(boxes[lu - 1][k].start, boxes[ll - 1][k].start) - MARGIN_VOX, 0),
                         min(max(boxes[lu - 1][k].stop, boxes[ll - 1][k].stop) + MARGIN_VOX, m_full.shape[k])) for k in range(3))
        m = m_full[cr]
        ct = B.read_block(B.CT, cr, np.float32)
        a = B.block_affine(aff, cr)
        a[:3, 3] -= o                                   # the spine frame
        fields = []
        for lab in (lu, ll):
            vol = ndimage.gaussian_filter(B.bone_volume(ct, m == lab, float(vox.mean())), B.SIGMA_VOX)
            fields.append(np.clip(np.round(FIELD_ISO + (vol - B.BONE_HU) / FIELD_HU_STEP), 0, 255).astype(np.uint8))
        dens = ndimage.gaussian_filter(ct, B.SIGMA_VOX)
        fields.append(np.clip(np.round((dens - DENSITY_MIN_HU) / DENSITY_STEP_HU), 0, 255).astype(np.uint8))
        # distances: the dural sac from its segmentation, the schematic tubes from their surfaces
        sac, _ = B.ts_mask("total", "spinal_cord", cr)
        fields.append(u8_dist(ndimage.distance_transform_edt(~sac, sampling=vox) if sac.any() else np.full(m.shape, 99.0)))
        ijk = np.indices(m.shape).reshape(3, -1).T
        P = nib.affines.apply_affine(a, ijk)
        region = "lumbar" if up.startswith("L") else "cervical"
        for tree in (trees[region], va_tree if region == "cervical" else None):
            fields.append(u8_dist(tree.query(P, distance_upper_bound=52.0)[0].reshape(m.shape)) if tree is not None
                          else np.full(m.shape, 255, np.uint8))
        fields[3:] = [np.asarray(f) for f in fields[3:]]
        # only where a burr can be: the bone and a few voxels round it (the CT); the distances there and near the
        # structures themselves (the burr is stopped at them: it does not drill past the dural sac to the bone behind)
        near = ndimage.binary_dilation((fields[0] > 0) | (fields[1] > 0), iterations=REACH_VOX)
        fields[2][~near] = 0
        near_s = near | np.any(np.stack([f < STRUCTURE_REACH_MM / DIST_STEP_MM for f in fields[3:]]), 0)
        for f in fields[3:]:
            f[~near_s] = 255
        # check: each vertebra's field surface against the drawn vertebra
        checks = {}
        for name, f in zip((up, lo_), fields[:2]):
            v, _, _, _ = measure.marching_cubes(f.astype(np.float32), FIELD_ISO - 0.5)
            surf = cKDTree(nib.affines.apply_affine(a, v))
            drawn = trimesh.util.concatenate(list(trimesh.load(B.BUILD / f"{B.level_id(name)}.glb", force="scene").dump()))
            d = surf.query(drawn.vertices)[0]
            checks[name] = {"medianMm": round(float(np.median(d)), 3), "p95Mm": round(float(np.percentile(d, 95)), 3)}
            if checks[name]["medianMm"] > CHECK_MEDIAN_MM or checks[name]["p95Mm"] > CHECK_P95_MM:
                fails.append(f"{up}-{lo_} {name}: field surface {checks[name]} from the drawn vertebra")
        pid = f"{up}-{lo_}"
        name = f"drill_{up.lower()}_{lo_.lower()}.bin.gz"
        data = gzip.compress(b"".join(np.ascontiguousarray(x).tobytes() for x in fields), 9, mtime=0)
        (B.PUBLIC / "spine" / name).write_bytes(data)
        # the root named for the lower level: cervical, the one exiting here; lumbar, the one traversing (to the next foramen)
        root = f"sp_root_{'c8' if lo_ == 'T1' else lo_.lower()}"
        out["pairs"].append({"id": pid, "region": region, "upper": B.level_id(up), "lower": B.level_id(lo_), "disc": f"sp_disc_{up.lower()}_{lo_.lower()}",
                             "root": root, "artery": region == "cervical", "file": f"assets/spine/{name}", "bytes": len(data), "dims": list(m.shape),
                             "affine": np.round(a, 5).tolist(), "check": checks,
                             "landmarks": [landmarks(m_full, aff, ctd, x, o) for x in (up, lo_)]})
        print(pid, m.shape, f"{len(data) / 1024:.0f} KB", checks, flush=True)
    OUT.write_text(json.dumps(out, indent=1))
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
