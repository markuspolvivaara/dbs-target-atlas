"""Skull base v3's vessels joined where they meet: the labels, traces and fitted courses each vessel comes from stop a few
millimetres short of one another at some junctions, so that a sinus or artery seems to end in the open.

  The confluence of the sinuses (torcular Herophili), drawn by rule: the superior sagittal and straight sinuses' back
  ends run on into the point where this CT's traced transverse sinuses meet, all joined smoothly (an implicit surface)
  with a swelling there, as wide as the transverse sinuses.

  The other junctions (JOINS): where a vessel's end stops short of the vessel it joins (by more than JOIN_MIN_MM, less
  than JOIN_MAX_MM), a short straight segment is drawn from that end, as wide as it, into the other vessel's wall. It is
  added to the first vessel's mesh, and its card says so.

A joined vessel is written as a file of its own (assets/skullbase-v3/<id>.joined.glb) and v3's item points to it; the
file its source wrote (v2's or v3's) is never changed, so v2 keeps its own and running this twice changes nothing.
skullbase_v3_endonasal.py, the last of v3's steps to write its manifest, runs it (after skullbase_v3_clearance.py).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from glb import TRIANGLES, read_glb_full, write_glb  # noqa: E402

DATA = ROOT / "data" / "build"
V3_BUILD = DATA / "skullbase-v3"
GEN = ROOT.parent / "src" / "data" / "generated"

JOIN_MIN_MM = 0.8      # a gap smaller than this is left (the surfaces touch)
JOIN_MAX_MM = 15.0     # nor is one larger than this joined (not the same junction)
INTO_MM = 1.5          # how far a joining segment runs on into the other vessel's wall
PATCH_MM = 5.0         # an end's centre and width: from the vessel's surface within this of where it comes closest
CONFLUENCE_GAIN = 1.25  # the confluence's swelling: this times the widest sinus joining it
CONFLUENCE_ID = "tb_confluence_of_sinuses"

# (vessel whose end stops short, the vessel it joins (or several: the nearest), paired?)
JOINS = [
    ("Superior petrosal sinus", ["Transverse sinus", "Sigmoid sinus"], True),
    ("Superior petrosal sinus", ["Cavernous sinus"], True),
    ("Inferior petrosal sinus", ["Cavernous sinus"], True),
    ("Inferior petrosal sinus", ["Sigmoid sinus", "Internal jugular vein"], True),
    ("Anterior intercavernous sinus", ["Cavernous sinus"], True),
    ("Posterior intercavernous sinus", ["Cavernous sinus"], True),
    ("Basilar venous plexus", ["Cavernous sinus"], True),
    ("Basilar venous plexus", ["Inferior petrosal sinus"], True),
    ("Ophthalmic artery", ["Internal carotid artery"], True),
    ("Superior cerebellar artery (fitted course)", ["Superior cerebellar artery"], True),
    ("Vertebral artery", ["Basilar artery"], False),
]


# ---------------------------------------------------------------- reading and writing
def read_glb(path: Path) -> dict:
    sys.path.insert(0, str(ROOT))
    import vascular_build as VB
    return VB.read_glb(path)


def normals(P: np.ndarray, T: np.ndarray) -> np.ndarray:
    import vascular_build as VB
    return VB.normals(P, T)


def source_path(item: dict) -> Path:
    """The file a vessel's source draws (before any joining)."""
    return DATA / (item.get("joinedFrom") or item["file"]).replace("assets/", "")


# ---------------------------------------------------------------- geometry
def tube(a: np.ndarray, b: np.ndarray, r: float, sides: int = 12) -> tuple[np.ndarray, np.ndarray]:
    """A straight tube from a to b, radius r, closed at both ends."""
    import vascular_lesions as LES
    n = max(3, int(np.linalg.norm(b - a) / 0.4) + 1)
    P = a + np.linspace(0, 1, n)[:, None] * (b - a)
    pos, _, tri, _ = LES.tube(P, np.full(n, r), sides)
    return pos, tri


def end_of(P: np.ndarray, near: np.ndarray) -> tuple[np.ndarray, float]:
    """A vessel's centre and radius where its surface comes nearest a point: the mean of its surface within PATCH_MM
    there, and its spread across the patch's long axis (√2 times the root mean square of the two cross-wise standard
    deviations: a round tube's radius, a flat sinus's mean half-breadth)."""
    k = np.linalg.norm(P - near, axis=1) < PATCH_MM
    Q = P[k] if k.sum() >= 6 else P[np.argsort(np.linalg.norm(P - near, axis=1))[:12]]
    c = Q.mean(0)
    sv = np.linalg.svd(Q - c, full_matrices=False)[1] / np.sqrt(len(Q))
    r = float(np.sqrt(2) * np.sqrt((sv[1] ** 2 + sv[2] ** 2) / 2))
    return c, float(np.clip(r, 0.4, 6.0))


def back_of(P: np.ndarray, tip: np.ndarray, d0: float = 6.0, d1: float = 12.0) -> tuple[np.ndarray, float]:
    """A vessel's centre and radius a little back from its tip (its surface between d0 and d1 from the tip): where it
    has its own width, not the tip's taper."""
    d = np.linalg.norm(P - tip, axis=1)
    Q = P[(d > d0) & (d < d1)]
    if len(Q) < 12:
        return end_of(P, tip)
    c = Q.mean(0)
    sv = np.linalg.svd(Q - c, full_matrices=False)[1] / np.sqrt(len(Q))
    # (the band's cross-section: its two smaller spreads; the largest runs along the vessel only if the band is long)
    r = float(np.sqrt(2) * np.sqrt((sv[1] ** 2 + sv[2] ** 2) / 2))
    return c, float(np.clip(r, 0.4, 6.0))


def nodes_of(item: dict) -> dict:
    return read_glb(source_path(item))


def main_run(nodes: dict) -> np.ndarray:
    """A vessel's surface without its stray pieces: each node's largest connected part."""
    import scipy.sparse as sp
    from scipy.sparse.csgraph import connected_components
    out = []
    for P, T in nodes.values():
        n = len(P)
        E = np.vstack([T[:, [0, 1]], T[:, [1, 2]]])
        _, lab = connected_components(sp.coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(n, n)), directed=False)
        out.append(P[lab == np.argmax(np.bincount(lab))])
    return np.vstack(out)


# ---------------------------------------------------------------- the joins
def connectors(items: dict) -> tuple[dict, dict]:
    """The joining segments: {vessel name: {side: [(positions, triangles)]}} and {vessel name: [notes]}."""
    add, notes = {}, {}
    for a, bs, paired in JOINS:
        if a not in items or not all(b in items for b in bs):
            continue
        A = nodes_of(items[a])
        Bn = {b: nodes_of(items[b]) for b in bs}
        for s in (("L", "R") if paired else (None,)):
            sides_a = [s] if s else list(A)
            best = None
            for sa in sides_a:
                if sa not in A:
                    continue
                Pa, _ = A[sa]
                for b in bs:
                    Pb = np.vstack([P for sb, (P, _) in Bn[b].items() if s is None or sb == s or sb not in "LR"])
                    Tb = [(P, T) for sb, (P, T) in Bn[b].items() if s is None or sb == s or sb not in "LR"]
                    d, j = cKDTree(Pb).query(Pa)
                    i = int(np.argmin(d))
                    if best is None or d[i] < best[0]:
                        best = (float(d[i]), sa, b, Pa[i], Pb[j[i]], Tb)
            if best is None:
                continue
            gap, sa, b, pa, pb, Tb = best
            if not JOIN_MIN_MM < gap < JOIN_MAX_MM:
                continue
            Pa, _ = A[sa]
            ca, ra = end_of(Pa, pa)
            # into the other vessel's wall: from its nearest surface point, INTO_MM inwards along its normal
            nb = None
            for P, T in Tb:
                k = np.nonzero(np.all(P == pb, axis=1))[0]
                if len(k):
                    nb = normals(P, T)[k[0]]
                    break
            end = pb - (nb if nb is not None else (pb - ca) / (np.linalg.norm(pb - ca) + 1e-9)) * min(INTO_MM + ra, 4.0)
            add.setdefault(a, {}).setdefault(sa, []).append(tube(ca, end, ra))
            notes.setdefault(a, []).append((b, gap))
    return add, notes


def confluence(items: dict):
    """The confluence of the sinuses: the transverse sinuses' meeting point, the superior sagittal and straight sinuses'
    back ends run on into it (positions, triangles; its centre; the radii)."""
    import vascular_lesions as LES
    TR = nodes_of(items["Transverse sinus"])
    Pl, Pr = TR["L"][0], TR["R"][0]
    d, j = cKDTree(Pr).query(Pl)
    k = np.argsort(d)[:3]
    meet = ((Pl[k] + Pr[j[k]]) / 2).mean(0)
    cl, rl = back_of(Pl, Pl[np.argmin(np.linalg.norm(Pl - meet, axis=1))])
    cr, rr = back_of(Pr, Pr[np.argmin(np.linalg.norm(Pr - meet, axis=1))])
    r_tr = (rl + rr) / 2
    ends = []
    for name in ("Superior sagittal sinus", "Straight sinus"):
        P = main_run(nodes_of(items[name]))
        # its back end: the part of its surface nearest the meeting point, in its own main run (not a stray piece)
        dd = np.linalg.norm(P - meet, axis=1)
        c, r = back_of(P, P[np.argmin(dd)])
        ends.append((name, c, r, float(dd.min())))
    centre = meet

    def sdf(X):
        f = np.linalg.norm(X - centre, axis=1) - r_swell
        f = LES.smin(f, LES.capsule(X, cl, cr, r_tr), 2.5)
        for _, c, r, _ in ends:
            f = LES.smin(f, LES.capsule(X, c, centre, r), 2.5)
        return f
    r_swell = CONFLUENCE_GAIN * max([r_tr] + [r for _, _, r, _ in ends])
    pts = np.vstack([centre, cl, cr] + [c for _, c, _, _ in ends])
    rmax = max([r_swell] + [r for _, _, r, _ in ends]) + 3
    v, f = LES.implicit_mesh(sdf, pts.min(0) - rmax, pts.max(0) + rmax, 0.35)
    if np.einsum("ij,ij->i", v[f[:, 0]], np.cross(v[f[:, 1]], v[f[:, 2]])).sum() < 0:     # (wound outward)
        f = f[:, ::-1].copy()
    return v, f, centre, {"transverseMm": round(2 * r_tr, 1), "swellingMm": round(2 * r_swell, 1),
                          **{n + " width": round(2 * r, 1) for n, _, r, _ in ends},
                          **{n: round(gap, 1) for n, _, _, gap in ends}}


def split_midline(v: np.ndarray, f: np.ndarray) -> dict:
    """A midline structure as left and right halves (as v3's others), by each face's centre."""
    out = {}
    fc = v[f].mean(1)[:, 0]
    for s, keep in (("L", fc < 0), ("R", fc >= 0)):
        ff = f[keep]
        used = np.unique(ff)
        remap = -np.ones(len(v), int)
        remap[used] = np.arange(len(used))
        out[s] = (v[used], remap[ff])
    return out


def join(items_list: list) -> dict:
    """Join the vessels in v3's item list (changed in place): returns a report."""
    sys.path.insert(0, str(ROOT))
    items = {it["name"]: it for it in items_list if it.get("category") in ("artery", "vein")}
    add, notes = connectors(items)
    report = {}
    for name, per_side in add.items():
        it = items[name]
        src = source_path(it)
        nodes = read_glb_full(src)
        out = []
        for s, nd in nodes.items():
            P, T = nd["positions"], nd["indices"]
            vs, ts = [P], [T]
            off = len(P)
            for pos, tri in per_side.get(s, []):
                vs.append(pos); ts.append(tri + off); off += len(pos)
            V, F = np.vstack(vs), np.vstack(ts)
            node = {"name": s, "positions": V, "normals": normals(V, F), "indices": F, "mode": TRIANGLES}
            if nd["targets"]:       # (its shapes kept: a joining segment moves as the vessel's nearest point does)
                near = cKDTree(P).query(V[len(P):])[1]
                node["targets"] = [{"name": t["name"], "positions": np.vstack([t["positions"], t["positions"][near]]),
                                    "normals": np.zeros_like(V)} for t in nd["targets"]]
            out.append(node)
        vid = it["id"]
        if not it.get("joinedFrom"):
            it["joinedFrom"] = it["file"]
        it["file"] = f"assets/skullbase-v3/{vid}.joined.glb"
        write_glb(V3_BUILD / f"{vid}.joined.glb", out, {"id": vid})
        base = it["derivation"].split(" Joined ")[0]
        joined = "; ".join(f"to the {b.lower()} by a drawn segment across a {g:.1f} mm gap" for b, g in notes[name])
        it["derivation"] = base + f" Joined {joined}, where its source's end stops short (drawn by rule, skullbase_v3_junctions.py)."
        report[name] = [(b, round(g, 1)) for b, g in notes[name]]
    # the confluence of the sinuses
    v, f, centre, facts = confluence(items)
    halves = split_midline(v, f)
    nodes = [{"name": s, "positions": P, "normals": normals(P, T), "indices": T, "mode": TRIANGLES} for s, (P, T) in halves.items()]
    write_glb(V3_BUILD / f"{CONFLUENCE_ID}.glb", nodes, {"id": CONFLUENCE_ID})
    tmpl = items["Transverse sinus"]
    conf = {"id": CONFLUENCE_ID, "name": "Confluence of sinuses", "aliases": ["Torcular Herophili", "Confluens sinuum"], "type": "soft",
            "file": f"assets/skullbase-v3/{CONFLUENCE_ID}.glb", "bytes": 0, "colour": tmpl["colour"], "dataset": "rule",
            "source": "Modelled on the TopBrain CT", "licence": "GPL-3.0 (the project's own drawing, on the TopBrain CT)",
            "citation": [], "citationUrls": [], "refIds": [], "category": "vein", "schematic": True,
            "derivation": "Cut at the midline (x = 0) into left and right halves. Drawn by rule on this CT: where its traced "
                          f"transverse sinuses meet, a swelling {facts['swellingMm']} mm across ({CONFLUENCE_GAIN:g} times the widest "
                          "sinus joining it), with the superior sagittal and straight sinuses' "
                          f"back ends (TopBrain's labels end {facts['Superior sagittal sinus']} and {facts['Straight sinus']} mm from its centre) "
                          "run on into it, all joined smoothly (an implicit surface).",
            "centroid": {s: np.round(P.mean(0), 2).tolist() for s, (P, _) in halves.items()}}
    for k in ("system",):
        if k in tmpl:
            conf[k] = tmpl[k]
    items_list[:] = [it for it in items_list if it["id"] != CONFLUENCE_ID]
    at = next(i for i, it in enumerate(items_list) if it["name"] == "Transverse sinus")
    items_list.insert(at, conf)
    report["Confluence of sinuses"] = facts
    return report


def gaps(items_list: list) -> list[tuple[bool, str]]:
    """For skullbase_v3.py's validation: each junction JOINS lists closed (or its source's gap out of range), and the
    confluence touching the sinuses it joins."""
    items = {it["name"]: it for it in items_list if it.get("category") in ("artery", "vein")}
    out = []

    def gap(pa: dict, pb: dict, s) -> float:
        A = np.vstack([P for sa, (P, _) in pa.items() if s is None or sa == s or sa not in "LR"])
        B = np.vstack([P for sb, (P, _) in pb.items() if s is None or sb == s or sb not in "LR"])
        return float(cKDTree(B).query(A)[0].min())
    for a, bs, paired in JOINS:
        if a not in items:
            continue
        now = read_glb(DATA / items[a]["file"].replace("assets/", ""))
        was = nodes_of(items[a])
        for s in (("L", "R") if paired else (None,)):
            g0 = min(gap(was, nodes_of(items[b]), s) for b in bs if b in items)
            g1 = min(gap(now, read_glb(DATA / items[b]["file"].replace("assets/", "")), s) for b in bs if b in items)
            out.append((g1 <= JOIN_MIN_MM or g0 >= JOIN_MAX_MM, f"{a} {s or ''} still {g1:.1f} mm from the {' or '.join(bs).lower()}"))
    if "Confluence of sinuses" in items:
        conf = read_glb(DATA / items["Confluence of sinuses"]["file"].replace("assets/", ""))
        for b in ("Superior sagittal sinus", "Straight sinus", "Transverse sinus"):
            g = gap(conf, read_glb(DATA / items[b]["file"].replace("assets/", "")), None)
            out.append((g <= JOIN_MIN_MM, f"the confluence of sinuses {g:.1f} mm from the {b.lower()}"))
    else:
        out.append((False, "no confluence of sinuses"))
    return out


def main() -> int:
    """On its own: join the vessels of the v3 manifest skullbase_v3.py wrote, and its definitions."""
    p = GEN / "sbv3-manifest.json"
    m = json.loads(p.read_text())
    rep = join(m["structures"])
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    add_definition()
    for k, v in rep.items():
        print(k, v)
    return 0


def add_definition() -> None:
    """The confluence's definition: the Wikipedia text Z-Anatomy ships, if it has one."""
    import skullbase_build as SB
    import skullbase_v3 as V3
    ex = json.loads(V3.ZEXPORT.read_text())
    raw = ex["texts"].get("Confluence of sinuses") or ex["texts"].get("Confluence of sinuses.r")
    d = SB.definition(raw) if raw else None
    p = GEN / "sbv3-definitions.json"
    defs = json.loads(p.read_text())
    if d:
        defs["Confluence of sinuses"] = d
        p.write_text(json.dumps(dict(sorted(defs.items())), indent=1, ensure_ascii=False))


if __name__ == "__main__":
    sys.exit(main())
