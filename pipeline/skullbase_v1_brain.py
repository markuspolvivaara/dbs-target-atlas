"""Skull base v1 (the Z-Anatomy model): its own cerebrum and its shapes for the surgical views, as Skull base v3 draws
them on its fitted template (skullbase_brain.py).

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_brain.py
  (after skullbase_v1_brain_export.py, skullbase_v1_skull.py and SB_PROFILE=v1 skullbase_v3_approach.py, which gives
  the interhemispheric craniotomy's span; then skullbase_v1.py approaches, compress.mjs skullbase, finalize)

The cortex is Z-Anatomy's (BodyParts3D), already in its own skull: nothing is fitted. It is stored as separate gyrus and
sulcus patches, which overlap and cut through one another; per hemisphere they are welded where their vertices meet
(within WELD_MM) and remade as closed surfaces round them (remesh: the grid within REMESH_SHELL_MM of a patch, filled,
its isosurface). The temporal lobe, the insula and the rest are remade apart, so the banks of the Sylvian fissure stay
apart. Each vertex keeps the lobe of its nearest patch's Z-Anatomy collection (an interlobular sulcus's or the lateral
fissure's patch takes its nearest lobe; the limbic lobe is the cingulate gyrus). Z-Anatomy has no insular gyri: the
insula is its circular sulcus's patch (the patch named "Insula (Subcentral gyrus ...)" is the subcentral gyrus on the
lateral surface, taken as frontal), and the floor of the opened fissure is Z-Anatomy's own white matter of the
telencephalon within INSULA_REACH_MM of the middle cerebral artery's course there (white_floor), shown with the insula.
The opercula are the frontal, parietal and temporal surface within OPER_MCA_MM of that course (Z-Anatomy's M1, insular
M2 and opercular M3): its fissure patches and insula lie some 10 mm above the arteries and reach the fissure's stem in
front poorly.

Where Z-Anatomy's cortex reaches into its own bone (up to about 7 mm), it is pushed skullbase_brain.CLEAR_CAVITY_MM
inside the cavity first, by a smooth field in small steps (clear_smooth), which does not fold the surface. The shapes are v3's (skullbase_brain.open_fissure, lift_frontal, retract_medial), with their parameters, run on this
surface in v1's own cranial cavity (Z-Anatomy's bones rasterised, skullbase_v1_skull.py): the right Sylvian fissure
opened ("open"), the frontal lobe lifted along the pterional and the lateral supraorbital corridors ("lift",
"lsoLift"), the right hemisphere held off the falx over the interhemispheric craniotomy ("interhemispheric", the
callosum's top from Z-Anatomy's corpus callosum). Shapes, not simulations of the tissue. Z-Anatomy's arteries and veins
stay where the model has them (they are not carried with the opened or lifted cortex).

Writes pipeline/data/build/skullbase/br_*.glb and brain.json (the manifest's items and the shapes' report).
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

import numpy as np
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import brain_deform as BD  # noqa: E402
import skullbase_brain as SBB  # noqa: E402
from glb import write_glb  # noqa: E402

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
WELD_MM = 0.05
OPER_MCA_MM = 10.0       # the opercula: within this of the middle cerebral artery's course in the fissure
OPER_STEP_MM = 1.0
M2 = "Insular branches of middle cerebral artery (M2)"
FISSURE_ARTERIES = ("Middle cerebral artery (M1-segment)", M2,
                    "Middle cerebral artery (M3-segment)")
CAVITY_STEP = 1.0
FISSURE = ("Lat_Fis-post", "Lat_Fis-ant-Horizont", "Lat_Fis-ant-Vertical")
# Z-Anatomy files the subcentral gyrus (on the lateral surface, the frontoparietal operculum) under "Insula"; the insula's
# own surface in this model is the circular sulcus's patch (it has no separate insular gyri)
RELABEL = {"Insula (Subcentral gyrus and ant. and post. sulci*)": "frontal"}
LIMBIC_AS = "cingulate"
V1_CAVITY_SEAL_MM = 7.0      # (as skullbase_v3_approach.py's v1 profile: Z-Anatomy's sutures leave gaps)


class V1Patient:
    """v1's cranial cavity as v3's Patient gives it to the shapes: cavity(X) -> (signed distance inside, positive; its
    gradient)."""

    def __init__(self):
        import skullbase_ct as K
        c = np.load(BUILD / "skull_bone.npz")
        b, a = c["b"].astype(np.float32), c["a"]
        K.CAVITY_SEAL_MM = V1_CAVITY_SEAL_MM
        cav = K.cavity(b, a, float(a[0, 0]))
        k = int(round(CAVITY_STEP / a[0, 0]))
        cav = cav[::k, ::k, ::k]
        self.cavity_ml = float(cav.sum()) * CAVITY_STEP ** 3 / 1000
        self.cavity = BD.Field(-SBB.sdf(cav, CAVITY_STEP), a[:3, 3], CAVITY_STEP, -30.0)

    def vessel_sdf(self, P: np.ndarray):        # (no vessel is kept clear here: Z-Anatomy's vessels are its own)
        return np.full(len(P), 30.0), np.zeros_like(P)

    def falx_sdf(self, P: np.ndarray, side: str):
        return np.full(len(P), 30.0), np.zeros_like(P)


def hemisphere(patches: list, side: str, mca: np.ndarray, wm: dict) -> dict:
    """One hemisphere's cortex: its patches welded (for their labels), remade as one closed surface with those labels."""
    ps = [p for p in patches if p["side"] == side]
    V, T, lab, name = [], [], [], []
    off = 0
    for p in ps:
        v, t = np.array(p["verts"], float), np.array(p["tris"], int)
        # (Z-Anatomy's cortex pieces are slabs, many closed and wound inside out: each wound outward by its signed volume)
        if trimesh.Trimesh(v, t, process=False).volume < 0:
            t = t[:, ::-1]
        V.append(v)
        T.append(t + off)
        lab += [RELABEL.get(p["name"], p["lobe"])] * len(v)
        name += [p["name"]] * len(v)
        off += len(v)
    V, T = np.vstack(V), np.vstack(T)
    lab, name = np.array(lab, dtype=object), np.array(name, dtype=object)
    q = np.round(V / WELD_MM).astype(np.int64)
    _, first, inv = np.unique(q, axis=0, return_index=True, return_inverse=True)
    inv = inv.reshape(-1)
    F = inv[T]
    F = F[(F[:, 0] != F[:, 1]) & (F[:, 1] != F[:, 2]) & (F[:, 0] != F[:, 2])]
    _, keep = np.unique(np.sort(F, axis=1), axis=0, return_index=True)
    F = F[np.sort(keep)]
    Vw = V[first]
    # each welded vertex's lobe: a lobe's patch over a sulcus's (any of the vertices welded into it)
    lobe = np.full(len(Vw), "between", dtype=object)
    pname = name[first].copy()
    for i in np.argsort([0 if lab[j] == "between" else 1 for j in range(len(lab))], kind="stable"):
        lobe[inv[i]] = lab[i] if lab[i] != "between" or lobe[inv[i]] == "between" else lobe[inv[i]]
    fis = np.isin(pname, FISSURE)
    ins = (lobe == "insula") | (pname == "Circular sulcus of insula")
    lobe[ins] = "insula"
    # the patches between lobes take the nearest lobe's
    known = lobe != "between"
    _, j = cKDTree(Vw[known]).query(Vw[~known])
    lobe[~known] = lobe[known][j]
    lobe[lobe == "limbic"] = LIMBIC_AS
    # one closed surface round the patches (they overlap and cut through one another, which no welding mends), each of its
    # vertices taking the labels of the nearest patch vertex
    # remade apart for the banks of the Sylvian fissure (the temporal lobe; the insula; the rest), or one surface would
    # bridge the fissure where its banks lie closer than the grid and the opening would stretch that bridge over the insula
    fl = np.array([max(set(r), key=list(r).count) for r in lobe[F]], dtype=object)
    group = np.where(fl == "temporal", 0, np.where(fl == "insula", 1, 2))
    Vs, Fs, J, off = [], [], [], 0
    area = trimesh.Trimesh(Vw, F, process=False).area_faces
    for g in range(3):
        Fg = F[group == g]
        if not len(Fg):
            continue
        used = np.unique(Fg)
        m = remesh(Vw, Fg, max(2000, int(REMESH_FACES * area[group == g].sum() / area.sum())))
        _, jj = cKDTree(Vw[used]).query(m.vertices)
        Vs.append(np.asarray(m.vertices))
        Fs.append(np.asarray(m.faces) + off)
        J.append(used[jj])
        off += len(m.vertices)
    j = np.concatenate(J)
    Vw, F = np.vstack(Vs), np.vstack(Fs)
    lobe, ins, fis, pname = lobe[j], ins[j], fis[j], pname[j]
    # the opercula: the frontal, parietal and temporal surface within OPER_MCA_MM of the middle cerebral artery's course
    # in the fissure (Z-Anatomy's own M1 in its stem, insular M2 and opercular M3: the Sylvian fissure is where they run). Its
    # fissure patches (Lat_Fis-*) and its insula (the circular sulcus's patch) lie some 10 mm above that course and
    # reach the fissure's stem in front poorly, so they do not place the opercula here.
    oper = np.isin(lobe, ["frontal", "parietal", "temporal"]) & (cKDTree(mca).query(Vw)[0] <= OPER_MCA_MM)
    # the fissure's floor: Z-Anatomy's own white matter under it (it has no insular cortex under its M2 branches)
    Vi, Fi = white_floor(wm, mca)
    n0 = len(Vw)
    Vw, F = np.vstack([Vw, Vi]), np.vstack([F, Fi + n0])
    lobe = np.r_[lobe, np.full(len(Vi), "insula", dtype=object)]
    ins, oper = np.r_[ins, np.ones(len(Vi), bool)], np.r_[oper, np.zeros(len(Vi), bool)]
    pname = np.r_[pname, np.full(len(Vi), INSULA_FLOOR, dtype=object)]
    return {"V": Vw, "F": F, "lobe": lobe, "ins": ins, "oper": oper, "patch": pname, "insulaFloor": len(Fi)}


def white_floor(wm: dict, course: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Z-Anatomy's white matter of the telencephalon within INSULA_REACH_MM of the middle cerebral artery's course in
    the fissure, not more than INSULA_BELOW_MM below it: the floor of the opened fissure (the model has no insular cortex over it). Elsewhere the lobes' own
    surfaces hide it. (verts, tris)"""
    V, T = np.array(wm["verts"], float), np.array(wm["tris"], int)
    m = trimesh.Trimesh(V, T, process=False)
    if m.volume < 0:
        T = T[:, ::-1]
    C = V[T].mean(1)
    keep = (cKDTree(course).query(C)[0] <= INSULA_REACH_MM) & (C[:, 2] >= course[:, 2].min() - INSULA_BELOW_MM)
    part = trimesh.Trimesh(V, T[keep], process=False)
    part.remove_unreferenced_vertices()
    return np.asarray(part.vertices), np.asarray(part.faces)


INSULA_FLOOR = "White matter of telencephalon"
INSULA_REACH_MM = 25.0    # (the white matter shown with the insula within this of the artery's course in the fissure ...
INSULA_BELOW_MM = 5.0     # ... and not more than this below its lowest point: none under the temporal lobe)


def fissure_course(ex: dict, side: str, names: tuple = ()) -> np.ndarray:
    """Z-Anatomy's middle cerebral artery in the Sylvian fissure (its insular M2 and opercular M3 segments), points
    every OPER_STEP_MM."""
    pts = []
    want = {n.replace("-segment", "") for n in names or FISSURE_ARTERIES}     # (Z-Anatomy names a side's segment "(M2)"
    for key, ln in ex["lines"].items():                                        # or "(M2-segment)")
        base, _, sfx = key.rpartition(".")
        if sfx != side.lower() or base.replace("-segment", "") not in want:
            continue
        for run in ln.get("runs", []):
            P = np.array(run, float)[:, :3]
            for a, b in zip(P[:-1], P[1:]):
                k = max(1, int(np.ceil(np.linalg.norm(b - a) / OPER_STEP_MM)))
                pts.append(a + np.linspace(0, 1, k, endpoint=False)[:, None] * (b - a))
    return np.vstack(pts)


def remesh(V: np.ndarray, F: np.ndarray, faces: int = 0) -> trimesh.Trimesh:
    """The patches' surface remade as one: the grid (REMESH_STEP) within REMESH_SHELL_MM of any patch, with what
    that shell encloses, its surface (build.isosurface: smoothed, at most REMESH_FACES faces), the largest piece only."""
    from build import isosurface
    m = trimesh.Trimesh(V, F, process=False)
    P = np.vstack([V, m.sample(int(m.area / (0.25 * REMESH_STEP ** 2)))])
    lo = P.min(0) - 4
    shape = tuple(np.ceil((P.max(0) + 4 - lo) / REMESH_STEP).astype(int) + 1)
    M = np.zeros(shape, bool)
    M[tuple(np.rint((P - lo) / REMESH_STEP).astype(int).T)] = True
    M = ndimage.binary_fill_holes(ndimage.binary_dilation(M, iterations=max(1, int(round(REMESH_SHELL_MM / REMESH_STEP)))))
    a = np.diag([REMESH_STEP] * 3 + [1.0])
    a[:3, 3] = lo
    out = isosurface(M.astype(np.float32), a, 0.5, 0.6, faces or REMESH_FACES)
    parts = out.split(only_watertight=False)
    return max(parts, key=lambda p: p.area) if len(parts) > 1 else out


REMESH_STEP = 0.25
REMESH_SHELL_MM = 0.25   # (the surface lies about this far outside Z-Anatomy's patches)
REMESH_FACES = 90_000


def clear_smooth(V: np.ndarray, pt: V1Patient) -> tuple[np.ndarray, dict]:
    """Push the cortex out of the bone it reaches into, to SBB.CLEAR_CAVITY_MM inside the cavity, by a smooth field
    rather than vertex by vertex (Z-Anatomy's cortex reaches up to about 7 mm into its own bone, and pushing each vertex
    folds the sulci's walls into one another): in rounds, each vertex's push (along the cavity's gradient) spread over a
    grid by a Gaussian of CLEAR_SIGMA_MM, at most CLEAR_STEP_MM a round, every vertex moved by that field. Small, smooth
    steps do not fold the surface."""
    X = V.copy()
    sc, _ = pt.cavity(X)
    first = int((sc < SBB.CLEAR_CAVITY_MM).sum())
    lo = X.min(0) - 3 * CLEAR_SIGMA_MM
    shape = tuple(np.ceil((X.max(0) + 3 * CLEAR_SIGMA_MM - lo) / CLEAR_GRID_MM).astype(int) + 1)
    rounds = 0
    for rounds in range(1, CLEAR_MAX_ROUNDS + 1):
        sc, gc = pt.cavity(X)
        bad = sc < SBB.CLEAR_CAVITY_MM
        if not bad.any():
            break
        gn = gc / np.maximum(np.linalg.norm(gc, axis=1, keepdims=True), 1e-9)
        push = np.minimum(SBB.CLEAR_CAVITY_MM + 0.2 - sc[bad], CLEAR_STEP_MM)[:, None] * gn[bad]
        ijk = np.clip(np.rint((X[bad] - lo) / CLEAR_GRID_MM).astype(int), 0, np.array(shape) - 1)
        acc = np.zeros((4,) + shape, np.float32)
        for k in range(3):
            np.add.at(acc[k], tuple(ijk.T), push[:, k])
        np.add.at(acc[3], tuple(ijk.T), 1.0)
        acc = np.stack([ndimage.gaussian_filter(a, CLEAR_SIGMA_MM / CLEAR_GRID_MM) for a in acc])
        w = np.maximum(acc[3], CLEAR_TAPER * acc[3].max())
        q = ((X - lo) / CLEAR_GRID_MM).T
        u = np.stack([ndimage.map_coordinates(acc[k] / w, q, order=1) for k in range(3)], axis=1)
        X = X + u
    sc, _ = pt.cavity(X)
    return X, {"inBoneWayBefore": first, "inBoneWayAfter": int((sc < SBB.CLEAR_CAVITY_MM - 0.3).sum()), "rounds": rounds,
               "maxMovedMm": round(float(np.linalg.norm(X - V, axis=1).max()), 2)}


CLEAR_GRID_MM = 1.0
CLEAR_SIGMA_MM = 4.0      # (the push spread over this; illustrative)
CLEAR_STEP_MM = 0.5       # (at most this a round)
CLEAR_TAPER = 0.05        # (where few vertices are pushed, the field fades: its weight floored at this share of the most)
CLEAR_MAX_ROUNDS = 40


def hull_field(hemis: dict) -> BD.Field:
    """The brain's hull (sulci bridged, as v3's: closed by HULL_CLOSE_MM), its signed distance (negative inside)."""
    allv = np.vstack([h["V"] for h in hemis.values()])
    lo = allv.min(0) - 12
    shape = tuple(np.ceil((allv.max(0) + 12 - lo) / 1.0).astype(int) + 1)
    M = np.zeros(shape, bool)
    for h in hemis.values():
        m = trimesh.Trimesh(h["V"], h["F"], process=False)
        P = np.vstack([h["V"], m.sample(int(m.area / 0.5))])
        M[tuple(np.rint((P - lo) / 1.0).astype(int).T)] = True
    pad = SBB.HULL_CLOSE_MM + 2
    hull = ndimage.binary_fill_holes(ndimage.binary_closing(np.pad(M, pad), SBB.ball(SBB.HULL_CLOSE_MM))[pad:-pad, pad:-pad, pad:-pad])
    return BD.Field(SBB.sdf(hull, 1.0), lo, 1.0, 30.0)


def main() -> int:
    np.random.seed(0)        # (trimesh samples surfaces at random: seeded, so a run gives the same files)
    t0 = time.time()
    ex = json.loads((BUILD / "export.json").read_text())
    be = json.loads((BUILD / "brain_export.json").read_text())
    hemis = {s: hemisphere(be["patches"], s, fissure_course(ex, s), be["whiteMatter"][s]) for s in "RL"}
    for s, h in hemis.items():
        print(s, "white matter floor", h["insulaFloor"], "faces;", len(h["V"]), "verts", len(h["F"]), "faces; opercula", int(h["oper"].sum()), "insula", int(h["ins"].sum()),
              {k: int((h["lobe"] == k).sum()) for k in sorted(set(h["lobe"]))})
    pt = V1Patient()
    print("cavity", round(pt.cavity_ml), "ml", round(time.time() - t0), "s")
    hull = hull_field(hemis)
    report = {"cavityMl": round(pt.cavity_ml), "clear": {}}
    for s in "RL":      # Z-Anatomy's cortex reaches into its own bone in places: pushed CLEAR_CAVITY_MM inside the cavity
        h = hemis[s]
        h["V"], rc = clear_smooth(h["V"], pt)
        report["clear"][s] = rc
        print(s, "cleared", rc, round(time.time() - t0), "s")
    d = hemis["R"]
    V = d["V"]
    X, ro = SBB.open_fissure(d, V, hull(V, grad=False), pt)
    report["open"] = ro
    print("opened", ro, round(time.time() - t0), "s")

    def landmark_r(name, off):
        p = next(np.array(lm["ras"], float) for lm in ex["landmarks"] if lm["name"] == name)
        p[0] = abs(p[0])
        return p + np.array(off)
    XL, rl = SBB.lift_frontal(d, V, X, [landmark_r(n, o) for n, o in SBB.LIFT_ALONG], pt)
    report["lift"] = rl
    XS, rs = SBB.lift_frontal(d, V, X, [landmark_r(n, o) for n, o in SBB.LSO_LIFT_ALONG], pt, mm=SBB.LSO_LIFT_MM, direction=SBB.LSO_LIFT_DIR)
    report["lsoLift"] = rs
    print("lifted", rl["maxMovedMm"], rs["maxMovedMm"], round(time.time() - t0), "s")
    # the interhemispheric shape: the medial wall's top from Z-Anatomy's corpus callosum (its right half)
    ih = json.loads((BUILD / "approach.json").read_text())["interhemispheric"]
    cc = np.array(be["callosum"]["verts"], float)
    cc = cc[cc[:, 0] >= 0]
    dd = {**d, "lobe": np.r_[d["lobe"], np.full(len(cc), "medial", dtype=object)]}
    XI_all, ri = SBB.retract_medial(dd, np.vstack([V, cc]), tuple(ih["span"]), 0.0, pt)
    XI = XI_all[:len(V)]
    report["interhemispheric"] = ri
    print("retracted", ri["maxMovedMm"], round(time.time() - t0), "s")
    shapes = [("open", X, V), ("lift", XL, X), ("interhemispheric", XI, V), ("lsoLift", XS, X)]
    items = []
    lic = "CC BY-SA 4.0 (Z-Anatomy); BodyParts3D CC BY-SA 2.1 Japan; definitions from Wikipedia, CC BY-SA 3.0"
    cite = "Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37(Database issue):D782-D785. doi:10.1093/nar/gkn613."
    for pid, name, lobes, tok in SBB.PIECES:
        if lobes == ["medial"]:
            continue         # (Z-Anatomy's cortex has no cut medial wall: its medial surface is in the lobes)
        nodes, cent = [], {}
        for s in "LR":
            h = hemis[s]
            fsel = np.isin(h["lobe"][h["F"]], lobes).sum(1) >= 2
            if not fsel.any():
                continue
            node = SBB.piece(h["V"], h["F"], fsel, shapes if s == "R" else None)
            node["name"] = s
            nodes.append(node)
            cent[s] = node["positions"].mean(0).round(2).tolist()
        write_glb(BUILD / f"{pid}.glb", nodes, {"id": pid})
        items.append({"id": pid, "name": name, "aliases": [], "type": "soft", "file": f"assets/skullbase/{pid}.glb", "bytes": 0,
                      "colour": SBB.colour(tok), "dataset": "zanatomy", "source": "Z-Anatomy (based on BodyParts3D)", "licence": lic,
                      "citation": [cite], "citationUrls": ["https://doi.org/10.1093/nar/gkn613"], "refIds": [], "category": "brain",
                      "layer": "cortex", "morph": True,
                      "derivation": ("Z-Anatomy's cortex (BodyParts3D: its gyrus and sulcus patches, remade as closed surfaces about "
                                     f"{REMESH_SHELL_MM:g} mm outside them, the temporal lobe apart from the rest), "
                                     "by the lobe of each patch's Z-Anatomy collection; where it reached into this model's bone, pushed 1 mm inside the "
                                     "cranial cavity. "
                                     + ("Z-Anatomy has no insular cortex: this is its circular sulcus of the insula, with its white matter of the "
                                        "telencephalon under the Sylvian fissure as the floor of the opened fissure. " if pid == "br_insula" else "")
                                     + "Its shapes for the surgical views (the right Sylvian "
                                     "fissure opened, the frontal lobe lifted along the pterional and the lateral supraorbital corridors, the "
                                     "right hemisphere held off the falx) are Skull base v3's rules, run in this model's own cranial cavity "
                                     "(skullbase_v1_brain.py): shapes, not simulations of the tissue."),
                      "centroid": {"L": cent["L"], "R": cent["R"]}})
    from modifications import record
    record("sb", "skullbase_v1_brain", "the cortex remade as closed surfaces and pushed out of its bone by a smooth field; the opercula and the "
           "fissure's floor found from the model's arteries and white matter",
           [it["name"] for it in items], {"remeshStepMm": REMESH_STEP, "remeshShellMm": REMESH_SHELL_MM, "clearSigmaMm": CLEAR_SIGMA_MM,
                                          "clearStepMm": CLEAR_STEP_MM, "operMcaMm": OPER_MCA_MM, "insulaReachMm": INSULA_REACH_MM},
           report, {s: {"inBoneWayAfter": report["clear"][s]["inBoneWayAfter"]} for s in report["clear"]})
    (BUILD / "brain.json").write_text(json.dumps({"items": items, "report": report}, indent=1, default=str))
    print("written", len(items), "pieces;", round(time.time() - t0), "s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
