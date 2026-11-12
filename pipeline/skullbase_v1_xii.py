"""Skull base v1 (the Z-Anatomy model): the hypoglossal nerve led through the hypoglossal canal.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_xii.py
  (after skullbase_build.py; then compress.mjs skullbase and skullbase_build.py finalize)

Z-Anatomy's occipital bone has a hypoglossal canal: a passage some 2.6 mm across that runs forwards and outwards
through the bone above the condyle, beside the model's own label "Hypoglossal canal". Its hypoglossal nerve does not
use it: the rootlets are gathered at a point 1 mm inside the bone, and the trunk runs on through solid bone below and
medial to the canal for 28 mm, 5 mm deep at the most (the audit's finding MC-09). The curve and the bone were drawn
apart.

The canal is found from the bone: on a CANAL_STEP_MM grid of the occipital bone's inside, the open space the bone
encloses (bone within ENCLOSED_MM in at least ENCLOSED_DIRS of 26 directions, no further than NARROW_MM from it)
nearest the label; its axis is that space's principal axis, its inner and outer openings the space's ends along it.
(v1's bone field for the craniotomies, 0.5 mm with its surfaces thickened, closes a passage this narrow.)

The nerve is then drawn through it, each side:
  * the rootlets, which leave the medulla where Z-Anatomy has them (their first ROOTLET_KEEP_MM unchanged), are
    gathered GATHER_MM in front of the canal's inner opening instead, each on a smooth curve that arrives along the
    canal's axis;
  * the trunk runs straight along the canal's axis to BEYOND_MM past the outer opening, then on a smooth curve back
    onto Z-Anatomy's own, which it meets REJOIN_MM along that curve from where it used to leave the bone; from there
    on, and its branches, are unchanged;
  * every moved stretch is kept CLEAR_MM out of the bone (drawn_bone.DrawnBone on the same grid).

Writes pipeline/data/build/skullbase/sb_hypoglossal_nerve_xii.glb, the item's derivation and centroid in v1's manifest,
and the step's record (the canal as found, how far the curve moved, the bone it crosses before and after).
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
import skullbase_build as SB  # noqa: E402
import spine_geom as G  # noqa: E402
from drawn_bone import DrawnBone  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402
from skullbase_brain import fill  # noqa: E402

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"
NERVE = "Hypoglossal nerve (XII)"
LABEL = "Hypoglossal canal"
BONE = "Occipital bone"
CANAL_STEP_MM = 0.25    # the grid the bone's inside is taken on
CANAL_BOX_MM = 14.0     # the canal is sought within this of the label
NARROW_MM = 2.2         # the canal's open space: no further than this from the bone,
ENCLOSED_MM = 4.0       # with bone within this distance
ENCLOSED_DIRS = 21      # in at least this many of 26 directions
GATHER_MM = 1.5         # the rootlets meet this far in front of the inner opening (on the canal's axis)
BEYOND_MM = 1.5         # the trunk follows the axis this far past the outer opening
REJOIN_MM = 8.0         # and is back on Z-Anatomy's curve this far along it from where that left the bone
CLEAR_MM = 0.2          # the nerve's surface kept this far out of the bone
STEP_MM = 0.4           # the moved stretches' sampling
ROOTLET_KEEP_MM = 2.0   # each rootlet's first stretch out of the medulla stays as Z-Anatomy has it


def bone_inside(V: np.ndarray, F: np.ndarray, step: float) -> tuple[np.ndarray, np.ndarray]:
    """A nearly closed mesh's inside on a grid (and the grid's origin): the parity of crossings along each axis, kept
    where two of the three agree (as skullbase_v1_skull.parity_inside, on a finer grid)."""
    lo = np.floor(V.min(0) - 2.0)
    shape = tuple(int(x) for x in np.ceil((V.max(0) + 2.0 - lo) / step).astype(int) + 1)
    votes = np.zeros(shape, np.uint8)
    for ax in range(3):
        perm = [a for a in range(3) if a != ax] + [ax]
        f = fill(V[:, perm], F, lo[perm], tuple(np.array(shape)[perm]), step)
        votes += np.transpose(f, np.argsort(perm)).astype(np.uint8)
    return votes >= 2, lo


def find_canal(solid: np.ndarray, lo: np.ndarray, label: np.ndarray) -> dict:
    """The open space the bone encloses nearest `label`: its centre, axis (pointing outwards, away from the midline),
    inner and outer ends, length and width (mm)."""
    st = CANAL_STEP_MM
    n = int(2 * CANAL_BOX_MM / st) + 1
    i0 = np.rint((label - CANAL_BOX_MM - lo) / st).astype(int)
    box = solid[i0[0]:i0[0] + n, i0[1]:i0[1] + n, i0[2]:i0[2] + n]
    lo_b = lo + i0 * st
    d = ndimage.distance_transform_edt(~box) * st
    idx = np.argwhere(~box & (d <= NARROW_MM))
    dirs = np.array([[a, b, c] for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1) if (a, b, c) != (0, 0, 0)], float)
    dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
    hit = np.zeros(len(idx), int)
    for dv in dirs:
        got = np.zeros(len(idx), bool)
        for k in range(1, int(ENCLOSED_MM / st) + 1):
            q = np.rint(idx + k * dv).astype(int)
            ok = (q >= 0).all(1) & (q < n).all(1)
            got[ok] |= box[tuple(q[ok].T)]
        hit += got
    enc = np.zeros(box.shape, bool)
    enc[tuple(idx[hit >= ENCLOSED_DIRS].T)] = True
    lab, _ = ndimage.label(enc)
    pts = np.argwhere(enc)
    if not len(pts):
        raise SystemExit(f"no enclosed open space within {CANAL_BOX_MM} mm of the label {LABEL}")
    dist = np.linalg.norm(pts * st + lo_b - label, axis=1)
    pit = np.argwhere(lab == lab[tuple(pts[int(np.argmin(dist))])]) * st + lo_b
    cen = pit.mean(0)
    _, s, vt = np.linalg.svd(pit - cen, full_matrices=False)
    ax = vt[0] if vt[0][0] * np.sign(label[0]) > 0 else -vt[0]
    t = (pit - cen) @ ax
    return {"centre": cen, "axis": ax, "inner": cen + t.min() * ax, "outer": cen + t.max() * ax,
            "lengthMm": round(float(np.ptp(t)), 1), "widthMm": round(float(4 * np.sqrt(s[1] * s[2] / len(pit))), 1),
            "volumeMm3": round(float(len(pit) * st ** 3), 1), "fromLabelMm": round(float(dist.min()), 2)}


def arc(P: np.ndarray) -> np.ndarray:
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P[:, :3], axis=0), axis=1))])


def in_bone_mm(bone: DrawnBone, P: np.ndarray) -> tuple[float, float]:
    """A centre line's length inside the bone and its greatest depth there (mm)."""
    Q = G.resample(P[:, :3], 0.25)
    d = bone.dist(Q)
    seg = np.linalg.norm(np.diff(Q, axis=0), axis=1)
    return round(float(seg[(d[:-1] < 0) & (d[1:] < 0)].sum()), 1), round(float(max(-d.min(), 0.0)), 1)


def kept_clear(bone: DrawnBone, P: np.ndarray, r: np.ndarray, ends: int = 1) -> np.ndarray:
    """A moved stretch (x, y, z, r) sampled every STEP_MM, led round the bone and pushed CLEAR_MM clear of it; its
    first point stays, and its last (`ends` = 2)."""
    t = arc(P)
    Q = G.resample(P[:, :3], STEP_MM)
    clearance = float(r.max()) + CLEAR_MM
    Q, _ = bone.thread(Q, clearance)
    if ends == 2:        # (pushed from both ends: each half with its own end fixed)
        h = len(Q) // 2
        a, _ = bone.clear(Q[:h + 1], clearance, fixed=1)
        b, _ = bone.clear(Q[h:][::-1], clearance, fixed=1)
        Q = np.vstack([a[:-1], 0.5 * (a[-1:] + b[-1:]), b[::-1][1:]])
    else:
        Q, _ = bone.clear(Q, clearance, fixed=1)
    tq = arc(Q)
    return np.c_[Q, np.interp(tq / max(tq[-1], 1e-9), t / max(t[-1], 1e-9), r)]


def bezier(p0: np.ndarray, t0: np.ndarray, p3: np.ndarray, t3: np.ndarray) -> np.ndarray:
    """A smooth curve from p0 (leaving along t0) to p3 (arriving along t3), sampled every STEP_MM or so: a cubic whose
    inner control points lie a third of the chord from its ends."""
    c = float(np.linalg.norm(p3 - p0)) / 3
    p1, p2 = p0 + c * t0, p3 - c * t3
    u = np.linspace(0, 1, max(int(np.ceil(3 * c / STEP_MM)), 4) + 1)[:, None]
    return (1 - u) ** 3 * p0 + 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u ** 2 * p2 + u ** 3 * p3


def tangent(P: np.ndarray, i: int, k: int = 2) -> np.ndarray:
    t = P[min(i + k, len(P) - 1), :3] - P[max(i - k, 0), :3]
    return t / np.linalg.norm(t)


def reroute(runs: list[np.ndarray], canal: dict, bone: DrawnBone) -> tuple[list[np.ndarray], dict]:
    """One side's runs with the rootlets gathered in front of the canal and the trunk led through it."""
    trunk = runs[0]
    # the rootlets: the other runs that start on the trunk and end at the medulla, where the trunk's own first rootlet does
    root_ids = [k for k in range(1, len(runs))
                if np.linalg.norm(runs[k][-1, :3] - trunk[0, :3]) < 8.0 and np.linalg.norm(trunk[:, :3] - runs[k][0, :3], axis=1).min() < 0.05]
    if not root_ids:
        raise SystemExit("the hypoglossal nerve's rootlets were not found")
    C = runs[root_ids[0]][0, :3]
    iC = int(np.argmin(np.linalg.norm(trunk[:, :3] - C, axis=1)))
    ax = canal["axis"]
    # where the rootlets meet now: in front of the inner opening, in the open
    Cn = canal["inner"] - GATHER_MM * ax
    for _ in range(12):
        if bone.dist(Cn[None])[0] >= trunk[iC, 3] + CLEAR_MM:
            break
        Cn = Cn - 0.25 * ax
    # where Z-Anatomy's trunk left the bone, and where the new one is back on it
    t = arc(trunk)
    d = bone.dist(trunk[:, :3])
    inside = np.flatnonzero((d < 0) & (t > t[iC] - 1) & (t < t[iC] + 60))
    j_out = int(inside.max()) + 1 if len(inside) else iC + 1
    j_re = min(int(np.searchsorted(t, t[j_out] + REJOIN_MM)), len(trunk) - 4)
    # the trunk: straight along the canal's axis from where the rootlets meet to BEYOND_MM past the outer opening, then
    # a smooth curve onto Z-Anatomy's own, arriving along it
    beyond = canal["outer"] + BEYOND_MM * ax
    curve = np.vstack([G.resample(np.array([Cn, beyond]), STEP_MM)[:-1], bezier(beyond, ax, trunk[j_re, :3], tangent(trunk, j_re))])
    r_new = np.interp(np.linspace(0, 1, len(curve)), [0, 1], [trunk[iC, 3], trunk[j_re, 3]])
    stretch = kept_clear(bone, np.c_[curve, r_new], r_new, ends=2)

    def moved_rootlet(R: np.ndarray) -> np.ndarray:
        """A rootlet from the medulla (first point) to where the rootlets meet (last): its first ROOTLET_KEEP_MM as
        Z-Anatomy has it, then a smooth curve to the new meeting point, arriving along the canal's axis; kept out of
        the bone."""
        tr = arc(R)
        k = max(int(np.searchsorted(tr, ROOTLET_KEEP_MM)), 1)
        new = np.vstack([R[:k, :3], bezier(R[k, :3], tangent(R, k, 1), Cn, ax)])
        tn = arc(new)
        r = np.interp(tn / tn[-1], tr / tr[-1], R[:, 3])
        out = kept_clear(bone, np.c_[new, r], r)
        out[-1, :3] = Cn
        return out
    out = list(runs)
    first = moved_rootlet(trunk[: iC + 1])
    out[0] = np.vstack([first[:-1], stretch, trunk[j_re + 1:]])
    for k in root_ids:
        out[k] = moved_rootlet(runs[k][::-1])[::-1]
    moved = max(float(np.linalg.norm(Cn - C)),
                float(np.linalg.norm(stretch[:, None, :3] - trunk[None, iC:j_re + 1, :3], axis=2).min(1).max()))
    before = [in_bone_mm(bone, R) for R in runs]
    after = [in_bone_mm(bone, R) for R in out]
    line = np.vstack([G.resample(R[:, :3], 0.25) for R in out])

    def turn(R: np.ndarray) -> float:
        """The sharpest turn of a centre line over 1.5 mm to either side of a point (degrees)."""
        Q = G.resample(R[:, :3], 0.5)
        a, b = Q[3:-3] - Q[:-6], Q[6:] - Q[3:-3]
        c = (a * b).sum(1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
        return float(np.degrees(np.arccos(np.clip(c, -1, 1))).max())
    rep = {"rootlets": len(root_ids) + 1, "gatheredAt": Cn.round(2).tolist(), "gatheredBefore": C.round(2).tolist(),
           "rejoinsAtMm": round(float(t[j_re]), 1), "leftBoneAtMm": round(float(t[j_out]), 1), "maxMovedMm": round(moved, 1),
           "inBoneBeforeMm": round(sum(b[0] for b in before), 1), "deepestBeforeMm": max(b[1] for b in before),
           "inBoneAfterMm": round(sum(a[0] for a in after), 1), "deepestAfterMm": max(a[1] for a in after),
           "toCanalCentreMm": round(float(np.linalg.norm(line - canal["centre"], axis=1).min()), 2),
           "toCanalCentreBeforeMm": round(float(np.linalg.norm(np.vstack([G.resample(R[:, :3], 0.25) for R in runs]) - canal["centre"], axis=1).min()), 2),
           "sharpestTurnDeg": round(max(turn(out[k]) for k in [0, *root_ids])),
           "lengthMm": round(float(arc(out[0])[-1]), 1), "lengthBeforeMm": round(float(t[-1]), 1)}
    return out, rep


NOTE = ("Z-Anatomy's curve ran through the occipital bone beside its own hypoglossal canal ({before} mm of it in bone a side, "
        "{deep} mm deep). Led through the canal instead (skullbase_v1_xii.py: the canal found as the open space the bone "
        "encloses beside its label, {length} mm long and {width} mm across; the rootlets gathered in front of its inner opening, "
        "the trunk along its axis and back on Z-Anatomy's curve {rejoin} mm beyond the bone; moved up to {moved} mm): a drawing "
        "choice, the bone as the model has it.")


def main() -> int:
    ex = json.loads((BUILD / "export.json").read_text())
    b = ex["bones"][BONE]
    m = trimesh.Trimesh(np.array(b["verts"], float), np.array(b["tris"], int), process=True)
    solid, lo = bone_inside(np.asarray(m.vertices), np.asarray(m.faces), CANAL_STEP_MM)
    a = np.diag([CANAL_STEP_MM] * 3 + [1.0])
    a[:3, 3] = lo
    bone = DrawnBone(solid, a)
    label = np.array(next(lm for lm in ex["landmarks"] if lm["name"] == LABEL)["ras"], float)
    sid = SB.slug(NERVE)
    nodes, report, cent = [], {}, {}
    for s in "LR":
        lab_s = label * np.array([1.0 if (s == "R") == (label[0] > 0) else -1.0, 1, 1])
        canal = find_canal(solid, lo, lab_s)
        runs = [np.array(r, float) for r in ex["lines"][f"{NERVE}.{s.lower()}"]["runs"]]
        new, rep = reroute(runs, canal, bone)
        report[s] = {"canal": {k: (v.round(2).tolist() if isinstance(v, np.ndarray) else v) for k, v in canal.items()}, **rep}
        vs, ns, ts, off = [], [], [], 0
        for R in new:                              # (its tube as skullbase_build.py builds it, from the moved lines)
            v_, n_, t_ = SB.tube(R)
            if len(t_):
                vs.append(v_); ns.append(n_); ts.append(t_ + off); off += len(v_)
        nodes.append({"name": s, "positions": np.vstack(vs), "normals": np.vstack(ns), "indices": np.vstack(ts), "mode": TRIANGLES})
        cent[s] = np.vstack([R[:, :3] for R in new]).mean(0).round(2).tolist()
        print(f"hypoglossal nerve {s}: {report[s]}")
    write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
    (BUILD / "xii.json").write_text(json.dumps({"report": report}, indent=1))
    p = GEN / "sb-manifest.json"
    man = json.loads(p.read_text())
    it = next(x for x in man["structures"] if x["id"] == sid)
    r = report["R"]
    it["derivation"] = it["derivation"].split(" Z-Anatomy's curve ran through the occipital bone")[0].rstrip() + " " + NOTE.format(
        before=max(report[s]["inBoneBeforeMm"] for s in "LR"), deep=max(report[s]["deepestBeforeMm"] for s in "LR"),
        length=r["canal"]["lengthMm"], width=r["canal"]["widthMm"], rejoin=REJOIN_MM, moved=max(report[s]["maxMovedMm"] for s in "LR"))
    it["centroid"] = cent
    p.write_text(json.dumps(man, indent=1, ensure_ascii=False))
    from modifications import record
    record("sb", "skullbase_v1_xii", "the hypoglossal nerve led through the hypoglossal canal of the model's own occipital bone "
           "(its rootlets gathered in front of the canal, its trunk along the canal's axis); beyond the bone, and its branches, unchanged",
           [NERVE], {"canalStepMm": CANAL_STEP_MM, "narrowMm": NARROW_MM, "enclosedMm": ENCLOSED_MM, "enclosedDirs": ENCLOSED_DIRS,
                     "gatherMm": GATHER_MM, "beyondMm": BEYOND_MM, "rejoinMm": REJOIN_MM, "clearMm": CLEAR_MM},
           report, {"check": "skullbase_build.py finalize: the nerve passes within 0.5 mm of the canal's centre, under 1 mm of it in bone"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
