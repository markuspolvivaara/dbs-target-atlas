"""Build the spine section's web assets from one whole-spine CT (VerSe sub-verse823, CC BY-SA 4.0).

Inputs
  pipeline/data/raw/verse/sub-verse823/   CT (0.72 x 0.72 x 0.7 mm), hand-corrected vertebra masks C1-L5, centroids
  pipeline/data/build/spine/ts/           TotalSegmentator segmentations of that CT (pipeline/spine_segment.py)
Writes
  pipeline/data/build/spine/*.glb         one GLB per structure (nodes L / R, or one node for midline structures)
  src/data/generated/spine-manifest.json  structures
  src/data/generated/spine-levels.json    vertebral levels with measured facts

Space: RAS millimetres of the CT, moved so the origin is the centre of the L5 vertebral body (VerSe's centroid). One
subject, not MNI, and not registered to the other sections.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from build import isosurface  # noqa: E402
from glb import write_glb  # noqa: E402
import spine_geom as G  # noqa: E402

REPO = ROOT.parent
RAW = ROOT / "data" / "raw" / "verse" / "sub-verse823"
TS = ROOT / "data" / "build" / "spine" / "ts"
BUILD = ROOT / "data" / "build" / "spine"
GEN = REPO / "src" / "data" / "generated"
PUBLIC = REPO / "public" / "assets"
CT = RAW / "sub-verse823_dir-iso_ct.nii.gz"
MASK = RAW / "sub-verse823_dir-iso_seg-vert_msk.nii.gz"
CTD = RAW / "sub-verse823_dir-iso_seg-subreg_ctd.json"

# VerSe labels: 1-7 C1-C7, 8-19 T1-T12, 20-25 L1-L6, 28 T13
VERSE_LEVELS = {**{i: f"C{i}" for i in range(1, 8)}, **{i + 7: f"T{i}" for i in range(1, 13)},
                **{i + 19: f"L{i}" for i in range(1, 7)}, 28: "T13"}
REGION = {"C": "cervical", "T": "thoracic", "L": "lumbar", "S": "lumbar"}
# triangles per vertebra after decimation: smaller vertebrae need fewer
FACES = {"C": 9000, "T": 11000, "L": 14000}
SIGMA_VOX = 0.9   # Gaussian smoothing (voxels) of the volume the surface is taken from
BONE_HU = 200     # the bone surface: where the CT crosses this value (cortex), within reach of the vertebra's mask
MASK_REACH_MM = 2.0  # the CT surface may lie up to this far outside the hand-corrected mask (its boundary steps)
# Ambient occlusion of the vertebrae, baked into vertex colours so recesses read as recesses and faces turned from
# the light do not look cut: the share of bone (any vertebra) around each surface point, from the labels blurred
# with AO_SIGMA_MM and sampled AO_OFFSET_MM out along the normal; AO_OPEN maps to full colour, AO_SHUT to AO_FLOOR.
AO_SIGMA_MM, AO_OFFSET_MM, AO_OPEN, AO_SHUT, AO_FLOOR = 3.0, 1.5, 0.35, 0.80, 0.5


def halves(mesh, x0: float = 0.0, colors: np.ndarray | None = None) -> list[dict]:
    """Left / right nodes, split by triangle centroid at the sagittal plane x = x0, so the viewer's side toggle
    works. Vertebrae are split at their own centroid: this spine is not straight in the scan."""
    v, t, n = mesh.vertices, mesh.faces, mesh.vertex_normals
    cx = v[t].mean(axis=1)[:, 0] - x0
    out = []
    for side, sel in (("L", cx < 0), ("R", cx >= 0)):
        tt = t[sel]
        if not len(tt):
            continue
        used, inv = np.unique(tt, return_inverse=True)
        out.append({"name": side, "positions": v[used], "normals": n[used], "indices": inv.reshape(-1, 3), "mode": 4,
                    **({"colors": colors[used]} if colors is not None else {})})
    return out


def level_id(name: str) -> str:
    return "sp_" + name.lower()


def load_mask(cr: tuple | None = None) -> tuple[np.ndarray, np.ndarray]:
    """VerSe's vertebra labels; with `cr` (index slices) only that block, its affine shifted to match."""
    img = nib.load(MASK)
    if cr is None:
        return np.asanyarray(img.dataobj).astype(np.uint8), img.affine
    return read_block(MASK, cr, np.uint8), block_affine(img.affine, cr)


def read_block(path: Path, cr: tuple, dtype=None, chunk: int = 48) -> np.ndarray:
    """A block of a NIfTI volume, read a few slices at a time: slicing a gzipped file reads whole slices, and this
    CT is stored as float64 (2.5 GB whole)."""
    img = nib.load(path)
    zs = range(cr[2].start or 0, cr[2].stop if cr[2].stop is not None else img.shape[2], chunk)
    parts = []
    for z0 in zs:
        z1 = min(z0 + chunk, cr[2].stop if cr[2].stop is not None else img.shape[2])
        a = np.asanyarray(img.dataobj[cr[0], cr[1], z0:z1])
        parts.append(a.astype(dtype) if dtype is not None else a)
    return np.concatenate(parts, axis=2)


def block_affine(aff: np.ndarray, cr: tuple) -> np.ndarray:
    a = aff.copy()
    a[:3, 3] = nib.affines.apply_affine(aff, [sl.start for sl in cr])
    return a


def origin() -> np.ndarray:
    """RAS position of the centre of the L5 vertebral body (VerSe centroid file, voxel coordinates in the CT grid)."""
    img = nib.load(MASK)
    ctd = json.loads(CTD.read_text())
    l5 = next(c for c in ctd if c.get("label") == 24)
    return nib.affines.apply_affine(img.affine, [l5["X"], l5["Y"], l5["Z"]])


def bone_volume(ct: np.ndarray, sel: np.ndarray, vox_mm: float) -> np.ndarray:
    """Volume whose BONE_HU isosurface is the vertebra: the CT inside the mask dilated by MASK_REACH_MM, with the
    mask's eroded core held above the threshold (cancellous bone can be darker than BONE_HU) and everything
    outside the dilated mask held below it (neighbouring vertebrae, ribs)."""
    reach = max(1, int(round(MASK_REACH_MM / vox_mm)))
    near = ndimage.binary_dilation(sel, iterations=reach)
    core = ndimage.binary_erosion(sel, iterations=reach)
    vol = np.where(near, ct, -1000.0).astype(np.float32)
    vol[core] = np.maximum(vol[core], BONE_HU + 400)
    return vol


def vertebrae(report: dict) -> list[dict]:
    m_full, aff = load_mask()
    # the CT is stored as float64 (2.5 GB whole): read only the block around the labelled vertebrae, as float32
    boxes = ndimage.find_objects(m_full)
    labels = [i + 1 for i, b in enumerate(boxes) if b is not None]
    span = tuple(slice(max(min(boxes[l - 1][k].start for l in labels) - 8, 0), max(boxes[l - 1][k].stop for l in labels) + 8)
                 for k in range(3))
    m = m_full[span]
    del m_full
    ct = read_block(CT, span, np.float32)
    aff = block_affine(aff, span)
    vox = float(np.mean(np.abs(np.diag(aff)[:3])))
    o = origin()
    aff_o = aff.copy()
    aff_o[:3, 3] -= o
    items = []
    meshes = {}
    for lab in labels:
        name = VERSE_LEVELS[lab]
        # crop to the vertebra (plus a margin) so the smoothing and marching cubes stay cheap
        box = [slice(bx.start - sp.start, bx.stop - sp.start) for bx, sp in zip(boxes[lab - 1], span)]
        lo = np.maximum([b.start - 8 for b in box], 0)
        hi = np.minimum([b.stop + 8 for b in box], m.shape)
        crop = (slice(lo[0], hi[0]), slice(lo[1], hi[1]), slice(lo[2], hi[2]))
        sel = m[crop] == lab
        sub = bone_volume(ct[crop], sel, vox)
        a2 = aff_o.copy()
        a2[:3, 3] = nib.affines.apply_affine(aff_o, lo)
        mesh = isosurface(sub, a2, BONE_HU, SIGMA_VOX, FACES[name[0]])
        sid = level_id(name)
        c = mesh.centroid
        meshes[sid] = mesh
        items.append({"id": sid, "name": name, "region": REGION[name[0]], "faces": int(len(mesh.faces)),
                      "centroid": c.round(2).tolist(), "volumeMl": round(float(sel.sum() * abs(np.linalg.det(aff[:3, :3]))) / 1000, 1)})
        report[sid] = items[-1]
        print(f"{name:4s} faces {len(mesh.faces):6d} centroid {c.round(1)}")
    occ = ndimage.gaussian_filter((m > 0).astype(np.float32), AO_SIGMA_MM / vox)
    inv_o = np.linalg.inv(aff_o)
    for sid, mesh in meshes.items():
        q = nib.affines.apply_affine(inv_o, mesh.vertices + AO_OFFSET_MM * mesh.vertex_normals).T
        around = ndimage.map_coordinates(occ, q, order=1, mode="nearest")
        shade = np.clip((AO_SHUT - around) / (AO_SHUT - AO_OPEN), 0, 1)
        colors = np.repeat((AO_FLOOR + (1 - AO_FLOOR) * shade)[:, None], 3, axis=1)
        write_glb(BUILD / f"{sid}.glb", halves(mesh, float(mesh.centroid[0]), colors), {"id": sid})
        report[sid]["aoPercentiles"] = np.percentile(around, [5, 50, 95]).round(3).tolist()
    return items


# TotalSegmentator classes used, by task: (structure id, name, palette token, layer, category, faces, split at midline)
TS_STRUCTURES = [
    # TotalSegmentator labels S1 on its own (vertebrae_S1) and the rest as sacrum: the drawn sacrum is both
    ("total", "sacrum+vertebrae_S1", "sp_sacrum", "Sacrum", "spBone", "nuclei", "bone", 16000, True),
    ("total", "hip_left", "sp_hip_left", "Hip bone (left)", "spBone", "nuclei", "bone", 14000, False),
    ("total", "hip_right", "sp_hip_right", "Hip bone (right)", "spBone", "nuclei", "bone", 14000, False),
    # on CT the cord, cauda equina and CSF are not separable: TotalSegmentator's spinal_cord class follows the
    # contents of the canal (measured cross-section 200-600 mm2, ending within the sacrum), so it is named for that
    ("total", "spinal_cord", "sp_dural_sac", "Dural sac (spinal canal contents)", "spCord", "tracts", "neural", 12000, True),
]


def ts_mask(task: str, cls: str, cr: tuple | None = None):
    """A TotalSegmentator mask; "a+b" is the union of two classes. With `cr` only that block (whole masks of this
    CT are 300 MB each: reading blocks keeps the build within a laptop's memory)."""
    out, aff = None, None
    for part in cls.split("+"):
        f = TS / task / f"{part}.nii.gz"
        if not f.exists():
            raise SystemExit(f"missing {f}: run pipeline/spine_segment.py")
        img = nib.load(f)
        m = (np.asanyarray(img.dataobj) if cr is None else read_block(f, cr)) > 0
        out, aff = (m if out is None else out | m), (img.affine if cr is None else block_affine(img.affine, cr))
    return out, aff


def ts_box(task: str, cls: str, margin: int = 6, chunk: int = 48) -> tuple[np.ndarray, np.ndarray]:
    """A TotalSegmentator mask ("a+b": a union) as the box around it plus `margin` voxels, and that box's affine. Read
    a few slices at a time, twice (find the box, then fill it): no whole-grid copy is ever made."""
    files = [TS / task / f"{part}.nii.gz" for part in cls.split("+")]
    for f in files:
        if not f.exists():
            raise SystemExit(f"missing {f}: run pipeline/spine_segment.py")
    imgs = [nib.load(f) for f in files]
    shape, aff = imgs[0].shape, imgs[0].affine
    lo, hi = np.array(shape), np.zeros(3, int)
    for img in imgs:
        for z0 in range(0, shape[2], chunk):
            nz = np.argwhere(np.asanyarray(img.dataobj[:, :, z0:z0 + chunk]) > 0)
            if len(nz):
                nz[:, 2] += z0
                lo, hi = np.minimum(lo, nz.min(0)), np.maximum(hi, nz.max(0) + 1)
    if (hi <= lo).any():
        raise SystemExit(f"{task}/{cls}: empty segmentation")
    box = tuple(slice(max(int(a) - margin, 0), min(int(b) + margin, shape[k])) for k, (a, b) in enumerate(zip(lo, hi)))
    sub = np.zeros(tuple(sl.stop - sl.start for sl in box), bool)
    for f in files:
        sub |= read_block(f, box) > 0
    return sub, block_affine(aff, box)


def shifted(aff: np.ndarray, o: np.ndarray) -> np.ndarray:
    a = aff.copy()
    a[:3, 3] -= o
    return a


def side_of(cls: str) -> str:
    return "L" if cls.endswith("_left") else "R"


def ts_structures(report: dict) -> list[dict]:
    o = origin()
    items = []
    for task, cls, sid, name, token, layer, cat, faces, split in TS_STRUCTURES:
        # smooth and mesh only the structure's box (plus 6 voxels): the whole CT grid as float is 1.3 GB a copy
        sel, aff = ts_box(task, cls)
        if sel.sum() < 50:
            raise SystemExit(f"{task}/{cls}: empty segmentation")
        mesh = isosurface(sel.astype(np.float32), shifted(aff, o), 0.5, 1.0, faces)
        nodes = halves(mesh, 0.0) if split else [{"name": side_of(cls), "positions": mesh.vertices, "normals": mesh.vertex_normals,
                                                  "indices": mesh.faces, "mode": 4}]
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        items.append({"id": sid, "name": name, "token": token, "layer": layer, "category": cat, "faces": int(len(mesh.faces)),
                      "centroid": mesh.centroid.round(2).tolist(), "source": f"TotalSegmentator {task}: {cls.replace('+', ' and ')}"})
        report[sid] = items[-1]
        print(f"{sid:24s} faces {len(mesh.faces):6d}")
    return items


def discs(report: dict, verts: list[dict]) -> list[dict]:
    """The vertebrae_body task's intervertebral_discs mask, split by level: each disc (connected component) belongs to
    the two bones it touches most within 2 mm (VerSe vertebrae, and TotalSegmentator's sacrum with S1 as S1)."""
    full, aff0 = ts_mask("vertebrae_body", "intervertebral_discs")
    if full.shape != nib.load(MASK).shape or not np.allclose(nib.load(MASK).affine, aff0, atol=1e-3):
        raise SystemExit("segmentation and VerSe mask are not on the same grid")
    idx = np.argwhere(full)
    del full
    m = int(np.ceil(5 / float(np.mean(np.abs(np.diag(aff0)[:3])))))  # the discs and 5 mm around them
    cr = tuple(slice(max(a - m, 0), b + m + 1) for a, b in zip(idx.min(0), idx.max(0)))
    del idx
    sel, aff = ts_mask("vertebrae_body", "intervertebral_discs", cr)
    vm, _ = load_mask(cr)
    sac, _ = ts_mask("total", "sacrum+vertebrae_S1", cr)
    bones = vm.astype(np.int16)
    bones[sac & (bones == 0)] = 26  # S1 (VerSe leaves the sacrum unlabelled)
    names = {**VERSE_LEVELS, 26: "S1"}
    o = origin()
    lab, n = ndimage.label(sel)
    reach = max(1, int(round(2.0 / float(np.mean(np.abs(np.diag(aff)[:3]))))))
    items = []
    for i in range(1, n + 1):
        comp = lab == i
        if comp.sum() < 200:
            continue
        idx = np.argwhere(comp)
        lo, hi = np.maximum(idx.min(0) - reach - 1, 0), np.minimum(idx.max(0) + reach + 2, comp.shape)
        crop = (slice(lo[0], hi[0]), slice(lo[1], hi[1]), slice(lo[2], hi[2]))
        ring = ndimage.binary_dilation(comp[crop], iterations=reach) & ~comp[crop]
        labs, counts = np.unique(bones[crop][ring], return_counts=True)
        touch = sorted(((int(c), int(l)) for l, c in zip(labs, counts) if l > 0), reverse=True)[:2]
        if len(touch) < 2:
            raise SystemExit(f"disc component {i} touches fewer than two bones")
        up, down = sorted((names[l] for _, l in touch), key=lambda x: (["C", "T", "L", "S"].index(x[0]), int(x[1:])))
        lvl = f"{up}-{down}"
        sid = "sp_disc_" + lvl.lower().replace("-", "_")
        a2 = shifted(aff, o)
        a2[:3, 3] = nib.affines.apply_affine(shifted(aff, o), lo)
        mesh = isosurface(comp[crop].astype(np.float32), a2, 0.5, 1.0, 5000)
        write_glb(BUILD / f"{sid}.glb", halves(mesh, float(mesh.centroid[0])), {"id": sid})
        items.append({"id": sid, "name": f"Intervertebral disc {lvl}", "level": lvl, "token": "spDisc", "layer": "discs",
                      "category": "disc", "faces": int(len(mesh.faces)), "centroid": mesh.centroid.round(2).tolist(),
                      "region": REGION[up[0]],
                      "source": "TotalSegmentator vertebrae_body: intervertebral_discs, split by the two bones each disc touches"})
        report[sid] = items[-1]
    ids = [x["id"] for x in items]
    if len(ids) != len(set(ids)):
        raise SystemExit(f"two disc components assigned to one level: {sorted(ids)}")
    print(f"discs: {len(items)} ({', '.join(x['level'] for x in items)})")
    return items


# ---------------------------------------------------------------- lumbar geometry, schematic roots
LUMBAR = ["T12", "L1", "L2", "L3", "L4", "L5", "S1"]
THORACIC = ["C7"] + [f"T{i}" for i in range(1, 13)] + ["L1"]
CERVICAL = ["C2", "C3", "C4", "C5", "C6", "C7", "T1"]
# per region: the chain of levels (each pair of neighbours is a motion segment), the roots drawn, the margin of the
# block read below the lowest vertebra, whether the sacrum closes the chain, herniation positions, the roots' course
SEGMENTS = {
    "lumbar": {"chain": LUMBAR, "roots": ["L1", "L2", "L3", "L4", "L5"], "below": 110, "sacrum": True, "lesions": True,
               "course": "plexus", "close": 3.0, "report_foramen": True},
    # thoracic: a narrow cleft in the lower vertebra (between its superior articular process and pedicle) can open
    # into the foramen, so its floor is taken across it (spine_geom.foramen, floor_clefts). The foramen's size is not
    # reported here: without the rib heads, which form part of its wall, the gap the plane method finds runs on into
    # the costotransverse region; its position still places the schematic roots.
    "thoracic": {"chain": THORACIC, "roots": [f"T{i}" for i in range(1, 13)], "below": 40, "sacrum": False, "lesions": False,
                 "course": "intercostal", "close": 3.0, "floor_clefts": True, "report_foramen": False},
    # cervical: eight roots for seven vertebrae; each leaves above the vertebra of its number, C8 between C7 and T1
    # (root_of "lower": the root at a motion segment is named for its lower vertebra), in the lower part of the
    # foramen (Moreno 2021). C1 and C2 have no disc and no foramen of this kind: the craniocervical junction follows
    # with the C1-C2 fixation. The cervical foramina open obliquely forwards, so they are sought in planes across an
    # axis turned foramen_angle degrees forwards from lateral, and on labels taken from the CT's bone (the VerSe masks
    # step too coarsely for these small openings); their position places the roots, their size is not reported
    "cervical": {"chain": CERVICAL, "roots": ["C3", "C4", "C5", "C6", "C7", "C8"], "root_of": "lower", "below": 40,
                 "sacrum": False, "lesions": False, "course": "cervical", "close": 1.5, "report_foramen": False,
                 "foramen_angle": 30.0, "ct_labels": True},
}
LABEL_OF = {v: k for k, v in VERSE_LEVELS.items()} | {"S1": 26}
DISC_LABEL = 50
ROOT_RADIUS = 1.5     # schematic drawing sizes (mm), not measurements
ROOT_IN_MM = 1.5      # each root starts this far inside the dural sac, so it leaves its wall rather than abutting it
TAKEOFF_DEG = 55.0    # lumbar and thoracic roots leave the sac at this angle to its axis, running down and out
                      # (Silverstein 2015: 50.5-58.8 deg at L4 and L5, the largest), for TAKEOFF_LEG_MM
TAKEOFF_LEG_MM = 5.0
ROOT_CLEAR_MM = 0.4   # each root's surface kept this far out of the drawn bone (its path pushed out where it ran in:
ROOT_PUSH_PASSES = 16 # the schematic paths are placed by rule and would otherwise cut through a lamina or a facet)
DRG_CLEAR_MM = 2.0    # ... and each ganglion's centre this far
DRG_RADII = (3.0, 3.0, 5.0)


def mesh_nodes(parts: dict[str, tuple]) -> list[dict]:
    return [{"name": side, "positions": p, "normals": n, "indices": t, "mode": 4} for side, (p, n, t) in parts.items() if len(t)]


def merge(meshes: list[tuple]) -> tuple:
    ps, ns, ts, off = [], [], [], 0
    for p, n, t in meshes:
        ps.append(p); ns.append(n); ts.append(t + off); off += len(p)
    return np.vstack(ps), np.vstack(ns), np.vstack(ts)


def segment_geometry(report: dict, region: str) -> tuple[list[dict], list[dict]]:
    """Measured canal, foramina and disc height per level of a region, and its schematic roots, each with its ganglion (lumbar:
    L1-S1, with herniation positions per disc; thoracic: T1-T12; cervical: C3-C8)."""
    cfg = SEGMENTS[region]
    chain = cfg["chain"]
    bottom = [x for x in chain if x != "S1"][-1]
    img = nib.load(MASK)
    aff = img.affine
    o = origin()
    ctd = json.loads(CTD.read_text())
    C = {c["label"]: nib.affines.apply_affine(aff, [c["X"], c["Y"], c["Z"]]) for c in ctd if "label" in c}
    # read only the lumbar block: whole-volume arrays of this CT are 0.3-1.3 GB each
    inv = np.linalg.inv(aff)
    # 90 mm around the spine, from below the lowest vertebra (lumbar: the sacrum and S1 roots) to 60 mm above the
    # highest; corners mapped to voxels
    corners = np.array([[x, y, z] for x in (-90, 90) for y in (-90, 90) for z in (-cfg["below"], 60)], float)
    span = np.vstack([nib.affines.apply_affine(inv, C[LABEL_OF[bottom]] + np.where(corners[:, 2:3] < 0, corners, 0)),
                      nib.affines.apply_affine(inv, C[LABEL_OF[chain[0]]] + np.where(corners[:, 2:3] > 0, corners, 0))])
    lo = np.maximum(np.floor(span.min(0)).astype(int), 0)
    hi = np.minimum(np.ceil(span.max(0)).astype(int) + 1, img.shape)
    cr = tuple(slice(a, b) for a, b in zip(lo, hi))
    vm, a2 = load_mask(cr)
    if cfg.get("ct_labels"):
        # each voxel of the CT's bone surface volume takes the label of the nearest VerSe mask within MASK_REACH_MM
        vox = np.abs(np.diag(a2)[:3])
        bone = ndimage.gaussian_filter(read_block(CT, cr).astype(np.float32), SIGMA_VOX) > BONE_HU
        dist, ind = ndimage.distance_transform_edt(vm == 0, sampling=vox, return_indices=True)
        vm = np.where(bone & (dist <= MASK_REACH_MM), vm[tuple(ind)], 0).astype(vm.dtype)
        del bone, dist, ind
    disc, _ = ts_mask("vertebrae_body", "intervertebral_discs", cr)
    sacpts_mask, _ = ts_mask("total", "spinal_cord", cr)
    lab = vm.copy()
    if cfg["sacrum"]:
        sac, _ = ts_mask("total", "sacrum+vertebrae_S1", cr)
        lab[sac & (lab == 0)] = LABEL_OF["S1"]
        del sac
    lab[disc & (lab == 0)] = DISC_LABEL
    grid = G.Grid(lab, a2)
    # the bone as the vertebrae are drawn (the CT's bone within reach of their masks; the sacrum's segmentation), its
    # signed distance (mm, positive outside): the schematic roots are kept out of it
    vox_b = np.abs(np.diag(a2)[:3])
    drawn_bone = (ndimage.gaussian_filter(read_block(CT, cr).astype(np.float32), SIGMA_VOX) > BONE_HU) & \
        (ndimage.distance_transform_edt(vm == 0, sampling=vox_b) <= MASK_REACH_MM)
    if cfg["sacrum"]:
        drawn_bone |= lab == LABEL_OF["S1"]
    bone_sd = (ndimage.distance_transform_edt(~drawn_bone, sampling=vox_b) - ndimage.distance_transform_edt(drawn_bone, sampling=vox_b)).astype(np.float32)
    del drawn_bone
    inv_b = np.linalg.inv(a2)

    def bone_dist(P: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(bone_sd, nib.affines.apply_affine(inv_b, np.atleast_2d(P)).T, order=1, mode="nearest")

    def clear_of_bone(P: np.ndarray, clearance: float, fixed: int = 0) -> tuple[np.ndarray, float]:
        """Points (RAS) pushed out of the drawn bone to `clearance` mm from it, along its distance's gradient, the
        pushes smoothed along the path (a root bends rather than kinks); the first `fixed` stay. Returns the points and
        what intrusion is left (mm)."""
        P = P.copy()
        for _ in range(ROOT_PUSH_PASSES):
            need = np.clip(clearance - bone_dist(P), 0, None)
            need[:fixed] = 0
            if need.max() < 0.05:
                break
            g = np.stack([(bone_dist(P + 0.3 * e) - bone_dist(P - 0.3 * e)) / 0.6 for e in np.eye(3)], 1)
            g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-6)
            D = need[:, None] * g
            for _ in range(3):   # spread along the path, each point still moved at least its own way out
                D[1:-1] = 0.5 * D[1:-1] + 0.25 * (D[:-2] + D[2:])
            D += np.clip(need - np.einsum("ij,ij->i", D, g), 0, None)[:, None] * g
            D[:fixed] = 0
            P += D
        return P, float(np.clip(clearance - bone_dist(P), 0, None)[fixed:].max(initial=0.0))
    intrusion = {}

    def ras_of(mask: np.ndarray) -> np.ndarray:
        return nib.affines.apply_affine(a2, np.argwhere(mask))
    sac_pts = ras_of(sacpts_mask)
    disc_lab, nd = ndimage.label(disc)
    disc_c = [nib.affines.apply_affine(a2, x) for x in ndimage.center_of_mass(disc, disc_lab, range(1, nd + 1))]
    disc_pts = {i + 1: None for i in range(nd)}

    def disc_between(up: str, down: str) -> tuple[np.ndarray, np.ndarray]:
        """Centroid and points of the disc between two levels (the component nearest the midpoint of their bodies)."""
        mid_ = (C[LABEL_OF[up]] + C[LABEL_OF[down]]) / 2 if down != "S1" else None
        if down == "S1":  # the L5-S1 disc: the disc component below L5 nearest it
            k = int(np.argmin([np.linalg.norm(c - C[LABEL_OF["L5"]]) if c[2] < C[LABEL_OF["L5"]][2] else 1e9 for c in disc_c]))
        else:
            k = int(np.argmin([np.linalg.norm(c - mid_) for c in disc_c]))
        if disc_pts[k + 1] is None:
            disc_pts[k + 1] = ras_of(disc_lab == k + 1)
        return disc_c[k], disc_pts[k + 1]
    if cfg["sacrum"]:
        C[LABEL_OF["S1"]] = 2 * disc_between("L5", "S1")[0] - C[LABEL_OF["L5"]]  # S1 body centre: L5 mirrored across the disc

    levels, roots = [], []
    canals = {}
    found = 0
    for up, down in zip(chain, chain[1:]):
        cu, cd = C[LABEL_OF[up]], C[LABEL_OF[down]]
        F = G.frame(cu, cd)
        h = float(np.linalg.norm(cu - cd))
        mid = (cu + cd) / 2
        # the ring closes in the plane through the body centre at most levels; where it does not (mid-thoracic, the
        # pedicles high on the body), a plane a few millimetres up or down
        for dw in (0.0, 3.0, 6.0, -3.0, 9.0):
            can = G.canal(grid, LABEL_OF[up], cu + dw * F[2], F)
            if can:
                break
        canals[up] = (can, F)
        fors = {}
        for sd, sg in (("L", -1), ("R", 1)):
            fo = None
            if can and down != "S1" and cfg.get("foramen_angle"):
                # planes across an axis turned forwards from lateral, out from 90% of the canal's half-width
                t = np.radians(cfg["foramen_angle"])
                d_out = sg * np.cos(t) * F[0] + np.sin(t) * F[1]
                d_fwd = np.cross(F[2], d_out)
                d_fwd = d_fwd if d_fwd @ F[1] > 0 else -d_fwd
                Fr = np.stack([d_out, d_fwd, F[2]])
                centre = mid + can["u"] * F[0] + can["v"] * F[1]
                fo = G.foramen(grid, LABEL_OF[up], LABEL_OF[down], {DISC_LABEL}, centre, Fr, 0.9 * can["halfWidth"], h,
                               cfg["close"], False, front=30.0)
                if fo:
                    fo["axis"] = d_out
            elif can and down != "S1":  # the plane method does not capture the L5-S1 foramen in this CT
                fo = G.foramen(grid, LABEL_OF[up], LABEL_OF[down], {DISC_LABEL}, mid, F,
                               (can["uMin"] - 1) if sg < 0 else (can["uMax"] + 1), h, cfg["close"],
                               cfg.get("floor_clefts", False))
            fors[sd] = fo
            found += fo is not None
        dc, dpts = disc_between(up, down)
        levels.append({"level": up, "pair": f"{up}-{down}", "bodyCentre": (cu - o).round(2).tolist(),
                       "canal": can and {k: can[k] for k in ("width", "depth", "area")},
                       "foramen": {sd: fo and {k: fo[k] for k in ("height", "width", "area")} if cfg["report_foramen"] else None
                                   for sd, fo in fors.items()},
                       **({} if cfg["report_foramen"] else {"foramenMeasured": False}),
                       "discCentre": (dc - o).round(2).tolist()})
        report.setdefault(region, {})[f"{up}-{down}"] = levels[-1]

        # ---- the root that exits here: lumbar and thoracic, the upper level's root, below its pedicle; cervical, the
        # root named for the lower level (C8 at C7-T1), above that level's pedicle
        rname = up if cfg.get("root_of", "upper") == "upper" else (down if down.startswith("C") else "C8")
        cervical = cfg["course"] == "cervical"
        if rname in cfg["roots"]:
            if not cervical:
                above = chain[chain.index(up) - 1]
                dc_above, _ = disc_between(above, up)
                Fa = G.frame(C[LABEL_OF[above]], cu)
            parts, drgs, estimated = {}, {}, {}
            for sd, sg in (("L", -1), ("R", 1)):
                edge = (can["uMin"] if sg < 0 else can["uMax"]) if can else sg * 12.0
                fo = fors[sd]
                if cervical:
                    # level: from the sac where the root enters its foramen, in the foramen's lower part (Moreno 2021),
                    # then on forwards and out along the foramen's axis and the transverse process. The rootlets descend
                    # inside the sac to that point (Kong 2022: the more steeply, the lower the level) and are not drawn.
                    if fo:
                        w_low = (fo["top"] - fo["height"] + fo["w"]) / 2
                        c = np.array(fo["centre"])
                        p2 = c + (w_low - fo["w"]) * F[2] + 3 * fo["axis"]
                        p1 = c + (w_low - fo["w"]) * F[2] - 2 * fo["axis"]  # foramen entrance
                        out = fo["axis"]
                    else:
                        w_low = -0.1 * h
                        p2 = mid + (edge + sg * 6) * F[0] + (can["v"] if can else -15) * F[1] + w_low * F[2]
                        p1 = mid + (edge - sg * 1.0) * F[0] + float((p2 - mid) @ F[1]) * F[1] + w_low * F[2]
                        out = sg * F[0]
                    p3 = p2 + 10 * out + 3 * F[1] - 3 * F[2]
                    p4 = p3 + 14 * out + 4 * F[1] - 9 * F[2]
                    p0 = G.lateral_point(sac_pts, dc + float((p1 - dc) @ F[2]) * F[2], F, sg)
                    if p0 is not None:
                        p0 = p0 - sg * ROOT_IN_MM * F[0]
                    p0b = None
                    if p0 is not None and (p1 - p0) @ out < 1.0:  # the sac reaches out past the entrance: no kink back
                        p1 = None
                else:
                    if fo:
                        c = np.array(fo["centre"])
                        p2 = c + ((fo["top"] - fo["w"]) / 2) * F[2]  # upper part of the foramen, beneath the pedicle
                    else:
                        p2 = mid + (edge + sg * 6) * F[0] + ((can["v"] if can else -20)) * F[1] + 0.15 * h * F[2]
                    p0b = None
                    if cfg["course"] == "plexus":
                        p0 = G.lateral_point(sac_pts, dc_above, Fa, sg)  # take-off: lateral wall of the dural sac at the disc above
                        # leaving the sac down and out at TAKEOFF_DEG to its axis, from just inside its wall
                        if p0 is not None:
                            t = np.radians(TAKEOFF_DEG)
                            p0b = p0 + TAKEOFF_LEG_MM * (np.sin(t) * sg * Fa[0] - np.cos(t) * Fa[2])
                            p0 = p0 - sg * ROOT_IN_MM * Fa[0]
                        p1 = cu + (edge - sg * 2.5) * F[0] + ((can["v"] + 3) if can else -20) * F[1]  # lateral recess, own level
                    else:
                        # thoracic: from the sac's wall level with the upper part of its foramen, straight out beneath
                        # the pedicle (a drawing choice: the rootlets' descent inside the sac is not drawn)
                        p0 = G.lateral_point(sac_pts, dc + float((p2 - dc) @ F[2]) * F[2], F, sg)
                        if p0 is not None:
                            p0 = p0 - sg * ROOT_IN_MM * F[0]
                        p1 = None
                    if cfg["course"] == "plexus":  # on forwards and down towards the lumbar plexus
                        p3 = p2 + sg * 15 * F[0] + 8 * F[1] - 10 * F[2]
                        p4 = p3 + sg * 15 * F[0] + 10 * F[1] - 20 * F[2]
                    else:  # out along the intercostal course, a short way
                        p3 = p2 + sg * 12 * F[0] + 1 * F[1] - 4 * F[2]
                        p4 = p3 + sg * 22 * F[0] - 2 * F[1] - 6 * F[2]
                estimated[sd] = fo is None
                path = [p for p in (p0, p0b, p1, p2, p3, p4) if p is not None]
                curve_ras, left = clear_of_bone(G.catmull(path, 8), ROOT_RADIUS + ROOT_CLEAR_MM, fixed=1 if p0 is not None else 0)
                curve = curve_ras - o
                parts[sd] = G.tube(curve, ROOT_RADIUS)
                ez = (p3 - p2) / np.linalg.norm(p3 - p2)
                ex = np.cross(ez, F[2]); ex /= np.linalg.norm(ex)
                # the ganglion rides on the root as pushed, its centre kept out of the bone too
                gc = curve_ras[np.argmin(np.linalg.norm(curve_ras - (p2 + 2.0 * ez), axis=1))]
                gc = clear_of_bone(gc[None], DRG_CLEAR_MM)[0][0]
                drgs[sd] = G.ellipsoid(gc - o, np.stack([ex, np.cross(ez, ex), ez]), DRG_RADII)
                intrusion[f"{rname}{sd}"] = round(left, 2)
            # the root and its dorsal root ganglion are one structure
            rid = f"sp_root_{rname.lower()}"
            write_glb(BUILD / f"{rid}.glb", mesh_nodes({sd: merge([parts[sd], drgs[sd]]) for sd in parts}), {"id": rid})
            where = "the lower part of " if cervical else ""
            exit_note = (f"exits through {where}the {up}-{down} foramen (measured position)" if not any(estimated.values())
                         else f"exits through {where}the {up}-{down} foramen, whose position is estimated on "
                              f"{' and '.join(k for k, v in estimated.items() if v)} (not captured by the measurement)")
            if cervical:
                path_note = f"leaves the lateral wall of the dural sac level with its foramen's entrance and {exit_note}, then runs a short way forwards and out along the transverse process"
            else:
                after = "" if cfg["course"] == "plexus" else ", then a short way along its intercostal course"
                path_note = (f"leaves the lateral wall of the dural sac at the {above}-{up} disc, down and out at {TAKEOFF_DEG:g} deg to the sac (Silverstein 2015), runs in the lateral recess at {up} and {exit_note}{after}"
                             if cfg["course"] == "plexus" else
                             f"leaves the lateral wall of the dural sac level with the upper part of its foramen and {exit_note}{after}")
            roots.append({"id": rid, "name": f"{rname} nerve root", "level": rname, "token": "spRoot", "layer": "tracts", "category": "root",
                          "region": region, "schematic": True, "estimated": [k for k, v in estimated.items() if v],
                          "centroid": (p2 - o).round(2).tolist(),
                          "source": f"Schematic: {path_note}; drawn {2 * ROOT_RADIUS:g} mm thick, with its dorsal root ganglion "
                                    f"{'just outside' if cervical else 'in the upper part of'} the foramen (not to scale)"})

        # ---- where a herniation of each kind sits at this disc (for the lesion-to-root tool; schematic positions):
        # paracentral = posterior edge of the disc halfway between the midline and the canal edge; foraminal = in the
        # foramen at disc level (the measured foramen, else the root's exit point); far lateral = 12 mm further out
        if cfg["lesions"] and up in cfg["roots"]:
            les = {}
            for sd, sg in (("L", -1), ("R", 1)):
                edge = (can["uMin"] if sg < 0 else can["uMax"]) if can else sg * 12.0
                u_par = (can["u"] if can else 0) + 0.5 * (edge - (can["u"] if can else 0))
                ring = dpts[(np.abs((dpts - dc) @ F[2]) < 2.5) & (np.abs((dpts - dc) @ F[0] - u_par) < 2.5)]
                v_post = float(((ring - dc) @ F[1]).min()) if len(ring) else -15.0
                par = dc + u_par * F[0] + (v_post - 1.5) * F[1]
                fo = fors[sd]
                fpt = (np.array(fo["centre"]) if fo else mid + (edge + sg * 6) * F[0] + (can["v"] if can else -20) * F[1])
                fpt = fpt + float(((dc - fpt) @ F[2])) * F[2]  # down (or up) to the disc level
                far = fpt + sg * 12 * F[0] + 3 * F[1]
                les[sd] = {"paracentral": (par - o).round(2).tolist(), "foraminal": (fpt - o).round(2).tolist(),
                           "farlateral": (far - o).round(2).tolist(), "foraminalEstimated": fo is None}
            levels[-1]["lesions"] = les

        # ---- the disc's height at its centre (measured): the spread of its points along the spine within 8 mm of it;
        # not at L5-S1, whose frame (towards an estimated S1 centre) runs obliquely through this wedge-shaped disc
        core = dpts[np.abs((dpts - dc) @ F[0]) < 8]
        if len(core) and down != "S1":
            dw = (core - dc) @ F[2]
            levels[-1]["discHeightMm"] = round(float(np.percentile(dw, 95) - np.percentile(dw, 5)), 1)
    if not cfg["sacrum"]:
        print(f"{region}: {len(levels)} levels, {len(roots)} root parts; foramina found (placing the roots) {found}/{2 * len(levels)}")
        report.setdefault("rootIntrusionMm", {}).update(intrusion)
        print(f"{region}: roots left in the bone (mm) {intrusion}")
        return levels, roots
    # ---- S1: leaves the sac at the L5-S1 disc, runs in the lateral recess of S1 and leaves through the first sacral
    # foramen, whose position the measurement does not capture (estimated); its ganglion is drawn inside the canal
    # (Hasegawa 1996: the S1 ganglion is more often intraspinal)
    cl5, cs1 = C[LABEL_OF["L5"]], C[LABEL_OF["S1"]]
    Fs = G.frame(cl5, cs1)
    dcs, _ = disc_between("L5", "S1")
    can_s = canals.get("L5", (None, None))[0]
    parts, drgs = {}, {}
    for sd, sg in (("L", -1), ("R", 1)):
        p0 = G.lateral_point(sac_pts, dcs, Fs, sg)
        edge = (can_s["uMin"] if sg < 0 else can_s["uMax"]) if can_s else sg * 15.0
        v0 = (can_s["v"] + 3) if can_s else -20
        p1 = cs1 + (edge - sg * 4) * Fs[0] + v0 * Fs[1] + 4 * Fs[2]
        p2 = cs1 + (edge - sg * 2) * Fs[0] + (v0 + 6) * Fs[1] - 10 * Fs[2]
        p3 = p2 + sg * 4 * Fs[0] + 15 * Fs[1] - 8 * Fs[2]
        p4 = p3 + sg * 6 * Fs[0] + 15 * Fs[1] - 15 * Fs[2]
        curve_ras, left = clear_of_bone(G.catmull([q for q in (p0, p1, p2, p3, p4) if q is not None], 8), ROOT_RADIUS + ROOT_CLEAR_MM,
                                        fixed=1 if p0 is not None else 0)
        parts[sd] = G.tube(curve_ras - o, ROOT_RADIUS)
        ez = (p2 - p1) / np.linalg.norm(p2 - p1)
        ex = np.cross(ez, Fs[1]); ex /= np.linalg.norm(ex)
        gc = clear_of_bone(((p1 + p2) / 2)[None], DRG_CLEAR_MM)[0][0]
        drgs[sd] = G.ellipsoid(gc - o, np.stack([ex, np.cross(ez, ex), ez]), DRG_RADII)
        intrusion[f"S1{sd}"] = round(left, 2)
    write_glb(BUILD / "sp_root_s1.glb", mesh_nodes({sd: merge([parts[sd], drgs[sd]]) for sd in parts}), {"id": "sp_root_s1"})
    roots.append({"id": "sp_root_s1", "name": "S1 nerve root", "level": "S1", "token": "spRoot", "layer": "tracts", "category": "root",
                  "region": region, "schematic": True, "estimated": ["L", "R"], "centroid": (cs1 - o).round(2).tolist(),
                  "source": "Schematic: leaves the lateral wall of the dural sac at the L5-S1 disc, runs in the lateral recess "
                            "of S1 and leaves through the first sacral foramen, whose position is estimated (not captured by "
                            f"the measurement); drawn {2 * ROOT_RADIUS:g} mm thick, with its dorsal root ganglion inside the "
                            "canal, where the S1 ganglion more often lies (Hasegawa 1996; not to scale)"})
    print(f"{region}: {len(levels)} levels, {len(roots)} root parts; foramina measured "
          f"{sum(1 for lv in levels for v in lv['foramen'].values() if v)}/{2 * len(levels)}")
    report.setdefault("rootIntrusionMm", {}).update(intrusion)
    print(f"{region}: roots left in the bone (mm) {intrusion}")
    return levels, roots


# ---------------------------------------------------------------- cervical: the neck's soft tissue, the vertebral artery
# TotalSegmentator classes drawn in the cervical region (open tasks; see spine_segment.py), kept between 15 mm below
# the T1 body and 30 mm above C1: the anterior approach's neighbours. Viscera and muscles share one colour (spSoft)
CERVICAL_TS = [
    ("total", "common_carotid_artery_left", "sp_cca_left", "Common carotid artery (left)", "spArtery", "vessels", "vessel", 4000),
    ("total", "common_carotid_artery_right", "sp_cca_right", "Common carotid artery (right)", "spArtery", "vessels", "vessel", 4000),
    ("headneck_bones_vessels", "internal_carotid_artery_left", "sp_ica_left", "Internal carotid artery (left)", "spArtery", "vessels", "vessel", 3000),
    ("headneck_bones_vessels", "internal_carotid_artery_right", "sp_ica_right", "Internal carotid artery (right)", "spArtery", "vessels", "vessel", 3000),
    ("headneck_bones_vessels", "internal_jugular_vein_left", "sp_ijv_left", "Internal jugular vein (left)", "spVein", "vessels", "vessel", 4000),
    ("headneck_bones_vessels", "internal_jugular_vein_right", "sp_ijv_right", "Internal jugular vein (right)", "spVein", "vessels", "vessel", 4000),
    ("total", "trachea", "sp_trachea", "Trachea", "spSoft", "viscera", "viscera", 4000),
    ("total", "esophagus", "sp_esophagus", "Oesophagus", "spSoft", "viscera", "viscera", 4000),
    ("total", "thyroid_gland", "sp_thyroid", "Thyroid gland", "spSoft", "viscera", "viscera", 4000),
    ("headneck_bones_vessels", "thyroid_cartilage+cricoid_cartilage", "sp_larynx", "Larynx (thyroid and cricoid cartilages)", "spSoft", "viscera", "viscera", 5000),
    ("headneck_muscles", "prevertebral_left", "sp_prevertebral_left", "Prevertebral muscles (left)", "spSoft", "viscera", "muscle", 4000),
    ("headneck_muscles", "prevertebral_right", "sp_prevertebral_right", "Prevertebral muscles (right)", "spSoft", "viscera", "muscle", 4000),
    ("headneck_muscles", "sternocleidomastoid_left", "sp_scm_left", "Sternocleidomastoid (left)", "spSoft", "viscera", "muscle", 4000),
    ("headneck_muscles", "sternocleidomastoid_right", "sp_scm_right", "Sternocleidomastoid (right)", "spSoft", "viscera", "muscle", 4000),
]
VA_RADIUS = 2.0       # schematic drawing size (mm), not a measurement
# the neck's vessels where their segmentation breaks (this CT has no contrast): gaps up to this long bridged by a tube
# from one piece's end to the next's start (schematic), and each common carotid on to its internal carotid
BRIDGE_MAX_MM = 40.0
BRIDGE_ONTO = {"sp_cca_left": "sp_ica_left", "sp_cca_right": "sp_ica_right"}


def vessel_end(m, top: bool, depth: float = 3.0) -> tuple[np.ndarray, float, np.ndarray]:
    """A vessel piece's end (top or bottom): its cross-section's centre and mean radius over the last `depth` mm, and
    the direction it runs out of the piece there."""
    V = np.asarray(m.vertices)
    z0 = V[:, 2].max() if top else V[:, 2].min()
    sel = V[np.abs(V[:, 2] - z0) < depth]
    c = sel.mean(0)
    deeper = V[np.abs(V[:, 2] - (z0 - (2 * depth if top else -2 * depth))) < depth].mean(0)
    d = c - deeper
    return c, float(np.mean(np.linalg.norm((sel - c)[:, :2], axis=1))), d / max(np.linalg.norm(d), 1e-6)


def bridge(a, b) -> tuple[tuple, float] | None:
    """A tube from piece a's top to piece b's bottom (a schematic bridge), and the gap it spans (mm); none beyond
    BRIDGE_MAX_MM."""
    ca, ra, da = vessel_end(a, True)
    cb, rb, db = vessel_end(b, False)
    gap = float(np.linalg.norm(cb - ca))
    if gap < 1.0 or gap > BRIDGE_MAX_MM:
        return None
    path = G.catmull([ca - 2 * da, ca, cb, cb - 2 * db], 6)
    return G.tube(path, (ra + rb) / 2), gap
VA_FILLED = 0.6       # a foramen transversarium counts as carrying the artery at this share of the median C3-C6 area


def centroids() -> dict:
    img = nib.load(MASK)
    ctd = json.loads(CTD.read_text())
    return {c["label"]: nib.affines.apply_affine(img.affine, [c["X"], c["Y"], c["Z"]]) for c in ctd if "label" in c}


NECK_LANDMARKS = [("hyoid", "hyoid", "centroid"), ("thyroidCartilage", "thyroid_cartilage", "centroid"),
                  ("cricoidInferior", "cricoid_cartilage", "lowest")]


def neck_landmarks(levels_c: list[dict]) -> dict:
    """The level each laryngeal landmark lies at, projected perpendicularly onto the cervical spine (Alicandri-Ciufelli
    2020): the hyoid's and the thyroid cartilage's centroids, the cricoid's lower margin (its lowest point); the level is
    the vertebral body or disc whose centre lies nearest along the spine's axis there."""
    o = origin()
    marks = []
    for g in levels_c:
        marks.append((g["level"], np.array(g["bodyCentre"])))
        marks.append((g["pair"], np.array(g["discCentre"])))
    C = centroids()
    marks.append(("T1", C[LABEL_OF["T1"]] - o))
    out = {}
    for key, cls, how in NECK_LANDMARKS:
        sel, aff = ts_box("headneck_bones_vessels", cls)
        pts = nib.affines.apply_affine(shifted(aff, o), np.argwhere(sel))
        p = pts.mean(0) if how == "centroid" else pts[np.argmin(pts[:, 2])]
        # the local spine axis: through the two marks nearest the landmark's height
        near = sorted(marks, key=lambda m: abs(m[1][2] - p[2]))[:2]
        axis = near[0][1] - near[1][1]
        axis = axis / np.linalg.norm(axis) if np.linalg.norm(axis) > 0 else np.array([0, 0, 1.0])
        best = min(marks, key=lambda m: abs((m[1] - p) @ axis))
        out[key] = {"level": best[0], "point": p.round(2).tolist()}
    print("neck landmarks:", {k: v["level"] for k, v in out.items()})
    return out


def cervical_soft(report: dict) -> list[dict]:
    o = origin()
    C = centroids()
    z_lo, z_hi = C[LABEL_OF["T1"]][2] - 15, C[LABEL_OF["C1"]][2] + 30
    x_mid = float(np.mean([C[LABEL_OF[f"C{i}"]][0] for i in range(1, 8)])) - o[0]
    items = []
    built = {}
    for task, cls, sid, name, token, layer, cat, faces in CERVICAL_TS:
        sel, aff = ts_box(task, cls)
        if not np.allclose(aff[2, :2], 0):
            raise SystemExit("the CT's slices are not axial")
        z = aff[2, 2] * np.arange(sel.shape[2]) + aff[2, 3]
        sel[:, :, (z < z_lo) | (z > z_hi)] = False
        if sel.sum() < 50:
            raise SystemExit(f"{task}/{cls}: empty within the neck")
        built[sid] = (task, cls, name, token, layer, cat, isosurface(sel.astype(np.float32), shifted(aff, o), 0.5, 1.0, faces))
    for sid, (task, cls, name, token, layer, cat, mesh) in built.items():
        extra, notes = [], []
        if cat == "vessel":
            # the segmentation's breaks bridged (pieces sorted up the neck), and a common carotid on to its internal one
            pieces = sorted(mesh.split(only_watertight=False), key=lambda p: p.vertices[:, 2].min())
            pieces = [p for p in pieces if len(p.faces) > 50]
            for a, b in zip(pieces, pieces[1:]):
                br = bridge(a, b)
                if br:
                    extra.append(br[0]); notes.append(f"a break of {br[1]:.0f} mm bridged")
            if sid in BRIDGE_ONTO and pieces:
                onto = sorted(built[BRIDGE_ONTO[sid]][6].split(only_watertight=False), key=lambda p: p.vertices[:, 2].min())
                br = bridge(pieces[-1], onto[0]) if onto else None
                if br:
                    extra.append(br[0]); notes.append(f"joined to the internal carotid across {br[1]:.0f} mm")
        paired = cls.endswith(("_left", "_right"))
        if extra:
            P, N, T = merge([(np.asarray(mesh.vertices), np.asarray(mesh.vertex_normals), np.asarray(mesh.faces))] + extra)
        else:
            P, N, T = np.asarray(mesh.vertices), np.asarray(mesh.vertex_normals), np.asarray(mesh.faces)
        nodes = ([{"name": side_of(cls), "positions": P, "normals": N, "indices": T, "mode": 4}]
                 if paired else halves(mesh, x_mid))
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        items.append({"id": sid, "name": name, "token": token, "layer": layer, "category": cat, "region": "cervical",
                      "faces": int(len(T)), "centroid": mesh.centroid.round(2).tolist(),
                      "source": f"TotalSegmentator {task}: {cls.replace('+', ' and ')}, within the neck"
                                + (f" ({'; '.join(notes)}: schematic tubes where the segmentation of this CT, which has no contrast, breaks)" if notes else "")})
        report[sid] = items[-1]
        print(f"{sid:24s} faces {len(T):6d} {notes}")
    return items


def vertebral_artery(report: dict) -> tuple[list[dict], dict]:
    """The vertebral artery, schematic, by side: V1 from the subclavian artery (TotalSegmentator) to the foramen
    transversarium where it enters, V2 through the foramina measured on this CT up to C1, V3 behind the lateral mass of
    the atlas and over the groove on its posterior arch (measured surface), and the start of V4 towards the foramen
    magnum. Where it enters is inferred from the foramina's size (those that carry the artery are larger: Hong 2008,
    Bruneau 2006): the lowest whose enclosed area is at least VA_FILLED of the median at C3-C6."""
    img = nib.load(MASK)
    aff = img.affine
    vox = np.abs(np.diag(aff)[:3])
    o = origin()
    C = centroids()
    inv = np.linalg.inv(aff)
    corners = np.array([[x, y, z] for x in (-70, 70) for y in (-70, 70) for z in (-20, 40)], float)
    span = np.vstack([nib.affines.apply_affine(inv, C[LABEL_OF["C1"]] + corners), nib.affines.apply_affine(inv, C[LABEL_OF["T1"]] + corners)])
    lo = np.maximum(np.floor(span.min(0)).astype(int), 0)
    hi = np.minimum(np.ceil(span.max(0)).astype(int) + 1, img.shape)
    cr = tuple(slice(a, b) for a, b in zip(lo, hi))
    vm, a2 = load_mask(cr)
    ct = read_block(CT, cr)
    levels = [f"C{i}" for i in range(1, 8)]
    tf, frames, bone_pts = {}, {}, {}
    for lv in levels:
        lab = LABEL_OF[lv]
        sel = vm == lab
        idx = np.argwhere(sel)
        m = np.ceil(12 / vox).astype(int)
        b0, b1 = np.maximum(idx.min(0) - m, 0), np.minimum(idx.max(0) + m + 1, sel.shape)
        crp = tuple(slice(a, b) for a, b in zip(b0, b1))
        vol = bone_volume(ct[crp].astype(np.float32), sel[crp], float(vox.mean()))
        inside = ndimage.gaussian_filter(vol, SIGMA_VOX) > BONE_HU
        lab_i, n = ndimage.label(inside)
        if n > 1:
            inside = lab_i == (int(np.argmax(ndimage.sum(inside, lab_i, range(1, n + 1)))) + 1)
        a3 = a2.copy()
        a3[:3, 3] = nib.affines.apply_affine(a2, b0)
        grid = G.Grid(inside.astype(np.uint8), a3)
        c = C[lab]
        up, down = C.get(lab - 1), C.get(lab + 1)
        F = G.frame(up if up is not None else c + (c - down), down)
        can = None
        for dw in (0.0, 3.0, -3.0, 6.0):
            can = G.canal(grid, 1, c + dw * F[2], F)
            if can:
                break
        tf[lv] = G.transverse_foramina(grid, 1, c, F, can["halfWidth"] + 2 if can else 14.0)
        frames[lv] = F
        if lv == "C1":
            bone_pts[lv] = nib.affines.apply_affine(a3, np.argwhere(inside))
    del vm, ct
    entry, parts, areas = {}, {}, {}
    for sd, sg in (("L", -1), ("R", 1)):
        area = {lv: (tf[lv][sd]["area"] if tf[lv][sd] else 0.0) for lv in levels}
        areas[sd] = area
        ref = float(np.median([area[x] for x in ("C3", "C4", "C5", "C6") if area[x] > 0] or [0]))
        cand = [lv for lv in ("C7", "C6", "C5", "C4", "C3") if area[lv] >= VA_FILLED * ref and tf[lv][sd]]
        if not cand or any(tf[lv][sd] is None for lv in levels[:levels.index(cand[0]) + 1]):
            raise SystemExit(f"vertebral artery {sd}: foramina transversaria not found at every level ({area})")
        e = cand[0]
        entry[sd] = e
        v2 = [np.array(tf[lv][sd]["centre"]) for lv in reversed(levels[:levels.index(e) + 1])]  # entry level up to C1
        Fe = frames[e]
        # V1: from the subclavian artery's surface point nearest a point 30 mm below the entry, to just below the entry
        sub, sa = ts_box("total", f"subclavian_artery_{'left' if sd == 'L' else 'right'}")
        sub_pts = nib.affines.apply_affine(sa, np.argwhere(sub))
        below = v2[0] - 10 * Fe[2] + 2 * Fe[1]
        origin_pt = sub_pts[np.argmin(np.linalg.norm(sub_pts - (v2[0] - 30 * Fe[2]), axis=1))]
        # V3: up out of the C1 foramen, behind the lateral mass, over the groove on the posterior arch (the lowest point
        # of the arch's top surface 10-20 mm from the midline, behind the canal), then towards the foramen magnum
        F1 = frames["C1"]
        c1 = C[LABEL_OF["C1"]]
        rel = (bone_pts["C1"] - c1) @ F1.T
        best = None
        for u in np.arange(10, 20.01, 1.0):
            col = rel[(np.abs(rel[:, 0] - sg * u) < 0.75) & (rel[:, 1] < -12)]
            if len(col):
                top = col[np.argmax(col[:, 2])]
                if best is None or top[2] < best[2]:
                    best = top
        if best is None:
            raise SystemExit(f"vertebral artery {sd}: the groove on the posterior arch of C1 was not found")
        g = c1 + best @ F1 + VA_RADIUS * 1.25 * F1[2]
        t1 = (v2[-1] - c1) @ F1.T
        q1 = c1 + t1[0] * F1[0] + (t1[1] - 2) * F1[1] + (t1[2] + 7) * F1[2]
        q2 = c1 + 0.5 * (t1[0] + best[0]) * F1[0] + 0.5 * (t1[1] - 2 + best[1]) * F1[1] + (best[2] + 4) * F1[2]
        dura = c1 + sg * 10 * F1[0] + (best[1] + 4) * F1[1] + (best[2] + 8) * F1[2]
        v4 = c1 + sg * 7 * F1[0] + (best[1] + 12) * F1[1] + (best[2] + 18) * F1[2]
        path = [origin_pt, below] + v2 + [q1, q2, g, dura, v4]
        curve = G.catmull([q - o for q in path], 8)
        parts[sd] = G.tube(curve, VA_RADIUS)
    write_glb(BUILD / "sp_vertebral_artery.glb", mesh_nodes(parts), {"id": "sp_vertebral_artery"})
    c4 = [np.array(tf[lv]["L"]["centre"]) for lv in ("C3", "C4") if tf[lv]["L"]] or [C[LABEL_OF["C4"]]]
    va = {"id": "sp_vertebral_artery", "name": "Vertebral artery", "token": "spArtery", "layer": "vessels", "category": "vessel",
          "region": "cervical", "schematic": True, "centroid": (np.mean(c4, axis=0) - o).round(2).tolist(),
          "source": f"Schematic: from the subclavian artery (TotalSegmentator) into the foramen transversarium of {entry['L']} (left) "
                    f"and {entry['R']} (right), inferred from the foramina's size on this CT; up through the foramina measured "
                    f"on this CT to C1; behind the lateral mass of the atlas and over the groove on its posterior arch (measured "
                    f"surface); then a short way towards the foramen magnum. Drawn {2 * VA_RADIUS:g} mm thick"}
    report["vertebralArtery"] = {"entry": entry, "areas": areas}
    data = {"entry": entry, "foramina": {lv: {sd: tf[lv][sd] and {k: tf[lv][sd][k] for k in ("area", "width", "depth")} for sd in ("L", "R")}
                                         for lv in levels}}
    # the width between the foramina's medial edges (a vertebral artery runs in each from its entry level up)
    for lv in levels:
        L_, R_ = tf[lv]["L"], tf[lv]["R"]
        if L_ and R_:
            c = C[LABEL_OF[lv]]
            uL = (np.array(L_["centre"]) - c) @ frames[lv][0]
            uR = (np.array(R_["centre"]) - c) @ frames[lv][0]
            data["foramina"][lv]["medialGap"] = round(float((uR - R_["width"] / 2) - (uL + L_["width"] / 2)), 1)
    print(f"vertebral artery: enters {entry}; foramen areas {areas}")
    return [va], data


PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())
CITES = json.loads((ROOT / "sources" / "citations.json").read_text())
DATASET = {
    "name": "VerSe whole-spine CT (sub-verse823) with TotalSegmentator segmentations",
    "licence": "CC BY-SA 4.0 (VerSe); segmentations made here with TotalSegmentator (Apache-2.0 models) from the same CT",
    "url": "https://osf.io/4skx2/",
    "cite": ["loffler2020", "liebl2021", "sekuboyina2021", "wasserthal2023"],
    "note": "One adult whole-body trauma CT from the VerSe 2020 dataset (0.72 x 0.72 x 0.7 mm), not an average and not in MNI "
            "space. Coordinates are millimetres from the centre of the L5 vertebral body. Vertebrae C1-L5: surfaces taken from the CT at "
            f"{BONE_HU} HU within reach of VerSe's hand-corrected masks. Sacrum, pelvis, discs and spinal canal contents: "
            "TotalSegmentator segmentations of the same CT.",
}


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


# references the spine section's cards cite (src/spine/content.ts), besides the datasets'
REF_KEYS = ("hwang2019", "merckaert2015", "hasegawa1996", "zindrick1987", "fardon2014",
            "osman2021", "luebbers2025", "downs2011", "lee2008", "isncsci2019", "rupp2021",
            "matsukawa2017", "zhao2021", "koeck2026", "jenkins2026", "gertzbein1990", "miyamoto2025", "wang2023",
            "moncadahabib2025", "nkwerem2024", "gkasdaris2016", "wangr2021", "verma2020", "avila2016", "lehman2003",
            "lehmankuklo2003", "mandelka2023", "kshettry2015", "komaitis2025", "scoscina2023", "jandial2012", "mozaffari2024",
            "epstein2023", "taterra2019", "moreno2021", "tanaka2000", "tudose2023", "hong2008", "bruneau2006", "vigo2020",
            "valenzuela2026", "tudose2026", "joaquim2018", "rathinavelu2021", "jiang2024", "joaquim2020", "singh2022",
            "kucherina2026", "jannelli2025", "hasan2025", "arumalla2021", "alicandri2020", "siribumrungwong2018",
            "kendirlioglu2026", "zhou2022", "aosurgeryref",
            "figa2025", "sung2018", "gonzalezvargas2026", "loganathan2023", "fidan2026", "kang2022", "zhang2020", "kong2022", "silverstein2015", "sugawara2015", "cheung2016")


def references() -> dict:
    return {k: {"citation": CITES[k]["citation"], "url": CITES[k]["url"]} for k in REF_KEYS}


def manifest_entries(items: list[dict], junction: bool = False) -> list[dict]:
    """Manifest entries of segmented structures (and of the craniocervical junction's, from its own CT)."""
    cites = [CITES[c] for c in DATASET["cite"]]
    name = "VerSe cervical CT (sub-gl090) with TotalSegmentator segmentations" if junction else DATASET["name"]
    base = {"aliases": [], "bytes": 0, "dataset": "verse", "source": name, "licence": DATASET["licence"],
            "citation": [c["citation"] for c in cites], "citationUrls": [c["url"] for c in cites], "refIds": DATASET["cite"]}
    return [{**base, "id": t["id"], "name": t["name"], "type": "bone" if t["category"] == "bone" else "soft",
             "layer": t["layer"], "file": f"assets/spine/{t['id']}.glb", "colour": colour(t["token"]),
             "category": t["category"], **({"level": t["level"]} if "level" in t else {}),
             **({"region": t["region"]} if "region" in t else {}),
             **({"schematic": True} if t.get("schematic") else {}),
             "derivation": t["source"] + ("." if t.get("schematic") else ", surface of the segmentation."),
             "centroid": {"L": t["centroid"], "R": t["centroid"]}} for t in items]


def write_manifest(verts: list[dict], ts: list[dict], dsc: list[dict]) -> None:
    cites = [CITES[c] for c in DATASET["cite"]]
    base = {"aliases": [], "bytes": 0, "dataset": "verse", "source": DATASET["name"], "licence": DATASET["licence"],
            "citation": [c["citation"] for c in cites], "citationUrls": [c["url"] for c in cites], "refIds": DATASET["cite"]}
    structures = []
    for v in verts:
        structures.append({**base, "id": v["id"], "name": f"{v['name']} vertebra", "type": "bone", "file": f"assets/spine/{v['id']}.glb",
                           "colour": colour("spBone"), "category": "vertebra", "level": v["name"], "region": v["region"],
                           "derivation": f"CT surface at {BONE_HU} HU within {MASK_REACH_MM} mm of VerSe's hand-corrected mask for {v['name']}.",
                           "centroid": {"L": v["centroid"], "R": v["centroid"]}})
    structures += manifest_entries([t for t in ts + dsc if t.get("region") != "ccj"])
    structures += manifest_entries([t for t in ts + dsc if t.get("region") == "ccj"], junction=True)
    GEN.mkdir(parents=True, exist_ok=True)
    manifest = {
        "space": "RAS millimetres of one CT, origin at the centre of the L5 vertebral body (not MNI)",
        "references": references(),
        "generatedBy": "pipeline/spine_segment.py (TotalSegmentator) + pipeline/spine_build.py + pipeline/compress.mjs",
        "structures": structures,
        "dataset": {"name": DATASET["name"], "licence": DATASET["licence"], "url": DATASET["url"], "note": DATASET["note"],
                    "citation": [c["citation"] for c in cites], "citationUrls": [c["url"] for c in cites]},
    }
    (GEN / "spine-manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    print(f"spine: {len(structures)} structures")


def validate() -> int:
    m = json.loads((GEN / "spine-manifest.json").read_text())
    fails, n = [], 0

    def check(ok: bool, msg: str) -> None:
        nonlocal n
        n += 1
        if not ok:
            fails.append(msg)
    by = {s["id"]: s for s in m["structures"]}
    # vertebrae run cranio-caudally: each centroid below the one above it
    names = [f"C{i}" for i in range(1, 8)] + [f"T{i}" for i in range(1, 13)] + [f"L{i}" for i in range(1, 6)]
    for a, b in zip(names, names[1:]):
        check(by[level_id(a)]["centroid"]["R"][2] > by[level_id(b)]["centroid"]["R"][2], f"{a} not above {b}")
    # the origin is VerSe's L5 centroid, the centre of the vertebral body: the whole vertebra's centroid (with its
    # posterior arch) lies close to the midline and level with it, some 10-20 mm behind it
    c5 = by["sp_l5"]["centroid"]["R"]
    check(abs(c5[0]) < 3 and abs(c5[2]) < 6 and -25 < c5[1] < -8, f"origin: L5 vertebra centroid at {c5}")
    # anatomy relative to the spine: the dural sac behind the L3 body, the hip bones either side
    l3 = np.array(by["sp_l3"]["centroid"]["R"])
    check(by["sp_dural_sac"]["centroid"]["R"][1] < l3[1], "dural sac should lie behind the vertebral bodies")
    check(by["sp_hip_left"]["centroid"]["R"][0] < 0 < by["sp_hip_right"]["centroid"]["R"][0], "hip bone sides")
    check(by["sp_sacrum"]["centroid"]["R"][2] < by["sp_l5"]["centroid"]["R"][2], "sacrum below L5")
    for lv in ("l1_l2", "l2_l3", "l3_l4", "l4_l5"):
        check(f"sp_disc_{lv}" in by, f"disc {lv} missing")
    # thoracic: discs C7-T1 to T12-L1, roots T1-T12
    for a, b in zip(THORACIC, THORACIC[1:]):
        check(f"sp_disc_{a.lower()}_{b.lower()}" in by, f"disc {a}-{b} missing")
    for i in range(1, 13):
        check(f"sp_root_t{i}" in by, f"root T{i} missing")
    # cervical: discs C2-C3 to C7-T1, roots C3-C8, the vertebral artery; the neck's soft tissue on the right sides and in
    # the right order from front to back (trachea, oesophagus, vertebral bodies), the carotids beside the trachea
    for a, b in zip(CERVICAL, CERVICAL[1:]):
        check(f"sp_disc_{a.lower()}_{b.lower()}" in by, f"disc {a}-{b} missing")
    for i in range(3, 9):
        check(f"sp_root_c{i}" in by, f"root C{i} missing")
    check(by.get("sp_vertebral_artery", {}).get("schematic") is True, "vertebral artery missing or not flagged schematic")
    for _, cls, sid, *_ in CERVICAL_TS:
        check(sid in by, f"{sid} missing")
    for left in [x for x in by if x.endswith("_left") and by[x].get("region") == "cervical"]:
        right = left.replace("_left", "_right")
        check(right in by and by[left]["centroid"]["R"][0] < by[right]["centroid"]["R"][0], f"{left}: not left of its right partner")
    if all(k in by for k in ("sp_trachea", "sp_esophagus", "sp_c6", "sp_cca_left", "sp_cca_right")):
        y = {k: by[k]["centroid"]["R"][1] for k in ("sp_trachea", "sp_esophagus", "sp_c6")}
        check(y["sp_trachea"] > y["sp_esophagus"] > y["sp_c6"], f"front-to-back order trachea, oesophagus, C6: {y}")
        xt = by["sp_trachea"]["centroid"]["R"][0]
        check(by["sp_cca_left"]["centroid"]["R"][0] < xt < by["sp_cca_right"]["centroid"]["R"][0], "carotids either side of the trachea")
    # the craniocervical junction (its own CT): its structures, and every measurement within the range Fidan 2026 found
    # in 500 adults (the landmarks are found automatically: a value outside it more likely means a misplaced landmark)
    for sid in ("sp_ccj_occiput", "sp_ccj_c1", "sp_ccj_c2", "sp_ccj_c3", "sp_ccj_dural_sac"):
        check(sid in by and by[sid].get("region") == "ccj", f"{sid} missing")
    lv = json.loads((GEN / "spine-levels.json").read_text()).get("ccj")
    check(lv is not None, "ccj measurements missing")
    if lv:
        mm, L = lv["measurements"], lv["landmarks"]
        for k, (lo, hi) in {"adi": (0.36, 2.92), "padi": (13.11, 26.81), "mcrae": (28.53, 43.11), "bdi": (1.66, 9.34),
                            "bai": (2.54, 11.34), "cca": (116.03, 179.62)}.items():
            check(lo <= mm[k] <= hi, f"ccj {k} {mm[k]} outside {lo}-{hi}")
        check(mm["densBelowMcRae"] > 0, "ccj: the dens tip above McRae's line")
        check(L["basion"][1] > L["opisthion"][1] and L["basion"][2] > L["densTip"][2], "ccj: basion not in front of the opisthion and above the dens")
        check(lv["axialPoints"] >= 8 and lv["clivusMm"] >= 10, "ccj: too little of the C2 body or the clivus for its lines")
    print(f"spine validation: {n - len(fails)}/{n} checks passed")
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


def finalize() -> None:
    p = GEN / "spine-manifest.json"
    m = json.loads(p.read_text())
    keep = {Path(it["file"]).name for it in m["structures"]}
    for f in (PUBLIC / "spine").glob("*.glb"):
        if f.name not in keep:
            f.unlink()
    for it in m["structures"]:
        it["bytes"] = (REPO / "public" / it["file"]).stat().st_size
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    shutil.copy(p, PUBLIC / "spine-manifest.json")


def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)
    for old in BUILD.glob("*.glb"):
        old.unlink()
    report: dict = {}
    verts = vertebrae(report)
    ts = ts_structures(report)
    dsc = discs(report, verts)
    levels, roots = segment_geometry(report, "lumbar")
    levels_t, roots_t = segment_geometry(report, "thoracic")
    levels_c, roots_c = segment_geometry(report, "cervical")
    soft = cervical_soft(report)
    va, va_data = vertebral_artery(report)
    landmarks = neck_landmarks(levels_c)
    import spine_ccj
    ccj, ccj_data, _ = spine_ccj.build(report)
    (BUILD / "report.json").write_text(json.dumps(report, indent=1, default=float))
    write_manifest(verts, ts, dsc + roots + roots_t + roots_c + soft + va + ccj)
    (GEN / "spine-levels.json").write_text(json.dumps({"lumbar": levels, "thoracic": levels_t, "cervical": levels_c,
                                                       "vertebralArtery": va_data, "neckLandmarks": landmarks, "ccj": ccj_data},
                                                      indent=1, default=float))
    return 0


if __name__ == "__main__":
    if sys.argv[1:] == ["finalize"]:
        finalize()
        sys.exit(validate())
    if sys.argv[1:] == ["refs"]:  # after editing REF_KEYS: refresh the manifest's references without rebuilding
        mp = GEN / "spine-manifest.json"
        man = json.loads(mp.read_text())
        man["references"] = references()
        mp.write_text(json.dumps(man, indent=1, ensure_ascii=False))
        sys.exit(0)
    sys.exit(main())
