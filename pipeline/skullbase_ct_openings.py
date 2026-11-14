"""Skull base v2 (the CT model): its fitted cranial nerves measured against the CT where they cross the skull base.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_ct_openings.py
  (after skullbase_build.py ct, and after Skull base v3's chain, whose routed nerves it reads; then
   skullbase_build.py ct finalize)

v2's nerves are Z-Anatomy's curves carried onto this CT's skull by a smooth fit (skullbase_ct.py). The fit brings the
model's bone within a median 1.5 mm of the CT's but does not find the CT's own canals, so where a nerve crosses the skull
base it can run through the wall of its foramen or through a sinus, a few millimetres from the opening (the audit's
finding MC-10). v2 keeps them as fitted. Skull base v3 routes the same nerves through this CT's openings
(skullbase_nerves.route), so this step measures each v2 nerve over the stretch v3 routes: its fitted course from the
brainstem to just past the skull base (skullbase_v3_base.NERVES). Along its centre line, every STEP_MM:

  boneMm   length inside the bone v2 draws (its bone field at the surface level: skullbase_nerves.Grid)
  solidMm  the part of boneMm where the CT reads skullbase_ct.BONE_HU or more (the rest is bone by v2's rules for thin
           bone and sinus walls: thin plates, walls, and contrast in the cavernous sinus that the thin-bone rule takes in)
  airMm    length in the air the skull encloses, outside that bone (the sinuses and air cells v2 draws walls round:
           skullbase_ct.enclosed_air; the air where the scan's face was removed is not among them)
  apartMm  over boneMm and airMm, the median distance to v3's nerve (the centre line of its tube as built)

The result goes into sbct-manifest.json as `atOpening` = {stretchMm, routedId, R: {...}, L: {...}} on each nerve where
boneMm + airMm reaches NOTE_MM on either side; the card says it. Left out: the facial and vestibulocochlear nerves (in
bone in life: the facial canal and the internal acoustic meatus; v3 takes them from a real ear) and the nerves in the
temporal bone (cochlear, vestibular).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_ct as CTM  # noqa: E402
import skullbase_nerves as NV  # noqa: E402
import skullbase_v3_base as B  # noqa: E402
import skullbase_v3_cavernous as C  # noqa: E402

REPO = ROOT.parent
GEN = REPO / "src" / "data" / "generated"
V3_BUILD = ROOT / "data" / "build" / "skullbase-v3"
STEP_MM = 0.25
NOTE_MM = 2.0
V3_FILE = {"Optic nerve (II)": "tb_optic_nerve_ii.glb"}    # (v3's optic nerve before it is joined to the chiasm)


def slug(name: str) -> str:
    """As skullbase_build.slug, without its prefix: 'Hypoglossal nerve (XII)' -> 'hypoglossal_nerve_xii'."""
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def dense(P: np.ndarray, step: float = STEP_MM) -> np.ndarray:
    P = np.asarray(P, float)[:, :3]
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    u = np.arange(0, s[-1] + 1e-9, step)
    return np.stack([np.interp(u, s, P[:, k]) for k in range(3)], 1)


class OnCt:
    """The CT itself, read at frame points: its HU, and the air it encloses as v2 takes it (skullbase_ct.enclosed_air)."""

    def __init__(self, g: NV.Grid):
        self.ct, self.aff = CTM.load_ct()
        self.air = CTM.enclosed_air(self.ct, np.sqrt((self.aff[:3, :3] ** 2).sum(0)))
        self.g = g

    def ijk(self, P: np.ndarray) -> np.ndarray:
        return nib.affines.apply_affine(np.linalg.inv(self.aff), P @ self.g.R.T + self.g.fossa)

    def hu(self, P: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(self.ct, self.ijk(P).T, order=1, mode="nearest")

    def in_air(self, P: np.ndarray) -> np.ndarray:
        q = np.rint(self.ijk(P)).astype(int)
        ok = (q >= 0).all(1) & (q < np.array(self.air.shape)).all(1)
        out = np.zeros(len(q), bool)
        out[ok] = self.air[tuple(q[ok].T)]
        return out


def measure() -> dict:
    g = NV.Grid()
    ct = OnCt(g)
    ex = json.loads((NV.CT_BUILD / "export.json").read_text())
    out = {}
    for name, cn, sources, max_mm in B.NERVES:
        if max_mm == "porus":
            continue
        f = V3_BUILD / V3_FILE.get(name, f"tb_{slug(name)}.glb")
        routed = C.centre_lines(f)
        rep = {}
        for side in ("R", "L"):
            P = dense(B.fitted_course(ex, sources, side, max_mm))
            inb = g.in_bone(P)
            ina = ct.in_air(P) & ~inb
            off = inb | ina
            apart = cKDTree(dense(routed[side][0])).query(P[off])[0] if off.any() else np.array([])
            rep[side] = {"boneMm": round(STEP_MM * float(inb.sum()), 1),
                         "solidMm": round(STEP_MM * float((ct.hu(P[inb]) >= CTM.BONE_HU).sum()), 1) if inb.any() else 0.0,
                         "airMm": round(STEP_MM * float(ina.sum()), 1),
                         "apartMm": round(float(np.median(apart)), 1) if len(apart) else None,
                         "lengthMm": round(STEP_MM * (len(P) - 1), 1)}
        out[name] = {"stretchMm": round(min(r["lengthMm"] for r in rep.values())), "routedId": f.name.split(".")[0], **rep}
    return out


def main() -> int:
    rep = measure()
    p = GEN / "sbct-manifest.json"
    man = json.loads(p.read_text())
    noted = []
    for it in man["structures"]:
        it.pop("atOpening", None)
        r = rep.get(it["name"])
        if r and max(r[s]["boneMm"] + r[s]["airMm"] for s in ("R", "L")) >= NOTE_MM:
            it["atOpening"] = {k: ({kk: vv for kk, vv in v.items() if kk != "lengthMm"} if k in ("R", "L") else v)
                               for k, v in r.items()}
            noted.append(it["name"])
    p.write_text(json.dumps(man, indent=1, ensure_ascii=False))
    (NV.CT_BUILD / "openings.json").write_text(json.dumps({"params": {"stepMm": STEP_MM, "noteMm": NOTE_MM, "solidHu": CTM.BONE_HU},
                                                            "nerves": rep}, indent=1))
    for n, r in rep.items():
        print(f"{n:32s} {r['stretchMm']:3d} mm" + "".join(
            f"  {s} bone {r[s]['boneMm']:5.1f} (solid {r[s]['solidMm']:4.1f}) air {r[s]['airMm']:5.1f} apart {r[s]['apartMm']}"
            for s in ("R", "L")) + ("  (noted)" if n in noted else ""))
    print(f"v2 nerves at the skull base: {len(rep)} measured, {len(noted)} noted on their cards")
    return 0


if __name__ == "__main__":
    sys.exit(main())
