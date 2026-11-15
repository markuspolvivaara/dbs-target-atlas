"""Skull base v1 (the Z-Anatomy model): its own cerebellum, brainstem and fourth ventricle, with the telovelar,
retrosigmoid and far lateral shapes Skull base v3 gives its fitted posterior fossa (skullbase_pfossa.py).

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_pfossa.py
  (after skullbase_pfossa_export.py, skullbase_v1_skull.py and SB_PROFILE=v1 skullbase_v3_approach.py, which gives the
  retrosigmoid craniotomy; then skullbase_v1.py brain)

The parts are Z-Anatomy's (pfossa_export.json, already in v1's frame): nothing is fitted. The shapes are v3's
(skullbase_pfossa.telovelar, retrosigmoid, far_lateral) with their parameters: the tonsils drawn apart and the inferior
vermis lifted; the right tonsil and biventral lobule lifted superomedially;
the right hemisphere drawn back along the corridors from the internal acoustic meatus (v1's located one) and from where
the trigeminal nerve leaves the pons (Z-Anatomy's own nerve) out to the retrosigmoid craniotomy cut on v1's skull; each
kept off bone (Z-Anatomy's, rasterised) and off the arteries Z-Anatomy draws; the arteries lying on the cerebellum
carried with it (carry_arteries). Where Z-Anatomy's hindbrain reaches into its
own bone or arteries at rest (the pons into the clivus), it is first pushed clear as v3 clears its fitted one
(skullbase_pfossa.clear). Shapes, not simulations of the tissue.

Z-Anatomy's cerebellar arteries run inside its cerebellum in places: they are moved out onto its surface first
(onto_surface), and the hindbrain is kept under Z-Anatomy's own tentorium as off bone. The floor of the fourth ventricle
gets Skull base v3's landmarks over Z-Anatomy's own cranial nerve nuclei (rhomboid).

Writes pipeline/data/build/skullbase/pf_*.glb, the carried arteries' sb_*.glb again (with the shapes) and pfossa.json (the manifest's items, texts and the shapes' report).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sp
import trimesh
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import brain_deform as BD  # noqa: E402
import skullbase_build as SB  # noqa: E402
import skullbase_brain as SBB  # noqa: E402
import skullbase_pfossa as PF  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"


SB_V1_CAVITY_SEAL_MM = 7.0   # (as skullbase_v3_approach.py's v1 profile)
FM_RADIUS_MM = 22.0
FM_ABOVE_MM = 4.0


def tentorium(ex: dict, a: np.ndarray, shape: tuple) -> np.ndarray:
    """Z-Anatomy's tentorium cerebelli on the bone grid, TENTORIUM_MM thick: the cerebellum is kept under it as off bone
    (its own cerebellum reaches above it in places)."""
    out = np.zeros(shape, bool)
    for k, m_ in ex["soft"].items():
        if not k.startswith("Tentorium cerebelli"):
            continue
        m = trimesh.Trimesh(np.array(m_["verts"], float), np.array(m_["tris"], int), process=False)
        P = np.vstack([m.vertices, m.sample(int(m.area / 0.05), seed=0)])
        ijk = np.rint((P - a[:3, 3]) / a[0, 0]).astype(int)
        ok = np.all((ijk >= 0) & (ijk < np.array(shape)), 1)
        out[tuple(ijk[ok].T)] = True
    return ndimage.binary_dilation(out, iterations=max(1, int(round(TENTORIUM_MM / 2 / a[0, 0]))))


TENTORIUM_MM = 1.0


class V1Fossa:
    """v1's bone (positive outside it; outside the cranial cavity counts as bone, but for the foramen magnum's way out,
    and so does Z-Anatomy's tentorium)
    and the arteries Z-Anatomy draws near the hindbrain, as skullbase_pfossa's Fossa
    gives them to the shapes."""

    def __init__(self, ex: dict):
        c = np.load(BUILD / "skull_bone.npz")
        b, a = c["b"].astype(np.float32), c["a"]
        k = int(round(1.0 / a[0, 0]))
        import skullbase_ct as K
        K.CAVITY_SEAL_MM = SB_V1_CAVITY_SEAL_MM
        cav = K.cavity(b, a, float(a[0, 0]))
        # what is not the cranial cavity counts as bone (Z-Anatomy's cerebellum passes right through its thin occipital
        # squama in places), except the way out through the foramen magnum (below FM_ABOVE_MM over it, within FM_RADIUS_MM
        # of its axis), where the medulla goes on
        idx = np.indices(b.shape, sparse=True)
        X = [a[i, i] * idx[i] + a[i, 3] for i in range(3)]
        fm = next(np.array(lm["ras"], float) for lm in json.loads((GEN / "sb-landmarks.json").read_text()) if lm["name"] == "Foramen magnum")
        canal = ((X[0] - fm[0]) ** 2 + (X[1] - fm[1]) ** 2 <= FM_RADIUS_MM ** 2) & (X[2] <= fm[2] + FM_ABOVE_MM)
        B = ((b > 0.4) | (~cav & ~canal) | tentorium(ex, a, b.shape))[::k, ::k, ::k]
        self.bone = BD.Field(PF.sdf(B, 1.0), a[:3, 3], 1.0, 30.0)
        # (skullbase_pfossa's clearance and shapes keep the cerebellum off the "roof", the bone and the tentorium: here
        # the bone field holds Z-Anatomy's tentorium already)
        self.roof = self.bone
        pts, nrm, self.lines = [], [], {}
        for n, ln in ex["lines"].items():
            if ln.get("kind") != "artery" or n.rsplit(".", 1)[0] not in PF.DRAWN_VESSELS:
                continue
            for k, run in enumerate(ln["runs"]):
                run = np.array(run, float)
                self.lines[f"{n}#{k}"] = run
                v, nn, _ = SB.tube(run)
                pts.append(v)
                nrm.append(nn)
        self.vessel_pts, self.vessel_nrm = np.vstack(pts), np.vstack(nrm)
        self.vessel_tree = cKDTree(self.vessel_pts)

    def vessel_sdf(self, P: np.ndarray):
        d, j = self.vessel_tree.query(P)
        s = ((P - self.vessel_pts[j]) * self.vessel_nrm[j]).sum(1)
        return np.where(d < 3.0, s, d), self.vessel_nrm[j]


def meatus_r() -> np.ndarray:
    return np.array(next(lm["ras"] for lm in json.loads((GEN / "sb-landmarks.json").read_text())
                         if lm["name"] == "Internal acoustic meatus" and lm.get("side") == "R"), float)


def trigeminal_root(ex: dict, parts: dict, side: str = "R") -> np.ndarray:
    """Where Z-Anatomy's trigeminal nerve leaves its pons: the last point of the nerve within 2 mm of the pons."""
    V = np.array(max(ex["lines"][f"Trigeminal nerve (V).{side.lower()}"]["runs"], key=len), float)[:, :3]
    pons = np.vstack([parts[n][0] for n in parts if n.startswith("Pons")])
    d = cKDTree(pons).query(V)[0]
    near = np.nonzero(d <= 2.0)[0]
    return V[near[-1] if len(near) else int(np.argmin(d))]


def rhomboid(parts: dict) -> list[dict]:
    """The floor of the fourth ventricle's landmarks for the telovelar view, by skullbase_v3_rhomboid's rules on this
    model's own ventricle (as drawn, after clear): Z-Anatomy's cranial nerve nuclei (the brainstem section's export,
    the same model in a frame a translation away: found from the ventricle, which both carry vertex for vertex) under
    the facial colliculus, the hypoglossal and vagal trigones and the vestibular area; the obex and the median sulcus at
    the midline."""
    import skullbase_v3_rhomboid as RH
    bs = json.loads((ROOT / "data" / "build" / "brainstem" / "export.json").read_text())["meshes"]
    pf = json.loads((BUILD / "pfossa_export.json").read_text())["meshes"]
    V = np.array(pf["Fourth ventricle"]["verts"], float)                      # this model's ventricle, as exported
    shift = (V - np.array(bs["Fourth ventricle"]["verts"], float)).mean(0)      # (the brainstem export's frame -> this one)
    X = parts["Fourth ventricle"][0]                                           # ... as drawn (pushed clear), the same vertices
    stem = np.vstack([np.array(pf[n]["verts"], float) for n in pf if n.split(".")[0] in ("Pons", "Medulla oblongata")])
    floor = np.nonzero(cKDTree(stem).query(V)[0] <= RH.FLOOR_MM)[0]
    out, fc = [], {}

    def add(name, side, i, on, placed):
        out.append({"id": f"lm_{RH.slug(name)}" + ("" if side == "M" else f"_{side.lower()}"), "name": name, "bone": on,
                    "part": "Floor of fourth ventricle", "ras": np.round(X[i], 2).tolist(), "side": side,
                    "boneFrom": "the model's own (Z-Anatomy)", "distanceToBoneMm": 0.0, "placed": placed})
    for name, (nucleus, on) in RH.OVER.items():
        for sd in "RL":
            c = np.array(bs[f"{nucleus}.{sd.lower()}"]["verts"], float).mean(0) + shift
            own = floor[np.sign(V[floor, 0]) == (1 if sd == "R" else -1)]
            _, j = cKDTree(V[own][:, [0, 2]]).query(c[[0, 2]])
            i = int(own[j])
            if name == "Facial colliculus":
                fc[sd] = V[i]
            add(name, sd, i, on, f"Drawn by rule: Z-Anatomy does not label it. On the floor of its fourth ventricle, straight behind the "
                                 f"middle of its {nucleus.lower()} ({np.linalg.norm(V[i] - c):.1f} mm from it), as Skull base v3 places it (approximate).")
    mid = floor[np.abs(V[floor, 0]) <= RH.MIDLINE_MM]
    add("Obex", "M", int(mid[np.argmin(V[mid, 2])]), "Medulla oblongata",
        "Drawn by rule: the caudal tip of the floor of Z-Anatomy's fourth ventricle at the midline (approximate).")
    level = (fc["R"] + fc["L"]) / 2
    add("Median sulcus of fourth ventricle", "M", int(mid[np.argmin(np.linalg.norm(V[mid] - level, axis=1))]), "Pons",
        "Drawn by rule: the floor of Z-Anatomy's fourth ventricle at the midline at the level of the facial colliculi (approximate).")
    return out


def onto_surface(ex: dict, parts: dict) -> dict:
    """Z-Anatomy's cerebellar arteries (CARRIED) run inside its cerebellum in places: where a centre line lies inside a
    hindbrain part (each part filled on its own, so the fissures between them stay open), it is moved out along the
    part's distance field until its surface is SURFACE_GAP_MM clear, the move then smoothed along the vessel (it may
    only grow) and applied again, a few rounds. The lines are changed in ex (the tubes are built from them, and the
    hindbrain is kept off them). Returns {artery: {"points": moved, "maxMm": largest move}}."""
    import skullbase_brain as SBB2
    from skullbase_brain import fill
    allv = np.vstack([v for v, _, _ in parts.values()])
    lo = allv.min(0) - 6
    shape = tuple(np.ceil((allv.max(0) + 6 - lo) / SURFACE_STEP).astype(int) + 1)
    solid = np.zeros(shape, bool)
    for v, t, _ in parts.values():
        # (by parity: most of Z-Anatomy's parts are not closed as stored, their seams' vertices doubled, yet each
        # encloses a clear volume, which the parity fill finds; filling the holes of a one-voxel shell of their surface
        # found a fifth of it or less (the inferior semilunar lobule 2.5 of its 18.1 ml), so the arteries running
        # through the lobules were left there: half of the PICA)
        solid |= fill(v, t, lo, shape, SURFACE_STEP)
    sd = SBB2.sdf(solid, SURFACE_STEP)                # (positive outside)
    grad = np.stack(np.gradient(sd, SURFACE_STEP))

    def at(F, P):
        return ndimage.map_coordinates(F, ((P - lo) / SURFACE_STEP).T, order=1, mode="nearest")
    out = {}
    for key, ln in ex["lines"].items():
        base = key.rsplit(".", 1)[0]
        if base not in CARRIED:
            continue
        new_runs, moved, big = [], 0, 0.0
        for run in ln["runs"]:
            R = np.array(run, float)
            P0, r = R[:, :3].copy(), R[:, 3]
            P = P0.copy()
            for _ in range(SURFACE_ROUNDS):
                s_ = at(sd, P)
                need = np.maximum(r, 0.3) + SURFACE_GAP_MM
                bad = s_ < need
                if not bad.any():
                    break
                g = np.stack([at(grad[k], P) for k in range(3)], 1)
                g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
                D = P - P0
                D[bad] += ((need - s_)[bad])[:, None] * g[bad]
                Ds = ndimage.gaussian_filter1d(D, SURFACE_SMOOTH_PTS, axis=0, mode="nearest")
                keep = np.linalg.norm(Ds, axis=1) >= np.linalg.norm(D, axis=1)
                D = np.where(keep[:, None], Ds, D)
                P = P0 + D
            # (the moved path smoothed, its ends kept, so its tube does not fold over itself where neighbouring points
            # went different ways; where the smoothing let it back in, the unsmoothed path again, blended in along the
            # vessel: a switch from one to the other point by point left bends tighter than the tube, which folded it)
            if (np.linalg.norm(P - P0, axis=1) > 0.05).any() and len(P) > 4:
                Ps = ndimage.gaussian_filter1d(P, SURFACE_PATH_SMOOTH, axis=0, mode="nearest")
                Ps[[0, -1]] = P[[0, -1]]
                need = np.maximum(r, 0.3) + SURFACE_GAP_MM
                back = (at(sd, Ps) < need).astype(float)
                w = np.clip(ndimage.gaussian_filter1d(back, SURFACE_BLEND_PTS, mode="nearest") * 2.5, 0, 1)
                w = np.maximum(w, back)
                P = w[:, None] * P + (1 - w[:, None]) * Ps
                # bends still tighter than the tube relaxed towards their neighbours, where that keeps it clear
                for _ in range(SURFACE_RELAX_ROUNDS):
                    k = np.flatnonzero(_bend_radius(P) < SURFACE_BEND_X * r[1:-1]) + 1
                    if not len(k):
                        break
                    Q = P.copy()
                    Q[k] = 0.5 * P[k] + 0.25 * (P[k - 1] + P[k + 1])
                    ok = at(sd, Q[k]) >= need[k] - SURFACE_RELAX_SLACK_MM
                    P[k[ok]] = Q[k[ok]]
            d = np.linalg.norm(P - P0, axis=1)
            moved += int((d > 0.1).sum())
            big = max(big, float(d.max()))
            new_runs.append(np.c_[P, r].round(3).tolist())
        ln["runs"] = new_runs
        out[key] = {"points": moved, "maxMm": round(big, 2)}
    return out


SURFACE_STEP = 0.5
SURFACE_GAP_MM = 0.2      # (an artery moved out of the cerebellum: its surface this far off the part's)
SURFACE_ROUNDS = 8
SURFACE_SMOOTH_PTS = 3.0
SURFACE_PATH_SMOOTH = 1.5
SURFACE_BLEND_PTS = 2.0      # the unsmoothed path blended back in over this many points (Gaussian) either side
SURFACE_BEND_X = 1.2         # a bend tighter than this times the tube's radius is relaxed ...
SURFACE_RELAX_ROUNDS = 30    # ... a point at a time towards its neighbours, for at most this many rounds,
SURFACE_RELAX_SLACK_MM = 0.1 # ... where that leaves it no more than this short of its clearance


def _bend_radius(P: np.ndarray) -> np.ndarray:
    """The radius of the circle through each point and its two neighbours (mm; interior points)."""
    a, b = P[1:-1] - P[:-2], P[2:] - P[1:-1]
    la, lb = np.linalg.norm(a, axis=1), np.linalg.norm(b, axis=1)
    ang = np.arccos(np.clip(np.einsum("ij,ij->i", a, b) / np.maximum(la * lb, 1e-9), -1, 1))
    return np.where(ang > 1e-6, 0.5 * (la + lb) / np.maximum(2 * np.sin(ang / 2), 1e-9), 1e9)


def carry_arteries(ex: dict, parts: dict, moves: dict, rs_moves: dict, fl_moves: dict, flb_moves: dict) -> dict:
    """Z-Anatomy draws the cerebellar arteries' branches on the cerebellum's surface: each one's tube (CARRIED; as
    skullbase_build.py wrote it) given the shapes' morph targets, each tube vertex moved as the hindbrain's nearest
    vertex is (its mean over CARRY_K of them), in full within CARRY_NEAR_MM of the hindbrain, fading to nothing at
    CARRY_FAR_MM. The brainstem does not move, so where an artery runs along it, it stays; the trunks (vertebral,
    basilar) and the posterior cerebral artery (above the tentorium) are not carried. Returns {artery: its largest move, mm}."""
    import skullbase_build as SBld
    P = np.vstack([parts[n][0] for n in parts])
    D = np.vstack([np.c_[moves[n], rs_moves[n], fl_moves[n], flb_moves[n]] for n in parts])
    tree = cKDTree(P)
    # the hindbrain at rest and as each shape poses it, its distance field: the carried tubes are pushed out of it where
    # the nearest-vertex carry left them inside (the shapes move the cerebellum unevenly near an artery). The far
    # lateral view's second shape is used with the first: its pose is the two together
    sh = {n: np.c_[moves[n], rs_moves[n], fl_moves[n], flb_moves[n]] for n in parts}
    rest = hindbrain_field({n: (parts[n][0], parts[n][1]) for n in parts})
    posed = [hindbrain_field({n: (parts[n][0] + sh[n][:, 3 * k:3 * k + 3] + (sh[n][:, 6:9] if k == 3 else 0), parts[n][1])
                              for n in parts}) for k in range(4)]
    out = {}
    for base in sorted({n.rsplit(".", 1)[0] for n, ln in ex["lines"].items() if ln.get("kind") == "artery"} & set(CARRIED)):
        f = BUILD / f"{SBld.slug(base)}.glb"
        nodes = []
        for name in ("L", "R"):         # (its tube built again from its lines, as skullbase_build.py builds it)
            vs, ns, ts, off = [], [], [], 0
            for run in ex["lines"].get(f"{base}.{name.lower()}", {}).get("runs", []):
                v_, n_, t_ = SBld.tube(np.array(run, float))
                if len(t_):
                    vs.append(v_); ns.append(n_); ts.append(t_ + off); off += len(v_)
            if not ts:
                continue
            pos, nrm, tri = np.vstack(vs), np.vstack(ns), np.vstack(ts)
            A = BD.adjacency(np.array(tri, int), len(pos)) + sp.identity(len(pos))
            deg = np.asarray(A.sum(1)).ravel()[:, None]
            pos = pos + out_of(pos, *rest, A, deg)       # (at rest too, where the path's bends were eased)
            d, j = tree.query(pos, k=CARRY_K)
            w = np.clip((CARRY_FAR_MM - d.mean(1)) / (CARRY_FAR_MM - CARRY_NEAR_MM), 0, 1)
            M = D[j].mean(1) * w[:, None]
            # (each cross-section moved as one: the moves averaged over the tube's own mesh, CARRY_SMOOTH rounds)
            for _ in range(CARRY_SMOOTH):
                M = (A @ M) / deg
            for k, (lo_, sd_, gr_) in enumerate(posed):
                base_ = pos + M[:, 3 * k:3 * k + 3] + (M[:, 6:9] if k == 3 else 0)
                M[:, 3 * k:3 * k + 3] += out_of(base_, lo_, sd_, gr_, A, deg)
            nodes.append({"name": name, "positions": pos, "normals": nrm, "indices": np.array(tri, int), "mode": TRIANGLES, "M": M})
        # how much of the tube lies inside the hindbrain (more than 0.3 mm), at rest and as each shape poses it
        def inside(X, fld):
            v = ndimage.map_coordinates(fld[1], ((X - fld[0]) / SURFACE_STEP).T, order=1, mode="nearest")
            return [round(float(np.mean(v < -0.3)), 4), round(float(max(0.0, -v.min())), 2)]
        IN_HINDBRAIN[base] = {nd["name"]: {"rest": inside(nd["positions"], rest),
                                           **{nm: inside(nd["positions"] + nd["M"][:, 3 * k:3 * k + 3] + (nd["M"][:, 6:9] if k == 3 else 0), posed[k])
                                              for k, nm in enumerate(("telovelar", "retrosigmoid", "farLateral", "farLateralBack"))}}
                              for nd in nodes}
        big = max((float(np.linalg.norm(nd["M"], axis=1).max()) for nd in nodes), default=0.0)
        if big < CARRY_MIN_MM:
            continue
        for nd in nodes:
            M = nd.pop("M")
            # (a tube's normals barely turn under a move this smooth: kept)
            nd["targets"] = [{"name": "telovelar", "positions": M[:, :3], "normals": np.zeros_like(M[:, :3])},
                             {"name": "retrosigmoid", "positions": M[:, 3:6], "normals": np.zeros_like(M[:, :3])},
                             {"name": "farLateral", "positions": M[:, 6:9], "normals": np.zeros_like(M[:, :3])},
                             {"name": "farLateralBack", "positions": M[:, 9:], "normals": np.zeros_like(M[:, :3])}]
        write_glb(f, nodes, {"id": SBld.slug(base)})
        out[base] = round(big, 2)
    return out


def hindbrain_field(parts: dict) -> tuple:
    """The hindbrain's parts (each by parity, as onto_surface fills them) as one solid, its signed distance (positive
    outside) and gradient, on a SURFACE_STEP grid."""
    import skullbase_brain as SBB2
    from skullbase_brain import fill
    allv = np.vstack([v for v, _ in parts.values()])
    lo = allv.min(0) - 6
    shape = tuple(np.ceil((allv.max(0) + 6 - lo) / SURFACE_STEP).astype(int) + 1)
    solid = np.zeros(shape, bool)
    for v, t in parts.values():
        solid |= fill(v, t, lo, shape, SURFACE_STEP)
    sd = SBB2.sdf(solid, SURFACE_STEP)
    return lo, sd, np.stack(np.gradient(sd, SURFACE_STEP))


def out_of(Q: np.ndarray, lo: np.ndarray, sd: np.ndarray, grad: np.ndarray, A, deg) -> np.ndarray:
    """A carried tube's vertices (Q, as posed) pushed out of the posed hindbrain to SURFACE_GAP_MM, the push spread over
    the tube's own mesh (so a cross-section moves as one; a vertex's push may only grow), POSED_ROUNDS rounds."""
    def at(F, X):
        return ndimage.map_coordinates(F, ((X - lo) / SURFACE_STEP).T, order=1, mode="nearest")
    Dp = np.zeros_like(Q)
    for _ in range(POSED_ROUNDS):
        X = Q + Dp
        s_ = at(sd, X)
        bad = s_ < SURFACE_GAP_MM
        if not bad.any():
            break
        g = np.stack([at(grad[k], X) for k in range(3)], 1)
        g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        step = np.zeros_like(Q)
        step[bad] = ((SURFACE_GAP_MM - s_)[bad] + 0.05)[:, None] * g[bad]
        for _ in range(POSED_SMOOTH):
            sm = (A @ step) / deg
            step = np.where((np.linalg.norm(sm, axis=1) >= np.linalg.norm(step, axis=1))[:, None], sm, step)
        Dp = Dp + step
    return Dp


IN_HINDBRAIN: dict = {}  # (carry_arteries: per artery and side, per pose, [share of the tube > 0.3 mm in, deepest mm])
POSED_ROUNDS = 8
POSED_SMOOTH = 6
CARRIED = ("Superior cerebellar artery", "Anterior inferior cerebellar artery", "Posterior inferior cerebellar artery")
CARRY_K = 4
CARRY_SMOOTH = 12
CARRY_NEAR_MM = 2.0
CARRY_FAR_MM = 5.0
CARRY_MIN_MM = 0.5      # (an artery moved less than this anywhere is left as it is)


def main() -> int:
    np.random.seed(0)        # (and trimesh's surface samples are seeded where they are taken: it ignores this seed)
    ex = json.loads((BUILD / "export.json").read_text())
    pf = json.loads((BUILD / "pfossa_export.json").read_text())
    parts = {}
    for n, m in pf["meshes"].items():
        v, t = np.array(m["verts"], float), np.array(m["tris"], int)
        t = t[:, ::-1].copy() if PF.signed_volume(v, t) < 0 else t
        parts[n] = (v, t, PF.side_of(n, v))
    # the cerebellar arteries out of the cerebellum onto its surface first (the hindbrain is then kept off them)
    surf = onto_surface(ex, parts)
    fs = V1Fossa(ex)
    in_bone = {n: int((fs.bone(v, grad=False) < 0).sum()) for n, (v, _, _) in parts.items()}
    # Z-Anatomy's hindbrain reaches into its own bone in places (the pons into the clivus): pushed clear as v3 clears its
    # fitted one (skullbase_pfossa.clear: off bone by BONE_GAP_MM and off the drawn arteries, the pushes spread)
    rc = PF.clear(parts, fs)
    # the arteries again onto the hindbrain's surface as cleared: the clearance moves it (out of the bone, up to some
    # 9 mm), back over arteries already moved out of it, and its own check reads the hindbrain's vertices, between which
    # a thin artery passes (half of the PICA lay inside the cerebellum, up to 4.7 mm deep)
    surf_after = onto_surface(ex, parts)
    # the retrosigmoid corridor from v1's own meatus to v1's own craniotomy
    PF.BUILD = BUILD
    PF.meatus_r = meatus_r
    moves = PF.telovelar(parts, fs)
    root = trigeminal_root(ex, parts)
    rs_moves = PF.retrosigmoid(parts, fs, root)
    fl_moves = PF.far_lateral(parts, fs)
    flb_moves = PF.far_lateral_back(parts, fs)
    lic = "CC BY-SA 4.0 (Z-Anatomy); BodyParts3D CC BY-SA 2.1 Japan; definitions from Wikipedia, CC BY-SA 3.0"
    cite = "Mitsuhashi N, Fujieda K, Tamura T, Kawamoto S, Takagi T, Okubo K. BodyParts3D: 3D structure database for anatomical concepts. Nucleic Acids Res. 2009;37(Database issue):D782-D785. doi:10.1093/nar/gkn613."
    items = []
    for pid, name, members, tok, cat, moving in PF.PIECES:
        nodes, cent = [], {}
        for s in ("L", "R"):
            Vs, Ts, Ds, off = [], [], [], 0
            for n, (X, t, side) in parts.items():
                if not any(n == m or n.startswith(m + ".") for m in members):
                    continue
                fsel = (side[t] == s).sum(1) >= 2
                if not fsel.any():
                    continue
                used, inv = np.unique(t[fsel], return_inverse=True)
                Vs.append(X[used])
                Ds.append(np.c_[moves[n][used], rs_moves[n][used], fl_moves[n][used], flb_moves[n][used]])
                Ts.append(inv.reshape(-1, 3) + off)
                off += len(used)
            if not Vs:
                continue
            v, tt, DD = np.vstack(Vs), np.vstack(Ts), np.vstack(Ds)
            D, DR, DF, DB = DD[:, :3], DD[:, 3:6], DD[:, 6:9], DD[:, 9:]
            node = {"name": s, "positions": v, "normals": PF.normals(v, tt), "indices": tt, "mode": TRIANGLES}
            if moving:
                node["targets"] = [{"name": "telovelar", "positions": D, "normals": PF.normals(v + D, tt) - node["normals"]},
                                   {"name": "retrosigmoid", "positions": DR, "normals": PF.normals(v + DR, tt) - node["normals"]},
                                   {"name": "farLateral", "positions": DF, "normals": PF.normals(v + DF, tt) - node["normals"]},
                                   {"name": "farLateralBack", "positions": DB, "normals": PF.normals(v + DB, tt) - node["normals"]}]
            nodes.append(node)
            cent[s] = v.mean(0).round(2).tolist()
        write_glb(BUILD / f"{pid}.glb", nodes, {"id": pid})
        items.append({"id": pid, "name": name, "aliases": [], "type": "soft", "file": f"assets/skullbase/{pid}.glb", "bytes": 0,
                      "colour": SBB.colour(tok), "dataset": "zanatomy",
                      "source": "Z-Anatomy (based on BodyParts3D)", "licence": lic, "citation": [cite],
                      "citationUrls": ["https://doi.org/10.1093/nar/gkn613"], "refIds": [], "category": cat, "layer": "cortex",
                      "morph": moving, "centroid": {"L": cent.get("L", cent.get("R")), "R": cent.get("R", cent.get("L"))},
                      "derivation": (f"Z-Anatomy's (BodyParts3D: {', '.join(members).lower()}); where it reached into or through this model's "
                                     "bone (out of its cranial cavity) or into an artery it draws, pushed clear (1 mm inside the cavity)."
                                     + (" Its shapes for the surgical views (the tonsils drawn apart and the inferior vermis lifted; the right "
                                        "hemisphere drawn back from the petrous bone; the right tonsil and biventral lobule lifted) are Skull base v3's rules, run on this model "
                                        "(skullbase_v1_pfossa.py): shapes, not simulations of the tissue." if moving else ""))})
    carried = carry_arteries(ex, parts, moves, rs_moves, fl_moves, flb_moves)
    lms = rhomboid(parts)
    mv = np.vstack([moves[n] for n in parts])
    rv = np.vstack([rs_moves[n] for n in parts])
    report = {"telovelarMaxMm": round(float(np.linalg.norm(mv, axis=1).max()), 2),
              "retrosigmoidMaxMm": round(float(np.linalg.norm(rv, axis=1).max()), 2),
              "farLateral": PF.far_lateral_report(parts, fl_moves, fs),
              "farLateralBack": PF.far_lateral_back_report(parts, flb_moves, fs),
              "inBoneAtRest": in_bone, "clear": rc, "trigeminalRoot": root.round(2).tolist(), "carried": carried,
              "ontoSurface": surf, "ontoSurfaceAfterClear": surf_after, "arteriesInHindbrain": IN_HINDBRAIN}
    from modifications import record
    record("sb", "skullbase_v1_pfossa", "the cerebellar arteries onto the cerebellum's surface; the hindbrain pushed off bone, the tentorium and "
           "the arteries; the arteries carried with the telovelar, retrosigmoid and far lateral shapes",
           [*CARRIED, *[n.split(".")[0] for n in parts]], {"surfaceGapMm": SURFACE_GAP_MM, "tentoriumMm": TENTORIUM_MM, "carryNearMm": CARRY_NEAR_MM,
                                                          "carryFarMm": CARRY_FAR_MM},
           {"ontoSurface": surf, "clear": rc, "carried": carried}, {"inBoneAfter": rc["inBoneAfter"], "inVesselAfter": rc["inVesselAfter"]})
    (BUILD / "pfossa.json").write_text(json.dumps({"items": items, "texts": pf["texts"], "report": report, "landmarks": lms}, indent=1))
    print("posterior fossa (v1)", report["telovelarMaxMm"], report["retrosigmoidMaxMm"], report["farLateral"], "cleared", rc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
