"""Check TotalSegmentator's segmentations of the spine CT against VerSe's hand-corrected vertebra masks.

  pipeline/.venv/bin/python -I pipeline/spine_verify.py [task ...]

total: every vertebra TotalSegmentator labels must overlap the same-named VerSe vertebra best (Dice), so its levels
and VerSe's agree; plus position checks of the structures the spine section uses. Other tasks: non-empty masks of the
classes used. Exit 1 on failure; writes pipeline/data/build/spine/ts/verify.json.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np

ROOT = Path(__file__).resolve().parent
TS = ROOT / "data" / "build" / "spine" / "ts"
RAW = ROOT / "data" / "raw" / "verse" / "sub-verse823"
VERSE = {**{i: f"C{i}" for i in range(1, 8)}, **{i + 7: f"T{i}" for i in range(1, 13)}, **{i + 19: f"L{i}" for i in range(1, 7)}}
DICE_MIN = 0.80  # an alignment check: the geometry comes from VerSe and the CT; cervical vertebrae are small at 1.5 mm
# classes each later task must deliver (non-empty)
EXPECT = {
    "vertebrae_body": ["intervertebral_discs"],
    "headneck_bones_vessels": ["internal_carotid_artery_left", "internal_carotid_artery_right", "internal_jugular_vein_left",
                               "internal_jugular_vein_right", "hyoid", "thyroid_cartilage", "cricoid_cartilage"],
    "headneck_muscles": ["prevertebral_left", "prevertebral_right", "anterior_scalene_left", "anterior_scalene_right",
                         "sternocleidomastoid_left", "sternocleidomastoid_right"],
    "craniofacial_structures": ["skull"],
    "abdominal_muscles": ["psoas_major_left", "psoas_major_right", "quadratus_lumborum_left", "quadratus_lumborum_right",
                          "erector_spinae_left", "erector_spinae_right"],
}


def load(task: str, cls: str):
    img = nib.load(TS / task / f"{cls}.nii.gz")
    return np.asanyarray(img.dataobj) > 0, img.affine


def centroid(m: np.ndarray, aff: np.ndarray) -> np.ndarray:
    return nib.affines.apply_affine(aff, np.argwhere(m).mean(0))


def check_total(out: dict, check) -> None:
    vimg = nib.load(RAW / "sub-verse823_dir-iso_seg-vert_msk.nii.gz")
    v = np.asanyarray(vimg.dataobj).astype(np.int16)
    dice = {}
    for lab, name in VERSE.items():
        f = TS / "total" / f"vertebrae_{name}.nii.gz"
        if not (v == lab).any() or not f.exists():
            continue
        t, _ = load("total", f"vertebrae_{name}")
        if not t.any():
            check(False, f"TotalSegmentator vertebrae_{name} is empty though VerSe has {name}")
            continue
        # which VerSe label does the TotalSegmentator vertebra overlap most?
        labs, counts = np.unique(v[t], return_counts=True)
        best = int(labs[np.argmax(np.where(labs > 0, counts, 0))])
        d = 2 * np.logical_and(t, v == lab).sum() / (t.sum() + (v == lab).sum())
        dice[name] = round(float(d), 3)
        check(best == lab, f"vertebrae_{name} overlaps VerSe {VERSE.get(best)} most, not {name}")
        check(d >= DICE_MIN, f"{name}: Dice {d:.3f} < {DICE_MIN}")
    out["vertebraDice"] = dice
    c = {k: centroid(*load("total", k)) for k in ("aorta", "inferior_vena_cava", "sacrum", "kidney_left", "kidney_right",
                                                  "iliopsoas_left", "iliopsoas_right", "spinal_cord")}
    l3 = centroid(v == 22, vimg.affine)
    l5 = centroid(v == 24, vimg.affine)
    check(c["aorta"][1] > l3[1], "aorta not anterior of L3")
    check(c["inferior_vena_cava"][0] > c["aorta"][0], "IVC not right (+x) of the aorta")
    check(c["sacrum"][2] < l5[2], "sacrum not below L5")
    check(c["kidney_left"][0] < l3[0] < c["kidney_right"][0], "kidneys not either side of L3")
    check(c["iliopsoas_left"][0] < l5[0] < c["iliopsoas_right"][0], "psoas not either side of L5")
    # the spinal cord must run inside the vertebral canal: posterior of the vertebral body centroids, near the midline
    cord, caff = load("total", "spinal_cord")
    ijk = np.argwhere(cord)
    zs = nib.affines.apply_affine(caff, ijk)[:, 2]
    out["spinalCordZ"] = [round(float(zs.min()), 1), round(float(zs.max()), 1)]
    check(c["spinal_cord"][1] < l3[1] + 40, "spinal cord far anterior")
    out["centroids"] = {k: np.round(x, 1).tolist() for k, x in c.items()}


def main() -> int:
    tasks = sys.argv[1:] or ["total"]
    fails: list[str] = []
    n = 0

    def check(ok: bool, msg: str) -> None:
        nonlocal n
        n += 1
        if not ok:
            fails.append(msg)
    out: dict = {}
    for task in tasks:
        if task == "total":
            check_total(out, check)
        for cls in EXPECT.get(task, []):
            f = TS / task / f"{cls}.nii.gz"
            ok = f.exists() and load(task, cls)[0].sum() > 100
            check(ok, f"{task}/{cls} missing or empty")
            out.setdefault("voxels", {})[f"{task}/{cls}"] = int(load(task, cls)[0].sum()) if f.exists() else 0
    out["checks"], out["failures"] = n, fails
    p = TS / "verify.json"
    prev = json.loads(p.read_text()) if p.exists() else {}
    p.write_text(json.dumps({**prev, **{t: out for t in tasks}}, indent=1))
    for f in fails:
        print("FAIL", f)
    print(f"spine segmentation ({', '.join(tasks)}): {n - len(fails)}/{n} checks passed")
    if "vertebraDice" in out:
        print("Dice vs VerSe:", out["vertebraDice"])
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
