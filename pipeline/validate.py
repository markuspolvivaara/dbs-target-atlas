"""Validate the built geometry against its sources.

Checks
  symmetry      left/right centroids mirror across x = 0 (|xL + xR|, |dy|, |dz|)
  centroid      mesh centroid agrees with the centroid computed from the
                source volume voxels (catches flips, offsets, bad affines)
  orientation   every left node lies at x < 0 and every right node at x > 0;
                tracts: the superior (cortical/thalamic) ends lie on the
                labelled side; cortex: surface labels agree with an
                independent volumetric parcellation (Mindboggle-101)
  in-brain      every centroid falls inside the T1 head volume
  alignment     white-matter section (HCP-1065, 2009a space): the 2009b T1 is bright
                along each tract and no 2 mm shift improves it by more than 5%; the thin
                fornix is held to the Neudorfer 2020 fornix label instead
  own-volume    white-matter section: the points of every streamline file lie in the
                atlas's own volume of the tract (catches a wrong reading of the files'
                coordinates: half a voxel is too little for the T1 to show)

Exit code 1 if any check fails. Writes pipeline/data/build/validation.json.
"""
from __future__ import annotations

import gzip
import json
import sys
import zipfile
from pathlib import Path

import nibabel as nib
import numpy as np
import scipy.io as sio
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build as build_mod  # noqa: E402
import config as C  # noqa: E402
from wm_measure import fornix_offset  # noqa: E402

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
BUILD = ROOT / "data" / "build"

SYM_X_MM = 3.0      # |xL + xR|
SYM_YZ_MM = 3.0     # |yL - yR|, |zL - zR|
CENTROID_MM = 1.0   # mesh vs source centroid (watertight nuclei)
CORTEX_AGREE = 0.6
WM_SYM_X_MM = 6.0   # white-matter tracts: association tracts are not symmetric (e.g. arcuate)
# The fornix is a thin tract along the lateral ventricles, so T1 samples along it include CSF and
# the white-matter brightness test does not apply, neither its level nor its 2 mm shift rule (with build.read_trk's
# half voxel a 2 mm shift raises the fornix's T1 by 6.5 %; without it, 4.1 %: the owner's choice, 18 November 2026).
# It is instead compared with the independent fornix label of the Neudorfer 2020 atlas (DBS section) inside that
# label's bounding box.
WM_FORNIX_MEDIAN_MM = 4.0  # the median distance of its points to that label
# Of a streamline file's points (those inside the volume's grid), the share inside the atlas's own volume of the tract.
# Measured on 18 November 2026: 0.978 to 1.000 over the 68 files; as nibabel reads them, without build.read_trk's half
# voxel, 0.309 to 0.973.
WM_OWN_VOLUME_SHARE = 0.97

# Structures whose source atlases are not symmetric by construction may differ
# more; widen tolerance only where the source itself differs (recorded here).
SYM_EXCEPTIONS = {
    "dentate": 3.0,  # SUIT dentate labels: xL=-14.4, xR=+16.4 in the source volume
}

failures: list[str] = []
results: dict = {}


def check(name: str, ok: bool, detail: str) -> None:
    results.setdefault(name, []).append({"ok": bool(ok), "detail": detail})
    if not ok:
        failures.append(f"{name}: {detail}")


def main() -> int:
    rep = json.loads((BUILD / "report.json").read_text())

    t1 = nib.load(RAW / C.T1_FILE)
    head = np.asanyarray(t1.dataobj) > 5
    inv = np.linalg.inv(t1.affine)

    def in_head(p) -> bool:
        ijk = np.rint(nib.affines.apply_affine(inv, p)).astype(int)
        return bool(np.all(ijk >= 0) and np.all(ijk < head.shape) and head[tuple(ijk)])

    # nuclei + sweet spots
    for v in C.NUCLEI + C.SWEETSPOTS:
        r = rep[v.id]
        L, R = np.array(r["L"]["sourceCentroid"]), np.array(r["R"]["sourceCentroid"])
        tol = SYM_EXCEPTIONS.get(v.id, SYM_X_MM)
        check("symmetry", abs(L[0] + R[0]) <= tol and abs(L[1] - R[1]) <= SYM_YZ_MM and abs(L[2] - R[2]) <= SYM_YZ_MM,
              f"{v.id}: L {L.round(1).tolist()} R {R.round(1).tolist()}")
        for side in ("L", "R"):
            s = r[side]
            c = np.array(s["sourceCentroid"])
            check("orientation", (c[0] < 0) == (side == "L"), f"{v.id}/{side} x={c[0]:.1f}")
            check("in-brain", in_head(c), f"{v.id}/{side} {c.round(1).tolist()}")
            mc = np.array(s["meshCentroid"])
            ref = np.array(s.get("mapCentroid", c))  # sweet-spot meshes show the whole map
            d = float(np.linalg.norm(mc - ref))
            # watertight nuclei: volume centroid should match closely; open or
            # sweet-spot meshes use the surface centroid, so allow 2 mm
            tol_c = CENTROID_MM if s.get("watertight") else 2.0 if "mapCentroid" not in s else 3.0
            check("centroid", d <= tol_c, f"{v.id}/{side} mesh-source distance {d:.2f} mm (tol {tol_c})")
            if "sourceVolumeMl" in s and s.get("meshVolumeMl"):
                ratio = s["meshVolumeMl"] / s["sourceVolumeMl"]
                check("volume", 0.75 <= ratio <= 1.33, f"{v.id}/{side} mesh/source volume {ratio:.2f}")

    # sweet-spot markers must lie inside (or within 1 mm of) their own >=50% region
    for v in C.SWEETSPOTS:
        for side in ("L", "R"):
            img_rel = v.files[side]
            img = nib.load(RAW / img_rel)
            d = np.nan_to_num(np.asanyarray(img.dataobj).astype(float))
            region = d >= C.SWEETSPOT_FRACTION * np.clip(d, 0, None).max()
            dist = ndimage.distance_transform_edt(~region, sampling=np.abs(np.diag(img.affine)[:3]))
            ijk = np.rint(nib.affines.apply_affine(np.linalg.inv(img.affine), rep[v.id][side]["sourceCentroid"])).astype(int)
            inside = np.all(ijk >= 0) and np.all(ijk < d.shape)
            check("sweetspot", inside and dist[tuple(ijk)] <= 1.0,
                  f"{v.id}/{side} marker {np.round(rep[v.id][side]['sourceCentroid'], 1).tolist()} "
                  f"{'in' if inside and dist[tuple(ijk)] == 0 else 'near'} its map region "
                  f"(largest of {rep[v.id][side]['regions']}, {rep[v.id][side]['dominantFraction']:.0%} of mass)")

    # tracts: hemisphere of the superior end must match the node side
    crossing = {"drtt"}  # decussating: dentate end contralateral, thalamic/cortical end ipsilateral
    for t in C.TRACTS:
        r = rep[t.id]
        for side in ("L", "R"):
            x = r[side]["superiorEndMeanX"]
            check("orientation", (x < 0) == (side == "L"),
                  f"tract {t.id}/{side} superior-end mean x={x:.1f}{' (decussating)' if t.id in crossing else ''}")
        a, b = r["L"]["centroid"], r["R"]["centroid"]
        if t.id not in ("rt_cerv",):  # 6 streamlines per side: centroid too noisy for a symmetry check
            check("symmetry", abs(a[0] + b[0]) <= 4.0, f"tract {t.id}: centroid x L {a[0]} R {b[0]}")

    # white-matter section (HCP-1065, 2009a space): sides, symmetry and alignment with the 2009b T1
    report_fx: dict = {}

    # every streamline file the section reads, once: its points against the atlas's own volume of the tract (with
    # build.read_trk's half voxel, and without it), and a sample of its streamlines for the T1 check below
    vz = RAW / "hcp1065" / C.HCP1065_NIFTI_ZIP
    if not vz.exists():
        raise SystemExit(f"{vz} missing: the HCP-1065 atlas's volumes of its tracts (pipeline/fetch_sources.py)")
    own: dict = {}
    sample: dict[str, list[np.ndarray]] = {}
    with zipfile.ZipFile(vz) as z:
        for f in sorted({f for t in C.WM_TRACTS for f in t.files.values()}):
            vol = nib.Nifti1Image.from_bytes(gzip.decompress(z.read("nifti/" + f.replace(".trk.gz", ".nii.gz"))))
            mask = np.asanyarray(vol.dataobj) > 0
            vinv = np.linalg.inv(vol.affine)
            sls, half = build_mod.read_trk(RAW / "hcp1065" / "tracts" / f)
            sample[f] = sls[::max(1, len(sls) // 200)]
            p = np.vstack(sls)

            def share(q: np.ndarray) -> float:
                ijk = np.rint(nib.affines.apply_affine(vinv, q)).astype(int)
                ijk = ijk[np.all((ijk >= 0) & (ijk < mask.shape), axis=1)]
                return float(mask[tuple(ijk.T)].mean())
            s, raw = share(p), share(p - half)
            own[f] = {"share": round(s, 4), "asNibabelReads": round(raw, 4), "points": int(len(p))}
            check("own-volume", s >= WM_OWN_VOLUME_SHARE and s > raw,
                  f"wm {f}: {s:.2%} of its points lie in the atlas's own volume of the tract (min {WM_OWN_VOLUME_SHARE:.0%}; "
                  f"as nibabel reads the file, without the half voxel: {raw:.1%})")
    t1d = np.asanyarray(t1.dataobj).astype(np.float32)
    wm_ref = float(np.percentile(t1d[head], 75))
    shifts = [np.array(v, float) for v in np.ndindex(3, 3, 3)]
    for t in C.WM_SHOWN:
        r = rep[t.id]
        for side in ("L", "R"):
            x = r[side]["meanX"]
            check("orientation", (x < 0) == (side == "L"), f"wm {t.id}/{side} mean x={x:.1f}")
        a, b = r["L"]["centroid"], r["R"]["centroid"]
        check("symmetry", abs(a[0] + b[0]) <= WM_SYM_X_MM, f"wm {t.id}: centroid x L {a[0]} R {b[0]}")
        p = np.vstack([sl for f in t.files.values() for sl in sample[f]])
        def mean_t1(off):
            ijk = nib.affines.apply_affine(inv, p + off)
            return float(ndimage.map_coordinates(t1d, ijk.T, order=1).mean())
        base = mean_t1(np.zeros(3))
        best = max(mean_t1((s - 1) * 2.0) for s in shifts)
        if t.id == "wm_fx":
            # held to the fornix label only (WM_FORNIX_MEDIAN_MM); its T1 figures are printed, not checked
            for side, hemi in (("L", "lh"), ("R", "rh")):
                med, shift = fornix_offset(side, hemi)
                check("alignment", med <= WM_FORNIX_MEDIAN_MM,
                      f"wm_fx/{side}: median distance to the Neudorfer 2020 fornix {med:.1f} mm (tol {WM_FORNIX_MEDIAN_MM}); best shift {shift} mm "
                      f"(not held: the best 2 mm shift raises the T1 along both sides from {base:.0f} to {best:.0f}, {best / base - 1:+.1%})")
                report_fx[side] = {"medianMm": round(med, 2), "bestShiftMm": shift}
            continue
        check("alignment", base >= wm_ref and best <= base * 1.05,
              f"wm {t.id}: mean T1 along tract {base:.0f} (head p75 {wm_ref:.0f}); best 2 mm shift {best:.0f}")

    # cortex: compare surface parcels against the Mindboggle-101 volume (independent labels)
    mb = nib.load(RAW / "labeling/Mindboggle 101 - Desikan protocol (Klein 2012).nii")
    lab = np.asanyarray(mb.dataobj).astype(int)
    idx = ndimage.distance_transform_edt(lab == 0, return_distances=False, return_indices=True)
    filled = lab[tuple(idx)]
    minv = np.linalg.inv(mb.affine)
    surf = sio.loadmat(RAW / "cortex/CortexHiRes.mat", simplify_cells=True)
    annot = sio.loadmat(RAW / "cortex/annot_DKT.mat", simplify_cells=True)["annot"]
    codes = {"precentral": 24, "postcentral": 22, "superiorfrontal": 28, "medialorbitofrontal": 14,
             "caudalanteriorcingulate": 2, "rostralanteriorcingulate": 26}
    for a in annot:
        side = "R" if "rh." in str(a["filename"]) else "L"
        V = np.asarray(surf["Vertices_rh" if side == "R" else "Vertices_lh"])
        names = [str(s) for s in a["colortable"]["struct_names"]]
        lut = {int(t): n for t, n in zip(a["colortable"]["table"][:, 4], names)}
        vn = np.array([lut.get(int(x), "") for x in np.ravel(a["label"])])
        ijk = np.clip(np.rint(nib.affines.apply_affine(minv, V)).astype(int), 0, np.array(lab.shape) - 1)
        vl = filled[tuple(ijk.T)]
        base = 2000 if side == "R" else 1000
        for n, c in codes.items():
            sel = vn == n
            agree = float((vl[sel] == base + c).mean())
            check("cortex", agree >= CORTEX_AGREE, f"{side} {n}: {agree:.2f} of surface vertices agree with Mindboggle volume")
        check("orientation", (V[:, 0].mean() < 0) == (side == "L"), f"cortex {side} mean x={V[:, 0].mean():.1f}")

    # anterior/superior sanity from the sources themselves (no external anatomy):
    # the T1 template is RAS with positive diagonal; atlases were read through their affines.
    aff = t1.affine
    check("orientation", bool(np.all(np.diag(aff)[:3] > 0)), f"T1 affine diagonal {np.diag(aff)[:3].tolist()} (RAS)")

    (BUILD / "validation.json").write_text(json.dumps(results, indent=1))
    (BUILD / "fornix-offset.json").write_text(json.dumps(report_fx, indent=1))
    (BUILD / "wm-own-volume.json").write_text(json.dumps(own, indent=1))
    n = sum(len(v) for v in results.values())
    print(f"{n - len(failures)}/{n} checks passed")
    for k, v in results.items():
        print(f"  {k:12s} {sum(x['ok'] for x in v)}/{len(v)}")
    for f in failures:
        print("FAIL", f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
