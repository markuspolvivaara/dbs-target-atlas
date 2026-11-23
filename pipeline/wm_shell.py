"""The white-matter section's tracts drawn as shells (C.WM_SHELLS): the acoustic radiation.

  pipeline/.venv/bin/python -I -W ignore pipeline/wm_shell.py
  node pipeline/compress.mjs wm wm_ar.glb
  pipeline/.venv/bin/python -I -W ignore pipeline/manifest.py        (wm-manifest.json: the shell's entry)
  pipeline/.venv/bin/python -I -W ignore pipeline/validate.py        (its checks)

Why a shell. HCP-1065's acoustic radiation ends beside the atrium, about 22 mm from Heschl's gyrus, and was withdrawn
(C.WmTract.withdrawn). The Pandora atlases (Hansen 2021; C.DATASETS["pandora"]) hold no streamlines: per voxel, the
share of their subjects in whom a bundle passed. A shell is the surface round the voxels where that share is at least
the tract's level; streamlines drawn inside it would be invented.

Inputs
  pipeline/data/raw/pandora/Xtract.nii.gz, Xtract_info.csv   (fetch_sources.py; the bundle's volume is found by its
                                                             file name in the table)
  pipeline/data/build/cortex/ctx_g_temp_sup_g_t_transv.glb   the cortex section's Heschl's gyrus (Destrieux), measured
                                                             against, not drawn
  pipeline/data/build/brainstem/bs_mgb.glb                   the brainstem section's medial geniculate body, likewise
  pipeline/data/raw/hcp1065/tracts/projection/               HCP-1065's corticospinal tract (the space check) and its
                                                             withdrawn acoustic radiation (how far short it ended)
Writes
  pipeline/data/build/wm/<id>.glb     one closed surface per side
  pipeline/data/build/report.json     the tract's entry: per side its size, its ends and what was measured

How the shell is made, per side
  - cut medial_cut_mm from the midline (the acoustic radiation: at the medial edge of the medial geniculate body,
    medial of which the map runs on towards the midline at lower shares; at 0.9 the map ends there by itself);
  - of the voxels at or above the level, the largest connected piece;
  - the map smoothed (Gaussian, smooth_mm) so the surface is not stepped at the 1 mm voxels, and the surface taken by
    marching cubes at the smoothed map's level that encloses as many voxels as that piece, wound outward.
"""
from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree
import trimesh
from skimage import measure

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build as B  # noqa: E402
import config as C  # noqa: E402
from glb import TRIANGLES, read_glb_full, write_glb  # noqa: E402

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
BUILD = ROOT / "data" / "build"
HESCHL = BUILD / "cortex" / "ctx_g_temp_sup_g_t_transv.glb"
HESCHL_NEAR_MM = 5.0     # the share of the gyrus's surface within this of the shell is reported
MGB = BUILD / "brainstem" / "bs_mgb.glb"     # the brainstem section's medial geniculate body (Z-Anatomy, fitted)


def bundles() -> dict[str, dict]:
    """Xtract_info.csv: file name -> its volume's index in Xtract.nii.gz and the subjects in whom it was found."""
    with open(RAW / "pandora" / "Xtract_info.csv", newline="") as f:
        return {r["File Name"]: {"index": int(r["ID"]), "subjects": int(r["#ALL"])} for r in csv.DictReader(f)}


def normals(v: np.ndarray, t: np.ndarray) -> np.ndarray:
    n = np.zeros_like(v)
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    for k in range(3):
        np.add.at(n, t[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.where(ln == 0, 1, ln)


def shell(img, index: int, t: C.WmShell) -> tuple[np.ndarray, np.ndarray, dict]:
    """A bundle's shell: vertices (RAS mm), triangles, and what was measured on the map."""
    zooms = np.asarray(img.header.get_zooms()[:3], float)
    assert np.allclose(zooms, zooms[0]), "the atlas's voxels are not cubes"
    assert np.allclose(img.affine[:3, :3], np.diag(np.diag(img.affine)[:3])), "the atlas's grid is not along the axes"
    v = np.asanyarray(img.dataobj[..., index]).astype(np.float32)
    x = nib.affines.apply_affine(img.affine, np.argwhere(np.ones(v.shape[:1] + (1, 1))))[:, 0]   # each slab's x (mm)
    medial = np.abs(x) < t.medial_cut_mm
    cut = int((v[medial] >= t.level).sum())
    v[medial] = 0.0
    lab, n = ndimage.label(v >= t.level)
    sizes = ndimage.sum(np.ones(lab.shape, np.float32), lab, range(1, n + 1))
    keep = lab == 1 + int(np.argmax(sizes))
    # smoothed, the map's peaks are lower: the surface is taken at the smoothed map's level that holds as many voxels
    # as the piece has at the tract's level, so the shell keeps its volume
    vs = ndimage.gaussian_filter(np.where(keep | (v < t.level), v, 0.0), t.smooth_mm / zooms[0])
    vs[medial] = 0.0
    level = float(np.sort(vs, axis=None)[-int(keep.sum())])
    verts, faces, _, _ = measure.marching_cubes(vs, level)
    P = nib.affines.apply_affine(img.affine, verts)
    a, b, c = P[faces[:, 0]], P[faces[:, 1]], P[faces[:, 2]]
    volume = float(np.einsum("ij,ij->i", a, np.cross(b, c)).sum() / 6.0)
    if volume < 0:
        faces, volume = faces[:, ::-1], -volume
    rep = {"volumeMl": round(volume / 1000.0, 2), "voxelsAtLevel": int((v >= t.level).sum()), "pieces": int(n),
           "droppedVoxels": int(sizes.sum() - sizes.max()), "cutVoxels": cut, "smoothedLevel": round(level, 3),
           "thickestMm": round(float(2 * ndimage.distance_transform_edt(keep, sampling=zooms).max()), 1),
           "mapMax": round(float(v.max()), 3)}
    return P, faces, rep


def space_check(img, table: dict) -> dict:
    """HCP-1065's corticospinal streamlines in Pandora's corticospinal map: the mean share along them as they lie, and
    shifted by up to 2 mm each way (the best). The two atlases are then in one space to within that."""
    inv = np.linalg.inv(img.affine)
    out = {}
    for side in ("L", "R"):
        v = np.asanyarray(img.dataobj[..., table[f"cst_{side.lower()}"]["index"]]).astype(np.float32)
        P = np.vstack(B.read_trk_gz(RAW / "hcp1065" / "tracts" / "projection" / f"CST_{side}.trk.gz"))[::7]
        mean = lambda off: float(ndimage.map_coordinates(v, nib.affines.apply_affine(inv, P + off).T, order=1).mean())  # noqa: E731
        here = ndimage.map_coordinates(v, nib.affines.apply_affine(inv, P).T, order=1)
        shifts = [np.array(s, float) for s in np.ndindex(5, 5, 5)]
        best = max(((mean(s - 2.0), (s - 2.0).tolist()) for s in shifts), key=lambda r: r[0])
        out[side] = {"meanShare": round(float(here.mean()), 3), "atLeastTenth": round(float((here >= 0.1).mean()), 3),
                     "bestShiftMm": best[1], "bestMeanShare": round(best[0], 3)}
    return out


def main() -> int:
    img = nib.load(RAW / "pandora" / "Xtract.nii.gz")
    table = bundles()
    heschl = {s: np.asarray(nd["positions"], float) for s, nd in read_glb_full(HESCHL).items()}
    fine = lambda nd: trimesh.remesh.subdivide_to_size(np.asarray(nd["positions"], float), np.asarray(nd["indices"]).reshape(-1, 3), 0.5)[0]  # noqa: E731
    mgb = {s: fine(nd) for s, nd in read_glb_full(MGB).items()}
    space = space_check(img, table)
    print("space check (HCP-1065's corticospinal streamlines in Pandora's map):", space)
    rp = BUILD / "report.json"
    report = json.loads(rp.read_text())
    for t in C.WM_SHELLS:
        nodes, rep = [], {"level": t.level, "medialCutMm": t.medial_cut_mm, "space": space}
        for side in ("L", "R"):
            b = table[t.bundles[side]]
            P, F, r = shell(img, b["index"], t)
            d = cKDTree(P).query(heschl[side])[0]
            r.update({"subjects": b["subjects"], "vertices": int(len(P)), "triangles": int(len(F)),
                      "meanX": round(float(P[:, 0].mean()), 2), "centroid": P.mean(0).round(2).tolist(),
                      "medialEndMm": round(float(np.abs(P[:, 0]).min()), 1), "lateralEndMm": round(float(np.abs(P[:, 0]).max()), 1),
                      "heschlNearestMm": round(float(d.min()), 1), "heschlNearShare": round(float((d <= HESCHL_NEAR_MM).mean()), 2),
                      "mgbNearestMm": round(float(cKDTree(mgb[side]).query(trimesh.remesh.subdivide_to_size(P, F, 0.5)[0])[0].min()), 1)})
            if t.id == "wm_ar":
                # HCP-1065's bundle, withdrawn: how far from the gyrus its lateral ends lie (the median)
                old = B.read_trk_gz(RAW / "hcp1065" / "tracts" / "projection" / f"AR_{side}.trk.gz")
                ends = np.array([s[0] if abs(s[0][0]) > abs(s[-1][0]) else s[-1] for s in old])
                r["hcp1065EndsMm"] = round(float(np.median(cKDTree(heschl[side]).query(ends)[0])), 1)
            nodes.append({"name": side, "positions": P, "normals": normals(P, F), "indices": F, "mode": TRIANGLES})
            rep[side] = r
            print(f"wm shell {t.id} {side}: {r}")
        write_glb(BUILD / "wm" / f"{t.id}.glb", nodes, {"id": t.id})
        report[t.id] = rep
    rp.write_text(json.dumps(report, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
