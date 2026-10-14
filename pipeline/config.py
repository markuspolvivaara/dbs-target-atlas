"""Declarative list of every web asset the pipeline builds.

Each entry names its source file(s) inside pipeline/data/raw, how it is
converted, which colour token it uses in the app, and which dataset it comes
from. Dataset licences and citations live in DATASETS; citation strings are
the Crossref-verified records in sources/citations.json.

Nothing here is hand-modelled: every mesh is an isosurface of a source
volume and every tract is a subsample of source streamlines.
"""
from __future__ import annotations

from dataclasses import dataclass, field

LEADDBS_LICENCE = (
    "GPL-3.0 (non-commercial use requested by atlas owners), as stated for the "
    "standard-space atlases in the Lead-DBS LICENSE.md"
)
ICBM_LICENCE = (
    "MNI/McGill permissive licence: use, copy, modify and distribute with the "
    "copyright notice retained (Copyright (C) 1993-2004 Louis Collins, McConnell "
    "Brain Imaging Centre, Montreal Neurological Institute, McGill University)"
)

# id -> dataset description. `cite` keys point into sources/citations.json.
DATASETS: dict[str, dict] = {
    "leaddbs": {
        "name": "Lead-DBS data package (v3)",
        "cite": ["leaddbs3"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org",
        "note": "Distribution channel for every atlas below; files fetched from the official data archive.",
    },
    "icbm2009b": {
        "name": "ICBM 2009b nonlinear asymmetric T1 template (0.5 mm)",
        "cite": ["fonov2011"],
        "licence": ICBM_LICENCE,
        "url": "https://nist.mni.mcgill.ca/icbm-152-nonlinear-atlases-2009/",
        "note": "Shipped as templates/space/MNI152NLin2009bAsym/t1.nii in Lead-DBS. Resampled to 1 mm and a 0.5 mm subcortical crop for slice display.",
    },
    "distal": {
        "name": "DISTAL Medium (Ewert 2017)",
        "cite": ["ewert2018"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/distal-atlas/",
    },
    "cit168": {
        "name": "CIT168 subcortical atlas (Pauli 2018), Lead-DBS import",
        "cite": ["pauli2018"],
        "licence": LEADDBS_LICENCE,
        "url": "https://osf.io/jkzwp/",
    },
    "morel": {
        "name": "Morel thalamus atlas in MNI space (Lead-DBS: 'Morel Atlas (Jakab 2008)')",
        "cite": ["morel1997", "krauth2010"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
        "todo": "Confirm the exact 'Jakab 2008' publication that Lead-DBS credits for the MNI version.",
    },
    "lau2020": {
        "name": "Zona incerta atlas (Lau 2020)",
        "cite": ["lau2020"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "snijders2016": {
        "name": "PPN (Snijders 2016)",
        "cite": ["snijders2016"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "suit": {
        "name": "SUIT cerebellar atlas, dentate labels (Diedrichsen)",
        "cite": ["diedrichsen2006", "diedrichsen2009"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.diedrichsenlab.org/imaging/suit.htm",
    },
    "hmat": {
        "name": "Human Motor Area Template, HMAT (Mayka 2006)",
        "cite": ["mayka2006"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/cortical-atlas-parcellations-mni-space/",
    },
    "cortex": {
        "name": "Lead-DBS template cortical surface (CortexHiRes) with Desikan-Killiany annotation",
        "cite": ["leaddbs3", "desikan2006"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org",
        "note": "Surface supplied with Lead-DBS for the 2009b template; alignment checked against the Mindboggle-101 volume (Klein 2012) in validate.py.",
    },
    "middlebrooks2020": {
        "name": "DBS Tractography Atlas (Middlebrooks 2020), Lead-DBS-distributed version",
        "cite": ["middlebrooks2020"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "meola2016": {
        "name": "Brainstem connectome atlas (Meola 2016)",
        "cite": ["meola2016"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "horn2022": {
        "name": "Dystonia Response Tract Atlas (Horn 2022), built on the Petersen 2019 pathway atlas",
        "cite": ["petersen2019"],
        "refIds": ["horn2022"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "hollunder2024": {
        "name": "Human Dysfunctome Atlas (Hollunder 2024)",
        "cite": [],
        "refIds": ["hollunder2024"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "elias2021": {
        "name": "TOR-PSM probabilistic stimulation maps (Elias 2021)",
        "cite": ["elias2021"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
}

A = "atlases/"


@dataclass
class Volume:
    """A structure built from one label volume per hemisphere."""

    id: str
    name: str
    type: str  # nucleus | cortex | target
    colour: str  # colour token used by the app
    dataset: str
    files: dict[str, str] = field(default_factory=dict)  # side -> path; side "mixed" = both
    threshold: float = 0.5
    label: dict[str, int] | None = None  # side -> integer label in a label volume
    union: list[str] | None = None  # extra mixed files to OR into the mask
    faces: int = 4000  # target faces per hemisphere after decimation
    sigma: float = 0.6  # pre-isosurface Gaussian, in voxels
    aliases: list[str] = field(default_factory=list)
    derivation: str = ""


def lr(atlas: str, name: str, ext: str = ".nii.gz") -> dict[str, str]:
    return {"L": f"{A}{atlas}/lh/{name}{ext}", "R": f"{A}{atlas}/rh/{name}{ext}"}


DM = "DISTAL Medium (Ewert 2017)"
CIT = "CIT168_Reinf_Learn (Pauli 2017) - imported from CIT168"
MOREL = "Morel Atlas (Jakab 2008)"

NUCLEI: list[Volume] = [
    Volume("stn", "Subthalamic nucleus", "nucleus", "stn", "distal", lr(DM, "STN"), aliases=["STN"]),
    Volume("stn_motor", "STN, sensorimotor zone", "nucleus", "stn", "distal", lr(DM, "STN_motor"),
           faces=2000, aliases=["dorsolateral STN", "motor STN"]),
    Volume("stn_assoc", "STN, associative zone", "nucleus", "stnAssoc", "distal", lr(DM, "STN_associative"), faces=2000),
    Volume("stn_limbic", "STN, limbic zone", "nucleus", "stnLimbic", "distal", lr(DM, "STN_limbic"), faces=2000),
    Volume("gpi", "Globus pallidus internus", "nucleus", "gpi", "distal", lr(DM, "GPi"), aliases=["GPi"]),
    Volume("gpi_sm", "GPi, sensorimotor zone", "nucleus", "gpi", "distal", lr(DM, "GPi_sensorimotor"),
           faces=2000, aliases=["posteroventral GPi"]),
    Volume("gpe", "Globus pallidus externus", "nucleus", "gpe", "distal", lr(DM, "GPe"), aliases=["GPe"]),
    Volume("rn", "Red nucleus", "nucleus", "rn", "distal", lr(DM, "RN"), aliases=["RN"]),
    Volume("thal", "Thalamus", "nucleus", "thal", "distal", lr(DM, "Thal"), faces=6000),
    Volume("vim", "Ventral intermediate nucleus (Vim)", "nucleus", "vim", "distal", lr(DM, "VIM"), aliases=["Vim", "VLp"]),
    Volume("vo", "Ventral oral complex (Vo)", "nucleus", "vo", "morel", lr(MOREL, "VLa"),
           aliases=["Vo", "Voa/Vop", "VLa (Morel)"],
           derivation="Morel VLa label displayed as Vo, following the brief's nomenclature mapping (Vo = VA/VLa)."),
    Volume("cm", "Centromedian nucleus (CM)", "nucleus", "cm", "morel", lr(MOREL, "CM"), aliases=["CM"]),
    Volume("pf", "Parafascicular nucleus (Pf)", "nucleus", "cm", "morel", lr(MOREL, "Pf"), aliases=["Pf"]),
    Volume("psa", "Caudal zona incerta (PSA)", "nucleus", "psa", "lau2020", lr("Zona Incerta Atlas (Lau 2020)", "cZI"),
           aliases=["cZi", "PSA"], sigma=0.8),
    Volume("snr", "Substantia nigra pars reticulata", "nucleus", "snr", "cit168",
           {"mixed": f"{A}{CIT}/mixed/SNr.nii.gz"}, aliases=["SNr"]),
    Volume("snc", "Substantia nigra pars compacta", "nucleus", "snc", "cit168",
           {"mixed": f"{A}{CIT}/mixed/SNc.nii.gz"}, aliases=["SNc"]),
    Volume("putamen", "Putamen", "nucleus", "str", "cit168", {"mixed": f"{A}{CIT}/mixed/Pu.nii.gz"}, faces=6000),
    Volume("caudate", "Caudate nucleus", "nucleus", "str", "cit168", {"mixed": f"{A}{CIT}/mixed/Ca.nii.gz"}, faces=6000),
    Volume("nacc", "Nucleus accumbens", "nucleus", "str", "cit168", {"mixed": f"{A}{CIT}/mixed/NAC.nii.gz"}, faces=2000),
    Volume("ppn", "Pedunculopontine nucleus", "nucleus", "ppn", "snijders2016", lr("PPN (Snijders 2016)", "PPN", ".nii"),
           faces=1500, sigma=0.8, aliases=["PPN"]),
    Volume("dentate", "Dentate nucleus", "nucleus", "den", "suit",
           {"mixed": "labeling/Cerebellum_SUIT (Diedrichsen 2006).nii"},
           label={"L": 29, "R": 30}, sigma=0.8, faces=3000),
]

# Sweet spots: signed maps; the mesh is the isosurface at 50 % of the positive
# maximum and the marker is the value-weighted centroid of that region.
SWEETSPOTS: list[Volume] = [
    Volume("ss_pd", "PD sweet spot (Hollunder 2024)", "target", "stn", "hollunder2024",
           lr("Human Dysfunctome Atlas (Hollunder 2024)", "Sweet_Spot_PD"), faces=1500),
    Volume("ss_dyt", "Dystonia sweet spot (Hollunder 2024)", "target", "gpi", "hollunder2024",
           lr("Human Dysfunctome Atlas (Hollunder 2024)", "Sweet_Spot_DYT"), faces=1500),
    Volume("ss_ts", "Tourette sweet spot (Hollunder 2024)", "target", "cm", "hollunder2024",
           lr("Human Dysfunctome Atlas (Hollunder 2024)", "Sweet_Spot_TS"), faces=1500),
    Volume("ss_gen", "Generalized dystonia sweet spot (Horn 2022)", "target", "gpi", "horn2022",
           lr("Dystonia Response Tract Atlas (Horn 2022)", "Sweetspot_generalized"), faces=1500),
    Volume("ss_cerv", "Cervical dystonia sweet spot (Horn 2022)", "target", "gpi", "horn2022",
           lr("Dystonia Response Tract Atlas (Horn 2022)", "Sweetspot_cervical"), faces=1500),
    Volume("ss_tremor", "Tremor hotspot, thalamic DBS (Elias 2021)", "target", "vim", "elias2021",
           lr("TOR-PSM (Elias 2020)", "tremor_vim_n39_hotspot"), faces=1500),
]
SWEETSPOT_FRACTION = 0.5


@dataclass
class Cortex:
    id: str
    name: str
    colour: str
    dataset: str
    hmat: list[int] | None = None  # HMAT labels (both sides; odd = right)
    dk: list[str] | None = None  # Desikan-Killiany names
    aliases: list[str] = field(default_factory=list)
    derivation: str = ""


CORTEX_FACES = 60000  # per hemisphere
CORTEX_PARCELS: list[Cortex] = [
    Cortex("m1", "Primary motor cortex (M1)", "ctxM1", "hmat", hmat=[1, 2], aliases=["M1"]),
    Cortex("s1", "Primary somatosensory cortex (S1)", "ctxS1", "hmat", hmat=[3, 4], aliases=["S1", "sensorimotor"]),
    Cortex("sma", "Supplementary motor area (SMA)", "ctxSMA", "hmat", hmat=[5, 6], aliases=["SMA"]),
    Cortex("presma", "Pre-SMA", "ctxPreSMA", "hmat", hmat=[7, 8]),
    Cortex("pmd", "Dorsal premotor cortex (PMd)", "ctxPM", "hmat", hmat=[9, 10], aliases=["premotor"]),
    Cortex("pmv", "Ventral premotor cortex (PMv)", "ctxPM", "hmat", hmat=[11, 12], aliases=["premotor"]),
    Cortex("acc", "Anterior cingulate cortex (ACC)", "ctxACC", "cortex",
           dk=["caudalanteriorcingulate", "rostralanteriorcingulate"],
           derivation="Union of Desikan-Killiany caudal and rostral anterior cingulate labels."),
    Cortex("vmpfc", "Ventromedial prefrontal cortex (vmPFC, proxy)", "ctxVMPFC", "cortex",
           dk=["medialorbitofrontal"],
           derivation="Desikan-Killiany medial orbitofrontal label used as a vmPFC proxy; no dedicated vmPFC parcel in the shipped parcellations."),
]
HMAT_MAX_DIST_MM = 3.0


@dataclass
class Tract:
    id: str
    name: str
    colour: str
    dataset: str
    files: dict[str, str]  # side -> .mat (fibers/idx) or {"midline": fibcell file}
    budget: int = 300  # streamlines per hemisphere
    positive_only: bool = False
    terminal: list[int] | None = None  # keep streamlines whose superior end lies in these HMAT labels
    role: str = "tract"  # tract | border | response
    aliases: list[str] = field(default_factory=list)
    derivation: str = ""


MB = "DBS Tractography Atlas (Middlebrooks 2020)"
HOL = f"{A}Human Dysfunctome Atlas (Hollunder 2024)/midline/"
TRACTS: list[Tract] = [
    Tract("hdp", "Hyperdirect pathway, motor STN tract", "stn", "middlebrooks2020", lr(MB, "STN_motor_tract", ".mat"),
          aliases=["hyperdirect pathway"],
          derivation="Middlebrooks motor-STN tract; its cortical terminals fall mostly in pre-SMA/SMA (HMAT)."),
    Tract("al", "Ansa lenticularis", "gpi", "middlebrooks2020", lr(MB, "Ansa_Lenticularis", ".mat"),
          aliases=["pallidofugal", "pallidothalamic"]),
    Tract("lf", "Lenticular fasciculus", "gpi", "middlebrooks2020", lr(MB, "Fasciculus_Lenticularis", ".mat"),
          aliases=["H2 field", "pallidofugal", "pallidothalamic"]),
    Tract("drtt", "Dentato-rubro-thalamic tract (decussating)", "vim", "middlebrooks2020", lr(MB, "DRTT", ".mat"),
          aliases=["DRTT"]),
    Tract("ndrtt", "Non-decussating DRTT", "vim", "middlebrooks2020", lr(MB, "NDRTT", ".mat"),
          aliases=["nDRTT"]),
    Tract("cst", "Corticospinal tract", "border", "meola2016",
          {"L": f"{A}Brainstem Connectome (Meola 2016)/lh/CST.mat", "R": f"{A}Brainstem Connectome (Meola 2016)/rh/CST.mat"},
          role="border", aliases=["pyramidal tract", "internal capsule"]),
    Tract("ml", "Medial lemniscus", "borderML", "meola2016",
          {"L": f"{A}Brainstem Connectome (Meola 2016)/lh/ML.mat", "R": f"{A}Brainstem Connectome (Meola 2016)/rh/ML.mat"},
          role="border"),
    Tract("rt_gen", "Generalized dystonia response tract (Horn 2022)", "gpi", "horn2022",
          {"midline": f"{A}Dystonia Response Tract Atlas (Horn 2022)/midline/Generalized_Thresh.mat"},
          positive_only=True, role="response",
          derivation="Positively weighted streamlines of the thresholded tract file."),
    Tract("rt_cerv", "Cervical dystonia response tract (Horn 2022)", "str", "horn2022",
          {"midline": f"{A}Dystonia Response Tract Atlas (Horn 2022)/midline/Cervical_Thresh.mat"},
          positive_only=True, role="response",
          derivation="Positively weighted streamlines of the thresholded tract file."),
    Tract("sw_pd", "PD sweet streamlines (Hollunder 2024)", "stn", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_PD.mat"}, positive_only=True, role="response"),
    Tract("sw_dyt", "Dystonia sweet streamlines (Hollunder 2024)", "gpi", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_DYT.mat"}, positive_only=True, role="response"),
    Tract("sw_ts", "Tourette sweet streamlines (Hollunder 2024)", "cm", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_TS.mat"}, positive_only=True, role="response"),
    # Derived subsets for the PD symptom view. The Rajamani 2024 symptom tracts
    # are not distributed as files; these partitions only show where the
    # published PD sweet streamlines terminate.
    Tract("sw_pd_m1", "PD sweet streamlines ending in M1 (derived)", "ctxM1", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_PD.mat"}, positive_only=True, terminal=[1, 2], role="response",
          derivation="Subset of Hollunder 2024 PD sweet streamlines whose superior terminal lies within 3 mm of HMAT M1. Not the Rajamani 2024 tremor tract."),
    Tract("sw_pd_sma", "PD sweet streamlines ending in SMA (derived)", "ctxSMA", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_PD.mat"}, positive_only=True, terminal=[5, 6], role="response",
          derivation="Subset of Hollunder 2024 PD sweet streamlines whose superior terminal lies within 3 mm of HMAT SMA. Not the Rajamani 2024 bradykinesia/axial tract."),
    Tract("sw_pd_pm", "PD sweet streamlines ending in premotor cortex (derived)", "ctxPM", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_PD.mat"}, positive_only=True, terminal=[9, 10, 11, 12], role="response",
          derivation="Subset of Hollunder 2024 PD sweet streamlines whose superior terminal lies within 3 mm of HMAT PMd/PMv. Not the Rajamani 2024 rigidity tract."),
]
STREAMLINE_STEP_MM = 2.0
RANDOM_SEED = 20261014

# T1 slice textures
T1_FILE = "t1.nii"
T1_CROP_MM = {"x": (-36.0, 36.0), "y": (-48.0, 24.0), "z": (-30.0, 30.0)}  # 0.5 mm subcortical crop

# Template AC/PC/mid-sagittal fiducials in MNI ICBM 2009b, as hard-coded in
# Lead-DBS tools/acpc2mni/ea_mni2acpc.m (fidpoints_mm).
ACPC_FIDUCIALS = {
    "AC": [0.25, 1.298, -5.003],
    "PC": [-0.188, -24.756, -2.376],
    "MSP": [0.25, 1.298, 55.0],
    "source": "Lead-DBS tools/acpc2mni/ea_mni2acpc.m (netstim/leaddbs, GPL-3.0)",
    "url": "https://github.com/netstim/leaddbs/blob/master/tools/acpc2mni/ea_mni2acpc.m",
}
