"""Skull base v3's cavernous sinus: the sinus modelled on this CT, the nerves of its walls re-routed through them, the
surgical triangles about it and the veins that join it.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_cavernous.py
  (after skullbase_v3.py, before skullbase_v3_endonasal.py; then compress.mjs skullbase-v3 and skullbase_v3.py finalize)

On the endonasal view's grid (skullbase_v3_endonasal.ct_grid: this CT's bone and TopBrain's labels, 0.5 mm, in the
model's frame: x right, y forwards, z up, origin at the fitted hypophysial fossa):

  * landmarks found on this CT's bone: the anterior clinoid's tip (the furthest-back bone of the lesser wing over the
    sinus), the posterior clinoid's (the highest bone at the dorsum's lateral corner); the petrous apex, which a CT
    shows fused with the clivus, from Skull base v2's fitted landmark (mirrored to the left) snapped onto this bone;
    the superior orbital fissure, foramen rotundum and ovale from v3's own landmarks;
  * the cavernous carotid's centre line: the path through TopBrain's carotid label (and the traced petrous and lacerum
    part below it) that keeps furthest inside the lumen, from the lacerum part's end to where the artery passes the
    level of the anterior clinoid;
  * the sinus (Chotai 2018's borders): between the sella and the sphenoid body medially (the bone, and the hypophysis
    modelled in its fossa, CS_MEDIAL_MM off them) and its lateral wall, under the roof (the plane of the oculomotor
    triangle: anterior and posterior clinoids, petrous apex), from the petrous apex back to the carotid's anterior bend
    in front, within CS_AROUND_MM of the carotid; the lateral wall a plane fitted through the superior orbital fissure,
    the foramen rotundum, the trigeminal ganglion's medial margin and the petrous apex (a drawing choice);
  * the nerves of the lateral wall re-routed through it, in their order from above (III, IV, V1, V2), each spliced into
    its v3 route from where it reaches the sinus to the superior orbital fissure (V2: the foramen rotundum); VI from
    beneath Gruber's ligament at the petrous apex, against the carotid's posterior vertical segment, then forward
    inside the sinus, lateral to the carotid and medial to V1, to the fissure (Wysiadecki 2021, Corvino 2023);
  * the ten triangles of Chung 2016 (their vertices and borders as that paper defines them), each a flat patch;
  * the veins: Skull base v2's fitted superior and inferior petrosal sinuses and ophthalmic veins carried over; the
    sphenoparietal sinus (under the lesser wing's free edge) and the basilar plexus (on the clivus) drawn by rule.

Writes v3's build (the meshes, cavernous.json: what skullbase_v3.py needs to splice the nerves again when it is run) and
src/data/generated/sbv3-cavernous.json (landmarks, the carotid's line, the sinus's size, the triangles).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import nibabel as nib
import numpy as np
import trimesh
from scipy import ndimage
from scipy.interpolate import CubicSpline
from scipy.spatial import cKDTree
from skimage import measure
from skimage.graph import MCP_Geometric

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_v3_endonasal as ENDO  # noqa: E402

REPO = ROOT.parent
CT_BUILD = ROOT / "data" / "build" / "skullbase-ct"
V3_BUILD = ROOT / "data" / "build" / "skullbase-v3"
CAV_JSON = V3_BUILD / "cavernous.json"          # the splices (skullbase_v3.py applies them to the nerves it routes)
CAV_ITEMS = V3_BUILD / "cavernous_items.json"   # the manifest's items (merged by skullbase_v3_endonasal.carry_sellar)
OUT_JSON = REPO / "src" / "data" / "generated" / "sbv3-cavernous.json"
GEN = REPO / "src" / "data" / "generated"

ICA_LABEL = {"R": 4, "L": 6}         # TopBrain's internal carotid arteries in this case
CS_MEDIAL_MM = 0.4                   # the medial wall: this far off the bone and the hypophysis
CS_AROUND_MM = 5.5                   # the venous spaces round the carotid reach this far from its wall
CS_WALL_MM = 1.2                     # the lateral wall's thickness: its nerves run in it, between its layers
CS_BACK_MM = 1.5                     # behind the petrous apex
CS_FRONT_MM = 2.0                    # in front of the carotid's anterior bend
CS_LATERAL_SPACE_MM = 2.5
CS_THIN_WALL_MM = 0.3                # the walls drawn round it: this thick medially, above and below (a drawing choice), and
                                     # CS_WALL_MM at the lateral wall (its two layers, the nerves between them)            # the lateral wall at least this far outside the carotid (the lateral venous space, VI in it)
NERVE_DEPTH = {"Oculomotor nerve (III)": 0.18, "Trochlear nerve (IV)": 0.36, "Ophthalmic nerve (V1)": 0.6, "Maxillary nerve (V2)": 0.9}
CARRIED_VEINS = ["sb_superior_petrosal_sinus", "sb_inferior_petrosal_sinus", "sb_superior_ophthalmic_vein", "sb_inferior_ophthalmic_vein"]
# what the nerves' descriptions add (skullbase_v3.py and the manifest merge append it)
REROUTE_NOTE = {
    "Oculomotor nerve (III)": "In the cavernous sinus it is re-routed by rule (skullbase_v3_cavernous.py): into the roof at the oculomotor "
                              "triangle's centre, then forward in the top of the sinus's lateral wall to the superior orbital fissure.",
    "Trochlear nerve (IV)": "In the cavernous sinus it is re-routed by rule (skullbase_v3_cavernous.py): into the roof at the back of the "
                            "oculomotor triangle's lateral side, then forward in the lateral wall below the oculomotor nerve to the superior orbital fissure.",
    "Ophthalmic nerve (V1)": "In the cavernous sinus it is re-routed by rule (skullbase_v3_cavernous.py): from the ganglion forward in the "
                             "lateral wall below the trochlear nerve to the superior orbital fissure.",
    "Maxillary nerve (V2)": "In the cavernous sinus it is re-routed by rule (skullbase_v3_cavernous.py): from the ganglion forward in the "
                            "lowest part of the lateral wall to the foramen rotundum.",
    "Abducens nerve (VI)": "In the cavernous sinus it is re-routed by rule (skullbase_v3_cavernous.py): under Gruber's ligament at the petrous "
                           "apex (Dorello's canal), against the carotid's posterior vertical segment, then forward inside the sinus, lateral "
                           "to the carotid and medial to the ophthalmic nerve, to the superior orbital fissure (Wysiadecki 2021, Corvino 2023).",
}
SPHENOPARIETAL_MM = 0.9              # the sphenoparietal sinus's radius (drawn)
BASILAR_PLEXUS = (8.0, 14.0, 1.0)    # its half-width, its length down the clivus from the dorsum, its thickness (mm, drawn)


# ---------------------------------------------------------------- helpers
def centre_lines(path: Path) -> dict:
    """A tube mesh's centre line and radius by node (skullbase_build.tube: rings of 6 or 8 vertices, then the caps)."""
    sc = trimesh.load(path, force="scene", process=False)
    out = {}
    for name, geom in sc.geometry.items():
        v = np.asarray(geom.vertices)
        for sides in (8, 6):
            n = (len(v) - 2 * (sides + 1)) / sides
            if n == int(n) and n >= 2:
                ring = v[:int(n) * sides].reshape(int(n), sides, 3)
                c = ring.mean(1)
                out[name] = (c, np.linalg.norm(ring - c[:, None], axis=2).mean(1))
                break
    return out


def resample(P: np.ndarray, step: float = 0.5) -> np.ndarray:
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    t = np.r_[np.arange(0, s[-1], step), s[-1]]
    return np.stack([np.interp(t, s, P[:, i]) for i in range(3)], 1)


def spline(points: list[np.ndarray], step: float = 0.5) -> np.ndarray:
    """A smooth curve through points (chord-length cubic spline)."""
    Q = np.array(points, float)
    keep = np.r_[True, np.linalg.norm(np.diff(Q, axis=0), axis=1) > 1e-3]
    Q = Q[keep]
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(Q, axis=0), axis=1))]
    cs = CubicSpline(s, Q, bc_type="natural")
    return cs(np.r_[np.arange(0, s[-1], step), s[-1]])


def splice(path: np.ndarray, i0: int, i1: int, middle: list[np.ndarray]) -> np.ndarray:
    """A route with its run from point i0 to i1 replaced by a smooth curve through `middle`, joined tangentially (the
    curve also passes a point either side of the joins)."""
    a, b = path[max(i0 - 2, 0)], path[min(i1 + 2, len(path) - 1)]
    mid = spline([a, path[i0], *middle, path[i1], b])
    return np.vstack([path[:max(i0 - 2, 0)], mid, path[min(i1 + 3, len(path)):]])


def nearest_index(path: np.ndarray, p: np.ndarray) -> int:
    return int(np.argmin(np.linalg.norm(path - p, axis=1)))


def patch(points: list[np.ndarray], n: int = 6) -> tuple[np.ndarray, np.ndarray]:
    """A flat triangle subdivided n times along its edges (vertices, faces), for the triangles round the sinus."""
    A, B, C = (np.asarray(p, float) for p in points)
    verts, idx = [], {}
    for i in range(n + 1):
        for j in range(n + 1 - i):
            idx[(i, j)] = len(verts)
            verts.append(A + (B - A) * i / n + (C - A) * j / n)
    faces = []
    for i in range(n):
        for j in range(n - i):
            faces.append([idx[(i, j)], idx[(i + 1, j)], idx[(i, j + 1)]])
            if i + j < n - 1:
                faces.append([idx[(i + 1, j)], idx[(i + 1, j + 1)], idx[(i, j + 1)]])
    return np.array(verts), np.array(faces)


# ---------------------------------------------------------------- landmarks
def lm_list(path: Path) -> list:
    d = json.loads(path.read_text())
    return d["landmarks"] if isinstance(d, dict) else d


def landmarks(g: dict) -> dict:
    """The clinoids and petrous apex on this CT (see the module's text), and v3's own foramina, by side."""
    shape = g["shape"]
    Pg = g["P"].reshape(shape + (3,))
    bone = g["bone"] >= ENDO.FIELD_ISO
    x, y, z = Pg[..., 0], Pg[..., 1], Pg[..., 2]
    v2 = {(l["name"], l.get("side")): np.array(l["ras"]) for l in lm_list(GEN / "sbct-landmarks.json")}
    v3 = {(l["name"], l.get("side")): np.array(l["ras"]) for l in lm_list(GEN / "sbv3-landmarks.json")}
    bone_pts = Pg[bone & (np.abs(x) > 5)]
    tree = cKDTree(bone_pts)
    out = {}
    for side, s in (("R", 1), ("L", -1)):
        sx = s * x
        # (lateral and high enough to be the clinoid itself, not the middle clinoid or an interclinoid bridge)
        box = bone & (sx > 10.5) & (sx < 18) & (y > 0) & (y < 12) & (z > 8.5) & (z < 15)
        p = Pg[box]
        ac = p[np.argmin(p[:, 1])]
        box = bone & (sx > 2) & (sx < 9) & (y > -10) & (y < -2) & (z > 2) & (z < 14)
        p = Pg[box]
        pc = p[np.argmax(p[:, 2] + 0.3 * sx[box])]
        # the petrous apex: the highest bone at the petrous ridge's medial end, behind the foramen lacerum (a CT shows it
        # fused with the clivus: where the ridge's top meets it); the most anterior of the highest
        box = bone & (sx > 9) & (sx < 16) & (y > -12) & (y < -7) & (z > -8) & (z < 2)
        p = Pg[box]
        pa = p[np.lexsort((-p[:, 1], -np.round(p[:, 2] * 2)))[0]]
        out[side] = {"anteriorClinoid": ac, "posteriorClinoid": pc, "petrousApex": pa,
                     "orbitalFissure": v3[("Superior orbital fissure", side)], "rotundum": v3[("Foramen rotundum", side)],
                     "ovale": v3[("Foramen ovale", side)], "lacerum": v3[("Foramen lacerum", side)],
                     "opticCanal": v3[("Optic canal", side)]}
    return out


# ---------------------------------------------------------------- the cavernous carotid
def carotid_line(g: dict, side: str, lacerum_end: np.ndarray, ac: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """The cavernous carotid's centre line (frame mm) and its radius along it: the path that keeps furthest inside the
    lumen (TopBrain's label, with the traced part below it) from the lacerum part's end to where it passes the anterior
    clinoid's level."""
    shape, a_crop = g["shape"], g["a_crop"]
    Pg = g["P"].reshape(shape + (3,))
    lumen = g["lab"] == ICA_LABEL[side]
    # the traced part below the label (its last 6 mm) as a tube 1.8 mm across, so the path can start in it
    tail = cKDTree(lacerum_end[None]).query(Pg.reshape(-1, 3))[0].reshape(shape) < 2.0
    inside = lumen | tail
    depth = ndimage.distance_transform_edt(inside, sampling=ENDO.GRID_MM)
    # (outside the lumen allowed, dearly: the label and the traced part may not quite meet)
    cost = np.where(inside, 1.0 / (0.2 + depth) ** 2, np.where(g["bone"] >= ENDO.FIELD_ISO, 200.0, 40.0))
    ijk = lambda p: tuple(np.clip(np.round(nib.affines.apply_affine(np.linalg.inv(a_crop), p)).astype(int), 0, np.array(shape) - 1))
    lp = Pg[lumen]
    # the end: the anterior bend's top, the label's furthest-forward point below the anterior clinoid's tip (above it the
    # artery turns back as its supraclinoid part)
    near = lp[(lp[:, 2] < ac[2] + 0.5) & (lp[:, 2] > ac[2] - 6)]
    end = near[np.argmax(near[:, 1] + 0.3 * near[:, 2])]
    start = Pg[ijk(lacerum_end)]
    mcp = MCP_Geometric(cost)
    mcp.find_costs([ijk(start)], [ijk(end)])
    path = np.array(mcp.traceback(ijk(end)))
    P = resample(Pg[tuple(path.T)], 0.5)
    r = ndimage.map_coordinates(depth, nib.affines.apply_affine(np.linalg.inv(a_crop), P).T, order=1)
    return P, np.maximum(r, 1.0)


# ---------------------------------------------------------------- the sinus
def lateral_wall(lm: dict, ganglion: np.ndarray, side: str) -> np.ndarray:
    """The lateral wall's plane x = a + b y + c z (for the side's |x|), through the superior orbital fissure, the
    foramen rotundum, the ganglion's medial margin and the petrous apex (least squares)."""
    s = 1 if side == "R" else -1
    med = ganglion[np.argsort(s * ganglion[:, 0])[:max(3, len(ganglion) // 5)]]
    pts = np.vstack([lm["orbitalFissure"], lm["rotundum"], med, lm["petrousApex"]])
    A = np.c_[np.ones(len(pts)), pts[:, 1], pts[:, 2]]
    coef, *_ = np.linalg.lstsq(A, s * pts[:, 0], rcond=None)
    return coef


def wall_x(wall: np.ndarray, ica: np.ndarray, ica_r: np.ndarray, side: str, y, z):
    """The lateral wall's distance from the midline (|x|, frame mm) at (y, z): the fitted plane, but at least
    CS_LATERAL_SPACE_MM outside the carotid where the artery runs at that y (its lateral surface)."""
    s = 1 if side == "R" else -1
    y = np.asarray(y, float)
    order = np.argsort(ica[:, 1])
    lat = s * ica[order, 0] + ica_r[order]
    reach = np.interp(y, ica[order, 1], lat, left=-np.inf, right=-np.inf)
    return np.maximum(wall[0] + wall[1] * y + wall[2] * np.asarray(z, float), reach + CS_LATERAL_SPACE_MM)


def roof_z(lm: dict, y):
    """The roof's height along the sinus (frame mm): level with the clinoids (from the anterior's height in front to the
    posterior's behind), then falling from the posterior clinoid to the petrous apex (the oculomotor triangle's slope,
    the roof's back): a drawing choice from those three points."""
    ac, pc, pa = lm["anteriorClinoid"], lm["posteriorClinoid"], lm["petrousApex"]
    y = np.asarray(y, float)
    level = np.interp(y, [pc[1], ac[1]], [pc[2], ac[2]])
    fall = pc[2] + (y - pc[1]) * (pc[2] - pa[2]) / max(pc[1] - pa[1], 0.5)
    return np.where(y < pc[1], np.minimum(level, fall), level) - 0.5


def sinus(g: dict, side: str, lm: dict, ica: np.ndarray, ica_r: np.ndarray, wall: np.ndarray, gland_off: np.ndarray) -> np.ndarray:
    """The sinus's condition on the grid (mm, <= 0 inside), the carotid in it included."""
    shape = g["shape"]
    Pg = g["P"].reshape(shape + (3,))
    s = 1 if side == "R" else -1
    x, y, z = Pg[..., 0], Pg[..., 1], Pg[..., 2]
    off_bone = ndimage.distance_transform_edt(g["bone"] < ENDO.FIELD_ISO, sampling=ENDO.GRID_MM)
    d_ica, k = cKDTree(ica).query(Pg.reshape(-1, 3))
    d_ica = (d_ica - ica_r[k]).reshape(shape)
    lat = s * x - wall_x(wall, ica, ica_r, side, y, z)
    c = np.maximum.reduce([
        CS_MEDIAL_MM - off_bone, CS_MEDIAL_MM - gland_off,         # off the bone and the hypophysis
        lat,                                                        # medial to the lateral wall
        z - roof_z(lm, y),                                          # under the roof
        (lm["petrousApex"][1] - CS_BACK_MM) - y,                    # from the petrous apex
        y - (ica[:, 1].max() + CS_FRONT_MM),                        # to the anterior bend
        d_ica - CS_AROUND_MM,                                       # round the carotid
        2.0 - s * x,                                                # its own side
        (lm["lacerum"][2] + lm["rotundum"][2]) / 2 - z,             # its floor: the carotid sulcus's level (drawn)
    ]).astype(np.float32)
    lab, _ = ndimage.label(c <= 0)
    mid = ica[len(ica) // 2]
    seed = tuple(np.clip(np.round(nib.affines.apply_affine(np.linalg.inv(g["a_crop"]), mid)).astype(int), 0, np.array(shape) - 1))
    keep = lab == lab[seed] if lab[seed] else lab > 0
    c[~keep & (c <= 0)] = 0.5
    # the carotid in it (its lumen in the sinus counted inside)
    return np.minimum(c, np.where(keep | (d_ica < 0), np.maximum(d_ica, z - roof_z(lm, y)), 1.0)).astype(np.float32)


def mesh_of(cond: np.ndarray, a_crop: np.ndarray, sigma: float = 0.7) -> trimesh.Trimesh:
    f = ndimage.gaussian_filter(cond, sigma)
    idx = np.argwhere(f <= 0.5)
    lo, hi = np.maximum(idx.min(0) - 3, 0), np.minimum(idx.max(0) + 4, np.array(f.shape))
    v, t, _, _ = measure.marching_cubes(f[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]], 0.0)
    m = trimesh.Trimesh(nib.affines.apply_affine(a_crop, v + lo), t[:, ::-1], process=True)
    trimesh.smoothing.filter_taubin(m, iterations=10)
    if m.volume < 0:          # (wound outward whichever way the crop's affine turns it)
        m.invert()
    return m


# ---------------------------------------------------------------- the nerves
def wall_point(wall: np.ndarray, ica: np.ndarray, ica_r: np.ndarray, side: str, y: float, z: float) -> np.ndarray:
    """A point in the lateral wall (wall_x is the sinus's side of it: the nerves run half its thickness outside)."""
    s = 1 if side == "R" else -1
    return np.array([s * (float(wall_x(wall, ica, ica_r, side, y, z)) + CS_WALL_MM / 2), y, z])


def reroute(routes: dict, side: str, lm: dict, ica: np.ndarray, ica_r: np.ndarray, wall: np.ndarray, off_bone) -> dict:
    """The nerves of the lateral wall and VI re-routed through the sinus (see the module's text): their new centre
    lines, and for skullbase_v3.py the splices (where on each route, and the points between)."""
    ac, pc, pa, sof, fr = (lm[k] for k in ("anteriorClinoid", "posteriorClinoid", "petrousApex", "orbitalFissure", "rotundum"))
    s = 1 if side == "R" else -1
    # the sinus's lateral wall from its top (under the roof) to its bottom (the foramen rotundum's level), along its length
    bottom = fr[2]
    ys = np.linspace(pa[1] + 1.0, ica[:, 1].max() - 0.5, 5)

    def in_wall(name: str, y_: float) -> np.ndarray:
        top = float(roof_z(lm, y_)) - 0.5
        p = wall_point(wall, ica, ica_r, side, y_, top + NERVE_DEPTH[name] * (bottom - top))
        # off the bone (where the wall's plane meets the greater wing): moved in towards the sinus until clear
        for _ in range(16):
            if off_bone(p) > 0.6:
                break
            p = p - np.array([s * 0.25, 0.0, 0.0])
        return p

    out = {}
    entry = {}
    # III: through the roof at the oculomotor triangle's centre, then in the top of the wall
    tri_c = (ac + pc + pa) / 3
    entry["Oculomotor nerve (III)"] = tri_c
    # IV: into the roof at the back of the triangle's lateral side (the anterior petroclinoid fold), below III
    entry["Trochlear nerve (IV)"] = ac + 0.72 * (pa - ac)
    for name in ("Oculomotor nerve (III)", "Trochlear nerve (IV)"):
        P = routes[name]
        i0 = nearest_index(P, entry[name])
        i1 = nearest_index(P, sof)
        mid = [entry[name]] + [in_wall(name, y_) for y_ in ys if y_ > entry[name][1] + 1.5]
        out[name] = {"i0": i0, "i1": i1, "middle": mid}
    # V1 and V2: from the ganglion's margin forward in the wall's lower part, V1 to the fissure, V2 to the rotundum
    for name, exit_ in (("Ophthalmic nerve (V1)", sof), ("Maxillary nerve (V2)", fr)):
        P = routes[name]
        i1 = nearest_index(P, exit_)
        mid = [in_wall(name, y_) for y_ in ys if y_ > P[0][1] + 2.0 and y_ < exit_[1] - 2.0]
        out[name] = {"i0": 0, "i1": i1, "middle": mid}
    # VI: beneath Gruber's ligament at the petrous apex (Dorello's canal), against the carotid's posterior vertical
    # segment, then forward inside the sinus, lateral to the carotid and medial to V1, to the fissure
    P = routes["Abducens nerve (VI)"]
    dorello = pa + np.array([-s * 1.0, 1.0, 1.5])
    i0 = nearest_index(P, dorello)
    i1 = nearest_index(P, sof)
    k_post = int(np.argmin(np.abs(ica[:, 2] - (ica[:, 2].min() + 4.0))))     # ~4 mm up the posterior vertical segment
    against = ica[k_post] + np.array([s * (ica_r[k_post] + 0.7), 0.0, 0.0])
    k_h = int(np.argmin(np.abs(ica[:, 1] - (ica[:, 1].min() + ica[:, 1].max()) / 2)))
    lateral = ica[k_h] + np.array([s * (ica_r[k_h] + 1.6), 0.0, -0.5])
    # then on forward medial to V1 (just below and inside it) until near the fissure, where they all converge
    along_v1 = [in_wall("Ophthalmic nerve (V1)", y_) + np.array([-s * 1.8, 0.0, -0.8]) for y_ in ys if lateral[1] + 1.5 < y_ < sof[1] - 3.0]
    out["Abducens nerve (VI)"] = {"i0": i0, "i1": i1, "middle": [dorello, against, lateral, *along_v1]}
    entry["Abducens nerve (VI)"] = dorello
    return {"splices": out, "entry": entry}


def apply(routes: dict, splices: dict) -> dict:
    out = dict(routes)
    for name, sp in splices.items():
        out[name] = splice(routes[name], sp["i0"], sp["i1"], [np.asarray(m) for m in sp["middle"]])
    return out


# ---------------------------------------------------------------- the triangles
TRIANGLES = [
    # (id, name, other names, group, Chung 2016's definition)
    ("superoposterior", "Superoposterior (oculomotor) triangle", "Oculomotor triangle", "medial",
     "anterior clinoid process, posterior clinoid process, apex of the petrous part (vertices)"),
    ("superior", "Superior (clinoidal) triangle", "Clinoidal, Dolenc's triangle", "medial",
     "optic nerve, oculomotor nerve before the superior orbital fissure, dural fold between the two nerves' dural entries (borders)"),
    ("middle", "Middle (supratrochlear) triangle", "Paramedian, supratrochlear triangle", "medial",
     "oculomotor nerve, trochlear nerve, dural fold between their dural entries (borders)"),
    ("inferior", "Inferior (Parkinson's) triangle", "Parkinson's, infratrochlear triangle", "medial",
     "trochlear nerve, ophthalmic nerve, dural fold between their dural entries (borders)"),
    ("anteromedial", "Anteromedial (Mullan's) triangle", "Mullan's triangle", "lateral",
     "ophthalmic nerve, maxillary nerve, between the superior orbital fissure and the foramen rotundum (borders)"),
    ("anterolateral", "Anterolateral triangle", "Lateral triangle", "lateral",
     "maxillary nerve, mandibular nerve, between the foramen rotundum and the foramen ovale (borders)"),
    ("posterolateral", "Posterolateral (Glasscock's) triangle", "Glasscock's triangle", "lateral",
     "mandibular nerve, greater petrosal nerve, between the foramen ovale and the hiatus of the greater petrosal nerve (borders)"),
    ("posteromedial", "Posteromedial (Kawase's) triangle", "Kawase's triangle", "lateral",
     "trigeminal ganglion, greater petrosal nerve, between the hiatus and the apex of the petrous part (borders)"),
    ("lateral", "Lateral (inferolateral) triangle", "Inferolateral triangle", "posterior",
     "dural entries of the trochlear and abducens nerves, apex of the petrous part (vertices)"),
    ("medial", "Medial (inferomedial) triangle", "Inferomedial triangle", "posterior",
     "dural entries of the trochlear and abducens nerves, posterior clinoid process (vertices)"),
]


def closest_between(A: np.ndarray, B: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    d, k = cKDTree(B).query(A)
    i = int(np.argmin(d))
    return A[i], B[k[i]]


def triangles(routes: dict, lm: dict, entry: dict, ganglion: np.ndarray, gspn: np.ndarray, ii: np.ndarray, bone_tree: cKDTree, bone_pts: np.ndarray) -> dict:
    """Each triangle's three vertices on this side, from the re-routed nerves and the landmarks (Chung 2016)."""
    III, IV, V1, V2, V3 = (routes[k] for k in ("Oculomotor nerve (III)", "Trochlear nerve (IV)", "Ophthalmic nerve (V1)",
                                                "Maxillary nerve (V2)", "Mandibular nerve (V3)"))
    sof, fr, fo, pa = lm["orbitalFissure"], lm["rotundum"], lm["ovale"], lm["petrousApex"]
    # where two nerves come together in front (their closest points, in front of their entries)
    front = lambda A, B: closest_between(A[A[:, 1] > entry["Oculomotor nerve (III)"][1] + 3], B)[0]
    # the greater petrosal nerve's hiatus: where it leaves the bone onto the middle fossa (its first point clear of bone)
    clear = bone_tree.query(gspn)[0] > 0.8
    hiatus = gspn[int(np.argmax(clear))] if clear.any() else gspn[-1]
    gsp_front = gspn[-1]
    v12 = (V1[0] + V2[0]) / 2
    v23 = (V2[0] + V3[0]) / 2
    ii_entry = ii[nearest_index(ii, lm["opticCanal"])]
    t = {
        "superoposterior": [lm["anteriorClinoid"], lm["posteriorClinoid"], pa],
        "superior": [ii_entry, III[nearest_index(III, sof)], entry["Oculomotor nerve (III)"]],
        "middle": [entry["Oculomotor nerve (III)"], entry["Trochlear nerve (IV)"], front(IV, III)],
        "inferior": [entry["Trochlear nerve (IV)"], V1[0], front(IV, V1)],
        "anteromedial": [V1[nearest_index(V1, sof)], V2[nearest_index(V2, fr)], v12],
        "anterolateral": [V2[nearest_index(V2, fr)], V3[nearest_index(V3, fo)], v23],
        "posterolateral": [V3[nearest_index(V3, fo)], hiatus, closest_between(V3, gspn)[0]],
        "posteromedial": [hiatus, pa, closest_between(gspn, ganglion)[0] if len(gspn) else gsp_front],
        "lateral": [entry["Trochlear nerve (IV)"], entry["Abducens nerve (VI)"], pa],
        "medial": [entry["Trochlear nerve (IV)"], entry["Abducens nerve (VI)"], lm["posteriorClinoid"]],
    }
    return {k: [np.asarray(p, float) for p in v] for k, v in t.items()}


# ---------------------------------------------------------------- the veins drawn by rule
def sphenoparietal(g: dict, side: str, lm: dict) -> np.ndarray:
    """The sphenoparietal sinus's line: under the lesser wing's free (back) edge, from the anterior clinoid's base out
    (the edge's furthest-back bone at each x, 1 mm below it)."""
    shape = g["shape"]
    Pg = g["P"].reshape(shape + (3,))
    s = 1 if side == "R" else -1
    bone = g["bone"] >= ENDO.FIELD_ISO
    ac = lm["anteriorClinoid"]
    pts = []
    for xx in np.arange(abs(ac[0]) + 1.0, 25.5, 1.0):
        col = bone & (np.abs(Pg[..., 0] - s * xx) < 0.3) & (Pg[..., 2] > ac[2] - 4) & (Pg[..., 2] < ac[2] + 8) & (Pg[..., 1] > ac[1] - 2) & (Pg[..., 1] < ac[1] + 18)
        if col.any():
            p = Pg[col]
            pts.append(p[np.argmin(p[:, 1])] + np.array([0.0, 0.3, -1.0]))
    P = np.array(pts)
    return ENDO.smooth(resample(P, 0.5), 3) if len(P) > 2 else P


def tube(P: np.ndarray, r: float):
    import skullbase_build as SB
    return SB.tube(np.c_[P, np.full(len(P), r)])


def basilar_plexus(g: dict, lm: dict) -> trimesh.Trimesh:
    """The basilar plexus: a sheet on the clivus's back (its bone surface), from the dorsum down BASILAR_PLEXUS[1] mm,
    BASILAR_PLEXUS[0] mm either side of the midline, BASILAR_PLEXUS[2] mm thick (drawn by rule)."""
    shape = g["shape"]
    Pg = g["P"].reshape(shape + (3,))
    bone = g["bone"] >= ENDO.FIELD_ISO
    half, length, thick = BASILAR_PLEXUS
    top = (lm["R"]["posteriorClinoid"][2] + lm["L"]["posteriorClinoid"][2]) / 2 - 2.0
    surf = []
    for zz in np.arange(top - length, top, 1.0):
        for xx in np.arange(-half, half + 0.1, 1.0):
            row = bone & (np.abs(Pg[..., 0] - xx) < 0.3) & (np.abs(Pg[..., 2] - zz) < 0.3) & (Pg[..., 1] < 0) & (Pg[..., 1] > -17)
            if row.any():
                p = Pg[row]
                surf.append(p[np.argmin(p[:, 1])] + np.array([0.0, -thick / 2 - 0.3, 0.0]))
    grid = np.array(surf)
    # a sheet triangulated over the sampled (x, z) grid, doubled (front and back, half its thickness either way)
    zs = np.unique(np.round(grid[:, 2]))
    xs = np.unique(np.round(grid[:, 0]))
    lut = {(round(p[0]), round(p[2])): p for p in grid}
    verts, faces = [], []
    index = {}
    for off in (-thick / 2, thick / 2):
        for zz in zs:
            for xx in xs:
                p = lut.get((round(xx), round(zz)))
                if p is not None:
                    index[(off, xx, zz)] = len(verts)
                    verts.append(p + np.array([0.0, off, 0.0]))
    for off in (-thick / 2, thick / 2):
        for i in range(len(zs) - 1):
            for j in range(len(xs) - 1):
                q = [index.get((off, xs[j], zs[i])), index.get((off, xs[j + 1], zs[i])), index.get((off, xs[j + 1], zs[i + 1])), index.get((off, xs[j], zs[i + 1]))]
                if None in q:
                    continue
                f1, f2 = [q[0], q[1], q[2]], [q[0], q[2], q[3]]
                if off > 0:
                    f1, f2 = f1[::-1], f2[::-1]
                faces += [f1, f2]
    m = trimesh.Trimesh(np.array(verts), np.array(faces), process=True)
    trimesh.smoothing.filter_taubin(m, iterations=5)
    return m


# ---------------------------------------------------------------- main
def main() -> int:
    import skullbase_build as SB
    from glb import TRIANGLES as GL_TRI, write_glb
    import skullbase_v3 as V3

    g = ENDO.ct_grid()
    shape, a_crop = g["shape"], g["a_crop"]
    Pg = g["P"].reshape(shape + (3,))
    lm = landmarks(g)
    names = ["Oculomotor nerve (III)", "Trochlear nerve (IV)", "Abducens nerve (VI)", "Ophthalmic nerve (V1)",
             "Maxillary nerve (V2)", "Mandibular nerve (V3)", "Optic nerve (II)", "Greater petrosal nerve"]
    # the routes as skullbase_v3.py drew them (kept the first time: the meshes are rewritten here)
    orig = V3_BUILD / "cavernous_routes.npz"
    if orig.exists():
        z = np.load(orig)
        tubes = {n: {s: (z[f"{n}|{s}|P"], z[f"{n}|{s}|r"]) for s in ("L", "R")} for n in names}
    else:
        tubes = {n: centre_lines(V3_BUILD / f"{SB.slug(n).replace('sb_', 'tb_', 1)}.glb") for n in names}
        np.savez_compressed(orig, **{f"{n}|{s}|{k}": tubes[n][s][i] for n in names for s in ("L", "R") for i, k in enumerate("Pr")})
    ica_low = centre_lines(V3_BUILD / "tb_internal_carotid_artery_petrous_and_lacerum_parts.glb")
    ganglion = {s: np.asarray(m.vertices) for s, m in trimesh.load(V3_BUILD / "tb_trigeminal_ganglion.glb", force="scene").geometry.items()}
    # the hypophysis modelled in this CT's fossa (skullbase_v3_endonasal.build_hypophysis), for the medial wall
    hypo = ENDO.build_hypophysis(g["bone"], ndimage.distance_transform_edt(g["lab"] == 0, sampling=ENDO.GRID_MM), Pg, ENDO.GRID_MM, a_crop)
    gland_off = ENDO.signed(hypo["gland"], ENDO.GRID_MM)
    bone_pts = Pg[g["bone"] >= ENDO.FIELD_ISO]
    bone_tree = cKDTree(bone_pts)

    out_json, splices_all, report = {"landmarks": {}, "carotid": {}, "sinus": {}, "triangles": {}}, {}, {}
    cs_conds, cs_meshes, wall_meshes, nerve_paths, tri_pts, spp = {}, {}, {}, {}, {}, {}
    for side in ("R", "L"):
        L = lm[side]
        # the cavernous carotid: the traced part from where it leaves the foramen lacerum (the petrolingual ligament), on
        # through the label to the anterior bend
        low = ica_low[side][0]
        i_lac = int(np.argmax(low[:, 2] > L["lacerum"][2]))
        up, up_r = carotid_line(g, side, low[-1], L["anteriorClinoid"])
        ica = ENDO.smooth(resample(np.vstack([low[i_lac:], up]), 0.5), 4)
        ica_r = np.maximum(np.interp(np.arange(len(ica)), np.linspace(0, len(ica) - 1, len(low) - i_lac + len(up_r)),
                                     np.r_[ica_low[side][1][i_lac:], up_r]), 1.0)
        wall = lateral_wall(L, ganglion[side], side)
        cs = sinus(g, side, L, ica, ica_r, wall, gland_off)
        cs_conds[side] = cs
        cs_meshes[side] = mesh_of(cs, a_crop)
        # its walls: a shell round it, CS_WALL_MM thick at the lateral wall, CS_THIN_WALL_MM elsewhere (thickening over
        # the 2.5 mm next to the lateral wall)
        s_ = 1 if side == "R" else -1
        lat = s_ * Pg[..., 0] - wall_x(wall, ica, ica_r, side, Pg[..., 1], Pg[..., 2])
        t = CS_THIN_WALL_MM + (CS_WALL_MM - CS_THIN_WALL_MM) * np.clip((lat + 2.5) / 2.5, 0, 1)
        wall_meshes[side] = mesh_of((ENDO.signed(cs <= 0, ENDO.GRID_MM) - t).astype(np.float32), a_crop, sigma=0.6)
        routes = {n: tubes[n][side][0] for n in names}
        ob = ndimage.distance_transform_edt(g["bone"] < ENDO.FIELD_ISO, sampling=ENDO.GRID_MM)
        off_bone = lambda p, ob=ob: float(ndimage.map_coordinates(ob, nib.affines.apply_affine(np.linalg.inv(a_crop), p)[:, None], order=1)[0])
        rr = reroute(routes, side, L, ica, ica_r, wall, off_bone)
        new = apply(routes, rr["splices"])
        nerve_paths[side] = new
        splices_all[side] = {n: {"i0": sp["i0"], "i1": sp["i1"], "n": len(routes[n]), "middle": [np.round(m, 3).tolist() for m in sp["middle"]]}
                             for n, sp in rr["splices"].items()}
        tri_pts[side] = triangles(new, L, rr["entry"], ganglion[side], routes["Greater petrosal nerve"], routes["Optic nerve (II)"], bone_tree, bone_pts)
        spp[side] = sphenoparietal(g, side, L)
        vol = float((cs <= 0).sum()) * ENDO.GRID_MM ** 3
        out_json["landmarks"][side] = {k: np.round(v, 2).tolist() for k, v in L.items()}
        out_json["carotid"][side] = {"line": np.round(ica, 2).tolist(), "radius": np.round(ica_r, 2).tolist(),
                                     "lengthMm": round(float(np.linalg.norm(np.diff(ica, axis=0), axis=1).sum()), 1)}
        cp = Pg[cs <= 0]
        out_json["sinus"][side] = {"mm3": round(vol, 1), "lo": cp.min(0).round(1).tolist(), "hi": cp.max(0).round(1).tolist(),
                                   "wall": np.round(wall, 4).tolist()}
        out_json["triangles"][side] = {k: [np.round(p, 2).tolist() for p in v] for k, v in tri_pts[side].items()}
        # the re-routed nerves' centre lines (1 mm apart), where they run by the sinus
        out_json.setdefault("nerves", {})[side] = {n: np.round(resample(new[n], 1.0), 2).tolist() for n in rr["splices"]}
        # how far each re-routed nerve now runs through bone (should be little: they run in the wall and the sinus)
        report[side] = {n: round(float((bone_tree.query(resample(new[n], 0.5))[0] < 0.25).sum()) * 0.5, 1) for n in rr["splices"]}
        print(side, "sinus", round(vol), "mm3", cp.min(0).round(1), cp.max(0).round(1), "carotid", out_json["carotid"][side]["lengthMm"], "mm; nerves in bone (mm):", report[side])
        print("  landmarks", {k: np.round(v, 1).tolist() for k, v in L.items() if k in ("anteriorClinoid", "posteriorClinoid", "petrousApex")})

    # ---- meshes
    cols = {k: V3.colour(k) for k in ("sbVein", "sbNerve", "sbSoft")}
    items = []

    def item(sid, name, aliases, colour, category, derivation, nodes, cent, dataset="rule", schematic=True, extra=None):
        write_glb(V3_BUILD / f"{sid}.glb", nodes, {"id": sid})
        items.append({"id": sid, "name": name, "aliases": aliases, "type": "soft", "file": f"assets/skullbase-v3/{sid}.glb", "bytes": 0,
                      "colour": colour, "dataset": dataset, "source": "Modelled on the TopBrain CT" if dataset == "rule" else "Fitted",
                      "licence": "GPL-3.0 (the project's own drawing, on the TopBrain CT)", "citation": [], "citationUrls": [], "refIds": [],
                      "category": category, **({"schematic": True} if schematic else {}), "derivation": derivation, "centroid": cent, **(extra or {})})

    nodes, cent = [], {}
    for side in ("L", "R"):
        m = cs_meshes[side]
        nodes.append({"name": side, "positions": np.asarray(m.vertices), "normals": SB.normals(np.asarray(m.vertices), np.asarray(m.faces)),
                      "indices": np.asarray(m.faces), "mode": GL_TRI})
        cent[side] = np.asarray(m.vertices).mean(0).round(2).tolist()
    sz = {s: out_json["sinus"][s]["mm3"] for s in ("R", "L")}
    item("tb_cavernous_sinus", "Cavernous sinus", ["Parasellar sinus"], cols["sbVein"], "vein",
         "Modelled on this CT (skullbase_v3_cavernous.py), between the borders Chotai 2018 gives: medially the sella and the "
         f"sphenoid body ({CS_MEDIAL_MM} mm off the bone and the hypophysis modelled in its fossa), laterally its lateral wall "
         "(a plane through the superior orbital fissure, the foramen rotundum, the trigeminal ganglion's medial margin and the "
         "petrous apex: a drawing choice), under its roof (the plane of the oculomotor triangle: the anterior and posterior "
         "clinoids and the petrous apex), from the petrous apex back to the carotid's anterior bend, and within "
         f"{CS_AROUND_MM} mm of the carotid it contains (this CT's own, TopBrain's label). A CT does not show its walls: its "
         f"shape is drawn by rule round what the CT does show. Right {round(sz['R'])} mm³, left {round(sz['L'])} mm³.",
         nodes, cent, schematic=True)

    nodes, cent = [], {}
    for side in ("L", "R"):
        m = wall_meshes[side]
        nodes.append({"name": side, "positions": np.asarray(m.vertices), "normals": SB.normals(np.asarray(m.vertices), np.asarray(m.faces)),
                      "indices": np.asarray(m.faces), "mode": GL_TRI})
        cent[side] = np.asarray(m.vertices).mean(0).round(2).tolist()
    item("tb_cavernous_sinus_walls", "Walls of the cavernous sinus", ["Dura of the cavernous sinus"], V3.colour("sbDura"), "soft",
         "Drawn by rule round the cavernous sinus modelled on this CT (skullbase_v3_cavernous.py): a shell of dura, "
         f"{CS_WALL_MM} mm thick at the lateral wall (its outer and inner layers, the oculomotor, trochlear, ophthalmic and "
         f"maxillary nerves running between them, Chotai 2018) and {CS_THIN_WALL_MM} mm medially, above and below. A CT does "
         "not show the dura: its thicknesses are drawing choices.", nodes, cent)

    # the re-routed nerves: their v3 meshes rewritten (radius as they were)
    for n in ("Oculomotor nerve (III)", "Trochlear nerve (IV)", "Abducens nerve (VI)", "Ophthalmic nerve (V1)", "Maxillary nerve (V2)"):
        sid = SB.slug(n).replace("sb_", "tb_", 1)
        nodes = []
        for side in ("L", "R"):
            v, nn, t = tube(nerve_paths[side][n], float(np.median(tubes[n][side][1])))
            nodes.append({"name": side, "positions": v, "normals": nn, "indices": t, "mode": GL_TRI})
        write_glb(V3_BUILD / f"{sid}.glb", nodes, {"id": sid})

    # the triangles: each a flat patch per side
    for tid, name, other, group, definition in TRIANGLES:
        nodes, cent = [], {}
        for side in ("L", "R"):
            v, f = patch(tri_pts[side][tid])
            nrm = np.cross(v[f[0][1]] - v[f[0][0]], v[f[0][2]] - v[f[0][0]])
            nrm = nrm / (np.linalg.norm(nrm) + 1e-12)
            # both faces, each with its own copy of the vertices and normal (seen from either side, lit)
            vv = np.vstack([v, v])
            nn = np.vstack([np.repeat(nrm[None], len(v), 0), np.repeat(-nrm[None], len(v), 0)])
            f2 = np.vstack([f, f[:, ::-1] + len(v)])
            nodes.append({"name": side, "positions": vv, "normals": nn, "indices": f2, "mode": GL_TRI})
            cent[side] = v.mean(0).round(2).tolist()
        item(f"tb_triangle_{tid}", name, [other], V3.colour({"medial": "sbTriMedial", "lateral": "sbTriLateral", "posterior": "sbTriPosterior"}[group]), "triangle",
             f"One of the ten triangles round the cavernous sinus as Chung 2016 defines them ({group} group): {definition}. "
             "Drawn here as the flat triangle between those structures as they are drawn in this model (the nerves re-routed through "
             "the sinus's wall, the landmarks found on this CT): where they lie follows from them, not from a dissection.",
             nodes, cent, extra={"triangle": {"group": group}})

    # the veins drawn by rule
    nodes, cent = [], {}
    for side in ("L", "R"):
        v, nn, t = tube(spp[side], SPHENOPARIETAL_MM)
        nodes.append({"name": side, "positions": v, "normals": nn, "indices": t, "mode": GL_TRI})
        cent[side] = spp[side].mean(0).round(2).tolist()
    item("tb_sphenoparietal_sinus", "Sphenoparietal sinus", ["Sinus of Breschet"], cols["sbVein"], "vein",
         "Drawn by rule on this CT: under the free (back) edge of the lesser wing of the sphenoid, from the anterior clinoid's base "
         f"outwards (the edge's furthest-back bone, a millimetre below it), {2 * SPHENOPARIETAL_MM:g} mm across, into the cavernous sinus's front.",
         nodes, cent)
    bp = basilar_plexus(g, lm)
    halves = SB.mesh_split(np.asarray(bp.vertices), np.asarray(bp.faces), np.ones(len(bp.vertices)))
    nodes, cent = [], {}
    for side, (v, t, _) in sorted(halves.items()):
        nodes.append({"name": side, "positions": v, "normals": SB.normals(v, t), "indices": t, "mode": GL_TRI})
        cent[side] = v.mean(0).round(2).tolist()
    item("tb_basilar_plexus", "Basilar venous plexus", ["Basilar plexus"], cols["sbVein"], "vein",
         "Cut at the midline (x = 0) into left and right halves. Drawn by rule on this CT: a sheet on the back of the clivus (its "
         f"bone surface), from just below the dorsum {BASILAR_PLEXUS[1]:g} mm down and {BASILAR_PLEXUS[0]:g} mm either side of the "
         f"midline, {BASILAR_PLEXUS[2]:g} mm thick: the plexus joins both cavernous sinuses and inferior petrosal sinuses (Tanoue 2020); its "
         "channels are not drawn.", nodes, cent)

    # the sinus's condition on the grid, for the endonasal view (its medial wall opened as a step)
    np.savez_compressed(V3_BUILD / "cavernous_cond.npz", R=cs_conds["R"].astype(np.float16), L=cs_conds["L"].astype(np.float16))
    CAV_ITEMS.write_text(json.dumps(items, indent=1, ensure_ascii=False))
    CAV_JSON.write_text(json.dumps({"splices": splices_all, "report": report}, indent=1))
    OUT_JSON.write_text(json.dumps(out_json, indent=1))
    print("written", len(items), "items;", OUT_JSON.name)
    return 0


if __name__ == "__main__":
    sys.exit(main())
