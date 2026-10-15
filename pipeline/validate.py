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

Exit code 1 if any check fails. Writes pipeline/data/build/validation.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import scipy.io as sio
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"
BUILD = ROOT / "data" / "build"

SYM_X_MM = 3.0      # |xL + xR|
SYM_YZ_MM = 3.0     # |yL - yR|, |zL - zR|
CENTROID_MM = 1.0   # mesh vs source centroid (watertight nuclei)
CORTEX_AGREE = 0.6  # minimum fraction of vertices agreeing with the volume labels

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
    n = sum(len(v) for v in results.values())
    print(f"{n - len(failures)}/{n} checks passed")
    for k, v in results.items():
        print(f"  {k:12s} {sum(x['ok'] for x in v)}/{len(v)}")
    for f in failures:
        print("FAIL", f)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
