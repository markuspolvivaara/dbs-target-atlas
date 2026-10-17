"""Build the skull-base section's web assets from pipeline/data/build/skullbase/export.json.

Run pipeline/skullbase_export.py (inside Blender) first. Writes
  pipeline/data/build/skullbase/*.glb         uncompressed GLBs (compress.mjs -> public/assets/skullbase/)
  src/data/generated/sb-manifest.json          structures (bones, soft tissue, vessels, nerves)
  src/data/generated/sb-landmarks.json         labelled bony landmarks
  src/data/generated/sb-definitions.json       Wikipedia-derived definitions (CC BY-SA 3.0) as shipped in Z-Anatomy

Space: RAS millimetres relative to the hypophysial fossa landmark of the Z-Anatomy model
(one adult male, BodyParts3D). This is not MNI space and is not registered to the brain atlases.
Midline structures are cut at x = 0 into left and right halves so the hemisphere toggle and the
cut-away work; paired structures (.l / .r) keep their own sides.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build import split_midline  # noqa: E402
from glb import LINES, TRIANGLES, write_glb  # noqa: E402

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
BUILD = ROOT / "data" / "build" / "skullbase"
GEN = REPO / "src" / "data" / "generated"
PUBLIC = REPO / "public" / "assets"
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())
CITES = json.loads((ROOT / "sources" / "citations.json").read_text())

DATASET = {
    "name": "Z-Anatomy (based on BodyParts3D)",
    "licence": "CC BY-SA 4.0 (Z-Anatomy); BodyParts3D CC BY-SA 2.1 Japan; definitions from Wikipedia, CC BY-SA 3.0",
    "url": "https://github.com/Z-Anatomy/Models-of-human-anatomy",
    "cite": ["mitsuhashi2009"],
    "attribution": [
        "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan",
        "Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0",
        "Definitions: Wikipedia - CC-BY-SA 3.0 (the source page is linked on each definition)",
    ],
    "note": "One adult male model (BodyParts3D), not a population average, and not in MNI space. Coordinates are millimetres "
            "from Z-Anatomy's hypophysial fossa landmark. Bones were simplified (retopologized) by Z-Anatomy; vessels and nerves "
            "are centre lines with no calibre information.",
}
# regions of the page: the model's structures that come within REGION_MM of these landmarks
REGION_LANDMARKS = {"Hypophysial fossa": 15.0, "Optic canal": 15.0, "Apex of petrous part": 15.0, "Foramen ovale": 15.0,
                    "Foramen magnum": 25.0}  # the foramen magnum point is the centre of the opening
KIND_TOKEN = {"bone": "sbBone", "soft": "sbSoft", "artery": "sbArtery", "vein": "sbVein", "nerve": "sbNerve"}


def slug(name: str) -> str:
    s = re.sub(r"\([^)]*\)", lambda m: m.group(0)[1:-1], name)
    return "sb_" + re.sub(r"[^a-z0-9]+", "_", s.lower()).strip("_")


def split_pair(name: str) -> tuple[str, str | None]:
    """'Temporal bone.l' -> ('Temporal bone', 'L'). Z-Anatomy spells some left/right pairs differently
    ('(M3 segment)' / '(M3-segment)', '(M2)' / '(M2-segment)'): those are normalised so the pair joins."""
    side = None
    for suf, sd in ((".l", "L"), (".r", "R")):
        if name.endswith(suf):
            name, side = name[: -len(suf)], sd
            break
    name = re.sub(r"\((M\d)(?:[- ]segment)?\)", r"(\1 segment)", name)
    return name, side


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


def mesh_split(verts: np.ndarray, tris: np.ndarray) -> dict[str, tuple[np.ndarray, np.ndarray]]:
    """Split a midline mesh into left/right halves by triangle centroid (x < 0 is left)."""
    cx = verts[tris].mean(axis=1)[:, 0]
    out = {}
    for side, sel in (("L", cx < 0), ("R", cx >= 0)):
        t = tris[sel]
        if not len(t):
            continue
        used, inv = np.unique(t, return_inverse=True)
        out[side] = (verts[used], inv.reshape(-1, 3))
    return out


def normals(v: np.ndarray, t: np.ndarray) -> np.ndarray:
    n = np.zeros_like(v)
    fn = np.cross(v[t[:, 1]] - v[t[:, 0]], v[t[:, 2]] - v[t[:, 0]])
    for k in range(3):
        np.add.at(n, t[:, k], fn)
    ln = np.linalg.norm(n, axis=1, keepdims=True)
    return n / np.where(ln == 0, 1, ln)


def definition(raw: str | None) -> dict | None:
    """Lead section of a Z-Anatomy definition (before the first '==' heading), plus its Wikipedia link."""
    if not raw:
        return None
    url = None
    lines = [ln.strip() for ln in raw.strip().splitlines()]
    if lines and lines[-1].startswith("http"):
        url = lines[-1]
        lines = lines[:-1]
    body = "\n".join(lines)
    body = body.split("\n==")[0]
    paras = [p.strip() for p in re.split(r"\n\s*\n", body) if p.strip()]
    if paras and paras[0].isupper():
        paras = paras[1:]  # the title line
    text = " ".join(paras)
    if len(text) > 900:  # keep whole sentences
        cut = text[:900].rfind(". ")
        text = text[: cut + 1] if cut > 200 else text[:900] + "…"
    return {"text": text, "url": url} if text else None


def main() -> int:
    ex = json.loads((BUILD / "export.json").read_text())
    BUILD.mkdir(parents=True, exist_ok=True)
    for old in BUILD.glob("*.glb"):  # structures can be renamed or merged between runs
        old.unlink()
    groups: dict[str, dict] = {}

    def add(name: str, kind: str, mtype: str, side: str | None, payload):
        base, _ = split_pair(name)
        g = groups.setdefault(base, {"name": base, "kind": kind, "type": mtype, "sides": {}, "midline": side is None})
        g["sides"][side or "M"] = payload

    for n, b in ex["bones"].items():
        base, side = split_pair(n)
        add(n, "bone", "bone", side, (np.array(b["verts"]), np.array(b["tris"])))
    for n, b in ex["soft"].items():
        base, side = split_pair(n)
        add(n, "soft", "soft", side, (np.array(b["verts"]), np.array(b["tris"])))
    for n, ln in ex["lines"].items():
        base, side = split_pair(n)
        add(n, ln["kind"], "tract", side, [np.array(r) for r in ln["runs"]])

    items, report = [], {}
    for base, g in sorted(groups.items()):
        sid = slug(base)
        nodes, cent = [], {}
        if g["type"] in ("bone", "soft"):
            parts = {}
            for side, (v, t) in g["sides"].items():
                parts.update(mesh_split(v, t) if side == "M" else {side: (v, t)})
            for side, (v, t) in sorted(parts.items()):
                nodes.append({"name": side, "positions": v, "normals": normals(v, t), "indices": t, "mode": TRIANGLES})
                cent[side] = v.mean(0).round(2).tolist()
        else:
            per = {"L": [], "R": []}
            for side, runs in g["sides"].items():
                for r in runs:
                    if side == "M":
                        for s2, pieces in split_midline(r).items():
                            per[s2].extend(p for p in pieces if len(p) >= 2)
                    else:
                        per[side].append(r)
            for side, runs in per.items():
                if not runs:
                    continue
                pos = np.vstack(runs)
                idx, off = [], 0
                for r in runs:
                    k = len(r)
                    idx.append(np.column_stack([np.arange(off, off + k - 1), np.arange(off + 1, off + k)]))
                    off += k
                nodes.append({"name": side, "positions": pos, "normals": None, "indices": np.vstack(idx), "mode": LINES})
                cent[side] = pos.mean(0).round(2).tolist()
        if not nodes:
            continue
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        for side in ("L", "R"):  # one-sided structures report the same centroid for both (the viewer reads both)
            cent.setdefault(side, cent.get("R" if side == "L" else "L"))
        f = f"assets/skullbase/{sid}.glb"
        items.append({
            "id": sid, "name": base, "aliases": [], "type": g["type"], "role": "tract" if g["type"] == "tract" else None,
            "file": f, "bytes": 0, "colour": colour(KIND_TOKEN[g["kind"]]), "dataset": "zanatomy",
            "source": DATASET["name"], "licence": DATASET["licence"],
            "citation": [CITES[c]["citation"] for c in DATASET["cite"]], "citationUrls": [CITES[c]["url"] for c in DATASET["cite"]],
            "refIds": [], "category": g["kind"],
            "derivation": ("Cut at the midline (x = 0) into left and right halves. " if g["midline"] else "")
                          + ("Mesh exported unchanged from Z-Anatomy." if g["type"] != "tract"
                             else "Centre line exported from the Z-Anatomy curve (no calibre), cropped to the head."),
            "centroid": {"L": cent["L"], "R": cent["R"]},
        })
        report[sid] = {"sides": sorted(k for k in ("L", "R") if any(n["name"] == k for n in nodes)), "kind": g["kind"]}
    for it in items:
        it.pop("role") if it["role"] is None else None
    ids = [it["id"] for it in items]
    dup = {i for i in ids if ids.count(i) > 1}
    if dup:
        raise SystemExit(f"duplicate structure ids: {sorted(dup)}")

    landmarks = []
    for lm in ex["landmarks"]:
        x = lm["ras"][0]
        landmarks.append({
            "id": slug(lm["name"]).replace("sb_", "lm_", 1), "name": lm["name"].strip(), "bone": lm["bone"],
            "part": lm["path"][0] if lm["path"] and len(lm["path"]) > 1 else None,
            "ras": lm["ras"], "side": "M" if abs(x) < 3 else ("R" if x > 0 else "L"),
            "boneFrom": lm["boneFrom"], "distanceToBoneMm": lm["distanceToBoneMm"],
        })
    # measured groupings: intracranial share of each vessel/nerve, and structures near key landmarks
    from scipy.spatial import Delaunay, cKDTree
    cran = ["Frontal bone", "Parietal bone", "Occipital bone", "Temporal bone", "Sphenoid bone", "Ethmoid bone"]
    hull_pts = np.vstack([np.vstack([v for (v, _t) in [groups[b]["sides"][k] for k in groups[b]["sides"]]]) for b in cran])
    hull = Delaunay(hull_pts[::3])
    fm = next(lm for lm in ex["landmarks"] if lm["name"] == "Foramen magnum")["ras"]
    pts_of = {}
    for base, g in groups.items():
        if g["type"] == "tract":
            pts_of[slug(base)] = np.vstack([r for runs in g["sides"].values() for r in runs])
        else:
            pts_of[slug(base)] = np.vstack([v for (v, _t) in g["sides"].values()])
    for it in items:
        if it["type"] == "tract":
            p_ = pts_of[it["id"]]
            inside = (hull.find_simplex(p_) >= 0) & (p_[:, 2] > fm[2] - 5)
            it["intracranialFraction"] = round(float(inside.mean()), 2)
    regions = []
    for lm_name, REGION_MM in REGION_LANDMARKS.items():
        lm = next(x for x in ex["landmarks"] if x["name"] == lm_name)
        c = np.array(lm["ras"])
        near = []
        for it in items:
            d = float(cKDTree(pts_of[it["id"]]).query(c)[0])
            if d <= REGION_MM:
                near.append({"id": it["id"], "distanceMm": round(d, 1)})
        lmn = [x["name"] for x in ex["landmarks"] if np.linalg.norm(np.array(x["ras"]) - c) <= REGION_MM]
        regions.append({"landmark": lm_name, "ras": lm["ras"], "radiusMm": REGION_MM,
                        "structures": sorted(near, key=lambda x: x["distanceMm"]), "landmarks": lmn})

    defs = {}
    for n, raw in ex["texts"].items():
        d = definition(raw)
        if d:
            defs[n.strip()] = d

    manifest = {
        "space": "RAS millimetres from the hypophysial fossa landmark of the Z-Anatomy model (not MNI)",
        "generatedBy": "pipeline/skullbase_export.py (Blender) + pipeline/skullbase_build.py + pipeline/compress.mjs",
        "structures": items,
        "dataset": {"name": DATASET["name"], "licence": DATASET["licence"], "url": DATASET["url"], "note": DATASET["note"],
                    "attribution": DATASET["attribution"],
                    "citation": [CITES[c]["citation"] for c in DATASET["cite"]], "citationUrls": [CITES[c]["url"] for c in DATASET["cite"]]},
    }
    GEN.mkdir(parents=True, exist_ok=True)
    (GEN / "sb-manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    (GEN / "sb-landmarks.json").write_text(json.dumps(landmarks, indent=1, ensure_ascii=False))
    (GEN / "sb-definitions.json").write_text(json.dumps(defs, indent=1, ensure_ascii=False))
    (GEN / "sb-regions.json").write_text(json.dumps(regions, indent=1, ensure_ascii=False))
    (BUILD / "report.json").write_text(json.dumps(report, indent=1))
    print(f"skull base: {len(items)} structures ({sum(i['type'] == 'bone' for i in items)} bones, "
          f"{sum(i['type'] == 'soft' for i in items)} soft, {sum(i['type'] == 'tract' for i in items)} vessels/nerves), "
          f"{len(landmarks)} landmarks, {len(defs)} definitions")
    return 0


def validate() -> int:
    """Sides, symmetry and landmark sanity for the exported model. Exit 1 on failure."""
    m = json.loads((GEN / "sb-manifest.json").read_text())
    lms = json.loads((GEN / "sb-landmarks.json").read_text())
    fails, n = [], 0

    def check(ok: bool, msg: str) -> None:
        nonlocal n
        n += 1
        if not ok:
            fails.append(msg)
    for it in m["structures"]:
        c = it["centroid"]
        if c["L"] != c["R"]:  # two sides: the left node must lie left of the right node
            check(c["L"][0] < c["R"][0], f"{it['id']}: left centroid x {c['L'][0]} not left of right {c['R'][0]}")
        if it["type"] == "bone" and c["L"] != c["R"]:
            check(abs(c["L"][0] + c["R"][0]) < 6, f"{it['id']}: left/right centroids not mirror-like (x {c['L'][0]} / {c['R'][0]})")
    temporal = next(i for i in m["structures"] if i["id"] == "sb_temporal_bone")
    check(temporal["centroid"]["L"][0] < -30, f"temporal bone left centroid x {temporal['centroid']['L'][0]} (expected well left of midline)")
    frontal = next(i for i in m["structures"] if i["id"] == "sb_frontal_bone")
    occipital = next(i for i in m["structures"] if i["id"] == "sb_occipital_bone")
    check(frontal["centroid"]["R"][1] > occipital["centroid"]["R"][1], "frontal bone should lie anterior (+y) of the occipital bone")
    fossa = next(lm for lm in lms if lm["name"] == "Hypophysial fossa")
    check(max(abs(v) for v in fossa["ras"]) < 0.01, f"origin: hypophysial fossa at {fossa['ras']}")
    for lm in lms:
        check(lm["distanceToBoneMm"] <= 16, f"landmark {lm['name']} {lm['distanceToBoneMm']} mm from bone")
    print(f"skull base validation: {n - len(fails)}/{n} checks passed")
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


def finalize() -> None:
    """After compress.mjs: drop compressed files of structures that no longer exist, fill in file sizes and
    copy the manifest next to the assets."""
    p = GEN / "sb-manifest.json"
    m = json.loads(p.read_text())
    keep = {Path(it["file"]).name for it in m["structures"]}
    for f in (PUBLIC / "skullbase").glob("*.glb"):
        if f.name not in keep:
            f.unlink()
    for it in m["structures"]:
        it["bytes"] = (REPO / "public" / it["file"]).stat().st_size
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    shutil.copy(p, PUBLIC / "sb-manifest.json")


if __name__ == "__main__":
    if sys.argv[1:] == ["finalize"]:
        finalize()
        sys.exit(validate())
    sys.exit(main())
