"""Build the cortex section's web assets: Destrieux gyri and sulci on the Lead-DBS template surface.

Inputs (pipeline/data/raw, fetched by fetch_sources.py):
  cortex/CortexHiRes.mat     pial surface of the MNI 2009b template (Lead-DBS), per hemisphere
  cortex/annot_a2009.mat     Destrieux 2009 (aparc.a2009s) labels on that surface
  cortex/annot_DKT.mat       Desikan-Killiany (aparc) labels on that surface (despite the file name)
  labeling/HMAT (Mayka 2005).nii   for the relation to the DBS section's motor parcels
  data/build/cortex/ztexts.json    Z-Anatomy definition texts (pipeline/cortex_texts.py, run in Blender)

Writes
  pipeline/data/build/cortex/<id>.glb   one GLB per label (nodes L and R), pial positions with the inflated
                                        surface as morph target 0, sulcal-depth shading as COLOR_0 and the
                                        insular-view cut-away flag as _OPER
  src/data/generated/ctx-manifest.json  structures
  src/data/generated/ctx-labels.json    per-label facts: Destrieux table data, lobe, measured area, borders,
                                        relations to Desikan-Killiany regions and to the DBS section's parcels

The inflated surface is computed here by smoothing the decimated pial surface (so every vertex has a pial and an
inflated position and the viewer can morph between them); it is not FreeSurfer's inflated surface.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np
import scipy.io as sio
import scipy.sparse as sp
import trimesh
from scipy.spatial import Delaunay, cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import config as C  # noqa: E402
import cortex_labels as CL  # noqa: E402
from build import hmat_lookup  # noqa: E402
from glb import write_glb  # noqa: E402
from meshcheck import self_intersections  # noqa: E402
from skullbase_build import definition  # noqa: E402

REPO = ROOT.parent
RAW = ROOT / "data" / "raw"
BUILD = ROOT / "data" / "build" / "cortex"
GEN = REPO / "src" / "data" / "generated"
PUBLIC = REPO / "public" / "assets"
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())
CITES = json.loads((ROOT / "sources" / "citations.json").read_text())

FACES = 80000            # per hemisphere, after decimation
INFLATE_ITER = 600       # uniform Laplacian smoothing steps
INFLATE_STEP = 0.5
MIDLINE_GAP_MM = 2.0     # inflated hemispheres keep this gap from the midline plane
OPER_MARGIN_MM = 3.0     # the insular cut-away extends this far beyond the insula's outline
OPER_LATERAL_MM = 1.0    # ... and removes surface at least this far lateral of the insula
UNTANGLE_ROUNDS = 20     # at most this many local smoothing rounds to remove decimation self-intersections
LABEL_SMOOTH_STEPS = 2   # majority-filter passes on the transferred vertex labels
LOBE_MIN_SHARE = 0.25   # a label belongs to every lobe holding at least this share of its vertices (via Desikan-Killiany)
LOBE_TOKEN = {k: f"lobe{k.capitalize()}" for k in CL.LOBES}
MEDIAL_WALL = {"Unknown", "Medial_wall", "unknown", "?"}

DATASET = {
    "name": "Destrieux 2009 gyri and sulci on the Lead-DBS MNI 2009b template surface",
    "licence": "GPL-3.0, non-commercial (derived from the Lead-DBS template surface and the FreeSurfer annotations shipped with it; "
               "FreeSurfer: MGH licence, research use); definition texts CC BY-SA 3.0 (Wikipedia, via Z-Anatomy)",
    "url": "https://www.lead-dbs.org",
    "cite": ["destrieux2010", "leaddbs3"],
    "note": "One template brain (MNI ICBM 2009b nonlinear asymmetric average), not an individual. Labels from FreeSurfer's "
            "automatic Destrieux parcellation of that template, as shipped with Lead-DBS. Surfaces decimated to "
            f"{FACES // 1000}k faces per hemisphere; the inflated surface is computed by smoothing the pial surface.",
}


def slug(short: str) -> str:
    return "ctx_" + re.sub(r"[^a-z0-9]+", "_", short.lower()).strip("_")


def kind_of(short: str) -> str:
    if short.startswith("G_and_S"):
        return "gyrus and sulcus"
    if short.startswith("G_"):
        return "gyrus"
    if short.startswith("Pole"):
        return "pole"
    return "sulcus"  # S_* and the rami of the lateral fissure


def read_annot(fn: str) -> dict[str, tuple[np.ndarray, dict[str, list[int]]]]:
    """{'L'|'R': (label name per vertex, {name: [r, g, b]})}"""
    out = {}
    for a in sio.loadmat(RAW / "cortex" / fn, simplify_cells=True)["annot"]:
        side = "R" if "rh." in str(a["filename"]) else "L"
        names = [str(s) for s in a["colortable"]["struct_names"]]
        table = np.asarray(a["colortable"]["table"])
        lut = {int(t): n for t, n in zip(table[:, 4], names)}
        rgb = {n: [int(x) for x in table[i, :3]] for i, n in enumerate(names)}
        out[side] = (np.array([lut.get(int(x), "?") for x in np.ravel(a["label"])]), rgb)
    return out


def adjacency(F: np.ndarray, n: int) -> sp.csr_matrix:
    e = np.vstack([F[:, [0, 1]], F[:, [1, 2]], F[:, [2, 0]]])
    A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(n, n)).tocsr()
    A = ((A + A.T) > 0).astype(float)
    return A


def inflate(V: np.ndarray, F: np.ndarray) -> np.ndarray:
    """Uniform Laplacian smoothing; rescaled after every step to the pial surface's RMS radius (no shrinkage)."""
    A = adjacency(F, len(V))
    deg = np.asarray(A.sum(1)).ravel()
    W = sp.diags(1 / deg) @ A
    c0 = V.mean(0)
    r0 = np.sqrt(((V - c0) ** 2).sum(1).mean())
    X = V.copy()
    for _ in range(INFLATE_ITER):
        X = X + INFLATE_STEP * (W @ X - X)
        c = X.mean(0)
        X = c0 + (X - c) * (r0 / np.sqrt(((X - c) ** 2).sum(1).mean()))
    return X


def vertex_normals(V: np.ndarray, F: np.ndarray) -> np.ndarray:
    return trimesh.Trimesh(V, F, process=False).vertex_normals.copy()


def untangle(V: np.ndarray, F: np.ndarray) -> tuple[np.ndarray, dict]:
    """Quadric decimation lets opposite banks of tight sulci pass through each other (the original surface is nearly
    free of this). Smooth only around the crossing triangles, a little at a time, until none are left."""
    V = V.copy()
    A = adjacency(F, len(V))
    W = sp.diags(1 / np.asarray(A.sum(1)).ravel()) @ A
    first = None
    for _ in range(UNTANGLE_ROUNDS):
        h, _c = self_intersections(V, F)
        first = len(h) if first is None else first
        if not len(h):
            break
        sel = np.zeros(len(V), bool)
        sel[F[h].ravel()] = True
        sel |= A @ sel.astype(float) > 0  # plus one ring
        for _ in range(3):
            V[sel] += 0.5 * ((W @ V)[sel] - V[sel])
    left = len(self_intersections(V, F)[0])
    return V, {"crossedBefore": int(first), "crossedAfter": left}


def smooth_labels(li: np.ndarray, F: np.ndarray, n_lab: int, steps: int = LABEL_SMOOTH_STEPS) -> np.ndarray:
    """Majority filter on vertex labels (own label wins ties): removes the stray vertices that label transfer onto the
    decimated mesh leaves along borders."""
    n = len(li)
    A = adjacency(F, n) + sp.identity(n)
    for _ in range(steps):
        own = sp.csr_matrix((np.ones(n), (np.arange(n), li)), shape=(n, n_lab))
        li = np.asarray((A @ own + 0.5 * own).argmax(1)).ravel()
    return li


def split_by_label(F: np.ndarray, li: np.ndarray, n: int):
    """Cut every triangle whose corners carry different labels along its edge midpoints (and its centroid when all
    three differ), so label borders run as straight segments instead of following the triangle edges.

    Returns parents (m, 3) and weights (m, 3) defining every output vertex as a blend of input vertices (the first n
    are the input vertices themselves), the triangles of each label, and the border segments [(la, lb, p, q)]."""
    parents = [np.stack([np.arange(n)] * 3, 1)]
    weights = [np.tile([1.0, 0.0, 0.0], (n, 1))]
    extra_p: list[tuple[int, int, int]] = []
    extra_w: list[tuple[float, float, float]] = []
    mids: dict[tuple[int, int], int] = {}

    def new(par, w) -> int:
        extra_p.append(par)
        extra_w.append(w)
        return n + len(extra_p) - 1

    def mid(a: int, b: int) -> int:
        k = (min(a, b), max(a, b))
        if k not in mids:
            mids[k] = new((a, b, a), (0.5, 0.5, 0.0))
        return mids[k]
    L = li[F]
    same = (L[:, 0] == L[:, 1]) & (L[:, 1] == L[:, 2])
    faces: dict[int, list] = {}
    for lab in np.unique(L[same, 0]):
        faces[int(lab)] = [F[same & (L[:, 0] == lab)]]
    borders = []
    for f in np.nonzero(~same)[0]:
        v, l_ = F[f], L[f]
        if l_[0] == l_[1] or l_[1] == l_[2] or l_[0] == l_[2]:
            odd = 2 if l_[0] == l_[1] else 0 if l_[1] == l_[2] else 1
            a, b, c = v[(odd + 1) % 3], v[(odd + 2) % 3], v[odd]  # a, b share a label, c differs; orientation kept
            la, lc = int(li[a]), int(li[c])
            mbc, mca = mid(b, c), mid(c, a)
            faces.setdefault(la, []).append(np.array([[a, b, mbc], [a, mbc, mca]]))
            faces.setdefault(lc, []).append(np.array([[mca, mbc, c]]))
            borders.append((la, lc, mbc, mca))
        else:
            g = new((v[0], v[1], v[2]), (1 / 3, 1 / 3, 1 / 3))
            m = [mid(v[i], v[(i + 1) % 3]) for i in range(3)]  # m[i] between v[i] and v[i+1]
            for i in range(3):
                faces.setdefault(int(l_[i]), []).append(np.array([[v[i], m[i], g], [v[i], g, m[i - 1]]]))
                borders.append((int(l_[i]), int(l_[(i + 1) % 3]), m[i], g))
    if extra_p:
        parents.append(np.array(extra_p))
        weights.append(np.array(extra_w))
    return np.vstack(parents), np.vstack(weights), {k: np.vstack(v) for k, v in faces.items()}, borders


def opercular(V: np.ndarray, vlab: np.ndarray, side: str) -> np.ndarray:
    """Vertices lateral of the insula within its (dilated) outline seen from the side: the opercula."""
    ins = np.isin(vlab, CL.INSULA_LABELS)
    yz = V[:, 1:]
    hull = Delaunay(yz[ins])
    d, j = cKDTree(yz[ins]).query(yz)
    inside = (hull.find_simplex(yz) >= 0) | (d <= OPER_MARGIN_MM)
    lat = np.abs(V[:, 0]) > np.abs(V[ins][j, 0]) + OPER_LATERAL_MM
    return inside & lat & ~ins


def smooth_mask(m: np.ndarray, F: np.ndarray, keep: np.ndarray, steps: int = 3) -> np.ndarray:
    """Close small gaps and drop stray vertices: each step a vertex takes the majority of itself and its neighbours."""
    A = adjacency(F, len(m)) + sp.identity(len(m))
    deg = np.asarray(A.sum(1)).ravel()
    for _ in range(steps):
        m = (A @ m.astype(float)) / deg > 0.5
    return m & ~keep


def main() -> int:
    ztexts = json.loads((BUILD / "ztexts.json").read_text())
    surf = sio.loadmat(RAW / "cortex" / "CortexHiRes.mat", simplify_cells=True)
    des, dk = read_annot("annot_a2009.mat"), read_annot("annot_DKT.mat")
    hmat = hmat_lookup()
    table = {r[1]: r for r in CL.DESTRIEUX}
    shorts = [r[1] for r in CL.DESTRIEUX]
    for side in "LR":
        names = set(des[side][0]) - MEDIAL_WALL
        if names != set(shorts):
            raise SystemExit(f"Destrieux names differ from Table 1 ({side}): {sorted(names ^ set(shorts))}")
    ids = {s: slug(s) for s in shorts}
    if len(set(ids.values())) != len(ids):
        raise SystemExit("duplicate cortex ids")
    MW = "ctx_medial_wall"

    nodes: dict[str, list[dict]] = {i: [] for i in [*ids.values(), MW]}
    facts: dict[str, dict] = {i: {"L": {}, "R": {}} for i in [*ids.values(), MW]}
    border_len: dict[tuple[str, str], float] = {}
    rel_dk: dict[str, dict[str, list[int]]] = {}
    rel_parcel: dict[str, dict[str, list[int]]] = {}
    parcel_size: dict[str, int] = {}
    lobe_votes: dict[str, dict[str, int]] = {i: {} for i in ids.values()}
    report = {}
    BUILD.mkdir(parents=True, exist_ok=True)
    for f in BUILD.glob("*.glb"):
        f.unlink()

    for side, key in (("L", "lh"), ("R", "rh")):
        Vh = np.asarray(surf[f"Vertices_{key}"], float)
        Fh = np.asarray(surf[f"Faces_{key}"], int) - 1
        dlab_h, _ = des[side]
        klab_h, _ = dk[side]
        assert len(dlab_h) == len(Vh) == len(klab_h)
        dlab_h = np.where(np.isin(dlab_h, list(MEDIAL_WALL)), "MW", dlab_h)

        # ---- relations, measured on the full-resolution surface (vertex counts)
        hm = hmat(Vh)
        hm = np.where((hm % 2 == 1) == (side == "R"), hm, 0)  # HMAT: odd labels are right
        parcels = {p.id: (np.isin(hm, p.hmat) if p.hmat else np.isin(klab_h, p.dk)) for p in C.CORTEX_PARCELS}
        for pid, m in parcels.items():
            parcel_size[pid] = parcel_size.get(pid, 0) + int(m.sum())
        for s in shorts:
            lm = dlab_h == s
            cid = ids[s]
            for reg, n in zip(*np.unique(klab_h[lm], return_counts=True)):
                rel_dk.setdefault(cid, {}).setdefault(str(reg), [0, 0])[0] += int(n)
                if reg in CL.DK_LOBE:
                    lv = lobe_votes[cid]
                    lv[CL.DK_LOBE[reg]] = lv.get(CL.DK_LOBE[reg], 0) + int(n)
            for pid, m in parcels.items():
                n = int((lm & m).sum())
                if n:
                    rel_parcel.setdefault(cid, {}).setdefault(pid, [0, 0])[0] += n
            facts[cid][side]["vertices"] = int(lm.sum())
        report.setdefault("dkSize", {}).setdefault(side, {str(r): int(n) for r, n in zip(*np.unique(klab_h, return_counts=True))})

        # ---- decimate, transfer labels, inflate
        m = trimesh.Trimesh(Vh, Fh, process=False).simplify_quadric_decimation(face_count=FACES)
        V, F = np.asarray(m.vertices), np.asarray(m.faces)
        V0 = V
        V, tangle = untangle(V, F)
        moved = np.linalg.norm(V - V0, axis=1)
        _, near = cKDTree(Vh).query(V)
        vlab = dlab_h[near]
        X = inflate(V, F)
        # keep each inflated hemisphere on its own side of the midline
        X[:, 0] += (-MIDLINE_GAP_MM - X[:, 0].max()) if side == "L" else (MIDLINE_GAP_MM - X[:, 0].min())
        X[:, 1:] += V[:, 1:].mean(0) - X[:, 1:].mean(0)
        Np, Ni = vertex_normals(V, F), vertex_normals(X, F)
        # sulcal depth: how far the pial surface lies inside the inflated one (positive = deep, as FreeSurfer's sulc)
        depth = -np.einsum("ij,ij->i", V - X, Ni)
        depth -= np.median(depth)
        shade = np.minimum(1.0, 0.78 - 0.28 * np.tanh(depth / 2.5))
        names_all = [*shorts, "MW"]
        li = smooth_labels(np.array([names_all.index(x) for x in vlab]), F, len(names_all))
        vlab = np.array(names_all)[li]
        oper = smooth_mask(opercular(V, vlab, side), F, np.isin(vlab, CL.INSULA_LABELS))
        par, w, faces_by, borders = split_by_label(F, li, len(V))

        def blend(a: np.ndarray) -> np.ndarray:
            return np.einsum("mk,mk...->m...", w, a[par])

        def unit(a: np.ndarray) -> np.ndarray:
            return a / np.linalg.norm(a, axis=1, keepdims=True)
        P, Q = blend(V), blend(X)
        NP, NQ = unit(blend(Np)), unit(blend(Ni))
        SH = blend(shade)
        OP = (oper[par] & (w > 0)).any(1)
        report[side] = {"faces": int(sum(len(f) for f in faces_by.values())), "vertices": int(len(P)), **tangle,
                        "untangleMovedVertices": int((moved > 0.01).sum()), "untangleMaxMm": round(float(moved.max()), 2),
                        "opercularVertices": int(oper.sum()),
                        "depthRange": [round(float(np.percentile(depth, 2)), 1), round(float(np.percentile(depth, 98)), 1)]}

        # ---- borders between labels (length of the cut segments on the pial surface)
        for la, lb, p_, q_ in borders:
            l_ = float(np.linalg.norm(P[p_] - P[q_]))
            a_, b_ = names_all[la], names_all[lb]
            border_len[(a_, b_)] = border_len.get((a_, b_), 0) + l_
            border_len[(b_, a_)] = border_len.get((b_, a_), 0) + l_

        # ---- one node per label
        for k, s in enumerate(names_all):
            cid = ids.get(s, MW)
            if k not in faces_by:
                raise SystemExit(f"{cid}/{side} has no faces after decimation")
            sub = faces_by[k]
            used, inv = np.unique(sub, return_inverse=True)
            nodes[cid].append({
                "name": side, "positions": P[used], "normals": NP[used], "indices": inv.reshape(-1, 3),
                "colors": np.repeat(SH[used, None], 3, axis=1),
                "scalars": {"_OPER": OP[used].astype(np.float32)},
                "targets": [{"positions": Q[used] - P[used], "normals": NQ[used] - NP[used]}],
            })
            f = facts[cid][side]
            tri = P[sub]
            f["areaCm2"] = round(float(np.linalg.norm(np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0]), axis=1).sum() / 2) / 100, 2)
            # label anchor: the most superficial part of the label (lowest sulcal depth), nearest its centre
            own = np.nonzero(li == k)[0]
            dv = depth[own]
            top = own[dv <= np.percentile(dv, 25)]
            a = top[np.argmin(((V[top] - V[top].mean(0)) ** 2).sum(1))]
            f["anchor"] = {"pial": V[a].round(2).tolist(), "inflated": X[a].round(2).tolist(),
                           "nPial": Np[a].round(3).tolist(), "nInflated": Ni[a].round(3).tolist()}

    # ---- assemble
    dk_size = {r: report["dkSize"]["L"].get(r, 0) + report["dkSize"]["R"].get(r, 0) for r in set(report["dkSize"]["L"]) | set(report["dkSize"]["R"])}
    structures, labels = [], []
    cites = [CITES[c] for c in DATASET["cite"]]
    for s in [*shorts, "MW"]:
        cid = ids.get(s, MW)
        write_glb(BUILD / f"{cid}.glb", nodes[cid], {"id": cid})
        idx, short, long, views, area_r, area_l = table.get(s, (0, "MW", "Medial wall (not cortex)", "", 0, 0))
        nv = facts[cid]["L"].get("vertices", 0) + facts[cid]["R"].get("vertices", 0)
        if s == "MW":
            lobe, share, lobe_by = None, None, None
        else:
            votes = lobe_votes[cid]
            tot_v = sum(votes.values())
            lobes_of = sorted(({"lobe": k, "share": round(v / tot_v, 3)} for k, v in votes.items() if v / tot_v >= LOBE_MIN_SHARE),
                              key=lambda x: -x["share"])
            lobe, share, lobe_by = lobes_of[0]["lobe"], lobes_of[0]["share"], "measure"
            if s in CL.NAMED_LOBE:
                lobe, lobe_by = CL.NAMED_LOBE[s], "name"
                share = round(votes.get(lobe, 0) / tot_v, 3)
                if not any(x["lobe"] == lobe for x in lobes_of):
                    lobes_of.append({"lobe": lobe, "share": share})
        token = LOBE_TOKEN[lobe] if lobe else "cortex"
        name = long if s != "MW" else "Medial wall (not cortex)"
        structures.append({
            "id": cid, "name": name, "aliases": [short] if s != "MW" else [], "type": "surface",
            "file": f"assets/cortex/{cid}.glb", "bytes": 1,
            "colour": {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]},
            "dataset": "destrieux", "source": DATASET["name"], "licence": DATASET["licence"],
            "citation": [c["citation"] for c in cites], "citationUrls": [c["url"] for c in cites], "refIds": DATASET["cite"],
            "derivation": "Destrieux label on the template's pial surface; vertex labels majority-filtered and border triangles cut at their edge midpoints."
            if s != "MW" else "Vertices the Destrieux parcellation leaves unlabelled (medial wall).",
            "category": kind_of(s) if s != "MW" else "medial wall",
            "centroid": {k: facts[cid][k]["anchor"]["pial"] for k in "LR"},
        })
        if s == "MW":
            continue
        zt = CL.ZTEXT[s]
        d = definition(ztexts[zt[0]]) if zt else None
        borders = {}
        for (a_, b_), l_ in border_len.items():
            if a_ == s and b_ != s:
                borders[b_] = borders.get(b_, 0) + l_
        tot = sum(borders.values())
        rgb = des["L"][1].get(s, [128, 128, 128])
        labels.append({
            "id": cid, "short": short, "index": idx, "name": long, "kind": kind_of(s), "views": views.split(","),
            "paperAreaCm2": {"L": area_l, "R": area_r},
            "areaCm2": {k: facts[cid][k]["areaCm2"] for k in "LR"},
            "lobe": lobe, "lobeShare": share, "lobeBy": lobe_by, "lobes": lobes_of,
            "atlasColour": "#%02x%02x%02x" % tuple(rgb),
            "anchor": {k: facts[cid][k]["anchor"] for k in "LR"},
            "borders": sorted(({"id": ids.get(b_, MW), "share": round(l_ / tot, 3)} for b_, l_ in borders.items() if l_ / tot >= 0.03),
                              key=lambda x: -x["share"]),
            "dk": sorted(({"region": r, "labelInRegion": round(n / nv, 3), "regionInLabel": round(n / dk_size[r], 3)}
                          for r, (n, _) in rel_dk.get(cid, {}).items() if r in CL.DK_LOBE and n / nv >= 0.05),
                         key=lambda x: -x["labelInRegion"]),
            "parcels": sorted(({"id": pid, "labelInParcel": round(n / nv, 3), "parcelInLabel": round(n / parcel_size[pid], 3)}
                               for pid, (n, _) in rel_parcel.get(cid, {}).items() if n / nv >= 0.05 or n / parcel_size[pid] >= 0.05),
                              key=lambda x: -x["parcelInLabel"]),
            "insula": s in CL.INSULA_LABELS,
            "definition": ({**d, "source": zt[0], "scope": zt[1]} if d else None),
        })
    lobes = []
    for lb in CL.LOBES:
        zt = CL.ZTEXT_LOBES[lb]
        d = definition(ztexts[zt]) if zt else None
        lobes.append({"id": lb, "name": CL.LOBE_NAME[lb], "token": LOBE_TOKEN[lb],
                      "definition": ({**d, "source": zt} if d else None),
                      "labels": [x["id"] for x in labels if any(y["lobe"] == lb for y in x["lobes"])]})
    GEN.mkdir(parents=True, exist_ok=True)
    manifest = {
        "space": "MNI ICBM 2009b nonlinear asymmetric (Lead-DBS template), RAS mm",
        "generatedBy": "pipeline/cortex_build.py",
        "structures": structures,
        "dataset": {"name": DATASET["name"], "licence": DATASET["licence"], "url": DATASET["url"], "note": DATASET["note"],
                    "citation": [c["citation"] for c in cites], "citationUrls": [c["url"] for c in cites]},
    }
    (GEN / "ctx-manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    (GEN / "ctx-labels.json").write_text(json.dumps({
        "labels": labels, "lobes": lobes,
        "method": {"faces": FACES, "inflateIterations": INFLATE_ITER, "inflateStep": INFLATE_STEP, "midlineGapMm": MIDLINE_GAP_MM,
                   "operMarginMm": OPER_MARGIN_MM, "operLateralMm": OPER_LATERAL_MM, "hmatMaxDistMm": C.HMAT_MAX_DIST_MM},
        "report": {k: v for k, v in report.items() if k != "dkSize"},
    }, indent=1, ensure_ascii=False))
    print(f"cortex: {len(labels)} labels; " + "; ".join(f"{k} {report[k]['faces']} faces, {report[k]['opercularVertices']} opercular vertices" for k in "LR"))
    return 0


def validate() -> int:
    """Checks on the generated files; returns the number of failures."""
    man = json.loads((GEN / "ctx-manifest.json").read_text())
    lab = json.loads((GEN / "ctx-labels.json").read_text())
    fails, n = [], 0

    def check(ok: bool, msg: str) -> None:
        nonlocal n
        n += 1
        if not ok:
            fails.append(msg)
    ids = {s["id"] for s in man["structures"]}
    check(len(lab["labels"]) == 74, "74 Destrieux labels")
    for x in lab["labels"]:
        check(x["lobe"] in CL.LOBES, f"{x['id']}: lobe")
        for b in x["borders"]:
            check(b["id"] in ids, f"{x['id']}: border {b['id']} unknown")
        for p in x["parcels"]:
            check(p["id"] in {c.id for c in C.CORTEX_PARCELS}, f"{x['id']}: parcel {p['id']}")
        for k in "LR":
            # sanity check only: measured area within a factor of 3 of the paper's mean (one smooth template brain
            # vs the 12 manually labelled brains of the paper's training set)
            r = x["areaCm2"][k] / x["paperAreaCm2"][k]
            check(1 / 3 < r < 3, f"{x['id']}/{k}: area {x['areaCm2'][k]} vs paper {x['paperAreaCm2'][k]}")
            # the template's medial surfaces cross the midline by up to 2 mm
            a = x["anchor"][k]["pial"]
            check(a[0] < 2.5 if k == "L" else a[0] > -2.5, f"{x['id']}/{k}: anchor on the wrong side")
    by = {x["short"]: x for x in lab["labels"]}
    # spot checks of the lobe assignment against the label names
    for s, lobe in [("G_precentral", "frontal"), ("G_postcentral", "parietal"), ("G_cuneus", "occipital"),
                    ("G_temporal_middle", "temporal"), ("G_insular_short", "insula"), ("G_and_S_cingul-Ant", "cingulate"),
                    ("S_central", "frontal"), ("S_central", "parietal")]:
        check(lobe in {y["lobe"] for y in by[s]["lobes"]}, f"{s}: not in the {lobe} lobe ({by[s]['lobes']})")
    # the central sulcus borders the pre- and postcentral gyri
    cs = {b["id"] for b in by["S_central"]["borders"]}
    check({slug("G_precentral"), slug("G_postcentral")} <= cs, "central sulcus borders")
    # decimation self-intersections repaired
    for k in "LR":
        check(lab["report"][k]["crossedAfter"] == 0, f"{k}: {lab['report'][k]['crossedAfter']} self-intersecting triangles left")
    # insular labels are never cut away
    for k in "LR":
        check(lab["report"][k]["opercularVertices"] > 500, f"{k}: opercular cut-away is empty")
    for f in fails:
        print("FAIL", f)
    print(f"cortex validate: {n - len(fails)}/{n} checks passed")
    return 1 if fails else 0


def finalize() -> None:
    """After compress.mjs: drop stale compressed files, fill in sizes, copy the manifest next to the assets."""
    p = GEN / "ctx-manifest.json"
    m = json.loads(p.read_text())
    keep = {Path(it["file"]).name for it in m["structures"]}
    for f in (PUBLIC / "cortex").glob("*.glb"):
        if f.name not in keep:
            f.unlink()
    for it in m["structures"]:
        it["bytes"] = (REPO / "public" / it["file"]).stat().st_size
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    shutil.copy(p, PUBLIC / "ctx-manifest.json")


if __name__ == "__main__":
    if sys.argv[1:] == ["finalize"]:
        finalize()
        sys.exit(validate())
    sys.exit(main())
