"""Skull base v1 (the Z-Anatomy model): its cranial bones as a bone field on a 0.5 mm grid, for the craniotomies and the
brain's shapes that v3 cuts and fits on its CT (skullbase_v3_approach.py, skullbase_v1_brain.py with the v1 profile).

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_skull.py      (after skullbase_export.py)

v1 draws Z-Anatomy's own bone meshes (pipeline/data/build/skullbase/export.json, millimetres from the hypophysial fossa
landmark). Each is rasterised on one grid in that frame: a closed mesh filled (its inside by the parity of crossings), an
nearly closed one (the frontal, occipital, sphenoid and ethmoid bones have a few dozen open edges) by the parity of
crossings along each axis, where two of the three agree, with the voxels within SURF_MM of its surface (so its thin
sheets stay whole). The paranasal sinuses' own meshes (Sinus of frontal bone, Sinus of sphenoid bone) are air,
taken out of the bone. Gaps the meshes leave between neighbouring bones (close_sutures) are bridged. The field is that mask softened by a Gaussian of SOFT_MM, its surface at skullbase_ct.SURFACE_LEVEL
as v2's and v3's are, so the same craniotomy code meshes the cut edge the same way.

Writes pipeline/data/build/skullbase/skull_bone.npz (b: the field, a: grid -> frame), skull.json (bones: {name: verts,
tris, ao}, the meshes v1 draws, which a cut bone keeps away from its cut) and sinuses.json (Z-Anatomy's own sigmoid and
transverse sinuses as the craniotomies take them: the sigmoid from the jugular bulb up to its junction with the transverse,
the transverse from that junction back to the confluence; centre lines and radii, as v3 writes its traced ones).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from skullbase_brain import fill  # noqa: E402

BUILD = ROOT / "data" / "build" / "skullbase"
STEP = 0.5
SURF_MM = 0.5        # a nearly closed bone's surface counts as bone this far round it (thin sheets stay whole)
SOFT_MM = 0.35       # the mask softened by this (Gaussian), so the surface taken from it shows no grid steps
AIR = ("Sinus of frontal bone", "Sinus of sphenoid bone")
MARGIN_MM = 6.0


def main() -> int:
    np.random.seed(0)        # (trimesh samples surfaces at random: seeded, so a run gives the same files)
    ex = json.loads((BUILD / "export.json").read_text())
    bones = {n: b for n, b in ex["bones"].items() if n not in AIR}
    allv = np.vstack([np.array(b["verts"], float) for b in ex["bones"].values()])
    lo = np.floor((allv.min(0) - MARGIN_MM) / STEP) * STEP
    shape = tuple(int(x) for x in np.ceil((allv.max(0) + MARGIN_MM - lo) / STEP).astype(int) + 1)
    mask = np.zeros(shape, bool)
    rep = {}
    for n, b in bones.items():
        V, T = np.array(b["verts"], float), np.array(b["tris"], int)
        m = trimesh.Trimesh(V, T, process=True)
        if m.is_watertight:
            if m.volume < 0:
                m.invert()
            got = fill(np.asarray(m.vertices), np.asarray(m.faces), lo, shape, STEP)
            how = "filled"
        else:
            # nearly closed (a few dozen open edges): the inside by the parity of crossings along each axis, kept where
            # two of the three agree (a ray through a small hole miscounts along one axis only), with the voxels its
            # surface passes through, so a thin sheet stays whole; the grid's surface then lies on Z-Anatomy's own
            # (a cut bone's new faces meet the faces it keeps)
            P = np.vstack([V, m.sample(int(m.area / (0.25 * STEP * STEP)))])
            ijk = np.rint((P - lo) / STEP).astype(int)
            surf = np.zeros(shape, bool)
            surf[tuple(ijk.T)] = True
            # (a sheet one voxel thick would fall below the surface level where the smoothing meets it obliquely, leaving
            # holes: the surface's voxels taken SURF_MM thick)
            surf = ndimage.binary_dilation(surf, iterations=max(1, int(round(SURF_MM / STEP))))
            votes = np.zeros(shape, np.uint8)
            for ax in range(3):
                perm = [a for a in range(3) if a != ax] + [ax]            # the ray along axis ax
                inv = np.argsort(perm)
                f = fill(np.asarray(m.vertices)[:, perm], np.asarray(m.faces), lo[perm], tuple(np.array(shape)[perm]), STEP)
                votes += np.transpose(f, inv).astype(np.uint8)
            got = (votes >= 2) | surf
            how = "parity (3 axes, majority)"
        mask |= got
        rep[n] = {"how": how, "ml": round(float(got.sum()) * STEP ** 3 / 1000, 1)}
        print(n, rep[n])
    for n in AIR:                # the sinuses' air
        if n in ex["bones"]:
            b = ex["bones"][n]
            m = trimesh.Trimesh(np.array(b["verts"], float), np.array(b["tris"], int), process=True)
            P = np.vstack([np.asarray(m.vertices), m.sample(int(m.area / (0.25 * STEP * STEP)))])
            ijk = np.rint((P - lo) / STEP).astype(int)
            s = np.zeros(shape, bool)
            s[tuple(ijk.T)] = True
            air = ndimage.binary_fill_holes(ndimage.binary_dilation(s, iterations=1)) & ~ndimage.binary_dilation(s, iterations=1)
            mask &= ~air
            rep[n] = {"how": "air", "ml": round(float(air.sum()) * STEP ** 3 / 1000, 1)}
    mask, bridged = close_sutures(mask, lo, bones)
    rep["suturesBridgedMl"] = round(float(bridged) * STEP ** 3 / 1000, 2)
    field = ndimage.gaussian_filter(mask.astype(np.float32), SOFT_MM / STEP)
    a = np.diag([STEP, STEP, STEP, 1.0])
    a[:3, 3] = lo
    np.savez_compressed(BUILD / "skull_bone.npz", b=field.astype(np.float16), a=a)
    (BUILD / "skull.json").write_text(json.dumps({"bones": bones, "report": rep}))
    print("grid", shape, "bone", round(float(mask.sum()) * STEP ** 3 / 1000, 1), "ml")
    (BUILD / "sinuses.json").write_text(json.dumps(sinuses(ex)))
    return 0


def close_sutures(mask: np.ndarray, lo: np.ndarray, bones: dict) -> tuple[np.ndarray, int]:
    """Bridge the gaps Z-Anatomy's bone meshes leave between neighbouring bones (at the asterion, the temporal and
    occipital meshes do not meet): a closing of the mask by SUTURE_MM, the added voxels kept only where two different
    bones lie within SUTURE_NEAR_MM (a gap between bones, not a groove in one), above SUTURE_BELOW_Z and not within
    FORAMEN_KEEP_MM of a foramen (the natural openings, located on this model, stay)."""
    from scipy.spatial import cKDTree
    r = int(round(SUTURE_MM / STEP))
    ball = np.sum((np.indices((2 * r + 1,) * 3) - r) ** 2, axis=0) <= r * r
    pad = r + 1
    closed = ndimage.binary_closing(np.pad(mask, pad), ball)[pad:-pad, pad:-pad, pad:-pad]
    add = closed & ~mask
    idx = np.argwhere(add)
    P = lo + STEP * idx
    names = list(bones)
    pts = np.vstack([np.array(bones[n]["verts"], float) for n in names])
    lab = np.concatenate([np.full(len(bones[n]["verts"]), k) for k, n in enumerate(names)])
    tree = cKDTree(pts)
    near = tree.query_ball_point(P, SUTURE_NEAR_MM)
    two = np.array([len(set(lab[j])) >= 2 for j in near], bool)
    keep = two & (P[:, 2] > SUTURE_BELOW_Z)
    lm = json.loads((ROOT.parent / "src" / "data" / "generated" / "sb-landmarks.json").read_text())
    fora = np.array([l["ras"] for l in lm if any(k in l["name"] for k in ("foramen", "Foramen", "fissure", "canal", "meatus", "Hiatus"))])
    if len(fora):
        keep &= cKDTree(fora).query(P)[0] > FORAMEN_KEEP_MM
    out = mask.copy()
    out[tuple(idx[keep].T)] = True
    print("sutures bridged:", int(keep.sum()), "voxels")
    return out, int(keep.sum())


SUTURE_MM = 3.0
SUTURE_NEAR_MM = 4.0
SUTURE_BELOW_Z = -15.0
FORAMEN_KEEP_MM = 8.0


def sinuses(ex: dict) -> dict:
    """Z-Anatomy's sigmoid and transverse sinuses in v3's sinuses.json form: the sigmoid's path from the bulb to the
    transverse-sigmoid junction, the transverse's from that junction to the confluence (each Z-Anatomy run reversed or not
    so that it does)."""
    out = {"sigmoid": {}, "transverse": {}}
    for s, z in (("R", "r"), ("L", "l")):
        sig = np.array(max(ex["lines"][f"Sigmoid sinus.{z}"]["runs"], key=len), float)
        trn = np.array(max(ex["lines"][f"Transverse sinus.{z}"]["runs"], key=len), float)
        # the junction: the ends of the two that meet
        ends = [(i, j, np.linalg.norm(sig[i, :3] - trn[j, :3])) for i in (0, -1) for j in (0, -1)]
        i, j, _ = min(ends, key=lambda e: e[2])
        sig = sig if i == -1 else sig[::-1]          # bulb ... junction
        trn = trn if j == 0 else trn[::-1]           # junction ... confluence
        out["sigmoid"][s] = {"path": np.round(sig[:, :3], 2).tolist(), "radius": np.round(sig[:, 3], 2).tolist()}
        out["transverse"][s] = {"path": np.round(trn[:, :3], 2).tolist(), "radius": np.round(trn[:, 3], 2).tolist()}
    return out


if __name__ == "__main__":
    sys.exit(main())
