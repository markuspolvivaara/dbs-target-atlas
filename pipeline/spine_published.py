"""Published pedicle values shown beside the measurements in the spine section, read from the papers' own tables
(Europe PMC full-text XML), so nothing is typed in.

  python3 -I pipeline/spine_published.py

  Wang 2023 (systematic review, CC BY 4.0), Tables 2-3: mean pedicle width and height per level in six regions.
  Moncada-Habib 2025 (CT, 37 adults, CC BY 4.0), Table 2: pedicle transverse angle per level and side, mean +- SD.
  Nkwerem 2024 (CT, 287 adults), Table 1: transverse angle per level, mean +- SD.
  Verma 2020 (dry bones, 20 columns, CC BY 3.0), Tables 1-4: thoracic pedicle width, height, transverse and sagittal
    angle per level, its own means beside those of the earlier studies it compares.
  Kshettry 2015 (cadavers), the abstract's results (PubMed): exposure of the ventral thoracic canal after each of five
    successive resections, per region.
  Jiang 2024 (CT, 53 patients, CC BY 4.0), Tables 1 and 4: the C7 pedicle axis (transverse and sagittal angle, screw
    length, width and sagittal height, mean +- SD per side) and the C7 transverse and sagittal angles of nine earlier
    studies.
Downloads are cached in pipeline/data/raw/papers/ (untrusted input: parsed as XML only). Writes
src/data/generated/spine-published.json.
"""
from __future__ import annotations

import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw" / "papers"
OUT = ROOT.parent / "src" / "data" / "generated" / "spine-published.json"
PAPERS = {"wang2023": "PMC9832728", "moncadahabib2025": "PMC12504117", "nkwerem2024": "PMC11412596", "verma2020": "PMC7294881",
          "jiang2024": "PMC10903032"}
LEVELS = ["L1", "L2", "L3", "L4", "L5"]
THORACIC = [f"T{i}" for i in range(1, 13)]
VERMA_KEYS = ("width", "height", "transverseAngle", "sagittalAngle")  # Tables 1-4, in this order


def tables(pmcid: str) -> list[list[list[str]]]:
    f = RAW / f"{pmcid}.xml"
    if not f.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        url = f"https://www.ebi.ac.uk/europepmc/webservices/rest/{pmcid}/fullTextXML"
        with urllib.request.urlopen(url, timeout=60) as r:
            f.write_bytes(r.read())
    root = ET.parse(f).getroot()
    return [[[re.sub(r"\s+", " ", "".join(c.itertext())).strip() for c in row] for row in tw.findall(".//tr")]
            for tw in root.findall(".//table-wrap")]


def pubmed_abstract(pmid: str) -> str:
    """The abstract's text from PubMed (efetch XML), cached like the papers."""
    f = RAW / f"PMID{pmid}.xml"
    if not f.exists():
        RAW.mkdir(parents=True, exist_ok=True)
        url = f"https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id={pmid}&retmode=xml"
        with urllib.request.urlopen(url, timeout=60) as r:
            f.write_bytes(r.read())
    root = ET.parse(f).getroot()
    return " ".join(re.sub(r"\s+", " ", "".join(a.itertext())) for a in root.iter("AbstractText"))


EXPOSURE_STEPS = ("laminectomy", "medialFacetectomy", "transpedicular", "costotransversectomy", "lateralExtracavitary")


def mean_sd(s: str) -> list[float]:
    a, b = s.replace("°", "").split("±")
    return [float(a), float(b)]


def main() -> int:
    out: dict = {"levels": {lv: {} for lv in LEVELS}, "sources": {}}
    # Wang 2023: regional means; the range across regions is what the card shows
    w = tables(PAPERS["wang2023"])
    for key, tab in (("width", w[1]), ("height", w[2])):
        regions = tab[0][1:]
        for row in tab[1:]:
            vals = [float(x) for x in row[1:]]
            out["levels"][row[0]][f"{key}RegionalMeans"] = dict(zip(regions, vals))
    out["sources"]["wang2023"] = "Tables 2 and 3: mean pedicle width and height by level and region (mm)"
    # Moncada-Habib 2025: transverse angle per side, mean +- SD
    m = tables(PAPERS["moncadahabib2025"])[1]
    hdr, lv = m[0], None
    for row in m[1:]:
        lv = row[0] or lv
        if row[1].startswith("Mean"):
            d = dict(zip(hdr, row))
            out["levels"][lv]["transverseAngleMexico"] = {"L": mean_sd(d["LPA"]), "R": mean_sd(d["RPA"]), "n": 37}
    out["sources"]["moncadahabib2025"] = "Table 2: pedicle transverse angle (angle between the pedicle axis and the vertebral midline), mean +- SD"
    # Nkwerem 2024: transverse angle, mean +- SD
    n = tables(PAPERS["nkwerem2024"])[0]
    for row in n[1:]:
        if row[0].startswith("TA"):
            out["levels"][f"L{row[0][2]}"]["transverseAngleNigeria"] = {"meanSd": [float(row[2].replace("°", "")), float(row[3])],
                                                                         "n": int(row[1])}
    out["sources"]["nkwerem2024"] = "Table 1: transverse angle per level, mean +- SD"
    # Verma 2020: one column per study (its own last); the header carries the study and, in some tables, its n
    out["thoracic"] = {lv: {} for lv in THORACIC}
    for key, tab in zip(VERMA_KEYS, tables(PAPERS["verma2020"])):
        studies = [re.sub(r"\s*\[\d+\]|\s*\(N+\s*=.*?\)", "", x).strip() for x in tab[0][1:]]
        studies = ["Verma et al." if x.lower() == "current study" else x for x in studies]
        for row in tab[1:]:
            if not re.fullmatch(r"T\d+", row[0]):
                continue
            vals = {st: float(v) for st, v in zip(studies, row[1:]) if re.fullmatch(r"-?\d+(\.\d+)?", v)}
            out["thoracic"][row[0]][f"{key}StudyMeans"] = vals
    # Kshettry 2015: "At T1-T2, visualized exposures were 25.8%, 31.5%, ... and 46.8%, respectively" (one sentence per region,
    # the five successive resections in the order of the methods)
    ab = pubmed_abstract("25937117")
    exp = {}
    for m in re.finditer(r"At (T\d+-T\d+), (?:visualized )?exposures were ([\d.]+)%, ([\d.]+)%, ([\d.]+)%, ([\d.]+)%, and ([\d.]+)%", ab):
        exp[m.group(1)] = dict(zip(EXPOSURE_STEPS, map(float, m.groups()[1:])))
    if list(exp) != ["T1-T2", "T3-T6", "T7-T10", "T11-T12"]:
        print(f"FAIL Kshettry 2015: regions {list(exp)}")
        return 1
    out["approachExposure"] = exp
    out["sources"]["kshettry2015"] = "Abstract, results: share of the ventral canal's width exposed after each successive resection, per region (%)"
    # Jiang 2024: Table 1, trajectory A (through the C7 pedicle's axis) per side; Table 4, earlier studies' means
    jt = tables(PAPERS["jiang2024"])
    c7, measure = {}, None
    keys = {"Transverse angle": "transverseAngle", "Sagittal angle": "sagittalAngle", "Screw length": "length",
            "Screw width": "width", "Sagittal height": "height"}
    for row in jt[0][1:]:
        # a measure's first row names it (then side, value); its second row starts with the side
        if row[0] in ("Left", "Right"):
            side, a = row[0], row[1]
        else:
            measure = next((v for k, v in keys.items() if row[0].startswith(k)), None)
            side, a = row[1], row[2]
        if measure and side in ("Left", "Right"):
            c7.setdefault(measure, {})["L" if side == "Left" else "R"] = mean_sd(a.replace(" ", ""))
    lit = {"transverseAngle": {}, "sagittalAngle": {}}
    for row in jt[3][1:]:
        study = f"{row[0].replace('By ', '').split(',')[0].split()[-1]} {row[1]}"
        for k, cell in (("transverseAngle", row[3]), ("sagittalAngle", row[4])):
            if "±" in cell:
                lit[k][study] = mean_sd(cell)[0]
    if set(c7) != set(keys.values()) or any(len(v) != 2 for v in c7.values()) or len(lit["transverseAngle"]) < 5:
        print(f"FAIL Jiang 2024: {sorted(c7)}, {len(lit['transverseAngle'])} studies")
        return 1
    out["cervical"] = {"C7": {"axisJiang": {**c7, "n": 53}, "studyMeans": lit}}
    out["sources"]["jiang2024"] = ("Table 1: the C7 pedicle axis (trajectory A) per side, mean +- SD; Table 4: C7 transverse and "
                                   "sagittal angles of earlier studies (means)")
    out["sources"]["verma2020"] = ("Tables 1-4: thoracic pedicle width, height (mm), transverse and sagittal angle (deg) "
                                   "per level, mean of each study compared (the last column: Verma 2020's own)")
    for lv, d in out["levels"].items():
        missing = {"widthRegionalMeans", "heightRegionalMeans", "transverseAngleMexico", "transverseAngleNigeria"} - set(d)
        if missing:
            print(f"FAIL {lv}: missing {sorted(missing)}")
            return 1
    for lv, d in out["thoracic"].items():
        for k in VERMA_KEYS:
            got = d.get(f"{k}StudyMeans", {})
            if len(got) < 3 or "Verma et al." not in got:
                print(f"FAIL {lv}: {k} has {len(got)} studies ({sorted(got)})")
                return 1
    OUT.write_text(json.dumps(out, indent=1))
    print(f"spine published values: {len(out['levels'])} lumbar and {len(out['thoracic'])} thoracic levels from {len(PAPERS)} papers"
          f" -> {OUT.relative_to(ROOT.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
