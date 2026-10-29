"""Skull base v3: landmarks of the cranial floor on this CT, for the Cranial floor overview.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_floor.py      (also run by skullbase_v3.py's build)

Each is put on this CT's own bone, and its note says how:
  the anterior and posterior clinoid processes and the petrous apex, both sides: found on the CT's bone
  (skullbase_v3_cavernous.landmarks: the clinoid's tip as the furthest-back bone of the lesser wing's medial end; the
  posterior clinoid as the highest bone at the dorsum sellae's lateral corner; the petrous apex as the highest bone at the
  petrous ridge's medial end, behind the foramen lacerum);
  the midline ones (foramen caecum, sphenoidal yoke, limbus, chiasmatic sulcus, tuberculum sellae, hypophysial fossa,
  dorsum sellae, clivus, internal occipital protuberance): the Z-Anatomy model's point, fitted onto this CT (Skull base
  v2), moved to the nearest surface of the CT's bone facing the cranial cavity (the hypophysial fossa and foramen caecum:
  to its nearest surface, where the cavity as found stops short);
  the paired ones the model labels on one side only (lesser wing, arcuate eminence, tegmen tympani, groove for the
  transverse sinus): that side's fitted point, and its mirror image for the other side,
  each moved to the nearest surface of the CT's bone facing the cranial cavity (the mirrored one kept only when it lies
  within SNAP_MM).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
GEN = ROOT.parent / "src" / "data" / "generated"
SNAP_MM = 5.0
CT_FOUND = {"anteriorClinoid": "Anterior clinoid process", "posteriorClinoid": "Posterior clinoid process", "petrousApex": "Apex of petrous part"}
CT_HOW = {
    "Anterior clinoid process": "Found on this CT: the clinoid's tip, the furthest-back bone of the lesser wing's medial end.",
    "Posterior clinoid process": "Found on this CT: the highest bone at the lateral corner of the dorsum sellae.",
    "Apex of petrous part": "Found on this CT: the highest bone at the medial end of the petrous ridge, behind the foramen lacerum "
                            "(the CT shows it fused with the clivus).",
}
MIDLINE = ["Foramen caecum of frontal bone", "Sphenoidal yoke", "Limbus of sphenoid", "Chiasmatic sulcus", "Tuberculum sellae",
           "Hypophysial fossa", "Dorsum sellae", "Basilar part of occipital bone", "Internal occipital protuberance"]
PAIRED = ["Lesser wing", "Arcuate eminence", "Tegmen tympani", "Groove for transverse sinus"]
NEAREST = {"Hypophysial fossa", "Foramen caecum of frontal bone"}   # (on the plain nearest surface: the cavity, as found, stops short of them)


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def floor_landmarks() -> list[dict]:
    import skullbase_v3_approach as A
    S = A.Skull()
    bone = S.b > A.K.SURFACE_LEVEL
    from scipy.spatial import cKDTree
    # the bone's surface (for the points found on the CT) and its endocranial surface, facing the cranial cavity (for
    # the fitted ones: the floor's landmarks, not the orbit's or the pharynx's side of the same bone)
    surf = bone & ~ndimage.binary_erosion(bone)
    endo = surf & ndimage.binary_dilation(S.cavity, iterations=2)
    trees = {k: (P, cKDTree(P)) for k, P in (("any", nib.affines.apply_affine(S.a, np.argwhere(surf))),
                                             ("endo", nib.affines.apply_affine(S.a, np.argwhere(endo))))}

    def snap(p, which="endo"):
        P, tree = trees[which]
        d, j = tree.query(p)
        return P[j], float(d)

    v2 = {l["name"]: l for l in json.loads((GEN / "sbct-landmarks.json").read_text())}
    cav = json.loads((GEN / "sbv3-cavernous.json").read_text())["landmarks"]
    out = []

    def add(name, side, p, how):
        l2 = v2[name]
        out.append({"id": f"lm_{slug(name)}" + ("" if side == "M" else f"_{side.lower()}"), "name": name, "bone": l2["bone"],
                     "part": l2.get("part"), "ras": np.round(p, 2).tolist(), "side": side,
                     "boneFrom": "located on this CT" if name in CT_HOW else "fitted model, put on this CT's bone",
                     "distanceToBoneMm": 0.0, "placed": how})
    for key, name in CT_FOUND.items():
        for side in ("R", "L"):
            p, d = snap(np.array(cav[side][key], float), "any")
            add(name, side, p, CT_HOW[name])
    for name in MIDLINE:
        p, d = snap(np.array(v2[name]["ras"], float), "any" if name in NEAREST else "endo")
        add(name, "M", p, f"The Z-Anatomy model's point, fitted onto this CT, moved {d:.1f} mm to the CT's bone surface"
                          + ("" if name in NEAREST else " facing the cranial cavity") + " (approximate).")
    for name in PAIRED:
        q = np.array(v2[name]["ras"], float)
        own = "R" if q[0] > 0 else "L"
        for side in ("R", "L"):
            m = q if side == own else q * np.array([-1.0, 1, 1])
            p, d = snap(m)
            if side != own and d > SNAP_MM:
                continue
            how = (f"The Z-Anatomy model's point (it labels the {'right' if own == 'R' else 'left'} side), fitted onto this CT, "
                   f"moved {d:.1f} mm to the CT's bone surface facing the cranial cavity (approximate)." if side == own else
                   f"The Z-Anatomy model's point on the other side, mirrored and moved {d:.1f} mm to this CT's bone surface facing the "
                   "cranial cavity (approximate).")
            add(name, side, p, how)
    return out


def main() -> int:
    """Into sbv3-landmarks.json (replacing the floor's) and sbv3-definitions.json (Z-Anatomy's texts for their names)."""
    import skullbase_build as SB
    import skullbase_v3 as V3
    new = floor_landmarks()
    p = GEN / "sbv3-landmarks.json"
    lms = [l for l in json.loads(p.read_text()) if l["id"] not in {n["id"] for n in new}]
    p.write_text(json.dumps(lms + new, indent=1, ensure_ascii=False))
    ex = json.loads(V3.ZEXPORT.read_text())
    dp = GEN / "sbv3-definitions.json"
    defs = json.loads(dp.read_text())
    for n in sorted({l["name"] for l in new}):
        d = SB.definition(ex["texts"].get(n) or ex["texts"].get(n + ".r"))
        if d:
            defs[n] = d
    dp.write_text(json.dumps(dict(sorted(defs.items())), indent=1, ensure_ascii=False))
    print(len(new), "floor landmarks;", sum(1 for l in new if l["name"] in defs), "with definitions")
    for l in new:
        print(f"  {l['name']} {l['side']} {l['ras']}  {l['placed'][:60]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
