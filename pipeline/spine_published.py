"""Published lumbar pedicle values shown beside the measurements in the spine section, read from the papers' own
tables (Europe PMC full-text XML), so nothing is typed in.

  python3 -I pipeline/spine_published.py

  Wang 2023 (systematic review, CC BY 4.0), Tables 2-3: mean pedicle width and height per level in six regions.
  Moncada-Habib 2025 (CT, 37 adults, CC BY 4.0), Table 2: pedicle transverse angle per level and side, mean +- SD.
  Nkwerem 2024 (CT, 287 adults), Table 1: transverse angle per level, mean +- SD.
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
PAPERS = {"wang2023": "PMC9832728", "moncadahabib2025": "PMC12504117", "nkwerem2024": "PMC11412596"}
LEVELS = ["L1", "L2", "L3", "L4", "L5"]


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
    for lv, d in out["levels"].items():
        missing = {"widthRegionalMeans", "heightRegionalMeans", "transverseAngleMexico", "transverseAngleNigeria"} - set(d)
        if missing:
            print(f"FAIL {lv}: missing {sorted(missing)}")
            return 1
    OUT.write_text(json.dumps(out, indent=1))
    print(f"spine published values: {len(out['levels'])} levels from {len(PAPERS)} papers -> {OUT.relative_to(ROOT.parent)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
