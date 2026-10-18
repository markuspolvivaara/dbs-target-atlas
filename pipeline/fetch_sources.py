"""Fetch the source atlas files used by the pipeline.

Only the files listed in SOURCES are pulled from the Lead-DBS data package
(an 8.5 GB zip) using HTTP range requests, so the full archive is never
downloaded. The white-matter section's tracts come the same way from the
HCP-1065 atlas release (a 590 MB zip, downloaded once and hash-checked). Everything lands in pipeline/data/raw/
(git-ignored).

Usage:  python pipeline/fetch_sources.py
"""
from __future__ import annotations

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

from remotezip import RemoteZip

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

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
    SPACE + "t2.nii",  # ICBM 2009b T2 (Lead-DBS "mni_hires" t2 template)
    SPACE + "pd.nii",  # ICBM 2009b proton density
    # Cortex surface + annotations (Lead-DBS template surfaces): annot_DKT holds FreeSurfer's Desikan-Killiany
    # aparc (despite its name); annot_a2009 the Destrieux 2009 aparc.a2009s (cortex section)
    SPACE + "cortex/CortexHiRes.mat",
    SPACE + "cortex/CortexLowRes_15000V.mat",
    SPACE + "cortex/annot_DKT.mat",
    SPACE + "cortex/annot_a2009.mat",
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
    # Epilepsy: anterior thalamic nuclei + mammillothalamic tract (Morel), mammillary bodies,
    # fornix and MTT (Neudorfer 2020 hypothalamus atlas), hippocampus (PD25, Xiao 2017)
    *both("Morel Atlas (Jakab 2008)", ["AV", "AM", "AD", "mtt"]),
    *both("Atlas of the Human Hypothalamus (Neudorfer & Germann 2020)", ["mammillary_bodies", "fornix", "mammillothalamic_tract"]),
    *both("MNI PD25 subcortical (Xiao 2017)", ["hippocampus"]),
    # Optic tract (GPi landmark): Human Motor Thalamus atlas (Ilinsky 2018) and PD25 histology (Xiao 2017)
    *both("Human Motor Thalamus (Ilinsky 2017)", ["ot"]),
    f"{A}MNI PD25 histology (Xiao 2017) - imported from PD25_MNI/mixed/Optic_Tract_(II).nii.gz",
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
    hcp = fetch_hcp1065()
    zan = fetch_zanatomy()
    verse = fetch_verse()
    (RAW / "sources.lock.json").write_text(json.dumps(
        {"archive": LEADDBS_DATA_ZIP, "files": record,
         "hcp1065": {"release": C.HCP1065_RELEASE, "files": hcp},
         "zanatomy": {"source": ZANATOMY_URL, "files": zan},
         "verse": {"subject": VERSE_SUBJECT, "files": verse}}, indent=1))
    print(f"{len(record)} files ready in {RAW}")
    return 0


def fetch_hcp1065() -> dict[str, str]:
    """White-matter section: the listed .trk.gz members of the HCP-1065 release, plus its connectome table.

    The release CDN rejects the suffix byte ranges remotezip needs, so the zip is downloaded once
    (590 MB), checked against its pinned SHA-256 and only the listed members are extracted.
    """
    import zipfile
    out = RAW / "hcp1065"
    out.mkdir(parents=True, exist_ok=True)
    record = {}
    members = sorted({p for t in C.WM_TRACTS for p in t.files.values()})
    if not all((out / "tracts" / m).exists() for m in members):
        zp = out / C.HCP1065_TRK_ZIP
        if not zp.exists():
            print(f"fetch {C.HCP1065_TRK_ZIP} (590 MB)")
            urllib.request.urlretrieve(C.HCP1065_RELEASE + C.HCP1065_TRK_ZIP, zp)
        digest = hashlib.sha256(zp.read_bytes()).hexdigest()
        if digest != C.HCP1065_TRK_SHA256:
            print(f"{C.HCP1065_TRK_ZIP}: SHA-256 {digest} does not match the pinned {C.HCP1065_TRK_SHA256}", file=sys.stderr)
            raise SystemExit(1)
        with zipfile.ZipFile(zp) as z:
            names = set(z.namelist())
            for m in members:
                if m not in names:
                    print(f"MISSING in {C.HCP1065_TRK_ZIP}: {m}", file=sys.stderr)
                    raise SystemExit(1)
                dest = out / "tracts" / m
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(z.read(m))
    for m in members:
        record[f"{C.HCP1065_TRK_ZIP}:{m}"] = hashlib.sha256((out / "tracts" / m).read_bytes()).hexdigest()
    dest = out / C.HCP1065_CONNECTOME
    if not dest.exists():
        urllib.request.urlretrieve(C.HCP1065_RELEASE + C.HCP1065_CONNECTOME, dest)
    record[C.HCP1065_CONNECTOME] = hashlib.sha256(dest.read_bytes()).hexdigest()
    return record

# Skull-base section: Z-Anatomy Blender package (CC BY-SA 4.0), downloaded once and hash-checked
ZANATOMY_URL = "https://github.com/Z-Anatomy/Models-of-human-anatomy/raw/master/Z-Anatomy.zip"
ZANATOMY_SHA256 = "e029688545627bd0214b269e1063143abb580aad72b2c2445d6d8a9a0d9da736"  # as downloaded 2026-10-17


# Spine section: one VerSe whole-spine CT (CC BY-SA 4.0, OSF project 4skx2), isotropic 0.72 x 0.72 x 0.7 mm,
# C1-L5 with hand-corrected vertebra masks; pinned by SHA-256 as downloaded 2026-10-17
VERSE_SUBJECT = "sub-verse823"
VERSE_FILES = {
    "sub-verse823_dir-iso_ct.nii.gz": ("https://osf.io/download/2a35c/", "7e0cf8f31a4e2d597b6bae2b9996e61b8b158e0ab0d44bf250144fac9b062d71"),
    "sub-verse823_dir-iso_seg-vert_msk.nii.gz": ("https://osf.io/download/9j5qz/", "bc12746141863b8d44b0c7903bc6c50f5a43ddd96f2bce1463c387ef6ecb630b"),
    "sub-verse823_dir-iso_seg-subreg_ctd.json": ("https://osf.io/download/j7dtw/", "71f0d225a54a2b5aaed152b1fe95568017a0229d77796a09f083654843ee3b46"),
}


def fetch_verse() -> dict[str, str]:
    out = RAW / "verse" / VERSE_SUBJECT
    out.mkdir(parents=True, exist_ok=True)
    record = {}
    for name, (url, sha) in VERSE_FILES.items():
        dest = out / name
        if not dest.exists():
            print(f"fetch {name}")
            urllib.request.urlretrieve(url, dest)
        digest = hashlib.sha256(dest.read_bytes()).hexdigest()
        if digest != sha:
            print(f"{name}: SHA-256 {digest} does not match the pinned {sha}", file=sys.stderr)
            raise SystemExit(1)
        record[name] = digest
    return record


def fetch_zanatomy() -> dict[str, str]:
    import zipfile
    out = RAW / "zanatomy"
    out.mkdir(parents=True, exist_ok=True)
    zp = out / "Z-Anatomy.zip"
    if not zp.exists():
        print("fetch Z-Anatomy.zip (87 MB)")
        urllib.request.urlretrieve(ZANATOMY_URL, zp)
    digest = hashlib.sha256(zp.read_bytes()).hexdigest()
    if digest != ZANATOMY_SHA256:
        print(f"Z-Anatomy.zip: SHA-256 {digest} does not match the pinned {ZANATOMY_SHA256}", file=sys.stderr)
        raise SystemExit(1)
    blend = out / "Z-Anatomy" / "Startup.blend"
    if not blend.exists():
        with zipfile.ZipFile(zp) as z:
            z.extract("Z-Anatomy/Startup.blend", out)
    for name in ("License.txt",):
        if not (out / name).exists():
            urllib.request.urlretrieve(ZANATOMY_URL.replace("Z-Anatomy.zip", name), out / name)
    return {"Z-Anatomy.zip": digest, "Z-Anatomy/Startup.blend": hashlib.sha256(blend.read_bytes()).hexdigest()}


if __name__ == "__main__":
    sys.exit(main())
