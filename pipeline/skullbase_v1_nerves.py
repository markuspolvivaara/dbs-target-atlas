"""Skull base v1 (the Z-Anatomy model): its olfactory and optic nerves kept off its arteries, and the optic chiasm drawn
by Skull base v3's rule where Z-Anatomy's chiasm is.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v1_nerves.py
  (after skullbase_build.py; then compress.mjs skullbase and skullbase_build.py finalize)

Z-Anatomy's optic nerves and its olfactory tracts and striae run through its carotids, anterior and middle cerebral
arteries in places, and the striae through the optic nerves (its curves were drawn apart). The optic nerves are kept off
the arteries first; then the chiasm is drawn (below); then the olfactory nerve is kept off the arteries, the optic
nerves and tracts as drawn and the chiasm. Each nerve's centre line is moved out of the arteries until its
surface is GAP_MM off theirs: at each point, away from the nearest point of an artery's centre line (straight up where
the two cross), the move smoothed along the nerve (SMOOTH_PTS; it may only grow) and fading to nothing over END_MM at
the nerve's ends (the optic canal, the cribriform plate: they stay), a few rounds. The arteries stay as Z-Anatomy draws
them.

Z-Anatomy's chiasm is two rounded pads the nerves run into and meet between: it does not read as a crossing. It is
drawn instead by skullbase_v3_chiasm.draw where Z-Anatomy's pads are (their centre, plane and length), with Mncube 2019's
mean width and height, the optic nerves (as moved) turning in to its front corners and the optic tracts' first part.

Writes pipeline/data/build/skullbase/sb_olfactory_nerve_i.glb, sb_optic_nerve_ii.glb, sb_optic_chiasm.glb and
sb_optic_tract.glb, and the items into v1's manifest.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_build as SB  # noqa: E402
import skullbase_v3_chiasm as CH  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402

REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"
NERVES = ("Olfactory nerve (I)", "Optic nerve (II)")
GAP_MM = 0.3            # a nerve's surface kept this far off an artery's
END_MM = 4.0            # (the move fading to nothing over this at a nerve's ends)
SMOOTH_PTS = 3.0
ROUNDS = 12
REACH_MM = 40.0         # (the arteries within this of the nerves are the ones kept off)


def arteries(ex: dict, near: np.ndarray) -> np.ndarray:
    """Every artery's centre line near the nerves, every 0.4 mm, with its radius: (x, y, z, r)."""
    tree = cKDTree(near)
    out = []
    for ln in ex["lines"].values():
        if ln.get("kind") != "artery":
            continue
        for run in ln["runs"]:
            R = SB.resample(np.array(run, float))
            if len(R) and (tree.query(R[:, :3])[0] < REACH_MM).any():
                out.append(R)
    return np.vstack(out)


def clear_run(R: np.ndarray, A: np.ndarray, tree: cKDTree) -> np.ndarray:
    """A nerve's run (x, y, z, r) moved off the arteries A."""
    P0, r = R[:, :3].copy(), R[:, 3]
    s = np.r_[0, np.cumsum(np.linalg.norm(np.diff(P0, axis=0), axis=1))]
    w_end = np.clip(np.minimum(s, s[-1] - s) / END_MM, 0, 1)
    D = np.zeros_like(P0)
    for _ in range(ROUNDS):
        P = P0 + D
        d, j = tree.query(P, k=4)
        need = r[:, None] + A[j, 3] + GAP_MM
        worst = np.argmax(need - d, axis=1)
        jj = j[np.arange(len(P)), worst]
        dd = d[np.arange(len(P)), worst]
        nd = need[np.arange(len(P)), worst]
        bad = (dd < nd) & (w_end > 0)
        if not bad.any():
            break
        away = P - A[jj, :3]
        ln = np.linalg.norm(away, axis=1, keepdims=True)
        away = np.where(ln > 1e-3, away / np.maximum(ln, 1e-9), np.array([0, 0, 1.0]))
        D[bad] += ((nd - dd)[bad])[:, None] * away[bad]
        Ds = ndimage.gaussian_filter1d(D, SMOOTH_PTS, axis=0, mode="nearest")
        D = np.where((np.linalg.norm(Ds, axis=1) >= np.linalg.norm(D, axis=1))[:, None], Ds, D)
        D *= w_end[:, None]
    return np.c_[P0 + D, r]


def clear_nerve(ex: dict, n: str, A: np.ndarray, report: dict) -> dict:
    """One nerve's runs, each side, moved off the obstacles A (x, y, z, r)."""
    tree = cKDTree(A[:, :3])
    out = {}
    rep = report.setdefault(n, {"maxMovedMm": 0.0, "points": 0})
    for s in "lr":
        runs = []
        for run in ex["lines"][f"{n}.{s}"]["runs"]:
            R = SB.resample(np.array(run, float))
            M = clear_run(R, A, tree)
            runs.append(M)
            d = np.linalg.norm(M[:, :3] - R[:, :3], axis=1)
            rep["maxMovedMm"] = round(max(rep["maxMovedMm"], float(d.max())), 2)
            rep["points"] += int((d > 0.1).sum())
        out[s.upper()] = runs
    P = np.vstack([np.vstack(out[s]) for s in "LR"])
    d, j = tree.query(P[:, :3])
    rep["closestMm"] = round(float((d - P[:, 3] - A[j, 3]).min()), 2)      # (an end, which stays, can be closer)
    return out


def main() -> int:
    import skullbase_v3_cavernous as CAV
    from glb import read_glb_full
    ex = json.loads((BUILD / "export.json").read_text())
    nerve_pts = np.vstack([np.array(r, float)[:, :3] for n in NERVES for s in "lr" for r in ex["lines"][f"{n}.{s}"]["runs"]])
    A = arteries(ex, nerve_pts)
    report = {}
    # the optic nerves off the arteries, then the chiasm where Z-Anatomy's is, the nerves (as moved) ending in it
    optic = clear_nerve(ex, "Optic nerve (II)", A, report)
    V = np.vstack([np.array(ex["soft"][f"Optic chiasm.{s}"]["verts"], float) for s in "lr"])
    F = CH.frame(V)
    nerves = {}
    for s in "LR":
        R = max(optic[s], key=len)
        if abs(R[0, 0]) < abs(R[-1, 0]):          # (from the canal in, as v3's routes run)
            R = R[::-1]
        nerves[s] = (R[:, :3], R[:, 3])
    items, meas = CH.draw(F, nerves, BUILD, {"chiasm": "sb_optic_chiasm", "tract": "sb_optic_tract", "nerve": "sb_optic_nerve_ii",
                                             "nerveFile": "sb_optic_nerve_ii.glb"},
                          "assets/skullbase", "Drawn by rule on the Z-Anatomy model", "GPL-3.0 (the project's own drawing, on the Z-Anatomy model)",
                          "where Z-Anatomy's chiasm lies (its two pads)")
    cv = np.vstack([nd["positions"] for nd in read_glb_full(BUILD / "sb_optic_chiasm.glb").values()])
    d, j = cKDTree(A[:, :3]).query(cv)
    meas["chiasmToArteriesMm"] = round(float((d - A[j, 3]).min()), 2)
    # the olfactory tracts and striae off the arteries, the optic nerves and tracts as drawn and the chiasm
    drawn = [A, np.c_[cv, np.full(len(cv), 0.0)]]
    for f in ("sb_optic_nerve_ii.glb", "sb_optic_tract.glb"):
        for P, r in CAV.centre_lines(BUILD / f).values():
            drawn.append(np.c_[P, np.broadcast_to(r, len(P))])
    olf = clear_nerve(ex, "Olfactory nerve (I)", np.vstack(drawn), report)
    sid = SB.slug("Olfactory nerve (I)")
    nodes = []
    for s in "LR":                                 # (its tube as skullbase_build.py builds it, from the moved lines)
        vs, ns, ts, off = [], [], [], 0
        for R in olf[s]:
            v_, n_, t_ = SB.tube(R)
            vs.append(v_); ns.append(n_); ts.append(t_ + off); off += len(v_)
        nodes.append({"name": s, "positions": np.vstack(vs), "normals": np.vstack(ns), "indices": np.vstack(ts), "mode": TRIANGLES})
    write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
    merge(items, report)
    print("v1 nerves:", report, "chiasm", meas)
    return 0


MOVED_NOTE = ("Where Z-Anatomy's curve ran through its arteries{also}, moved just clear of them (skullbase_v1_nerves.py: up to {mm} mm; "
              "its ends stay): a drawing choice, the arteries as the model has them.")


def merge(items: list, report: dict) -> None:
    p = GEN / "sb-manifest.json"
    m = json.loads(p.read_text())
    ids = {it["id"] for it in items}
    old = {it["id"]: it for it in m["structures"]}
    for it in items:
        o = old.get(it["id"])
        if o is not None and it["id"] == "sb_optic_chiasm":
            it["aliases"] = sorted(set(o.get("aliases", [])) | set(it["aliases"]))
    out = []
    for it in m["structures"]:
        if it["id"] in ids:
            continue
        if it["name"] in report:
            base = it["derivation"].split(" Where Z-Anatomy's curve ran through")[0].split(" Near its end it turns")[0].rstrip()
            also = " (and the optic nerves and chiasm)" if it["name"].startswith("Olfactory") else ""
            it["derivation"] = base + " " + MOVED_NOTE.format(mm=report[it["name"]]["maxMovedMm"], also=also)
            if it["name"] == "Optic nerve (II)":
                it["derivation"] += CH.NERVE_NOTE
        out.append(it)
    for it in items:
        f = REPO / "public" / it["file"]
        it["bytes"] = f.stat().st_size if f.exists() else 0
    m["structures"] = out + items
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
