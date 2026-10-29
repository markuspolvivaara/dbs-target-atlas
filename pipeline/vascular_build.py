"""Vascular section: this CT angiogram's arteries and veins (Skull base v2/v3), vascular lesions drawn onto them by rule
(aneurysms, arteriovenous malformations, a dural arteriovenous fistula, carotid-cavernous fistulas), and for every
vessel the time contrast reaches it in a schematic angiogram (a DSA-like view in 3D).

  pipeline/.venv/bin/python -I -W ignore pipeline/vascular_build.py      (after skullbase_v3.py; then
  node pipeline/compress.mjs vascular, and npm run build)

The normal vessels are Skull base v3's: TopBrain's expert labels of this CT angiogram (the circle of Willis, the cerebral
arteries to M3, A3 and P3-P4, the deep veins, the straight and superior sagittal sinuses), the vessels v3 traces in the CT
(the dural sinuses, the middle meningeal artery, the carotid's petrous part), TotalSegmentator's cervical carotids and
jugular veins, and the small vessels v3 fits from the Z-Anatomy model or draws by rule (the cavernous sinus and its
veins, the Sylvian veins, the perforators). Their meshes are taken as they are.

The angiogram's timing is a drawing choice, not measured: it shows the order in which contrast reaches the vessels, not
their transit times. Arteries fill from the injection (the cervical carotids, the vertebral arteries; the external
carotid's branches from the foramen spinosum) in order of their distance along the vessels (ART_SPAN_S for the farthest),
veins after a capillary delay (VEN_START_S) from their upstream ends to the jugular veins (VEN_SPAN_S); each stays opaque
for a while (DWELL_*), then washes out. A lesion's shunt has no capillary bed between artery and vein (an arteriovenous
malformation is a conglomeration of arteriovenous shunts without one: Naranbhai 2023), so its veins fill as soon as its
nidus or fistula does, in the arterial phase, and the sinuses they drain into fill from there on, before the normal
venous phase.

Writes pipeline/data/build/vascular/*.glb (per vertex: _ARRIVAL and _DWELL, as shares of T_MAX_S) and
src/data/generated/va-manifest.json.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sp
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from glb import TRIANGLES, write_glb  # noqa: E402

REPO = ROOT.parent
GEN = REPO / "src" / "data" / "generated"
BUILD = ROOT / "data" / "build" / "vascular"
DATA = ROOT / "data" / "build"
KIND = "vascular"
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())

T_MAX_S = 9.0          # the angiogram's length (arrival and dwell are stored as shares of it)
ART_SPAN_S = 1.6       # the farthest artery fills this long after the injection (illustrative)
ECA_DELAY_S = 0.15     # the external carotid's branches start this late (from the foramen spinosum: illustrative)
VEN_START_S = 3.4      # the first veins fill this long after the injection (after the capillary phase: illustrative)
VEN_SPAN_S = 2.6       # ... the jugular veins this much later
DWELL_ART_S = 2.2      # how long a vessel stays opaque before it washes out (illustrative)
DWELL_VEN_S = 3.0
LINK_MM = 1.2          # vessels whose surfaces come this close are joined in the flow graph
SHUNT_SPEED = 120.0    # mm/s: how fast contrast runs on from a shunt through its veins (illustrative)


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def read_glb(path: Path) -> dict:
    """{node name: (positions, triangles)} of an uncompressed GLB (this pipeline's own)."""
    from pygltflib import GLTF2
    g = GLTF2().load(str(path))
    blob = g.binary_blob()

    def acc(i):
        a = g.accessors[i]
        bv = g.bufferViews[a.bufferView]
        n = {"SCALAR": 1, "VEC3": 3}[a.type]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a.componentType]
        arr = np.frombuffer(blob, dt, a.count * n, (bv.byteOffset or 0) + (a.byteOffset or 0))
        return arr.reshape(a.count, n).astype(float) if n > 1 else arr.astype(np.int64)
    out = {}
    for node in g.nodes:
        if node.mesh is None:
            continue
        p = g.meshes[node.mesh].primitives[0]
        out[node.name] = (acc(p.attributes.POSITION), acc(p.indices).reshape(-1, 3))
    return out


def normals(v, t):
    import trimesh
    return trimesh.Trimesh(v, t, process=False).vertex_normals.copy()


# ---------------------------------------------------------------- the normal vessels and their timing
SKIP = {"Anterior spinal artery"}      # (outside the field: the spinal cord is not drawn)


def v3_manifest() -> dict:
    return json.loads((GEN / "sbv3-manifest.json").read_text())


def normal_vessels() -> list[dict]:
    """Skull base v3's arteries and veins: [{name, category, item (v3's), nodes {side: (P, T)}}]."""
    out = []
    for it in v3_manifest()["structures"]:
        if it.get("category") not in ("artery", "vein") or it["name"] in SKIP or it.get("approach"):
            continue
        path = DATA / it["file"].replace("assets/", "")
        out.append({"name": it["name"], "category": it["category"], "item": it, "nodes": read_glb(path)})
    return out


class Network:
    """One system's vessels (all their nodes) as one graph: the mesh edges, and links between vessels whose vertices come
    within LINK_MM. Vertices are indexed in the order of (vessel, node)."""

    def __init__(self, parts: list[tuple[str, str, np.ndarray, np.ndarray]]):
        self.keys, self.cut = [], [0]
        P, E = [], []
        for name, node, v, t in parts:
            self.keys.append((name, node))
            off = self.cut[-1]
            P.append(v)
            E.append(np.vstack([t[:, [0, 1]], t[:, [1, 2]], t[:, [2, 0]]]) + off)
            self.cut.append(off + len(v))
        self.P = np.vstack(P)
        E = np.vstack(E)
        part = np.repeat(np.arange(len(parts)), np.diff(self.cut))
        pairs = cKDTree(self.P).query_pairs(LINK_MM, output_type="ndarray")
        pairs = pairs[part[pairs[:, 0]] != part[pairs[:, 1]]]
        E = np.vstack([E, pairs])
        w = np.linalg.norm(self.P[E[:, 0]] - self.P[E[:, 1]], axis=1) + 1e-3
        n = len(self.P)
        self.G = sp.coo_matrix((np.r_[w, w], (np.r_[E[:, 0], E[:, 1]], np.r_[E[:, 1], E[:, 0]])), shape=(n, n)).tocsr()

    def distance(self, sources: list[int], offsets: list[float] | None = None) -> np.ndarray:
        """Shortest distance along the vessels from any source (plus its offset, mm); unreached vertices get the nearest
        reached vertex's distance plus the gap."""
        d = dijkstra(self.G, indices=sources, min_only=True) if offsets is None else None
        if offsets is not None:
            d = np.min(np.vstack([dijkstra(self.G, indices=s) + o for s, o in zip(sources, offsets)]), axis=0)
        bad = ~np.isfinite(d)
        if bad.any() and (~bad).any():
            tr = cKDTree(self.P[~bad])
            g, j = tr.query(self.P[bad])
            d[bad] = d[~bad][j] + g
        return d

    def split(self, a: np.ndarray) -> dict:
        return {k: a[self.cut[i]:self.cut[i + 1]] for i, k in enumerate(self.keys)}


def landmark(name: str, side: str) -> np.ndarray:
    lm = json.loads((GEN / "sbv3-landmarks.json").read_text())
    return np.array(next(l["ras"] for l in lm if l["name"] == name and l["side"] == side), float)


def timing(vessels: list[dict]) -> tuple[dict, dict, dict]:
    """Arrival (s) per (vessel, node) vertex, for arteries and veins, and the networks."""
    art = [v for v in vessels if v["category"] == "artery"]
    ven = [v for v in vessels if v["category"] == "vein"]
    A = Network([(v["name"], n, P, T) for v in art for n, (P, T) in v["nodes"].items()])
    roots, offs = [], []
    for v in art:
        for n, (P, T) in v["nodes"].items():
            k = A.keys.index((v["name"], n))
            if v["name"] in ("Internal carotid artery (cervical part)", "Vertebral artery"):
                roots.append(A.cut[k] + int(np.argmin(P[:, 2])))
                offs.append(0.0)
    dart = A.distance(roots, [0.0] * len(roots))
    # the external carotid's branches (not joined to the rest: v3 traces the middle meningeal artery from the foramen spinosum)
    span = float(np.percentile(dart[np.isfinite(dart)], 99))
    t_art = dart / span * ART_SPAN_S
    for v in art:
        if "meningeal" in v["name"].lower():
            for n, (P, T) in v["nodes"].items():
                k = A.keys.index((v["name"], n))
                fs = landmark("Foramen spinosum", n if n in "LR" else "R")
                sl = slice(A.cut[k], A.cut[k + 1])
                sub = Network([(v["name"], n, P, T)])
                d = sub.distance([int(np.argmin(np.linalg.norm(P - fs, axis=1)))], [0.0])
                t_art[sl] = ECA_DELAY_S + d / span * ART_SPAN_S
    t_art = np.minimum(t_art, ART_SPAN_S * 1.15)
    V = Network([(v["name"], n, P, T) for v in ven for n, (P, T) in v["nodes"].items()])
    outlets = []
    for v in ven:
        if v["name"] == "Internal jugular vein":
            for n, (P, T) in v["nodes"].items():
                k = V.keys.index((v["name"], n))
                outlets.append(V.cut[k] + int(np.argmin(P[:, 2])))
    dout = V.distance(outlets, [0.0] * len(outlets))
    far = float(np.percentile(dout, 99))
    t_ven = VEN_START_S + np.clip(far - dout, 0, None) / far * VEN_SPAN_S
    return A.split(t_art), V.split(t_ven), {"art": A, "ven": V, "dout": dout, "far": far, "span": span}


# ---------------------------------------------------------------- outputs
def write_vessel(vid: str, nodes: dict, arrival: dict, dwell: float) -> dict:
    """A vessel's GLB: its nodes as they are, with _ARRIVAL and _DWELL; returns its centroid by side."""
    gl, cent = [], {}
    for n, (P, T) in nodes.items():
        a = arrival[n]
        gl.append({"name": n if n in "LR" else "R", "positions": P, "normals": normals(P, T), "indices": T, "mode": TRIANGLES,
                   "scalars": {"_ARRIVAL": np.clip(a / T_MAX_S, 0, 1).astype(np.float32),
                               "_DWELL": np.full(len(P), dwell / T_MAX_S, np.float32)}})
        cent[n if n in "LR" else "R"] = P.mean(0).round(2).tolist()
    write_glb(BUILD / f"{vid}.glb", gl, {"id": vid})
    if "L" not in cent:
        cent["L"] = cent["R"]
    if "R" not in cent:
        cent["R"] = cent["L"]
    return cent


def base_item(it: dict, vid: str, cent: dict, extra: str) -> dict:
    return {**{k: it[k] for k in ("name", "aliases", "colour", "dataset", "source", "licence", "citation", "citationUrls", "refIds", "category")},
            "id": vid, "type": "tube", "file": f"assets/{KIND}/{vid}.glb", "bytes": 0,
            **({"system": it["system"]} if it.get("system") else {}), **({"schematic": True} if it.get("schematic") else {}),
            **({"fitted": True} if it.get("fitted") else {}),
            "layer": "tracts" if it["category"] == "artery" else "vessels",
            "derivation": (it.get("derivation", "") + " " + extra).strip(), "centroid": cent}


def context_items() -> list[dict]:
    """The skull and the fitted brain, Skull base v3's files as they are (drawn faint, not in the angiogram)."""
    out = []
    for it in v3_manifest()["structures"]:
        if (it.get("type") == "bone" and not it.get("approach")) or it.get("category") == "brain":
            out.append({**{k: v for k, v in it.items() if k not in ("morph", "layer")}, "id": "va_" + it["id"],
                        "layer": "nuclei" if it.get("type") == "bone" else "cortex"})
    return out


def main() -> int:
    BUILD.mkdir(parents=True, exist_ok=True)
    vessels = normal_vessels()
    t_art, t_ven, net = timing(vessels)
    items = []
    for v in vessels:
        art = v["category"] == "artery"
        arr = {n: (t_art if art else t_ven)[(v["name"], n)] for n in v["nodes"]}
        vid = "va_" + slug(v["name"])
        cent = write_vessel(vid, v["nodes"], arr, DWELL_ART_S if art else DWELL_VEN_S)
        items.append(base_item(v["item"], vid, cent, "In the angiogram it fills in the " + ("arterial" if art else "venous") + " phase."))
    import vascular_lesions as LES
    lesion_items, lesions = LES.build(vessels, t_art, t_ven, net)
    items += lesion_items
    items += context_items()
    (GEN / "va-lesions.json").write_text(json.dumps({"lesions": lesions}, indent=1, ensure_ascii=False))
    a_all = np.concatenate([np.concatenate(list(t_art.values()))])
    v_all = np.concatenate(list(t_ven.values()))
    manifest = {
        "space": "millimetres from the fitted hypophysial fossa, the CT turned into the Z-Anatomy model's frame (as Skull base v2 and v3)",
        "generatedBy": "pipeline/vascular_build.py + pipeline/compress.mjs",
        "dsa": {"tMaxS": T_MAX_S, "artSpanS": ART_SPAN_S, "venStartS": VEN_START_S, "venSpanS": VEN_SPAN_S,
                "dwellArtS": DWELL_ART_S, "dwellVenS": DWELL_VEN_S,
                "arterialS": [round(float(a_all.min()), 2), round(float(a_all.max()), 2)],
                "venousS": [round(float(v_all.min()), 2), round(float(v_all.max()), 2)]},
        "structures": items,
        "dataset": v3_manifest()["dataset"],
    }
    (GEN / "va-manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    print(len(items), "structures,", len(lesions), "lesions; arteries", manifest["dsa"]["arterialS"], "s, veins", manifest["dsa"]["venousS"], "s")
    return 0


def finalize() -> int:
    """The compressed files' sizes into the manifest (after node pipeline/compress.mjs vascular), and checks."""
    p = GEN / "va-manifest.json"
    m = json.loads(p.read_text())
    fails = []
    for it in m["structures"]:
        f = REPO / "public" / it["file"]
        if not f.exists():
            fails.append(f"missing {it['file']}")
            continue
        it["bytes"] = f.stat().st_size
    les = json.loads((GEN / "va-lesions.json").read_text())["lesions"]
    ids = {it["id"] for it in m["structures"]}
    for l in les:
        for pid in l["parts"]:
            if pid not in ids:
                fails.append(f"{l['id']}: part {pid} missing")
        if l["kind"] == "avm":
            sm = l["sm"]
            size = 1 if l["nidusMm"] < 30 else 2 if l["nidusMm"] <= 60 else 3
            if size != sm["size"] or sm["grade"] != sm["size"] + sm["eloquence"] + sm["deep"]:
                fails.append(f"{l['id']}: Spetzler-Martin points do not match its nidus")
            got = l["nidus"]["measuredMm"]        # the drawn network's greatest diameter, as graded
            if abs(got - l["nidusMm"]) > 0.05 * l["nidusMm"] or (1 if got < 30 else 2 if got <= 60 else 3) != sm["size"]:
                fails.append(f"{l['id']}: its drawn nidus measures {got} mm, not {l['nidusMm']} mm")
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    print("vascular:", len(m["structures"]), "structures,", len(les), "lesions;", "OK" if not fails else fails)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(finalize() if sys.argv[1:2] == ["finalize"] else main())
