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
LABEL_OF = {v: k for k, v in VERSE_LEVELS.items()} | {"S1": 26}
DISC_LABEL = 50
ROOT_RADIUS = 1.5     # schematic drawing sizes (mm), not measurements
DRG_RADII = (3.0, 3.0, 5.0)


def mesh_nodes(parts: dict[str, tuple]) -> list[dict]:
    return [{"name": side, "positions": p, "normals": n, "indices": t, "mode": 4} for side, (p, n, t) in parts.items() if len(t)]


def merge(meshes: list[tuple]) -> tuple:
    ps, ns, ts, off = [], [], [], 0
    for p, n, t in meshes:
        ps.append(p); ns.append(n); ts.append(t + off); off += len(p)
    return np.vstack(ps), np.vstack(ns), np.vstack(ts)


def lumbar(report: dict) -> tuple[list[dict], list[dict]]:
    """Measured canal, foramina and disc height per lumbar level, and schematic roots and ganglia L1-S1."""
    img = nib.load(MASK)
    aff = img.affine
    o = origin()
    ctd = json.loads(CTD.read_text())
    C = {c["label"]: nib.affines.apply_affine(aff, [c["X"], c["Y"], c["Z"]]) for c in ctd if "label" in c}
    # read only the lumbar block: whole-volume arrays of this CT are 0.3-1.3 GB each
    inv = np.linalg.inv(aff)
    # 90 mm around the spine, from 110 mm below L5 (sacrum, S1 roots) to 60 mm above T12; corners mapped to voxels
    corners = np.array([[x, y, z] for x in (-90, 90) for y in (-90, 90) for z in (-110, 60)], float)
    span = np.vstack([nib.affines.apply_affine(inv, C[LABEL_OF["L5"]] + np.where(corners[:, 2:3] < 0, corners, 0)),
                      nib.affines.apply_affine(inv, C[LABEL_OF["T12"]] + np.where(corners[:, 2:3] > 0, corners, 0))])
    lo = np.maximum(np.floor(span.min(0)).astype(int), 0)
    hi = np.minimum(np.ceil(span.max(0)).astype(int) + 1, img.shape)
    cr = tuple(slice(a, b) for a, b in zip(lo, hi))
    vm, a2 = load_mask(cr)
    sac, _ = ts_mask("total", "sacrum+vertebrae_S1", cr)
    disc, _ = ts_mask("vertebrae_body", "intervertebral_discs", cr)
    sacpts_mask, _ = ts_mask("total", "spinal_cord", cr)
    lab = vm.copy()
    lab[sac & (lab == 0)] = LABEL_OF["S1"]
    lab[disc & (lab == 0)] = DISC_LABEL
    grid = G.Grid(lab, a2)

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
    C[LABEL_OF["S1"]] = 2 * disc_between("L5", "S1")[0] - C[LABEL_OF["L5"]]  # S1 body centre: L5 mirrored across the disc

    levels, roots = [], []
    canals = {}
    for up, down in zip(LUMBAR, LUMBAR[1:]):
        cu, cd = C[LABEL_OF[up]], C[LABEL_OF[down]]
        F = G.frame(cu, cd)
        h = float(np.linalg.norm(cu - cd))
        mid = (cu + cd) / 2
        can = G.canal(grid, LABEL_OF[up], cu, F)
        canals[up] = (can, F)
        fors = {}
        for sd, sg in (("L", -1), ("R", 1)):
            fo = None
            if can and down != "S1":  # the plane method does not capture the L5-S1 foramen in this CT
                fo = G.foramen(grid, LABEL_OF[up], LABEL_OF[down], {DISC_LABEL}, mid, F,
                               (can["uMin"] - 1) if sg < 0 else (can["uMax"] + 1), h)
            fors[sd] = fo
        dc, dpts = disc_between(up, down)
        levels.append({"level": up, "pair": f"{up}-{down}", "bodyCentre": (cu - o).round(2).tolist(),
                       "canal": can and {k: can[k] for k in ("width", "depth", "area")},
                       "foramen": {sd: fo and {k: fo[k] for k in ("height", "width", "area")} for sd, fo in fors.items()},
                       "discCentre": (dc - o).round(2).tolist()})
        report.setdefault("lumbar", {})[f"{up}-{down}"] = levels[-1]

        # ---- the root that exits here: the upper level's root, below its pedicle (skip T12: a thoracic root)
        if up != "T12":
            above = LUMBAR[LUMBAR.index(up) - 1]
            dc_above, _ = disc_between(above, up)
            Fa = G.frame(C[LABEL_OF[above]], cu)
            parts, drgs, estimated = {}, {}, {}
            for sd, sg in (("L", -1), ("R", 1)):
                p0 = G.lateral_point(sac_pts, dc_above, Fa, sg)  # take-off: lateral wall of the dural sac at the disc above
                edge = (can["uMin"] if sg < 0 else can["uMax"]) if can else sg * 12.0
                p1 = cu + (edge - sg * 2.5) * F[0] + ((can["v"] + 3) if can else -20) * F[1]  # lateral recess, own level
                fo = fors[sd]
                if fo:
                    c = np.array(fo["centre"])
                    p2 = c + ((fo["top"] - fo["w"]) / 2) * F[2]  # upper part of the foramen, beneath the pedicle
                else:
                    p2 = mid + (edge + sg * 6) * F[0] + ((can["v"] if can else -20)) * F[1] + 0.15 * h * F[2]
                estimated[sd] = fo is None
                p3 = p2 + sg * 15 * F[0] + 8 * F[1] - 10 * F[2]
                p4 = p3 + sg * 15 * F[0] + 10 * F[1] - 20 * F[2]
                path = [p for p in (p0, p1, p2, p3, p4) if p is not None]
                curve = G.catmull([q - o for q in path], 8)
                parts[sd] = G.tube(curve, ROOT_RADIUS)
                ax = curve[-1] - curve[0]
                ez = (p3 - p2) / np.linalg.norm(p3 - p2)
                ex = np.cross(ez, F[2]); ex /= np.linalg.norm(ex)
                drgs[sd] = G.ellipsoid(p2 - o + 2.0 * (p3 - p2) / np.linalg.norm(p3 - p2), np.stack([ex, np.cross(ez, ex), ez]), DRG_RADII)
            rid = f"sp_root_{up.lower()}"
            write_glb(BUILD / f"{rid}.glb", mesh_nodes(parts), {"id": rid})
            gid = f"sp_drg_{up.lower()}"
            write_glb(BUILD / f"{gid}.glb", mesh_nodes(drgs), {"id": gid})
            exit_note = (f"exits through the {up}-{down} foramen (measured position)" if not any(estimated.values())
                         else f"exits through the {up}-{down} foramen, whose position is estimated on "
                              f"{' and '.join(k for k, v in estimated.items() if v)} (not captured by the measurement)")
            roots.append({"id": rid, "name": f"{up} nerve root", "level": up, "token": "spRoot", "layer": "tracts", "category": "root",
                          "schematic": True, "estimated": [k for k, v in estimated.items() if v],
                          "centroid": (p2 - o).round(2).tolist(),
                          "source": f"Schematic: leaves the lateral wall of the dural sac at the {above}-{up} disc, runs in the "
                                    f"lateral recess at {up} and {exit_note}; drawn {2 * ROOT_RADIUS:g} mm thick"})
            roots.append({"id": gid, "name": f"{up} dorsal root ganglion", "level": up, "token": "spRoot", "layer": "tracts",
                          "category": "ganglion", "schematic": True, "centroid": (p2 - o).round(2).tolist(),
                          "source": "Schematic: drawn in the upper part of the foramen, not to scale"})

        # ---- where a herniation of each kind sits at this disc (for the lesion-to-root tool; schematic positions):
        # paracentral = posterior edge of the disc halfway between the midline and the canal edge; foraminal = in the
        # foramen at disc level (the measured foramen, else the root's exit point); far lateral = 12 mm further out
        if up != "T12":
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
        curve = G.catmull([q - o for q in (p0, p1, p2, p3, p4) if q is not None], 8)
        parts[sd] = G.tube(curve, ROOT_RADIUS)
        ez = (p2 - p1) / np.linalg.norm(p2 - p1)
        ex = np.cross(ez, Fs[1]); ex /= np.linalg.norm(ex)
        drgs[sd] = G.ellipsoid((p1 + p2) / 2 - o, np.stack([ex, np.cross(ez, ex), ez]), DRG_RADII)
    write_glb(BUILD / "sp_root_s1.glb", mesh_nodes(parts), {"id": "sp_root_s1"})
    write_glb(BUILD / "sp_drg_s1.glb", mesh_nodes(drgs), {"id": "sp_drg_s1"})
    roots.append({"id": "sp_root_s1", "name": "S1 nerve root", "level": "S1", "token": "spRoot", "layer": "tracts", "category": "root",
                  "schematic": True, "estimated": ["L", "R"], "centroid": (cs1 - o).round(2).tolist(),
                  "source": "Schematic: leaves the lateral wall of the dural sac at the L5-S1 disc, runs in the lateral recess "
                            "of S1 and leaves through the first sacral foramen, whose position is estimated (not captured by "
                            f"the measurement); drawn {2 * ROOT_RADIUS:g} mm thick"})
    roots.append({"id": "sp_drg_s1", "name": "S1 dorsal root ganglion", "level": "S1", "token": "spRoot", "layer": "tracts",
                  "category": "ganglion", "schematic": True, "centroid": (cs1 - o).round(2).tolist(),
                  "source": "Schematic: drawn inside the canal, where the S1 ganglion more often lies (Hasegawa 1996); not to scale"})
    print(f"lumbar: {len(levels)} levels, {len(roots)} root parts; foramina measured "
          f"{sum(1 for lv in levels for v in lv['foramen'].values() if v)}/{2 * len(levels)}")
    return levels, roots


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
            "moncadahabib2025", "nkwerem2024")


def references() -> dict:
    return {k: {"citation": CITES[k]["citation"], "url": CITES[k]["url"]} for k in REF_KEYS}


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
    for t in ts + dsc:
        structures.append({**base, "id": t["id"], "name": t["name"], "type": "bone" if t["category"] == "bone" else "soft",
                           **({"region": "lumbar"} if t["category"] in ("root", "ganglion") else {}),
                           "layer": t["layer"], "file": f"assets/spine/{t['id']}.glb", "colour": colour(t["token"]),
                           "category": t["category"], **({"level": t["level"]} if "level" in t else {}),
                           **({"region": t["region"]} if "region" in t else {}),
                           **({"schematic": True} if t.get("schematic") else {}),
                           "derivation": t["source"] + ("." if t.get("schematic") else ", surface of the segmentation."),
                           "centroid": {"L": t["centroid"], "R": t["centroid"]}})
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
    levels, roots = lumbar(report)
    (BUILD / "report.json").write_text(json.dumps(report, indent=1, default=float))
    write_manifest(verts, ts, dsc + roots)
    (GEN / "spine-levels.json").write_text(json.dumps({"lumbar": levels}, indent=1, default=float))
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
