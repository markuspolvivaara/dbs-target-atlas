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
        "## Skull base section (Z-Anatomy / BodyParts3D)",
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
        *cortex_attribution(),
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
