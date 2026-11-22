"""Skull base v3's cranial nerves cut at the brainstem's surface.

The routed nerves (III to XII) are tubes round centre lines that begin at the fitted Z-Anatomy model's root points,
which lie inside the brainstem as it is fitted into this CT's posterior fossa: each nerve began 0.9 to 3.7 mm under the
drawn surface (up to 22 rings of its tube), a stub seen when the brainstem is hidden or drawn see-through (the site
audit's MB-11; the owner's decision of 22 November 2026: cut them).

  Each nerve's tube (skullbase_build.tube: rings, then two caps) loses the rings at its root end whose centres lie more
  than ROOT_IN_MM inside the brainstem (the midbrain, pons and medulla as shown, each filled on its own); the first
  ring kept lies at most that deep, so the nerve still begins in the surface, and the tube is closed there with a new
  cap. The tube keeps its layout (rings, then the two caps), which skullbase_v3_tumours.py reads to move a nerve
  round a tumour; a part before the tube (the facial nerve's specimen mesh) is left as it is.

  Not cut: a nerve's course under the surface further along (the trochlear nerve leaves the back of the midbrain and
  runs round it up to 4.4 mm under its fitted surface for a third of its length: lifting it out, ring by ring the
  shortest way, tore the tube, and it is left for a refit of its course), and the optic and olfactory tracts in the
  template hemisphere.

A cut nerve is written as a file of its own (<id>.cleared.glb) and v3's item points to it; the file its source wrote
is never changed, and a nerve already cut has nothing left to cut, so running this again changes nothing.

  pipeline/.venv/bin/python -I -W ignore pipeline/skullbase_v3_roots.py
  (after skullbase_v3_clearance.py and skullbase_v3_junctions.py; then skullbase_v3_tumours.py, whose moved copies of
  the nerves are made from the cut files, compress.mjs skullbase-v3 <the files> and skullbase_v3.py finalize)
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import skullbase_v3_clearance as CL  # noqa: E402
from glb import read_glb_full  # noqa: E402

GEN = ROOT.parent / "src" / "data" / "generated"
STEM = ("Midbrain", "Pons", "Medulla oblongata")
ROOT_IN_MM = 0.5       # a nerve's first ring lies at most this far inside the brainstem
GRID_MM = 0.25         # the grid the brainstem is filled on
MIN_RINGS = 3          # a tube is not cut down to fewer rings than this
NOTE = (" Where its routed course ran under the fitted brainstem's surface (up to {mm:g} mm deep) it is lifted onto "
             "the surface (skullbase_v3_roots.py).")
NOTE = (" Cut at the brainstem's surface: its routed course began {mm:g} mm inside the fitted brainstem "
        "(skullbase_v3_roots.py).")


def tube_part(V: np.ndarray):
    """As skullbase_v3_tumours.tube_part, with the rings' corner count: (first vertex, centre line, radius, sides)."""
    for sides in (8, 6):
        for n in range((len(V) - 2 * (sides + 1)) // sides, 2, -1):
            s0 = len(V) - n * sides - 2 * (sides + 1)
            ring = V[s0:s0 + n * sides].reshape(n, sides, 3)
            c = ring.mean(1)
            rr = np.linalg.norm(ring - c[:, None], axis=2)
            if rr.std(1).max() <= 0.05 * max(float(rr.mean()), 0.1) and np.linalg.norm(np.diff(c, axis=0), axis=1).max() < 2.0:
                return s0, c, rr.mean(1), sides
    return None


class Stem:
    """The brainstem as shown (its parts each filled on its own): how deep a point lies in it (mm; negative outside)."""

    def __init__(self, items: list):
        pieces = []
        for it in items:
            if it["name"] in STEM and it.get("category") == "hindbrain" and not (it.get("tumourView") or it.get("approach") or it.get("forView")):
                for nd in read_glb_full(CL.shown(it)).values():
                    pieces.append((np.asarray(nd["positions"], float), np.asarray(nd["indices"]).reshape(-1, 3)))
        if len(pieces) < 3:
            raise SystemExit("roots: the brainstem's parts are not all in the manifest")
        allp = np.vstack([p for p, _ in pieces])
        self.lo = allp.min(0) - 3
        shape = tuple(int(x) for x in np.ceil((allp.max(0) + 3 - self.lo) / GRID_MM) + 1)
        mask = np.zeros(shape, bool)
        for p, t in pieces:
            mask |= CL.fill_pieces(p, t, self.lo, shape, GRID_MM)
        self.d = (ndimage.distance_transform_edt(mask, sampling=GRID_MM) - ndimage.distance_transform_edt(~mask, sampling=GRID_MM)).astype(np.float32)

    def depth(self, X: np.ndarray) -> np.ndarray:
        return ndimage.map_coordinates(self.d, ((X - self.lo) / GRID_MM).T, order=1, mode="constant", cval=-99.0)


def cut_node(nd: dict, stem: Stem) -> dict | None:
    """A nerve's half cut at its root end (in place): the rings deeper than ROOT_IN_MM in the brainstem removed, the
    tube capped anew. Returns what was cut, or None (no tube, or its root is not that deep)."""
    V = np.asarray(nd["positions"], float)
    T = np.asarray(nd["indices"]).reshape(-1, 3)
    tp = tube_part(V)
    if tp is None or nd["targets"]:
        return None
    s0, C, R, sides = tp
    n = len(C)
    deep = stem.depth(C) > ROOT_IN_MM
    a = int(np.argmin(deep)) if deep[0] else 0              # rings to drop at the start ...
    b = int(np.argmin(deep[::-1])) if deep[-1] else 0       # ... and at the end
    if deep.all() or n - a - b < MIN_RINGS:
        raise SystemExit(f"roots: a tube with {n} rings would keep {n - a - b}")
    if not (a or b):
        return None
    rings = V[s0:s0 + n * sides].reshape(n, sides, 3)[a:n - b]
    m = len(rings)
    caps = np.vstack([np.vstack([rings[e].mean(0)[None], rings[e]]) for e in (0, m - 1)])
    tris = []
    for i in range(m - 1):
        for k in range(sides):
            a0, a1 = i * sides + k, i * sides + (k + 1) % sides
            tris += [[a0, a1, a0 + sides], [a1, a1 + sides, a0 + sides]]
    for j, sgn in ((0, -1), (1, 1)):
        c = m * sides + j * (sides + 1)
        for k in range(sides):
            u, w = c + 1 + k, c + 1 + (k + 1) % sides
            tris.append([c, w, u] if sgn < 0 else [c, u, w])
    tris = np.array(tris) + s0
    # wound as the tube was (a mirrored half is wound the other way round)
    first = {tuple(np.roll(t, -int(np.argmin(t)))) for t in T[(T >= s0).all(1)][:4 * sides].tolist()}
    probe = np.array([s0, s0 + 1, s0 + sides])
    if tuple(probe) not in first:
        if tuple(np.roll(probe[::-1], -int(np.argmin(probe[::-1])))) not in first:
            raise SystemExit("roots: the tube's triangles are not laid out as skullbase_build.tube lays them")
        tris = tris[:, ::-1]
    prefix = T[(T < s0).all(1)]
    if len(prefix) + (n - 1) * sides * 2 + 2 * sides != len(T):
        raise SystemExit("roots: triangles join the tube to the part before it")
    nd["positions"] = np.vstack([V[:s0], rings.reshape(-1, 3), caps]).astype(np.float32)
    nd["indices"] = np.vstack([prefix, tris]).astype(np.uint32)
    arc = np.r_[0.0, np.cumsum(np.linalg.norm(np.diff(C, axis=0), axis=1))]
    return {"ringsCut": a + b, "lengthCutMm": round(float(arc[a] + (arc[-1] - arc[n - 1 - b])), 1),
            "deepestMm": round(float(stem.depth(C).max()), 1), "wasInsideMm": round(float(stem.depth(C[[0, -1]]).max()), 1),
            "nowInsideMm": round(float(stem.depth(rings.mean(1)[[0, -1]]).max()), 2)}


def nerves(items: list) -> list:
    return [it for it in items if it.get("category") == "nerve" and not (it.get("tumourView") or it.get("approach") or it.get("forView"))]


def check(items: list) -> list[tuple[bool, str]]:
    """For skullbase_v3.py's validation: no routed nerve's tube begins or ends more than ROOT_IN_MM (and the grid) inside
    the brainstem."""
    stem = Stem(items)
    out = []
    for it in nerves(items):
        for side, nd in read_glb_full(CL.shown(it)).items():
            tp = tube_part(np.asarray(nd["positions"], float))
            if tp is None:
                continue
            d = float(stem.depth(tp[1][[0, -1]]).max())
            out.append((d <= ROOT_IN_MM + GRID_MM, f"{it['name']} {side}: its tube begins {d:.1f} mm inside the brainstem"))
    return out


def main() -> int:
    p = GEN / "sbv3-manifest.json"
    m = json.loads(p.read_text())
    stem = Stem(m["structures"])
    rep = {}
    for it in nerves(m["structures"]):
        nodes = read_glb_full(CL.shown(it))
        cuts = {side: c for side, nd in nodes.items() if (c := cut_node(nd, stem))}
        if not cuts:
            continue
        note = NOTE.format(mm=max(c["wasInsideMm"] for c in cuts.values()))
        if it.get("clearedFrom"):
            CL.write(CL.shown(it), nodes, it["id"])
            if "Cut at the brainstem's surface" not in it["derivation"]:
                it["derivation"] += note
        else:
            if it.get("joinedFrom"):
                raise SystemExit(f"{it['name']}: joined by skullbase_v3_junctions.py, which this step does not handle")
            CL.cleared(it, nodes, note)
        for side in cuts:
            if side in it.get("centroid", {}):
                it["centroid"][side] = np.round(np.asarray(nodes[side]["positions"], float).mean(0), 2).tolist()
        rep[it["name"]] = cuts
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    for k, v in rep.items():
        print(k, v)
    bad = [msg for ok, msg in check(m["structures"]) if not ok]
    print("still inside:", bad or "none")
    if rep:
        from modifications import record
        record("sbv3", "skullbase_v3_roots", "the routed cranial nerves cut at the brainstem's surface (their courses began inside the fitted brainstem)",
               list(rep), {"rootInMm": ROOT_IN_MM, "gridMm": GRID_MM}, rep, {"failed": bad})
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
