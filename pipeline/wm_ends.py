"""Where the white-matter section's bundles end on the cortex (the site audit's B-007, November 2026).

  pipeline/.venv/bin/python -I -W ignore pipeline/wm_ends.py
  node pipeline/compress.mjs wm-ends
  pipeline/.venv/bin/python -I -W ignore pipeline/wm_ends.py finalize

Inputs
  pipeline/data/raw/hcp1065/tracts/     the HCP-1065 atlas's streamline files (fetch_sources.py), read as build.py reads
                                        them for the white-matter section (read_trk_gz: if that reading changes, run
                                        this again), every streamline of a bundle
  pipeline/data/build/cortex/ctx_*.glb  the cortex section's surface as built (cortex_build.py): one mesh per Destrieux
                                        label and side, and the medial wall
  src/data/generated/ctx-manifest.json  the labels' names
Writes
  pipeline/data/build/wm-ends/*.glb     per tract, the patches of cortex where its ends cluster (compress.mjs ->
                                        public/assets/wm-ends/)
  src/data/generated/wm-ends.json       per tract and bundle: where each of its two ends lies; the tract's patch file;
                                        and what the patches' entries say (source, licence, citations)

What is measured, and how
  - A streamline has two ends. Within a bundle the streamlines are turned the same way round (along the bundle's main
    direction between its ends; a midline bundle from left to right), so the bundle has two ends too, named by where
    they lie against each other: front and back, upper and lower, left and right.
  - An end is at the cortex when it lies within REACH_MM of the cortex section's surface (the template's pial
    surface), not more than OUTSIDE_MM outside it, and the nearest point of the surface is not the medial wall. The
    side test keeps the cerebellar ends of the cerebellar peduncles out: they lie within REACH_MM of the basal surface
    of the occipital and temporal lobes, but outside it. The end's area is the label of that nearest point.
  - Per end of a bundle: the share of its streamlines' ends at the cortex, and of those, the share in each area.
    Areas with less than MIN_SHARE are summed as the rest.
  - The patches: per tract and hemisphere, the ends at the cortex are counted at their nearest point of the surface,
    the counts spread over the surface (SMOOTH_STEPS steps to neighbouring points), and the patch is the part of the
    surface with the highest counts that holds PATCH_SHARE of the ends. A hemisphere gets a patch when at least
    PATCH_MIN_ENDS ends, and PATCH_MIN_SHARE of the ends that could lie there, are at its cortex.

What it is not
  The ends of an averaged bundle's streamlines, not connections: tractography ends preferentially on the crowns of
  gyri, not on the banks of sulci (Schilling 2018), its terminations in grey matter are inaccurate (Maier-Hein 2017),
  and it cannot confirm that a bundle innervates an area (Yeh 2022). src/tracts/content.ts carries these with their
  sources. The atlas's published tract-to-region table (Yeh 2022; no longer fetched) counts overlap instead, on purpose.
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
import config as C  # noqa: E402
from build import crossed, read_trk_gz  # noqa: E402
from glb import read_glb_full, write_glb  # noqa: E402

REPO = ROOT.parent
KIND = "wm-ends"
RAW = ROOT / "data" / "raw" / "hcp1065" / "tracts"
CORTEX = ROOT / "data" / "build" / "cortex"
BUILD = ROOT / "data" / "build" / KIND
GEN = REPO / "src" / "data" / "generated"
PUBLIC = REPO / "public" / "assets"
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())

REACH_MM = 5.0            # an end is at the cortex within this distance of the surface ...
OUTSIDE_MM = 1.5          # ... and not further than this outside it: the cerebellar peduncles' ends lie further out
                          # (none within 1.5 mm); at 1.0 mm ends on gyral crowns just outside the surface were lost
                          # (the right SLF I's front end: 61 % at 1.0 mm, 90 % at 1.5, 99 % at 2.0; measured 19 Nov 2026)
MIN_SHARE = 0.05          # an area is listed for an end when it holds at least this share of the end's cortical ends
END_MIN_SHARE = 0.05      # an end of a bundle is said to reach the cortex when at least this share of its ends does
PATCH_SHARE = 0.8         # a patch holds this share of a hemisphere's cortical ends of the tract: where they are densest
PATCH_MIN_ENDS = 30       # a hemisphere gets a patch with at least this many ends at its cortex ...
PATCH_MIN_SHARE = 0.10    # ... which are at least this share of the ends that could lie there
SMOOTH_STEPS = 4          # the counts are spread this many steps over the surface (a step: half to the neighbours)
MEDIAL_WALL = "ctx_medial_wall"
END_NAMES = {0: ("lateral", "medial"), 1: ("front", "back"), 2: ("upper", "lower")}   # the +axis end, then the other


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


# ---------------------------------------------------------------- the cortex section's surface
class Cortex:
    """The cortex section's surface: every label mesh of both hemispheres (the medial wall among them), as points with
    their label, side and outward normal; and each hemisphere as one welded mesh for spreading counts and cutting
    patches."""

    def __init__(self) -> None:
        man = json.loads((GEN / "ctx-manifest.json").read_text())
        self.names = {s["id"]: s["name"] for s in man["structures"] if not s["id"].startswith("ctx_fn_")}
        self.cite = (man["dataset"]["citation"], man["dataset"]["citationUrls"])
        P, N, lab, side = [], [], [], []
        faces: dict[str, list[np.ndarray]] = {"L": [], "R": []}
        off = 0
        for lid in sorted(self.names):
            f = CORTEX / f"{lid}.glb"
            if not f.exists():
                raise SystemExit(f"{f} missing: the cortex section's build (cortex_build.py)")
            for sd, nd in read_glb_full(f).items():
                if nd["normals"] is None:
                    raise SystemExit(f"{f}: no normals")
                n = len(nd["positions"])
                P.append(nd["positions"])
                N.append(nd["normals"])
                lab += [lid] * n
                side += [sd] * n
                faces[sd].append(nd["indices"] + off)
                off += n
        self.P, self.N = np.vstack(P), np.vstack(N)
        self.label, self.side = np.array(lab), np.array(side)
        self.tree = cKDTree(self.P)
        self.hemi = {sd: self._weld(np.vstack(faces[sd])) for sd in ("L", "R")}
        e = np.concatenate([np.linalg.norm(self.P[F[:, 0]] - self.P[F[:, 1]], axis=1) for F in (np.vstack(faces["L"]), np.vstack(faces["R"]))])
        self.edge_mm = round(float(np.median(e)), 2)

    def _weld(self, F: np.ndarray) -> dict:
        """One hemisphere as a single mesh: the label meshes' points welded where they coincide (the labels' borders).
        `of` maps a point of the whole surface to its welded point (-1 on the other hemisphere)."""
        used = np.unique(F)
        key = np.round(self.P[used], 3)
        uniq, inv = np.unique(key, axis=0, return_inverse=True)
        inv = inv.ravel()
        of = np.full(len(self.P), -1)
        of[used] = inv
        Fw = of[F]
        Fw = Fw[(Fw[:, 0] != Fw[:, 1]) & (Fw[:, 1] != Fw[:, 2]) & (Fw[:, 0] != Fw[:, 2])]
        n = len(uniq)
        V, Nw, cnt, walls = np.zeros((n, 3)), np.zeros((n, 3)), np.zeros(n), np.zeros(n)
        np.add.at(V, inv, self.P[used])
        np.add.at(Nw, inv, self.N[used])
        np.add.at(cnt, inv, 1)
        np.add.at(walls, inv, self.label[used] == MEDIAL_WALL)
        V /= cnt[:, None]
        Nw /= np.linalg.norm(Nw, axis=1, keepdims=True) + 1e-12
        i = np.r_[Fw[:, 0], Fw[:, 1], Fw[:, 2], Fw[:, 1], Fw[:, 2], Fw[:, 0]]
        j = np.r_[Fw[:, 1], Fw[:, 2], Fw[:, 0], Fw[:, 0], Fw[:, 1], Fw[:, 2]]
        A = sp.csr_matrix((np.ones(len(i)), (i, j)), shape=(n, n))
        A.data[:] = 1.0
        W = sp.diags(1.0 / np.maximum(np.asarray(A.sum(1)).ravel(), 1)) @ A
        # points of the medial wall are not cortex: no count is spread onto them, no patch drawn on them (a point on
        # the wall's border, which a label shares, stays cortex)
        return {"V": V, "N": Nw, "F": Fw, "of": of, "W": W, "wall": walls == cnt}

    def at(self, E: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """For points E: the nearest point of the surface, whether E is at the cortex there, and whether it lies
        within reach of the medial wall instead."""
        d, i = self.tree.query(E)
        out = np.einsum("ij,ij->i", E - self.P[i], self.N[i])
        near = (d <= REACH_MM) & (out <= OUTSIDE_MM)
        wall = self.label[i] == MEDIAL_WALL
        return i, near & ~wall, near & wall


# ---------------------------------------------------------------- a bundle's two ends
def streamlines(t: C.WmTract, key: str) -> list[np.ndarray]:
    sls = read_trk_gz(RAW / t.files[key])
    if t.keep:
        sls = [sl for sl in sls if crossed(sl) == (t.keep == "crossed")]
    return [sl for sl in sls if len(sl) >= 2]


def oriented(t: C.WmTract) -> tuple[dict[str, tuple[np.ndarray, np.ndarray, int]], tuple[str, str]]:
    """Each bundle of a tract (a side's, or the midline one) as its streamlines' two ends, turned the same way round,
    with the ends' names: {key: (first ends, second ends, streamlines)}, (name of the first, name of the second)."""
    raw = {k: streamlines(t, k) for k in t.files}
    ends = {k: (np.array([s[0] for s in v]), np.array([s[-1] for s in v])) for k, v in raw.items()}
    if "midline" in ends:
        a, b = ends["midline"]
        flip = a[:, 0] > b[:, 0]                       # from the left hemisphere to the right
        a2, b2 = np.where(flip[:, None], b, a), np.where(flip[:, None], a, b)
        return {"midline": (a2, b2, len(a))}, ("left", "right")
    # the bundle's main direction between its ends, the two sides taken together (the right side mirrored)
    mirror = {"L": np.array([-1.0, 1, 1]), "R": np.ones(3)}
    D = np.vstack([(b - a) * mirror[k] for k, (a, b) in ends.items()])
    w, v = np.linalg.eigh(D.T @ D)
    u = v[:, np.argmax(w)]
    axis = int(np.argmax(np.abs(u)))
    if u[axis] < 0:
        u = -u
    out = {}
    for k, (a, b) in ends.items():
        back = ((b - a) * mirror[k]) @ u < 0             # the first point is the +u end: turn it round
        first = np.where(back[:, None], a, b)            # the end towards +u (front, upper, lateral)
        second = np.where(back[:, None], b, a)
        out[k] = (first, second, len(a))
    return out, END_NAMES[axis]


def end_record(ctx: Cortex, E: np.ndarray) -> tuple[dict, np.ndarray, np.ndarray]:
    """One end of a bundle: the share of its ends at the cortex and near the medial wall, and the areas. Also the
    nearest surface points and which ends are at the cortex (for the patches)."""
    i, cortex, wall = ctx.at(E)
    n = int(cortex.sum())
    rec = {"atCortex": round(float(cortex.mean()), 3), "atMedialWall": round(float(wall.mean()), 3), "areas": [], "rest": 0.0}
    if cortex.mean() >= END_MIN_SHARE and n:
        c = Counter(zip(ctx.side[i[cortex]].tolist(), ctx.label[i[cortex]].tolist()))
        listed = [(sd, lid, k / n) for (sd, lid), k in c.most_common() if k / n >= MIN_SHARE]
        rec["areas"] = [{"id": lid, "side": sd, "share": round(s, 3)} for sd, lid, s in listed]
        rec["rest"] = round(max(0.0, 1 - sum(s for _, _, s in listed)), 3)
    return rec, i, cortex


# ---------------------------------------------------------------- the patches
def patch(h: dict, at: np.ndarray) -> tuple[dict | None, dict]:
    """The patch of one hemisphere for the ends lying at its points `at` (welded indices, one per end): the part of the
    surface with the highest spread counts that holds PATCH_SHARE of the ends, cut where the count crosses that level.
    Returns the mesh node's arrays and what was measured."""
    n = len(h["V"])
    x = np.bincount(at, minlength=n).astype(float)
    for _ in range(SMOOTH_STEPS):
        x = 0.5 * x + 0.5 * (h["W"] @ x)
        x[h["wall"]] = 0
    dens = np.sort(x[at])[::-1]
    level = float(dens[min(len(dens) - 1, int(np.ceil(PATCH_SHARE * len(dens))) - 1)])
    if level <= 0:
        return None, {}
    inside = x >= level
    V, N, F = h["V"], h["N"], h["F"]
    k = inside[F].sum(1)
    faces = [F[k == 3]]
    new_v, new_n, on_edge = [], [], {}

    def cross(i: int, j: int) -> int:
        """The point on the edge from i (inside) to j (outside) where the count crosses the level."""
        key = (i, j)
        if key not in on_edge:
            tt = (x[i] - level) / (x[i] - x[j]) if x[i] != x[j] else 0.0
            on_edge[key] = n + len(new_v)
            new_v.append(V[i] + tt * (V[j] - V[i]))
            nn = N[i] + tt * (N[j] - N[i])
            new_n.append(nn / (np.linalg.norm(nn) + 1e-12))
        return on_edge[key]
    extra = []
    for tri in F[(k == 1) | (k == 2)]:
        poly = []
        for e in range(3):
            i, j = int(tri[e]), int(tri[(e + 1) % 3])
            if inside[i]:
                poly.append(i)
                if not inside[j]:
                    poly.append(cross(i, j))
            elif inside[j]:
                poly.append(cross(j, i))
        for q in range(1, len(poly) - 1):
            extra.append([poly[0], poly[q], poly[q + 1]])
    if extra:
        faces.append(np.array(extra))
    Fp = np.vstack(faces)
    if not len(Fp):
        return None, {}
    Vall = np.vstack([V, np.array(new_v)]) if new_v else V
    Nall = np.vstack([N, np.array(new_n)]) if new_n else N
    used = np.zeros(len(Vall), bool)
    used[Fp.ravel()] = True
    idx = np.cumsum(used) - 1
    Vp, Np, Fp = Vall[used], Nall[used], idx[Fp]
    area = float(np.linalg.norm(np.cross(Vp[Fp[:, 1]] - Vp[Fp[:, 0]], Vp[Fp[:, 2]] - Vp[Fp[:, 0]]), axis=1).sum() / 2)
    return ({"positions": Vp, "normals": Np, "indices": Fp},
            {"ends": int(len(at)), "endsInPatch": round(float(inside[at].mean()), 3), "areaCm2": round(area / 100, 1), "faces": int(len(Fp))})


# ---------------------------------------------------------------- what the patches' entries say
def ctx_source(ctx: Cortex) -> str:
    return "the cortex section's surface (the MNI 2009b template's pial surface shipped with Lead-DBS, Destrieux labels)"


LICENCE = ("GPL-3.0, non-commercial: cut from the cortex section's surface, under its licence; where they lie is derived from "
           "the HCP-1065 tractography atlas (CC BY-SA 4.0; derived from Human Connectome Project data, so also subject to the "
           "WU-Minn HCP Open Access Data Use Terms)")
DERIVATION = (f"The part of the cortex section's surface where the ends of this tract's streamlines are densest: the ends within "
              f"{REACH_MM:g} mm of the surface are counted at their nearest point of it, the counts spread over the surface, and "
              f"the patch holds {PATCH_SHARE:.0%} of them. Where the streamlines of an averaged bundle end, not where the "
              f"tract connects.")


# ---------------------------------------------------------------- build
def main() -> int:
    ctx = Cortex()
    BUILD.mkdir(parents=True, exist_ok=True)
    for old in BUILD.glob("*.glb"):
        old.unlink()
    wm = json.loads((GEN / "wm-manifest.json").read_text())
    wm_ds = wm["dataset"]
    tracts: dict[str, dict] = {}
    for t in C.WM_SHOWN:
        bundles, names = oriented(t)
        rec = {"name": t.name, "abbr": t.abbr, "ends": list(names), "bundles": {}, "patch": None}
        # the ends at each hemisphere's cortex (welded points), and how many ends could lie there
        at: dict[str, list[np.ndarray]] = {"L": [], "R": []}
        could = {"L": 0, "R": 0}
        for key, (first, second, n) in bundles.items():
            sides = []
            for E in (first, second):
                r, i, cortex = end_record(ctx, E)
                sides.append(r)
                for sd in ("L", "R"):
                    on = cortex & (ctx.side[i] == sd)
                    at[sd].append(ctx.hemi[sd]["of"][i[on]])
            rec["bundles"]["M" if key == "midline" else key] = {"streamlines": n, "ends": sides}
            if key == "midline":
                could["L"] += n; could["R"] += n
            else:
                could[key] += 2 * n
        nodes, measured = [], {}
        for sd in ("L", "R"):
            a = np.concatenate(at[sd]) if at[sd] else np.zeros(0, int)
            if len(a) < max(PATCH_MIN_ENDS, PATCH_MIN_SHARE * could[sd]):
                continue
            arrays, m = patch(ctx.hemi[sd], a)
            if arrays is None:
                continue
            nodes.append({"name": sd, **arrays})
            measured[sd] = m
        if nodes:
            pid = f"{t.id}__ends"
            write_glb(BUILD / f"{pid}.glb", nodes, {"id": pid})
            cent = {nd["name"]: np.asarray(nd["positions"]).mean(0).round(2).tolist() for nd in nodes}
            for sd in ("L", "R"):
                cent.setdefault(sd, cent.get("R" if sd == "L" else "L"))
            rec["patch"] = {"id": pid, "file": f"assets/{KIND}/{pid}.glb", "bytes": 0, "colour": colour(t.colour),
                            "centroid": {"L": cent["L"], "R": cent["R"]}, **measured}
        tracts[t.id] = rec
        shares = "; ".join("{} {:.0%}/{:.0%}".format(k, b["ends"][0]["atCortex"], b["ends"][1]["atCortex"]) for k, b in rec["bundles"].items())
        patches = " ".join("{} {} cm2".format(sd, m["areaCm2"]) for sd, m in measured.items())
        print(f"{t.id:10s} ends {names[0]}/{names[1]}: {shares}; " + (f"patch {patches}" if nodes else "no patch"))
    used = sorted({a["id"] for r in tracts.values() for b in r["bundles"].values() for e in b["ends"] for a in e["areas"]})
    out = {
        "generatedBy": "pipeline/wm_ends.py",
        "source": f"{wm_ds['name']}: every streamline of each bundle; {ctx_source(ctx)}",
        # what every patch's entry says (the front end makes the entries: src/tracts/index.ts)
        "patches": {"source": f"{wm_ds['name']}; {ctx_source(ctx)}", "licence": LICENCE,
                    "citation": [*wm_ds["citation"], *ctx.cite[0]], "citationUrls": [*wm_ds["citationUrls"], *ctx.cite[1]],
                    "derivation": DERIVATION},
        "rule": {"reachMm": REACH_MM, "outsideMm": OUTSIDE_MM, "minShare": MIN_SHARE, "endMinShare": END_MIN_SHARE,
                 "patchShare": PATCH_SHARE, "patchMinEnds": PATCH_MIN_ENDS, "patchMinShare": PATCH_MIN_SHARE,
                 "smoothSteps": SMOOTH_STEPS, "surfaceEdgeMm": ctx.edge_mm},
        "areas": {i: ctx.names[i] for i in used},
        "tracts": tracts,
    }
    (GEN / "wm-ends.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(f"wm ends: {len(tracts)} tracts, {sum(1 for r in tracts.values() if r['patch'])} with patches, {len(used)} areas named")
    return 0


# ---------------------------------------------------------------- finalize, validate
def finalize() -> None:
    p = GEN / "wm-ends.json"
    m = json.loads(p.read_text())
    for r in m["tracts"].values():
        if r["patch"]:
            r["patch"]["bytes"] = (REPO / "public" / r["patch"]["file"]).stat().st_size
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))


def validate() -> int:
    m = json.loads((GEN / "wm-ends.json").read_text())
    fails, n = [], 0

    def check(ok: bool, msg: str) -> None:
        nonlocal n
        n += 1
        if not ok:
            fails.append(msg)
    T = m["tracts"]
    check(set(T) == {t.id for t in C.WM_SHOWN}, "every shown tract, and no other")
    names = json.loads((GEN / "ctx-manifest.json").read_text())
    known = {s["id"] for s in names["structures"]}
    for tid, r in T.items():
        for key, b in r["bundles"].items():
            check(len(b["ends"]) == 2 and b["streamlines"] > 0, f"{tid} {key}: two ends")
            for e, nm in zip(b["ends"], r["ends"]):
                s = sum(a["share"] for a in e["areas"]) + e["rest"]
                check(not e["areas"] or abs(s - 1) < 0.01, f"{tid} {key} {nm}: shares sum to {s}")
                check(all(a["id"] in known and a["id"] != MEDIAL_WALL and a["share"] >= MIN_SHARE for a in e["areas"]), f"{tid} {key} {nm}: areas")
                check((e["atCortex"] >= END_MIN_SHARE) == bool(e["areas"]), f"{tid} {key} {nm}: {e['atCortex']} at the cortex, {len(e['areas'])} areas")
    for tid, r in T.items():
        if r["patch"]:
            check(r["patch"]["id"] == f"{tid}__ends" and (REPO / "public" / r["patch"]["file"]).exists() and r["patch"]["bytes"] > 0, f"{tid}: patch file")
            for sd in ("L", "R"):
                p = r["patch"].get(sd)
                if p:
                    check(p["endsInPatch"] >= PATCH_SHARE - 0.02 and 0.2 <= p["areaCm2"] <= 400, f"{tid} {sd}: patch holds {p['endsInPatch']} of the ends on {p['areaCm2']} cm2")

    def end(tid: str, key: str, name: str) -> dict:
        r = T[tid]
        return r["bundles"][key]["ends"][r["ends"].index(name)]

    def share(e: dict, lid: str) -> float:
        return sum(a["share"] for a in e["areas"] if a["id"] == lid)
    # what the measurement must keep showing (the build's figures of November 2026, with room)
    insula = ("ctx_g_insular_short", "ctx_g_ins_lg_and_s_cent_ins", "ctx_s_circular_insula_ant", "ctx_s_circular_insula_inf", "ctx_s_circular_insula_sup")
    check(all(i in known for i in (*insula, "ctx_g_precentral", "ctx_g_front_inf_opercular")), "the areas named in these checks exist")
    for key in ("L", "R"):
        # the audit's example: the IFOF passes the insula, it does not end there
        check(all(share(e, i) == 0 for e in T["wm_ifof"]["bundles"][key]["ends"] for i in insula), f"wm_ifof {key}: an end in the insula")
        check(T["wm_ifof"]["ends"] == ["front", "back"], "wm_ifof: front and back ends")
        # the corticospinal tract: its upper end on the precentral gyrus, its lower end not at the cortex
        up, low = end("wm_cst", key, "upper"), end("wm_cst", key, "lower")
        check(up["areas"] and up["areas"][0]["id"] == "ctx_g_precentral" and up["atCortex"] > 0.7, f"wm_cst {key} upper end: {up}")
        check(low["atCortex"] < 0.02 and not low["areas"], f"wm_cst {key} lower end: {low}")
        # the arcuate fasciculus: frontal in front, temporal behind
        check(share(end("wm_af", key, "front"), "ctx_g_front_inf_opercular") > 0.15, f"wm_af {key}: front end")
        check(not any(a["id"].startswith(("ctx_g_front", "ctx_s_front")) for a in end("wm_af", key, "back")["areas"]), f"wm_af {key}: back end")
        # the cerebellar peduncles do not end at the cerebral cortex
        check(all(e["atCortex"] < 0.02 for e in T["wm_icp"]["bundles"][key]["ends"]), f"wm_icp {key}: at the cortex")
    for tid in ("wm_mcp", "wm_scp"):
        check(all(e["atCortex"] < 0.02 for e in T[tid]["bundles"]["M"]["ends"]) and T[tid]["patch"] is None, f"{tid}: at the cortex")
    check(T["wm_cc"]["ends"] == ["left", "right"] and T["wm_cc"]["patch"] is not None, "wm_cc: left and right ends, a patch")
    print(f"wm ends validation: {n - len(fails)}/{n} checks passed")
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


if __name__ == "__main__":
    if sys.argv[1:] == ["finalize"]:
        finalize()
        sys.exit(validate())
    sys.exit(main())
