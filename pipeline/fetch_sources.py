"""Fetch the source atlas files used by the pipeline.

Only the files listed in SOURCES are pulled from the Lead-DBS data package
(an 8.5 GB zip) using HTTP range requests, so the full archive is never
downloaded. Everything lands in pipeline/data/raw/ (git-ignored).

Usage:  python pipeline/fetch_sources.py
"""
from __future__ import annotations

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

from remotezip import RemoteZip

ROOT = Path(__file__).resolve().parent
RAW = ROOT / "data" / "raw"

# Resolved from https://www.lead-dbs.org/release/download.php?id=data_pcloud
LEADDBS_DATA_ZIP = "https://filedn.com/lsPIJ4ragTWjjmV6PvlDQLu/leaddbs_data.zip"
LEADDBS_LICENSE = "https://raw.githubusercontent.com/netstim/leaddbs/master/LICENSE.md"

SPACE = "templates/space/MNI152NLin2009bAsym/"
A = SPACE + "atlases/"


def both(atlas: str, names: list[str], ext: str = ".nii.gz") -> list[str]:
    return [f"{A}{atlas}/{h}/{n}{ext}" for h in ("lh", "rh") for n in names]


SOURCES: list[str] = [
    # Template (ICBM 2009b nonlinear asymmetric T1, 0.5 mm)
    SPACE + "t1.nii",
    # Cortex surface + DKT annotation (Lead-DBS template surfaces)
    SPACE + "cortex/CortexHiRes.mat",
    SPACE + "cortex/CortexLowRes_15000V.mat",
    SPACE + "cortex/annot_DKT.mat",
    # Volumetric parcellations in 2009b space
    SPACE + "labeling/HMAT (Mayka 2005).nii",
    SPACE + "labeling/HMAT (Mayka 2005).txt",
    SPACE + "labeling/Cerebellum_SUIT (Diedrichsen 2006).nii",
    SPACE + "labeling/Cerebellum_SUIT (Diedrichsen 2006).txt",
    SPACE + "labeling/Mindboggle 101 - Desikan protocol (Klein 2012).nii",
    SPACE + "labeling/Mindboggle 101 - Desikan protocol (Klein 2012).txt",
    # Subcortical nuclei: DISTAL Medium (Ewert 2017)
    *both("DISTAL Medium (Ewert 2017)", [
        "STN", "STN_motor", "STN_associative", "STN_limbic",
        "GPi", "GPi_sensorimotor", "GPe", "RN", "VIM", "Thal",
    ]),
    # Striatum and substantia nigra: CIT168 (Pauli 2018), both hemispheres per file
    *[f"{A}CIT168_Reinf_Learn (Pauli 2017) - imported from CIT168/mixed/{n}.nii.gz"
      for n in ("Pu", "Ca", "NAC", "SNr", "SNc")],
    # Thalamic nuclei: Morel atlas in MNI space (Jakab 2008)
    *both("Morel Atlas (Jakab 2008)", ["CM", "Pf", "VLa", "VLpv", "VLpd"]),
    # Caudal zona incerta / PSA: Zona Incerta atlas (Lau 2020)
    *both("Zona Incerta Atlas (Lau 2020)", ["cZI", "ZI"]),
    # PPN (Snijders 2016)
    *both("PPN (Snijders 2016)", ["PPN"], ext=".nii"),
    # Tracts: DBS Tractography Atlas (Middlebrooks 2020), Lead-DBS-distributed version
    *both("DBS Tractography Atlas (Middlebrooks 2020)", [
        "DRTT", "NDRTT", "Ansa_Lenticularis", "Fasciculus_Lenticularis",
        "STN_motor_tract",
    ], ext=".mat"),
    # Borders: corticospinal tract and medial lemniscus (Meola 2016)
    *both("Brainstem Connectome (Meola 2016)", ["CST", "ML"], ext=".mat"),
    # Hyperdirect pathway (Treu 2020)
    A + "Hyperdirect Pathway Atlas (Treu 2020)/midline/Hyperdirect_Pathway.mat",
    # DRTT as defined in the basal ganglia pathway atlas (Petersen 2019), via VIM View Atlas
    *both("VIM View Atlas", ["DRTT_petersen"], ext=".mat"),
    # Dystonia response tracts + sweet spots (Horn 2022)
    A + "Dystonia Response Tract Atlas (Horn 2022)/midline/Generalized_Thresh.mat",
    A + "Dystonia Response Tract Atlas (Horn 2022)/midline/Cervical_Thresh.mat",
    *both("Dystonia Response Tract Atlas (Horn 2022)", ["Sweetspot_generalized", "Sweetspot_cervical"]),
    # Dysfunctome sweet spots + sweet streamlines (Hollunder 2024)
    *both("Human Dysfunctome Atlas (Hollunder 2024)", [
        "Sweet_Spot_PD", "Sweet_Spot_DYT", "Sweet_Spot_TS"]),
    *[f"{A}Human Dysfunctome Atlas (Hollunder 2024)/midline/Sweet_Streamline_{k}.mat"
      for k in ("PD", "DYT", "TS")],
    # Tremor sweet spot: TOR-PSM (Elias 2020)
    *both("TOR-PSM (Elias 2020)", ["tremor_vim_n39_hotspot"]),
]


def main() -> int:
    RAW.mkdir(parents=True, exist_ok=True)
    lic = RAW / "LEADDBS_LICENSE.md"
    if not lic.exists():
        urllib.request.urlretrieve(LEADDBS_LICENSE, lic)
    record = {}
    with RemoteZip(LEADDBS_DATA_ZIP) as z:
        names = set(z.namelist())
        for src in SOURCES:
            if src not in names:
                print(f"MISSING in archive: {src}", file=sys.stderr)
                return 1
            dest = RAW / src.replace(SPACE, "")
            if not dest.exists():
                dest.parent.mkdir(parents=True, exist_ok=True)
                print(f"fetch {src}")
                dest.write_bytes(z.read(src))
            record[src] = hashlib.sha256(dest.read_bytes()).hexdigest()
    (RAW / "sources.lock.json").write_text(json.dumps(
        {"archive": LEADDBS_DATA_ZIP, "files": record}, indent=1))
    print(f"{len(record)} files ready in {RAW}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
