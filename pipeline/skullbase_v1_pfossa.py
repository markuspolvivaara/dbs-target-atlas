"""Skull base v1 (the Z-Anatomy model): its own cerebellum, brainstem and fourth ventricle, with the telovelar and
retrosigmoid shapes Skull base v3 gives its fitted posterior fossa (skullbase_pfossa.py).

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_pfossa.py
  (after skullbase_pfossa_export.py, skullbase_v1_skull.py and SB_PROFILE=v1 skullbase_v3_approach.py, which gives the
  retrosigmoid craniotomy; then skullbase_v1.py brain)

The parts are Z-Anatomy's (pfossa_export.json, already in v1's frame): nothing is fitted. The shapes are v3's
(skullbase_pfossa.telovelar, retrosigmoid) with their parameters: the tonsils drawn apart and the inferior vermis lifted;
the right hemisphere drawn back along the corridors from the internal acoustic meatus (v1's located one) and from where
the trigeminal nerve leaves the pons (Z-Anatomy's own nerve) out to the retrosigmoid craniotomy cut on v1's skull; each
kept off bone (Z-Anatomy's, rasterised) and off the arteries Z-Anatomy draws; the arteries lying on the cerebellum
carried with it (carry_arteries). Where Z-Anatomy's hindbrain reaches into its
own bone or arteries at rest (the pons into the clivus), it is first pushed clear as v3 clears its fitted one
(skullbase_pfossa.clear). Shapes, not simulations of the tissue.

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


class V1Fossa:
    """v1's bone (positive outside it; outside the cranial cavity counts as bone, but for the foramen magnum's way out)
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
        B = ((b > 0.4) | (~cav & ~canal))[::k, ::k, ::k]
        self.bone = BD.Field(PF.sdf(B, 1.0), a[:3, 3], 1.0, 30.0)
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


def carry_arteries(ex: dict, parts: dict, moves: dict, rs_moves: dict) -> dict:
    """Z-Anatomy draws the cerebellar arteries' branches on the cerebellum's surface: each one's tube (CARRIED; as
    skullbase_build.py wrote it) given the shapes' morph targets, each tube vertex moved as the hindbrain's nearest
    vertex is (its mean over CARRY_K of them), in full within CARRY_NEAR_MM of the hindbrain, fading to nothing at
    CARRY_FAR_MM. The brainstem does not move, so where an artery runs along it, it stays; the trunks (vertebral,
    basilar) and the posterior cerebral artery (above the tentorium) are not carried. Returns {artery: its largest move, mm}."""
    import skullbase_build as SBld
    from winding_check import read_nodes
    P = np.vstack([parts[n][0] for n in parts])
    D = np.vstack([np.c_[moves[n], rs_moves[n]] for n in parts])
    tree = cKDTree(P)
    out = {}
    for base in sorted({n.rsplit(".", 1)[0] for n, ln in ex["lines"].items() if ln.get("kind") == "artery"} & set(CARRIED)):
        f = BUILD / f"{SBld.slug(base)}.glb"
        if not f.exists():
            continue
        nodes = []
        for name, pos, nrm, tri in read_nodes(f):
            pos, nrm = np.array(pos, float), np.array(nrm, float)
            d, j = tree.query(pos, k=CARRY_K)
            w = np.clip((CARRY_FAR_MM - d.mean(1)) / (CARRY_FAR_MM - CARRY_NEAR_MM), 0, 1)
            M = D[j].mean(1) * w[:, None]
            # (each cross-section moved as one: the moves averaged over the tube's own mesh, CARRY_SMOOTH rounds)
            A = BD.adjacency(np.array(tri, int), len(pos)) + sp.identity(len(pos))
            deg = np.asarray(A.sum(1)).ravel()[:, None]
            for _ in range(CARRY_SMOOTH):
                M = (A @ M) / deg
            nodes.append({"name": name, "positions": pos, "normals": nrm, "indices": np.array(tri, int), "mode": TRIANGLES, "M": M})
        big = max((float(np.linalg.norm(nd["M"], axis=1).max()) for nd in nodes), default=0.0)
        if big < CARRY_MIN_MM:
            continue
        for nd in nodes:
            M = nd.pop("M")
            # (a tube's normals barely turn under a move this smooth: kept)
            nd["targets"] = [{"name": "telovelar", "positions": M[:, :3], "normals": np.zeros_like(M[:, :3])},
                             {"name": "retrosigmoid", "positions": M[:, 3:], "normals": np.zeros_like(M[:, :3])}]
        write_glb(f, nodes, {"id": SBld.slug(base)})
        out[base] = round(big, 2)
    return out


CARRIED = ("Superior cerebellar artery", "Anterior inferior cerebellar artery", "Posterior inferior cerebellar artery")
CARRY_K = 4
CARRY_SMOOTH = 12
CARRY_NEAR_MM = 2.0
CARRY_FAR_MM = 5.0
CARRY_MIN_MM = 0.5      # (an artery moved less than this anywhere is left as it is)


def main() -> int:
    ex = json.loads((BUILD / "export.json").read_text())
    pf = json.loads((BUILD / "pfossa_export.json").read_text())
    parts = {}
    for n, m in pf["meshes"].items():
        v, t = np.array(m["verts"], float), np.array(m["tris"], int)
        t = t[:, ::-1].copy() if PF.signed_volume(v, t) < 0 else t
        parts[n] = (v, t, PF.side_of(n, v))
    fs = V1Fossa(ex)
    in_bone = {n: int((fs.bone(v, grad=False) < 0).sum()) for n, (v, _, _) in parts.items()}
    # Z-Anatomy's hindbrain reaches into its own bone in places (the pons into the clivus): pushed clear as v3 clears its
    # fitted one (skullbase_pfossa.clear: off bone by BONE_GAP_MM and off the drawn arteries, the pushes spread)
    rc = PF.clear(parts, fs)
    # the retrosigmoid corridor from v1's own meatus to v1's own craniotomy
    PF.BUILD = BUILD
    PF.meatus_r = meatus_r
    moves = PF.telovelar(parts, fs)
    root = trigeminal_root(ex, parts)
    rs_moves = PF.retrosigmoid(parts, fs, root)
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
                Ds.append(np.c_[moves[n][used], rs_moves[n][used]])
                Ts.append(inv.reshape(-1, 3) + off)
                off += len(used)
            if not Vs:
                continue
            v, tt, DD = np.vstack(Vs), np.vstack(Ts), np.vstack(Ds)
            D, DR = DD[:, :3], DD[:, 3:]
            node = {"name": s, "positions": v, "normals": PF.normals(v, tt), "indices": tt, "mode": TRIANGLES}
            if moving:
                node["targets"] = [{"name": "telovelar", "positions": D, "normals": PF.normals(v + D, tt) - node["normals"]},
                                   {"name": "retrosigmoid", "positions": DR, "normals": PF.normals(v + DR, tt) - node["normals"]}]
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
                                        "hemisphere drawn back from the petrous bone) are Skull base v3's rules, run on this model "
                                        "(skullbase_v1_pfossa.py): shapes, not simulations of the tissue." if moving else ""))})
    carried = carry_arteries(ex, parts, moves, rs_moves)
    mv = np.vstack([moves[n] for n in parts])
    rv = np.vstack([rs_moves[n] for n in parts])
    report = {"telovelarMaxMm": round(float(np.linalg.norm(mv, axis=1).max()), 2),
              "retrosigmoidMaxMm": round(float(np.linalg.norm(rv, axis=1).max()), 2),
              "inBoneAtRest": in_bone, "clear": rc, "trigeminalRoot": root.round(2).tolist(), "carried": carried}
    (BUILD / "pfossa.json").write_text(json.dumps({"items": items, "texts": pf["texts"], "report": report}, indent=1))
    print("posterior fossa (v1)", report["telovelarMaxMm"], report["retrosigmoidMaxMm"], "cleared", rc)
    return 0


if __name__ == "__main__":
    sys.exit(main())
