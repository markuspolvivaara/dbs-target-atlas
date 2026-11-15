"""Skull base v1 (the Z-Anatomy model): four of its vessels put where the model's own bone and brain say they lie.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_vessels.py
  (after skullbase_v1_endonasal.py, when every step that shapes v1's arteries has run; then
   SB_PROFILE=v1 skullbase_v3_tumours.py, whose pushed copies start from the arteries as moved here,
   skullbase_v1_inbone.py, which measures the tubes as moved, compress.mjs skullbase and skullbase_build.py finalize)

Z-Anatomy draws its vessels as curves and its bones and brain as meshes, each on its own (skullbase_v1_inbone.py). Four
of the vessels lie where the model's own bone and brain show they cannot (the audit's finding MC-11, and what its
follow-up found):

* The straight and occipital sinuses. In Z-Anatomy's Blender file both start 44.5 mm in front of the confluence of the
  sinuses: the straight sinus ran from above the hypophysis down into the posterior fossa, the occipital sinus from in
  front of the cerebellum through the medulla into the clivus. The offset is measured: the confluence (where the
  superior sagittal sinus meets both transverse sinuses) less the two sinuses' common first point. Moved back by it,
  the straight sinus runs from the confluence over the cerebellum and its far end meets the inferior sagittal sinus
  (within MEETS_MM: the check that the offset is the whole of the mistake). The occipital sinus, then clear of the bone
  but some millimetres above the internal occipital crest, is laid onto the crest, where the falx cerebelli's attached
  margin holds it (onto_bone: its wall CREST_GAP_MM from the bone; over its first CREST_FREE_MM it follows less, so it
  still starts at the confluence).
* The basilar artery. Z-Anatomy draws it pressed into the clivus and the dorsum sellae (its centre line in the bone for
  19 of its 26 mm, its wall up to 1.8 mm deep); in life it lies on the pons, and the model's pons is 2.2 to 4.4 mm
  behind its centre line. The centre line is pushed out of the bone until its wall is CLEAR_MM clear
  (drawn_bone.DrawnBone.clear, the push spread along it, in the midline). The wall may not enter the pons by more than
  TOUCH_MM. Every artery is then carried by the same move where it lies near the basilar artery: fully within the
  artery's radius, fading to nothing FALLOFF_MM further out. The move is a function of position, so a junction moves
  alike on both of its vessels: the vertebral, anterior inferior and superior cerebellar, posterior cerebral and
  pontine arteries still meet the basilar artery where they did, and the posterior communicating artery the posterior
  cerebral. The pontine branches, which Z-Anatomy also draws along the clivus, have what is left in the bone pushed
  CLEAR_MM out of it.
* The middle meningeal artery. Z-Anatomy's sphenoid has a foramen spinosum beside the model's own label for it; the
  artery passes 3.3 mm medial to it, through solid bone. The foramen is found as the hypoglossal canal is
  (skullbase_v1_xii.find_canal: the open space the bone encloses beside the label) and the artery led through it.
  Z-Anatomy's curve is left LEAVE_MM before it first comes near the bone; the new course arrives BEYOND_MM below the
  foramen's outer opening, runs straight along its axis to BEYOND_MM past its inner one, and rejoins Z-Anatomy's curve
  REJOIN_MM after that left the bone; it is kept CLEAR_MM out of the bone (skullbase_v1_xii.kept_clear).

The moved curves are rebuilt into tubes as skullbase_build.py builds them. The carried arteries were reshaped by
earlier steps (the cerebellar arteries by skullbase_v1_pfossa.py) and carry the approaches' shapes, so their vertices
are moved instead and the shapes' offsets kept. A tumour's pushed copy of an artery is left to the tumours, which run
after this step and make it from the artery as moved. Each carried file is stamped and its unmoved copy kept in
BUILD/pre_vessels, its centroid in pre_vessels/centroids.json, so the step can run again with the same result.
Z-Anatomy's export is not changed: skullbase_v1_endonasal.py measures its distances to the arteries on Z-Anatomy's
curves, so the endonasal view keeps the basilar artery where Z-Anatomy drew it.

Writes the moved and carried tubes, their derivations and centroids in v1's manifest, and the step's record.
"""
from __future__ import annotations

import json
import shutil
import struct
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_build as SB  # noqa: E402
import skullbase_v1_xii as XII  # noqa: E402
from drawn_bone import DrawnBone  # noqa: E402
from glb import TRIANGLES, read_glb_full, write_glb  # noqa: E402

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"
PRE = BUILD / "pre_vessels"
PRE_CENTROIDS = PRE / "centroids.json"
GRID_MM = 0.25           # the bone and the brainstem are filled on this grid (skullbase_v1_xii.bone_inside)
CLEAR_MM = 0.2           # a moved vessel's wall kept this far out of the bone
MARGIN_MM = 14.0         # the bone is taken on a block this much larger than what is moved
STAMP = "carriedWithBasilar"
MARK = "Corrected position (skullbase_v1_vessels.py): "
# the sinuses
SINUSES = ("Straight sinus", "Occipital sinus")
OFFSET_MM = (30.0, 60.0)  # the offset found must lie in this range
MEETS_MM = 2.0           # moved back, the straight sinus's far end lies within this of the inferior sagittal sinus
CREST_GAP_MM = 0.1       # the occipital sinus's wall this far from the crest
CREST_FREE_MM = 6.0      # over its first this many mm it follows less (it starts at the confluence)
CREST_PASSES = 60
# the basilar artery
BASILAR = "Basilar artery"
FALLOFF_MM = 8.0         # what lies near it moves with it, fading to nothing this far beyond its wall
TOUCH_MM = 0.3           # its wall may meet the pons, and enter it by no more than this
PUSH_STEP_MM = 0.5       # its centre line is pushed out of the bone sampled this finely
BRANCHES = ("Medial pontine branches of basilar artery", "Lateral pontine branches of basilar artery")
STEM = ("pf_pons", "pf_medulla", "pf_midbrain")
NERVES = ("Oculomotor nerve (III)", "Trochlear nerve (IV)", "Trigeminal nerve (V)", "Abducens nerve (VI)")
# the middle meningeal artery
MMA = "Middle meningeal artery"
FS_LABEL = "Foramen spinosum"
FS_BONE = "Sphenoid bone"
FS_BOX_MM = 8.0          # the foramen is sought within this of its label (the sphenoid's grid ends nearer than the default)
LEAVE_MM = 1.5           # Z-Anatomy's curve is left this far before it first comes within its clearance of the bone
BEYOND_MM = 1.5          # the artery follows the foramen's axis this far past each opening
REJOIN_MM = 4.0          # and is back on Z-Anatomy's curve this far along it after that left the bone


def arc(P: np.ndarray) -> np.ndarray:
    return np.concatenate([[0.0], np.cumsum(np.linalg.norm(np.diff(P[:, :3], axis=0), axis=1))])


def dense(R: np.ndarray, step: float) -> np.ndarray:
    """A centre line (x, y, z, r) resampled every `step` mm along it (its ends kept)."""
    t = arc(R)
    u = np.unique(np.r_[np.arange(0, t[-1], step), t[-1]])
    return np.stack([np.interp(u, t, R[:, k]) for k in range(R.shape[1])], 1)


def affine(lo: np.ndarray) -> np.ndarray:
    a = np.diag([GRID_MM] * 3 + [1.0])
    a[:3, 3] = lo
    return a


def paste(dst: np.ndarray, lo: np.ndarray, src: np.ndarray, lo_src: np.ndarray) -> None:
    """OR a filled grid into a block of the same spacing (both origins on the same lattice)."""
    o = np.rint((lo_src - lo) / GRID_MM).astype(int)
    a0, a1 = np.maximum(o, 0), np.minimum(o + np.array(src.shape), dst.shape)
    if (a1 > a0).all():
        dst[a0[0]:a1[0], a0[1]:a1[1], a0[2]:a1[2]] |= src[a0[0] - o[0]:a1[0] - o[0], a0[1] - o[1]:a1[1] - o[1], a0[2] - o[2]:a1[2] - o[2]]


class Solids:
    """Z-Anatomy's bones (not its sinuses' air), each filled once, and the brainstem: their union on a block, as a
    drawn_bone.DrawnBone (signed distance, positive outside)."""

    def __init__(self, ex: dict):
        self.ex = ex
        self.filled: dict[str, tuple[np.ndarray, np.ndarray]] = {}

    def fill(self, key: str, V: np.ndarray, F: np.ndarray, process: bool) -> tuple[np.ndarray, np.ndarray]:
        if key not in self.filled:
            m = trimesh.Trimesh(V, F, process=process)
            self.filled[key] = XII.bone_inside(np.asarray(m.vertices, float), np.asarray(m.faces, int), GRID_MM)
        return self.filled[key]

    def block(self, P: np.ndarray, margin: float, stem: bool = False) -> DrawnBone:
        lo, hi = np.floor(P[:, :3].min(0) - margin), np.ceil(P[:, :3].max(0) + margin)
        out = np.zeros(tuple(np.round((hi - lo) / GRID_MM).astype(int) + 1), bool)
        if stem:
            for sid in STEM:
                for node, nd in read_glb_full(BUILD / f"{sid}.glb").items():
                    paste(out, lo, *self.fill(f"{sid}.{node}", nd["positions"], nd["indices"], False))
        else:
            for bn, b in self.ex["bones"].items():
                V = np.asarray(b["verts"], float)
                if bn.startswith("Sinus of") or (V.max(0) < lo).any() or (V.min(0) > hi).any():
                    continue
                paste(out, lo, *self.fill(bn, V, np.asarray(b["tris"], int), True))
        return DrawnBone(out, affine(lo))


def gradient(field: DrawnBone, P: np.ndarray) -> np.ndarray:
    """The field's unit gradient (away from the solid)."""
    g = np.stack([(field.dist(P + 0.3 * e) - field.dist(P - 0.3 * e)) / 0.6 for e in np.eye(3)], 1)
    return g / np.maximum(np.linalg.norm(g, axis=1), 1e-6)[:, None]


def in_bone(field: DrawnBone, R: np.ndarray) -> tuple[float, float, float]:
    """A centre line's length inside the solid, its greatest depth there, and its wall's least clearance (mm)."""
    Q = dense(R, 0.25)
    d = field.dist(Q[:, :3])
    seg = np.linalg.norm(np.diff(Q[:, :3], axis=0), axis=1)
    wall = d - np.maximum(Q[:, 3], SB.TUBE_MIN_RADIUS_MM)
    return round(float(seg[(d[:-1] < 0) & (d[1:] < 0)].sum()), 1), round(float(max(-d.min(), 0.0)), 1), round(float(wall.min()), 2)


def tubes(per: dict[str, list[np.ndarray]]) -> tuple[list[dict], dict]:
    """GLB nodes for each side's runs, as skullbase_build.py builds a tube, and its centroids."""
    nodes, cent = [], {}
    for side in ("L", "R"):
        vs, ns, ts, off = [], [], [], 0
        for R in per.get(side, []):
            v_, n_, t_ = SB.tube(R)
            if len(t_):
                vs.append(v_); ns.append(n_); ts.append(t_ + off); off += len(v_)
        if ts:
            nodes.append({"name": side, "positions": np.vstack(vs), "normals": np.vstack(ns), "indices": np.vstack(ts), "mode": TRIANGLES})
            cent[side] = np.vstack([R[:, :3] for R in per[side]]).mean(0).round(2).tolist()
    for side in ("L", "R"):
        cent.setdefault(side, cent.get("R" if side == "L" else "L"))
    return nodes, cent


def midline(runs: list[np.ndarray]) -> dict[str, list[np.ndarray]]:
    per: dict[str, list[np.ndarray]] = {"L": [], "R": []}
    for R in runs:
        for side, pieces in SB.split_midline(R).items():
            per[side].extend(p for p in pieces if len(p) >= 2)
    return per


def turn(R: np.ndarray) -> float:
    """The sharpest turn of a centre line over 1.5 mm to either side of a point (degrees)."""
    Q = dense(R, 0.5)[:, :3]
    a, b = Q[3:-3] - Q[:-6], Q[6:] - Q[3:-3]
    c = (a * b).sum(1) / (np.linalg.norm(a, axis=1) * np.linalg.norm(b, axis=1))
    return round(float(np.degrees(np.arccos(np.clip(c, -1, 1))).max()))


# --- the straight and occipital sinuses ------------------------------------------------------------------------------

def onto_bone(bone: DrawnBone, R: np.ndarray, gap: float, free_mm: float) -> np.ndarray:
    """A midline centre line (x, y, z, r) drawn onto the bone: each point moved along the bone's distance gradient until
    the wall is `gap` from it (pulled in from the open, pushed out of the bone), the moves spread along the line; the
    first point stays and the first `free_mm` follow by a share rising from none to all."""
    P = dense(R, 0.5)
    Q, x0 = P[:, :3].copy(), P[:, 0].copy()
    u = np.clip(arc(P) / free_mm, 0, 1)
    share = u * u * (3 - 2 * u)
    target = np.maximum(P[:, 3], SB.TUBE_MIN_RADIUS_MM) + gap
    for _ in range(CREST_PASSES):
        need = (bone.dist(Q) - target) * share
        if np.abs(need).max() < 0.02:
            break
        D = -need[:, None] * gradient(bone, Q)
        for _ in range(3):
            D[1:-1] = 0.5 * D[1:-1] + 0.25 * (D[:-2] + D[2:])
        Q += 0.5 * D
        Q[:, 0] = x0
    return np.c_[Q, P[:, 3]]


def sinuses(ex: dict, solids: Solids) -> tuple[dict, dict]:
    L = ex["lines"]
    run = lambda n: np.array(L[n]["runs"][0], float)     # noqa: E731
    for n in (*SINUSES, "Superior sagittal sinus", "Inferior sagittal sinus"):
        if len(L[n]["runs"]) != 1:
            raise SystemExit(f"{n}: {len(L[n]['runs'])} runs in Z-Anatomy's export, one expected")
    sss, iss = run("Superior sagittal sinus"), run("Inferior sagittal sinus")
    trans = [np.array(L[f"Transverse sinus.{s}"]["runs"][0], float)[:, :3] for s in "lr"]
    # the confluence: the superior sagittal sinus's end that both transverse sinuses start at
    conf = min((sss[0, :3], sss[-1, :3]), key=lambda p: max(np.linalg.norm(T - p, axis=1).min() for T in trans))
    conf_gap = max(np.linalg.norm(T - conf, axis=1).min() for T in trans)
    # the straight and occipital sinuses' common first point
    a, b = run(SINUSES[0]), run(SINUSES[1])
    ea, eb = min(((i, j) for i in (0, -1) for j in (0, -1)), key=lambda ij: np.linalg.norm(a[ij[0], :3] - b[ij[1], :3]))
    a, b = (a if ea == 0 else a[::-1]), (b if eb == 0 else b[::-1])
    common = 0.5 * (a[0, :3] + b[0, :3])
    offset = conf - common
    if not (np.linalg.norm(a[0, :3] - b[0, :3]) < 0.5 and conf_gap < 0.5 and OFFSET_MM[0] <= np.linalg.norm(offset) <= OFFSET_MM[1]):
        raise SystemExit(f"the sinuses' offset was not found as expected: {offset.round(2)}, their starts "
                         f"{np.linalg.norm(a[0, :3] - b[0, :3]):.2f} mm apart, the confluence {conf_gap:.2f} mm from the transverse sinuses")
    shift = np.r_[offset, 0.0]
    st, oc = a + shift, b + shift
    meets = float(min(np.linalg.norm(st[-1, :3] - iss[k, :3]) for k in (0, -1)))
    if meets > MEETS_MM:
        raise SystemExit(f"moved back, the straight sinus ends {meets:.1f} mm from the inferior sagittal sinus")
    pts = np.vstack([oc[:, :3], b[:, :3]])
    bone = solids.block(pts, MARGIN_MM)
    laid = onto_bone(bone, oc, CREST_GAP_MM, CREST_FREE_MM)
    t = arc(laid)
    gap = bone.dist(laid[:, :3]) - np.maximum(laid[:, 3], SB.TUBE_MIN_RADIUS_MM)
    on = t >= CREST_FREE_MM
    oc_d = dense(oc, 0.5)
    rep = {"offsetMm": np.round(offset, 2).tolist(), "offsetLengthMm": round(float(np.linalg.norm(offset)), 1),
           "confluence": np.round(conf, 2).tolist(),
           "straight": {"toConfluenceMm": round(float(np.linalg.norm(st[0, :3] - conf)), 2), "toInferiorSagittalMm": round(meets, 2),
                        "toConfluenceBeforeMm": round(float(np.linalg.norm(a[0, :3] - conf)), 1)},
           "occipital": {"toConfluenceMm": round(float(np.linalg.norm(laid[0, :3] - conf)), 2),
                         "inBoneBeforeMm": in_bone(bone, b)[0], "deepestBeforeMm": in_bone(bone, b)[1],
                         "inBoneAfterMm": in_bone(bone, laid)[0], "deepestAfterMm": in_bone(bone, laid)[1],
                         "offCrestBeforeMm": round(float(np.median(bone.dist(oc_d[:, :3]) - oc_d[:, 3])), 1),
                         "offCrestMaxMm": round(float(gap[on].max()), 2), "offCrestMinMm": round(float(gap[on].min()), 2),
                         "laidMaxMm": round(float(np.linalg.norm(laid[:, None, :3] - oc_d[None, :, :3], axis=2).min(1).max()), 1),
                         "lengthMm": round(float(t[-1]), 1), "lengthBeforeMm": round(float(arc(b)[-1]), 1)}}
    return {SINUSES[0]: midline([st]), SINUSES[1]: midline([laid])}, rep


# --- the basilar artery and what is joined to it ---------------------------------------------------------------------

class Carry:
    """The basilar artery's move as a field: at a point, the move of the nearest point of its centre line, all of it
    within `inner` mm of that line, fading (smoothstep) to none FALLOFF_MM further out."""

    def __init__(self, C: np.ndarray, V: np.ndarray, inner: float):
        self.C, self.V, self.inner = C, V, inner
        self.tree = cKDTree(C)

    def __call__(self, P: np.ndarray) -> np.ndarray:
        d, i = self.tree.query(np.asarray(P, float)[:, :3])
        x = np.clip((d - self.inner) / FALLOFF_MM, 0, 1)
        return self.V[i] * (1 - x * x * (3 - 2 * x))[:, None]


def stamped(f: Path) -> bool:
    b = f.read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    return bool((json.loads(b[20:20 + n]).get("extras") or {}).get(STAMP))


def unmoved(sid: str) -> Path:
    """The file as the steps before this one left it: its kept copy when this step has already carried it."""
    f, pre = BUILD / f"{sid}.glb", PRE / f"{sid}.glb"
    if stamped(f):
        if not pre.exists():
            raise SystemExit(f"{sid}: carried by an earlier run, and its unmoved copy is missing ({pre})")
        return pre
    return f


def kept_centroids() -> dict:
    """The carried items' centroids as the steps before this one left them (kept when this step first carried them)."""
    return json.loads(PRE_CENTROIDS.read_text()) if PRE_CENTROIDS.exists() else {}


def kept_centroid(sid: str, kept: dict) -> dict:
    if sid not in kept:
        raise SystemExit(f"{sid}: carried by an earlier run, and its unmoved centroid is missing ({PRE_CENTROIDS})")
    return kept[sid]


def basilar(ex: dict, solids: Solids) -> tuple[dict, dict, dict, Carry]:
    R = [np.array(r, float) for r in ex["lines"][BASILAR]["runs"]]
    if len(R) != 1:
        raise SystemExit(f"{BASILAR}: {len(R)} runs, one expected")
    R = R[0]
    rad = float(np.maximum(R[:, 3], SB.TUBE_MIN_RADIUS_MM).max())
    branches = {n: {s: [np.array(r, float) for r in ex["lines"][f"{n}.{s.lower()}"]["runs"]] for s in "LR"} for n in BRANCHES}
    pts = np.vstack([R[:, :3]] + [r[:, :3] for b in branches.values() for rs in b.values() for r in rs])
    bone = solids.block(pts, FALLOFF_MM + MARGIN_MM)
    stem = solids.block(pts, FALLOFF_MM + MARGIN_MM, stem=True)
    # the centre line out of the bone, in the midline
    P = dense(R, PUSH_STEP_MM)
    Q = P[:, :3].copy()
    for _ in range(3):
        Q, left = bone.clear(Q, rad + CLEAR_MM)
        Q[:, 0] = P[:, 0]
    wall_bone = bone.dist(Q) - rad
    wall_stem = stem.dist(Q) - rad
    if wall_bone.min() < CLEAR_MM - 0.05 or wall_stem.min() < -TOUCH_MM:
        raise SystemExit(f"the basilar artery could not be moved clear: wall {wall_bone.min():.2f} mm from the bone, "
                         f"{wall_stem.min():.2f} mm from the brainstem")
    t = arc(P)
    Dn = dense(R, 0.1)
    td = arc(Dn)
    V = np.stack([np.interp(td / td[-1], t / t[-1], Q[:, k] - P[:, k]) for k in range(3)], 1)
    V[:, 0] = 0.0
    carry = Carry(Dn[:, :3], V, rad + 0.3)
    moved_line = np.c_[R[:, :3] + carry(R[:, :3]), R[:, 3]]
    before, after = in_bone(bone, R), in_bone(bone, moved_line)
    stem_before = float((stem.dist(dense(R, 0.25)[:, :3]) - rad).min())
    stem_after = float((stem.dist(dense(moved_line, 0.25)[:, :3]) - rad).min())
    rep = {"basilar": {"inBoneBeforeMm": before[0], "deepestBeforeMm": before[1], "wallBeforeMm": before[2],
                       "inBoneAfterMm": after[0], "deepestAfterMm": after[1], "wallAfterMm": after[2],
                       "toBrainstemBeforeMm": round(stem_before, 2), "toBrainstemAfterMm": round(stem_after, 2),
                       "lengthMm": round(float(arc(R)[-1]), 1), "radiusMm": round(rad, 2),
                       "maxMovedMm": round(float(np.linalg.norm(V, axis=1).max()), 2), "minMovedMm": round(float(np.linalg.norm(V, axis=1).min()), 2)}}
    moved = {BASILAR: midline([moved_line])}
    # the pontine branches: carried, then what is left in the bone pushed out of it
    rep["branches"] = {}
    for n, sides in branches.items():
        per, rb = {}, {}
        for s, runs in sides.items():
            out, mv = [], 0.0
            for r in runs:
                Pc = dense(np.c_[r[:, :3] + carry(r[:, :3]), r[:, 3]], 0.5)
                Qc, _ = bone.clear(Pc[:, :3], float(np.maximum(Pc[:, 3], SB.TUBE_MIN_RADIUS_MM).max()) + CLEAR_MM)
                out.append(np.c_[Qc, Pc[:, 3]])
                ref = dense(r, 0.5)[:, :3]
                mv = max(mv, float(np.linalg.norm(Qc[:, None] - ref[None], axis=2).min(1).max()))
            per[s] = out
            b0 = [in_bone(bone, r) for r in runs]
            b1 = [in_bone(bone, r) for r in out]
            rb[s] = {"inBoneBeforeMm": round(sum(x[0] for x in b0), 1), "deepestBeforeMm": max(x[1] for x in b0),
                     "inBoneAfterMm": round(sum(x[0] for x in b1), 1), "deepestAfterMm": max(x[1] for x in b1), "maxMovedMm": round(mv, 2)}
        moved[n] = per
        rep["branches"][n] = rb
    return moved, rep, {"bone": bone, "stem": stem}, carry


def carried(man: dict, carry: Carry, fields: dict) -> tuple[dict, dict]:
    """Every other artery's tube moved by the field where it reaches it (the approaches' shapes kept as they are)."""
    bone, stem = fields["bone"], fields["stem"]
    out, rep = {}, {}
    skip = {SB.slug(n) for n in (BASILAR, *BRANCHES)}
    for it in man["structures"]:
        if it["type"] != "tube" or it.get("category") != "artery" or it["id"] in skip or it.get("forView") or it.get("replaces"):
            continue
        f = BUILD / f"{it['id']}.glb"
        if not f.exists():
            continue
        src = unmoved(it["id"])
        g = read_glb_full(src)
        P = np.vstack([nd["positions"] for nd in g.values()])
        D = carry(P)
        mv = np.linalg.norm(D, axis=1)
        if mv.max() < 1e-3:
            if src != f:                 # (carried before, out of reach now: its file and centroid as they were)
                it["centroid"] = kept_centroid(it["id"], kept_centroids())
                shutil.copy(src, f)
            continue
        nodes, k, cshift = [], 0, {}
        for name, nd in g.items():
            n_ = len(nd["positions"])
            d_ = D[k:k + n_]
            k += n_
            nodes.append({"name": name, "positions": nd["positions"] + d_, "normals": nd["normals"], "indices": nd["indices"], "mode": TRIANGLES,
                          **({"targets": [{"name": t["name"], "positions": t["positions"], "normals": t["normals"]} for t in nd["targets"]]} if nd["targets"] else {})})
            cshift[name] = d_.mean(0)
        out[it["id"]] = (nodes, cshift, src)
        Pm = P + D
        rep[it["id"]] = {"maxMovedMm": round(float(mv.max()), 2), "vertsMoved": int((mv > 1e-3).sum()), "verts": len(P),
                         "deepInBone": [int((bone.dist(P) < -0.5).sum()), int((bone.dist(Pm) < -0.5).sum())],
                         "inBrainstem": [int((stem.dist(P) < 0).sum()), int((stem.dist(Pm) < 0).sum())]}
    return out, rep


def joins(before: dict, after: dict, ids: list[str]) -> dict:
    """Each carried artery's nearest vertex to the basilar artery's surface, before and after (mm)."""
    def verts(src: dict, sid: str) -> np.ndarray:
        return np.vstack([nd["positions"] for nd in src[sid].values()])
    tb, ta = cKDTree(verts(before, "sb_basilar_artery")), cKDTree(verts(after, "sb_basilar_artery"))
    return {sid: [round(float(tb.query(verts(before, sid))[0].min()), 2), round(float(ta.query(verts(after, sid))[0].min()), 2)] for sid in ids}


# --- the middle meningeal artery -------------------------------------------------------------------------------------

def foramen(solids: Solids, label: np.ndarray) -> dict:
    """The foramen spinosum in Z-Anatomy's sphenoid beside its label (skullbase_v1_xii.find_canal), its axis pointing
    up into the cranial cavity: `outer` its opening below, `inner` the one above."""
    b = solids.ex["bones"][FS_BONE]
    solid, lo = solids.fill(FS_BONE, np.asarray(b["verts"], float), np.asarray(b["tris"], int), True)
    box, XII.CANAL_BOX_MM = XII.CANAL_BOX_MM, FS_BOX_MM
    try:
        c = XII.find_canal(solid, lo, label)
    finally:
        XII.CANAL_BOX_MM = box
    ends = sorted([c["inner"], c["outer"]], key=lambda p: p[2])
    ax = ends[1] - ends[0]
    c.update(axis=ax / np.linalg.norm(ax), outer=ends[0], inner=ends[1])
    return c


def through_foramen(R: np.ndarray, c: dict, bone: DrawnBone) -> tuple[np.ndarray, dict]:
    """One side's artery led through the foramen (see the module's notes)."""
    t = arc(R)
    r_t = np.maximum(R[:, 3], SB.TUBE_MIN_RADIUS_MM)
    d = bone.dist(R[:, :3])
    near = np.flatnonzero(d < r_t + CLEAR_MM)
    if not len(near):
        raise SystemExit(f"{MMA}: never comes near the bone")
    k = max(int(np.searchsorted(t, t[near[0]] - LEAVE_MM)) - 1, 1)
    j_out = int(np.flatnonzero(d < 0).max()) + 1 if (d < 0).any() else int(near.max()) + 1
    j_re = min(int(np.searchsorted(t, t[j_out] + REJOIN_MM)), len(R) - 2)
    ax = c["axis"]
    below, above = c["outer"] - BEYOND_MM * ax, c["inner"] + BEYOND_MM * ax
    curve = np.vstack([XII.bezier(R[k, :3], XII.tangent(R, k), below, ax)[:-1],
                       XII.G.resample(np.array([below, above]), XII.STEP_MM)[:-1],
                       XII.bezier(above, ax, R[j_re, :3], XII.tangent(R, j_re))])
    r_new = np.interp(np.linspace(0, 1, len(curve)), [0, 1], [R[k, 3], R[j_re, 3]])
    stretch = XII.kept_clear(bone, np.c_[curve, r_new], r_new, ends=2)
    out = np.vstack([R[:k], stretch, R[j_re + 1:]])
    ref = dense(R, 0.25)[:, :3]
    line = dense(out, 0.25)[:, :3]
    b0, b1 = in_bone(bone, R), in_bone(bone, out)
    rep = {"canal": {k_: (np.round(v, 2).tolist() if isinstance(v, np.ndarray) else v) for k_, v in c.items()},
           "leftCurveAtMm": round(float(t[k]), 1), "rejoinsAtMm": round(float(t[j_re]), 1),
           "inBoneBeforeMm": b0[0], "deepestBeforeMm": b0[1], "inBoneAfterMm": b1[0], "deepestAfterMm": b1[1], "wallAfterMm": b1[2],
           "toCanalCentreBeforeMm": round(float(np.linalg.norm(ref - c["centre"], axis=1).min()), 2),
           "toCanalCentreMm": round(float(np.linalg.norm(line - c["centre"], axis=1).min()), 2),
           "maxMovedMm": round(float(np.linalg.norm(stretch[:, None, :3] - ref[None], axis=2).min(1).max()), 1),
           "sharpestTurnDeg": turn(out), "lengthMm": round(float(arc(out)[-1]), 1), "lengthBeforeMm": round(float(t[-1]), 1),
           "originMovedMm": round(float(np.linalg.norm(out[0, :3] - R[0, :3])), 3)}
    return out, rep


def meningeal(ex: dict, solids: Solids) -> tuple[dict, dict]:
    label = np.array(next(lm for lm in ex["landmarks"] if lm["name"] == FS_LABEL)["ras"], float)
    per, rep = {"L": [], "R": []}, {}
    for s in "LR":
        lab_s = label * np.array([1.0 if (s == "R") == (label[0] > 0) else -1.0, 1, 1])
        runs = [np.array(r, float) for r in ex["lines"][f"{MMA}.{s.lower()}"]["runs"]]
        if len(runs) != 1:
            raise SystemExit(f"{MMA} {s}: {len(runs)} runs, one expected")
        c = foramen(solids, lab_s)
        bone = solids.block(np.vstack([runs[0][:, :3], c["centre"][None]]), MARGIN_MM)
        new, rep[s] = through_foramen(runs[0], c, bone)
        per[s] = [new]
    return {MMA: per}, rep


# --- the manifest ----------------------------------------------------------------------------------------------------

def note(it: dict, text: str) -> None:
    it["derivation"] = it["derivation"].split(" " + MARK)[0].rstrip() + " " + MARK + text


def main() -> int:
    ex = json.loads((BUILD / "export.json").read_text())
    p = GEN / "sb-manifest.json"
    man = json.loads(p.read_text())
    items = {it["id"]: it for it in man["structures"]}
    solids = Solids(ex)
    rebuilt, report = {}, {}
    sn, report["sinuses"] = sinuses(ex, solids)
    rebuilt.update(sn)
    bs, report["basilar"], fields, carry = basilar(ex, solids)
    rebuilt.update(bs)
    mm, report["meningeal"] = meningeal(ex, solids)
    rebuilt.update(mm)
    car, report["carried"] = carried(man, carry, fields)
    # the nerves near what moved: their nearest vertex to the moved arteries, before and after
    before_g = {sid: read_glb_full(unmoved(sid)) for sid in car}
    before_g["sb_basilar_artery"] = {n["name"]: n for n in tubes(midline([np.array(ex["lines"][BASILAR]["runs"][0], float)]))[0]}
    # write
    cents = {}
    for name, per in rebuilt.items():
        sid = SB.slug(name)
        nodes, cent = tubes(per)
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        cents[sid] = cent
    PRE.mkdir(exist_ok=True)
    kept = kept_centroids()
    for sid, (nodes, cshift, src) in car.items():
        if src == BUILD / f"{sid}.glb":  # (first carried: the unmoved file and centroid kept; a rerun shifts those)
            shutil.copy(src, PRE / f"{sid}.glb")
            kept[sid] = items[sid]["centroid"]
        c = kept_centroid(sid, kept)
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid, STAMP: True})
        cents[sid] = {s: (np.array(c[s]) + cshift.get(s, next(iter(cshift.values())))).round(2).tolist() for s in c}
    PRE_CENTROIDS.write_text(json.dumps(kept, indent=1))
    after_g = {sid: read_glb_full(BUILD / f"{sid}.glb") for sid in [*car, "sb_basilar_artery"]}
    report["joins"] = joins(before_g, after_g, list(car))
    nv = {}
    for n in NERVES:
        sid = SB.slug(n)
        tn = cKDTree(np.vstack([nd["positions"] for nd in read_glb_full(BUILD / f"{sid}.glb").values()]))
        for aid in after_g:
            b_ = float(tn.query(np.vstack([nd["positions"] for nd in before_g[aid].values()]))[0].min())
            a_ = float(tn.query(np.vstack([nd["positions"] for nd in after_g[aid].values()]))[0].min())
            if min(a_, b_) < 3.0:
                nv[f"{n} / {items[aid]['name']}{' (' + aid.split('__')[1] + ')' if '__' in aid else ''}"] = [round(b_, 2), round(a_, 2)]
    report["nerves"] = nv
    # the manifest: derivations and centroids
    S, B, M = report["sinuses"], report["basilar"]["basilar"], report["meningeal"]
    o = S["occipital"]
    note(items["sb_straight_sinus"],
         f"in Z-Anatomy's file this sinus starts {S['offsetLengthMm']} mm in front of the confluence of the sinuses (where the superior "
         "sagittal and transverse sinuses meet), so it ran from above the hypophysis down into the posterior fossa. Moved back by that "
         f"much, it starts at the confluence and its far end meets the inferior sagittal sinus ({S['straight']['toInferiorSagittalMm']} mm "
         "apart). Its shape is Z-Anatomy's.")
    note(items["sb_occipital_sinus"],
         f"in Z-Anatomy's file this sinus starts {S['offsetLengthMm']} mm in front of the confluence of the sinuses, so it ran from in front "
         f"of the cerebellum through the medulla into the clivus ({o['inBoneBeforeMm']} mm of it in the bone). Moved back by that much, it "
         f"starts at the confluence but lay a median {o['offCrestBeforeMm']} mm above the internal occipital crest; it is laid onto the crest, "
         f"where the falx cerebelli holds it (moved up to {o['laidMaxMm']} mm further).")
    note(items["sb_basilar_artery"],
         f"Z-Anatomy draws it pressed into the clivus and the dorsum sellae ({B['inBoneBeforeMm']} mm of its centre line in the bone, its "
         f"wall up to {-B['wallBeforeMm']:.1f} mm deep); in life it lies on the pons. Moved off the bone towards the pons until its wall is "
         f"{CLEAR_MM} mm clear of it ({B['minMovedMm']} to {B['maxMovedMm']} mm, in the midline); the arteries joined to it are moved with it "
         f"where they lie near it, less with distance, none {FALLOFF_MM:g} mm from it.")
    for n in BRANCHES:
        rb = report["basilar"]["branches"][n]
        note(items[SB.slug(n)],
             "moved with the basilar artery off the clivus, and what was left of it in the bone pushed "
             f"{CLEAR_MM} mm out of it ({max(r['inBoneBeforeMm'] for r in rb.values())} mm of it in bone a side before, "
             f"{max(r['inBoneAfterMm'] for r in rb.values())} after; moved up to {max(r['maxMovedMm'] for r in rb.values())} mm).")
    for sid, r in report["carried"].items():
        note(items[sid], f"moved with the basilar artery off the clivus where it lies near it (up to {r['maxMovedMm']} mm, less with "
                         f"distance from it, none {FALLOFF_MM:g} mm from it), so it meets it where it did.")
    m = M["R"]
    note(items[SB.slug(MMA)],
         f"Z-Anatomy's curve ran through the sphenoid bone beside the model's own foramen spinosum ({max(M[s]['inBoneBeforeMm'] for s in 'LR')} mm "
         f"of it in bone a side, {max(M[s]['deepestBeforeMm'] for s in 'LR')} mm deep, {m['toCanalCentreBeforeMm']} mm from the foramen's "
         f"centre at the nearest). Led through the foramen instead: found as the open space the bone encloses beside its label "
         f"({m['canal']['lengthMm']} mm long, {m['canal']['widthMm']} mm across), the artery along its axis and back on Z-Anatomy's curve "
         f"{REJOIN_MM:g} mm above the bone (moved up to {max(M[s]['maxMovedMm'] for s in 'LR')} mm). Its origin and its end are Z-Anatomy's.")
    for sid, c in cents.items():
        items[sid]["centroid"] = c
    p.write_text(json.dumps(man, indent=1, ensure_ascii=False))
    (BUILD / "vessels.json").write_text(json.dumps(report, indent=1))
    print(json.dumps(report, indent=1))
    from modifications import record
    record("sb", "skullbase_v1_vessels",
           "the straight and occipital sinuses moved back to the confluence (Z-Anatomy's file has them in front of it), the occipital "
           "sinus laid onto the internal occipital crest; the basilar artery moved off the clivus with the arteries joined to it; the "
           "middle meningeal artery led through the model's own foramen spinosum",
           [*SINUSES, BASILAR, *BRANCHES, MMA, *sorted({items[s]["name"] for s in report["carried"]})],
           {"gridMm": GRID_MM, "clearMm": CLEAR_MM, "meetsMm": MEETS_MM, "crestGapMm": CREST_GAP_MM, "crestFreeMm": CREST_FREE_MM,
            "falloffMm": FALLOFF_MM, "touchMm": TOUCH_MM, "leaveMm": LEAVE_MM, "beyondMm": BEYOND_MM, "rejoinMm": REJOIN_MM},
           report, {"check": "skullbase_build.py finalize: the sinuses at the confluence, the basilar artery and the middle meningeal "
                             "artery out of the bone, the latter through its foramen, every junction with the basilar kept"})
    return 0


if __name__ == "__main__":
    sys.exit(main())
