"""Skull base v1 (the Z-Anatomy model): its own ear for the temporal-bone views, and what Z-Anatomy lacks there drawn by
Skull base v3's sourced rules on it.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_ear.py
  (after skullbase_v1_ear_export.py, in Blender, and skullbase_v1_skull.py; then skullbase_v1.py ear, before the Kawase
  cut, which keeps off these structures)

Z-Anatomy's own (ear_export.json, already in v1's frame): the cochlea, the vestibule with the semicircular canals (its
"Vestibule" mesh), the malleus, incus and stapes and the tympanic membrane; its facial nerve (export.json) gives the
landmarks along the nerve. Drawn by rule, and said so in each derivation:
  Geniculate ganglion           the facial nerve's first genu: the sharpest turn (GENU_SMOOTH_MM smoothing) on its course
                                through the temporal bone, from the internal acoustic meatus to the stylomastoid foramen,
                                in the course's first half (Z-Anatomy has no ganglion)
  Second genu of facial nerve   the sharpest turn beyond GENU_APART_MM past the first
  Bone over the superior semicircular canal   the bone's surface straight above the vestibule mesh's highest point (the
                                superior canal's top), as v3 marks the arcuate eminence on the canal
  Oval window                   the centre of the stapes' footplate (the stapes' vertices farthest from the incus)
  Greater petrosal nerve        v3's rule (skullbase_v3.gspn: Gupta 2013, Nguyen 2026's mean length) on this skull: from the
                                geniculate ganglion towards the petrous carotid's anteromedial end, along the middle fossa
                                floor's surface, seated on the bone (skullbase_v3.seat_on_skull's rule on v1's grid)

Writes pipeline/data/build/skullbase/sb_<ear structure>.glb and ear.json (the manifest's items, the landmarks, texts and a
report).
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
import skullbase_build as SB  # noqa: E402
import skullbase_ct as K  # noqa: E402
import skullbase_v3 as V3  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402
from meshcheck import orient_outward  # noqa: E402

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"
LIC = "CC BY-SA 4.0 (Z-Anatomy); BodyParts3D CC BY-SA 2.1 Japan; definitions from Wikipedia, CC BY-SA 3.0"
CITE = ("Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. BodyParts3D: 3D structure database for anatomical "
        "concepts. Nucleic Acids Res. 2009;37(Database issue):D782-D785. doi:10.1093/nar/gkn613.")
# (Z-Anatomy name, the name shown, category, palette token)
MESHES = [("Cochlea", "Cochlea", "labyrinth", "sbLabyrinth"),
          ("Vestibule", "Vestibule and semicircular canals", "labyrinth", "sbLabyrinth"),
          ("Malleus", "Malleus", "ossicle", "sbBone"), ("Incus", "Incus", "ossicle", "sbBone"), ("Stapes", "Stapes", "ossicle", "sbBone"),
          ("Tympanic membrane", "Tympanic membrane", "membrane", "sbMembrane")]
GENU_SMOOTH_MM = 1.5
GENU_APART_MM = 5.0        # (the second genu sought this far beyond the first)
FOOTPLATE_SHARE = 0.15     # (the oval window: the centre of this share of the stapes' vertices farthest from the incus)


class Grid:
    """v1's bone field (skullbase_v1_skull.py) as v3's CT gives its surface to the nerve rule."""

    def __init__(self):
        c = np.load(BUILD / "skull_bone.npz")
        self.b, self.a = c["b"].astype(np.float32), c["a"]
        self.inv = np.linalg.inv(self.a)

    def bone(self, P: np.ndarray) -> np.ndarray:
        ijk = (P @ self.inv[:3, :3].T + self.inv[:3, 3]).T
        return ndimage.map_coordinates(self.b, ijk, order=1, mode="nearest") > K.SURFACE_LEVEL

    def surface_above(self, p: np.ndarray, reach: float = 15.0) -> np.ndarray | None:
        """The first point above p where the bone ends (skullbase_v3.bone_surface_above on this grid)."""
        zs = np.arange(0, reach, 0.25)
        P = p + zs[:, None] * np.array([0, 0, 1.0])
        inside = self.bone(P)
        if not inside.any():
            return None
        k = int(np.argmax(inside))
        out = np.nonzero(~inside[k:])[0]
        return P[k + out[0]] if len(out) else None

    def seat(self, P: np.ndarray, r: float) -> np.ndarray:
        """skullbase_v3.seat_on_skull on this grid: past the facial hiatus, lifted straight up until clear of the bone."""
        d_out = ndimage.distance_transform_edt(self.b <= K.SURFACE_LEVEL, sampling=float(abs(self.a[0, 0])))

        def clear(Q):
            ijk = (Q @ self.inv[:3, :3].T + self.inv[:3, 3]).T
            return ndimage.map_coordinates(d_out, ijk, order=1, mode="nearest")
        s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
        free = s > V3.GSPN_HIATUS_MM
        need = r + V3.GSPN_GAP_MM
        lift = np.zeros(len(P))
        Q = P.copy()
        for _ in range(6):
            for i in np.nonzero(free)[0]:
                for dz in np.arange(0.0, 6.0, 0.05):
                    if clear(Q[i][None] + np.array([[0, 0, dz]]))[0] >= need:
                        lift[i] += dz
                        Q[i, 2] += dz
                        break
            sm = ndimage.gaussian_filter1d(lift, 1.5, mode="nearest")
            lift = np.maximum(lift, sm) * free + lift * ~free
            Q = P.copy()
            Q[:, 2] += lift
            if (clear(Q[free]) >= need - 0.02).all():
                break
        w = np.clip((s - (V3.GSPN_HIATUS_MM - 1.0)) / 1.0, 0, 1)
        Q[:, 2] = P[:, 2] + w * lift
        return Q


def facial_course(ex: dict, lms: dict, side: str) -> np.ndarray:
    """Z-Anatomy's facial nerve from the internal acoustic meatus to the stylomastoid foramen (its run through both)."""
    iam, sm = lms[("Internal acoustic meatus", side)], lms[("Stylomastoid foramen", side)]
    best = None
    for run in ex["lines"][f"Facial nerve (VII).{side.lower()}"]["runs"]:
        P = np.array(run, float)[:, :3]
        di, ds = np.linalg.norm(P - iam, axis=1), np.linalg.norm(P - sm, axis=1)
        score = di.min() + ds.min()
        if best is None or score < best[0]:
            best = (score, P, int(np.argmin(di)), int(np.argmin(ds)))
    _, P, i0, i1 = best
    seg = P[min(i0, i1):max(i0, i1) + 1]
    return seg if i0 < i1 else seg[::-1]


def genua(course: np.ndarray) -> tuple[int, int]:
    """The two sharpest turns of the course: the first in its first half, the second beyond GENU_APART_MM past it (the
    turning angle over GENU_SMOOTH_MM each side)."""
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(course, axis=0), axis=1))]
    u = np.arange(0, s[-1], 0.25)
    C = np.stack([np.interp(u, s, course[:, k]) for k in range(3)], 1)
    k = int(round(GENU_SMOOTH_MM / 0.25))
    ang = np.zeros(len(C))
    for i in range(k, len(C) - k):
        a, b = C[i] - C[i - k], C[i + k] - C[i]
        ang[i] = np.arccos(np.clip(a @ b / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9), -1, 1))
    half = len(C) // 2
    g1 = int(np.argmax(ang[:half]))
    start = g1 + int(round(GENU_APART_MM / 0.25))         # (the second past the first's own bend)
    g2 = start + int(np.argmax(ang[start:]))
    # (back to the course's own points)
    j1, j2 = (int(np.argmin(np.linalg.norm(course - C[g], axis=1))) for g in (g1, g2))
    return j1, j2


def gspn(G: Grid, gen: np.ndarray, carotid: np.ndarray, side_sign: float) -> np.ndarray:
    """skullbase_v3.gspn on this grid and this model's carotid."""
    tip = carotid[np.argmax(carotid[:, 1] - side_sign * carotid[:, 0])]
    end = G.surface_above(tip, reach=25.0)
    end = tip if end is None else end
    pts = []
    for s in np.linspace(0, 1, 40):
        p = gen + s * (end - gen)
        q = G.surface_above(p - np.array([0, 0, 6.0]), reach=14.0)
        pts.append((q if q is not None else p) + np.array([0, 0, 0.6]))
    P = np.array(pts)
    P[0] = gen
    P = ndimage.gaussian_filter1d(P, 2, axis=0, mode="nearest")
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    u = np.arange(0, min(V3.GSPN_MM, s[-1]) + 1e-6, 0.4)
    P = np.stack([np.interp(u, s, P[:, k]) for k in range(3)], 1)
    tree = cKDTree(carotid)
    for it in range(6):
        d, j = tree.query(P)
        close = d < V3.GSPN_CLEAR_MM
        close[0] = False
        if not close.any():
            break
        away = P[close] - carotid[j[close]]
        away /= np.linalg.norm(away, axis=1, keepdims=True) + 1e-9
        P[close] = carotid[j[close]] + away * V3.GSPN_CLEAR_MM
        if it < 5:
            P[1:] = ndimage.gaussian_filter1d(P, 1, axis=0, mode="nearest")[1:]
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P, axis=0), axis=1))]
    return G.seat(P[s <= V3.GSPN_MM + 1e-6], V3.GSPN_R_MM)


def petrous_carotid(ex: dict, lms: dict, side: str) -> np.ndarray:
    """Z-Anatomy's internal carotid artery from the carotid canal's external opening to its internal one, as surface
    points (the centre line with the radius it draws)."""
    run = np.array(max(ex["lines"][f"Internal carotid artery.{side.lower()}"]["runs"], key=len), float)
    a = int(np.argmin(np.linalg.norm(run[:, :3] - lms[("External opening of carotid canal", side)], axis=1)))
    b = int(np.argmin(np.linalg.norm(run[:, :3] - lms[("Internal opening of carotid canal", side)], axis=1)))
    seg = run[min(a, b):max(a, b) + 1]
    v, _, _ = SB.tube(seg)
    return np.vstack([seg[:, :3], v])


def landmark(name: str, side: str, p: np.ndarray, bone: str, placed: str) -> dict:
    return {"id": f"lm_{SB.slug(name).replace('sb_', '', 1)}_{side.lower()}", "name": name, "bone": bone, "part": None,
            "ras": np.round(p, 3).tolist(), "side": side, "boneFrom": "drawn by rule", "distanceToBoneMm": 0.0, "placed": placed}


def main() -> int:
    np.random.seed(0)        # (trimesh samples surfaces at random: seeded, so a run gives the same files)
    ear = json.loads((BUILD / "ear_export.json").read_text())
    ex = json.loads((BUILD / "export.json").read_text())
    lms = {(l["name"], l.get("side")): np.array(l["ras"], float) for l in json.loads((GEN / "sb-landmarks.json").read_text())}
    G = Grid()
    items, new_lms, report = [], [], {}
    for zname, name, cat, tok in MESHES:
        sid = SB.slug(name)
        nodes, cent = [], {}
        for s in ("L", "R"):
            m = ear["meshes"].get(zname, {}).get(s)
            if not m:
                continue
            v, t = np.array(m["verts"], float), np.array(m["tris"], int)
            t = orient_outward(v, t)
            nodes.append({"name": s, "positions": v, "normals": SB.normals(v, t), "indices": t, "mode": TRIANGLES})
            cent[s] = v.mean(0).round(2).tolist()
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        items.append({"id": sid, "name": name, "aliases": [zname] if zname != name else [], "type": "soft", "file": f"assets/skullbase/{sid}.glb",
                      "bytes": 0, "colour": V3.colour(tok), "dataset": "zanatomy", "source": "Z-Anatomy (based on BodyParts3D)", "licence": LIC,
                      "citation": [CITE], "citationUrls": ["https://doi.org/10.1093/nar/gkn613"], "refIds": [], "category": cat,
                      "centroid": cent, "derivation": "Z-Anatomy's own mesh" + (" (its \"Vestibule\", which takes in the semicircular canals)." if zname == "Vestibule" else ".")})
    # the landmarks drawn on the model, and the greater petrosal nerve
    gs_nodes, gs_cent = [], {}
    for s, sign in (("L", -1.0), ("R", 1.0)):
        course = facial_course(ex, lms, s)
        j1, j2 = genua(course)
        gen, genu2 = course[j1], course[j2]
        sl = np.array(ear["meshes"]["Vestibule"][s]["verts"], float)
        top = sl[np.argmax(sl[:, 2])]
        over = G.surface_above(top, reach=10.0)
        st = np.array(ear["meshes"]["Stapes"][s]["verts"], float)
        inc = np.array(ear["meshes"]["Incus"][s]["verts"], float).mean(0)
        far = np.argsort(-np.linalg.norm(st - inc, axis=1))[:max(10, int(FOOTPLATE_SHARE * len(st)))]
        oval = st[far].mean(0)
        new_lms += [landmark("Geniculate ganglion", s, gen, "Temporal bone", "Drawn by rule: Z-Anatomy has no geniculate ganglion. Placed at the first genu of its facial nerve, the sharpest turn on the nerve's course through the temporal bone (between the internal acoustic meatus and the stylomastoid foramen), in the course's first half."),
                    landmark("Second genu of facial nerve", s, genu2, "Temporal bone", "Drawn by rule: the sharpest turn on Z-Anatomy's facial nerve, on its course through the temporal bone, beyond the first genu."),
                    landmark("Oval window", s, oval, "Temporal bone", "Drawn by rule: the centre of the footplate of Z-Anatomy's stapes (its vertices farthest from the incus).")]
        if over is not None:
            new_lms.append(landmark(V3.OVER_SSC, s, over, "Temporal bone", "Drawn by rule: the bone's surface straight above the highest point of Z-Anatomy's vestibule mesh (the top of the superior semicircular canal)."))
        car = petrous_carotid(ex, lms, s)
        P = gspn(G, gen, car, sign)
        v, n, t = V3.tube_mesh(P, V3.GSPN_R_MM)
        gs_nodes.append({"name": s, "positions": v, "normals": n, "indices": t, "mode": TRIANGLES})
        gs_cent[s] = P.mean(0).round(2).tolist()
        s_ = np.r_[0, np.cumsum(np.linalg.norm(np.diff(course, axis=0), axis=1))]
        report[s] = {"facialCourseMm": round(float(s_[-1]), 1), "toGeniculateMm": round(float(s_[j1]), 1), "toSecondGenuMm": round(float(s_[j2]), 1),
                     "gspnMm": round(float(np.linalg.norm(np.diff(P, axis=0), axis=1).sum()), 1),
                     "overCanalMm": None if over is None else round(float(over[2] - top[2]), 1),
                     "arcuateEminenceToOverCanalMm": None if over is None or ("Arcuate eminence", s) not in lms else round(float(np.linalg.norm(over - lms[("Arcuate eminence", s)])), 1)}
    sid = "sb_greater_petrosal_nerve"
    write_glb(BUILD / f"{sid}.glb", gs_nodes, {"id": sid})
    items.append({"id": sid, "name": "Greater petrosal nerve", "aliases": [], "type": "tube", "file": f"assets/skullbase/{sid}.glb", "bytes": 0,
                  "colour": V3.colour("sbNerve"), "dataset": "zanatomy", "source": "Drawn by rule on the Z-Anatomy model", "licence": LIC,
                  "citation": [CITE], "citationUrls": ["https://doi.org/10.1093/nar/gkn613"], "refIds": [], "category": "nerve", "cranialNerve": 7, "centroid": gs_cent,
                  "derivation": ("Drawn by rule: Z-Anatomy has no greater petrosal nerve. Skull base v3's rule run on this model: from the geniculate "
                                 "ganglion (drawn at its facial nerve's first genu) forwards and medially (Gupta 2013), aimed over the anteromedial end "
                                 "of its petrous carotid, along the middle fossa floor's surface, for the mean length Nguyen 2026 measured "
                                 f"({V3.GSPN_MM:g} mm); past the facial hiatus seated on this model's bone.")})
    texts = {name: ear["texts"].get(zname) for zname, name, _, _ in MESHES if ear["texts"].get(zname)}
    (BUILD / "ear.json").write_text(json.dumps({"items": items, "landmarks": new_lms, "texts": texts, "report": report}, indent=1))
    print("ear (v1):", len(items), "structures,", len(new_lms), "landmarks;", report)
    return 0


if __name__ == "__main__":
    sys.exit(main())
