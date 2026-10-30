"""Skull base v3's tumours, drawn by rule on this CT to show how they are graded and which way they are reached:
a pituitary adenoma at each Knosp grade, a vestibular schwannoma at each Koos grade, and meningiomas at four sites of
the skull base.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_tumours.py
  (after skullbase_v3_endonasal.py; then compress.mjs skullbase-v3 and skullbase_v3.py finalize)

None of them is a patient's tumour: each is a shape placed and sized by the rules below, on this CT's own bone and
arteries and the anatomy v3 fits to it. Every tumour keeps out of the bone and out of this CT's own arteries (TopBrain's
labels; the traced carotid), so these run along its surface or through it in a channel, and out of the cranial nerves'
routes where it says so.

  * Knosp (Knosp 1993 and its revision, as Araujo-Castro 2021 states the grades): on the coronal section through the cavernous and the
    supraclinoid carotid (the CT's own label, the plane in KNOSP_Y_MM where the label shows both and each is largest),
    the three lines: the medial tangent (along both arteries' medial walls), the intercarotid line (through their
    centres) and the lateral tangent (along their lateral walls), each found from the two cross-sections (their
    centroids, and the radius of a circle of the same area). The adenoma: an ellipsoid over the sella (ADENOMA_*) and,
    towards the right, a lobe at the level between the two arteries (LOBE_*), cut back to a line between the Knosp lines
    (grades 0-2, KNOSP_REACH), or with the cavernous sinus as modelled by skullbase_v3_cavernous.py added to it near the
    plane (KNOSP_SPAN_MM): above the cavernous carotid (3A, the superior compartment), below it (3B, the inferior one) or
    all round it (4, encasing it). The left side is kept at grade 0 (cut back to its own medial tangent). Each drawn
    adenoma is then graded again from its own section (`knosp_grade`), as a check of the drawing.
  * Koos (as Gupta 2020 and Starnoni 2020 state them): grade I in the internal acoustic meatus (the canal's lumen
    between the fundus and the porus, as this CT's bone leaves it, within CANAL_MM of the axis); II-IV add a ball in the
    cerebellopontine angle (KOOS_DIAMETER_MM), its surface at the porus and a neck joining them (KOOS_NECK_MM: the
    "ice-cream cone"), inside the posterior fossa's intradural space (the fitted cerebellum and brainstem and
    KOOS_CISTERN_MM round them), level with the porus (KOOS_LEVEL_MM) and not behind the brainstem (KOOS_MEDIAL_MM):
    II kept KOOS_CLEAR_MM off the brainstem (as large as that allows), III reaching it and moulded against it (cut at its
    surface, up to KOOS_MOULD_MM in), IV reaching KOOS_INTO_MM into where it lies (the brainstem pushed aside); of the
    centres allowed, the one furthest off the brainstem. This model's fitted pons lies about 4 mm from the porus, closer
    than in life, which is why II is small and III moulded. The nerves of the angle are moved round it
    (displaced_nerves): the facial nerve forwards onto its anterior surface (Choi 2014), thinned and flattened over
    grades III and IV (Starnoni 2020), the others and the fitted small arteries the shortest way out; the
    vestibulocochlear nerve, from which it grows, runs into it.
  * Meningiomas (sites and approaches from Ius 2021's table of skull base meningiomas): a ball of MENINGIOMA_MM
    diameter on the dura of each site (its centre MENINGIOMA_RISE of its radius off the bone along the way out of it, so
    the bone cuts it to a broad base), kept inside the dura (within MENINGIOMA_INTRADURAL_MM of the fitted brain, on the
    brain's side of the site), the cranial nerves keeping channels through it.

The fitted brain (the template cerebrum, the cerebellum, brainstem, fourth ventricle) is pushed out of each tumour as a
mass would push it: each point inside it moved to the nearest open space (not bone, not the tumour, not what stays put)
PUSH_GAP_MM beyond it (pushed on the way the tumour grows: from the meatus, or off its dural base, through its far side),
the push spread over the part's neighbouring points with a normalised Gaussian (PUSH_SIGMA_MM),
for up to PUSH_ROUNDS rounds; the pushed parts are written as copies for that view ("replaces" the part), their
surgical shapes (morph targets) kept. A shape, not a simulation of the tissue. The nerves and the fitted small arteries
are not moved round the tumours.

Writes v3's build (tm_*.glb, the pushed copies, tumour_items.json) and src/data/generated/sbv3-tumours.json (the Knosp
plane and lines, each tumour's measures and its grade checked from the drawing).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_v3_endonasal as ENDO  # noqa: E402
from glb import TRIANGLES, read_glb_full, write_glb  # noqa: E402

REPO = ROOT.parent
DATA = ROOT / "data" / "build"
V3_BUILD = DATA / "skullbase-v3"
GEN = REPO / "src" / "data" / "generated"
TM_ITEMS = V3_BUILD / "tumour_items.json"
OUT_JSON = GEN / "sbv3-tumours.json"
STEP = ENDO.GRID_MM

ICA_LABEL = {"R": 4, "L": 6}         # TopBrain's internal carotid arteries in this case (as skullbase_v3_cavernous.py)
KNOSP_Y_MM = (-1.0, 5.0)             # the coronal section is looked for between these (mm in front of the fossa)
KNOSP_MIN_MM2 = 4.0                  # a cross-section of the label smaller than this is not one of the two
KNOSP_WELL_MM2 = 8.0                 # the section taken nearest the hypophysis's middle where both are at least this
ADENOMA_UP_MM = 2.5                  # the adenoma's ellipsoid: centred this far above the hypophysis's centre ...
ADENOMA_AXES_MM = (7.0, 6.5, 6.5)    # ... with these semi-axes (x, y, z): a macroadenoma over the sella (illustrative)
LOBE_AXES_MM = (9.0, 4.5, 3.0)       # its lobe towards the right, at the level between the two arteries (illustrative)
KNOSP_REACH = {"0": ("medial", -0.8), "1": ("medial", 0.6), "2": ("intercarotid", 0.6)}   # cut back to: line + share of
#                                    # the way to the next line (grade 0: this many mm short of the medial tangent)
KNOSP_SPAN_MM = 5.0                  # grades 3-4: the cavernous sinus taken this far in front of and behind the plane
KNOSP_OFF_MM = 2.0                   # ... 3B's way down lateral to the artery no nearer the section than this
VESSEL_KEEP_MM = 0.4                 # a tumour keeps this far off this CT's arteries (grade 4: KNOSP_ENCASE_MM)
KNOSP_ENCASE_MM = 0.1
NERVE_KEEP_MM = 0.3                  # ... and this far off a nerve's route where it keeps a channel for it
SMOOTH_MM = 0.8                      # a tumour's surface smoothed over this (Gaussian of its signed distance)
LINE_R_MM = 0.2                      # the Knosp lines drawn this thick (radius) ...
LINE_EXTEND_MM = 5.0                 # ... past each artery's tangent point, and this far behind the section
LINE_BEHIND_MM = 0.2
ENCASE_SHARE = 0.9                   # grade 4 checked: tumour all round the cavernous carotid (this share of directions)

CANAL_MM = 3.0                       # Koos I: the meatus's lumen within this of its axis
PORUS_PAST_MM = 0.5                  # ... up to this past the porus
KOOS_DIAMETER_MM = {"2": np.arange(6.0, 19.1, 1.0), "3": [25.0], "4": [34.0]}
#                                    # the ball's sizes (mm across; Koos: II < 2 cm, III < 3 cm, IV > 3 cm; II tried down
#                                    # from the largest until it stays off the brainstem)
KOOS_CLEAR_MM = 0.5                  # II: this far off the brainstem
KOOS_MOULD_MM = 8.0                  # III: reaching the brainstem, and moulded against it where it would reach up to this far in
KOOS_INTO_MM = (9.0, 14.0)           # IV: this far into where the brainstem lies (it is pushed aside)
KOOS_PORUS_OUT_MM = 0.5              # the porus at most this far outside the ball's surface; a neck joins them (the cone of
KOOS_NECK_MM = 3.0                   # the "ice-cream cone"): a capsule of this radius from the porus to the ball's centre
KOOS_BEHIND_PORUS_MM = 1.0           # the centre no further than this lateral to the porus (along the meatus)
KOOS_OPEN = 0.0                      # ... and at least this share of the radius off the bone
KOOS_CISTERN_MM = 5.0                # the angle: the fitted cerebellum and brainstem and this far round them (not bone, not the cerebrum)
KOOS_MEDIAL_MM = 6.0                 # ... and no more than this medial to the porus (the ball in the angle, not behind the brainstem)
KOOS_LEVEL_MM = 6.0                  # ... and within this of the porus's height (the angle's level)
KOOS_BELOW_TENTORIUM = 0.4           # ... and this share of it off the cerebrum (mostly below the tentorium; cut there)

MENINGIOMA_MM = {"olfactory": 30.0, "tuberculum": 20.0, "petroclival": 28.0, "foramen_magnum": 30.0}   # (illustrative)
MENINGIOMA_RISE = 0.55               # the ball's centre this share of its radius off the bone
MENINGIOMA_INTRADURAL_MM = {"olfactory": 6.0, "tuberculum": 6.0, "petroclival": 6.0, "foramen_magnum": 16.0}
#                                    # ... kept inside the dura: within this of the fitted brain (its cisterns; at the foramen
#                                    # magnum the medulla lies far behind the rim), not bone

PUSH_GAP_MM = 0.5
PUSH_SIGMA_MM = 3.0
PUSH_ROUNDS = 100
PUSH_REACH_MM = 45.0                 # (a point is pushed through the tumour at most this far)
PUSH_MARGIN_MM = 12.0                # a part is looked at if it comes this close to the tumour's box

# the views: which approach, the side shown, the shapes kept on the pushed copies
VIEWS = {
    "knosp": {"hemi": "both", "morphs": []},
    "koos": {"hemi": "R", "morphs": ["retrosigmoid"]},
    "olfactory": {"hemi": "R", "morphs": ["lsoLift", "open"]},
    "tuberculum": {"hemi": "R", "morphs": ["open", "lift"]},
    "petroclival": {"hemi": "R", "morphs": ["retrosigmoid"]},
    "foramen_magnum": {"hemi": "R", "morphs": []},
}
STEM = ("Medulla oblongata", "Pons", "Midbrain")
SITE = {   # the meningiomas: name, where (by the landmarks of v3 and the cavernous model), what the push may move
    "olfactory": ("Olfactory groove meningioma", ("brain",)),
    "tuberculum": ("Tuberculum sellae meningioma", ("brain", "optic")),
    "petroclival": ("Petroclival meningioma", ("hindbrain", "ventricle")),
    "foramen_magnum": ("Foramen magnum meningioma", ("hindbrain", "ventricle")),
}


# ---------------------------------------------------------------- the grid and what is on it
def box_round(lo, hi) -> tuple:
    """A box on the 0.5 mm lattice of v3's grids."""
    return tuple((float(np.floor(a / STEP) * STEP), float(np.ceil(b / STEP) * STEP)) for a, b in zip(lo, hi))


def fill_in(V: np.ndarray, T: np.ndarray, lo: np.ndarray, shape: tuple) -> np.ndarray:
    """The inside of a closed mesh on the grid (lo, shape, STEP), the mesh allowed to reach past it."""
    from skullbase_brain import fill
    out = np.zeros(shape, bool)
    a = np.floor((V.min(0) - lo) / STEP).astype(int) - 2
    b = np.ceil((V.max(0) - lo) / STEP).astype(int) + 3
    if np.any(b <= 0) or np.any(a >= np.array(shape)):
        return out
    own = fill(V, T, lo + a * STEP, tuple(b - a), STEP)
    s0, s1 = np.maximum(a, 0), np.minimum(b, shape)
    out[s0[0]:s1[0], s0[1]:s1[1], s0[2]:s1[2]] = own[s0[0] - a[0]:s1[0] - a[0], s0[1] - a[1]:s1[1] - a[1], s0[2] - a[2]:s1[2] - a[2]]
    return out


def mesh_mask(path: Path, lo: np.ndarray, shape: tuple, sides=("L", "R")) -> np.ndarray:
    """A structure's meshes on the grid: filled where closed, else the voxels its surface passes through, closed."""
    out = np.zeros(shape, bool)
    for s, nd in read_glb_full(path).items():
        if s not in sides:
            continue
        V, T = nd["positions"], nd["indices"]
        if trimesh.Trimesh(V, T, process=False).is_watertight:
            out |= fill_in(V, T, lo, shape)
        else:
            m = trimesh.Trimesh(V, T, process=False)
            P = np.vstack([V, m.sample(max(1, int(m.area / 0.05)))])
            ijk = np.rint((P - lo) / STEP).astype(int)
            ok = np.all((ijk >= 0) & (ijk < np.array(shape)), 1)
            v = np.zeros(shape, bool)
            v[tuple(ijk[ok].T)] = True
            out |= ndimage.binary_fill_holes(ndimage.binary_closing(v, iterations=2))
    return out


def file_of(item: dict) -> Path:
    return DATA / item["file"].replace("assets/", "")


class Grid:
    """One tumour's grid: this CT's bone and labels (skullbase_v3_endonasal.ct_grid) over a box, and the manifest's
    structures rasterised on it as asked."""

    def __init__(self, box: tuple, man: list):
        g = ENDO.ct_grid(box)
        self.g, self.shape, self.a = g, g["shape"], g["a_crop"]
        self.P = g["P"].reshape(self.shape + (3,))
        self.lo = np.array([b[0] for b in box])
        self.bone = g["bone"] >= ENDO.FIELD_ISO
        self.lab = g["lab"]
        self.man = man
        self._d = {}

    def dist(self, mask: np.ndarray) -> np.ndarray:
        return ndimage.distance_transform_edt(~mask, sampling=STEP)

    def of(self, kinds=(), names=(), sides=("L", "R")) -> np.ndarray:
        out = np.zeros(self.shape, bool)
        hi = self.lo + STEP * (np.array(self.shape) - 1)
        for it in self.man:
            if not ((it.get("category") in kinds) or it["name"] in names) or it.get("pushedFrom") or it["id"].startswith("tm_"):
                continue
            c = np.array([v for s, v in it["centroid"].items() if s in sides] or [[0, 0, 0]])
            if not np.any(np.all((c > self.lo - 80) & (c < hi + 80), 1)):
                continue
            out |= mesh_mask(file_of(it), self.lo, self.shape, sides)
        return out

    def arteries(self) -> np.ndarray:
        """This CT's own arteries (TopBrain's labels) and v3's traced carotid."""
        art = self.lab > 0
        return art | self.of(names=("Internal carotid artery (petrous and lacerum parts)", "Internal carotid artery (cervical part)"))

    def at(self, p) -> tuple:
        return tuple(np.clip(np.rint((np.asarray(p) - self.lo) / STEP).astype(int), 0, np.array(self.shape) - 1))


def signed(mask: np.ndarray) -> np.ndarray:
    return ENDO.signed(mask, STEP)


def smoothed(mask: np.ndarray, sigma: float = SMOOTH_MM) -> np.ndarray:
    """A mask's surface smoothed (its signed distance blurred)."""
    return ndimage.gaussian_filter(signed(mask).astype(np.float32), sigma / STEP) < 0


def to_mesh(mask: np.ndarray, a_crop: np.ndarray) -> trimesh.Trimesh:
    import skullbase_v3_cavernous as CAV
    return CAV.mesh_of(signed(mask).astype(np.float32), a_crop, sigma=0.5)


def ellipsoid(P: np.ndarray, c, axes) -> np.ndarray:
    return (((P - np.asarray(c)) / np.asarray(axes)) ** 2).sum(-1) <= 1.0


def ball(P: np.ndarray, c, r: float) -> np.ndarray:
    return ((P - np.asarray(c)) ** 2).sum(-1) <= r * r


# ---------------------------------------------------------------- Knosp
def sections(gr: Grid, side: str) -> list[dict]:
    """The carotid label's cross-sections on each coronal slice in KNOSP_Y_MM: where it shows exactly two (the
    cavernous carotid below, the supraclinoid one above), their centroids (x, z) and the radius of a circle of equal area."""
    out = []
    lab = gr.lab == ICA_LABEL[side]
    for j in range(gr.shape[1]):
        y = float(gr.P[0, j, 0, 1])
        if not (KNOSP_Y_MM[0] <= y <= KNOSP_Y_MM[1]):
            continue
        l, n = ndimage.label(lab[:, j, :])
        comps = []
        for k in range(1, n + 1):
            idx = np.argwhere(l == k)
            area = len(idx) * STEP * STEP
            if area < KNOSP_MIN_MM2:
                continue
            pts = gr.P[idx[:, 0], j, idx[:, 1]]
            comps.append({"c": np.array([pts[:, 0].mean(), pts[:, 2].mean()]), "r": float(np.sqrt(area / np.pi)), "area": area})
        if len(comps) == 2:
            low, up = sorted(comps, key=lambda c: c["c"][1])
            out.append({"y": y, "j": j, "cavernous": low, "supraclinoid": up})
    return out


def knosp_lines(sec: dict, side: str) -> dict:
    """The medial tangent, the intercarotid line and the lateral tangent on one section: each as two points (x, z),
    on the cavernous (first) and the supraclinoid (second) artery."""
    c1, r1 = sec["cavernous"]["c"], sec["cavernous"]["r"]
    c2, r2 = sec["supraclinoid"]["c"], sec["supraclinoid"]["r"]
    d = c2 - c1
    D = float(np.linalg.norm(d))
    d = d / D
    n = np.array([d[1], -d[0]])
    s_ = 1.0 if side == "R" else -1.0
    if n[0] * s_ < 0:
        n = -n                            # n points laterally
    sn = (r2 - r1) / D
    cs = np.sqrt(max(1 - sn * sn, 0.0))
    m_med = cs * n + sn * d               # the circles lie on +m of the line: lateral of the medial tangent ...
    m_lat = -cs * n + sn * d              # ... medial of the lateral one
    return {"medial": (c1 - r1 * m_med, c2 - r2 * m_med), "intercarotid": (c1, c2), "lateral": (c1 - r1 * m_lat, c2 - r2 * m_lat)}


def line_x(line, z):
    (x1, z1), (x2, z2) = line
    return x1 + (z - z1) * (x2 - x1) / (z2 - z1)


def knosp_grade(mask_slice: np.ndarray, Px: np.ndarray, Pz: np.ndarray, sec: dict, lines: dict, side: str, room: np.ndarray) -> dict:
    """A drawn adenoma graded again from its section on the plane: how far it reaches past each line (in the band
    between the two arteries' outer edges), where it lies past the lateral tangent, and how much of the cavernous
    carotid it surrounds (1 mm out from it, where there is room for it: not bone, not a nerve's or another artery's way;
    the lesser of its share above and below the artery's centre)."""
    s_ = 1.0 if side == "R" else -1.0
    c1, r1 = sec["cavernous"]["c"], sec["cavernous"]["r"]
    c2, r2 = sec["supraclinoid"]["c"], sec["supraclinoid"]["r"]
    band = (Pz >= c1[1] - r1) & (Pz <= c2[1] + r2) & mask_slice & (s_ * Px > 0)
    past = {k: float((s_ * (Px[band] - line_x(lines[k], Pz[band]))).max()) if band.any() else -99.0 for k in lines}
    lat = band & (s_ * (Px - line_x(lines["lateral"], Pz)) > 0)
    ang = np.linspace(0, 2 * np.pi, 24, endpoint=False)
    ring = c1 + (r1 + 1.0) * np.c_[np.cos(ang), np.sin(ang)]
    dx, dz = Px[1, 0] - Px[0, 0], Pz[0, 1] - Pz[0, 0]
    ii = np.clip(np.rint((ring[:, 0] - Px[0, 0]) / dx).astype(int), 0, Px.shape[0] - 1)
    kk = np.clip(np.rint((ring[:, 1] - Pz[0, 0]) / dz).astype(int), 0, Px.shape[1] - 1)
    free = room[ii, kk]
    hit = mask_slice[ii, kk]
    lower = ring[:, 1] < c1[1]
    halves = [hit[free & h].mean() if (free & h).sum() >= 2 else 0.0 for h in (lower, ~lower)]
    enc = float(min(halves))
    if enc >= ENCASE_SHARE:
        grade = "4"
    elif past["lateral"] > 0:
        up, down = (lat & (Pz > c1[1])).sum(), (lat & (Pz < c1[1])).sum()
        grade = "3A" if up >= down else "3B"
    elif past["intercarotid"] > 0:
        grade = "2"
    elif past["medial"] > 0:
        grade = "1"
    else:
        grade = "0"
    return {"grade": grade, "pastMm": {k: round(v, 1) for k, v in past.items()}, "encasedShare": round(enc, 2)}


def knosp(man: list) -> dict:
    import skullbase_v3_cavernous as CAV
    cav = json.loads((GEN / "sbv3-cavernous.json").read_text())
    gr = Grid(ENDO.BOX, man)                  # the endonasal grid, on which the cavernous sinus was modelled
    assert gr.shape == tuple(np.load(ENDO.CS_COND)["R"].shape)
    sinus = {s: np.load(ENDO.CS_COND)[s].astype(np.float32) <= 0 for s in ("R", "L")}
    P = gr.P
    secs = {s: sections(gr, s) for s in ("R", "L")}
    hyp = np.vstack([nd["positions"] for nd in read_glb_full(V3_BUILD / "tb_adenohypophysis.glb").values()])
    gc = (hyp.min(0) + hyp.max(0)) / 2
    # the section nearest the hypophysis's middle where both arteries show well
    pick = {s: min([x for x in secs[s] if min(x["cavernous"]["area"], x["supraclinoid"]["area"]) >= KNOSP_WELL_MM2] or secs[s],
                   key=lambda x: abs(x["y"] - gc[1])) for s in ("R", "L")}
    lines = {s: knosp_lines(pick[s], s) for s in ("R", "L")}
    sec, y0 = pick["R"], pick["R"]["y"]
    c1, c2 = sec["cavernous"]["c"], sec["supraclinoid"]["c"]
    z_mid = float((c1[1] + sec["cavernous"]["r"] + c2[1] - sec["supraclinoid"]["r"]) / 2)
    ica = np.array(cav["carotid"]["R"]["line"])
    ica_r = np.array(cav["carotid"]["R"]["radius"])
    above = P[..., 2] > c1[1]            # (the compartments: above or below the cavernous carotid's centre on the section)
    art = gr.arteries()
    for s in ("R", "L"):     # the cavernous carotid as v3 traces it, with the label
        line = np.array(cav["carotid"][s]["line"])
        r = np.array(cav["carotid"][s]["radius"])
        d, i = cKDTree(line).query(P.reshape(-1, 3))
        art |= (d <= r[i]).reshape(gr.shape)
    nerves = gr.of(kinds=("nerve",))
    d_art, d_nerve = gr.dist(art), gr.dist(nerves)
    keep_out = gr.bone | (d_nerve <= NERVE_KEEP_MM)
    body = ellipsoid(P, (0.0, gc[1], gc[2] + ADENOMA_UP_MM), ADENOMA_AXES_MM)
    lobe = ellipsoid(P, (LOBE_AXES_MM[0] * 0.9, y0, z_mid), LOBE_AXES_MM)
    X, Z = P[..., 0], P[..., 2]
    left_cut = -X <= -line_x(lines["L"]["medial"], Z) - 0.8      # the left side: grade 0

    def reach_x(g: str):
        k, f = KNOSP_REACH[g]
        if g == "0":
            return line_x(lines["R"]["medial"], Z) + f
        nxt = {"medial": "intercarotid", "intercarotid": "lateral"}[k]
        return line_x(lines["R"][k], Z) + f * (line_x(lines["R"][nxt], Z) - line_x(lines["R"][k], Z))

    near_plane = np.abs(P[..., 1] - y0) <= KNOSP_SPAN_MM
    off_plane = np.abs(P[..., 1] - y0) >= KNOSP_OFF_MM
    lateral = X > line_x(lines["R"]["intercarotid"], Z)
    out, grades = {}, {}
    for g in ("0", "1", "2", "3A", "3B", "4"):
        base = g if g in KNOSP_REACH else "2"
        t = (body | (lobe if base != "0" else False)) & (X <= reach_x(base)) & ((X >= 0) | left_cut)
        if g in ("3A", "3B", "4"):
            # (3B: with the sinus lateral to the artery in front of and behind the section, the way down from the lobe; on
            # this CT the artery lies on the sphenoid's bone medially, leaving no way beneath it)
            comp = sinus["R"] & near_plane & {"3A": above, "3B": ~above | (lateral & off_plane), "4": True}[g]
            t |= comp
        keep = KNOSP_ENCASE_MM if g == "4" else VESSEL_KEEP_MM
        t = smoothed(t) & ~keep_out & (d_art > keep)
        t = largest(t)
        out[g] = t
        j = sec["j"]
        grades[g] = knosp_grade(t[:, j, :], P[:, j, :, 0], P[:, j, :, 2], sec, lines["R"], "R", ~keep_out[:, j, :] & (d_art[:, j, :] > keep))
        grades[g]["ml"] = round(float(t.sum()) * STEP ** 3 / 1000, 2)
        print("Knosp", g, grades[g])
    # the lines: in the plane, just behind it
    seg = []
    for k in ("medial", "intercarotid", "lateral"):
        a, b = (np.array([p[0], y0 - LINE_BEHIND_MM, p[1]]) for p in lines["R"][k])
        u = (b - a) / np.linalg.norm(b - a)
        seg.append(np.array([a - LINE_EXTEND_MM * u, b + LINE_EXTEND_MM * u]))
    report = {"planeY": round(y0, 2), "zMid": round(z_mid, 2),
              "sections": {s: {"y": round(pick[s]["y"], 2), **{k: {"c": np.round(pick[s][k]["c"], 2).tolist(), "r": round(pick[s][k]["r"], 2)}
                                                                for k in ("cavernous", "supraclinoid")}} for s in ("R", "L")},
              "lines": {k: [np.round(p, 2).tolist() for p in v] for k, v in zip(("medial", "intercarotid", "lateral"), seg)},
              "grades": grades, "carotidRadiusMm": round(float(np.median(ica_r)), 2)}
    return {"grid": gr, "masks": out, "lines": seg, "report": report}


def largest(mask: np.ndarray) -> np.ndarray:
    l, n = ndimage.label(mask)
    if n <= 1:
        return mask
    return l == (np.argmax(np.bincount(l.ravel())[1:]) + 1)


# ---------------------------------------------------------------- the push
def push(parts: dict, tumour: np.ndarray, gr: Grid, still: np.ndarray, label: str, way=None) -> dict:
    """Move the parts' points out of the tumour (see the module's notes). parts: {key: {"P": rest positions, "group"}};
    still: what they may not be pushed into (bone, what stays); a tumour that grows one way (way: a unit vector, away
    from where it arises) pushes the points inside it that way, out through its far side (so that pushes on either side
    of a part do not cancel, and the tumour's near side stays open as it does in life); what that leaves in bone is
    pushed out of it as before. Returns {key: displacement} and a report."""
    blocked = tumour | still
    dep, near = ndimage.distance_transform_edt(blocked, sampling=STEP, return_indices=True)
    keys = list(parts)
    X0 = np.vstack([parts[k]["P"] for k in keys])
    cut = np.cumsum([0] + [len(parts[k]["P"]) for k in keys])
    group = np.concatenate([np.full(len(parts[k]["P"]), parts[k]["group"]) for k in keys])

    def look(X):
        ijk = np.rint((X - gr.lo) / STEP).astype(int)
        ok = np.all((ijk >= 0) & (ijk < np.array(gr.shape)), 1)
        ins, blk = np.zeros(len(X), bool), np.zeros(len(X), bool)
        ins[ok] = tumour[tuple(ijk[ok].T)]
        blk[ok] = blocked[tuple(ijk[ok].T)]
        D = np.zeros_like(X)
        idx = np.nonzero(blk)[0]
        if len(idx):
            q = ijk[idx]
            out = gr.lo + STEP * near[(slice(None),) + tuple(q.T)].T
            v = out - X[idx]
            ln = np.linalg.norm(v, axis=1, keepdims=True)
            D[idx] = v / np.maximum(ln, 1e-6) * (ln + PUSH_GAP_MM)
        if way is not None:
            idx = np.nonzero(ins)[0]
            if len(idx):
                out_at = np.full(len(idx), np.nan)
                for t in np.arange(STEP, PUSH_REACH_MM, STEP):
                    q = np.rint((X[idx] + t * way - gr.lo) / STEP).astype(int)
                    okq = np.all((q >= 0) & (q < np.array(gr.shape)), 1)
                    inside_t = np.zeros(len(idx), bool)
                    inside_t[okq] = tumour[tuple(q[okq].T)]
                    newly = np.isnan(out_at) & ~inside_t
                    out_at[newly] = t
                    if not np.isnan(out_at).any():
                        break
                out_at = np.nan_to_num(out_at, nan=PUSH_REACH_MM)
                D[idx] = way[None] * (out_at + PUSH_GAP_MM)[:, None]
        return ins, blk, D

    ins0, blk0, _ = look(X0)
    started_still = blk0 & ~ins0             # points already in bone (or what stays): left there unless the tumour moves them

    def spread(X, D):
        out = np.zeros_like(X)
        for g in np.unique(group):
            idx = np.nonzero(group == g)[0]
            src = idx[np.abs(D[idx]).sum(1) > 0]
            if not len(src):
                continue
            nb = cKDTree(X[src]).query_ball_point(X[idx], 3 * PUSH_SIGMA_MM)
            rows = np.repeat(np.arange(len(idx)), [len(n) for n in nb])
            cols = np.concatenate([np.asarray(n, int) for n in nb])
            w = np.exp(-((X[idx][rows] - X[src][cols]) ** 2).sum(1) / (2 * PUSH_SIGMA_MM ** 2))
            num = np.zeros((len(idx), 3))
            np.add.at(num, rows, w[:, None] * D[src][cols])
            out[idx] = num / np.maximum(np.bincount(rows, w, len(idx)), 1.0)[:, None]
        return out
    X = X0.copy()
    n0 = int(ins0.sum())
    rounds = 0
    for rounds in range(1, PUSH_ROUNDS + 1):
        ins, blk, D = look(X)
        D[started_still & ~ins] = 0
        if not (np.abs(D).sum(1) > 0).any():
            break
        X = X + spread(X, D)
    ins, blk, _ = look(X)
    moved = np.linalg.norm(X - X0, axis=1)
    rep = {"pointsInside": n0, "leftInside": int(ins.sum()), "rounds": rounds, "maxMovedMm": round(float(moved.max()), 2)}
    print("  push", label, rep)
    return {"D": {k: X[cut[i]:cut[i + 1]] - X0[cut[i]:cut[i + 1]] for i, k in enumerate(keys)}, "report": rep}


# ---------------------------------------------------------------- Koos and the meningiomas
def landmark(name: str, side: str | None = None) -> np.ndarray:
    for l in json.loads((GEN / "sbv3-landmarks.json").read_text()):
        if l["name"] == name and (side is None or l.get("side") == side):
            return np.array(l["ras"])
    raise KeyError(name)


def seg_dist(P: np.ndarray, a: np.ndarray, b: np.ndarray) -> np.ndarray:
    ab = b - a
    t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[..., None] * ab), axis=-1)


def koos(man: list) -> dict:
    fundus, porus = landmark("Fundus of internal acoustic meatus", "R"), landmark("Internal acoustic meatus", "R")
    axis = (porus - fundus) / np.linalg.norm(porus - fundus)
    lo = np.minimum(fundus, porus) - np.array([34.0, 34.0, 30.0])
    hi = np.maximum(fundus, porus) + np.array([6.0, 26.0, 26.0])
    gr = Grid(box_round(lo, hi), man)
    P = gr.P
    stem = gr.of(names=STEM, sides=("R",))
    brain_ = gr.of(kinds=("brain",), sides=("R",))
    art = gr.arteries()
    d_bone, d_stem = gr.dist(gr.bone), gr.dist(stem)
    out_bone = ~gr.bone
    along = (P - fundus) @ axis
    canal = (seg_dist(P, fundus, porus + PORUS_PAST_MM * axis) <= CANAL_MM) & out_bone & (along >= -0.5) & (((P - porus) @ axis) <= PORUS_PAST_MM)
    l, _ = ndimage.label(canal)
    mid = l[gr.at((fundus + porus) / 2)]
    canal = l == mid if mid else largest(canal)
    keep = gr.dist(art) <= VESSEL_KEEP_MM      # (the nerves are moved round it: displaced_nerves)
    out, rep, ways = {"1": smoothed(canal) & ~gr.bone & ~keep}, {}, {}
    rep["1"] = {"ml": round(float(out["1"].sum()) * STEP ** 3 / 1000, 2), "canalMm": round(float(np.linalg.norm(porus - fundus)), 1)}
    # the ball's centre: searched on a 1 mm lattice of open points in the posterior fossa (not in the cerebrum)
    # the posterior fossa's intradural space: the fitted cerebellum and brainstem and the cisterns round them
    fossa = ndimage.binary_dilation(gr.of(kinds=("hindbrain", "ventricle")), iterations=int(round(KOOS_CISTERN_MM / STEP))) & ~gr.bone & ~brain_
    cand = fossa
    sub = np.zeros_like(cand)
    sub[::2, ::2, ::2] = cand[::2, ::2, ::2]
    C = P[sub]
    dC_bone, dC_stem = d_bone[sub], d_stem[sub]
    side_ok = ((C - porus) @ axis) >= -KOOS_BEHIND_PORUS_MM
    d_brain = cKDTree(P[brain_]).query(C)[0] if brain_.any() else np.full(len(C), 99.0)
    to_porus = np.linalg.norm(C - porus, axis=1)

    def feasible(g, R):
        ok = (to_porus <= R + KOOS_PORUS_OUT_MM) & (to_porus >= R - KOOS_NECK_MM) & side_ok & (C[:, 0] >= porus[0] - KOOS_MEDIAL_MM) & (np.abs(C[:, 2] - porus[2]) <= KOOS_LEVEL_MM) & (dC_bone >= KOOS_OPEN * R) & (d_brain >= R * KOOS_BELOW_TENTORIUM)
        if g == "2":
            ok &= dC_stem >= R + KOOS_CLEAR_MM
        elif g == "3":
            ok &= (dC_stem >= R - KOOS_MOULD_MM) & (dC_stem <= R + 0.5)
        else:
            ok &= (dC_stem <= R - KOOS_INTO_MM[0]) & (dC_stem >= R - KOOS_INTO_MM[1])
        return ok
    for g, dias in KOOS_DIAMETER_MM.items():
        # the centre that keeps it furthest off the brainstem (II: the largest that stays off it; III and IV: the least far
        # into where it lies, within their windows)
        best = None
        for dia in dias:
            R = dia / 2
            ok = feasible(g, R)
            if not ok.any():
                continue
            i = int(np.argmax(np.where(ok, dC_stem, -1e9)))
            score = (R, dC_stem[i] - R)
            if best is None or score > best[0]:
                best = (score, R, i)
        if best is None:
            R = dias[len(dias) // 2] / 2
            parts_ = {"porus": to_porus <= R + KOOS_PORUS_OUT_MM, "side": side_ok, "level": np.abs(C[:, 2] - porus[2]) <= KOOS_LEVEL_MM,
                      "brain": d_brain >= R * KOOS_BELOW_TENTORIUM}
            base = np.all(list(parts_.values()), 0)
            print({k: int(v.sum()) for k, v in parts_.items()}, "all", int(base.sum()), "stem-R range", (dC_stem[base] - R).min() if base.any() else None, (dC_stem[base] - R).max() if base.any() else None)
            raise RuntimeError(f"Koos {g}: no centre meets the rules")
        _, R, i = best
        dia = 2 * R
        c = C[i]
        neck = (seg_dist(P, porus, c) <= KOOS_NECK_MM) & ball(P, porus, R)
        t = ((ball(P, c, R) | neck) & fossa | canal) & ~gr.bone & ~brain_
        if g in ("2", "3"):
            t &= ~stem
        t = smoothed(t) & ~gr.bone & ~keep
        if g in ("2", "3"):
            t &= ~stem
        t = largest(t)
        out[g] = t
        extra = t & ~canal & (((P - porus) @ axis) > 0)
        pts = P[extra]
        a_, b_ = pts[::max(1, len(pts) // 3000)], pts[::max(1, len(pts) // 400)]
        diam = float(np.max(np.linalg.norm(a_[:, None] - b_[None], axis=-1))) if len(pts) else 0.0
        ways[g] = (c - porus) / np.linalg.norm(c - porus)     # (it grows out of the meatus: what it meets is pushed on, away from it)
        rep[g] = {"centre": np.round(c, 2).tolist(), "diameterMm": dia, "extrameatalMaxMm": round(diam, 1),
                  "toBrainstemMm": round(float(dC_stem[i] - R), 1), "fromBoneMm": round(float(dC_bone[i]), 1),
                  "ml": round(float(t.sum()) * STEP ** 3 / 1000, 2)}
        print("Koos", g, rep[g])
    return {"grid": gr, "masks": out, "report": rep, "ways": ways, "porus": porus, "axis": axis}


def meningioma_site(site: str, gr: Grid) -> np.ndarray:
    """Where each meningioma sits on the dura: a point on the bone's surface (the dura over it)."""
    cav = json.loads((GEN / "sbv3-cavernous.json").read_text())
    if site == "olfactory":     # the olfactory groove: the midline between the foramen caecum and the sphenoidal yoke
        p = (landmark("Foramen caecum of frontal bone") * 0.45 + landmark("Sphenoidal yoke") * 0.55) * np.array([0, 1, 1])
        down = np.array([0.0, 0.0, -1.0])
    elif site == "tuberculum":
        p = landmark("Tuberculum sellae") * np.array([0, 1, 1])
        down = np.array([0.0, 0.25, -1.0])
    elif site == "petroclival":     # between the petrous apex and the jugular foramen, along the petroclival fissure
        apex, jug = np.array(cav["landmarks"]["R"]["petrousApex"]), landmark("Jugular foramen", "R")
        p = apex + 0.35 * (jug - apex) + np.array([-3.0, 0.0, 0.0])
        down = np.array([0.0, 1.0, 0.0])
    else:                           # the foramen magnum's anterolateral rim on the right, in front of the hypoglossal canal
        fm, hc = landmark("Foramen magnum"), landmark("Hypoglossal canal", "R")
        p = fm + 0.45 * (hc - fm) + np.array([0.0, 4.0, 0.0])
        down = np.array([0.0, 1.0, -0.3])
    down = down / np.linalg.norm(down)
    # walk towards the bone until it is reached
    q = p - 15 * down
    for _ in range(120):
        if gr.bone[gr.at(q)]:
            break
        q = q + 0.25 * down
    return q


def meningioma(site: str, man: list) -> dict:
    name, kinds = SITE[site]
    R = MENINGIOMA_MM[site] / 2
    rough = {"olfactory": [0, 26, 18], "tuberculum": [0, 7, 10], "petroclival": [12, -14, -12], "foramen_magnum": [7, -24, -36]}[site]
    gr = Grid(box_round(np.array(rough) - 36, np.array(rough) + 36), man)
    P = gr.P
    s = meningioma_site(site, gr)
    d_bone = gr.dist(gr.bone)
    # the centre off the bone along its distance's rise (the way out of the bone at the site)
    gz = np.gradient(ndimage.gaussian_filter(d_bone, 2.0), STEP)
    n = np.array([g[gr.at(s)] for g in gz])
    if site in ("olfactory", "tuberculum"):      # (a midline site: straight up from it, in the midline plane)
        n[0] = 0.0
    if site == "foramen_magnum":                 # (beside the medulla at the foramen's level, not down into the canal)
        n[2] = max(n[2], 0.0)
    n = n / (np.linalg.norm(n) + 1e-9)
    c = s + n * R * MENINGIOMA_RISE
    for _ in range(40):           # (out of the bone if the gradient's way crosses some)
        if d_bone[gr.at(c)] >= R * MENINGIOMA_RISE * 0.8:
            break
        c = c + 0.5 * n
    art = gr.arteries()
    nerves = gr.of(kinds=("nerve",))
    keep = (gr.dist(art) <= VESSEL_KEEP_MM) | (gr.dist(nerves) <= NERVE_KEEP_MM)
    # inside the dura: within MENINGIOMA_INTRADURAL_MM of the fitted brain (the cisterns round it), not bone
    brain_all = gr.of(kinds=("brain", "hindbrain", "ventricle"))
    # and on the brain's side of the plane through the site square to its way out (not round the bone's edge)
    dural = (gr.dist(brain_all) <= MENINGIOMA_INTRADURAL_MM[site]) & ~gr.bone & (((P - s) @ n) >= -1.0)
    t = ball(P, c, R) & dural
    t = largest(smoothed(t) & dural & ~keep)
    rep = {"site": np.round(s, 2).tolist(), "centre": np.round(c, 2).tolist(), "diameterRuleMm": MENINGIOMA_MM[site],
           "ml": round(float(t.sum()) * STEP ** 3 / 1000, 2), "normal": np.round(n, 2).tolist()}
    print("meningioma", site, rep)
    return {"grid": gr, "mask": t, "report": rep, "kinds": kinds, "way": n}


# ---------------------------------------------------------------- items
def item_of(sid, name, colour, category, derivation, nodes, cent, extra=None) -> dict:
    write_glb(V3_BUILD / f"{sid}.glb", nodes, {"id": sid})
    return {"id": sid, "name": name, "aliases": [], "type": "soft", "file": f"assets/skullbase-v3/{sid}.glb", "bytes": 0,
            "colour": colour, "dataset": "rule", "source": "Drawn by rule on the TopBrain CT",
            "licence": "GPL-3.0 (the project's own drawing, on the TopBrain CT)", "citation": [], "citationUrls": [], "refIds": [],
            "category": category, "schematic": True, "derivation": derivation, "centroid": cent, **(extra or {})}


def nodes_of(m: trimesh.Trimesh, split: bool) -> tuple[list, dict]:
    import skullbase_build as SB
    V, T = np.asarray(m.vertices), np.asarray(m.faces)
    if split:
        halves = SB.mesh_split(V, T, np.ones(len(V)))
        parts = {s: (v, t) for s, (v, t, _) in halves.items()}
    else:
        parts = {"R" if V[:, 0].mean() >= 0 else "L": (V, T)}
    nodes = [{"name": s, "positions": v, "normals": SB.normals(v, t), "indices": t, "mode": TRIANGLES} for s, (v, t) in sorted(parts.items())]
    cent = {s: v.mean(0).round(2).tolist() for s, (v, t) in parts.items()}
    for s in ("L", "R"):          # (the manifest gives both sides; a one-sided tumour's other side is its own)
        cent.setdefault(s, next(iter(cent.values())))
    return nodes, cent


def pushed_copies(view: str, tag: str, tumour: np.ndarray, gr: Grid, man: list, kinds: tuple, still_extra: np.ndarray | None,
                  names_moving: tuple = (), way=None, names_still: tuple = ()) -> tuple[list, dict]:
    """The parts of the fitted brain the tumour reaches, pushed out of it, as copies for its view."""
    hemi = VIEWS[view]["hemi"]
    sides = ("L", "R") if hemi == "both" else (hemi,)
    keep_targets = set(VIEWS[view]["morphs"])
    hi = gr.lo + STEP * (np.array(gr.shape) - 1)
    tb = gr.P[tumour]
    tlo, thi = tb.min(0) - PUSH_MARGIN_MM, tb.max(0) + PUSH_MARGIN_MM
    parts, src = {}, {}
    for it in man:
        if not (it.get("category") in kinds or it["name"] in names_moving) or it.get("pushedFrom") or it["name"] in names_still:
            continue
        nodes = read_glb_full(file_of(it))
        for s, nd in nodes.items():
            if s not in sides:
                continue
            V = nd["positions"]
            if not np.any(np.all((V > tlo) & (V < thi), 1)):
                continue
            group = {"brain": 0, "hindbrain": 1 if it["name"] not in STEM else 2, "ventricle": 2}.get(it.get("category"), 3 + len(parts))
            parts[(it["id"], s)] = {"P": V, "group": group}
            src[it["id"]] = (it, nodes)
    if not parts:
        return [], {}
    still = gr.bone.copy() if still_extra is None else gr.bone | still_extra
    res = push(parts, tumour, gr, still, tag, way)
    items = []
    for sid, (it, nodes) in src.items():
        moved = max(float(np.abs(res["D"][(sid, s)]).max()) for s in nodes if (sid, s) in res["D"])
        if moved < 0.05:
            continue
        out = []
        cent = dict(it["centroid"])
        for s, nd in nodes.items():
            if s not in sides:
                continue
            V = nd["positions"] + res["D"].get((sid, s), 0)
            node = {"name": s, "positions": V, "normals": trimesh.Trimesh(V, nd["indices"], process=False).vertex_normals,
                    "indices": nd["indices"], "mode": TRIANGLES}
            tg = [t for t in nd["targets"] if t["name"] in keep_targets]
            if tg:
                node["targets"] = [{"name": t["name"], "positions": t["positions"],
                                    "normals": t["normals"] if t["normals"] is not None else np.zeros_like(V)} for t in tg]
            out.append(node)
            cent[s] = V.mean(0).round(2).tolist()
        nid = f"{sid}__{tag}"
        write_glb(V3_BUILD / f"{nid}.glb", out, {"id": nid})
        items.append({**{k: v for k, v in it.items() if k not in ("clearedFrom", "joinedFrom")}, "id": nid, "file": f"assets/skullbase-v3/{nid}.glb",
                      "bytes": 0, "replaces": sid, "pushedFrom": it["file"], "tumourView": tag, "centroid": cent,
                      "derivation": it["derivation"].rstrip() + f" Pushed aside by the tumour drawn in this view (skullbase_v3_tumours.py; at most "
                      f"{res['report']['maxMovedMm']} mm): a shape, not a simulation of the tissue."})
    return items, res["report"]


# ---------------------------------------------------------------- the nerves round a vestibular schwannoma
NERVE_GAP_MM = 0.3          # a nerve moved round a tumour lies this far off its surface (beyond its own radius)
NERVE_SIGMA_MM = 2.5        # the move spread along the nerve (Gaussian of arc length): it drapes, it does not kink
NERVE_ROUNDS = 40
FACIAL_WAY = np.array([0.0, 1.0, 0.0])    # the facial nerve moved forwards, onto the tumour's anterior surface (Choi 2014)
FLAT = {"3": (1.8, 0.45), "4": (2.2, 0.35)}   # (III, IV) where it lies on the tumour, the facial nerve drawn this much
#                             wider and thinner (a band; Starnoni 2020: the nerve thinned over large tumours; illustrative)
MOVED_NERVES = ("Facial nerve (VII)", "Trigeminal nerve (V)", "Abducens nerve (VI)", "Glossopharyngeal nerve (IX)", "Vagus nerve (X)",
                "Accessory nerve (XI)", "Anterior inferior cerebellar artery", "Superior cerebellar artery (fitted course)",
                "Posterior inferior cerebellar artery (fitted course)")


def tube_part(V: np.ndarray):
    """The tube (skullbase_build.tube: rings of 6 or 8, then two caps) at the end of a node's vertices: (first vertex,
    centre line, radius), or None. A routed nerve is all tube; the facial nerve is the specimen's mesh, its routed
    cisternal tube after it. The longest run of regular rings that ends where the caps begin."""
    for sides in (8, 6):
        for n in range((len(V) - 2 * (sides + 1)) // sides, 2, -1):
            s0 = len(V) - n * sides - 2 * (sides + 1)
            ring = V[s0:s0 + n * sides].reshape(n, sides, 3)
            c = ring.mean(1)
            rr = np.linalg.norm(ring - c[:, None], axis=2)
            if rr.std(1).max() <= 0.05 * max(float(rr.mean()), 0.1) and np.linalg.norm(np.diff(c, axis=0), axis=1).max() < 2.0:
                return s0, c, rr.mean(1)
    return None


def flat_tube(P: np.ndarray, a: np.ndarray, b: np.ndarray, up: np.ndarray):
    """A tube whose cross-section is an ellipse: a across (square to `up`), b along `up` (per point)."""
    import skullbase_build as SB
    v, n_, t = SB.tube(np.c_[P, np.ones(len(P))])     # (its rings, resampled)
    sides = 8
    Q = SB.resample(np.c_[P, a, b, up])
    C, A, Bb, U = Q[:, :3], Q[:, 3], Q[:, 4], Q[:, 5:8]
    T = np.gradient(C, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    U = U - (U * T).sum(1, keepdims=True) * T
    U /= np.linalg.norm(U, axis=1, keepdims=True) + 1e-12
    X = np.cross(T, U)
    ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    pos = (C[:, None] + A[:, None, None] * np.cos(ang)[None, :, None] * X[:, None] + Bb[:, None, None] * np.sin(ang)[None, :, None] * U[:, None]).reshape(-1, 3)
    tris = []
    for i in range(len(C) - 1):
        for k in range(sides):
            a0, a1 = i * sides + k, i * sides + (k + 1) % sides
            tris += [[a0, a1, a0 + sides], [a1, a1 + sides, a0 + sides]]
    caps, base = [], len(pos)
    for end, sg in ((0, -1), (len(C) - 1, 1)):
        c = base + len(caps)
        caps.append(C[end])
        for k in range(sides):
            caps.append(pos[end * sides + k])
        for k in range(sides):
            u, w = c + 1 + k, c + 1 + (k + 1) % sides
            tris.append([c, w, u] if sg < 0 else [c, u, w])
    V = np.vstack([pos, caps])
    T_ = np.array(tris)
    m = trimesh.Trimesh(V, T_, process=False)
    if m.volume < 0:
        T_ = T_[:, ::-1]
    return V, SB.normals(V, T_), T_


def displaced_nerves(g: str, tumour: np.ndarray, gr: Grid, man: list, porus: np.ndarray, axis: np.ndarray) -> tuple[list, dict]:
    """The nerves and fitted arteries of the angle moved round the schwannoma (for its view): each centre-line point
    inside it (less than its radius and NERVE_GAP_MM off it), beyond the porus, pushed out (the facial nerve forwards,
    FACIAL_WAY, onto its anterior surface; the others the shortest way out), the move spread along the nerve, for up to
    NERVE_ROUNDS rounds; points in the meatus and away from the tumour stay. Where it lies on a grade III or IV tumour,
    the facial nerve is drawn as a flattened band (FLAT). The vestibulocochlear nerve, from which the tumour grows, runs
    into it as before."""
    import skullbase_build as SB
    sd = ENDO.signed(tumour, STEP).astype(np.float32)
    grad = [ndimage.gaussian_filter(x, 1.0) for x in np.gradient(sd, STEP)]
    bone_d = gr.dist(gr.bone)

    def sample(F, X):
        ijk = (X - gr.lo) / STEP
        return ndimage.map_coordinates(F, ijk.T, order=1, mode="nearest")
    items, rep = [], {}
    for it in man:
        if it["name"] not in MOVED_NERVES or it.get("pushedFrom"):
            continue
        nodes = read_glb_full(file_of(it))
        if "R" not in nodes:
            continue
        nd = nodes["R"]
        tp = tube_part(nd["positions"])
        if tp is None:
            continue
        s0, C, R = tp
        arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
        W = np.exp(-((arc[:, None] - arc[None]) ** 2) / (2 * NERVE_SIGMA_MM ** 2))
        out_canal = ((C - porus) @ axis) > 0.5
        X = C.copy()
        facial = it["name"] == "Facial nerve (VII)"
        moved0 = None
        for _ in range(NERVE_ROUNDS):
            depth = R + NERVE_GAP_MM - sample(sd, X)          # > 0: inside, or too close
            need = (depth > 0) & out_canal
            if moved0 is None:
                moved0 = int(need.sum())
            if not need.any():
                break
            D = np.zeros_like(X)
            if facial:
                # forwards until clear of the tumour (or, where bone comes first, the shortest way out)
                for i in np.nonzero(need)[0]:
                    for t in np.arange(0.5, 40.0, 0.5):
                        q = X[i] + t * FACIAL_WAY
                        if sample(sd, q[None])[0] >= R[i] + NERVE_GAP_MM:
                            D[i] = q - X[i]
                            break
                        if sample(bone_d, q[None])[0] < R[i]:
                            gv = np.array([sample(gg, X[i][None])[0] for gg in grad])
                            D[i] = gv / (np.linalg.norm(gv) + 1e-9) * depth[i]
                            break
            else:
                gv = np.stack([sample(gg, X[need]) for gg in grad], 1)
                D[need] = gv / (np.linalg.norm(gv, axis=1, keepdims=True) + 1e-9) * (depth[need] + 0.1)[:, None]
            # spread along the nerve (a normalised Gaussian: an isolated push keeps its size)
            w = W[:, need]
            step_ = (w @ D[need]) / np.maximum(w.sum(1, keepdims=True), 1.0)
            step_[~out_canal] = 0
            X = X + step_
        moved = np.linalg.norm(X - C, axis=1)
        if moved.max() < 0.2:
            continue
        left = int(((R + NERVE_GAP_MM - sample(sd, X) > 0.05) & out_canal).sum())
        # the facial nerve on a large tumour: a flattened band where it lies on it
        if facial and g in FLAT:
            on = np.clip(moved / max(moved.max(), 1e-6) * 2.0, 0, 1)
            on = np.convolve(on, np.ones(5) / 5, mode="same")
            a = R * (1 + (FLAT[g][0] - 1) * on)
            b = R * (1 + (FLAT[g][1] - 1) * on)
            up = np.stack([sample(gg, X) for gg in grad], 1)
            v, n_, t = flat_tube(X, a, b, up)
        else:
            v, n_, t = SB.tube(np.c_[X, R])
        keepV = nd["positions"][:s0]
        keepT = nd["indices"][(nd["indices"] < s0).all(1)]
        V = np.vstack([keepV, v])
        T = np.vstack([keepT, t + len(keepV)]) if len(keepV) else t
        node_R = {"name": "R", "positions": V, "normals": SB.normals(V, T), "indices": T, "mode": TRIANGLES}
        nid = f"{it['id']}__koos_{g}"
        write_glb(V3_BUILD / f"{nid}.glb", [node_R], {"id": nid})
        what = ("moved forwards round it onto its anterior surface (Choi 2014: there in 5 of 11 tumours at surgery, anteroinferior in 3, "
                "anterosuperior in 2, posteroinferior in 1)" + (", drawn thinned and flattened where it lies on it (Starnoni 2020: the nerve "
                "thins over large tumours; the band's shape illustrative)" if g in FLAT else "") if facial else "moved the shortest way out of it, onto its surface")
        cent = dict(it["centroid"])
        cent["R"] = V.mean(0).round(2).tolist()
        items.append({**{k: v_ for k, v_ in it.items() if k not in ("clearedFrom", "joinedFrom")}, "id": nid,
                      "file": f"assets/skullbase-v3/{nid}.glb", "bytes": 0, "replaces": it["id"], "pushedFrom": it["file"],
                      "tumourView": f"koos_{g}", "centroid": cent,
                      "derivation": it["derivation"].rstrip() + f" In this view, where it ran through the vestibular schwannoma drawn here it is "
                      f"{what} (skullbase_v3_tumours.py; at most {moved.max():.1f} mm), its course in the meatus kept: a shape, not a simulation."})
        rep[it["name"]] = {"pointsInside": moved0, "leftInside": left, "maxMovedMm": round(float(moved.max()), 1)}
    print("  nerves koos", g, rep)
    return items, rep


def main() -> int:
    import skullbase_v3 as V3
    man = json.loads((GEN / "sbv3-manifest.json").read_text())["structures"]
    man = [it for it in man if not (it["id"].startswith("tm_") or it.get("tumourView"))]
    for f in V3_BUILD.glob("tm_*.glb"):
        f.unlink()
    for f in [*V3_BUILD.glob("*__koos_*.glb"), *V3_BUILD.glob("*__men_*.glb")]:
        f.unlink()
    col = V3.colour("sbTumour")
    items, report = [], {}

    # ---- Knosp
    K = knosp(man)
    report["knosp"] = K["report"]
    gr = K["grid"]
    for g, mask in K["masks"].items():
        nodes, cent = nodes_of(to_mesh(mask, gr.a), split=True)
        items.append(item_of(f"tm_knosp_{g.lower()}", f"Pituitary adenoma (Knosp {g})", col, "tumour",
                             f"Drawn by rule to show Knosp grade {g} on the right (skullbase_v3_tumours.py), not a patient's tumour: "
                             + KNOSP_HOW[g] + f" {K['report']['grades'][g]['ml']} ml.", nodes, cent,
                             {"tumour": {"family": "knosp", "grade": g}}))
    import skullbase_v3_cavernous as CAV
    vv, nn, tt, off = [], [], [], 0
    sec_r = K["report"]["sections"]["R"]
    yl = K["report"]["planeY"] - LINE_BEHIND_MM
    rings = []
    for k in ("cavernous", "supraclinoid"):     # each artery's cross-section as the circle the lines are drawn from
        (cx, cz), r = sec_r[k]["c"], sec_r[k]["r"]
        a = np.linspace(0, 2 * np.pi, 49)
        rings.append(np.c_[cx + r * np.cos(a), np.full(len(a), yl), cz + r * np.sin(a)])
    for seg in [np.linspace(sg[0], sg[1], 12) for sg in K["lines"]] + rings:
        v, n_, t = CAV.tube(seg, LINE_R_MM)
        vv.append(v); nn.append(n_); tt.append(t + off); off += len(v)
    V = np.vstack(vv)
    items.append(item_of("tm_knosp_lines", "Knosp lines", V3.colour("sbGuide"), "guide",
                         "Drawn on the coronal section through this CT's own cavernous and supraclinoid carotid (TopBrain's label; the plane "
                         f"{K['report']['planeY']} mm in front of the hypophysial fossa, where the label shows both and each is largest): "
                         "the medial tangent along both arteries' medial walls, the intercarotid line through their centres and the lateral "
                         "tangent along their lateral walls, each cross-section taken as a circle of its area (the two circles drawn).",
                         [{"name": "R", "positions": V, "normals": np.vstack(nn), "indices": np.vstack(tt), "mode": TRIANGLES}],
                         {"R": V.mean(0).round(2).tolist(), "L": V.mean(0).round(2).tolist()}))

    # ---- Koos
    Q = koos(man)
    report["koos"] = Q["report"]
    gr = Q["grid"]
    stem = gr.of(names=STEM, sides=("R",))
    for g, mask in Q["masks"].items():
        roman = {"1": "I", "2": "II", "3": "III", "4": "IV"}[g]
        nodes, cent = nodes_of(to_mesh(mask, gr.a), split=False)
        sid = f"tm_koos_{g}"
        items.append(item_of(sid, f"Vestibular schwannoma (Koos {roman})", col, "tumour",
                             f"Drawn by rule to show Koos grade {roman} on the right (skullbase_v3_tumours.py), not a patient's tumour: "
                             + KOOS_HOW[g].replace("{d}", f"{Q['report'][g].get('diameterMm', 0):g}") + f" {Q['report'][g]['ml']} ml.", nodes, cent, {"tumour": {"family": "koos", "grade": roman}}))
        if g != "1":
            cp, rp = pushed_copies("koos", f"koos_{g}", mask, gr, man, ("hindbrain", "ventricle"), stem if g in ("2", "3") else None,
                                   way=Q["ways"][g], names_still=STEM + ("Fourth ventricle",) if g in ("2", "3") else ())
            items += cp
            Q["report"][g]["push"] = rp
            dn, rn = displaced_nerves(g, mask, gr, man, Q["porus"], Q["axis"])
            items += dn
            Q["report"][g]["nerves"] = rn

    # ---- meningiomas
    report["meningioma"] = {}
    for site in SITE:
        M = meningioma(site, man)
        gr = M["grid"]
        nodes, cent = nodes_of(to_mesh(M["mask"], gr.a), split=M["report"]["centre"][0] ** 2 < 25)
        items.append(item_of(f"tm_men_{site}", SITE[site][0], col, "tumour",
                             f"Drawn by rule (skullbase_v3_tumours.py), not a patient's tumour: {MENINGIOMA_HOW[site]} A ball "
                             f"{MENINGIOMA_MM[site]:g} mm across (an illustrative size), its centre {MENINGIOMA_RISE:g} of its radius off the bone, "
                             f"so that the bone cuts it to a broad base on the dura; kept {VESSEL_KEEP_MM} mm off this CT's arteries and "
                             f"{NERVE_KEEP_MM} mm off the cranial nerves' routes, which run through it in channels. {M['report']['ml']} ml.",
                             nodes, cent, {"tumour": {"family": "meningioma", "grade": site}}))
        moving = ("Optic nerve (II)", "Optic chiasm") if site == "tuberculum" else ()
        kinds = tuple(k for k in M["kinds"] if k != "optic")
        cp, rp = pushed_copies(site, f"men_{site}", M["mask"], gr, man, kinds, None, moving, M["way"])
        items += cp
        M["report"]["push"] = rp
        report["meningioma"][site] = M["report"]

    TM_ITEMS.write_text(json.dumps(items, indent=1, ensure_ascii=False))
    OUT_JSON.write_text(json.dumps(report, indent=1))
    merge()
    print("written", len(items), "items;", OUT_JSON.name)
    return 0


def merge() -> None:
    """The tumours' items into v3's manifest (skullbase_v3_endonasal.carry_sellar does this too when it is run again)."""
    p = GEN / "sbv3-manifest.json"
    m = json.loads(p.read_text())
    new = json.loads(TM_ITEMS.read_text()) if TM_ITEMS.exists() else []
    for it in new:
        f = REPO / "public" / it["file"]
        if f.exists():
            it["bytes"] = f.stat().st_size
    ids = {it["id"] for it in new}
    m["structures"] = [s for s in m["structures"] if s["id"] not in ids and not s["id"].startswith("tm_") and not s.get("tumourView")] + new
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))


def check(structures: list) -> list[tuple[bool, str]]:
    """For skullbase_v3.validate: each tumour drawn and graded as it is meant to be; each pushed copy's part present."""
    out = []
    if not OUT_JSON.exists():
        return [(False, "sbv3-tumours.json missing")]
    rep = json.loads(OUT_JSON.read_text())
    for g, r in rep["knosp"]["grades"].items():
        out.append((r["grade"] == g, f"Knosp {g}: the drawing grades as {r['grade']}"))
    for g, r in rep["koos"].items():
        if g == "1":
            continue
        out.append((r["extrameatalMaxMm"] < 20 if g == "2" else r["extrameatalMaxMm"] < 30 if g == "3" else r["extrameatalMaxMm"] > 30,
                    f"Koos {g}: {r['extrameatalMaxMm']} mm outside the meatus"))
        out.append((r["push"].get("leftInside", 0) <= 20, f"Koos {g}: {r['push'].get('leftInside')} points left inside"))
    for site, r in rep["meningioma"].items():
        out.append((r.get("push", {}).get("leftInside", 0) <= 20, f"{site}: {r.get('push', {}).get('leftInside')} points left inside"))
    ids = {s["id"] for s in structures}
    for s in structures:
        if s.get("replaces"):
            out.append((s["replaces"] in ids, f"{s['id']}: replaces a missing {s['replaces']}"))
    return out


KNOSP_HOW = {
    "0": "an ellipsoid over the sella, kept medial to the medial tangent.",
    "1": "an ellipsoid over the sella and a lobe towards the right cavernous sinus at the level between the two arteries, cut back "
         "past the medial tangent but short of the intercarotid line.",
    "2": "an ellipsoid over the sella and a lobe towards the right cavernous sinus, cut back past the intercarotid line but short of "
         "the lateral tangent.",
    "3A": "grade 2's shape with the right cavernous sinus as modelled here added above the cavernous carotid (its superior "
          f"compartment), within {KNOSP_SPAN_MM:g} mm of the section: lateral to the lateral tangent, above the artery.",
    "3B": "grade 2's shape with the right cavernous sinus as modelled here added below the cavernous carotid (its inferior "
          f"compartment), within {KNOSP_SPAN_MM:g} mm of the section: lateral to the lateral tangent, below the artery.",
    "4": f"grade 2's shape with the whole right cavernous sinus as modelled here added within {KNOSP_SPAN_MM:g} mm of the section, so "
         "that it surrounds the cavernous carotid.",
}
KOOS_HOW = {
    "1": f"the internal acoustic meatus's lumen as this CT's bone leaves it, within {CANAL_MM:g} mm of its axis, from the fundus to the porus.",
    "2": "the meatus's lumen and a ball in the cerebellopontine angle, its surface at the porus and a neck joining them, kept "
         f"{KOOS_CLEAR_MM:g} mm off the brainstem (a drawing choice, to keep it apart from grade III, which occupies the angle): {{d}} mm "
         "across, as large as this model's narrow angle allows (its fitted pons lies about 4 mm from the porus; a real angle is wider).",
    "3": "the meatus's lumen and a ball {d} mm across in the angle, its surface at the porus and a neck joining them, reaching the "
         f"brainstem and moulded against it (cut at its surface where it would reach up to {KOOS_MOULD_MM:g} mm in: touching it, not "
         "moving it; this model's fitted pons fills the angle more than a real one, leaving no room for a ball this size that only "
         "touches it), placed as far from the bone as that allows; the cerebellum pushed aside.",
    "4": "the meatus's lumen and a ball {d} mm across in the angle, its surface at the porus and a neck joining them, reaching "
         f"{KOOS_INTO_MM[0]:g}-{KOOS_INTO_MM[1]:g} mm into where the brainstem lies: the brainstem and the cerebellum pushed aside.",
}
MENINGIOMA_HOW = {
    "olfactory": "on the dura of the olfactory groove, at the midline between the foramen caecum and the sphenoidal yoke as located on this CT.",
    "tuberculum": "on the dura of the tuberculum sellae as located on this CT, the optic nerves and chiasm pushed aside.",
    "petroclival": "on the dura of the petroclival junction on the right, a third of the way from the petrous apex to the jugular foramen.",
    "foramen_magnum": "on the dura of the foramen magnum's anterolateral rim on the right, in front of the hypoglossal canal; the medulla "
                      "and the cerebellum pushed aside.",
}


if __name__ == "__main__":
    sys.exit(main())
