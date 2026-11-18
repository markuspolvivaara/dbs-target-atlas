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
        "name": "ICBM 2009b nonlinear asymmetric T1, T2 and PD templates (0.5 mm)",
        "cite": ["fonov2011"],
        "licence": ICBM_LICENCE,
        "url": "https://nist.mni.mcgill.ca/icbm-152-nonlinear-atlases-2009/",
        "note": "Shipped as templates/space/MNI152NLin2009bAsym/t1.nii, t2.nii and pd.nii in Lead-DBS; the Lead-DBS LICENSE.md lists them under the McGill/MNI terms. Resampled to 1.5 mm plus a 0.5 mm subcortical crop for slice display.",
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
        "cite": ["horn2022", "petersen2019"],
        "refIds": ["horn2022"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "hollunder2024": {
        "name": "Human Dysfunctome Atlas (Hollunder 2024)",
        "cite": ["hollunder2024"],
        "refIds": ["hollunder2024"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "neudorfer2020": {
        "name": "Atlas of the human hypothalamic region (Neudorfer 2020)",
        "cite": ["neudorfer2020"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "xiao2017": {
        "name": "MNI PD25 subcortical atlas (Xiao 2017)",
        "cite": ["xiao2017"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
    },
    "pd25hist": {
        "name": "MNI PD25 histology atlas (Xiao 2017), Lead-DBS import",
        "cite": ["xiao2017"],
        "licence": LEADDBS_LICENCE,
        "url": "https://www.lead-dbs.org/helpsupport/knowledge-base/atlasesresources/atlases/",
        "note": "Optic tract label. The Human Motor Thalamus (Ilinsky) optic-tract files were not used: both the lh and rh files lie in the right hemisphere (x > 0).",
    },
    "hcp": {
        "name": "Human Connectome Project (WU-Minn), Open Access data",
        "cite": ["vanessen2013", "glasser2013", "sotiropoulos2013"],
        "licence": "WU-Minn HCP Open Access Data Use Terms (2013): redistribution of original and derived data is allowed under these same terms; acknowledgement required; no attempt to identify or contact participants",
        "url": "https://www.humanconnectome.org/study/hcp-young-adult/document/wu-minn-hcp-consortium-open-access-data-use-terms",
        "note": "Some tracts in this atlas were generated from HCP diffusion data (see the assets listed). Required acknowledgement: Data were provided [in part] by the Human Connectome Project, WU-Minn Consortium (Principal Investigators: David Van Essen and Kamil Ugurbil; 1U54MH091657) funded by the 16 NIH Institutes and Centers that support the NIH Blueprint for Neuroscience Research; and by the McDonnell Center for Systems Neuroscience at Washington University.",
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
    union: list[dict[str, str]] | None = None  # more per-side label files OR-ed into the mask (resampled to a common grid)
    faces: int = 4000  # target faces per hemisphere after decimation
    sigma: float = 0.6  # pre-isosurface Gaussian, in voxels
    aliases: list[str] = field(default_factory=list)
    derivation: str = ""
    category: str | None = None  # card eyebrow when "Nucleus" would be wrong


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
    # (Morel's VLa is approximately Hassler's Voa; the bulk of Vop is cerebellar territory, with the Vim: Ilinsky 2018;
    # the site audit's A-009, the owner's choice)
    Volume("vo", "VLa (Morel), approximately Voa", "nucleus", "vo", "morel", lr(MOREL, "VLa"),
           aliases=["Vo", "Voa", "VLa (Morel)"],
           derivation="Morel's VLa label, approximately Hassler's Voa (Ilinsky 2018); the bulk of Hassler's Vop lies in the cerebellar territory, with the Vim."),
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
    # ---- epilepsy (researched addition, not part of the original teaching page)
    Volume("ant", "Anterior nucleus of the thalamus (ANT)", "nucleus", "ant", "morel", lr(MOREL, "AV"),
           union=[lr(MOREL, "AM"), lr(MOREL, "AD")], faces=3000, aliases=["ANT", "AV/AM/AD"],
           derivation="Union of the Morel anteroventral (AV), anteromedial (AM) and anterodorsal (AD) labels."),
    Volume("mtt", "Mammillothalamic tract", "nucleus", "mtt", "morel", lr(MOREL, "mtt"), faces=1500, sigma=0.4,
           aliases=["MTT"], category="Fibre bundle (atlas label)"),
    Volume("mamm", "Mammillary body", "nucleus", "mb", "neudorfer2020",
           lr("Atlas of the Human Hypothalamus (Neudorfer & Germann 2020)", "mammillary_bodies"), faces=1500, sigma=0.8),
    Volume("fornix", "Fornix", "nucleus", "fx", "neudorfer2020",
           lr("Atlas of the Human Hypothalamus (Neudorfer & Germann 2020)", "fornix"), faces=2000, sigma=0.8,
           category="Fibre bundle (atlas label)"),
    Volume("hippocampus", "Hippocampus", "nucleus", "hip", "xiao2017",
           lr("MNI PD25 subcortical (Xiao 2017)", "hippocampus"), faces=5000),
    # GPi landmark (researched addition)
    Volume("optic_tract", "Optic tract", "nucleus", "ot", "pd25hist",
           {"mixed": f"{A}MNI PD25 histology (Xiao 2017) - imported from PD25_MNI/mixed/Optic_Tract_(II).nii.gz"},
           faces=2500, sigma=0.5, aliases=["OT"], category="Fibre bundle (atlas label)"),
    Volume("dentate", "Dentate nucleus", "nucleus", "den", "suit",
           {"mixed": "labeling/Cerebellum_SUIT (Diedrichsen 2006).nii"},
           label={"L": 29, "R": 30}, sigma=0.8, faces=3000),
]

# Sweet spots: signed maps; the mesh is the isosurface at 50 % of the positive
# maximum and the marker is the value-weighted centroid of that region.
# (Hollunder 2024's maps all come from subthalamic DBS, the dystonia and Tourette ones too: named so and drawn in the
# STN's colour; the site audit's finding A-002)
SWEETSPOTS: list[Volume] = [
    Volume("ss_pd", "PD sweet spot (Hollunder 2024)", "target", "stn", "hollunder2024",
           lr("Human Dysfunctome Atlas (Hollunder 2024)", "Sweet_Spot_PD"), faces=1500),
    Volume("ss_dyt", "Dystonia sweet spot, STN DBS (Hollunder 2024)", "target", "stn", "hollunder2024",
           lr("Human Dysfunctome Atlas (Hollunder 2024)", "Sweet_Spot_DYT"), faces=1500),
    Volume("ss_ts", "Tourette sweet spot, STN DBS (Hollunder 2024)", "target", "stn", "hollunder2024",
           lr("Human Dysfunctome Atlas (Hollunder 2024)", "Sweet_Spot_TS"), faces=1500),
    Volume("ss_gen", "Generalized dystonia sweet spot (Horn 2022)", "target", "gpi", "horn2022",
           lr("Dystonia Response Tract Atlas (Horn 2022)", "Sweetspot_generalized"), faces=1500),
    Volume("ss_cerv", "Cervical dystonia sweet spot (Horn 2022)", "target", "gpi", "horn2022",
           lr("Dystonia Response Tract Atlas (Horn 2022)", "Sweetspot_cervical"), faces=1500),
    Volume("ss_tremor", "Tremor hotspot, thalamic DBS (Elias 2021)", "target", "vim", "elias2021",
           lr("TOR-PSM (Elias 2020)", "tremor_vim_n39_hotspot"), faces=1500),
]
SWEETSPOT_FRACTION = 0.5

# Derived atlas coordinate: ANT voxels within this distance of the MTT label (both Morel).
# Studies relate ANT-DBS outcome to the ANT-MTT junction (Schaper 2020, Ilyas 2022, Grewal 2018).
ANT_MTT_JUNCTION_MM = 1.0


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
    # derived from Human Connectome Project data: "confirmed" (stated in the file or paper),
    # "likely" (the atlas family is built on HCP templates; not stated for this version)
    hcp: str | None = None
    aliases: list[str] = field(default_factory=list)
    derivation: str = ""


MB = "DBS Tractography Atlas (Middlebrooks 2020)"
HOL = f"{A}Human Dysfunctome Atlas (Hollunder 2024)/midline/"
TRACTS: list[Tract] = [
    Tract("hdp", "Hyperdirect pathway, motor STN tract", "stn", "middlebrooks2020", lr(MB, "STN_motor_tract", ".mat"),
          aliases=["hyperdirect pathway"],
          derivation="Middlebrooks motor-STN tract; its cortical terminals fall mostly in pre-SMA/SMA (HMAT).", hcp="likely"),
    Tract("al", "Ansa lenticularis", "gpi", "middlebrooks2020", lr(MB, "Ansa_Lenticularis", ".mat"),
          aliases=["pallidofugal", "pallidothalamic"], hcp="likely"),
    Tract("lf", "Lenticular fasciculus", "gpi", "middlebrooks2020", lr(MB, "Fasciculus_Lenticularis", ".mat"),
          aliases=["H2 field", "pallidofugal", "pallidothalamic"], hcp="likely"),
    Tract("drtt", "Dentato-rubro-thalamic tract (decussating)", "vim", "middlebrooks2020", lr(MB, "DRTT", ".mat"),
          aliases=["DRTT"], hcp="likely"),
    Tract("ndrtt", "Non-decussating DRTT", "vim", "middlebrooks2020", lr(MB, "NDRTT", ".mat"),
          aliases=["nDRTT"], hcp="likely"),
    Tract("cst", "Corticospinal tract", "border", "meola2016",
          {"L": f"{A}Brainstem Connectome (Meola 2016)/lh/CST.mat", "R": f"{A}Brainstem Connectome (Meola 2016)/rh/CST.mat"},
          role="border", aliases=["pyramidal tract", "internal capsule"], hcp="confirmed"),
    Tract("ml", "Medial lemniscus", "borderML", "meola2016",
          {"L": f"{A}Brainstem Connectome (Meola 2016)/lh/ML.mat", "R": f"{A}Brainstem Connectome (Meola 2016)/rh/ML.mat"},
          role="border", hcp="confirmed"),
    Tract("rt_gen", "Generalized dystonia response tract (Horn 2022)", "gpi", "horn2022",
          {"midline": f"{A}Dystonia Response Tract Atlas (Horn 2022)/midline/Generalized_Thresh.mat"},
          positive_only=True, role="response",
          derivation="Positively weighted streamlines of the thresholded tract file."),
    Tract("rt_cerv", "Cervical dystonia response tract (Horn 2022)", "str", "horn2022",
          {"midline": f"{A}Dystonia Response Tract Atlas (Horn 2022)/midline/Cervical_Thresh.mat"},
          positive_only=True, role="response",
          derivation="Positively weighted streamlines of the thresholded tract file."),
    Tract("sw_pd", "PD sweet streamlines (Hollunder 2024)", "stn", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_PD.mat"}, positive_only=True, role="response", hcp="confirmed"),
    Tract("sw_dyt", "Dystonia sweet streamlines, STN DBS (Hollunder 2024)", "stn", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_DYT.mat"}, positive_only=True, role="response", hcp="confirmed"),
    Tract("sw_ts", "Tourette sweet streamlines, STN DBS (Hollunder 2024)", "stn", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_TS.mat"}, positive_only=True, role="response", hcp="confirmed"),
    # Derived subsets for the PD symptom view. The Rajamani 2024 symptom tracts
    # are not distributed as files; these partitions only show where the
    # published PD sweet streamlines terminate.
    Tract("sw_pd_m1", "PD sweet streamlines ending in M1 (derived)", "ctxM1", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_PD.mat"}, positive_only=True, terminal=[1, 2], role="response",
          derivation="Subset of Hollunder 2024 PD sweet streamlines whose superior terminal lies within 3 mm of HMAT M1. Not the Rajamani 2024 tremor tract.", hcp="confirmed"),
    Tract("sw_pd_sma", "PD sweet streamlines ending in SMA (derived)", "ctxSMA", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_PD.mat"}, positive_only=True, terminal=[5, 6], role="response",
          derivation="Subset of Hollunder 2024 PD sweet streamlines whose superior terminal lies within 3 mm of HMAT SMA. Not the Rajamani 2024 bradykinesia/axial tract.", hcp="confirmed"),
    Tract("sw_pd_pm", "PD sweet streamlines ending in premotor cortex (derived)", "ctxPM", "hollunder2024",
          {"midline": HOL + "Sweet_Streamline_PD.mat"}, positive_only=True, terminal=[9, 10, 11, 12], role="response",
          derivation="Subset of Hollunder 2024 PD sweet streamlines whose superior terminal lies within 3 mm of HMAT PMd/PMv. Not the Rajamani 2024 rigidity tract.", hcp="confirmed"),
]
STREAMLINE_STEP_MM = 2.0
RANDOM_SEED = 20261014

# ---------------------------------------------------------------- white-matter tracts section
# HCP-1065 population-averaged tractography atlas (Yeh 2022), in ICBM 2009a nonlinear
# asymmetric space according to the atlas page. Shown on the 2009b templates because its
# tracts sit in white matter on the 2009b T1 and no shift of up to 2 mm improves the fit
# (checked per tract by pipeline/validate.py; the fornix against the Neudorfer 2020 label instead).
# Its streamline files are read with a half voxel added (build.read_trk).
HCP1065_LICENCE = (
    "CC BY-SA 4.0 (brain.labsolver.org/hcp_trk_atlas.html); derived from Human Connectome "
    "Project data, so also subject to the WU-Minn HCP Open Access Data Use Terms"
)
DATASETS["hcp1065"] = {
    "name": "HCP-1065 population-averaged tractography atlas (Yeh 2022)",
    "cite": ["yeh2022", "yeh2018"],
    "licence": HCP1065_LICENCE,
    "url": "https://brain.labsolver.org/hcp_trk_atlas.html",
    "note": "Files from the 'hcp1065' release of github.com/data-others/atlas (hcp1065_avg_tracts_trk.zip; "
            "tract_to_region_connectome_BM_KL.xlsx). Space: ICBM 2009a nonlinear asymmetric (atlas page), shown here on the "
            "2009b templates after an alignment check: along every tract but the fornix the 2009b T1 is white-matter "
            "bright, and no shift of up to 2 mm in any direction raises it by more than 5%; the fornix, thin and beside "
            "the ventricle, is held instead to the fornix label of the Neudorfer 2020 hypothalamus atlas (median distance "
            "under 4 mm) (pipeline/validate.py). The streamline files "
            "give their points from the centre of the first voxel, not from its corner as the TrackVis format has it, so "
            "every point is moved by half a voxel (0.5 mm on each axis); the same check holds each file to at least 97% "
            "of its points inside the atlas's own volume of the tract (hcp1065_avg_tracts_nifti.zip of the same release, "
            "used for this check only).",
}
HCP1065_RELEASE = "https://github.com/data-others/atlas/releases/download/hcp1065/"
HCP1065_TRK_ZIP = "hcp1065_avg_tracts_trk.zip"
HCP1065_TRK_SHA256 = "344aad4394f18b8926ed5e1bda911ad56e328c6cf75faa45e1302512ad779c67"  # as downloaded 2026-10-17
# The atlas's own volume of each tract (0.5 mm): not shown, only what validate.py checks the streamlines' coordinates
# against (build.read_trk's half voxel).
HCP1065_NIFTI_ZIP = "hcp1065_avg_tracts_nifti.zip"
HCP1065_NIFTI_SHA256 = "81e0ad75add35c96a5bfd9dc6ede10e5482a8dd180eafcdf2d79249926194510"  # as downloaded 2026-11-18
HCP1065_CONNECTOME = "tract_to_region_connectome_BM_KL.xlsx"
WM_BUDGET = 300  # streamlines per hemisphere, the same on both sides


@dataclass
class WmTract:
    """A tract of the white-matter section: one HCP-1065 .trk.gz per hemisphere (or one midline file)."""

    id: str
    name: str
    abbr: str
    colour: str
    group: str  # association | projection | commissural | cerebellar (the atlas folder)
    files: dict[str, str]  # side -> path inside the zip, or {"midline": path} (split at x = 0)
    connectome: str | None = None  # column in the tract-to-region table (Brodmann sheet)
    tier: str = "core"  # core | extended | fossa (posterior fossa); shown separately in the app
    # Only the streamlines that cross the midline ("crossed": upper and lower ends on opposite sides) or that do not
    # ("uncrossed"): the DRTT shown as two tracts, as the DBS section does (the site audit's B4, the owner's choice).
    # A split tract draws from a random stream of its own.
    keep: str | None = None
    # The tract's draw from the shared random stream is still made as it was before the split or withdrawal, so the
    # tracts after it keep their streamlines.
    replays: bool = False
    # Not written or listed (the acoustic radiation: its atlas bundle ends beside the atrium, about 22 mm from
    # Heschl's gyrus; B4, the owner's choice), but its draw is replayed.
    withdrawn: bool = False


def _lr(folder: str, stem: str) -> dict[str, str]:
    return {s: f"{folder}/{stem}_{s}.trk.gz" for s in ("L", "R")}


WM_TRACTS: list[WmTract] = [
    WmTract("wm_af", "Arcuate fasciculus", "AF", "wmAF", "association", _lr("association", "AF"), "AF"),
    WmTract("wm_slf1", "Superior longitudinal fasciculus I", "SLF I", "wmSLF1", "association", _lr("association", "SLF1"), "SLF_I"),
    WmTract("wm_slf2", "Superior longitudinal fasciculus II", "SLF II", "wmSLF2", "association", _lr("association", "SLF2"), "SLF_II"),
    WmTract("wm_slf3", "Superior longitudinal fasciculus III", "SLF III", "wmSLF3", "association", _lr("association", "SLF3"), "SLF_III"),
    WmTract("wm_ifof", "Inferior fronto-occipital fasciculus", "IFOF", "wmIFOF", "association", _lr("association", "IFOF"), "IFOF"),
    WmTract("wm_ilf", "Inferior longitudinal fasciculus", "ILF", "wmILF", "association", _lr("association", "ILF"), "ILF"),
    WmTract("wm_uf", "Uncinate fasciculus", "UF", "wmUF", "association", _lr("association", "UF"), "UF"),
    WmTract("wm_fat", "Frontal aslant tract", "FAT", "wmFAT", "association", _lr("association", "FAT"), "FAT"),
    WmTract("wm_cing_fp", "Cingulum, frontal–parietal (dorsal) segment", "Cingulum (dorsal)", "wmCingD", "association", _lr("association", "C_FP"), "C_FP"),
    WmTract("wm_cing_ph", "Cingulum, parahippocampal segment", "Cingulum (parahippocampal)", "wmCingPH", "association", _lr("association", "C_PH"), "C_PH"),
    WmTract("wm_or", "Optic radiation", "OR", "wmOR", "projection", _lr("projection", "OR"), "OR"),
    WmTract("wm_cst", "Corticospinal tract", "CST", "wmCST", "projection", _lr("projection", "CST"), "CST"),
    WmTract("wm_cbt", "Corticobulbar tract", "CBT", "wmCBT", "projection", _lr("projection", "CBT"), "CBT"),
    WmTract("wm_cc", "Corpus callosum", "CC", "wmCC", "commissural", {"midline": "commissural/CC.trk.gz"}),
    WmTract("wm_fx", "Fornix", "Fornix", "wmFX", "projection", _lr("projection", "F"), "F"),
    # extended tier
    WmTract("wm_mdlf", "Middle longitudinal fasciculus", "MdLF", "wmMdLF", "association", _lr("association", "MdLF"), "MdLF", "extended"),
    WmTract("wm_tpat", "Temporo-parietal aslant tract", "TPAT", "wmTPAT", "association", _lr("association", "PAT"), "PTAT", "extended"),
    WmTract("wm_vof", "Vertical occipital fasciculus", "VOF", "wmVOF", "association", _lr("association", "VOF"), "VOF", "extended"),
    WmTract("wm_emc", "Extreme capsule fasciculus", "EmC", "wmEMC", "association", _lr("association", "EMC"), None, "extended"),
    WmTract("wm_ac", "Anterior commissure", "AC", "wmAC", "commissural", {"midline": "commissural/AC.trk.gz"}, None, "extended"),
    WmTract("wm_atr", "Anterior thalamic radiation", "ATR", "wmATR", "projection", _lr("projection", "TR_A"), "CTh_A", "extended"),
    WmTract("wm_str", "Superior thalamic radiation", "STR", "wmSTR", "projection", _lr("projection", "TR_S"), "CTh_S", "extended"),
    WmTract("wm_ptr", "Posterior thalamic radiation", "PTR", "wmPTR", "projection", _lr("projection", "TR_P"), "CTh_P", "extended"),
    WmTract("wm_ar", "Acoustic radiation", "AR", "wmAR", "projection", _lr("projection", "AR"), None, "extended", withdrawn=True),
    WmTract("wm_cs_a", "Corticostriatal tract, anterior", "CStr-A", "wmCSA", "projection", _lr("projection", "CS_A"), "CStr_A", "extended"),
    WmTract("wm_cs_s", "Corticostriatal tract, superior", "CStr-S", "wmCSS", "projection", _lr("projection", "CS_S"), "CStr_S", "extended"),
    WmTract("wm_cs_p", "Corticostriatal tract, posterior", "CStr-P", "wmCSP", "projection", _lr("projection", "CS_P"), "CStr_P", "extended"),
    # posterior fossa tier
    WmTract("wm_scp", "Superior cerebellar peduncle", "SCP", "wmSCP", "cerebellar", {"midline": "cerebellum/SCP.trk.gz"}, None, "fossa"),
    WmTract("wm_mcp", "Middle cerebellar peduncle", "MCP", "wmMCP", "cerebellar", {"midline": "cerebellum/MCP.trk.gz"}, None, "fossa"),
    WmTract("wm_icp", "Inferior cerebellar peduncle", "ICP", "wmICP", "cerebellar", _lr("cerebellum", "ICP"), None, "fossa"),
    WmTract("wm_drtt", "Dentato-rubro-thalamic tract, decussating", "DRTT", "wmDRTT", "projection", _lr("projection", "DRTT"), None, "fossa",
            keep="crossed", replays=True),
    WmTract("wm_ndrtt", "Dentato-rubro-thalamic tract, non-decussating", "nDRTT", "wmNDRTT", "projection", _lr("projection", "DRTT"), None, "fossa",
            keep="uncrossed"),
    WmTract("wm_ml", "Medial lemniscus", "ML", "wmML", "projection", _lr("projection", "ML"), None, "fossa"),
    WmTract("wm_rst", "Reticulospinal tract", "RST", "wmRST", "projection", _lr("projection", "RST"), None, "fossa"),
    WmTract("wm_cpt_f", "Corticopontine tract, frontal", "CPT-F", "wmCPTF", "projection", _lr("projection", "CPT_F"), None, "fossa"),
    WmTract("wm_cpt_p", "Corticopontine tract, parietal", "CPT-P", "wmCPTP", "projection", _lr("projection", "CPT_P"), None, "fossa"),
    WmTract("wm_cpt_o", "Corticopontine tract, occipital", "CPT-O", "wmCPTO", "projection", _lr("projection", "CPT_O"), None, "fossa"),
]

# the tracts written and listed (the withdrawn one is only replayed)
WM_SHOWN: list[WmTract] = [t for t in WM_TRACTS if not t.withdrawn]
# a connectome entry counts as a connection of the tract when at least this fraction of the
# 1065 individuals showed it (Yeh 2022: ~85% of entries are >95% or <5%)
CONNECTOME_MIN = 0.95

# T1 slice textures
T1_FILE = "t1.nii"
# Slice images: ICBM 2009b templates shipped with Lead-DBS (same grid, same McGill/MNI licence)
TEMPLATES = {"t1": "t1.nii", "t2": "t2.nii", "pd": "pd.nii"}
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
