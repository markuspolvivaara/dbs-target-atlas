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
from scipy.spatial import cKDTree  # noqa: E402
import skullbase_foramina as foramina  # noqa: E402
from glb import TRIANGLES, write_glb  # noqa: E402
from meshcheck import orient_outward  # noqa: E402

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
# Two models share this build: the Z-Anatomy one (default) and the detailed one ("ct": the CT angiogram with
# TopBrain's vessels and the fitted Z-Anatomy nerves, pipeline/skullbase_ct.py), with their own files
CT = sys.argv[1:2] == ["ct"]
if CT:
    sys.argv.pop(1)
KIND = "skullbase-ct" if CT else "skullbase"          # build folder and public/assets folder
PREFIX = "sbct" if CT else "sb"                        # generated file names
BUILD = ROOT / "data" / "build" / KIND
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
            "from Z-Anatomy's hypophysial fossa landmark. Bones were simplified (retopologized) by Z-Anatomy and are smoothed here by "
            "one subdivision level; vessels and nerves are drawn as tubes with the calibre Z-Anatomy models (not measured).",
}
if CT:
    DATASET = {
        "name": "TopBrain 2025 CT angiogram (case 011) with the Z-Anatomy model fitted onto it",
        "licence": "TopBrain data: open use with attribution, non-commercial (commercial use needs the data owner's permission; "
                   "University Hospital Zurich); Z-Anatomy CC BY-SA 4.0, BodyParts3D CC BY-SA 2.1 Japan; definitions Wikipedia CC BY-SA 3.0",
        "url": "https://topbrain2025.grand-challenge.org",
        "cite": ["topbrain2025", "topcow2023", "mitsuhashi2009", "wasserthal2023"],
        "attribution": [
            "TopBrain 2025 challenge data (University Hospital Zurich): CT angiogram and vessel labels of case topcow_ct_011 - "
            "https://topbrain2025.grand-challenge.org, https://zenodo.org/records/16878417 - open use, source given, non-commercial",
            "BodyParts3D - The Database Center for Life Science - CC-BY-SA 2.1 Japan",
            "Z-Anatomy - The libre 3D atlas of anatomy - CC-BY-SA 4.0",
            "Definitions: Wikipedia - CC-BY-SA 3.0 (the source page is linked on each definition)",
        ],
        "note": "One adult head CT angiogram (0.5 mm isotropic), not an average and not in MNI space. Bone (the cranial bones; the scan cuts the face off): the CT's own surface "
                "(400 HU, and thin bone down to 170 HU where it adjoins that bone, outside the labelled vessels, within TotalSegmentator's skull; and the walls of the air "
                "sinuses, where thin bone averaged with the air falls below any threshold; the holes this leaves in the paper-thin orbital roofs "
                "closed by rule at the height of the roof around them), named bone by bone after the nearest bone of the "
                "Z-Anatomy model fitted onto it. Arteries and the deep veins: surfaces of TopBrain's expert labels of the same scan. "
                "Cranial nerves, the dural sinuses and arteries TopBrain does not label, the soft tissue and the landmark names: the "
                "Z-Anatomy model fitted onto this skull (scaled, then deformed smoothly), so their positions are approximate. "
                "Coordinates: millimetres from the fitted hypophysial fossa, the CT turned into the Z-Anatomy model's frame.",
    }
# regions of the page: the model's structures that come within REGION_MM of these landmarks
REGION_LANDMARKS = {"Hypophysial fossa": 15.0, "Optic canal": 15.0, "Apex of petrous part": 15.0, "Foramen ovale": 15.0,
                    "Foramen magnum": 25.0}  # the foramen magnum point is the centre of the opening
# Arteries kept for skull-base teaching, by system (editorial selection, in the order the legend lists them).
# Names as normalised by split_pair. Every other artery of the model (other external carotid branches to the face,
# scalp, jaw and nose; distal cortical branches; small orbital branches) is left out.
ARTERY_SYSTEMS: dict[str, list[str]] = {
    "Internal carotid artery": ["Internal carotid artery", "Ophthalmic artery", "Posterior communicating artery"],
    "Anterior cerebral artery": ["Anterior cerebral artery", "Anterior communicating artery",
                                 "Orbitofrontal branches of anterior cerebral artery", "Pericallosal artery",
                                 "Callosomarginal artery", "Frontal branches of callosomarginal artery"],
    "Middle cerebral artery": ["Middle cerebral artery (M1 segment)", "Insular branches of middle cerebral artery (M2 segment)",
                               "Middle cerebral artery (M3 segment)", "Proximal lateral striate branches",
                               "Distal lateral striate branches", "Lateral frontobasal artery", "Prefrontal artery",
                               "Artery of precentral sulcus", "Artery of central sulcus", "Postcentral arterial branch",
                               "Posterior parietal artery", "Parietal branches of middle cerebral artery", "Angular artery",
                               "Branch to angular gyrus", "Temporal branches of middle cerebral artery",
                               "Anterior temporal branch", "Posterior temporal branch", "Temporo-occipital branch"],
    "Vertebral artery": ["Vertebral artery", "Posterior inferior cerebellar artery", "Anterior spinal artery"],
    "Basilar artery": ["Basilar artery", "Anterior inferior cerebellar artery", "Superior cerebellar artery",
                       "Medial pontine branches of basilar artery", "Lateral pontine branches of basilar artery"],
    "Posterior cerebral artery": ["Posterior cerebral artery"],
    "Middle meningeal artery": ["Middle meningeal artery", "Accessory branch of middle meningeal artery"],
    "Ethmoidal arteries": ["Anterior ethmoidal artery", "Posterior ethmoidal artery"],
    # endoscopic endonasal landmarks: the sphenopalatine branches (nasoseptal flap pedicle) and the vidian artery
    "Maxillary artery": ["Maxillary artery", "Posterior septal branches of sphenopalatine artery",
                         "Posterior lateral nasal branches of sphenopalatine artery", "Artery of pterygoid canal"],
}
if CT:  # TopBrain's labelled arteries, and the Z-Anatomy ones it does not label (fitted)
    ARTERY_SYSTEMS = {
        "Internal carotid artery": ["Internal carotid artery", "Ophthalmic artery", "Posterior communicating artery", "Anterior choroidal artery"],
        "Anterior cerebral artery": ["Anterior cerebral artery (A1–A2)", "Anterior cerebral artery (A3)", "Anterior communicating artery",
                                     "Third anterior cerebral artery (A2)", "Third anterior cerebral artery (A3)"],
        "Middle cerebral artery": ["Middle cerebral artery (M1 segment)", "Middle cerebral artery (M2 segment)",
                                   "Middle cerebral artery (M3 segment)", "Proximal lateral striate branches", "Distal lateral striate branches"],
        "Vertebral artery": ["Vertebral artery", "Posterior inferior cerebellar artery", "Anterior spinal artery"],
        "Basilar artery": ["Basilar artery", "Anterior inferior cerebellar artery", "Superior cerebellar artery",
                           "Medial pontine branches of basilar artery", "Lateral pontine branches of basilar artery"],
        "Posterior cerebral artery": ["Posterior cerebral artery (P1–P2)", "Posterior cerebral artery (P3–P4)"],
        "Middle meningeal artery": ["Middle meningeal artery", "Accessory branch of middle meningeal artery"],
        "Ethmoidal arteries": ["Anterior ethmoidal artery", "Posterior ethmoidal artery"],
        "Maxillary artery": ["Maxillary artery", "Posterior septal branches of sphenopalatine artery",
                             "Posterior lateral nasal branches of sphenopalatine artery", "Artery of pterygoid canal"],
    }
ARTERY_SYSTEM = {a: sys_ for sys_, members in ARTERY_SYSTEMS.items() for a in members}
# Nerves drawn as one structure under one name (editorial simplification): the trigeminal nerve's three divisions,
# each with its branches, and the chorda tympani with the facial nerve
NERVE_MERGE = {
    "Ophthalmic nerve": "Ophthalmic nerve (V1)",
    "Maxillary nerve": "Maxillary nerve (V2)", "Meningeal branch of maxillary nerve": "Maxillary nerve (V2)",
    **{n: "Mandibular nerve (V3)" for n in ("Anterior division of mandibular nerve", "Posterior division of mandibular nerve",
                                             "Inferior alveolar nerve", "Lingual nerve", "Buccal nerve", "Mental nerve",
                                             "Nerve to mylohyoid muscle")},
    "Chorda tympani": "Facial nerve (VII)",
}
# a merged structure's definition: that of the nerve it is named for
MERGED_TEXT = {"Ophthalmic nerve (V1)": "Ophthalmic nerve", "Maxillary nerve (V2)": "Maxillary nerve",
               "Mandibular nerve (V3)": "Mandibular nerve",
               # TopBrain's segments: the definition of the vessel they are part of
               "Anterior cerebral artery (A1–A2)": "Anterior cerebral artery", "Anterior cerebral artery (A3)": "Anterior cerebral artery",
               "Posterior cerebral artery (P1–P2)": "Posterior cerebral artery", "Posterior cerebral artery (P3–P4)": "Posterior cerebral artery",
               "Middle cerebral artery (M2 segment)": "Insular branches of middle cerebral artery (M2 segment)"}
# the bone a located foramen is listed under (otherwise the nearest bone)
FORAMEN_BONE = {"Internal acoustic meatus": "Temporal bone", "Stylomastoid foramen": "Temporal bone", "Superior orbital fissure": "Sphenoid bone",
                "External opening of carotid canal": "Temporal bone", "Internal opening of carotid canal": "Temporal bone",
                "Foramen lacerum": "Temporal bone", "Jugular foramen": "Occipital bone", "Cribriform plate": "Ethmoid bone"}
AO_FLOOR = 0.45  # fully enclosed bone surface is drawn at this share of its colour
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
    return name.rstrip("."), side  # one Z-Anatomy name ends in a stray full stop


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


def mesh_split(verts: np.ndarray, tris: np.ndarray, ao: np.ndarray) -> dict[str, tuple[np.ndarray, np.ndarray, np.ndarray]]:
    """Split a midline mesh into left/right halves by triangle centroid (x < 0 is left)."""
    cx = verts[tris].mean(axis=1)[:, 0]
    out = {}
    for side, sel in (("L", cx < 0), ("R", cx >= 0)):
        t = tris[sel]
        if not len(t):
            continue
        used, inv = np.unique(t, return_inverse=True)
        out[side] = (verts[used], inv.reshape(-1, 3), ao[used])
    return out


TUBE_MIN_RADIUS_MM = 0.3   # thinner Z-Anatomy branches are drawn this thick so they stay visible
TUBE_STEP = (0.5, 2.5)     # ring spacing: 1.2 x radius, within these bounds (mm)
ROMAN = {r: i + 1 for i, r in enumerate("I II III IV V VI VII VIII IX X XI XII".split())}


def cranial_nerve(name: str, path: list[str] | None) -> int | None:
    """Number of the cranial nerve a nerve belongs to: the numeral in its own name, else in the innermost
    Z-Anatomy collection that names one (branches sit in their nerve's collection)."""
    for n in [name, *(path or [])]:
        m = re.search(r"\(([IVX]+)\)", n)
        if m and m.group(1) in ROMAN:
            return ROMAN[m.group(1)]
    return None


def resample(run: np.ndarray) -> np.ndarray:
    """Thin a centre line (x, y, z, r) so rings are about 1.2 radii apart; ends are kept."""
    keep, acc = [0], 0.0
    for i in range(1, len(run)):
        acc += float(np.linalg.norm(run[i, :3] - run[i - 1, :3]))
        step = np.clip(1.2 * max(run[i, 3], TUBE_MIN_RADIUS_MM), *TUBE_STEP)
        if acc >= step or i == len(run) - 1:
            keep.append(i)
            acc = 0.0
    return run[keep]


def tube(run: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Triangle tube around a centre line with per-point radius; closed with flat end caps.
    Returns positions, normals, triangles."""
    run = resample(run)
    if len(run) < 2:
        return np.zeros((0, 3)), np.zeros((0, 3)), np.zeros((0, 3), int)
    P, R = run[:, :3], np.maximum(run[:, 3], TUBE_MIN_RADIUS_MM)
    sides = 8 if R.max() >= 0.8 else 6
    T = np.gradient(P, axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True) + 1e-12
    # parallel-transport frames (no twisting along the tube)
    a = np.array([1.0, 0, 0]) if abs(T[0, 0]) < 0.9 else np.array([0, 1.0, 0])
    N = [np.cross(T[0], a)]
    N[0] /= np.linalg.norm(N[0])
    for i in range(1, len(P)):
        n = N[-1] - T[i] * np.dot(N[-1], T[i])
        ln = np.linalg.norm(n)
        N.append(n / ln if ln > 1e-9 else N[-1])
    N = np.array(N)
    B = np.cross(T, N)
    ang = np.linspace(0, 2 * np.pi, sides, endpoint=False)
    dirs = np.cos(ang)[None, :, None] * N[:, None, :] + np.sin(ang)[None, :, None] * B[:, None, :]
    pos = (P[:, None, :] + R[:, None, None] * dirs).reshape(-1, 3)
    nrm = dirs.reshape(-1, 3)
    tris = []
    for i in range(len(P) - 1):
        for k in range(sides):
            a0, a1 = i * sides + k, i * sides + (k + 1) % sides
            b0, b1 = a0 + sides, a1 + sides
            tris += [[a0, a1, b0], [a1, b1, b0]]  # wound outward (around the tangent)
    # end caps: a centre vertex and a ring of their own (flat normals)
    caps_p, caps_n = [], []
    base = len(pos)
    for end, sgn in ((0, -1.0), (len(P) - 1, 1.0)):
        c = base + len(caps_p)
        caps_p.append(P[end]); caps_n.append(sgn * T[end])
        ring0 = c + 1
        for k in range(sides):
            caps_p.append(P[end] + R[end] * dirs[end, k]); caps_n.append(sgn * T[end])
        for k in range(sides):
            u, v = ring0 + k, ring0 + (k + 1) % sides
            tris.append([c, v, u] if sgn < 0 else [c, u, v])
    return np.vstack([pos, caps_p]), np.vstack([nrm, caps_n]), np.array(tris)


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
        if mtype == "tube":   # a nerve's runs can come from several source curves (NERVE_MERGE)
            g["sides"].setdefault(side or "M", []).extend(payload)
        else:
            g["sides"][side or "M"] = payload

    for n, b in ex["bones"].items():
        base, side = split_pair(n)
        add(n, "bone", "bone", side, (np.array(b["verts"]), np.array(b["tris"]), np.array(b["ao"])))
    for n, b in ex["soft"].items():
        base, side = split_pair(n)
        add(n, "soft", "soft", side, (np.array(b["verts"]), np.array(b["tris"]), np.ones(len(b["verts"]))))
    # vessels drawn as the surfaces of labels (the CT model: TopBrain's)
    for n, b in ex.get("meshes", {}).items():
        base, side = split_pair(n)
        add(n, b["kind"], "vmesh", side, (np.array(b["verts"]), np.array(b["tris"]), np.ones(len(b["verts"]))))
    fitted = {split_pair(n)[0] for part in ("lines", "soft") for n, x in ex.get(part, {}).items() if x.get("fitted")}
    cn: dict[str, int] = {}
    arteries = {split_pair(n)[0] for n, ln in ex["lines"].items() if ln["kind"] == "artery"}
    arteries |= {split_pair(n)[0] for n, m in ex.get("meshes", {}).items() if m["kind"] == "artery"}
    missing = set(ARTERY_SYSTEM) - arteries
    if CT:   # a CT case labels the vessels this patient has (variants: no anterior choroidal, no third A2...)
        core = {"Internal carotid artery", "Basilar artery", "Vertebral artery", "Middle cerebral artery (M1 segment)",
                "Anterior cerebral artery (A1–A2)", "Posterior cerebral artery (P1–P2)", "Anterior communicating artery",
                "Posterior communicating artery", "Middle meningeal artery"}
        if missing & core:
            raise SystemExit(f"core arteries not in the CT model: {sorted(missing & core)}")
        if missing:
            print(f"not in this case (variants), left out: {sorted(missing)}")
        for a_ in missing:
            ARTERY_SYSTEM.pop(a_)
    elif missing:
        raise SystemExit(f"ARTERY_SYSTEMS names not in the model: {sorted(missing)}")
    for n, ln in ex["lines"].items():
        base, side = split_pair(n)
        if ln["kind"] == "artery" and base not in ARTERY_SYSTEM:
            continue  # not among the arteries kept for skull-base teaching
        runs = [np.array(r) for r in ln["runs"]]
        if ln["kind"] == "nerve" and base in NERVE_MERGE:
            merged = NERVE_MERGE[base]
            g = groups.setdefault(merged, {"name": merged, "kind": "nerve", "type": "tube", "sides": {}, "midline": side is None})
            g["sides"].setdefault(side or "M", []).extend(runs)
            cn[merged] = cranial_nerve(base, ln.get("path"))
            continue
        add(n, ln["kind"], "tube", side, runs)
        if ln["kind"] == "nerve" and cranial_nerve(base, ln.get("path")):
            cn[base] = cranial_nerve(base, ln.get("path"))

    items, report = [], {}
    for base, g in sorted(groups.items()):
        sid = slug(base)
        nodes, cent = [], {}
        if g["type"] in ("bone", "soft", "vmesh"):
            parts = {}
            for side, (v, t, ao) in g["sides"].items():
                t = orient_outward(v, t)  # a few source meshes are inside out
                parts.update(mesh_split(v, t, ao) if side == "M" else {side: (v, t, ao)})
            for side, (v, t, ao) in sorted(parts.items()):
                node = {"name": side, "positions": v, "normals": normals(v, t), "indices": t, "mode": TRIANGLES}
                if g["type"] == "bone":  # baked ambient occlusion as a grey vertex colour
                    node["colors"] = np.repeat((AO_FLOOR + (1 - AO_FLOOR) * ao)[:, None], 3, axis=1)
                nodes.append(node)
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
                vs, ns, ts, off = [], [], [], 0
                for r in runs:
                    v_, n_, t_ = tube(r)
                    if not len(t_):
                        continue
                    vs.append(v_); ns.append(n_); ts.append(t_ + off)
                    off += len(v_)
                if not ts:
                    continue
                nodes.append({"name": side, "positions": np.vstack(vs), "normals": np.vstack(ns), "indices": np.vstack(ts), "mode": TRIANGLES})
                cent[side] = np.vstack([r[:, :3] for r in runs]).mean(0).round(2).tolist()
        if not nodes:
            continue
        write_glb(BUILD / f"{sid}.glb", nodes, {"id": sid})
        for side in ("L", "R"):  # one-sided structures report the same centroid for both (the viewer reads both)
            cent.setdefault(side, cent.get("R" if side == "L" else "L"))
        f = f"assets/{KIND}/{sid}.glb"
        if CT:   # where this structure comes from in the CT model
            how = ("The CT angiogram's bone surface (400 HU, thin bone down to 170 HU next to it and the walls of the air sinuses, outside the labelled vessels; holes in the thin orbital roofs closed by rule), the part nearest this bone of the Z-Anatomy "
                   "model fitted onto it; shading darkened where neighbouring bone encloses it." if g["type"] == "bone"
                   else "Surface of TopBrain's expert label of this vessel on the CT angiogram." if g["type"] == "vmesh"
                   else ("Fitted from the Z-Anatomy model onto this CT's skull (approximate position): " if base in fitted else "")
                   + ("its mesh." if g["type"] == "soft" else
                      f"a tube around its curve, with the radius Z-Anatomy models, at least {TUBE_MIN_RADIUS_MM} mm."))
        items.append({
            "id": sid, "name": base, "aliases": [], "type": "tube" if g["type"] == "vmesh" else g["type"], "role": None,
            **({"fitted": True} if CT and base in fitted else {}),
            "file": f, "bytes": 0, "colour": colour(KIND_TOKEN[g["kind"]]), "dataset": "zanatomy",
            "source": DATASET["name"], "licence": DATASET["licence"],
            "citation": [CITES[c]["citation"] for c in DATASET["cite"]], "citationUrls": [CITES[c]["url"] for c in DATASET["cite"]],
            "refIds": [], "category": g["kind"],
            "derivation": ("Cut at the midline (x = 0) into left and right halves. " if g["midline"] else "")
                          + (how if CT else "Mesh from Z-Anatomy, smoothed by one subdivision level and decimated; shading darkened where "
                             "neighbouring bone encloses it (baked ambient occlusion)." if g["type"] == "bone"
                             else "Mesh exported unchanged from Z-Anatomy." if g["type"] == "soft"
                             else "Tube around the Z-Anatomy curve's centre line, with the radius Z-Anatomy models at each point "
                                  f"(its curve bevel: modelled, not measured), at least {TUBE_MIN_RADIUS_MM} mm; cropped to the head."),
            "centroid": {"L": cent["L"], "R": cent["R"]},
            **({"cranialNerve": cn[base]} if base in cn else {}),
            **({"system": ARTERY_SYSTEM[base]} if g["kind"] == "artery" else {}),
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
    # foramina the model does not label, located from what passes through them (both sides). The Z-Anatomy model only: on
    # the CT the fitted nerves and the fitted carotid do not run through the CT's own canals closely enough
    bone_meshes = {n: (np.array(b["verts"]), np.array(b["tris"])) for n, b in ex["bones"].items() if not n.startswith("Sinus of")}
    btrees = {n: cKDTree(v) for n, (v, _t) in bone_meshes.items()}
    for f in ([] if CT else foramina.derive(bone_meshes, ex["lines"])):
        p_ = np.array(f["ras"])
        dist = {n: float(t.query(p_)[0]) for n, t in btrees.items()}
        near = min(dist, key=dist.get)
        bone_name = FORAMEN_BONE.get(f["name"]) or split_pair(near)[0]
        lm = {"name": f["name"], "ras": f["ras"], "path": None, "bone": bone_name, "boneFrom": "located from what passes through it",
              "distanceToBoneMm": round(dist[near], 1)}
        ex["landmarks"].append(lm)
        landmarks.append({
            "id": slug(f["name"]).replace("sb_", "lm_", 1) + "_" + f["side"].lower(), "name": f["name"], "bone": bone_name, "part": None,
            "ras": f["ras"], "side": f["side"], "boneFrom": lm["boneFrom"], "distanceToBoneMm": lm["distanceToBoneMm"],
            "how": f["how"][0].upper() + f["how"][1:] + ".", "from": f["from"],
        })
    # measured groupings: intracranial share of each vessel/nerve, and structures near key landmarks
    from scipy.spatial import Delaunay
    cran = ["Frontal bone", "Parietal bone", "Occipital bone", "Temporal bone", "Sphenoid bone", "Ethmoid bone"]
    hull_pts = np.vstack([np.vstack([v for (v, _t, _a) in [groups[b]["sides"][k] for k in groups[b]["sides"]]]) for b in cran])
    hull = Delaunay(hull_pts[::3])
    fm = next(lm for lm in ex["landmarks"] if lm["name"] == "Foramen magnum")["ras"]
    pts_of = {}
    for base, g in groups.items():
        if g["type"] == "tube":
            pts_of[slug(base)] = np.vstack([r[:, :3] for runs in g["sides"].values() for r in runs])
        else:
            pts_of[slug(base)] = np.vstack([v for (v, _t, _a) in g["sides"].values()])
    for it in items:
        if it["type"] == "tube":
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
        lmn = list(dict.fromkeys(x["name"] for x in ex["landmarks"] if np.linalg.norm(np.array(x["ras"]) - c) <= REGION_MM))
        regions.append({"landmark": lm_name, "ras": lm["ras"], "radiusMm": REGION_MM,
                        "structures": sorted(near, key=lambda x: x["distanceMm"]), "landmarks": lmn})

    defs = {}
    shown = {it["name"] for it in items} | {lm["name"].strip() for lm in landmarks}
    for n, raw in ex["texts"].items():
        d = definition(raw)
        key = split_pair(n.strip())[0]  # structures by their normalised name ('(M1 segment)'), as the cards look them up
        if d and key in shown:
            defs[key] = d
    for merged, src in MERGED_TEXT.items():
        d = definition(ex["texts"].get(src))
        if d and merged in shown:
            defs[merged] = d

    manifest = {
        "space": ("millimetres from the fitted hypophysial fossa, the CT turned into the Z-Anatomy model's frame (not MNI)" if CT
                  else "RAS millimetres from the hypophysial fossa landmark of the Z-Anatomy model (not MNI)"),
        "generatedBy": ("pipeline/skullbase_ct.py (TopBrain CTA + fitted Z-Anatomy) + pipeline/skullbase_build.py ct + pipeline/compress.mjs" if CT
                        else "pipeline/skullbase_export.py (Blender) + pipeline/skullbase_build.py + pipeline/compress.mjs"),
        "structures": items,
        "arterySystems": list(ARTERY_SYSTEMS),
        "dataset": {"name": DATASET["name"], "licence": DATASET["licence"], "url": DATASET["url"], "note": DATASET["note"],
                    "attribution": DATASET["attribution"],
                    "citation": [CITES[c]["citation"] for c in DATASET["cite"]], "citationUrls": [CITES[c]["url"] for c in DATASET["cite"]]},
    }
    GEN.mkdir(parents=True, exist_ok=True)
    (GEN / f"{PREFIX}-manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    (GEN / f"{PREFIX}-landmarks.json").write_text(json.dumps(landmarks, indent=1, ensure_ascii=False))
    (GEN / f"{PREFIX}-definitions.json").write_text(json.dumps(defs, indent=1, ensure_ascii=False))
    (GEN / f"{PREFIX}-regions.json").write_text(json.dumps(regions, indent=1, ensure_ascii=False))
    (BUILD / "report.json").write_text(json.dumps(report, indent=1))
    print(f"skull base: {len(items)} structures ({sum(i['type'] == 'bone' for i in items)} bones, "
          f"{sum(i['type'] == 'soft' for i in items)} soft, {sum(i['type'] == 'tube' for i in items)} vessels/nerves), "
          f"{len(landmarks)} landmarks, {len(defs)} definitions")
    return 0


def validate() -> int:
    """Sides, symmetry and landmark sanity for the exported model. Exit 1 on failure."""
    m = json.loads((GEN / f"{PREFIX}-manifest.json").read_text())
    lms = json.loads((GEN / f"{PREFIX}-landmarks.json").read_text())
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
    if CT:   # the orbital roofs' holes closed by rule (skullbase_ct.fill_orbital_roofs): on both sides, small
        roof = json.loads((BUILD / "export.json").read_text()).get("roofFillMm2", {})
        check(set(roof) == {"L", "R"} and all(0 <= v <= 300 for v in roof.values()), f"orbital roof fill {roof} mm2")
    frontal = next(i for i in m["structures"] if i["id"] == "sb_frontal_bone")
    occipital = next(i for i in m["structures"] if i["id"] == "sb_occipital_bone")
    check(frontal["centroid"]["R"][1] > occipital["centroid"]["R"][1], "frontal bone should lie anterior (+y) of the occipital bone")
    fossa = next(lm for lm in lms if lm["name"] == "Hypophysial fossa")
    check(max(abs(v) for v in fossa["ras"]) < 0.01, f"origin: hypophysial fossa at {fossa['ras']}")
    for lm in lms:
        check(lm["distanceToBoneMm"] <= 16, f"landmark {lm['name']} {lm['distanceToBoneMm']} mm from bone")
    # every cranial nerve I-XII is there, and each nerve knows which one it belongs to
    cns = {it.get("cranialNerve") for it in m["structures"] if it.get("category") == "nerve"}
    check(set(range(1, 13)) <= cns, f"cranial nerves present: {sorted(c for c in cns if c)}")
    check(None not in cns, "a nerve without a cranial nerve number")
    arts = [it for it in m["structures"] if it.get("category") == "artery"]
    check(all(it.get("system") in ARTERY_SYSTEMS for it in arts), "an artery without a system")
    check({it["system"] for it in arts} == set(ARTERY_SYSTEMS), "every artery system has a structure")
    print(f"skull base validation: {n - len(fails)}/{n} checks passed")
    for f in fails:
        print("FAIL", f)
    return 1 if fails else 0


def finalize() -> None:
    """After compress.mjs: drop compressed files of structures that no longer exist, fill in file sizes and
    copy the manifest next to the assets."""
    p = GEN / f"{PREFIX}-manifest.json"
    m = json.loads(p.read_text())
    keep = {Path(it["file"]).name for it in m["structures"]}
    for f in (PUBLIC / KIND).glob("*.glb"):
        if f.name not in keep:
            f.unlink()
    for it in m["structures"]:
        it["bytes"] = (REPO / "public" / it["file"]).stat().st_size
    p.write_text(json.dumps(m, indent=1, ensure_ascii=False))
    shutil.copy(p, PUBLIC / f"{PREFIX}-manifest.json")


if __name__ == "__main__":
    if sys.argv[1:] == ["finalize"]:
        finalize()
        sys.exit(validate())
    sys.exit(main())
