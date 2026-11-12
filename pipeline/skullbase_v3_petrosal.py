"""Skull base v3: the superior and inferior petrosal sinuses laid onto this CT's bone.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_petrosal.py      (prints its report; skullbase_v3.py runs it)

Both are Z-Anatomy's, fitted onto this CT's skull in Skull base v2, and a CT angiogram shows neither (they are about
a millimetre across and lie against bone). A fit of one skull to another places such a vessel only to within a few
millimetres: as fitted, about half of each sinus's length lay inside the petrous bone (the audit of November 2026,
finding MB-05). They run on the bone, so here their courses are redrawn on this CT's own bone, with the fitted course as
the guide to where:

  the superior petrosal sinus along the crest of the petrous ridge (skullbase_v3_tentorium.py finds it: the summit of
  the cranial floor near the fitted course), in the tentorium's attached margin, and on from the crest's lateral end
  over the bone to this CT's sigmoid-transverse junction, where it drains;
  the inferior petrosal sinus from the fitted course, each point moved to where a tube of its radius lies GAP_MM
  inside the cranial cavity against the bone the model draws (the intracranial side of the petroclival fissure), in
  rounds, smoothed along its length; a point further than PULL_MM from the wall is left where it is. From its point
  nearest this CT's jugular bulb (the lower end of the traced sigmoid sinus: the top of TotalSegmentator's internal
  jugular vein) it runs on to the bulb by the shortest way that stays out of the drawn bone (through the jugular
  foramen): the fitted course ended 20 mm from this CT's bulb, at the fitted model's.

Both then keep GAP_MM off the drawn bone (settle()). Their radii are Z-Anatomy's, at least MIN_RADIUS_MM. Their ends are
joined to the sinuses they drain from and to by skullbase_v3_junctions.py, as before. Their positions stay approximate:
the bone is this patient's, the course along it is a model's.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
BUILD = ROOT / "data" / "build" / "skullbase-v3"
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
SINUSES = {"sb_superior_petrosal_sinus": "Superior petrosal sinus", "sb_inferior_petrosal_sinus": "Inferior petrosal sinus"}
BOX = ((-70.0, 70.0), (-70.0, 10.0), (-50.0, 25.0))   # the grid they are settled on (frame mm; skullbase_v3_endonasal.ct_grid)
GAP_MM = 0.3            # a sinus's surface this far off the drawn bone
MIN_RADIUS_MM = 0.3     # (as Skull base v2 draws them)
PULL_MM = 4.0           # a point of the fitted course is drawn onto the wall from at most this far inside the cavity
BULB_MM = 2.0           # the inferior petrosal sinus ends this far from the jugular bulb's centre (in its wall)
BONE_COST = 50.0        # its way from the cavity's wall to the bulb: a step through drawn bone costs this many steps in the open
STEP_MM = 0.5           # the centre lines' spacing
ROUNDS = 40             # the settling's rounds, at most MOVE_MM each, ...
MOVE_MM = 1.0
SMOOTH_PTS = 2.0        # ... each smoothed along the line (Gaussian, in points); then PUSH_ROUNDS that only push out of bone
PUSH_ROUNDS = 12
IN_BONE_MAX_MM = 2.0    # at most this much of a sinus's centre line may still lie in the drawn bone


class Cavity:
    """How deep each point lies inside the cranial cavity, the bone the model draws left out of it (mm; negative in bone
    or outside), on skullbase_v3_endonasal's grid over BOX."""

    def __init__(self):
        import skullbase_v3_endonasal as ENDO
        import skullbase_v3_tentorium as TENT
        g = ENDO.ct_grid(BOX)
        self.inv = np.linalg.inv(g["a_crop"])
        bone = g["bone"] >= ENDO.FIELD_ISO
        _, cav = TENT.cranial_floor()
        ijk = np.rint((g["P"] - np.array(TENT.FLOOR_LO)) / TENT.FLOOR_STEP).astype(int)
        ok = (ijk >= 0).all(1) & (ijk < np.array(cav.shape)).all(1)
        inside = np.zeros(len(ijk), bool)
        inside[ok] = cav[tuple(ijk[ok].T)]
        inside = inside.reshape(g["shape"]) & ~bone
        st = ENDO.GRID_MM
        self.d = ((ndimage.distance_transform_edt(inside) - ndimage.distance_transform_edt(~inside)) * st).astype(np.float32)
        self.grad = np.stack(np.gradient(ndimage.gaussian_filter(self.d, 1.0), st), -1)
        self.bone = bone

    def depth(self, P: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(self.d, nib.affines.apply_affine(self.inv, P).T, order=1, mode="nearest")

    def inward(self, P: np.ndarray) -> np.ndarray:
        q = nib.affines.apply_affine(self.inv, P).T
        v = np.stack([ndimage.map_coordinates(self.grad[..., k], q, order=1, mode="nearest") for k in range(3)], 1)
        return v / np.maximum(np.linalg.norm(v, axis=1, keepdims=True), 1e-9)

    def in_bone(self, P: np.ndarray) -> np.ndarray:
        """Whether each point lies in the bone the model draws."""
        q = np.rint(nib.affines.apply_affine(self.inv, P)).astype(int)
        ok = (q >= 0).all(1) & (q < np.array(self.bone.shape)).all(1)
        out = np.zeros(len(P), bool)
        out[ok] = self.bone[tuple(q[ok].T)]
        return out


def resampled(P: np.ndarray, r: np.ndarray, step: float = STEP_MM) -> tuple[np.ndarray, np.ndarray]:
    d = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    t = np.r_[np.arange(0.0, d[-1], step), d[-1]]
    return np.stack([np.interp(t, d, P[:, k]) for k in range(3)], 1), np.interp(t, d, r)


def length_in_bone(cv: Cavity, P: np.ndarray) -> float:
    seg = np.linalg.norm(np.diff(P, axis=0), axis=1)
    mid = (P[1:] + P[:-1]) / 2
    return float(seg[cv.in_bone(mid)].sum())


def settle(cv: Cavity, P: np.ndarray, r: np.ndarray, pull: bool) -> np.ndarray:
    """A centre line (points every STEP_MM, radii r) moved so that its tube lies GAP_MM inside the cavity, off the bone:
    points too shallow or in bone move inwards; with `pull`, points up to PULL_MM too deep move onto the wall. In ROUNDS
    rounds of at most MOVE_MM, each smoothed along the line; then PUSH_ROUNDS that only move points out of the bone's way."""
    P = P.copy()
    for k in range(ROUNDS + PUSH_ROUNDS):
        need = r + GAP_MM - cv.depth(P)
        last = k >= ROUNDS
        move = np.where(need > 0, need, np.where(pull & ~last & (-need < PULL_MM), need, 0.0))
        if not (np.abs(move) > 0.02).any():
            break
        step = np.clip(move, -MOVE_MM, MOVE_MM)[:, None] * cv.inward(P)
        if not last:
            step = ndimage.gaussian_filter1d(step, SMOOTH_PTS, axis=0, mode="nearest")
            P = ndimage.gaussian_filter1d(P + step, 1.0, axis=0, mode="nearest")
        else:
            P = P + step
    return P


def to_bulb(cv: Cavity, P: np.ndarray, bulb: np.ndarray) -> np.ndarray:
    """A settled course (from the cavernous sinus's end down) cut at its point nearest the jugular bulb and carried on
    to the bulb: the cheapest path on the grid, a step in drawn bone costing BONE_COST steps in the open, smoothed;
    it stops BULB_MM short of the bulb's centre."""
    from skimage.graph import MCP_Geometric
    if P[0, 2] < P[-1, 2]:
        P = P[::-1]                                       # (upper end first)
    head = P[: int(np.argmin(np.linalg.norm(P - bulb, axis=1))) + 1]
    ijk = lambda q: tuple(np.clip(np.rint(nib.affines.apply_affine(cv.inv, q)).astype(int), 0, np.array(cv.bone.shape) - 1))   # noqa: E731
    mcp = MCP_Geometric(np.where(cv.bone, BONE_COST, 1.0))
    mcp.find_costs([ijk(head[-1])], [ijk(bulb)])
    tail = nib.affines.apply_affine(np.linalg.inv(cv.inv), np.array(mcp.traceback(ijk(bulb)), float))
    tail = ndimage.gaussian_filter1d(tail, 2.0, axis=0, mode="nearest")
    tail = tail[np.linalg.norm(tail - bulb, axis=1) > BULB_MM]
    out, _ = resampled(np.vstack([head, tail[1:]]), np.zeros(len(head) + len(tail) - 1))
    return out


def courses(ex2: dict, bulbs: dict | None = None) -> tuple[dict, dict]:
    """{id: {side: (P, r)}} and a report. bulbs: each side's jugular bulb (the traced sigmoid sinus's lower end; from
    v3's sinuses.json if not given)."""
    import skullbase_v3_tentorium as TENT
    cv = Cavity()
    if bulbs is None:
        sj = json.loads((BUILD / "sinuses.json").read_text())["sigmoid"]
        bulbs = {sd: np.array(sj[sd]["path"][0], float) for sd in ("R", "L")}
    tent = TENT.Tentorium(ex2)
    out, rep = {}, {}
    for sid, name in SINUSES.items():
        out[sid], rep[sid] = {}, {}
        for side in ("R", "L"):
            F = np.array(ex2["lines"][f"{name}.{side.lower()}"]["runs"][0], float)
            Pf, rf = resampled(F[:, :3], np.maximum(F[:, 3], MIN_RADIUS_MM))
            if sid == "sb_superior_petrosal_sinus":
                # the ridge's crest, the tube resting on it, and on from the crest's lateral end to this CT's
                # sigmoid-transverse junction (the traced transverse sinus's lateral end, up to that sinus's wall), where
                # it drains; in the fitted course's direction
                C = tent.ridge[side]
                J = tent.transverse[side][0]
                if np.linalg.norm(C[0] - J[:3]) > np.linalg.norm(C[-1] - J[:3]):
                    C = C[::-1]                                   # (from the junction's end to the apex)
                run = J[:3] + np.linspace(0, 1, 40)[:, None] * (C[0] - J[:3])
                run = run[np.linalg.norm(run - J[:3], axis=1) > J[3] + GAP_MM]
                P, _ = resampled(np.vstack([run[:-1], C]), np.zeros(len(run) - 1 + len(C)))
                if np.linalg.norm(P[0] - Pf[0]) > np.linalg.norm(P[-1] - Pf[0]):
                    P = P[::-1]
                r = np.interp(np.linspace(0, 1, len(P)), np.linspace(0, 1, len(rf)), rf)
                P = P + (r + GAP_MM)[:, None] * np.array([0.0, 0.0, 1.0])
                P = settle(cv, P, r, pull=True)
            else:
                P = to_bulb(cv, settle(cv, Pf, rf, pull=True), bulbs[side])
                r = np.interp(np.linspace(0, 1, len(P)), np.linspace(0, 1, len(rf)), rf)
            P, r = resampled(P, r)
            out[sid][side] = (P, r)
            ln = float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum())
            from scipy.spatial import cKDTree
            rep[sid][side] = {"lengthMm": round(ln, 1), "inBoneMm": round(length_in_bone(cv, P), 1),
                              "inBoneBeforeMm": round(length_in_bone(cv, Pf), 1),
                              "fromFittedMm": {"median": round(float(np.median(cKDTree(Pf).query(P)[0])), 1),
                                               "max": round(float(cKDTree(Pf).query(P)[0].max()), 1)},
                              "leastDepthMm": round(float((cv.depth(P) - r).min()), 2)}
    return out, rep


def build(ex2: dict, bulbs: dict | None = None) -> dict:
    """The two sinuses' meshes (tubes, a node a side) in v3's build, and petrosal.json (the report, the centroids)."""
    import skullbase_build as SB
    from glb import TRIANGLES, write_glb
    lines, rep = courses(ex2, bulbs)
    cent = {}
    for sid, sides in lines.items():
        nodes = []
        for side in ("L", "R"):
            P, r = sides[side]
            v, n, t = SB.tube(np.c_[P, r])
            nodes.append({"name": side, "positions": v, "normals": n, "indices": t, "mode": TRIANGLES})
            cent.setdefault(sid, {})[side] = v.mean(0).round(2).tolist()
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
    out = {"report": rep, "centroid": cent}
    (BUILD / "petrosal.json").write_text(json.dumps(out, indent=1))
    return out


def items(items_list: list) -> None:
    """The manifest's two sinuses: this build's files and what was done."""
    p = BUILD / "petrosal.json"
    if not p.exists():
        return
    d = json.loads(p.read_text())
    how = {"sb_superior_petrosal_sinus": "laid along the crest of this CT's petrous ridge (the summit of the cranial floor near the fitted course), "
                                         "in the tentorium's attached margin, and on over the bone to this CT's sigmoid-transverse junction",
           "sb_inferior_petrosal_sinus": "moved onto the bone's intracranial surface along the fitted course (the petroclival fissure's side of the "
                                         "cranial cavity), and from there on to this CT's jugular bulb by the shortest way out of the bone (the jugular foramen)"}
    for it in items_list:
        if it["id"] not in SINUSES:
            continue
        r = d["report"][it["id"]]
        it["file"] = f"assets/skullbase-v3/{it['id']}.glb"
        it.pop("joinedFrom", None)
        it["bytes"] = 0
        it["centroid"] = d["centroid"][it["id"]]
        it["fitted"] = True
        it["derivation"] = ("Z-Anatomy's, fitted onto this CT's skull (Skull base v2), then " + how[it["id"]] + f", its surface {GAP_MM:g} mm off "
                            "the bone (skullbase_v3_petrosal.py): a CT angiogram does not show it, and as fitted "
                            f"{r['R']['inBoneBeforeMm']:g} mm (right) and {r['L']['inBoneBeforeMm']:g} mm (left) of it lay inside the bone the model draws "
                            f"(now {r['R']['inBoneMm']:g} and {r['L']['inBoneMm']:g} mm). A tube with the radius Z-Anatomy models, at least "
                            f"{MIN_RADIUS_MM:g} mm. Its position is approximate: the bone is this patient's, the course along it a model's.")


def check(rep: dict) -> list[tuple[bool, str]]:
    """For skullbase_v3.py's validation."""
    out = []
    for sid, sides in rep.items():
        for side, r in sides.items():
            out.append((r["inBoneMm"] <= IN_BONE_MAX_MM, f"{SINUSES[sid]} {side}: {r['inBoneMm']} mm of its centre line in the drawn bone"))
    return out


def main() -> int:
    ex2 = json.loads((CT_BUILD / "export.json").read_text())
    d = build(ex2)
    print(json.dumps(d["report"], indent=1))
    for ok, msg in check(d["report"]):
        print("ok  " if ok else "FAIL", msg)
    return 0


if __name__ == "__main__":
    sys.exit(main())
