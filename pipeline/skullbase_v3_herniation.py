"""Skull base v3's herniation views: the shape of a brain herniation drawn by rule on this CT, as copies of the parts it
moves, for that view only. This step draws the TONSILLAR one (the uncal and subfalcine shapes are later steps).

  pipeline/.venv/bin/python -u -I -W ignore pipeline/skullbase_v3_herniation.py
  (after skullbase_v3_tumours.py; then node pipeline/compress.mjs skullbase-v3 <the files it names> and
  pipeline/.venv/bin/python -u -I -W ignore pipeline/skullbase_v3.py finalize. Several minutes on the desktop; one
  process, no workers.)

An illustration, not a simulation: the amount is chosen, not computed from pressure or tissue mechanics. 0 on the view's
slider is the fitted model at rest, 1 the shape drawn by the rules below; the viewer blends the two linearly, per vertex,
so every check is made on the moves as shipped at t = 0.05, 0.10, ... 1 (CHECK_T), and along each vertex's straight path.

The owner's decisions (26 November 2026), which this follows:
 1. Herniation comes as three pieces of work; this one is the tonsillar shape only, on skull base v3 only.
 2. Everything moved is a COPY drawn only in the herniation view: '<original id>__hn_tonsillar', with "replaces" (the
    original), "pushedFrom" (the original's file), "herniationView": "herniation_tonsillar" (not "forView", which
    skullbase_v3.py's approaches step drops), "copySides" ["L", "R"] (both halves move) and one morph target,
    "tonsillar" (rest = the original as shipped, full = the herniated shape). No brain or posterior fossa step reruns
    and no shipped original changes. The vessels pressed on (the posterior inferior cerebellar arteries) are displaced
    copies too, drawn only in this view.
 3. The view's slider is labelled as an illustration, not a simulation (the front end's text); the clinical wording is
    the owner's to read.

The shape (all amounts illustrative):
  * McRae's line, from the basion (the clivus's lowest point on the occipital bone's midsagittal slab, within
    MIDLINE_SLAB_MM of the "Foramen magnum" landmark's x) to the opisthion (the posterior rim's point nearest the basion
    on that slab), as pipeline/spine_ccj.py defines them on the CT. Its plane (McRae's plane) holds the line and the
    left-right axis; "below the line" is measured along the plane's caudal normal. Drawn as a guide tube (GUIDE_R_MM),
    'hn_mcrae_line', in two halves split where it crosses the CT's own midline (the mean of the basion's and the
    opisthion's x, about -1.4): the half on the basion's side is the node "L", the other "R", so that the setting that
    shows the right half only keeps half of the line.
  * One field over space gives every copied point its uncut move: w * rise * (descent * a + SQUEEZE * (x0 - x) * e_x +
    FORWARD_MM * f) + w * low * press. a is the way the back of the medulla runs past the foramen (a line fitted through
    its hindmost points from BACK_FIT_MM[0] above McRae's plane to BACK_FIT_MM[1] below; on this model straight down),
    so the tonsils go down along the medulla's back, not into it; f is McRae's line's direction towards the basion
    (towards the space behind the medulla), x0 its x (the canal's midline: the tonsils narrowed towards it); w is 1 on
    the tonsils and falls linearly to 0 at REACH_MM from them (the cerebellar hemispheres and the inferior vermis
    follow); rise falls linearly from 1 at McRae's plane to 0 at RISE_MM above it (the tonsil is drawn out, its top held
    by the peduncles, not pushed down whole; the upper cerebellum, by the peduncles, the pons and the arteries and nerves
    in front of it, hardly moves). The press moves the LOWER tonsil (low: 1 up to PRESS_FULL_MM above McRae's plane at
    rest, easing to 0 at PRESS_TOP_MM: the part that ends below the line) further towards the basion, by an amount for
    each side (blended across the midline over PRESS_BLEND_MM) solved so that the herniated part of that tonsil meets
    the back of the medulla at full: its gap there within PRESS_GAP_MM.
  * Cut short where it would meet anything: every structure of the model near the copies (OBSTACLES: the drawn bones,
    the brainstem and the fourth ventricle, the peduncles, every artery, vein and nerve, the brain; not the parts copied,
    not another view's own items) is a wall. Each point's straight path is traced against the walls' triangles exactly
    (steps no longer than the distance left over, or TRACE_STEP_MM with a margin of half of it) and cut short where it
    would come nearer than BONE_GAP_MM to a bone or VA_GAP_MM to a vertebral artery, or STEM_GAP_MM to anything else (a
    point that starts nearer keeps all but START_SLACK_MM of the distance it had, and at least half of it). And along the
    CT bone field (skull_bone.npz smoothed as drawn) once more, at BONE_LEVEL_SAFE.
  * Its neighbours held with it: no point moves more than a point held plus cost(), BEHIND_SLOPE mm per mm it lies
    behind that point on the way the tonsils move (it would close on it), AHEAD_SLOPE per mm ahead of it (stretched) and
    SIDE_SLOPE per mm beside it (sheared). The cost is convex and in proportion to the distance, so the limits chain and
    the held points that another holds to less can be dropped exactly; every point keeps its own limit. Then each
    point's share of its move no more than its neighbours' mean (SMOOTH_MM, SMOOTH_ROUNDS times). Shares only shrink:
    a path cut short is a prefix of a clear path, so it stays clear. Every copy's points take part alike, so copies that
    lie together move together.
  * The checks of the moves as shipped (below) hold back, step by step, the points they find at fault (HOLD_ROUNDS):
    a triangle that crosses a structure it did not cross at rest, two copies that cross more than at rest, an artery's
    point that enters a moved tonsil, a triangle that turns over, a pair of neighbouring points that close faster than
    CLOSING_MAX: each such point is held to the share at which it was still right (HOLD_KEEP of it) and the field
    recomputed round it.
  * The descent is the depth along a at which the tonsils' lowest points lie DESCENT_MM below McRae's line at full
    (their mean), found in SOLVE_STEP_MM steps and refined by bisection (SOLVE_ROUNDS); each side must lie within
    TIP_TOL_MM of it.
  * The medulla, the pons, the fourth ventricle, the brainstem, the peduncles and every vessel and nerve not copied stay
    where they are. The posterior inferior cerebellar arteries (the fitted course, and TopBrain's own labelled parts at
    their origins) move with the cerebellum they lie on (the same field at their points), held at the vertebral arteries
    they arise from (no point moves more than VA_SLOPE times its distance from them, less the gap). A copy is written
    only where an artery moves more than MOVED_MIN_MM.

The checks (failing loudly, SystemExit, before anything is written), on the moves as shipped at every t of CHECK_T:
  - walls: no copy vertex's straight path crosses any wall's triangle; no copy vertex nearer a wall than its gap (or
    than it started, as above); no copy triangle crosses a wall in more places than at rest (pairs of crossing
    triangles, per copy, structure and side; counts at rest, at full and at most reported for every structure a copy
    touches).
  - the copies against each other: two that do not cross at rest never cross; two that overlap at rest (the fitted
    parts do) overlap no more: no more points of either inside the other at any t than at rest (each closed copy a
    solid, the vermis's two open halves one; Inside, a ray's parity), or, where one is not closed (OPEN_COPIES), no
    more crossing triangles. The vermis's two halves are not checked against each other (one part); their crossings
    are reported.
  - bone: the same against the drawn bone meshes with BONE_GAP_MM (ROUNDING_MM more, so that the files' rounding keeps
    it); and no copy vertex in the CT bone field
    (skull_bone.npz smoothed as skullbase_v3_skull.py draws it, at skullbase_ct.SURFACE_LEVEL) that was not at rest.
  - folds: no triangle of the tonsil, hemisphere or vermis copies turns over (its height over its longest edge, along
    its normal at rest), and none but slivers (thinner than SLIVER_MM at rest) comes within FLIP_MARGIN_MM of it, so
    that the files' rounding cannot turn it; the arteries' copies (tubes) by their rings: no pair of points of one copy
    within PAIR_MM of each other (across a tube, among them) closes at CLOSING_MAX mm per mm or faster (they would meet
    by full); their triangles turned over are counted. slopeMax is the largest closing rate, stretchMax the largest
    |dD|/|dx| (stretch and shear allowed).
  - the medulla: no tonsil vertex inside it at any t, the least gap at full within MEDULLA_GAP_FULL_MM, and the gap of
    each tonsil's part below McRae's line at full within it too.
  - no point of the arteries' copies inside the moved tonsils at any t; the tips' depth at full within TIP_TOL_MM.

Writes (all new): pipeline/data/build/skullbase-v3/<copy>.glb and hn_mcrae_line.glb, herniation_items.json there (the
manifest's items; skullbase_v3_endonasal.carry_sellar carries them when it is run again), and
src/data/generated/sbv3-herniation.json (the report the front end reads); merges the items into sbv3-manifest.json.
Deterministic: fixed grids and orders, no random sampling except trimesh's seeded one, no iteration over sets of
strings; two runs give the same bytes.

A rerun of skullbase_v3.py deletes the build's tb_*.glb (this step's copy of the fitted course among them): run this
step again after the tumours step whenever the chain is run.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from glb import TRIANGLES, read_glb_full, write_glb  # noqa: E402

REPO = ROOT.parent
DATA = ROOT / "data" / "build"
KIND = "skullbase-v3"
PREFIX = "sbv3"
BUILD = DATA / KIND
GEN = REPO / "src" / "data" / "generated"
HN_ITEMS = BUILD / "herniation_items.json"
OUT_JSON = GEN / f"{PREFIX}-herniation.json"

VIEW = "herniation_tonsillar"         # the view (groups.ts) and every copy's "herniationView"
VIEW_NAME = "Tonsillar herniation"     # (the view's name in the front end, groups.ts)
SHAPE = "tonsillar"                   # the morph target the view's slider moves (MORPH_PARAMS in src/skullbase/state.ts)
TAG = "hn_tonsillar"                  # copies' ids: <original id>__hn_tonsillar
GUIDE_ID = "hn_mcrae_line"
GUIDE_NAME = "McRae’s line (basion to opisthion)"
TISSUE = ("pf_tonsil", "pf_cerebellar_hemisphere", "pf_vermis")      # moved (copies)
VESSELS = ("tb_posterior_inferior_cerebellar_artery_fitted_course", "sb_posterior_inferior_cerebellar_artery")   # follow
VA = "sb_vertebral_artery"                                           # stays; the arteries' copies held at it
TONSIL = "pf_tonsil"
MEDULLA = "pf_medulla"
NOT_WALLS = ("guide", "removed", "triangle", "tumour")               # not anatomy (guides, drilled bone, the tumour views' own)

DESCENT_MM = 8.0          # the tonsils' lowest points this far below McRae's line at full (illustrative)
TIP_TOL_MM = 1.0          # ... each side within this of it
REACH_MM = 20.0           # the hemispheres and the vermis follow with a weight falling linearly to 0 this far from the tonsils
SQUEEZE = 0.25            # ... and each point's distance from the canal's midline (x) shrinks by this share (the tonsils
#                           narrowed into the foramen; illustrative)
FORWARD_MM = 3.0          # ... and this far towards the basion, along McRae's line (towards the space behind the medulla)
PRESS_FULL_MM = 3.0       # the lower tonsil pressed further towards the basion: wholly up to this height above McRae's
PRESS_TOP_MM = 10.0       # plane at rest, easing to none at this height (the part that ends below the line) ...
PRESS_BLEND_MM = 3.0      # ... each side's amount blended across the canal's midline over this either side of it
PRESS_GAP_MM = (0.0, 0.45)   # ... solved so that the part below the line meets the medulla: its gap at full within this
PRESS_MAX_MM = 14.0       # (searched up to this; the step fails if the press it needs reaches it)
PRESS_ROUNDS = 7          # (bisection rounds)
BONE_GAP_MM = 0.3         # a moved point's path keeps this far off the drawn bone (ROUNDING_MM more as traced) ...
ROUNDING_MM = 0.02        # (the files' rounding, pipeline/compress.mjs: up to about 0.008 mm a point, bone and copy alike)
VA_GAP_MM = 0.3           # ... this far off the vertebral arteries ...
STEM_GAP_MM = 0.25        # ... and this far off every other structure (the medulla: the gap left where the tonsils meet it)
START_SLACK_MM = 0.05     # a point that starts nearer than its gap keeps all but this of its distance (and at least half)
TRACE_STEP_MM = 0.1       # (the paths traced in steps of at least this, each sample half of it further off than the gap)
REGION_MM = 12.0          # the walls: the triangles within this of the copies at rest
PATH_STEPS = 48           # (the CT bone field sampled along each path this many times, twice over)
RISE_MM = 30.0            # the move falls off linearly with height above McRae's plane, to none this far above it
BEHIND_SLOPE = 0.4        # no point moves more than a point held plus this many mm per mm it lies behind it on the way the
#                           tonsils move (it would close on it: below 1, it never catches up with it) ...
AHEAD_SLOPE = 3.0         # ... plus this many per mm it lies ahead of it (it draws away from it: the tissue stretched; at 1,
#                           the tissue draped over the foramen's rim, held by the bone, kept the tips 6 mm short) ...
SIDE_SLOPE = 0.8          # ... plus this many per mm beside it (sheared). One cost, convex and in proportion to the
#                           distance, so the limits chain (a point limited by one held point limits the rest no less), and
#                           points may close at most BEHIND/2 + sqrt(BEHIND^2/4 + SIDE^2/4) mm per mm (0.65)
SMOOTH_MM = 0.7           # each point's share of its move no more than the mean of its neighbours' (a Gaussian of this
SMOOTH_ROUNDS = 10        # width), this many times over
VA_SLOPE = 1.0            # no point moves more than this times its distance from the vertebral arteries (less their gap)
BACK_FIT_MM = (12.0, 16.0)   # the back of the medulla fitted from this far above McRae's plane to this far below
MOVED_MIN_MM = 0.2        # an artery is copied only where it moves more than this
GUIDE_R_MM = 0.3          # McRae's line drawn as a tube of this radius
GUIDE_TOKEN = "sbMembrane"     # its colour (palette.json; see guide_item)
MIDLINE_SLAB_MM = 1.5     # the basion and the opisthion found on the occipital bone within this of the landmark's x
GRID_MM = 0.5             # the vertebral arteries' distance field's grid (frame mm) ...
BOX = ((-55.0, 55.0), (-100.0, -2.0), (-80.0, 30.0))     # ... over this box (x, y, z)
SURFACE_LEVEL = 0.4       # skullbase_ct.SURFACE_LEVEL: the bone surface at this level of the field
BONE_LEVEL_SAFE = 0.35    # (a path is cut where the CT bone field reaches this, a little outside that surface)
V3_SMOOTH_VOX = 0.6       # skullbase_v3_skull.py smooths its field by this before taking the surface
CHECK_T = tuple(round(0.05 * k, 2) for k in range(1, 21))     # the slider values checked: 0.05, 0.10, ... 1
PAIR_MM = 2.0             # the fold check: pairs of points of one copy this near ...
CLOSING_MAX = 1.0         # ... may close at most this fast (mm per mm; at 1 they would meet at full)
SLIVER_MM = 0.035         # the fold check: a triangle not thinner than this at rest (its height over its longest edge) ...
FLIP_MARGIN_MM = 0.03     # ... may not come thinner than this at any t (or half its height at rest), along its normal at
#                           rest: the files' rounding (up to about 0.008 mm a point, pipeline/compress.mjs) cannot turn
#                           it over; a sliver thinner than that may not turn over (in the moves as written)
FAULT_NEAR_MM = 1.0       # (a point newly inside another copy: that copy's points this near it are held too)
OPEN_COPIES = ("sb_posterior_inferior_cerebellar_artery",)   # copies not closed (tubes open at their ends): no solid
HALVED_COPIES = ("pf_vermis",)    # copies whose two halves, each open at the cut between them, make one solid
CLOSING_AIM = 0.85        # (a pair found closing faster is held to this)
HOLD_KEEP = 0.9           # a point held keeps this share of the move at which it was still right
HOLD_ROUNDS = 40          # (the checks and holds repeated at most this many times)
OUTER_ROUNDS = 4          # (the descent, the press and the holds solved in turn at most this many times)
SOLVE_START_MM = 8.0      # (the descent searched from here in SOLVE_STEP_MM steps up to SOLVE_MAX_MM, then by bisection)
SOLVE_STEP_MM = 1.0
SOLVE_MAX_MM = 20.0
SOLVE_ROUNDS = 7
MEDULLA_GAP_FULL_MM = (0.0, 0.5)     # the tonsils' gap to the medulla at full
CAMERA_FOV_DEG = 35.0     # the viewer's camera (src/viewer/Viewer.ts) ...
CAMERA_FILL = 0.9         # ... and its distFor(): radius / sin(fov / 2) * 0.9 at a square aspect
CAMERA_MARGIN = 1.15      # the framed points' radius widened by this
FRAME_BELOW_MM = 20.0     # the medulla framed down to this below McRae's plane and up to FRAME_ABOVE_MM above it
FRAME_ABOVE_MM = 15.0
POSTERIOR_DEG = tuple(range(20, 71, 5))   # the posterior camera's elevation below the horizontal, from behind: the
#                           steepest view that sees the most of the rim, the tonsils and the line is taken
RAY_TOL_MM = 0.5          # (a point counts as seen when nothing opaque lies on the ray more than this before it)
INSIDE_CELL_MM = 1.0      # (the inside test's grid)
TRI_RAD_MM = 1.0          # (the triangles searched kept split so that each lies within this of its centre ...
PAIR_BUDGET = 250_000     # ... and the pairs of points and triangles handled in chunks of at most this many: memory)


def r1(x) -> float:
    return round(float(x), 1) + 0.0


def r2(x) -> float:
    return round(float(x), 2) + 0.0


def r3(x) -> float:
    return round(float(x), 3) + 0.0


def v2(v) -> list:
    return [r2(x) for x in v]


def unit(v) -> np.ndarray:
    v = np.asarray(v, float)
    return v / np.linalg.norm(v)


def file_of(item: dict) -> Path:
    return DATA / item["file"].replace("assets/", "")


def vertex_normals(V: np.ndarray, T: np.ndarray) -> np.ndarray:
    import skullbase_build as SB
    return SB.normals(V, T)


def smoothstep(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0.0, 1.0)
    return x * x * (3.0 - 2.0 * x)


# ---------------------------------------------------------------- McRae's line
def mcrae(man: dict, lms: list) -> dict:
    """The basion and the opisthion on the occipital bone as drawn (its build mesh), McRae's plane through them."""
    fmc = np.array(next(l["ras"] for l in lms if l["name"] == "Foramen magnum"), float)
    V = np.vstack([nd["positions"] for nd in read_glb_full(file_of(man["sb_occipital_bone"])).values()]).astype(float)
    sl = V[np.abs(V[:, 0] - fmc[0]) < MIDLINE_SLAB_MM]
    clivus = sl[(sl[:, 1] > fmc[1] + 5) & (sl[:, 1] < fmc[1] + 30) & (sl[:, 2] < fmc[2] + 25)]
    basion = clivus[np.lexsort((clivus[:, 1], clivus[:, 0], clivus[:, 2]))[0]]
    back = sl[(sl[:, 1] < fmc[1] - 5) & (sl[:, 2] > basion[2] - 15) & (sl[:, 2] < basion[2] + 15)]
    d = np.linalg.norm(back[:, 1:] - basion[1:], axis=1)
    op = back[np.lexsort((back[:, 1], back[:, 0], d))[0]]
    u = basion - op
    u[0] = 0.0
    u = unit(u)                                   # along the line, towards the basion (forward)
    n = unit(np.cross(np.array([1.0, 0.0, 0.0]), u))
    if n[2] < 0:
        n = -n                                    # cranial
    return {"basion": basion, "opisthion": op, "u": u, "n": n, "x0": float((basion[0] + op[0]) / 2),
            "lengthMm": float(np.linalg.norm(basion - op)), "landmark": fmc, "occipital": V}


def below(P: np.ndarray, mc: dict) -> np.ndarray:
    """How far below McRae's line (its plane) each point lies (mm; negative above)."""
    return -((np.atleast_2d(P) - mc["opisthion"]) @ mc["n"])


# ---------------------------------------------------------------- exact geometry on triangles
def closest_on_tri(P: np.ndarray, A: np.ndarray, B: np.ndarray, C: np.ndarray) -> np.ndarray:
    """The point of each triangle (A, B, C) nearest each point P (rows; Ericson's closest-point regions)."""
    ab, ac, ap = B - A, C - A, P - A
    d1, d2 = (ab * ap).sum(1), (ac * ap).sum(1)
    bp = P - B
    d3, d4 = (ab * bp).sum(1), (ac * bp).sum(1)
    cp = P - C
    d5, d6 = (ab * cp).sum(1), (ac * cp).sum(1)
    vc, vb, va = d1 * d4 - d3 * d2, d5 * d2 - d1 * d6, d3 * d6 - d5 * d4
    den = va + vb + vc
    den = np.where(np.abs(den) < 1e-18, 1e-18, den)
    out = A + ab * (vb / den)[:, None] + ac * (vc / den)[:, None]
    with np.errstate(divide="ignore", invalid="ignore"):
        m = (va <= 0) & ((d4 - d3) >= 0) & ((d5 - d6) >= 0)
        t = (d4 - d3) / np.where(np.abs((d4 - d3) + (d5 - d6)) < 1e-18, 1e-18, (d4 - d3) + (d5 - d6))
        out[m] = (B + (C - B) * t[:, None])[m]
        m = (vb <= 0) & (d2 >= 0) & (d6 <= 0)
        t = d2 / np.where(np.abs(d2 - d6) < 1e-18, 1e-18, d2 - d6)
        out[m] = (A + ac * t[:, None])[m]
        m = (vc <= 0) & (d1 >= 0) & (d3 <= 0)
        t = d1 / np.where(np.abs(d1 - d3) < 1e-18, 1e-18, d1 - d3)
        out[m] = (A + ab * t[:, None])[m]
    m = (d6 >= 0) & (d5 <= d6)
    out[m] = C[m]
    m = (d3 >= 0) & (d4 <= d3)
    out[m] = B[m]
    m = (d1 <= 0) & (d2 <= 0)
    out[m] = A[m]
    return out


def seg_tri(P0: np.ndarray, D: np.ndarray, A: np.ndarray, B: np.ndarray, C: np.ndarray, closed: bool = True) -> tuple:
    """Whether each segment P0 -> P0 + D crosses its triangle (A, B, C) (rows; Moller-Trumbore), and where (0..1)."""
    e1, e2 = B - A, C - A
    p = np.cross(D, e2)
    det = (e1 * p).sum(1)
    ok = np.abs(det) > 1e-14
    inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
    s = P0 - A
    u = (s * p).sum(1) * inv
    q = np.cross(s, e1)
    v = (D * q).sum(1) * inv
    t = (e2 * q).sum(1) * inv
    if closed:
        hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t >= 0) & (t <= 1)
    else:
        hit = ok & (u > 0) & (v > 0) & (u + v < 1) & (t > 0) & (t < 1)
    return hit, t


def tri_pairs_cross(TA: np.ndarray, TB: np.ndarray) -> np.ndarray:
    """Whether each pair of triangles (rows of (n, 3, 3)) crosses: an edge of either through the other's face."""
    hit = np.zeros(len(TA), bool)
    for X, Y in ((TA, TB), (TB, TA)):
        for i, j in ((0, 1), (1, 2), (2, 0)):
            hit |= seg_tri(X[:, i], X[:, j] - X[:, i], Y[:, 0], Y[:, 1], Y[:, 2], closed=False)[0]
    return hit


def flat(lists) -> tuple[np.ndarray, np.ndarray]:
    """(row, item) pairs of a list of lists (query_ball_point's output)."""
    n = np.fromiter((len(l) for l in lists), np.int64, len(lists))
    if not n.sum():
        return np.zeros(0, np.int64), np.zeros(0, np.int64)
    return np.repeat(np.arange(len(lists)), n), np.fromiter((j for l in lists for j in l), np.int64, int(n.sum()))


def ball_pairs(tree: cKDTree, X: np.ndarray, r):
    """(row, item) pairs of each point of X and the tree's points within r of it, in chunks of at most PAIR_BUDGET pairs
    (a point with more is a chunk of its own): (rows into X, items) per chunk."""
    r = np.broadcast_to(np.asarray(r, float), (len(X),))
    if not len(X):
        return
    cs = np.cumsum(tree.query_ball_point(X, r, return_length=True))
    start = 0
    while start < len(X):
        base = int(cs[start - 1]) if start else 0
        end = max(int(np.searchsorted(cs, base + PAIR_BUDGET, side="right")), start + 1)
        if cs[end - 1] > base:
            qi, fi = flat(tree.query_ball_point(X[start:end], r[start:end]))
            yield qi + start, fi
        start = end


def split_big(tri: np.ndarray, lim: float) -> tuple[np.ndarray, np.ndarray]:
    """The triangles (n, 3, 3) split at their edges' midpoints until each lies within lim of its centre (the searches'
    radii stay small); and for each piece the row of the triangle it came from. The same surface."""
    out_t, out_s = [], []
    src = np.arange(len(tri))
    while len(tri):
        rad = np.linalg.norm(tri - tri.mean(1)[:, None], axis=2).max(1)
        small = rad <= lim
        out_t.append(tri[small])
        out_s.append(src[small])
        big, sb = tri[~small], src[~small]
        if not len(big):
            break
        a, b, c = big[:, 0], big[:, 1], big[:, 2]
        ab, bc, ca = (a + b) / 2, (b + c) / 2, (c + a) / 2
        tri = np.concatenate([np.stack(x, 1) for x in ((a, ab, ca), (ab, b, bc), (ca, bc, c), (ab, bc, ca))])
        src = np.tile(sb, 4)
    return np.concatenate(out_t), np.concatenate(out_s)


class Surface:
    """Triangles (n, 3, 3), each with its owner (an index into names), for exact distances and crossings. Kept split so
    that each piece lies within TRI_RAD_MM of its centre; src gives each piece's own triangle (the rows as given)."""

    def __init__(self, tri: np.ndarray, owner: np.ndarray, names: list):
        tri = np.asarray(tri, float).reshape(-1, 3, 3)
        self.tri, self.src = split_big(tri, TRI_RAD_MM) if len(tri) else (tri, np.zeros(0, np.int64))
        self.given_owner = np.asarray(owner)
        self.owner, self.names = self.given_owner[self.src] if len(tri) else np.zeros(0, np.int64), names
        self.cen = self.tri.mean(1)
        self.rad = np.linalg.norm(self.tri - self.cen[:, None], axis=2).max(1) if len(self.tri) else np.zeros(0)
        self.rmax = float(self.rad.max()) if len(self.tri) else 0.0
        self.tree = cKDTree(self.cen) if len(self.tri) else None

    def near(self, Q: np.ndarray, cap: float | np.ndarray = np.inf) -> tuple[np.ndarray, np.ndarray]:
        """The exact distance from each point to the triangles where it is at most cap, and the nearest piece (row of
        tri); elsewhere cap or more (a lower bound above it: enough for every use here) and -1."""
        Q = np.atleast_2d(np.asarray(Q, float))
        if self.tree is None or not len(Q):
            return np.full(len(Q), np.inf), np.full(len(Q), -1)
        cap = np.broadcast_to(np.asarray(cap, float), (len(Q),))
        K = min(8, len(self.tri))
        out, arg = np.empty(len(Q)), np.full(len(Q), -1)
        for a in range(0, len(Q), 8192):
            q, c = Q[a:a + 8192], cap[a:a + 8192]
            dk, jk = self.tree.query(q, k=K)
            dk, jk = dk.reshape(len(q), K), jk.reshape(len(q), K)
            res = np.maximum(dk[:, 0] - self.rmax, 0.0)            # a lower bound
            ag = np.full(len(q), -1)
            ii = np.nonzero(res <= c)[0]
            if len(ii):
                T = self.tri[jk[ii].ravel()]
                qq = np.repeat(q[ii], K, 0)
                dd = np.linalg.norm(closest_on_tri(qq, T[:, 0], T[:, 1], T[:, 2]) - qq, axis=1).reshape(-1, K)
                k0 = dd.argmin(1)
                m = dd[np.arange(len(ii)), k0]
                j = jk[ii, k0]
                r = np.minimum(m, c[ii])
                more = np.nonzero(dk[ii, -1] - self.rmax < r)[0]   # a triangle beyond the K nearest centres may lie nearer
                if len(more):
                    pm = q[ii[more]]
                    for qi, fi in ball_pairs(self.tree, pm, r[more] + self.rmax):
                        T = self.tri[fi]
                        p = pm[qi]
                        d = np.linalg.norm(closest_on_tri(p, T[:, 0], T[:, 1], T[:, 2]) - p, axis=1)
                        o = np.lexsort((fi, d, qi))
                        first = o[np.r_[True, qi[o][1:] != qi[o][:-1]]]          # each point's nearest in this chunk
                        w = more[qi[first]]
                        better = d[first] < m[w]
                        m[w[better]], j[w[better]] = d[first][better], fi[first][better]
                exact = m <= r
                res[ii] = np.minimum(m, r)        # exact where at most the cap; else the cap (the distance is more)
                ag[ii[exact]] = j[exact]
            out[a:a + 8192], arg[a:a + 8192] = res, ag
        return out, arg

    def dist(self, Q: np.ndarray, cap: float | np.ndarray = np.inf) -> np.ndarray:
        """The exact distance from each point to the triangles where it is at most cap; elsewhere cap or more."""
        return self.near(Q, cap)[0]

    def path_hits(self, P0: np.ndarray, D: np.ndarray) -> np.ndarray:
        """Whether each straight path P0 -> P0 + D crosses a triangle (exact)."""
        out = np.zeros(len(P0), bool)
        if self.tree is None or not len(P0):
            return out
        L = np.linalg.norm(D, axis=1)
        for qi, fi in ball_pairs(self.tree, P0 + 0.5 * D, 0.5 * L + self.rmax + 1e-6):
            T = self.tri[fi]
            hit = seg_tri(P0[qi], D[qi], T[:, 0], T[:, 1], T[:, 2])[0]
            out[np.unique(qi[hit])] = True
        return out

    def crossings(self, TC: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """The pairs (copy triangle, own triangle: the row as given, src) that cross, for the copy triangles TC (n, 3, 3);
        each pair once."""
        if self.tree is None or not len(TC):
            return np.zeros(0, np.int64), np.zeros(0, np.int64)
        c = TC.mean(1)
        r = np.linalg.norm(TC - c[:, None], axis=2).max(1)
        A, B = [], []
        for qi, fi in ball_pairs(self.tree, c, r + self.rmax + 1e-6):
            near = np.linalg.norm(c[qi] - self.cen[fi], axis=1) <= r[qi] + self.rad[fi] + 1e-6
            qi, fi = qi[near], fi[near]
            hit = tri_pairs_cross(TC[qi], self.tri[fi])
            A.append(qi[hit])
            B.append(self.src[fi[hit]])
        if not A:
            return np.zeros(0, np.int64), np.zeros(0, np.int64)
        u = np.unique(np.c_[np.concatenate(A), np.concatenate(B)], axis=0)
        return u[:, 0], u[:, 1]


class Inside:
    """Which points lie inside a closed mesh (triangles (n, 3, 3)): the parity of a ray's crossings along +x, the
    triangles binned on a grid over (y, z) (INSIDE_CELL_MM) so that each point meets only those in its column; the
    points nudged by a fixed tiny offset in y and z so that no ray runs through an edge or a corner."""

    def __init__(self, tri: np.ndarray):
        self.tri = np.asarray(tri, float).reshape(-1, 3, 3)
        if not len(self.tri):
            self.keys = np.zeros(0, np.int64)
            return
        self.lo = self.tri.reshape(-1, 3).min(0) - 1e-6
        self.hi = self.tri.reshape(-1, 3).max(0) + 1e-6
        yz = self.tri[:, :, 1:]
        cmin = np.floor((yz.min(1) - self.lo[1:]) / INSIDE_CELL_MM).astype(np.int64)
        cmax = np.floor((yz.max(1) - self.lo[1:]) / INSIDE_CELL_MM).astype(np.int64)
        self.nz = int(cmax[:, 1].max()) + 1
        ny, nz = cmax[:, 0] - cmin[:, 0] + 1, cmax[:, 1] - cmin[:, 1] + 1
        n = ny * nz
        rep = np.repeat(np.arange(len(self.tri)), n)
        k = np.arange(int(n.sum())) - np.repeat(np.cumsum(n) - n, n)
        key = (cmin[rep, 0] + k // nz[rep]) * self.nz + cmin[rep, 1] + k % nz[rep]
        o = np.argsort(key, kind="stable")
        self.keys, self.items = key[o], rep[o]

    def __call__(self, Q: np.ndarray) -> np.ndarray:
        Q = np.atleast_2d(np.asarray(Q, float)) + np.array([0.0, 1.2345e-5, 0.6789e-5])
        out = np.zeros(len(Q), bool)
        if not len(self.keys) or not len(Q):
            return out
        idx = np.nonzero(np.all((Q >= self.lo) & (Q <= self.hi), 1))[0]
        if not len(idx):
            return out
        c = np.floor((Q[idx, 1:] - self.lo[1:]) / INSIDE_CELL_MM).astype(np.int64)
        key = c[:, 0] * self.nz + c[:, 1]
        st = np.searchsorted(self.keys, key, "left")
        cnt = np.searchsorted(self.keys, key, "right") - st
        cs = np.cumsum(cnt)
        a = 0
        while a < len(idx):
            base = int(cs[a - 1]) if a else 0
            b = max(int(np.searchsorted(cs, base + PAIR_BUDGET, side="right")), a + 1)
            n = cnt[a:b]
            qi = np.repeat(np.arange(a, b), n)
            ti = self.items[np.repeat(st[a:b], n) + np.arange(int(n.sum())) - np.repeat(np.cumsum(n) - n, n)]
            p, T = Q[idx[qi]], self.tri[ti]
            ay, az = T[:, 0, 1], T[:, 0, 2]
            by, bz, cy, cz = T[:, 1, 1] - ay, T[:, 1, 2] - az, T[:, 2, 1] - ay, T[:, 2, 2] - az
            py, pz = p[:, 1] - ay, p[:, 2] - az
            den = by * cz - cy * bz
            ok = np.abs(den) > 1e-14
            den = np.where(ok, den, 1.0)
            u = (py * cz - cy * pz) / den
            v = (by * pz - py * bz) / den
            x = T[:, 0, 0] + u * (T[:, 1, 0] - T[:, 0, 0]) + v * (T[:, 2, 0] - T[:, 0, 0])
            hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (x > p[:, 0])
            par = np.bincount(qi[hit] - a, minlength=b - a) % 2 == 1
            out[idx[a:b]] = par
            a = b
        return out


# ---------------------------------------------------------------- the walls
class Walls:
    """Every structure of the model near the copies that they keep off: the drawn bones (BONE_GAP_MM), the vertebral
    arteries (VA_GAP_MM) and everything else (STEM_GAP_MM): not the parts copied, not a view's own items (tumours,
    approaches, guides), not the drilled bone. Two surfaces, by gap."""

    def __init__(self, man: dict, P: np.ndarray):
        lo, hi = P.min(0) - REGION_MM, P.max(0) + REGION_MM
        groups = {"bone": ([], []), "va": ([], []), "other": ([], [])}
        self.names: list = []
        self.items: list = []
        for sid in sorted(man):
            it = man[sid]
            if sid in TISSUE or sid in VESSELS or it.get("category") in NOT_WALLS:
                continue
            key = "bone" if it.get("category") == "bone" else "va" if sid == VA else "other"
            for s, nd in sorted(read_glb_full(file_of(it)).items()):
                if s not in ("L", "R"):
                    continue
                V = np.asarray(nd["positions"], float)
                T = np.asarray(nd["indices"]).reshape(-1, 3)
                if not len(T):
                    continue
                tri = V[T]
                keep = ((tri >= lo) & (tri <= hi)).all(2).any(1)
                if not keep.any():
                    continue
                k = len(self.names)
                self.names.append(f"{sid} {s}")
                self.items.append({"id": sid, "side": s, "group": key, "V": V, "T": T})
                groups[key][0].append(tri[keep])
                groups[key][1].append(np.full(int(keep.sum()), k))
        self.surf = {}
        for key, (tris, owners) in groups.items():
            self.surf[key] = Surface(np.concatenate(tris) if tris else np.zeros((0, 3, 3)),
                                     np.concatenate(owners) if owners else np.zeros(0, np.int64), self.names)
        self.gap = {"bone": BONE_GAP_MM + ROUNDING_MM, "va": VA_GAP_MM, "other": STEM_GAP_MM}

    def need(self, P: np.ndarray) -> dict:
        """{group: how near each point may come to it}: the gap, or for a point that starts nearer all but START_SLACK_MM
        of its distance (at least half of it)."""
        out = {}
        for key, S in self.surf.items():
            g = self.gap[key]
            d0 = S.dist(P, cap=g + START_SLACK_MM + 0.01)
            out[key] = np.minimum(g, np.maximum(d0 - START_SLACK_MM, 0.5 * d0))
        return out

    def trace(self, P: np.ndarray, M: np.ndarray, need: dict) -> np.ndarray:
        """The share of each straight path P -> P + M that keeps every group at its need: traced in steps no longer than
        the distance left over (then clear by the distance's own slope) or of TRACE_STEP_MM (then both ends at least
        half of it further off than the need, so that the step between is clear too)."""
        share = np.ones(len(P))
        L = np.linalg.norm(M, axis=1)
        h = TRACE_STEP_MM
        for key, S in self.surf.items():
            nd = need[key]
            s = np.zeros(len(P))
            live = np.nonzero(L > 1e-9)[0]
            ds = np.zeros(len(P))
            ds[live] = S.dist(P[live], cap=nd[live] + L[live] + h)
            while len(live):
                rem = L[live] * (1.0 - s[live])
                slack = ds[live] - nd[live]
                go = slack < rem                       # (the rest of the path clear where not)
                live, rem, slack = live[go], rem[go], slack[go]
                if not len(live):
                    break
                safe = slack >= h
                step = np.minimum(np.where(safe, slack, h), rem)
                s1 = np.minimum(s[live] + step / L[live], 1.0)
                d1 = S.dist(P[live] + s1[:, None] * M[live], cap=nd[live] + L[live] * (1.0 - s1) + h)
                ok = safe | ((d1 >= nd[live]) & (ds[live] + d1 - step >= 2.0 * nd[live]))
                stop = live[~ok]
                share[stop] = np.minimum(share[stop], s[stop])
                adv = live[ok]
                s[adv], ds[adv] = s1[ok], d1[ok]
                live = adv[s[adv] < 1.0 - 1e-12]
            # (where the trace stopped, s is the share; where it ran clear, 1)
        return share


# ---------------------------------------------------------------- the CT bone field and the vertebral arteries' room
class Fields:
    """The CT bone field as skullbase_v3_skull.py draws it (for its own check and one more cut), and the vertebral
    arteries as a signed distance (mm, negative inside) on a GRID_MM grid over BOX (for the arteries' hold)."""

    def __init__(self, man: dict):
        import skullbase_v3_tumours as TM
        assert abs(TM.STEP - GRID_MM) < 1e-9
        self.lo = np.array([b[0] for b in BOX])
        self.shape = tuple(int(round((h - l) / GRID_MM)) + 1 for l, h in BOX)
        z = np.load(BUILD / "skull_bone.npz")
        self.bone_b = ndimage.gaussian_filter(z["b"].astype(np.float32), V3_SMOOTH_VOX)
        self.bone_inv = np.linalg.inv(z["a"])
        va = TM.mesh_mask(file_of(man[VA]), self.lo, self.shape)
        self.va = (ndimage.distance_transform_edt(~va, sampling=GRID_MM) - ndimage.distance_transform_edt(va, sampling=GRID_MM)).astype(np.float32)

    def bone_field(self, P: np.ndarray) -> np.ndarray:
        """The CT bone field at P (>= SURFACE_LEVEL inside)."""
        return ndimage.map_coordinates(self.bone_b, nib.affines.apply_affine(self.bone_inv, np.atleast_2d(P)).T, order=1, mode="constant")

    def sample(self, F: np.ndarray, P: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(F, ((np.atleast_2d(P) - self.lo) / GRID_MM).T, order=1, mode="nearest")

    def bone_share(self, P: np.ndarray, D: np.ndarray) -> np.ndarray:
        """The share of each straight path P -> P + D before the CT bone field reaches BONE_LEVEL_SAFE."""
        share = np.ones(len(P))
        live = np.ones(len(P), bool)
        for k in range(1, 2 * PATH_STEPS + 1):
            idx = np.nonzero(live)[0]
            if not len(idx):
                break
            bad = self.bone_field(P[idx] + (k / (2 * PATH_STEPS)) * D[idx]) >= BONE_LEVEL_SAFE
            share[idx[bad]] = (k - 1) / (2 * PATH_STEPS)
            live[idx[bad]] = False
        return share


# ---------------------------------------------------------------- the shape
def load_parts(man: dict, ids: tuple) -> dict:
    """{id: {side: node}} from the build files (as shipped: the cleared file where the manifest ships that)."""
    out = {}
    for sid in ids:
        if sid not in man:
            raise SystemExit(f"{sid} is not in the manifest")
        out[sid] = {s: nd for s, nd in read_glb_full(file_of(man[sid])).items() if s in ("L", "R")}
    return out


def cost(d: np.ndarray, e: np.ndarray) -> np.ndarray:
    """How much further than a held point a point d away from it (rows) may move (mm): BEHIND_SLOPE per mm it lies behind
    it on the way e the tonsils move (it would close on it), AHEAD_SLOPE per mm ahead of it (it draws away: stretched)
    and SIDE_SLOPE per mm beside it (sheared). Convex and in proportion to d, so cost(a + b) <= cost(a) + cost(b)."""
    along = d @ e
    side = np.linalg.norm(d - along[:, None] * e, axis=1)
    return BEHIND_SLOPE * np.maximum(-along, 0.0) + AHEAD_SLOPE * np.maximum(along, 0.0) + SIDE_SLOPE * side


def bound(Q: np.ndarray, C: np.ndarray, vals: np.ndarray, e: np.ndarray) -> np.ndarray:
    """How far each point q may move given the held point c (its row) held to vals (mm)."""
    return vals + cost(Q - C, e)


def limited(Q: np.ndarray, C: np.ndarray, vals: np.ndarray, e: np.ndarray, reach: float) -> np.ndarray:
    """For each point q of Q, the least bound() over the held points C within reach (inf where none is)."""
    out = np.full(len(Q), np.inf)
    if not len(C) or not len(Q):
        return out
    tc = cKDTree(C)
    for qi, j in ball_pairs(tc, Q, reach):
        np.minimum.at(out, qi, bound(Q[qi], C[j], vals[j], e))
    return out


def binding(C: np.ndarray, vals: np.ndarray, e: np.ndarray, reach: float) -> tuple:
    """The held points that bind the rest: those that no other held point holds to strictly less. Exact, as cost() is
    subadditive: a point dropped is held less by another, which holds every point at least as much as it would."""
    if not len(C):
        return C, vals
    lim = np.full(len(C), np.inf)
    for i, j in ball_pairs(cKDTree(C), C, reach):
        off = i != j
        i, j = i[off], j[off]
        np.minimum.at(lim, i, bound(C[i], C[j], vals[j], e))
    keep = lim >= vals - 1e-9
    return C[keep], vals[keep]


def medulla_back(medulla: dict, mc: dict) -> np.ndarray:
    """The way the back of the medulla runs past the foramen magnum (unit, downward): a line fitted (y on z) through its
    hindmost point near the midline in each 2 mm slab from BACK_FIT_MM[0] above McRae's plane to BACK_FIT_MM[1] below."""
    V = np.vstack([np.asarray(nd["positions"], float) for nd in medulla.values()])
    b = below(V, mc)
    pts = []
    for lo in np.arange(-BACK_FIT_MM[0], BACK_FIT_MM[1], 2.0):
        S = V[(b >= lo) & (b < lo + 2.0)]
        if len(S):
            S = S[np.abs(S[:, 0] - np.median(S[:, 0])) < 3.0]
            pts.append(S[np.lexsort((S[:, 0], S[:, 2], S[:, 1]))[0]])
    pts = np.array(pts)
    k = np.polyfit(pts[:, 2], pts[:, 1], 1)[0]           # dy/dz
    return unit([0.0, -k, -1.0])


class Shape:
    """The tonsillar shape: a field over space gives every copied point its uncut move; each point's path is cut short
    at the walls, its neighbours held with it, and the points the checks find at fault held further (caps)."""

    def __init__(self, mc: dict, fields: Fields, tissue: dict, vessels: dict, down: np.ndarray, man: dict):
        self.mc, self.f = mc, fields
        self.tissue, self.vessels = tissue, vessels
        self.tons_tree = cKDTree(np.vstack([tissue[TONSIL][s]["positions"] for s in ("L", "R")]))
        self.a = down                          # down the canal, along the back of the medulla
        self.fwd = mc["u"]                     # towards the basion: towards the space behind the medulla
        # every copied point: (part id, side) -> rows of the stacked arrays; and each node's triangles (rows)
        self.rows, self.tris, Ps = {}, {}, []
        off = 0
        for group in (tissue, vessels):
            for sid in group:
                for s in ("L", "R"):
                    if s in group[sid]:
                        V = np.asarray(group[sid][s]["positions"], float)
                        self.rows[(sid, s)] = np.arange(off, off + len(V))
                        self.tris[(sid, s)] = np.asarray(group[sid][s]["indices"]).reshape(-1, 3) + off
                        Ps.append(V)
                        off += len(V)
        self.P = np.vstack(Ps)
        self.is_vessel = np.zeros(len(self.P), bool)
        for (sid, s), r in self.rows.items():
            self.is_vessel[r] = sid in vessels
        self.walls = Walls(man, self.P)
        self.need = self.walls.need(self.P)
        self.caps = np.full(len(self.P), np.inf)        # the holds the checks set (mm)
        self._graph = None
        self._own = {}

    # -- the field
    def uncut(self, Q: np.ndarray, descent: float, press: tuple) -> tuple[np.ndarray, np.ndarray]:
        """The uncut move at full at points Q, and the room from the vertebral arteries (VA_SLOPE times the distance, less
        the gap: the arteries' copies stay joined to the vertebral arteries they arise from, and the cerebellum with
        them)."""
        w = np.clip(1.0 - self.tons_tree.query(Q)[0] / REACH_MM, 0.0, 1.0)
        h = -below(Q, self.mc)
        rise = np.clip(1.0 - np.maximum(h, 0.0) / RISE_MM, 0.0, 1.0)
        dx = (self.mc["x0"] - Q[:, 0])[:, None] * np.array([1.0, 0.0, 0.0])
        M = (w * rise)[:, None] * (descent * self.a + SQUEEZE * dx + FORWARD_MM * self.fwd)
        low = 1.0 - smoothstep((h - PRESS_FULL_MM) / (PRESS_TOP_MM - PRESS_FULL_MM))
        right = smoothstep((Q[:, 0] - self.mc["x0"] + PRESS_BLEND_MM) / (2.0 * PRESS_BLEND_MM))
        p = (1.0 - right) * press[0] + right * press[1]
        M = M + (w * low * p)[:, None] * self.fwd
        room = VA_SLOPE * np.maximum(self.f.sample(self.f.va, Q) - VA_GAP_MM, 0.0)
        return M, room

    def own(self, descent: float, press: tuple) -> dict:
        """Each point's uncut move and the share of it whose path is clear (the walls, the CT bone field, the vertebral
        arteries' room); cached per descent and press."""
        key = (round(descent, 6), round(press[0], 6), round(press[1], 6))
        if key not in self._own:
            M, room = self.uncut(self.P, descent, press)
            L = np.linalg.norm(M, axis=1)
            idx = np.nonzero(L > 1e-9)[0]
            share = np.ones(len(self.P))
            share[idx] = self.walls.trace(self.P[idx], M[idx], {k: v[idx] for k, v in self.need.items()})
            share[idx] = np.minimum(share[idx], room[idx] / L[idx])
            start = self.f.bone_field(self.P[idx]) >= BONE_LEVEL_SAFE
            free = self.f.bone_share(self.P[idx], share[idx, None] * M[idx])
            share[idx] = np.where(start, share[idx], share[idx] * free)
            self._own = {key: {"M": M, "L": L, "idx": idx, "share": share}}      # (one kept: they are large)
        return self._own[key]

    def moves(self, descent: float, press: tuple) -> dict:
        """Every copied point's move at full: its clear share of the uncut move and its hold (caps), its neighbours held
        with the points held (bound(); each keeping its own limit), then each moving point's share no more than the
        mean of its neighbours' within 2 SMOOTH_MM (a Gaussian of SMOOTH_MM), SMOOTH_ROUNDS times over (shares only
        shrink: every path stays clear)."""
        o = self.own(descent, press)
        M, L, idx = o["M"], o["L"], o["idx"]
        cap = np.minimum(o["share"][idx], self.caps[idx] / L[idx])
        held = cap < 1.0
        reach = float(L.max()) / min(BEHIND_SLOPE, AHEAD_SLOPE, SIDE_SLOPE)
        Ch = idx[held]
        e = self.way(M)
        lim = limited(self.P[idx], *binding(self.P[Ch], cap[held] * L[Ch], e, reach), e, reach)
        share = np.minimum(cap, lim / L[idx])
        if self._graph is None or self._graph[0] != idx.tobytes():
            self._graph = (idx.tobytes(), self.graph(self.P[idx]))
        for _ in range(SMOOTH_ROUNDS):
            share = np.minimum(share, self._graph[1] @ share)
        D = np.zeros_like(self.P)
        D[idx] = share[:, None] * M[idx]
        return {"D": D, "descent": descent, "press": tuple(press), "cutShort": int((o["share"][idx] < 1.0).sum()),
                "held": int((self.caps[idx] < np.inf).sum())}

    def way(self, M: np.ndarray) -> np.ndarray:
        """The way the tonsils move (unit): their points' mean uncut move."""
        r = np.concatenate([self.rows[(TONSIL, s)] for s in ("L", "R")])
        return unit(M[r].mean(0))

    @staticmethod
    def graph(X: np.ndarray):
        """Row-normalised Gaussian (SMOOTH_MM) weights of each point's neighbours within 2 SMOOTH_MM, itself included."""
        import scipy.sparse as sp
        dm = cKDTree(X).sparse_distance_matrix(cKDTree(X), 2.0 * SMOOTH_MM, output_type="ndarray")
        i, j, d = dm["i"], dm["j"], dm["v"]
        n = len(X)
        W = sp.csr_matrix((np.r_[np.exp(-d ** 2 / (2 * SMOOTH_MM ** 2)), np.ones(n)], (np.r_[i, np.arange(n)], np.r_[j, np.arange(n)])),
                          shape=(n, n))
        return sp.diags(1.0 / np.asarray(W.sum(1)).ravel()) @ W

    # -- what it reaches
    def tips(self, D: np.ndarray) -> dict:
        out = {}
        for s in ("L", "R"):
            r = self.rows[(TONSIL, s)]
            X = self.P[r] + D[r]
            b = below(X, self.mc)
            i = int(np.lexsort((X[:, 1], X[:, 0], -b))[0])
            out[s] = {"point": v2(X[i]), "belowLineMm": r2(b[i])}
        return out

    def depth(self, D: np.ndarray) -> float:
        t = self.tips(D)
        return (t["L"]["belowLineMm"] + t["R"]["belowLineMm"]) / 2

    def medulla_gaps(self, D: np.ndarray, med: dict, t: float = 1.0) -> dict:
        """The tonsils' least gap to the medulla at t (negative inside): over all their points, and for each side over
        the points below McRae's line."""
        rows = {s: self.rows[(TONSIL, s)] for s in ("L", "R")}
        out = {"all": np.inf}
        for s, r in rows.items():
            X = self.P[r] + t * D[r]
            g = med.gap(X)
            out["all"] = min(out["all"], float(g.min()))
            sel = below(X, self.mc) > 0
            out[s] = float(g[sel].min()) if sel.any() else float("inf")
        return out

    def solve_descent(self, press: tuple) -> dict:
        """The descent at which the tonsils' lowest points lie DESCENT_MM below McRae's line at full (their mean): from
        SOLVE_START_MM in SOLVE_STEP_MM steps to the first that reaches it, then bisection between it and the step
        before; the deepest reached if none does."""
        lo, hi, best, lo_mv = 0.0, None, None, None
        for d in np.arange(SOLVE_START_MM, SOLVE_MAX_MM + 1e-9, SOLVE_STEP_MM):
            mv = self.moves(float(d), press)
            dm = self.depth(mv["D"])
            if dm >= DESCENT_MM:
                hi, best = float(d), mv
                break
            lo, lo_mv = float(d), mv
        if hi is None:
            print(f"  the tonsils reach only {dm:.2f} mm below McRae's line however far they are moved")
            return lo_mv
        if lo == 0.0:
            lo = hi - SOLVE_STEP_MM
        for _ in range(SOLVE_ROUNDS):
            mid = (lo + hi) / 2
            mv = self.moves(mid, press)
            if self.depth(mv["D"]) < DESCENT_MM:
                lo = mid
            else:
                hi, best = mid, mv
        return best

    def solve_press(self, descent: float, press: tuple, med: dict) -> tuple:
        """For each side, the least press at which the part of its tonsil below McRae's line comes within PRESS_GAP_MM[1]
        of the medulla at full (bisection; both sides at once, each on its own)."""
        g = self.medulla_gaps(self.moves(descent, (0.0, 0.0))["D"], med)
        lo = [0.0, 0.0]
        hi = [0.0 if g[s] <= PRESS_GAP_MM[1] else PRESS_MAX_MM for s in ("L", "R")]
        if max(hi) == 0.0:
            return (0.0, 0.0)
        g = self.medulla_gaps(self.moves(descent, tuple(hi))["D"], med)
        for k, s in enumerate(("L", "R")):
            if hi[k] > 0 and g[s] > PRESS_GAP_MM[1]:
                print(f"  the {s} tonsil's herniated part stays {g[s]:.2f} mm from the medulla however far it is pressed")
                lo[k] = hi[k]
        for _ in range(PRESS_ROUNDS):
            mid = tuple((a + b) / 2 for a, b in zip(lo, hi))
            g = self.medulla_gaps(self.moves(descent, mid)["D"], med)
            for k, s in enumerate(("L", "R")):
                if g[s] <= PRESS_GAP_MM[1]:
                    hi[k] = mid[k]
                else:
                    lo[k] = mid[k]
        for k, s in enumerate(("L", "R")):
            if hi[k] >= PRESS_MAX_MM - 1e-9:
                raise SystemExit(f"the {s} tonsil needs the press's search limit ({PRESS_MAX_MM} mm) to meet the medulla: raise it")
        return tuple(hi)


class Medulla:
    """The medulla's meshes: the signed gap of points to it (negative inside)."""

    def __init__(self, man: dict):
        self.nodes = [(np.asarray(nd["positions"], float), np.asarray(nd["indices"]).reshape(-1, 3))
                      for s, nd in sorted(read_glb_full(file_of(man[MEDULLA])).items()) if s in ("L", "R")]
        self.surf = Surface(np.concatenate([V[T] for V, T in self.nodes]), np.zeros(sum(len(T) for _, T in self.nodes), np.int64), [MEDULLA])
        self.inside = [Inside(V[T]) for V, T in self.nodes]

    def gap(self, X: np.ndarray) -> np.ndarray:
        d = self.surf.dist(X, cap=8.0)
        near = np.nonzero(d < 8.0)[0]
        inside = np.zeros(len(X), bool)
        for ins in self.inside:
            inside[near] |= ins(X[near])
        return np.where(inside, -d, d)


# ---------------------------------------------------------------- the checks of the moves as shipped
class Checker:
    """The checks of a set of moves D (as they ship: the copies blended linearly, per vertex, at every t of CHECK_T)."""

    def __init__(self, sh: Shape, fields: Fields, med: Medulla):
        self.sh, self.f, self.med = sh, fields, med
        P = sh.P
        self.T = np.concatenate([sh.tris[k] for k in sh.tris])
        self.node_of_tri = np.concatenate([np.full(len(sh.tris[k]), i) for i, k in enumerate(sh.tris)])
        self.keys = list(sh.tris)
        self.rad = np.linalg.norm(P[self.T] - P[self.T].mean(1)[:, None], axis=2).max(1)
        # pairs of neighbouring points of one copy (a seam's two copies of one point left out)
        I, J = [], []
        for k, r in sh.rows.items():
            pr = cKDTree(P[r]).query_pairs(PAIR_MM, output_type="ndarray")
            if len(pr):
                i, j = r[pr[:, 0]], r[pr[:, 1]]
                ok = np.linalg.norm(P[i] - P[j], axis=1) > 0.05
                I.append(i[ok])
                J.append(j[ok])
        self.pi, self.pj = np.concatenate(I), np.concatenate(J)
        self.in_bone0 = fields.bone_field(P) >= SURFACE_LEVEL
        self.tons_rows = {s: sh.rows[(TONSIL, s)] for s in ("L", "R")}
        # each triangle's normal and height (twice its area over its longest edge) at rest; slivers thinner than SLIVER_MM
        X0 = P[self.T]
        n0 = np.cross(X0[:, 1] - X0[:, 0], X0[:, 2] - X0[:, 0])
        a2 = np.linalg.norm(n0, axis=1)
        self.real = a2 > 1e-12
        self.n0u = n0 / np.maximum(a2, 1e-30)[:, None]
        self.h0 = a2 / np.maximum(np.linalg.norm(X0 - np.roll(X0, 1, 1), axis=2).max(1), 1e-12)
        self.sliver = self.h0 < SLIVER_MM
        self.tissue_tri = np.array([self.keys[i][0] in TISSUE for i in self.node_of_tri])
        # the copies as solids, for their overlaps: each closed copy mesh its own, the vermis's two open halves one; the
        # labelled origins of the posterior inferior cerebellar arteries (tubes open at their ends) none
        self.solid = {k: (None if k[0] in OPEN_COPIES else (k[0], "both") if k[0] in HALVED_COPIES else k) for k in self.keys}
        self.solids = {}
        for k, sk in self.solid.items():
            if sk is not None:
                self.solids.setdefault(sk, []).append(k)
        # the pairs of copies near each other, and the triangles of each that cross the other at rest (the fitted parts)
        self.pairs = []
        for ia in range(len(self.keys)):
            for ib in range(ia + 1, len(self.keys)):
                ka, kb = self.keys[ia], self.keys[ib]
                A, B = sh.tris[ka], sh.tris[kb]
                a, b = Surface(P[B], np.arange(len(B)), []).crossings(P[A])
                self.pairs.append((ka, kb, len(a)))

    def solid_tris(self, X: np.ndarray, sk) -> np.ndarray:
        return np.concatenate([X[self.sh.tris[k]] for k in self.solids[sk]])

    def run(self, D: np.ndarray, report: bool = False) -> dict:
        """{'bad': {row: first t at fault}, 'closing': [(row, cap mm)], 'counts': ..., the measures}."""
        sh, P = self.sh, self.sh.P
        L = np.linalg.norm(D, axis=1)
        moving = L > 1e-6
        bad: dict = {}

        def fault(rows, t):
            for r in np.unique(rows):
                r = int(r)
                if bad.get(r, 2.0) > t:
                    bad[r] = t

        # triangles that move (a vertex of theirs does), and the points of those
        mt = moving[self.T].any(1)
        Tm = self.T[mt]
        act = np.unique(Tm)
        out = {"walls": {}, "copies": {}}
        # -- walls: each point's straight path; its gap at each t; the moving triangles' crossings per structure, by t
        out["pathCrossings"] = 0
        out["boneGapMin"] = np.inf
        mrows = np.nonzero(moving)[0]
        tri_m = np.nonzero(mt)[0]
        # (each moving triangle lies, at every t, inside the sphere round its six rest and full corners: only those whose
        # sphere meets a wall are searched for crossings with it)
        X0, X1 = P[self.T[tri_m]], P[self.T[tri_m]] + D[self.T[tri_m]]
        cs = (X0.sum(1) + X1.sum(1)) / 6.0
        rs = np.maximum(np.linalg.norm(X0 - cs[:, None], axis=2).max(1), np.linalg.norm(X1 - cs[:, None], axis=2).max(1)) + 1e-6
        del X0, X1
        for key, S in sh.walls.surf.items():
            nd = sh.need[key]
            near = mrows[S.dist(P[mrows], cap=L[mrows] + 0.01) <= L[mrows]]
            hits = S.path_hits(P[near], D[near])
            fault(near[hits], CHECK_T[0])
            out["pathCrossings"] += int(hits.sum())
            if key == "bone":
                close = act[(nd[act] < BONE_GAP_MM - 1e-9) & moving[act]]          # (points that start nearer the bone)
                d0c, dmc = S.dist(P[close], cap=1.0), np.full(len(close), np.inf)
            for t in CHECK_T:
                d = S.dist(P[act] + t * D[act], cap=nd[act] + 0.01)
                fault(act[d < nd[act] - 1e-6], t)
                if key == "bone":
                    far = nd[act] >= BONE_GAP_MM - 1e-9
                    if far.any():
                        out["boneGapMin"] = min(out["boneGapMin"], float(S.dist(P[act[far]] + t * D[act[far]], cap=1.0).min()))
                    if len(close):
                        dmc = np.minimum(dmc, S.dist(P[close] + t * D[close], cap=1.0))
            if key == "bone":
                out["boneNear"] = {"pointsStartingNearer": int(len(close)), "leastGapMm": r3(dmc.min()) if len(close) else None,
                                   "mostCloserThanAtRestMm": r3(max(0.0, float((d0c - dmc).max()))) if len(close) else 0.0}
            cand = tri_m[S.dist(cs, cap=rs) <= rs]
            Tc = self.T[cand]
            for t in (0.0,) + CHECK_T:
                a, b = S.crossings(P[Tc] + t * D[Tc])
                tri = cand[a]
                node, own = self.node_of_tri[tri], S.given_owner[b]
                for n_, o_ in sorted(set(zip(node.tolist(), own.tolist()))):
                    m = (node == n_) & (own == o_)
                    c = out["walls"].setdefault((self.keys[n_], S.names[o_]), {"tri": {}})
                    c["tri"][t] = (int(m.sum()), tri[m])
        for (k, name), c in out["walls"].items():
            rest = c["tri"].get(0.0, (0, np.zeros(0, np.int64)))
            c["rest"] = rest[0]
            rest_set = set(rest[1].tolist())
            for t in CHECK_T:
                n, tri = c["tri"].get(t, (0, np.zeros(0, np.int64)))
                if n > rest[0]:
                    new = [x for x in tri.tolist() if x not in rest_set]
                    fault(self.T[new].ravel() if new else self.T[tri].ravel(), t)
        # -- the copies against each other. Two that do not cross at rest never cross. Two that overlap at rest (the
        #    fitted parts do) overlap no more: no more points of either inside the other (as solids) at any t than at
        #    rest; or where one is not a solid, no more crossing triangles. (The vermis's two halves, one solid, are not
        #    checked against each other: their crossings are reported.)
        inside_at = {}

        def solid_inside(t, sk):
            if (t, sk) not in inside_at:
                inside_at[(t, sk)] = Inside(self.solid_tris(P + t * D, sk))
            return inside_at[(t, sk)]

        def crossing_tris(ka, kb, t):
            A, B = sh.tris[ka], sh.tris[kb]
            Xa, Xb = P[A] + t * D[A], P[B] + t * D[B]
            lo = np.maximum(Xa.min((0, 1)), Xb.min((0, 1))) - 1
            hi = np.minimum(Xa.max((0, 1)), Xb.max((0, 1))) + 1
            if (lo > hi).any():
                return np.zeros(0, np.int64), np.zeros(0, np.int64)
            ia_ = np.nonzero(((Xa >= lo) & (Xa <= hi)).all(2).any(1))[0]
            ib_ = np.nonzero(((Xb >= lo) & (Xb <= hi)).all(2).any(1))[0]
            if not (len(ia_) and len(ib_)):
                return np.zeros(0, np.int64), np.zeros(0, np.int64)
            a, b = Surface(Xb[ib_], ib_, []).crossings(Xa[ia_])
            return ia_[a], ib_[b]

        for ka, kb, rest_x in self.pairs:
            ra, rb = sh.rows[ka], sh.rows[kb]
            if not (moving[ra].any() or moving[rb].any()):
                continue
            sa, sb = self.solid[ka], self.solid[kb]
            rule = "same part" if sa is not None and sa == sb else "crossings" if not rest_x or sa is None or sb is None else "inside"
            rec = {}
            new_inside = 0   # (the most points of either copy newly inside the other at any t)
            if rule == "inside":
                ins0 = None
                for t in (0.0,) + CHECK_T:
                    X = P + t * D
                    ina, inb = solid_inside(t, sb)(X[ra]), solid_inside(t, sa)(X[rb])
                    rec[t] = int(ina.sum() + inb.sum())
                    if t == 0.0:
                        ins0 = (ina, inb)
                    # (each direction on its own: a point of one newly inside the other is a fault even where the
                    # other's points leave it, so the sum does not grow; the 2026-11-27 recheck's defect 1)
                    elif (ina & ~ins0[0]).any() or (inb & ~ins0[1]).any():
                        new_inside = max(new_inside, int((ina & ~ins0[0]).sum() + (inb & ~ins0[1]).sum()))
                        # (the points newly inside, and the other copy's points near them: the surface that came over them)
                        na, nb = ra[ina & ~ins0[0]], rb[inb & ~ins0[1]]
                        near_b = flat(cKDTree(X[rb]).query_ball_point(X[na], FAULT_NEAR_MM))[1] if len(na) else []
                        near_a = flat(cKDTree(X[ra]).query_ball_point(X[nb], FAULT_NEAR_MM))[1] if len(nb) else []
                        fault(np.r_[na, nb, rb[near_b], ra[near_a]].astype(np.int64), t)
            elif rule == "crossings":
                A, B = sh.tris[ka], sh.tris[kb]
                a0, b0 = crossing_tris(ka, kb, 0.0)
                rest_pairs = set(zip(a0.tolist(), b0.tolist()))
                rec[0.0] = len(a0)
                for t in CHECK_T:
                    a, b = crossing_tris(ka, kb, t)
                    rec[t] = len(a)
                    if rec[t] > rec[0.0]:
                        new = [(x, y) for x, y in zip(a.tolist(), b.tolist()) if (x, y) not in rest_pairs]
                        if new:
                            fault(np.concatenate([A[[x for x, _ in new]].ravel(), B[[y for _, y in new]].ravel()]), t)
            else:
                rec = {0.0: rest_x, 1.0: len(crossing_tris(ka, kb, 1.0)[0]) if report else rest_x}
                rec.update({t: rec.get(t, rec[0.0]) for t in CHECK_T})
            c = {"rule": rule, "rest": rec[0.0], "full": rec[1.0], "max": max(rec[t] for t in CHECK_T)}
            if rule == "inside":
                c["newlyInsideMax"] = new_inside
            if report and rule == "inside":
                c["crossingTrianglesRest"], c["crossingTrianglesFull"] = rest_x, len(crossing_tris(ka, kb, 1.0)[0])
            out["copies"][(ka, kb)] = c
        # -- the arteries' points inside the moved tonsils
        vrows = np.nonzero(sh.is_vessel)[0]
        pica_in = {}
        for t in (0.0,) + CHECK_T:
            hit = []
            for s in ("L", "R"):
                r = self.tons_rows[s]
                Tv = P[r] + t * D[r]
                inside = Inside(Tv[np.asarray(sh.tissue[TONSIL][s]["indices"]).reshape(-1, 3)])(P[vrows] + t * D[vrows])
                hit.append(vrows[inside])
            h = np.unique(np.concatenate(hit))
            pica_in[t] = len(h)
            if t > 0:
                fault(h, t)
        out["picaIn"] = pica_in
        # -- the CT bone field
        bone_any = np.zeros(len(P), bool)
        for t in CHECK_T:
            nb = (self.f.bone_field(P + t * D) >= SURFACE_LEVEL) & ~self.in_bone0
            fault(np.nonzero(nb & ~bone_any)[0], t)
            bone_any |= nb
        out["boneField"] = int(bone_any.sum())
        # -- folds: the tissue's triangles (the tonsils, hemispheres and vermis) turned over, or (those not slivers)
        #    within FLIP_MARGIN_MM of it (their height over their longest edge, along their normal at rest: the files'
        #    rounding cannot turn them). The arteries' tubes by their rings: no two points of a ring (across the tube,
        #    within PAIR_MM) close at CLOSING_MAX, below; their triangles turned over are counted. Pairs closing too fast.
        X0 = P[self.T]
        flips, near_flips, tube_flips = {}, {}, {}
        Dm = D[self.T]
        for t in CHECK_T:
            Xt = X0 + t * Dm
            nt = np.cross(Xt[:, 1] - Xt[:, 0], Xt[:, 2] - Xt[:, 0])
            ht = (self.n0u * nt).sum(1) / np.maximum(np.linalg.norm(Xt - np.roll(Xt, 1, 1), axis=2).max(1), 1e-12)
            for tri in np.nonzero(mt & self.real & (ht <= 0))[0].tolist():
                (flips if self.tissue_tri[tri] else tube_flips).setdefault(tri, t)
            for tri in np.nonzero(mt & self.real & self.tissue_tri & ~self.sliver & (ht < np.minimum(FLIP_MARGIN_MM, 0.5 * self.h0)))[0].tolist():
                near_flips.setdefault(tri, t)
        for tri, t in list(flips.items()) + list(near_flips.items()):
            fault(self.T[tri], t)
        out["flips"], out["nearFlips"], out["tubeFlips"] = {}, {}, {}
        for key, dct in (("flips", flips), ("nearFlips", near_flips), ("tubeFlips", tube_flips)):
            for tri in dct:
                k = self.keys[self.node_of_tri[tri]]
                out[key][k] = out[key].get(k, 0) + 1
        out["sliversTurnedOver"] = int(sum(1 for tri in flips if self.sliver[tri]))
        dx = P[self.pj] - P[self.pi]
        dd = D[self.pj] - D[self.pi]
        d2 = (dx * dx).sum(1)
        rate = -(dd * dx).sum(1) / d2
        out["closingMax"] = float(rate.max()) if len(rate) else 0.0
        out["stretchMax"] = float((np.linalg.norm(dd, axis=1) / np.sqrt(d2)).max()) if len(rate) else 0.0
        fast = np.nonzero(rate >= CLOSING_AIM + 1e-9)[0] if not report else np.nonzero(rate >= CLOSING_MAX)[0]
        out["closingPairs"] = int((rate >= CLOSING_MAX).sum())
        closing = []
        for k in fast.tolist():
            i, j = int(self.pi[k]), int(self.pj[k])
            # the one moving into the other more is held: rate(s) = (s Di.dx - Dj.dx)/|dx|^2 with Di scaled by s
            ai, aj = float(D[i] @ dx[k]), float(-(D[j] @ dx[k]))
            r_, other = (i, j) if ai >= aj else (j, i)
            a_ = ai if r_ == i else aj
            b_ = aj if r_ == i else ai
            s = max(0.0, (CLOSING_AIM * 0.95 * d2[k] - b_) / a_) if a_ > 1e-12 else 0.0
            closing.append((r_, min(1.0, s) * float(L[r_])))
        out["closing"] = closing
        out["bad"] = bad
        return out


def owner_of(sh: Shape, r: int) -> str:
    for (sid, s), rows in sh.rows.items():
        if rows[0] <= r <= rows[-1]:
            return f"{sid} {s}"
    return "?"


def wall_counts(res: dict) -> dict:
    """Per structure a copy touches: the crossing triangles at rest, at full and at most at any t (by copy and side)."""
    out = {}
    for (k, name), c in sorted(res["walls"].items(), key=lambda x: (x[0][0][0], x[0][0][1], x[0][1])):
        full = c["tri"].get(1.0, (0,))[0]
        mx = max([c["tri"].get(t, (0,))[0] for t in CHECK_T] + [0])
        out[f"{k[0]}__{TAG} {k[1]} x {name}"] = {"rest": c["rest"] or 0, "full": full, "maxAnyT": mx}
    return out


def entered(res: dict) -> list:
    out = []
    for (k, name), c in res["walls"].items():
        if max([c["tri"].get(t, (0,))[0] for t in CHECK_T] + [0]) > (c["rest"] or 0):
            out.append(f"{k[0]} {k[1]} x {name}")
    for (a, b), c in res["copies"].items():
        if c["rule"] != "same part" and c["max"] > c["rest"]:
            out.append(f"{a[0]} {a[1]} x {b[0]} {b[1]}")
    return sorted(out)


# ---------------------------------------------------------------- items
def copy_item(src: dict, nid: str, nodes: dict, D: dict, most: float, what: str) -> dict:
    out = []
    for s in ("L", "R"):
        if s not in nodes:
            continue
        nd = nodes[s]
        V, T = np.asarray(nd["positions"], float), np.asarray(nd["indices"])
        N0 = nd["normals"] if nd.get("normals") is not None else vertex_normals(V, T)
        dn = vertex_normals(V + D[s], T) - vertex_normals(V, T)
        out.append({"name": s, "positions": V, "normals": N0, "indices": T, "mode": TRIANGLES,
                    "targets": [{"name": SHAPE, "positions": D[s], "normals": dn}]})
    write_glb(BUILD / f"{nid}.glb", out, {"id": nid})
    keep = {k: v for k, v in src.items() if k not in ("clearedFrom", "joinedFrom")}
    return {**keep, "id": nid, "file": f"assets/{KIND}/{nid}.glb", "bytes": 0, "replaces": src["id"], "pushedFrom": src["file"],
            "herniationView": VIEW, "copySides": ["L", "R"], "morph": True, "centroid": dict(src["centroid"]),
            "derivation": src["derivation"].rstrip() + f" In the tonsillar herniation view its slider moves it {what} (by up to "
            f"{most:.1f} mm at full; skullbase_v3_herniation.py): an illustration drawn by rule, not a simulation."}


def guide_item(mc: dict) -> dict:
    """McRae's line as a tube in two halves, split where it crosses the CT's own midline (x0): the half on the basion's
    side "L" if it lies left of the other (on this CT it does), so that the right-half setting keeps half of it."""
    import skullbase_build as SB
    import skullbase_v3 as V3
    b, o = mc["basion"], mc["opisthion"]
    f = (mc["x0"] - b[0]) / (o[0] - b[0]) if abs(o[0] - b[0]) > 1e-9 else 0.5
    mid = b + f * (o - b)
    halves = []
    for A, B in ((b, mid), (mid, o)):
        seg = np.linspace(A, B, 12)
        gv, gn, gt = SB.tube(np.c_[seg, np.full(len(seg), GUIDE_R_MM)])
        halves.append((gv, gn, gt))
    order = sorted(range(2), key=lambda k: halves[k][0][:, 0].mean())
    nodes, cen = [], {}
    for name, k in zip(("L", "R"), order):
        gv, gn, gt = halves[k]
        nodes.append({"name": name, "positions": gv, "normals": gn, "indices": gt, "mode": TRIANGLES})
        cen[name] = gv.mean(0).round(2).tolist()
    write_glb(BUILD / f"{GUIDE_ID}.glb", nodes, {"id": GUIDE_ID})
    # (purple: at least ΔE00 14 from every colour the view draws, in both themes and for the three colour-vision
    # deficiencies, scripts/check-palette.ts; the guides' own sbGuide is too close to the fourth ventricle's sbCsf for a
    # protanope in the dark theme, and the needle's grey sbMedialWall to the brainstem's sbBrainstem)
    return {"id": GUIDE_ID, "name": GUIDE_NAME, "aliases": ["McRae's line", "Foramen magnum line"], "type": "soft",
            "file": f"assets/{KIND}/{GUIDE_ID}.glb", "bytes": 0, "colour": V3.colour(GUIDE_TOKEN), "dataset": "rule",
            "source": "Drawn by rule on the TopBrain CT", "licence": "GPL-3.0 (the project's own drawing, on the TopBrain CT)",
            "citation": [], "citationUrls": [], "refIds": [], "category": "guide", "schematic": True, "herniationView": VIEW,
            "centroid": cen,
            "derivation": (f"The line from the basion (the clivus's lowest point) to the opisthion (the point of the foramen magnum's "
                           f"posterior rim nearest the basion), both on the occipital bone as drawn here, on its midsagittal slab "
                           f"({r1(mc['lengthMm'])} mm long; skullbase_v3_herniation.py), drawn in two halves split at this CT's "
                           f"midline. In the tonsillar herniation view the tonsils' lowest points are measured below it.")}


def merge() -> None:
    """The herniation items into v3's manifest (skullbase_v3_endonasal.carry_sellar does this too when it is run again)."""
    p = GEN / f"{PREFIX}-manifest.json"
    m = json.loads(p.read_text())
    new = json.loads(HN_ITEMS.read_text()) if HN_ITEMS.exists() else []
    for it in new:
        f = REPO / "public" / it["file"]
        if f.exists():
            it["bytes"] = f.stat().st_size
    ids = {it["id"] for it in new}
    m["structures"] = [s for s in m["structures"] if s["id"] not in ids and not s.get("herniationView")] + new
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))


# ---------------------------------------------------------------- cameras
def ray_first(o: np.ndarray, q: np.ndarray, tris: np.ndarray) -> float:
    """The distance from o along the ray towards q to the first triangle it meets (inf if none)."""
    d = q - o
    L = float(np.linalg.norm(d))
    hit, t = seg_tri(np.broadcast_to(o, (len(tris), 3)), np.broadcast_to(d, (len(tris), 3)), tris[:, 0], tris[:, 1], tris[:, 2])
    hit &= t > 1e-9
    return float(t[hit].min() * L) if hit.any() else float("inf")


def cameras(mc: dict, pts: np.ndarray, keys: dict, opaque: dict) -> dict:
    """'sagittal': from the left, square to the midline. 'posterior': from behind and below (the camera's y and z both
    less than its target's), looking forward and up through the foramen magnum: of the elevations POSTERIOR_DEG, the
    one that sees the most of the key points (the foramen magnum's back rim, the tonsils' lowest points at rest and at
    full, McRae's line), each ray checked against the opaque copies and vessels of the view at that state (the bone and
    the medulla are drawn see-through), the steeper on a tie. Each aimed at the middle of the framed points as that view
    sees them, as far off as the viewer's own framing would put a sphere round them (Viewer.distFor at a square aspect)."""
    k = CAMERA_FILL / np.sin(np.radians(CAMERA_FOV_DEG) / 2)
    out = {}
    lo, hi = pts[:, 1:].min(0), pts[:, 1:].max(0)
    c = (lo + hi) / 2
    target = np.array([0.0, c[0], c[1]])
    rad = CAMERA_MARGIN * float(np.linalg.norm(pts[:, 1:] - c, axis=1).max())
    out["sagittal"] = {"position": v2(target + np.array([-k * rad, 0.0, 0.0])), "target": v2(target)}
    best = None
    for deg in POSTERIOR_DEG:
        e = np.array([0.0, -np.cos(np.radians(deg)), -np.sin(np.radians(deg))])        # from the target to the camera
        e1 = np.array([1.0, 0.0, 0.0])
        e2 = np.cross(e, e1)
        q = np.c_[pts @ e1, pts @ e2]
        lo, hi = q.min(0), q.max(0)
        cc = (lo + hi) / 2
        depth = float((pts @ e).mean())
        tgt = cc[0] * e1 + cc[1] * e2 + depth * e
        rad = CAMERA_MARGIN * float(np.linalg.norm(q - cc, axis=1).max())
        cam = tgt + k * rad * e
        seen = {}
        for name, (state, p) in keys.items():
            first = ray_first(cam, p, opaque[state])
            seen[name] = bool(first >= np.linalg.norm(p - cam) - RAY_TOL_MM)
        n = sum(seen.values())
        if best is None or n >= best[0]:
            best = (n, deg, cam, tgt, seen)
    n, deg, cam, tgt, seen = best
    out["posterior"] = {"position": v2(cam), "target": v2(tgt), "elevationDeg": deg,
                        "seen": {k_: v for k_, v in seen.items()}}
    return out


def camera_keys(mc: dict, sh: Shape, D: np.ndarray) -> dict:
    """The points the posterior view must show: the foramen magnum's back rim (the opisthion and the occipital bone's
    rim 6 mm either side of the line), the tonsils' lowest points at rest and at full, and McRae's line (5 points)."""
    out = {"opisthion": ("rest", mc["opisthion"])}
    V = mc["occipital"]
    b = below(V, mc)
    for s, dx in (("L", -6.0), ("R", 6.0)):
        sel = V[(np.abs(V[:, 0] - (mc["x0"] + dx)) < 1.0) & (np.abs(b) < 2.0) & (V[:, 1] < mc["opisthion"][1] + 12.0)]
        if len(sel):
            out[f"rim {s}"] = ("rest", sel[np.lexsort((sel[:, 0], sel[:, 2], -sel[:, 1]))[0]])      # the rim's front edge
    for state, Dx in (("rest", np.zeros_like(D)), ("full", D)):
        for s, tip in sh.tips(Dx).items():
            out[f"tip {s} {state}"] = (state, np.array(tip["point"]))
    for f in (0.1, 0.3, 0.5, 0.7, 0.9):
        out[f"line {f}"] = ("full", mc["opisthion"] + f * (mc["basion"] - mc["opisthion"]))
    return out


# ---------------------------------------------------------------- the step
def main() -> int:
    manifest = json.loads((GEN / f"{PREFIX}-manifest.json").read_text())["structures"]
    man = {it["id"]: it for it in manifest if not (it.get("pushedFrom") or it.get("replaces") or it.get("tumourView")
                                                    or it.get("herniationView") or it.get("approach") or it.get("forView"))}
    lms = json.loads((GEN / f"{PREFIX}-landmarks.json").read_text())
    mc = mcrae(man, lms)
    print("McRae's line: basion", v2(mc["basion"]), "opisthion", v2(mc["opisthion"]), f"{mc['lengthMm']:.1f} mm", flush=True)
    fields = Fields(man)
    tissue = load_parts(man, TISSUE)
    vessels = load_parts(man, VESSELS)
    down = medulla_back(read_glb_full(file_of(man[MEDULLA])), mc)
    sh = Shape(mc, fields, tissue, vessels, down, man)
    med = Medulla(man)
    chk = Checker(sh, fields, med)
    print(f"{len(sh.P)} copied points; walls: " + ", ".join(f"{k} {len(S.tri)} triangles" for k, S in sh.walls.surf.items())
          + f" from {len(sh.walls.names)} meshes", flush=True)

    # ---- the descent, the press and the holds, in turn
    press = (0.0, 0.0)
    mv = None
    repeats: dict = {}
    for outer in range(OUTER_ROUNDS):
        mv = sh.solve_descent(press)
        print(f"[{outer}] descent {mv['descent']:.3f} mm: depth {sh.depth(mv['D']):.2f}", flush=True)
        press = sh.solve_press(mv["descent"], press, med)
        mv = sh.moves(mv["descent"], press)
        g = sh.medulla_gaps(mv["D"], med)
        print(f"[{outer}] press {press[0]:.2f}/{press[1]:.2f} mm: below-line gaps L {g['L']:.2f} R {g['R']:.2f}, depth {sh.depth(mv['D']):.2f}", flush=True)
        clean = False
        for rnd in range(HOLD_ROUNDS):
            res = chk.run(mv["D"])
            nb = len(res["bad"]) + len(res["closing"])
            print(f"  hold round {rnd}: {len(res['bad'])} points at fault, {len(res['closing'])} pairs closing over "
                  f"{CLOSING_AIM}; entered {entered(res)[:6]}; flips {res['flips']} near {res['nearFlips']}; closing max {res['closingMax']:.2f}", flush=True)
            if not nb:
                clean = True
                break
            Lm = np.linalg.norm(mv["D"], axis=1)
            # (a point at fault that is held still already: its neighbours held as it is, within FAULT_NEAR_MM times the
            # number of times it has been so)
            stuck = sorted(r for r in res["bad"] if Lm[r] <= 1e-6)
            if len(res["bad"]) <= 10:
                print("    at fault:", [(owner_of(sh, r), v2(sh.P[r]), res["bad"][r], r2(Lm[r])) for r in sorted(res["bad"])], flush=True)
            if stuck:
                tree = cKDTree(sh.P)
                for r in stuck:
                    repeats[r] = repeats.get(r, 0) + 1
                    for j in sorted(tree.query_ball_point(sh.P[r], FAULT_NEAR_MM * repeats[r])):
                        res["bad"][j] = min(res["bad"].get(j, 2.0), res["bad"][r])
            for r, t in sorted(res["bad"].items()):
                sh.caps[r] = min(sh.caps[r], HOLD_KEEP * max(t - CHECK_T[0], 0.0) * Lm[r])
            for r, cap in res["closing"]:
                sh.caps[r] = min(sh.caps[r], cap)
            mv = sh.moves(mv["descent"], press)
        dep = sh.depth(mv["D"])
        g = sh.medulla_gaps(mv["D"], med)
        print(f"[{outer}] after the holds: depth {dep:.2f}, gaps below the line L {g['L']:.2f} R {g['R']:.2f}, clean {clean}", flush=True)
        if clean and abs(dep - DESCENT_MM) <= 0.1 and all(PRESS_GAP_MM[0] <= g[s] <= PRESS_GAP_MM[1] for s in ("L", "R")):
            break
    D = mv["D"]

    # ---- the checks, as reported
    res = chk.run(D, report=True)
    fails = []
    tips_rest, tips_full = sh.tips(np.zeros_like(D)), sh.tips(D)
    for s in ("L", "R"):
        if abs(tips_full[s]["belowLineMm"] - DESCENT_MM) > TIP_TOL_MM:
            fails.append(f"the {s} tonsil's lowest point {tips_full[s]['belowLineMm']} mm below McRae's line, not {DESCENT_MM} +- {TIP_TOL_MM}")
    ent = entered(res)
    if res["bad"]:
        fails.append(f"{len(res['bad'])} copy points at fault (walls, bone, arteries in the tonsils, folds): entered {ent}")
    if ent:
        fails.append(f"structures entered: {ent}")
    if res["pathCrossings"]:
        fails.append(f"{res['pathCrossings']} paths cross a wall")
    if res["boneField"]:
        fails.append(f"{res['boneField']} copy vertices in the CT bone field at some t (that were not at rest)")
    if res["closingPairs"] or res["flips"] or res["nearFlips"]:
        fails.append(f"folds: {res['closingPairs']} pairs closing at {CLOSING_MAX} mm per mm or faster, triangles turned over "
                     f"{res['flips']}, within {FLIP_MARGIN_MM} mm of it {res['nearFlips']}")
    gaps = {t: sh.medulla_gaps(D, med, t)["all"] for t in (0.0,) + CHECK_T}
    gfull = sh.medulla_gaps(D, med, 1.0)
    if min(gaps[t] for t in CHECK_T) < 0:
        fails.append(f"a tonsil inside the medulla: gaps {gaps}")
    if not MEDULLA_GAP_FULL_MM[0] <= gaps[1.0] <= MEDULLA_GAP_FULL_MM[1]:
        fails.append(f"the tonsils {gaps[1.0]:.2f} mm from the medulla at full, not {MEDULLA_GAP_FULL_MM[0]}-{MEDULLA_GAP_FULL_MM[1]}")
    for s in ("L", "R"):
        if not MEDULLA_GAP_FULL_MM[0] <= gfull[s] <= MEDULLA_GAP_FULL_MM[1]:
            fails.append(f"the {s} tonsil's part below McRae's line {gfull[s]:.2f} mm from the medulla at full")
    pica_ok = all(res["picaIn"][t] == 0 for t in (0.0,) + CHECK_T)
    if not pica_ok:
        fails.append(f"artery copy points inside the moved tonsils: {res['picaIn']}")

    # ---- the copies (what they are; written once the checks pass)
    planned = []
    for group, what in ((tissue, "down through the foramen magnum with the tonsils"),
                        (vessels, "with the cerebellum it lies on, as the tonsils go down through the foramen magnum")):
        for sid in group:
            Ds = {s: D[sh.rows[(sid, s)]] for s in ("L", "R") if (sid, s) in sh.rows}
            most = max(float(np.linalg.norm(d, axis=1).max()) for d in Ds.values())
            if group is vessels and most < MOVED_MIN_MM:
                print(f"  {sid}: moves {most:.2f} mm at most, not copied")
                continue
            planned.append((sid, group, Ds, most, what))
    copies = [{"id": f"{sid}__{TAG}", "replaces": sid, "name": man[sid]["name"], "maxMoveMm": r2(most)} for sid, _, _, most, _ in planned]

    # ---- the cameras
    tons_rows = np.concatenate([sh.rows[(TONSIL, s)] for s in ("L", "R")])
    pts = np.vstack([mc["basion"], mc["opisthion"], sh.P[tons_rows], sh.P[tons_rows] + D[tons_rows]]
                    + [np.asarray(nd["positions"], float)[(lambda b: (b > -FRAME_ABOVE_MM) & (b < FRAME_BELOW_MM))(below(nd["positions"], mc))]
                       for nd in read_glb_full(file_of(man[MEDULLA])).values()])
    opaque = {}
    for state, t in (("rest", 0.0), ("full", 1.0)):
        tri = [(sh.P + t * D)[sh.tris[k]] for k in sh.tris]
        for sid in (VA, "sb_basilar_artery"):
            for s, nd in read_glb_full(file_of(man[sid])).items():
                tri.append(np.asarray(nd["positions"], float)[np.asarray(nd["indices"]).reshape(-1, 3)])
        opaque[state] = np.concatenate(tri)
    cams = cameras(mc, pts, camera_keys(mc, sh, D), opaque)
    cp = cams["posterior"]
    if not (cp["position"][1] < cp["target"][1] and cp["position"][2] < cp["target"][2]):
        fails.append(f"the posterior camera is not behind and below its target: {cp}")
    if not all(v for k_, v in cp["seen"].items() if k_.startswith(("opisthion", "rim", "tip"))):
        fails.append(f"the posterior camera does not see the rim and the tonsils: {cp['seen']}")

    # ---- the report
    wc = wall_counts(res)
    touched = {k: v for k, v in wc.items() if v["rest"] or v["maxAnyT"]}
    report = {"tonsillar": {
        "descentMm": DESCENT_MM, "basion": v2(mc["basion"]), "opisthion": v2(mc["opisthion"]), "mcraeLengthMm": r2(mc["lengthMm"]),
        "tonsilTips": {"rest": tips_rest, "full": tips_full},
        "medullaGapMm": {"rest": r2(gaps[0.0]), "full": r2(gaps[1.0]), "minAnyT": r2(min(gaps[t] for t in CHECK_T))},
        "medullaGapBelowLineMm": {"L": r2(gfull["L"]), "R": r2(gfull["R"])},
        "boneVerticesAnyT": int(res["boneField"]), "boneMeshGapMinMm": r2(res["boneGapMin"]), "boneMeshNearAtRest": res["boneNear"],
        "foldFree": bool(not res["closingPairs"] and not res["flips"] and not res["nearFlips"]), "slopeMax": r2(res["closingMax"]),
        "trianglesTurnedOver": int(sum(res["flips"].values())), "closingPairs": int(res["closingPairs"]),
        "copies": copies, "picaOutsideTonsilsAnyT": bool(pica_ok),
        "structuresEntered": ent, "pathsCrossingAnything": int(res["pathCrossings"]),
        "cameras": {k: {"position": v["position"], "target": v["target"]} for k, v in cams.items()},
        "params": {"descentAlongCanalMm": r2(mv["descent"]), "reachMm": REACH_MM, "squeeze": SQUEEZE, "forwardMm": FORWARD_MM,
                   "pressMm": {"L": r2(press[0]), "R": r2(press[1])}, "pressFullMm": PRESS_FULL_MM, "pressTopMm": PRESS_TOP_MM,
                   "boneGapMm": BONE_GAP_MM, "stemGapMm": STEM_GAP_MM, "vertebralGapMm": VA_GAP_MM, "riseMm": RISE_MM,
                   "behindSlope": BEHIND_SLOPE, "aheadSlope": AHEAD_SLOPE, "sideSlope": SIDE_SLOPE, "vertebralSlope": VA_SLOPE, "closingLimit": CLOSING_MAX,
                   "checkedAt": list(CHECK_T), "inBoneAtRest": int(chk.in_bone0.sum()),
                   "stretchMax": r2(res["stretchMax"]), "flippedTriangles": int(sum(res["flips"].values())),
                   "trianglesNearlyTurnedOver": int(sum(res["nearFlips"].values())), "sliverMm": SLIVER_MM,
                   "flipMarginMm": FLIP_MARGIN_MM, "sliverTriangles": int((chk.sliver & chk.real & chk.tissue_tri).sum()),
                   "tubeTrianglesTurnedOver": int(sum(res["tubeFlips"].values())),
                   "down": v2(down), "pointsCutShort": mv["cutShort"], "pointsHeldByChecks": mv["held"],
                   "wallsChecked": len(sh.walls.names), "posteriorElevationDeg": cp["elevationDeg"],
                   "posteriorSees": cp["seen"],
                   "picaPointsInTonsils": {str(t): n for t, n in res["picaIn"].items() if t in (0.0, 0.25, 0.5, 0.75, 1.0)},
                   "copiesCrossing": {f"{a[0]} {a[1]} x {b[0]} {b[1]}": c for (a, b), c in sorted(res["copies"].items()) if c["rest"] or c["max"]},
                   "wallsTouched": touched},
    }}
    print(json.dumps({k: v for k, v in report["tonsillar"].items() if k != "params"}, indent=1))
    print(json.dumps({k: v for k, v in report["tonsillar"]["params"].items() if k not in ("wallsTouched", "copiesCrossing")}, indent=1))
    if fails:
        for f in fails:
            print("FAIL", f)
        raise SystemExit("the tonsillar shape fails its checks: nothing written")
    for f in sorted(BUILD.glob(f"*__{TAG}.glb")):
        f.unlink()
    items = [copy_item(man[sid], f"{sid}__{TAG}", group[sid], Ds, most, what) for sid, group, Ds, most, what in planned]
    items.append(guide_item(mc))
    HN_ITEMS.write_text(json.dumps(items, indent=1, ensure_ascii=False))
    OUT_JSON.write_text(json.dumps(report, indent=1, ensure_ascii=False) + "\n")
    merge()
    print("written", len(items), "items:", " ".join(Path(it["file"]).name for it in items))
    return 0


def check(structures: list) -> list[tuple[bool, str]]:
    """For skullbase_v3.validate: the report's checks passed, each copy's original present, and each item's file listed."""
    out = []
    if not OUT_JSON.exists():
        return [(False, f"{OUT_JSON.name} missing")]
    r = json.loads(OUT_JSON.read_text())["tonsillar"]
    out.append((r["boneVerticesAnyT"] == 0 and r["boneMeshGapMinMm"] >= BONE_GAP_MM - 0.01,
                f"tonsillar herniation: {r['boneVerticesAnyT']} copy vertices in bone, {r['boneMeshGapMinMm']} mm from it"))
    out.append((r["foldFree"] and r["slopeMax"] < CLOSING_MAX and r["trianglesTurnedOver"] == 0,
                f"tonsillar herniation: closing {r['slopeMax']}, {r['trianglesTurnedOver']} triangles turned over"))
    out.append((not r["structuresEntered"] and r["pathsCrossingAnything"] == 0, f"tonsillar herniation: enters {r['structuresEntered']}"))
    out.append((r["picaOutsideTonsilsAnyT"], "tonsillar herniation: the arteries' copies inside the moved tonsils"))
    out.append((r["medullaGapMm"]["minAnyT"] >= 0 and MEDULLA_GAP_FULL_MM[0] <= r["medullaGapMm"]["full"] <= MEDULLA_GAP_FULL_MM[1]
                and all(MEDULLA_GAP_FULL_MM[0] <= r["medullaGapBelowLineMm"][s] <= MEDULLA_GAP_FULL_MM[1] for s in ("L", "R")),
                f"tonsillar herniation: medulla gap {r['medullaGapMm']} {r['medullaGapBelowLineMm']}"))
    for s in ("L", "R"):
        out.append((abs(r["tonsilTips"]["full"][s]["belowLineMm"] - r["descentMm"]) <= TIP_TOL_MM,
                    f"tonsillar herniation: the {s} tip {r['tonsilTips']['full'][s]['belowLineMm']} mm below McRae's line"))
    cam = r["cameras"]["posterior"]
    out.append((cam["position"][1] < cam["target"][1] and cam["position"][2] < cam["target"][2],
                "tonsillar herniation: the posterior camera not behind and below its target"))
    ids = {s["id"]: s for s in structures}
    for c in r["copies"]:
        s = ids.get(c["id"])
        out.append((s is not None and s.get("herniationView") == VIEW and s.get("replaces") == c["replaces"] and c["replaces"] in ids,
                    f"tonsillar herniation: copy {c['id']} missing or not replacing {c['replaces']}"))
    out.append((GUIDE_ID in ids and ids[GUIDE_ID].get("herniationView") == VIEW, f"{GUIDE_ID} missing"))
    return out


if __name__ == "__main__":
    sys.exit(main())
