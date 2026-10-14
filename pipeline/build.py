"""Convert source atlases into web assets.

Steps
  1. nuclei / sweet spots: label volume -> Gaussian pre-smooth -> marching
     cubes -> affine to MNI mm -> Taubin smoothing -> quadric decimation
  2. cortex: Lead-DBS template surface -> decimation -> parcel labels
     (HMAT volume, Desikan-Killiany annotation) -> one sub-mesh per parcel
  3. tracts: streamlines -> filter -> resample to 1 mm -> fixed-seed subsample
  4. T1: 0.5 mm template -> 1 mm whole brain + 0.5 mm subcortical crop (uint8)
  5. coordinates.json (centroids, sweet-spot peaks) and build/report.json

Uncompressed GLBs go to pipeline/data/build/; compress.mjs writes the
meshopt-compressed copies the app ships. Run validate.py afterwards.

Usage:  python pipeline/build.py
"""
from __future__ import annotations

import gzip
import json
import sys
from pathlib import Path

import h5py
import nibabel as nib
import numpy as np
import scipy.io as sio
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree
from skimage import measure

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402
from glb import LINES, TRIANGLES, write_glb  # noqa: E402

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
RAW = ROOT / "data" / "raw"
BUILD = ROOT / "data" / "build"
PUBLIC = REPO / "public" / "assets"
GENERATED = REPO / "src" / "data" / "generated"


# ---------------------------------------------------------------- volumes
def load_volume(rel: str) -> tuple[np.ndarray, np.ndarray]:
    img = nib.load(RAW / rel)
    data = np.asanyarray(img.dataobj).astype(np.float64)
    data[~np.isfinite(data)] = 0.0
    return data, img.affine


def world_x(shape: tuple, affine: np.ndarray) -> np.ndarray:
    """World x (mm) of each voxel, broadcastable to the volume."""
    ijk = np.indices(shape, dtype=np.float32)
    return affine[0, 0] * ijk[0] + affine[0, 1] * ijk[1] + affine[0, 2] * ijk[2] + affine[0, 3]


def volume_for(v: C.Volume, side: str) -> tuple[np.ndarray, np.ndarray]:
    if side in v.files:
        data, aff = load_volume(v.files[side])
    else:
        data, aff = load_volume(v.files["mixed"])
    if v.label is not None:
        data = (np.rint(data) == v.label[side]).astype(np.float64)
    elif "mixed" in v.files:
        x = world_x(data.shape, aff)
        data = data * ((x < 0) if side == "L" else (x > 0))
    return data, aff


def source_centroid(mask: np.ndarray, aff: np.ndarray, weights: np.ndarray | None = None) -> list[float]:
    ijk = np.argwhere(mask)
    w = None if weights is None else weights[mask]
    c = np.average(ijk, axis=0, weights=w)
    return nib.affines.apply_affine(aff, c).round(3).tolist()


def isosurface(data: np.ndarray, aff: np.ndarray, level: float, sigma: float, faces: int,
               keep_point: np.ndarray | None = None) -> trimesh.Trimesh:
    vol = ndimage.gaussian_filter(data, sigma) if sigma > 0 else data
    vol = np.pad(vol, 2)
    verts, tris, _, _ = measure.marching_cubes(vol, level=level)
    verts = nib.affines.apply_affine(aff, verts - 2.0)
    if np.linalg.det(aff[:3, :3]) < 0:
        tris = tris[:, ::-1]
    m = trimesh.Trimesh(verts, tris, process=True)
    parts = m.split(only_watertight=False)
    if keep_point is not None and len(parts) > 1:
        d = [np.min(np.linalg.norm(p.vertices - keep_point, axis=1)) for p in parts]
        m = parts[int(np.argmin(d))]
    elif len(parts) > 1:
        total = sum(p.area for p in parts)
        m = trimesh.util.concatenate([p for p in parts if p.area >= 0.03 * total])
    trimesh.smoothing.filter_taubin(m, lamb=0.5, nu=0.53, iterations=12)
    if len(m.faces) > faces:
        m = m.simplify_quadric_decimation(face_count=faces)
    m.fix_normals()
    return m


def mesh_node(m: trimesh.Trimesh, side: str, extras: dict | None = None) -> dict:
    return {"name": side, "positions": m.vertices, "normals": m.vertex_normals,
            "indices": m.faces, "mode": TRIANGLES, "extras": extras or {}}


def build_nuclei(report: dict, coords: dict) -> None:
    for v in C.NUCLEI:
        nodes, rep = [], {}
        for side in ("L", "R"):
            data, aff = volume_for(v, side)
            mask = data >= v.threshold
            if not mask.any():
                raise SystemExit(f"{v.id}/{side}: empty mask at threshold {v.threshold}")
            m = isosurface(data, aff, v.threshold, v.sigma, v.faces)
            vox_ml = mask.sum() * abs(np.linalg.det(aff[:3, :3])) / 1000.0
            rep[side] = {
                "sourceCentroid": source_centroid(mask, aff),
                "meshCentroid": (m.center_mass if m.is_watertight else m.centroid).round(3).tolist(),
                "surfaceCentroid": m.centroid.round(3).tolist(),
                "sourceVolumeMl": round(float(vox_ml), 4),
                "meshVolumeMl": round(float(abs(m.volume)) / 1000.0, 4) if m.is_watertight else None,
                "faces": int(len(m.faces)), "watertight": bool(m.is_watertight),
            }
            nodes.append(mesh_node(m, side))
        write_glb(BUILD / "meshes" / f"{v.id}.glb", nodes, {"id": v.id})
        report[v.id] = rep
        coords[f"atlas:{v.id}"] = {
            "L": rep["L"]["sourceCentroid"], "R": rep["R"]["sourceCentroid"],
            "method": f"Centroid of {C.DATASETS[v.dataset]['name']} label '{v.name}' (voxels >= {v.threshold}).",
            "dataset": v.dataset,
        }
        print(f"nucleus {v.id:10s} L{rep['L']['sourceCentroid']} R{rep['R']['sourceCentroid']} faces {rep['L']['faces']}/{rep['R']['faces']}")


def build_sweetspots(report: dict, coords: dict) -> None:
    for v in C.SWEETSPOTS:
        nodes, rep = [], {}
        for side in ("L", "R"):
            data, aff = volume_for(v, side)
            pos = np.clip(data, 0, None)
            peak = pos.max()
            level = C.SWEETSPOT_FRACTION * peak
            # keep the connected region that contains the peak
            lab, _ = ndimage.label(pos >= level)
            pidx = np.unravel_index(np.argmax(pos), pos.shape)
            region = lab == lab[pidx]
            peak_mm = nib.affines.apply_affine(aff, np.array(pidx, float))
            m = isosurface(np.where(region, pos, 0), aff, level, 0.0 if v.dataset == "elias2021" else 0.5,
                           v.faces, keep_point=peak_mm)
            rep[side] = {
                "sourceCentroid": source_centroid(region, aff, pos),
                "peak": peak_mm.round(3).tolist(), "peakValue": round(float(peak), 4),
                "meshCentroid": m.centroid.round(3).tolist(), "surfaceCentroid": m.centroid.round(3).tolist(),
                "faces": int(len(m.faces)), "regionVoxels": int(region.sum()),
            }
            nodes.append(mesh_node(m, side))
        write_glb(BUILD / "meshes" / f"{v.id}.glb", nodes, {"id": v.id})
        report[v.id] = rep
        coords[v.id] = {
            "L": rep["L"]["sourceCentroid"], "R": rep["R"]["sourceCentroid"],
            "method": (f"Value-weighted centroid of the connected region >= {int(C.SWEETSPOT_FRACTION * 100)}% "
                       f"of the positive maximum in the published map ({C.DATASETS[v.dataset]['name']})."),
            "dataset": v.dataset,
        }
        print(f"sweetspot {v.id:10s} L{rep['L']['sourceCentroid']} R{rep['R']['sourceCentroid']}")


# ---------------------------------------------------------------- cortex
def hmat_lookup():
    img = nib.load(RAW / "labeling/HMAT (Mayka 2005).nii")
    lab = np.asanyarray(img.dataobj).astype(int)
    dist, idx = ndimage.distance_transform_edt(lab == 0, return_indices=True)
    inv = np.linalg.inv(img.affine)
    # voxel size is 1 mm, so EDT distances are in mm

    def f(pts: np.ndarray) -> np.ndarray:
        ijk = np.clip(np.rint(nib.affines.apply_affine(inv, pts)).astype(int), 0, np.array(lab.shape) - 1)
        t = tuple(ijk.T)
        near = lab[tuple(i[t] for i in idx)]
        return np.where(dist[t] <= C.HMAT_MAX_DIST_MM, near, 0)
    return f


def build_cortex(report: dict) -> None:
    surf = sio.loadmat(RAW / "cortex/CortexHiRes.mat", simplify_cells=True)
    annot = sio.loadmat(RAW / "cortex/annot_DKT.mat", simplify_cells=True)["annot"]
    by_hemi = {}
    for a in annot:
        hemi = "R" if "rh." in str(a["filename"]) else "L"
        names = [str(s) for s in a["colortable"]["struct_names"]]
        table = a["colortable"]["table"][:, 4]
        lut = {int(t): n for t, n in zip(table, names)}
        by_hemi[hemi] = np.array([lut.get(int(x), "unknown") for x in np.ravel(a["label"])])
    hmat = hmat_lookup()
    base_nodes = []
    parcel_nodes: dict[str, list] = {p.id: [] for p in C.CORTEX_PARCELS}
    for side, key in (("L", "lh"), ("R", "rh")):
        V = np.asarray(surf[f"Vertices_{key}"], float)
        F = np.asarray(surf[f"Faces_{key}"], int) - 1
        dk_hi = by_hemi[side]
        assert len(dk_hi) == len(V), "annotation / surface vertex mismatch"
        m = trimesh.Trimesh(V, F, process=False)
        m = m.simplify_quadric_decimation(face_count=C.CORTEX_FACES)
        m.fix_normals()
        _, near = cKDTree(V).query(m.vertices)
        dk = dk_hi[near]
        hm = hmat(m.vertices)
        # HMAT: odd labels are right hemisphere, even labels left
        hm = np.where((hm % 2 == 1) == (side == "R"), hm, 0)
        base_nodes.append(mesh_node(m, side))
        normals = m.vertex_normals
        rep = {}
        for p in C.CORTEX_PARCELS:
            vm = np.isin(hm, p.hmat) if p.hmat else np.isin(dk, p.dk)
            fm = vm[m.faces].all(axis=1)
            if not fm.any():
                raise SystemExit(f"cortex parcel {p.id}/{side} is empty")
            sub = trimesh.Trimesh(m.vertices + 0.25 * normals, m.faces[fm], process=False)
            sub.remove_unreferenced_vertices()
            parcel_nodes[p.id].append(mesh_node(sub, side))
            rep[p.id] = {"meshCentroid": sub.centroid.round(3).tolist(), "surfaceCentroid": sub.centroid.round(3).tolist(), "faces": int(fm.sum())}
        report.setdefault("cortex", {})[side] = {"faces": int(len(m.faces)), "bbox": [m.bounds[0].round(1).tolist(), m.bounds[1].round(1).tolist()]}
        for pid, r in rep.items():
            report.setdefault(pid, {})[side] = r
    write_glb(BUILD / "meshes" / "cortex.glb", base_nodes, {"id": "cortex"})
    for pid, nodes in parcel_nodes.items():
        write_glb(BUILD / "meshes" / f"{pid}.glb", nodes, {"id": pid})
        print(f"cortex parcel {pid:7s} faces L{report[pid]['L']['faces']} R{report[pid]['R']['faces']}")


# ---------------------------------------------------------------- tracts
def read_mat(path: Path):
    try:
        return sio.loadmat(path, simplify_cells=True), None
    except NotImplementedError:
        return None, h5py.File(path, "r")


def fibers_format(path: Path) -> list[np.ndarray]:
    d, h = read_mat(path)
    if d is not None:
        F, n = np.asarray(d["fibers"], float), np.ravel(d["idx"]).astype(int)
    else:
        F, n = np.array(h["fibers"]).T, np.array(h["idx"]).ravel().astype(int)
    if F.shape[1] != 4:
        F = F.T
    starts = np.r_[0, np.cumsum(n)[:-1]]
    return [F[s:s + k, :3] for s, k in zip(starts, n)]


def fibcell_format(path: Path) -> list[tuple[list[np.ndarray], np.ndarray]]:
    """Returns per-cell (streamlines, values); cell order as stored."""
    d, h = read_mat(path)
    out = []
    if d is not None:
        for fc, vals in zip(d["fibcell"], d["vals"]):
            fc = fc if isinstance(fc, (list, np.ndarray)) and len(fc) and np.ndim(fc[0]) == 2 else [fc]
            out.append(([np.asarray(f, float) for f in fc], np.ravel(np.asarray(vals, float))))
    else:
        fib, vals = h["fibcell"], h["vals"]
        for s in range(fib.shape[0]):
            refs = h[fib[s, 0]][()].ravel()
            sl = [np.array(h[r]).T for r in refs]
            out.append((sl, np.array(h[vals[s, 0]]).ravel()))
    return out


def resample(sl: np.ndarray, step: float) -> np.ndarray:
    seg = np.linalg.norm(np.diff(sl, axis=0), axis=1)
    s = np.r_[0, np.cumsum(seg)]
    if s[-1] < step:
        return sl[[0, -1]]
    t = np.linspace(0, s[-1], max(2, int(np.ceil(s[-1] / step)) + 1))
    return np.column_stack([np.interp(t, s, sl[:, i]) for i in range(3)])


def superior_end(sl: np.ndarray) -> np.ndarray:
    return sl[0] if sl[0, 2] >= sl[-1, 2] else sl[-1]


def build_tracts(report: dict) -> None:
    hmat = hmat_lookup()
    rng = np.random.default_rng(C.RANDOM_SEED)
    for t in C.TRACTS:
        per_side: dict[str, list[np.ndarray]] = {"L": [], "R": []}
        if "midline" in t.files:
            for sls, vals in fibcell_format(RAW / t.files["midline"]):
                if not sls:
                    continue
                side = "R" if np.mean([s[:, 0].mean() for s in sls]) > 0 else "L"
                keep = [s for s, v in zip(sls, vals) if (v > 0 or not t.positive_only)]
                per_side[side].extend(keep)
        else:
            for side in ("L", "R"):
                per_side[side] = fibers_format(RAW / t.files[side])
        nodes, rep = [], {}
        for side in ("L", "R"):
            sls = per_side[side]
            if t.terminal:
                ends = np.array([superior_end(s) for s in sls])
                sls = [s for s, lab in zip(sls, hmat(ends)) if lab in t.terminal]
            n_total = len(sls)
            if n_total == 0:
                raise SystemExit(f"tract {t.id}/{side}: no streamlines")
            pick = np.sort(rng.choice(n_total, size=min(n_total, t.budget), replace=False))
            res = [resample(sls[i], C.STREAMLINE_STEP_MM) for i in pick]
            pos = np.vstack(res)
            idx, off = [], 0
            for r in res:
                k = len(r)
                idx.append(np.column_stack([np.arange(off, off + k - 1), np.arange(off + 1, off + k)]))
                off += k
            nodes.append({"name": side, "positions": pos, "normals": None, "indices": np.vstack(idx),
                          "mode": LINES, "extras": {"streamlines": len(res), "sourceStreamlines": n_total}})
            sup = np.array([superior_end(r) for r in res])
            rep[side] = {"streamlines": len(res), "sourceStreamlines": n_total, "points": int(len(pos)),
                         "meanX": round(float(pos[:, 0].mean()), 2),
                         "superiorEndMeanX": round(float(sup[:, 0].mean()), 2),
                         "centroid": pos.mean(0).round(2).tolist()}
        write_glb(BUILD / "tracts" / f"{t.id}.glb", nodes, {"id": t.id})
        report[t.id] = rep
        print(f"tract {t.id:9s} L {rep['L']['streamlines']}/{rep['L']['sourceStreamlines']}  R {rep['R']['streamlines']}/{rep['R']['sourceStreamlines']}")


# ---------------------------------------------------------------- T1
def write_volume(name: str, data: np.ndarray, origin: np.ndarray, spacing: float, meta: dict) -> None:
    u8 = np.ascontiguousarray(data.transpose(2, 1, 0))  # z, y, x -> x fastest in memory
    out = PUBLIC / "t1" / f"{name}.u8.gz"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(gzip.compress(u8.tobytes(), 9))
    meta[name] = {"file": f"assets/t1/{name}.u8.gz", "dims": list(data.shape),
                  "origin": [round(float(o), 3) for o in origin], "spacing": spacing, "bytes": out.stat().st_size}
    print(f"t1 {name}: dims {data.shape} -> {out.stat().st_size / 1e6:.2f} MB")


def build_t1() -> dict:
    img = nib.load(RAW / C.T1_FILE)
    aff = img.affine
    assert np.allclose(np.abs(np.diag(aff)[:3]), 0.5) and np.all(np.diag(aff)[:3] > 0), "expected 0.5 mm RAS template"
    d = np.asanyarray(img.dataobj).astype(np.float32)
    hi = np.percentile(d[d > 5], 99.7)
    meta: dict = {"source": "ICBM 2009b nonlinear asymmetric T1 (Lead-DBS templates/space/MNI152NLin2009bAsym/t1.nii)",
                  "scaling": f"linear 0..{hi:.2f} -> 0..255"}
    # whole head at 1.5 mm (exact 3x3x3 block mean of the 0.5 mm template)
    f = 3
    s = [x - x % f for x in d.shape]
    lo = d[:s[0], :s[1], :s[2]].reshape(s[0] // f, f, s[1] // f, f, s[2] // f, f).mean(axis=(1, 3, 5))
    to8 = lambda a: np.clip(a / hi * 255.0, 0, 255).astype(np.uint8)  # noqa: E731
    origin = nib.affines.apply_affine(aff, [(f - 1) / 2] * 3)  # centre of first block
    write_volume("t1_15mm", to8(lo), origin, 0.5 * f, meta)
    inv = np.linalg.inv(aff)
    b0 = np.rint(nib.affines.apply_affine(inv, [C.T1_CROP_MM[k][0] for k in "xyz"])).astype(int)
    b1 = np.rint(nib.affines.apply_affine(inv, [C.T1_CROP_MM[k][1] for k in "xyz"])).astype(int)
    crop = d[b0[0]:b1[0] + 1, b0[1]:b1[1] + 1, b0[2]:b1[2] + 1]
    write_volume("t1_crop_05mm", to8(crop), nib.affines.apply_affine(aff, b0), 0.5, meta)
    return meta


# ---------------------------------------------------------------- main
def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)
    GENERATED.mkdir(parents=True, exist_ok=True)
    report: dict = {}
    coords: dict = {}
    only = set(sys.argv[1:])
    if not only or "nuclei" in only:
        build_nuclei(report, coords)
    if not only or "sweetspots" in only:
        build_sweetspots(report, coords)
    if not only or "cortex" in only:
        build_cortex(report)
    if not only or "tracts" in only:
        build_tracts(report)
    t1 = build_t1() if (not only or "t1" in only) else None

    rp = BUILD / "report.json"
    old = json.loads(rp.read_text()) if rp.exists() and only else {}
    old.update(report)
    if t1:
        old["_t1"] = t1
    rp.write_text(json.dumps(old, indent=1))
    cp = GENERATED / "coordinates.json"
    oc = json.loads(cp.read_text()) if cp.exists() and only else {}
    oc.update(coords)
    oc["_acpc"] = C.ACPC_FIDUCIALS
    cp.write_text(json.dumps(dict(sorted(oc.items())), indent=1))
    print("report ->", rp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
