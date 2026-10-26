"""The spine section's drilling volumes: for each pair of adjacent cervical vertebrae, the bone as a field the browser
can cut away with a burr (a posterior foraminotomy drills both: the lower lamina and inferior articular process of the
one above, the superior articular process of the one below).

For each pair, on the CT's own grid (0.72 x 0.72 x 0.7 mm), cropped to the two vertebrae and a margin:
  * each vertebra's bone field: the volume spine_build.py takes the vertebra's surface from (the CT within the
    vertebra's hand-corrected mask, its core held above BONE_HU, smoothed as there), stored as uint8 around BONE_HU
    (FIELD_ISO at BONE_HU, FIELD_HU_STEP HU per unit): its FIELD_ISO surface is the drawn vertebra's. The two are
    kept apart (a pair can later be distracted for an anterior discectomy);
  * the CT itself (smoothed as the bone field), uint8 from DENSITY_MIN_HU in DENSITY_STEP_HU steps: the cut surface is
    coloured by it (cortex against cancellous bone);
  * the distance (mm, uint8 in DIST_STEP_MM steps; the CT and the distances only within REACH_VOX of the bone) from each voxel to the dural sac (TotalSegmentator's segmentation of
    this CT), to the nerve roots and to the vertebral arteries (both schematic: spine_build.py's tubes).
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

PAIRS = [("C2", "C3"), ("C3", "C4"), ("C4", "C5"), ("C5", "C6"), ("C6", "C7"), ("C7", "T1")]
MARGIN_VOX = 8            # the crop round the two vertebrae (as spine_build.py's)
FIELD_ISO = 128           # the bone field's surface value (at BONE_HU) ...
FIELD_HU_STEP = 4.0       # ... and its HU per unit (BONE_HU +- 512 HU)
DENSITY_MIN_HU, DENSITY_STEP_HU = -200.0, 7.0   # the CT: -200 to 1585 HU
DIST_STEP_MM = 0.2        # distances to the structures at risk, to 51 mm
STRUCTURE_REACH_MM = 4.0  # ... and the distances also within this of each structure
REACH_VOX = 3             # the CT and the distances are kept only within this of the bone (where a burr can be): the
                          # rest is stored empty, so the files stay small
SURFACE_SAMPLE_MM = 0.25  # the schematic tubes' surfaces sampled this densely for their distances
CHECK_MEDIAN_MM, CHECK_P95_MM = 0.25, 0.8   # the field's surface against the drawn vertebra (decimated and smoothed)
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


def main() -> int:
    m_full, aff = B.load_mask()
    boxes = ndimage.find_objects(m_full)
    o = B.origin()
    vox = np.abs(np.diag(aff)[:3])
    roots = [p for p in (glb_points(f"sp_root_c{i}") for i in range(3, 9)) if p is not None]
    root_tree = cKDTree(np.vstack(roots)) if roots else None
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
        for tree in (root_tree, va_tree):
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
        root = f"sp_root_{'c8' if lo_ == 'T1' else lo_.lower()}"
        out["pairs"].append({"id": pid, "upper": B.level_id(up), "lower": B.level_id(lo_), "disc": f"sp_disc_{up.lower()}_{lo_.lower()}",
                             "root": root, "file": f"assets/spine/{name}", "bytes": len(data), "dims": list(m.shape),
                             "affine": np.round(a, 5).tolist(), "check": checks})
        print(pid, m.shape, f"{len(data) / 1024:.0f} KB", checks, flush=True)
    OUT.write_text(json.dumps(out, indent=1))
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
