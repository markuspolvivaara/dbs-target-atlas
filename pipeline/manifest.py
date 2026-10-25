"""Write manifest.json (per-structure metadata) and ATTRIBUTION.md.

manifest.json is written to src/data/generated/ (bundled by the app) and
copied to public/assets/ for anyone consuming the assets directly.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
BUILD = ROOT / "data" / "build"
PUBLIC = REPO / "public" / "assets"
GEN = REPO / "src" / "data" / "generated"

HCP_ACK = "Data were provided [in part] by the Human Connectome Project, WU-Minn Consortium (Principal Investigators: David Van Essen and Kamil Ugurbil; 1U54MH091657) funded by the 16 NIH Institutes and Centers that support the NIH Blueprint for Neuroscience Research; and by the McDonnell Center for Systems Neuroscience at Washington University."

CITES = json.loads((ROOT / "sources" / "citations.json").read_text())
PALETTE = json.loads((REPO / "src" / "data" / "palette.json").read_text())


def dataset_block(key: str) -> dict:
    d = C.DATASETS[key]
    return {
        "source": d["name"],
        "licence": d["licence"],
        "citation": [CITES[c]["citation"] for c in d["cite"]],
        "citationUrls": [CITES[c]["url"] for c in d["cite"]],
        "refIds": d.get("refIds", []),
    }


def colour(token: str) -> dict:
    return {"token": token, "light": PALETTE["light"][token], "dark": PALETTE["dark"][token]}


def size(rel: str) -> int:
    p = REPO / "public" / rel
    return p.stat().st_size if p.exists() else 0


def main() -> int:
    rep = json.loads((BUILD / "report.json").read_text())
    items = []
    for v in C.NUCLEI + C.SWEETSPOTS:
        f = f"assets/meshes/{v.id}.glb"
        items.append({
            "id": v.id, "name": v.name, "aliases": v.aliases, "type": v.type, "file": f, "bytes": size(f),
            "colour": colour(v.colour), "dataset": v.dataset, **dataset_block(v.dataset),
            "derivation": v.derivation or (
                f"Isosurface at {v.threshold} of the source label volume." if v.type == "nucleus" else
                f"Isosurface at {int(C.SWEETSPOT_FRACTION * 100)}% of the positive maximum of the published map: "
                f"{rep[v.id]['L']['regionsShown']} (L) / {rep[v.id]['R']['regionsShown']} (R) separate regions shown; "
                f"the largest holds {rep[v.id]['L']['dominantFraction']:.0%} (L) / {rep[v.id]['R']['dominantFraction']:.0%} (R) of the supra-threshold map."),
            "centroid": {s: rep[v.id][s]["sourceCentroid"] for s in ("L", "R")},
            "surfaceCentroid": {s: rep[v.id][s]["surfaceCentroid"] for s in ("L", "R")},
            **({"category": v.category} if v.category else {}),
        })
    f = "assets/meshes/cortex.glb"
    items.append({
        "id": "cortex", "name": "Cerebral cortex (pial surface)", "aliases": [], "type": "cortex", "file": f,
        "bytes": size(f), "colour": colour("cortex"), "dataset": "cortex", **dataset_block("cortex"),
        "derivation": f"Lead-DBS CortexHiRes surface decimated to {C.CORTEX_FACES} faces per hemisphere.",
        "centroid": None,
    })
    for p in C.CORTEX_PARCELS:
        f = f"assets/meshes/{p.id}.glb"
        items.append({
            "id": p.id, "name": p.name, "aliases": p.aliases, "type": "cortex", "file": f, "bytes": size(f),
            "colour": colour(p.colour), "dataset": p.dataset, **dataset_block(p.dataset),
            "derivation": p.derivation or (
                f"Surface vertices within {C.HMAT_MAX_DIST_MM:g} mm of the HMAT label (Mayka 2006) on the template surface."),
            "centroid": {s: rep[p.id][s]["meshCentroid"] for s in ("L", "R")},
            "surfaceCentroid": {s: rep[p.id][s]["surfaceCentroid"] for s in ("L", "R")},
        })
    for t in C.TRACTS:
        f = f"assets/tracts/{t.id}.glb"
        items.append({
            "id": t.id, "name": t.name, "aliases": t.aliases, "type": "tract", "role": t.role, "file": f,
            "bytes": size(f), "colour": colour(t.colour), "dataset": t.dataset, **dataset_block(t.dataset),
            "derivation": (t.derivation + " " if t.derivation else "") +
                          f"Up to {t.budget} streamlines per hemisphere (fixed seed), resampled to {C.STREAMLINE_STEP_MM:g} mm.",
            **({"hcp": t.hcp} if t.hcp else {}),
            "streamlines": {s: rep[t.id][s]["streamlines"] for s in ("L", "R")},
            "sourceStreamlines": {s: rep[t.id][s]["sourceStreamlines"] for s in ("L", "R")},
            "centroid": {s: rep[t.id][s]["centroid"] for s in ("L", "R")},
        })
    t1 = rep["_t1"]
    manifest = {
        "space": "MNI ICBM 2009b nonlinear asymmetric (RAS, mm)",
        "generatedBy": "pipeline/build.py + pipeline/compress.mjs + pipeline/manifest.py",
        "structures": items,
        "volumes": {k: v for k, v in t1.items() if isinstance(v, dict) and "file" in v},
        "hcpAcknowledgement": HCP_ACK,
        "volumeSource": {"source": t1["source"], "scaling": t1["scaling"], **dataset_block("icbm2009b")},
        "datasets": {k: {**{kk: vv for kk, vv in d.items() if kk not in ("cite",)},
                         "citation": [CITES[c]["citation"] for c in d["cite"]],
                         "citationUrls": [CITES[c]["url"] for c in d["cite"]]}
                     for k, d in C.DATASETS.items()},
    }
    GEN.mkdir(parents=True, exist_ok=True)
    (GEN / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    shutil.copy(GEN / "manifest.json", PUBLIC / "manifest.json")
    wm = write_wm_manifest(rep)
    write_attribution(manifest, wm)
    print(f"manifest: {len(items)} structures; white-matter section: {len(wm['structures'])} tracts")
    return 0


def write_wm_manifest(rep: dict) -> dict:
    """wm-manifest.json: the white-matter section's tracts (HCP-1065), kept apart from the DBS assets."""
    items = []
    for t in C.WM_TRACTS:
        f = f"assets/wm/{t.id}.glb"
        r = rep[t.id]
        items.append({
            "id": t.id, "name": t.name, "aliases": [t.abbr], "type": "tract", "role": "tract", "file": f,
            "bytes": size(f), "colour": colour(t.colour), "dataset": "hcp1065", **dataset_block("hcp1065"),
            "derivation": ("Streamlines of the commissural file cut at x = 0 so each hemisphere can be shown alone. " if "midline" in t.files else "")
                          + f"Up to {C.WM_BUDGET} streamlines per hemisphere (fixed seed, the same number on both sides, so on-screen "
                          f"density says nothing about tract size or asymmetry), resampled to {C.STREAMLINE_STEP_MM:g} mm.",
            "hcp": "confirmed", "category": t.group, "tier": t.tier,
            "streamlines": {s: r[s]["streamlines"] for s in ("L", "R")},
            "sourceStreamlines": {s: r[s]["sourceStreamlines"] for s in ("L", "R")},
            "centroid": {s: r[s]["centroid"] for s in ("L", "R")},
        })
    d = C.DATASETS["hcp1065"]
    wm = {
        "space": "MNI ICBM 2009a nonlinear asymmetric (RAS, mm), shown on the ICBM 2009b templates",
        "generatedBy": "pipeline/build.py (wm) + pipeline/compress.mjs + pipeline/manifest.py",
        "structures": items,
        "dataset": {"name": d["name"], "licence": d["licence"], "url": d["url"], "note": d["note"],
                    "citation": [CITES[c]["citation"] for c in d["cite"]], "citationUrls": [CITES[c]["url"] for c in d["cite"]]},
        "hcpAcknowledgement": HCP_ACK,
    }
    (GEN / "wm-manifest.json").write_text(json.dumps(wm, indent=1, ensure_ascii=False))
    shutil.copy(GEN / "wm-manifest.json", PUBLIC / "wm-manifest.json")
    return wm


def skull_base_attribution() -> list[str]:
    """ATTRIBUTION.md section for the skull-base section, from sb-manifest.json (built by skullbase_build.py)."""
    p = GEN / "sb-manifest.json"
    if not p.exists():
        return []
    d = json.loads(p.read_text())["dataset"]
    return [
        "## Skull base v1 (Z-Anatomy / BodyParts3D)",
        "",
        "The meshes and lines in `public/assets/skullbase/` and the files `sb-manifest.json`, `sb-landmarks.json`,",
        "`sb-regions.json` and `sb-definitions.json` are derived from Z-Anatomy, itself based on BodyParts3D. They are",
        f"**not** GPL-licensed: {d['licence']}.",
        "",
        f"- Source: {d['url']}",
        f"- Note: {d['note']}",
        *[f"- Attribution: {a}" for a in d["attribution"]],
        *[f"- Cite: {c}" for c in d["citation"]],
        "- Changes made: head structures exported from the Z-Anatomy Blender file (pipeline/skullbase_export.py), coordinates",
        "  converted to mm from the hypophysial fossa landmark, midline structures cut at x = 0, bones smoothed by one subdivision",
        "  level, decimated and shaded with baked ambient occlusion, vessels and nerves rebuilt as tubes with Z-Anatomy's modelled",
        "  radius and cropped to the head, files converted to compressed glTF, definitions shortened to their lead section.",
        "",
    ]


def skull_base_ct_attribution() -> list[str]:
    """ATTRIBUTION.md section for the skull base's detailed model, from sbct-manifest.json (skullbase_build.py ct)."""
    p = GEN / "sbct-manifest.json"
    if not p.exists():
        return []
    d = json.loads(p.read_text())["dataset"]
    return [
        "## Skull base v2 (TopBrain 2025 CT angiogram with Z-Anatomy fitted onto it)",
        "",
        "The meshes in `public/assets/skullbase-ct/` and the files `sbct-manifest.json`, `sbct-landmarks.json`,",
        "`sbct-regions.json` and `sbct-definitions.json` are derived from one CT angiogram of the TopBrain 2025 release and",
        f"from Z-Anatomy. They are **not** GPL-licensed: {d['licence']}.",
        "",
        f"- Source: {d['url']}",
        f"- Note: {d['note']}",
        *[f"- Attribution: {a}" for a in d["attribution"]],
        *[f"- Cite: {c}" for c in d["citation"]],
        "- Changes made: the CT's bone surface taken at 400 HU (thin bone down to 170 HU next to it, and the walls of the air sinuses) within TotalSegmentator's",
        "  skull mask, the holes left in the thin orbital roofs closed by rule (a 1 mm plate at the height of the roof around them);",
        "  skull mask, smoothed, decimated and named after the fitted Z-Anatomy bones; TopBrain's vessel labels meshed; the CT",
        "  moved rigidly into the Z-Anatomy frame; Z-Anatomy's nerves, unlabelled vessels, soft tissue and landmarks scaled and",
        "  smoothly deformed onto the CT's skull (pipeline/skullbase_ct.py); files converted to compressed glTF.",
        "",
    ]


def skull_base_v3_attribution() -> list[str]:
    """ATTRIBUTION.md section for the skull base's temporal-bone model, from sbv3-manifest.json (skullbase_v3.py)."""
    p = GEN / "sbv3-manifest.json"
    if not p.exists():
        return []
    d = json.loads(p.read_text())["dataset"]
    return [
        "## Skull base, the default model (\"v3\" in the pipeline: the TopBrain CT with its anatomy made to fit it)",
        "",
        "The meshes in `public/assets/skullbase-v3/` and the files `sbv3-manifest.json`, `sbv3-landmarks.json` and `sbv3-fit.json`",
        "are derived from the OpenEar library of human temporal bones (CC BY 4.0); the page also shows Skull base v2's bone and",
        f"vessel files (TopBrain, see above). They are **not** GPL-licensed: {d['licence']}.",
        "",
        f"- Source: {d['url']}",
        f"- Note: {d['note']}",
        *[f"- Attribution: {a}" for a in d["attribution"]],
        *[f"- Cite: {c}" for c in d["citation"]],
        "- Changes made: specimen ALPHA's segmentations (facial nerve, chorda tympani, cochleovestibular nerve, scala tympani,",
        "  scala vestibuli, ossicles, tympanic membrane, carotid) meshed (smoothed, decimated) and moved into the CT by a",
        "  similarity registration of the specimen's bone onto each temporal bone, the left one mirrored",
        "  (pipeline/skullbase_v3.py); landmarks derived from them; files converted to compressed glTF. The greater petrosal",
        "  nerve is drawn by rule (the project's own, GPL-3.0). The cranial nerves are Z-Anatomy's fitted courses (CC BY-SA)",
        "  rerouted through the CT's own foramina (pipeline/skullbase_v3_base.py); the optic nerves, cervical carotids and jugular",
        "  veins are TotalSegmentator segmentations of the CT; the sigmoid and transverse sinuses are traced through its",
        "  enhanced lumen, as is the petrous carotid; small arteries the CT cannot show are Z-Anatomy's fitted branches anchored to",
        "  the CT's own parent vessels; foramina are located from the routes, the cranial floor's openings and the segmented carotid.",
        "- Surgical views: the pterional, lateral supraorbital, parasagittal and midline suboccipital craniotomies are cut out of",
        "  the CT's bone by rule (pipeline/skullbase_v3_approach.py, the project's own drawing, GPL-3.0). The brain (`br_*.glb`)",
        "  is the Lead-DBS MNI 2009b pial surface (GPL-3.0, as in the cortex section; its FreeSurfer labels research use)",
        "  decimated, deformed to fit this CT, pushed clear of its bone and vessels, split by lobe, with the right hemisphere's",
        "  fissure opened, its frontal lobe lifted and the hemisphere held off the falx as morph targets",
        "  (pipeline/skullbase_brain.py). The cerebellum, brainstem and fourth ventricle (`pf_*.glb`) are Z-Anatomy's (CC BY-SA",
        "  4.0; BodyParts3D CC BY-SA 2.1 Japan) fitted into the CT's posterior fossa, the tonsils' retraction a morph target",
        "  (pipeline/skullbase_pfossa.py); adapted, they stay under CC BY-SA.",
        "",
    ]


def brainstem_attribution() -> list[str]:
    """ATTRIBUTION.md section for the brainstem section, from bs-manifest.json (built by brainstem_build.py)."""
    p = GEN / "bs-manifest.json"
    if not p.exists():
        return []
    ds = json.loads(p.read_text())["datasets"]
    za, aan = ds["zanatomy"], ds["aan"]
    return [
        "## Brainstem section (Z-Anatomy fitted into MNI space; Harvard Ascending Arousal Network atlas 2.0)",
        "",
        "The meshes in `public/assets/brainstem/` and the files `bs-manifest.json`, `bs-zones.json` and `bs-definitions.json`",
        "are **not** GPL-licensed. The arousal network nuclei (`bs_aan_*.glb`) are derived from the Harvard Ascending Arousal",
        f"Network atlas 2.0 ({aan['licence']}); everything else from Z-Anatomy, itself based on BodyParts3D ({za['licence']}).",
        "The section also shows the white-matter section's tracts and the DBS section's deep nuclei, under their licences above.",
        "",
        f"- Source: {za['url']}",
        f"- Note: {za['note']}",
        *[f"- Attribution: {a}" for a in za["attribution"]],
        *[f"- Cite: {c}" for c in za["citation"]],
        f"- Source: {aan['url']}",
        f"- Note: {aan['note']}",
        *[f"- Attribution: {a}" for a in aan["attribution"]],
        *[f"- Cite: {c}" for c in aan["citation"]],
        "- Changes made: the brainstem, its surface features, ventricles, cranial nerve nuclei, cranial nerves III-XII and the",
        "  arteries around it exported from the Z-Anatomy Blender file (pipeline/brainstem_export.py) and fitted into MNI space",
        "  onto the ICBM 2009b T2 template (pipeline/brainstem_fit.py); nerves and arteries rebuilt as tubes and kept near the",
        "  brainstem; safe entry zones drawn by rule on the fitted surface; the AAN labels' surfaces taken after resampling to",
        "  0.5 mm; midline structures cut at x = 0; files converted to compressed glTF; definitions shortened to their lead",
        "  section.",
        "",
    ]


def ventricles_attribution() -> list[str]:
    """ATTRIBUTION.md section for the ventricles section, from ve-manifest.json (built by ventricles_build.py)."""
    p = GEN / "ve-manifest.json"
    if not p.exists():
        return []
    d = json.loads(p.read_text())["dataset"]
    return [
        "## Ventricles section (TopBrain 2025 CT angiogram, case 011, with the Z-Anatomy ventricles fitted onto it)",
        "",
        "The ventricle meshes in `public/assets/ventricles/` and `ve-manifest.json`, `ve-landmarks.json` and `ve-trajectories.json`",
        f"are derived from the TopBrain CT and from Z-Anatomy ({d['licence']}): **not** GPL-licensed. Adapted from Z-Anatomy,",
        "the ventricle meshes stay under CC BY-SA 4.0; their fit uses the TopBrain data (non-commercial). The section also shows",
        "Skull base v2's bone and Skull base v3's fitted brain, under their licences above.",
        "",
        f"- Source: {d['url']}",
        f"- Note: {d['note']}",
        *[f"- Attribution: {a}" for a in d["attribution"]],
        *[f"- Cite: {c}" for c in d["citation"]],
        "- Changes made: the lateral and third ventricles segmented from the CT by a threshold in its brain window",
        "  (pipeline/ventricles_build.py); Z-Anatomy's ventricles, aqueduct included (exported by pipeline/ventricles_export.py)",
        "  fitted onto them by a similarity and a smooth deformation, and joined with them into one softened surface drawn",
        "  half a millimetre outside, split by part; the foramina of Monro drawn by rule between the fitted lateral and third",
        "  ventricles, and the aqueduct as a tube of published calibre along the fitted model's course (the project's own",
        "  drawing); the coronal suture, Kocher's points and the external acoustic meatus",
        "  located on the CT; ventriculostomy trajectories computed on it; files converted to compressed glTF.",
        "",
    ]


def cortex_attribution() -> list[str]:
    """ATTRIBUTION.md section for the cortex section, from ctx-manifest.json (built by cortex_build.py)."""
    p = GEN / "ctx-manifest.json"
    if not p.exists():
        return []
    d = json.loads(p.read_text())["dataset"]
    return [
        "## Cortex section (Destrieux parcellation on the Lead-DBS template surface)",
        "",
        "The meshes in `public/assets/cortex/` and `ctx-manifest.json` / `ctx-labels.json` are derived from the Lead-DBS",
        "MNI 2009b template surface and the FreeSurfer annotations (Destrieux aparc.a2009s, Desikan-Killiany aparc)",
        f"shipped with it. Licence: {d['licence']}.",
        "",
        f"- Source: {d['url']}",
        f"- Note: {d['note']}",
        *[f"- Cite: {c}" for c in d["citation"]],
        "- Lobe grouping: Klein A, Tourville J. Front Neurosci. 2012;6:171 (CC BY 3.0). doi:10.3389/fnins.2012.00171.",
        "- Names, views and mean areas: Table 1 of Destrieux et al. 2010.",
        "- Definitions: Wikipedia - CC-BY-SA 3.0, as shipped with Z-Anatomy (each links its source page).",
        "- Changes made: surfaces decimated and split by label, an inflated surface and sulcal-depth shading computed,",
        "  files converted to compressed glTF; definitions shortened to their lead section.",
        "",
    ]


def spine_attribution() -> list[str]:
    """ATTRIBUTION.md section for the spine section, from spine-manifest.json (built by spine_build.py)."""
    p = GEN / "spine-manifest.json"
    if not p.exists():
        return []
    d = json.loads(p.read_text())["dataset"]
    return [
        "## Spine section (VerSe CT with TotalSegmentator segmentations)",
        "",
        "The meshes in `public/assets/spine/` and the files `spine-manifest.json` and `spine-levels.json` are derived from",
        f"one CT of the VerSe 2020 dataset. They are **not** GPL-licensed: {d['licence']}.",
        "",
        f"- Source: {d['url']}",
        f"- Note: {d['note']}",
        *[f"- Cite: {c}" for c in d["citation"]],
        "- Changes made: bone surfaces from the CT within reach of the VerSe masks, TotalSegmentator segmentations of the",
        "  same CT, meshes smoothed, decimated and split at the midline, schematic roots and psoas zones drawn by rule,",
        "  coordinates moved to the centre of the L5 vertebral body, files converted to compressed glTF.",
        "- The virtual screw's files (`public/assets/spine/screw_*.bin.gz`, `spine-screw.json`: distance fields of the",
        "  bone, points on the structures at risk, pedicle measurements) are derived from the same CT and segmentations",
        "  and carry the same licence.",
        "",
        "`spine-published.json` holds published pedicle values read from the tables of three open-access papers (cited",
        "on the cards and the Sources page): Wang 2023 (J Orthop Surg Res, CC BY 4.0), Moncada-Habib 2025 (Cureus,",
        "CC BY 4.0) and Nkwerem 2024 (J West Afr Coll Surg, CC BY-NC-SA 4.0); numbers only, no text or figures.",
        "",
    ]


def write_attribution(m: dict, wm: dict) -> None:
    lines = [
        "# Attribution and licences",
        "",
        "<!-- Generated by pipeline/manifest.py from pipeline/config.py. Edit those, not this file. -->",
        "",
        "All anatomical geometry in this project is derived from published atlases distributed with",
        "Lead-DBS. Nothing is hand-modelled. Coordinates are MNI ICBM 2009b nonlinear asymmetric (RAS, mm).",
        "",
        "## Licence of the derived assets",
        "",
        "The Lead-DBS `LICENSE.md` states that the standard-space atlases it ships are released under the",
        "GNU GPL v3 at the request of their owners and should not be used for commercial purposes. The",
        "meshes, streamline subsets and coordinates in `public/assets/` are derived from those atlases, so",
        "they are distributed under **GPL-3.0, non-commercial**. The complete corresponding source (the",
        "pipeline in `pipeline/`, which fetches the original files from the official Lead-DBS archive) is",
        "part of this repository.",
        "",
        "The ICBM 2009b T1, T2 and PD template slices carry the McGill/MNI notice:",
        "",
        "> Copyright (C) 1993-2004 Louis Collins, McConnell Brain Imaging Centre, Montreal Neurological",
        "> Institute, McGill University. Permission to use, copy, modify, and distribute this software and its",
        "> documentation for any purpose and without fee is hereby granted, provided that the above copyright",
        "> notice appear in all copies. The authors and McGill University make no representations about the",
        "> suitability of this software for any purpose. It is provided \"as is\" without express or implied warranty.",
        "",
        "## Datasets used",
        "",
    ]
    used = {s["dataset"] for s in m["structures"]} | {"leaddbs", "icbm2009b", "hcp"}
    for k, d in m["datasets"].items():
        if k not in used:
            continue
        lines += [f"### {d['name']}", "", f"- Licence: {d['licence']}", f"- Source: {d['url']}"]
        if d.get("note"):
            lines.append(f"- Note: {d['note']}")
        for c in d["citation"]:
            lines.append(f"- Cite: {c}")
        if d.get("refIds"):
            lines.append(f"- Cite: see in-app reference(s) {', '.join(d['refIds'])}")
        if d.get("todo"):
            lines.append(f"- TODO: {d['todo']}")
        ids = [s["id"] for s in m["structures"] if s["dataset"] == k]
        if ids:
            lines.append(f"- Assets: {', '.join(ids)}")
        lines.append("")
    lines += [
        "## Human Connectome Project data",
        "",
        "Some tracts were generated from Human Connectome Project diffusion data and are therefore also",
        "subject to the WU-Minn HCP Open Access Data Use Terms",
        "(https://www.humanconnectome.org/study/hcp-young-adult/document/wu-minn-hcp-consortium-open-access-data-use-terms):",
        "redistribution only under the same terms, acknowledgement when presenting results, and no attempt to",
        "identify or contact participants.",
        "",
        "- Confirmed HCP-derived: " + ", ".join(s["id"] for s in m["structures"] if s.get("hcp") == "confirmed")
        + " (Hollunder 2024 sweet streamlines: connectome 'HCP 985 (Li 2020)' stated in the files; Meola 2016: HCP-488 data).",
        "- Likely HCP-derived: " + ", ".join(s["id"] for s in m["structures"] if s.get("hcp") == "likely")
        + " (DBS Tractography Atlas family, whose later version is built on the HCP-1065 template; not stated for this version).",
        "",
        "Required acknowledgement:",
        "",
        "> " + HCP_ACK,
        "",
        "HCP methods to cite:",
        "",
        *[f"- {c}" for c in m["datasets"]["hcp"]["citation"]],
        "",
        "## White-matter tracts section (HCP-1065)",
        "",
        "The tracts in `public/assets/wm/` and `wm-manifest.json`, and the tract-to-region probabilities in",
        "`src/data/generated/wm-connectome.json`, are derived from the HCP-1065 population-averaged",
        "tractography atlas. They are **not** GPL-licensed Lead-DBS material: they carry the atlas licence,",
        f"{wm['dataset']['licence']}.",
        "Share-alike: adapted versions of these files must be released under CC BY-SA 4.0 (or a compatible",
        "licence) with attribution.",
        "",
        f"- Source: {wm['dataset']['url']}",
        f"- Note: {wm['dataset']['note']}",
        *[f"- Cite: {c}" for c in wm["dataset"]["citation"]],
        f"- Assets: {', '.join(s['id'] for s in wm['structures'])}",
        "- Changes made: streamlines subsampled and resampled, the corpus callosum cut at the midline, files",
        "  converted to compressed glTF; connection probabilities kept as published (Brodmann block).",
        "- HCP acknowledgement (required, as above):",
        "",
        "> " + HCP_ACK,
        "",
        *skull_base_attribution(),
        *skull_base_ct_attribution(),
        *skull_base_v3_attribution(),
        *brainstem_attribution(),
        *ventricles_attribution(),
        *cortex_attribution(),
        *spine_attribution(),
        "## Datasets considered and not used",
        "",
        "- **Basal Ganglia Pathway Atlas, original files (Petersen 2019, OSF mhd4z).** The OSF terms limit use to",
        "  academic research by the users under an agreement with CWRU and grant no redistribution, so the raw",
        "  files are not used. Its pathways reach this project only through the Lead-DBS-distributed Dystonia",
        "  Response Tract Atlas (Horn 2022).",
        "- **DBS Tractography Atlas v2.1 (github.com/netstim/DBS-Tractography-Atlas).** The repository has no",
        "  licence file, so redistribution rights are unclear. The Lead-DBS-distributed version (Middlebrooks 2020)",
        "  is used instead.",
        "- **Rajamani 2024 symptom-specific PD tracts.** Not distributed as files (the paper releases the",
        "  DBS Tractography Atlas and source data, not the tract library). The PD symptom views show derived",
        "  subsets of the Hollunder 2024 PD sweet streamlines instead, labelled as such.",
        "- **Hammersmith atlas (Lead-DBS).** Its licence forbids redistribution; not used.",
        "",
        "## Software",
        "",
        "- three.js (MIT), zod (MIT), Vite (MIT), glTF-Transform (MIT), meshoptimizer (MIT).",
        "- Python pipeline: nibabel (MIT), scikit-image (BSD-3), trimesh (MIT), fast-simplification (MIT),",
        "  SciPy (BSD-3), NumPy (BSD-3), h5py (BSD-3), remotezip (MIT).",
        "- Font: Atkinson Hyperlegible (SIL Open Font License 1.1), self-hosted.",
        "",
    ]
    (REPO / "ATTRIBUTION.md").write_text("\n".join(lines))


if __name__ == "__main__":
    sys.exit(main())
