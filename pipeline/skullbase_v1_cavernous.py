"""Skull base v1 (the Z-Anatomy model): the cavernous sinus view as Skull base v3 draws it, on Z-Anatomy's own sinus,
carotid and nerves.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_cavernous.py
  (after skullbase_build.py, skullbase_v1_nerves.py and skullbase_v1_ear.py, which draw the optic nerves and the
  greater petrosal nerve; then compress.mjs skullbase and skullbase_build.py finalize)

Z-Anatomy's own: the cavernous sinus (its mesh), the internal carotid artery, the oculomotor, trochlear, abducens,
trigeminal nerves and V1-V3, the landmarks it labels (the clinoids, the petrous apex, the foramina; where it labels one
on one side only, the other is its mirror image: the model's skull is symmetric). Drawn by rule, and said so:
  * the sinus's walls: a shell of dura round Z-Anatomy's sinus, WALL_MM thick on its lateral half (the outer and inner
    layers with the nerves between them) and THIN_WALL_MM elsewhere, as v3 draws them;
  * the nerves' dural entries: where each of III, IV and VI, coming from the brainstem, first comes within ENTRY_MM of
    the sinus; the trigeminal ganglion: the point Z-Anatomy's V1, V2 and V3 leave the trigeminal nerve from;
  * the ten triangles of Chung 2016 (skullbase_v3_cavernous.TRIANGLES), their vertices taken by v3's rules from these
    nerves, Skull base v1's optic and greater petrosal nerves and the landmarks.
Z-Anatomy's nerves are not re-routed through the sinus's wall (v3 re-routes its fitted ones): they run where the model
has them.

Writes pipeline/data/build/skullbase/sb_cavernous_sinus_walls.glb, sb_triangle_*.glb and cavernous.json (the manifest's
items), and src/data/generated/sb-cavernous.json (as v3's sbv3-cavernous.json).
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
import skullbase_v3 as V3  # noqa: E402
import skullbase_v3_cavernous as CAV  # noqa: E402
from glb import TRIANGLES as GL_TRI, write_glb  # noqa: E402

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"
OUT_JSON = GEN / "sb-cavernous.json"
WALL_MM, THIN_WALL_MM = CAV.CS_WALL_MM, CAV.CS_THIN_WALL_MM
ENTRY_MM = 1.5
GRID = 0.25
LMS = {"anteriorClinoid": "Anterior clinoid process", "posteriorClinoid": "Posterior clinoid process", "petrousApex": "Apex of petrous part",
       "orbitalFissure": "Superior orbital fissure", "rotundum": "Foramen rotundum", "ovale": "Foramen ovale", "lacerum": "Foramen lacerum",
       "opticCanal": "Optic canal"}
LIC = "GPL-3.0 (the project's own drawing, on the Z-Anatomy model)"


def landmarks() -> tuple[dict, list]:
    """The landmarks by side; a side Z-Anatomy does not label taken as the other's mirror image (x -> -x)."""
    lms = json.loads((GEN / "sb-landmarks.json").read_text())
    out, mirrored = {"R": {}, "L": {}}, []
    for k, n in LMS.items():
        got = {l["side"]: np.array(l["ras"], float) for l in lms if l["name"] == n and l.get("side") in ("L", "R")}
        for s, o in (("R", "L"), ("L", "R")):
            if s in got:
                out[s][k] = got[s]
            elif o in got:
                out[s][k] = got[o] * np.array([-1.0, 1, 1])
                mirrored.append(f"{n} ({'right' if s == 'R' else 'left'})")
            else:
                raise SystemExit(f"no landmark {n}")
    return out, mirrored


def run(ex: dict, name: str, side: str, k: int = 0) -> np.ndarray:
    return np.array(ex["lines"][f"{name}.{side.lower()}"]["runs"][k], float)[:, :3]


def from_end(P: np.ndarray, p: np.ndarray) -> np.ndarray:
    """P running from its end nearest p."""
    return P if np.linalg.norm(P[0] - p) <= np.linalg.norm(P[-1] - p) else P[::-1]


def main() -> int:
    np.random.seed(0)
    ex = json.loads((BUILD / "export.json").read_text())
    lm, mirrored = landmarks()
    optic = CAV.centre_lines(BUILD / "sb_optic_nerve_ii.glb")
    gspn = CAV.centre_lines(BUILD / "sb_greater_petrosal_nerve.glb")
    out = {"landmarks": {}, "carotid": {}, "sinus": {}, "triangles": {}}
    tri_pts, walls, report = {}, {}, {}
    for side in ("R", "L"):
        L = lm[side]
        sv = np.array(ex["soft"][f"Cavernous sinus.{side.lower()}"]["verts"], float)
        st = np.array(ex["soft"][f"Cavernous sinus.{side.lower()}"]["tris"], int)
        sm = trimesh.Trimesh(sv, st, process=True)
        tree_cs = cKDTree(np.vstack([sm.vertices, sm.sample(20000)]))
        # the trigeminal nerve: its first run to the ganglion (the point V1, V2 and V3 leave it from), its second V3
        V_root = run(ex, "Trigeminal nerve (V)", side, 0)
        gang = V_root[-1]
        V3n = from_end(run(ex, "Trigeminal nerve (V)", side, 1), gang)
        V1 = from_end(max((np.array(r, float)[:, :3] for r in ex["lines"][f"Ophthalmic nerve.{side.lower()}"]["runs"]), key=len), gang)
        V2 = from_end(max((np.array(r, float)[:, :3] for r in ex["lines"][f"Maxillary nerve.{side.lower()}"]["runs"]), key=len), gang)
        routes = {"Oculomotor nerve (III)": run(ex, "Oculomotor nerve (III)", side), "Trochlear nerve (IV)": run(ex, "Trochlear nerve (IV)", side),
                  "Abducens nerve (VI)": run(ex, "Abducens nerve (VI)", side), "Ophthalmic nerve (V1)": V1, "Maxillary nerve (V2)": V2,
                  "Mandibular nerve (V3)": V3n}
        # each of III, IV, VI from the brainstem (its end nearest the midline) to its first point near the sinus
        entry = {}
        for n in ("Oculomotor nerve (III)", "Trochlear nerve (IV)", "Abducens nerve (VI)"):
            P = routes[n]
            P = P if abs(P[0, 0]) < abs(P[-1, 0]) else P[::-1]
            routes[n] = P = CAV.resample(P, 0.5)
            d = tree_cs.query(P)[0]
            entry[n] = P[int(np.argmax(d <= ENTRY_MM))] if (d <= ENTRY_MM).any() else P[int(np.argmin(d))]
        for n in ("Ophthalmic nerve (V1)", "Maxillary nerve (V2)", "Mandibular nerve (V3)"):
            routes[n] = CAV.resample(routes[n], 0.5)
        ii = CAV.resample(optic[side][0], 0.5)
        gs = CAV.resample(gspn[side][0], 0.5)
        bone = np.load(BUILD / "skull_bone.npz")
        bb, ba = bone["b"].astype(np.float32), bone["a"]
        idx = np.argwhere(bb > 0.4)
        bpts = idx * ba[0, 0] + ba[:3, 3]
        near = np.linalg.norm(bpts - gang, axis=1) < 40
        btree = cKDTree(bpts[near])
        tri_pts[side] = CAV.triangles(routes, L, entry, np.array([gang]), gs, ii, btree, bpts[near])
        # the walls: a shell round the sinus, thicker on its lateral half
        lo = sv.min(0) - 3
        shape = tuple(np.ceil((sv.max(0) + 3 - lo) / GRID).astype(int) + 1)
        from skullbase_brain import fill
        m_in = fill(np.asarray(sm.vertices), np.asarray(sm.faces), lo, shape, GRID) if sm.is_watertight else None
        if m_in is None or not m_in.any():
            sh = np.zeros(shape, bool)
            P_ = np.vstack([sm.vertices, sm.sample(int(sm.area / (0.25 * GRID ** 2)))])
            sh[tuple(np.rint((P_ - lo) / GRID).astype(int).T)] = True
            m_in = ndimage.binary_fill_holes(ndimage.binary_dilation(sh))
        dist_out = ndimage.distance_transform_edt(~m_in, sampling=GRID)
        X = np.indices(shape)[0] * GRID + lo[0]
        cx = float(np.asarray(sm.vertices)[:, 0].mean())
        s_ = 1.0 if side == "R" else -1.0
        t = THIN_WALL_MM + (WALL_MM - THIN_WALL_MM) * np.clip((s_ * (X - cx) + 1.0) / 2.0, 0, 1)
        shell = (~m_in) & (dist_out <= t)
        a = np.eye(4) * GRID
        a[3, 3] = 1
        a[:3, 3] = lo
        from build import isosurface
        walls[side] = isosurface(shell.astype(np.float32), a, 0.5, 0.6, 12000)
        # the cavernous carotid: Z-Anatomy's from the foramen lacerum to its anterior bend (its highest point near the
        # anterior clinoid)
        ica = np.array(max(ex["lines"][f"Internal carotid artery.{side.lower()}"]["runs"], key=len), float)
        i0 = int(np.argmin(np.linalg.norm(ica[:, :3] - L["lacerum"], axis=1)))
        i1 = int(np.argmin(np.linalg.norm(ica[:, :3] - L["anteriorClinoid"], axis=1)))
        seg = ica[min(i0, i1):max(i0, i1) + 1]
        vol = float(sm.volume) if sm.is_watertight else float(m_in.sum()) * GRID ** 3
        # the lateral wall: the plane x = a + b y + c z through the sinus's outermost vertices, slice by slice
        V_ = np.asarray(sm.vertices)
        ys = np.quantile(V_[:, 1], np.linspace(0.1, 0.9, 9))
        pts = []
        for y0 in ys:
            sel = np.abs(V_[:, 1] - y0) < 1.5
            if sel.any():
                q = V_[sel]
                pts.append(q[np.argmax(s_ * q[:, 0])])
        Q = np.array(pts)
        coef = np.linalg.lstsq(np.c_[np.ones(len(Q)), Q[:, 1], Q[:, 2]], Q[:, 0], rcond=None)[0]
        out["landmarks"][side] = {k: np.round(v, 2).tolist() for k, v in L.items()}
        out["carotid"][side] = {"line": np.round(seg[:, :3], 2).tolist(), "radius": np.round(seg[:, 3], 2).tolist(),
                                "lengthMm": round(float(np.linalg.norm(np.diff(seg[:, :3], axis=0), axis=1).sum()), 1)}
        out["sinus"][side] = {"mm3": round(vol, 1), "lo": V_.min(0).round(1).tolist(), "hi": V_.max(0).round(1).tolist(),
                              "wall": np.round(coef, 4).tolist()}
        out["triangles"][side] = {k: [np.round(p, 2).tolist() for p in v] for k, v in tri_pts[side].items()}
        report[side] = {"entries": {n: np.round(p, 1).tolist() for n, p in entry.items()}, "sinusMm3": round(vol)}
    # the meshes
    items = []

    def item(sid, name, aliases, colour, category, derivation, nodes, cent, extra=None):
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        items.append({"id": sid, "name": name, "aliases": aliases, "type": "soft", "file": f"assets/skullbase/{sid}.glb", "bytes": 0,
                      "colour": colour, "dataset": "rule", "source": "Drawn by rule on the Z-Anatomy model", "licence": LIC, "citation": [],
                      "citationUrls": [], "refIds": [], "category": category, "schematic": True, "derivation": derivation, "centroid": cent,
                      **(extra or {})})
    nodes, cent = [], {}
    for side in ("L", "R"):
        m = walls[side]
        v, f = np.asarray(m.vertices), np.asarray(m.faces)
        nodes.append({"name": side, "positions": v, "normals": SB.normals(v, f), "indices": f, "mode": GL_TRI})
        cent[side] = v.mean(0).round(2).tolist()
    item("sb_cavernous_sinus_walls", "Walls of the cavernous sinus", ["Dura of the cavernous sinus"], V3.colour("sbDura"), "soft",
         f"Drawn by rule round Z-Anatomy's cavernous sinus (skullbase_v1_cavernous.py): a shell of dura {WALL_MM} mm thick on its lateral "
         f"half (the outer and inner layers, the nerves of the wall between them, Chotai 2018) and {THIN_WALL_MM} mm elsewhere. Z-Anatomy "
         "does not model the dura here: its thicknesses are drawing choices, as in Skull base v3.", nodes, cent)
    mir = (" Mirrored from the other side (the model's skull is symmetric): " + ", ".join(mirrored) + ".") if mirrored else ""
    for tid, name, other, group, definition in CAV.TRIANGLES:
        nodes, cent = [], {}
        for side in ("L", "R"):
            v, f = CAV.patch(tri_pts[side][tid])
            nrm = np.cross(v[f[0][1]] - v[f[0][0]], v[f[0][2]] - v[f[0][0]])
            nrm = nrm / (np.linalg.norm(nrm) + 1e-12)
            vv = np.vstack([v, v])
            nn = np.vstack([np.repeat(nrm[None], len(v), 0), np.repeat(-nrm[None], len(v), 0)])
            f2 = np.vstack([f, f[:, ::-1] + len(v)])
            nodes.append({"name": side, "positions": vv, "normals": nn, "indices": f2, "mode": GL_TRI})
            cent[side] = v.mean(0).round(2).tolist()
        item(f"sb_triangle_{tid}", name, [other], V3.colour({"medial": "sbTriMedial", "lateral": "sbTriLateral", "posterior": "sbTriPosterior"}[group]),
             "triangle", f"One of the ten triangles round the cavernous sinus as Chung 2016 defines them ({group} group): {definition}. Drawn "
             "here as the flat triangle between those structures as the Z-Anatomy model has them (its nerves where it draws them; the nerves' "
             f"dural entries where each first comes within {ENTRY_MM:g} mm of its sinus; the trigeminal ganglion where its three divisions "
             "leave the nerve; the optic and greater petrosal nerves as Skull base v1 draws them): where it lies follows from them, not from a "
             f"dissection.{mir}", nodes, cent, extra={"triangle": {"group": group}})
    (BUILD / "cavernous.json").write_text(json.dumps({"items": items, "report": report, "mirrored": mirrored}, indent=1))
    OUT_JSON.write_text(json.dumps(out, indent=1))
    print("v1 cavernous:", report, "mirrored", mirrored)
    return 0


if __name__ == "__main__":
    sys.exit(main())
