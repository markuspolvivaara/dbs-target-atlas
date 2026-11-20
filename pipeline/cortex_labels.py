"""Label tables for the cortex section (pure data, also imported by the Blender text export).

DESTRIEUX: Table 1 of Destrieux et al. 2010 (NeuroImage 53:1-15, PMID 20547229), transcribed from the
PMC full text: index, short name (as in the FreeSurfer aparc.a2009s annotation), long name, views on which
the label is visible (S superior, A anterior, L lateral, P posterior, M medial, I inferior), and the mean
area in cm2 reported for the right and left hemispheres. The long names are given verbatim (including the
paper's own spelling).

ZTEXT: the Z-Anatomy definition text (a Wikipedia lead, CC BY-SA 3.0) used for each label, by Z-Anatomy
text name, with the scope it describes when that is broader than the label (e.g. the whole cingulate cortex).
None = Z-Anatomy ships no text that describes the label; such a label (and the occipital lobe) has a short text
written for this atlas from the full text of Destrieux et al. 2010 instead (OWN_TEXTS, OWN_LOBE_TEXTS).

DK_LOBE: lobe of each Desikan-Killiany region, as grouped in Table 2 of Klein & Tourville 2012
(Front Neurosci 6:171, PMID 23227001, CC BY 3.0); the insula is listed on its own there (Table 4).
The three DK regions that table marks as removed in DKT (temporal pole, banks of the STS, frontal pole)
are grouped with the lobe heading they are listed under.
"""

DESTRIEUX = [
    (1, 'G_and_S_frontomargin', 'Fronto-marginal gyrus (of Wernicke) and sulcus', 'A,L,I', 7.71, 9.55),
    (2, 'G_and_S_occipital_inf', 'Inferior occipital gyrus (O3) and sulcus', 'L,P,I', 10.74, 13.22),
    (3, 'G_and_S_paracentral', 'Paracentral lobule and sulcus', 'S,P,M', 12.18, 13.62),
    (4, 'G_and_S_subcentral', 'Subcentral gyrus (central operculum) and sulci', 'L', 11.54, 12.24),
    (5, 'G_and_S_transv_frontopol', 'Transverse frontopolar gyri and sulci', 'A,L,M,I', 9.39, 5.8),
    (6, 'G_and_S_cingul-Ant', 'Anterior part of the cingulate gyrus and sulcus (ACC)', 'M', 24.49, 18.89),
    (7, 'G_and_S_cingul-Mid-Ant', 'Middle-anterior part of the cingulate gyrus and sulcus (aMCC)', 'M', 12.32, 12.23),
    (8, 'G_and_S_cingul-Mid-Post', 'Middle-posterior part of the cingulate gyrus and sulcus (pMCC)', 'M', 13.25, 12.38),
    (9, 'G_cingul-Post-dorsal', 'Posterior-dorsal part of the cingulate gyrus (dPCC)', 'M', 4.12, 4.44),
    (10, 'G_cingul-Post-ventral', 'Posterior-ventral part of the cingulate gyrus (vPCC, isthmus of the cingulate gyrus)', 'M,I', 2.61, 2.5),
    (11, 'G_cuneus', 'Cuneus (O6)', 'S,P,M', 15.41, 14.52),
    (12, 'G_front_inf-Opercular', 'Opercular part of the inferior frontal gyrus', 'L,I', 9.98, 10.43),
    (13, 'G_front_inf-Orbital', 'Orbital part of the inferior frontal gyrus', 'L,I', 3.15, 2.77),
    (14, 'G_front_inf-Triangul', 'Triangular part of the inferior frontal gyrus', 'L,I', 7.88, 7.79),
    (15, 'G_front_middle', 'Middle frontal gyrus (F2)', 'S,A,L', 30.67, 34.29),
    (16, 'G_front_sup', 'Superior frontal gyrus (F1)', 'S,A,L,M', 52.97, 57.05),
    (17, 'G_Ins_lg_and_S_cent_ins', 'Long insular gyrus and central sulcus of the insula', 'L', 4.98, 4.61),
    (18, 'G_insular_short', 'Short insular gyri', 'L', 4.58, 5.32),
    (19, 'G_occipital_middle', 'Middle occipital gyrus (O2, lateral occipital gyrus)', 'S,L,P', 17.01, 16.68),
    (20, 'G_occipital_sup', 'Superior occipital gyrus (O1)', 'S,L,P', 11.98, 10.66),
    (21, 'G_oc-temp_lat-fusifor', 'Lateral occipito-temporal gyrus (fusiform gyrus, O4-T4)', 'I', 13.6, 13.48),
    (22, 'G_oc-temp_med-Lingual', 'Lingual gyrus, ligual part of the medial occipito-temporal gyrus, (O5)', 'P,M,I', 20.82, 21.22),
    (23, 'G_oc-temp_med-Parahip', 'Parahippocampal gyrus, parahippocampal part of the medial occipito-temporal gyrus, (T5)', 'M,I', 13.48, 14.44),
    (24, 'G_orbital', 'Orbital gyri', 'A,L,I', 20.57, 18.79),
    (25, 'G_pariet_inf-Angular', 'Angular gyrus', 'S,L,P', 23.07, 19.32),
    (26, 'G_pariet_inf-Supramar', 'Supramarginal gyrus', 'S,L,P', 19.58, 23.18),
    (27, 'G_parietal_sup', 'Superior parietal lobule (lateral part of P1)', 'S,L,P,M', 18.77, 22.04),
    (28, 'G_postcentral', 'Postcentral gyrus', 'S,L,P', 17.55, 19.53),
    (29, 'G_precentral', 'Precentral gyrus', 'S,A,L', 22.55, 22.22),
    (30, 'G_precuneus', 'Precuneus (medial part of P1)', 'S,P,M', 19.26, 19.32),
    (31, 'G_rectus', 'Straight gyrus, Gyrus rectus', 'A,M,I', 5.8, 7.11),
    (32, 'G_subcallosal', 'Subcallosal area, subcallosal gyrus', 'M,I', 2.41, 2.13),
    (33, 'G_temp_sup-G_T_transv', 'Anterior transverse temporal gyrus (of Heschl)', 'A,L', 3.42, 4.27),
    (34, 'G_temp_sup-Lateral', 'Lateral aspect of the superior temporal gyrus', 'A,L', 15.2, 15.46),
    (35, 'G_temp_sup-Plan_polar', 'Planum polare of the superior temporal gyrus', 'A,L,M', 6.9, 6.08),
    (36, 'G_temp_sup-Plan_tempo', 'Planum temporale or temporal plane of the superior temporal gyrus', 'A,L', 7.52, 9.48),
    (37, 'G_temporal_inf', 'Inferior temporal gyrus (T3)', 'L,I', 18.05, 21.27),
    (38, 'G_temporal_middle', 'Middle temporal gyrus (T2)', 'A,L,P,I', 22.59, 20.52),
    (39, 'Lat_Fis-ant-Horizont', 'Horizontal ramus of the anterior segment of the lateral sulcus (or fissure)', 'L,I', 3.22, 2.59),
    (40, 'Lat_Fis-ant-Vertical', 'Vertical ramus of the anterior segment of the lateral sulcus (or fissure)', 'L,I', 2.43, 2.87),
    (41, 'Lat_Fis-post', 'Posterior ramus (or segment) of the lateral sulcus (or fissure)', 'A,L', 12.15, 9.73),
    (42, 'Pole_occipital', 'Occipital pole', 'L,P,M,I', 23.43, 14.62),
    (43, 'Pole_temporal', 'Temporal pole', 'A,L,M,I', 11.91, 12.71),
    (44, 'S_calcarine', 'Calcarine sulcus', 'M', 18.51, 19.69),
    (45, 'S_central', 'Central sulcus (Rolando’s fissure)', 'S,A,L,P', 25.02, 25.98),
    (46, 'S_cingul-Marginalis', 'Marginal branch (or part) of the cingulate sulcus', 'S,P,M', 11.23, 9.88),
    (47, 'S_circular_insula_ant', 'Anterior segment of the circular sulcus of the insula', 'L,I', 5.05, 4.39),
    (48, 'S_circular_insula_inf', 'Inferior segment of the circular sulcus of the insula', 'A,L', 11.13, 13.27),
    (49, 'S_circular_insula_sup', 'Superior segment of the circular sulcus of the insula', 'L,I', 12.5, 15.06),
    (50, 'S_collat_transv_ant', 'Anterior transverse collateral sulcus', 'I', 8.81, 8.63),
    (51, 'S_collat_transv_post', 'Posterior transverse collateral sulcus', 'I', 4.43, 3.93),
    (52, 'S_front_inf', 'Inferior frontal sulcus', 'S,A,L', 18.17, 20.68),
    (53, 'S_front_middle', 'Middle frontal sulcus', 'S,A,L', 17.16, 12.65),
    (54, 'S_front_sup', 'Superior frontal sulcus', 'S,A,L', 23.64, 25.82),
    (55, 'S_interm_prim-Jensen', 'Sulcus intermedius primus (of Jensen)', 'S,L,P', 4.88, 3.83),
    (56, 'S_intrapariet_and_P_trans', 'Intraparietal sulcus (interparietal sulcus) and transverse parietal sulci', 'S,L,P', 28.44, 27.14),
    (57, 'S_oc_middle_and_Lunatus', 'Middle occipital sulcus and lunatus sulcus', 'S,L,P', 8.29, 9.55),
    (58, 'S_oc_sup_and_transversal', 'Superior occipital sulcus and transverse occipital sulcus', 'S,L,P', 12.7, 10.38),
    (59, 'S_occipital_ant', 'Anterior occipital sulcus and preoccipital notch (temporo-occipital incisure)', 'L,P', 6.64, 6.6),
    (60, 'S_oc-temp_lat', 'Lateral occipito-temporal sulcus', 'I', 9.13, 8.53),
    (61, 'S_oc-temp_med_and_Lingual', 'Medial occipito-temporal sulcus (collateral sulcus) and lingual sulcus', 'M,I', 18.57, 19.4),
    (62, 'S_orbital_lateral', 'Lateral orbital sulcus', 'A,L,I', 3.46, 3.13),
    (63, 'S_orbital_med-olfact', 'Medial orbital sulcus (olfactory sulcus)', 'I', 5.6, 5.34),
    (64, 'S_orbital-H_Shaped', 'Orbital sulci (H-shaped sulci)', 'I,L', 12.84, 12.19),
    (65, 'S_parieto_occipital', 'Parieto-occipital sulcus (or fissure)', 'S,P,M', 17.7, 17.13),
    (66, 'S_pericallosal', 'Pericallosal sulcus (S of corpus callosum)', 'M', 10.21, 9.08),
    (67, 'S_postcentral', 'Postcentral sulcus', 'S,L,P', 21.32, 25.27),
    (68, 'S_precentral-inf-part', 'Inferior part of the precentral sulcus', 'S,A,L', 14.92, 13.58),
    (69, 'S_precentral-sup-part', 'Superior part of the precentral sulcus', 'S,L', 12.16, 12.16),
    (70, 'S_suborbital', 'Suborbital sulcus (sulcus rostrales, supraorbital sulcus)', 'M', 2.74, 5.67),
    (71, 'S_subparietal', 'Subparietal sulcus', 'M', 10.92, 9.21),
    (72, 'S_temporal_inf', 'Inferior temporal sulcus', 'L,P,I', 11.04, 13.63),
    (73, 'S_temporal_sup', 'Superior temporal sulcus (parallel sulcus)', 'S,A,L,P', 54.83, 49.45),
    (74, 'S_temporal_transverse', 'Transverse temporal sulcus', 'A,L', 2.59, 3.24),
]

ZTEXT: dict[str, tuple[str, str | None] | None] = {
    # (Destrieux 2010, 2.1.2.3: the fronto-marginal gyrus "is continuous with the orbital gyri": not one of them)
    "G_and_S_frontomargin": ("Orbital gyri (Frontomarginal gyrus and sulcus*)", "the orbital gyri, which this gyrus runs into at the edge of the orbital surface"),
    "G_and_S_occipital_inf": ("Inferior occipital gyrus and sulcus*", None),
    # (the text is Wikipedia's "Paracentral sulcus": the lobule's anterior limit, Destrieux 2010, 2.4.3)
    "G_and_S_paracentral": ("Paracentral gyrus and sulcus*", "the paracentral sulcus"),
    "G_and_S_subcentral": None,
    "G_and_S_transv_frontopol": None,
    "G_and_S_cingul-Ant": ("Cingulate gyrus and sulcus (Middle anterior part)", "the cingulate cortex"),
    "G_and_S_cingul-Mid-Ant": ("Cingulate gyrus and sulcus (Middle anterior part)", "the cingulate cortex"),
    # (the "Middle posterior part" text is Wikipedia's "Cingulate sulcus": said so, and not shown for the label that is
    # gyrus alone, which gets the text on the cingulate cortex as the anterior parts do)
    "G_and_S_cingul-Mid-Post": ("Cingulate gyrus and sulcus (Middle posterior part)", "the cingulate sulcus"),
    "G_cingul-Post-dorsal": ("Cingulate gyrus and sulcus (Middle anterior part)", "the cingulate cortex"),
    "G_cingul-Post-ventral": ("Isthmus of cingulate gyrus", None),
    "G_cuneus": ("Cuneus", None),
    "G_front_inf-Opercular": ("Opercular part of inferior frontal gyrus", None),
    "G_front_inf-Orbital": ("Orbital part of  inferior frontal gyrus", None),
    "G_front_inf-Triangul": ("Triangular part of inferior frontal gyrus", None),
    "G_front_middle": ("Middle frontal gyrus", None),
    "G_front_sup": ("Superior frontal gyrus", None),
    "G_Ins_lg_and_S_cent_ins": ("Insula", "the insula"),
    "G_insular_short": ("Insula", "the insula"),
    "G_occipital_middle": ("Lateral occipital gyrus (Middle occipital gyrus*)", None),
    "G_occipital_sup": ("Superior occipital gyri", None),
    "G_oc-temp_lat-fusifor": ("Lateral occipitotemporal gyrus", None),
    "G_oc-temp_med-Lingual": None,
    "G_oc-temp_med-Parahip": ("Parahippocampal gyrus", None),
    "G_orbital": ("Orbital gyri", None),
    "G_pariet_inf-Angular": ("Angular gyrus", None),
    "G_pariet_inf-Supramar": ("Supramarginal gyrus", None),
    "G_parietal_sup": ("Superior parietal lobule", None),
    "G_postcentral": ("Postcentral gyrus", None),
    "G_precentral": ("Precentral gyrus", None),
    "G_precuneus": ("Precuneus", None),
    "G_rectus": ("Straight gyrus (Gyrus rectus)", None),
    "G_subcallosal": ("Subcallosal area", None),
    "G_temp_sup-G_T_transv": ("Transverse temporal gyri", None),
    "G_temp_sup-Lateral": ("Superior temporal gyrus (Lateral part)", None),
    "G_temp_sup-Plan_polar": ("Superior temporal gyrus (Lateral part)", "the superior temporal gyrus"),
    "G_temp_sup-Plan_tempo": ("Superior temporal gyrus (Lateral part)", "the superior temporal gyrus"),
    "G_temporal_inf": ("Inferior temporal gyrus", None),
    "G_temporal_middle": ("Middle temporal gyrus", None),
    "Lat_Fis-ant-Horizont": None,
    "Lat_Fis-ant-Vertical": None,
    "Lat_Fis-post": None,
    "Pole_occipital": ("Occipital pole", None),
    "Pole_temporal": ("Temporal pole", None),
    "S_calcarine": ("Calcarine sulcus", None),
    "S_central": ("Central sulcus", None),
    "S_cingul-Marginalis": ("Cingulate sulcus (Marginal part*)", None),
    "S_circular_insula_ant": ("Circular sulcus of insula", None),
    "S_circular_insula_inf": ("Circular sulcus of insula", None),
    "S_circular_insula_sup": ("Circular sulcus of insula", None),
    "S_collat_transv_ant": None,
    "S_collat_transv_post": None,
    "S_front_inf": ("Inferior frontal sulcus", None),
    "S_front_middle": None,
    "S_front_sup": ("Superior frontal sulcus", None),
    "S_interm_prim-Jensen": None,
    "S_intrapariet_and_P_trans": ("Intraparietal sulcus", None),
    "S_oc_middle_and_Lunatus": ("Lunate sulcus", "the lunate sulcus"),
    "S_oc_sup_and_transversal": ("Transverse occipital sulcus", None),
    "S_occipital_ant": None,
    "S_oc-temp_lat": None,
    "S_oc-temp_med_and_Lingual": ("Collateral sulcus", None),
    "S_orbital_lateral": ("Orbital sulci (Lateral Orbital sulcus*)", None),
    # (the text Z-Anatomy ships under this name is Wikipedia's "Olfactory tract"; Destrieux 2010, 2.1.2.4: the sulcus
    # "is located just superior to the olfactory bulb and tract")
    "S_orbital_med-olfact": ("Olfactory sulcus", "the olfactory tract, which lies just below this sulcus"),
    "S_orbital-H_Shaped": ("Orbital sulci (H-shaped orbital sulci*)", None),
    "S_parieto_occipital": ("Parieto-occipital sulcus", None),
    "S_pericallosal": None,
    "S_postcentral": ("Postcentral sulcus", None),
    "S_precentral-inf-part": ("Precentral sulcus (inferior part)*", None),
    "S_precentral-sup-part": ("Precentral sulcus (Superior part)*", None),
    "S_suborbital": None,
    "S_subparietal": ("Subparietal sulcus", None),
    "S_temporal_inf": ("Inferior temporal sulcus", None),
    "S_temporal_sup": ("Superior temporal sulcus", None),
    "S_temporal_transverse": None,
}
# Corrections to a shipped text, by label: (the words as shipped, the words shown instead, why, with its source). The
# card shows the corrected text and lists each change under it (the texts are CC BY-SA: changes are indicated). Words
# shown instead as "" are left out.
# (the three occipital gyri share Wikipedia's "Occipital gyri" text: the audit's finding B-005)
_OCCIPITAL_EDITS = [
    (", and these are also known as the occipital face area", "",
     "The occipital face area is a face-selective region of the lateral occipital cortex found by functional imaging "
     "(Pitcher, Walsh and Duchaine 2011, Exp Brain Res 209:481–493; Pitcher 2014, J Neurosci 34:9173–9177), not a "
     "name for these gyri"),
    (" The transverse occipital sulcus comes down along the lateral occipital surface or the inferior occipital sulcus.", "",
     "The short transverse occipital sulcus crosses the superior occipital sulcus at right angles and reaches into the "
     "superior and middle occipital gyri (Destrieux et al. 2010, section 2.3.3)"),
]
# (the three parts of the superior temporal gyrus share Wikipedia's "Superior temporal gyrus" text: the audit's B-016)
_STG_EDITS = [
    (" (not always present or visible)", "",
     "Destrieux et al. 2010 (section 2.3.3) found the superior temporal sulcus in each of the 24 hemispheres they "
     "describe: continuous, briefly interrupted near the temporal pole, or (in 3) made of separate segments"),
]
_NO_SOURCE = "Given with no source"
ZTEXT_EDITS: dict[str, list[tuple[str, str, str]]] = {
    "G_pariet_inf-Angular": [(
        "lying mainly in the anterolateral region of parietal lobe, that lies near",
        "lying in the posterior part of the inferior parietal lobule, near",
        "The sulcus intermedius primus divides the inferior parietal lobule into the supramarginal gyrus in front and "
        "the angular gyrus behind (Destrieux et al. 2010, section 2.4.1.4)",
    ), (
        # (the audit's B-016, as are all the corrections below)
        " Its significance is in transferring visual information to Wernicke's area, in order to make meaning out of "
        "visually perceived words.", "",
        f"{_NO_SOURCE}: one account of reading stated as the gyrus's significance; the next sentence names its part in "
        "language among its other roles",
    )],
    # (the audit's finding B-003: the gyri are in front of the planum temporale, not above it)
    "G_temp_sup-G_T_transv": [(
        "are superior to and separated from the planum temporale (cortex involved in language production) by Heschl’s sulcus",
        "lie in front of the planum temporale, from which the transverse temporal (Heschl’s) sulcus separates them",
        "The transverse temporal sulcus divides the planum temporale, behind it, from the transverse temporal gyrus, in "
        "front (Destrieux et al. 2010, section 2.3.2); the planum temporale lies behind the transverse temporal gyri, the "
        "primary auditory cortex (Kiernan 2012). The words on language production had no source and are left out",
    )],
    "G_and_S_occipital_inf": _OCCIPITAL_EDITS,
    "G_occipital_middle": _OCCIPITAL_EDITS,
    "G_occipital_sup": _OCCIPITAL_EDITS,
    "G_temp_sup-Lateral": _STG_EDITS,
    "G_temp_sup-Plan_polar": _STG_EDITS,
    "G_temp_sup-Plan_tempo": _STG_EDITS,
    "G_cuneus": [(
        "is a smaller lobe in the occipital lobe of the brain",
        "is a triangular gyrus on the medial aspect of the occipital lobe",
        "Destrieux et al. 2010 (section 2.3.5) describe the cuneus on the medial aspect of the occipital lobe as a "
        "triangle limited by the calcarine sulcus, the parieto-occipital sulcus and the superior edge of the "
        "hemisphere: a gyrus, not a lobe",
    )],
    "G_front_inf-Opercular": [(
        " and may be associated with recognizing a tone of voice in spoken native languages. This expands on previous "
        "work indicating that comprehension of inflectional morpheme processing is associated with the inferior frontal "
        "gyrus.",
        ". In the left hemisphere it makes up Broca’s area with the triangular part, and it has been associated with "
        "syntax in particular.",
        "Two single findings, with no source, stood as the area's only functions. Broca's area is the pars opercularis "
        "and pars triangularis of the left inferior frontal gyrus, and the pars opercularis has been associated with "
        "syntactic functions (Bulut 2023, introduction; full text)",
    )],
    "G_front_inf-Triangul": [(
        "It may be associated with the ability to translate from a secondary or tertiary language back to one's native "
        "language.",
        "In the left hemisphere it makes up Broca’s area with the opercular part, and it has been associated with "
        "semantics in particular.",
        "A single finding, with no source, stood as the area's only function. Broca's area is the pars opercularis and "
        "pars triangularis of the left inferior frontal gyrus, and the pars triangularis has been associated with "
        "semantic functions (Bulut 2023, introduction; full text)",
    )],
    "G_front_middle": [(
        " (A gyrus is one of the prominent \"bumps\" or \"ridges\" on the surface of the human brain.) The middle "
        "frontal gyrus, like the inferior frontal gyrus and the superior frontal gyrus, is more of a region in the "
        "frontal gyrus than a true gyrus.", "",
        f"{_NO_SOURCE}, and garbled (“a region in the frontal gyrus”). Destrieux et al. 2010 (section 2.1.2.1) describe "
        "the middle frontal gyrus as a gyrus limited by the superior frontal sulcus above, the inferior frontal and "
        "lateral orbital sulci below and the precentral sulcus behind",
    )],
    "G_rectus": [(
        "; however, in males, greater activation of the straight gyrus within the medial orbitofrontal cortex while "
        "observing sexually visual pictures has been strongly linked to HSDD (hypoactive sexual desire disorder)", "",
        f"{_NO_SOURCE}: a single imaging finding",
    )],
    "G_temporal_middle": [(
        " Some studies indicate that lesions of the posterior region of the middle temporal gyrus, in the left cerebral "
        "hemisphere, may result in alexia and agraphia for kanji characters (characters of Chinese origin used in "
        "Japanese writing). The left middle temporal gyrus is also activated during poem composition.", "",
        f"{_NO_SOURCE}: single findings",
    )],
    "S_central": [
        (" in the brains of vertebrates", "", f"{_NO_SOURCE}; these cards describe the human brain"),
        (" It is sometimes confused with the longitudinal fissure.", "", _NO_SOURCE),
    ],
    # (the sentence before these, on the lunate sulcus as the border of V1 and V2, waits for a clinician's review)
    "S_oc_middle_and_Lunatus": [(
        " The evolutionary expansion of the frontal areas of the lunate sulcus would have caused a shift in the "
        "particular location of the fissure. It has been hypothesized that evolutionary pressures resulted in the human "
        "brain undergoing internal reorganization to develop the capability of human language.", "",
        f"{_NO_SOURCE}, and garbled: remarks on evolution",
    )],
    "S_parieto_occipital": [(
        " The lateral part of the parieto-occipital sulcus is situated about 5 cm in front of the occipital pole of the "
        "hemisphere, and measures about 1.25 cm. in length.", "",
        f"{_NO_SOURCE}: measurements",
    )],
    "S_temporal_inf": [(
        "The inferior surface of the temporal lobe is concave, and is continuous posteriorly with the tentorial surface "
        "of the occipital lobe. It is traversed by the inferior temporal sulcus, which extends from near the occipital "
        "pole behind, to within a short distance of the temporal pole in front, but is frequently subdivided by bridging "
        "gyri.",
        "The inferior temporal sulcus runs from the temporal pole towards the occipital pole, in line with the inferior "
        "occipital sulcus, at the limit between the lateral and ventral aspects of the temporal lobe. It separates the "
        "middle temporal gyrus, on the lateral aspect, from the inferior temporal gyrus, on the ventral aspect, and is "
        "broken into segments (2 to 7 in Destrieux et al. 2010).",
        "The shipped text put the sulcus on the inferior surface of the temporal lobe. Destrieux et al. 2010 (sections "
        "2.3.3 and 2.3.4) put it, in line with the inferior occipital sulcus, at the limit between the lateral and "
        "ventral aspects, between the middle and inferior temporal gyri, and found it made of 2 to 7 segments",
    )],
}
# (the audit's B-016: the frontal lobe's text)
ZTEXT_LOBE_EDITS: dict[str, list[tuple[str, str, str]]] = {
    "frontal": [(" The front part of the frontal cortex is covered by the prefrontal cortex.", "",
                 f"{_NO_SOURCE}, and garbled")],
}
# Texts written for this atlas where Z-Anatomy ships none (the site audit's B-014), each from the full text of Destrieux
# et al. 2010 (PMC2937159; reference destrieux2010), by label or lobe: (the text, the sections it comes from). The card
# says so and links the paper.
OWN_TEXTS: dict[str, tuple[str, str]] = {
    "G_and_S_subcentral": (
        "The subcentral gyrus (central operculum) joins the lower ends of the precentral and postcentral gyri, turning "
        "around the lower end of the central sulcus on the lateral aspect of the hemisphere. The superior segment of the "
        "circular sulcus of the insula limits it below, and the anterior and posterior subcentral sulci in front and "
        "behind; these small sulci vary, and the label includes them.", "sections 2.1.2.1 and 2.4.3"),
    "G_and_S_transv_frontopol": (
        "At the frontal pole the superior, middle and inferior frontal gyri give way to transverse gyri and sulci. The "
        "transverse frontopolar gyri lie between the transverse frontopolar sulci above and the fronto-marginal sulcus "
        "below; there are one or two transverse frontopolar sulci, running at right angles to the superior frontal "
        "sulcus. Because their number varies, the sulci and gyri share this label.", "section 2.1.2.3"),
    "G_oc-temp_med-Lingual": (
        "The lingual gyrus is the occipital part of the medial occipito-temporal gyrus; the parahippocampal gyrus, its "
        "temporal part, continues it forwards. The calcarine sulcus lies above it, and behind the parieto-occipital sulcus "
        "separates it from the cuneus; the medial occipito-temporal (collateral) sulcus separates it from the fusiform "
        "gyrus, and the lingual sulcus, a branch of the collateral sulcus, runs into it.", "sections 2.3.4 and 2.3.5"),
    "Lat_Fis-ant-Horizont": (
        "The horizontal ramus of the lateral sulcus arises near the junction of the anterior and superior segments of "
        "the circular sulcus of the insula and runs forwards in the inferior frontal gyrus, between its triangular part "
        "above and its orbital part below. It continued the superior segment of the circular sulcus in 23 of 24 "
        "hemispheres.", "sections 2.1.2.1 and 2.2"),
    "Lat_Fis-ant-Vertical": (
        "The vertical ramus of the lateral sulcus arises, with the horizontal ramus, near the junction of the anterior "
        "and superior segments of the circular sulcus of the insula and ascends in the inferior frontal gyrus, between "
        "its opercular part behind and its triangular part in front. On the inflated surface it joined the circular "
        "sulcus in 15 of 24 hemispheres; in the others it ran the same course on its own.", "sections 2.1.2.1 and 2.2"),
    "Lat_Fis-post": (
        "The posterior segment of the lateral sulcus begins where the superior and inferior segments of the circular "
        "sulcus of the insula meet behind the insula, and curves upwards into the inferior parietal lobule, where the "
        "supramarginal gyrus curves around its end. It is the medial limit of the planum temporale.",
        "sections 2.2, 2.3.2 and 2.4.1.4"),
    "S_collat_transv_ant": (
        "Close to the temporal and occipital poles the medial occipito-temporal (collateral) sulcus gives off the "
        "anterior and posterior transverse collateral sulci. The anterior one limits the fusiform gyrus in front and "
        "laterally.", "section 2.3.4"),
    "S_collat_transv_post": (
        "Close to the temporal and occipital poles the medial occipito-temporal (collateral) sulcus gives off the "
        "anterior and posterior transverse collateral sulci. The posterior one limits the fusiform gyrus behind and "
        "laterally; a line from its medial end to the posterior end of the calcarine sulcus separates the lingual gyrus "
        "from the occipital pole.", "section 2.3.4"),
    "S_front_middle": (
        "The middle frontal sulcus runs within the middle frontal gyrus. It lies further forward than the superior and "
        "inferior frontal sulci and reaches the frontal pole, but does not join the precentral sulcus. Discontinuous and "
        "of variable length, it was present in 23 of 24 hemispheres; it may join the superior or inferior frontal "
        "sulcus, and is sometimes hard to tell from them.", "section 2.1.2.1"),
    "S_interm_prim-Jensen": (
        "The sulcus intermedius primus (of Jensen) is a small sulcus that runs down from the intraparietal sulcus, at "
        "right angles to it, towards the temporal lobe, which it does not reach. It divides the inferior parietal "
        "lobule into the supramarginal gyrus in front and the angular gyrus behind.", "section 2.4.1.4"),
    "S_occipital_ant": (
        "The temporo-occipital incisure (preoccipital notch) is a small groove at the inferior edge of the hemisphere, "
        "sometimes continued on the lateral aspect by the anterior occipital sulcus; the label holds both. With the "
        "parieto-occipital sulcus it is one of the two sulci that partly limit the occipital lobe. It may join the "
        "superior temporal, inferior temporal, lateral occipito-temporal, inferior occipital or middle occipital "
        "sulcus.", "section 2.3.1"),
    "S_oc-temp_lat": (
        "The lateral occipito-temporal sulcus runs from front to back on the ventral aspect of the occipital and "
        "temporal lobes, between the fusiform gyrus medially and the inferior temporal and inferior occipital gyri "
        "laterally. It is discontinuous and hard to tell from its neighbours; it begins near the inferior occipital "
        "gyrus and stays in the occipital lobe and the back of the temporal lobe, short of the temporal pole.",
        "section 2.3.4"),
    "S_pericallosal": (
        "The pericallosal sulcus (sulcus of the corpus callosum) separates the cingulate gyrus from the corpus "
        "callosum.", "section 2.5.2"),
    "S_suborbital": (
        "The suborbital sulcus is a small sulcus on the medial aspect of the frontal lobe, running towards the frontal "
        "pole parallel to the anterior part of the cingulate sulcus. It lies above and medial to the gyrus rectus. A "
        "smaller, inconstant groove sometimes runs above it (the superior suborbital sulcus); it is included in the "
        "label of the anterior cingulate gyrus and sulcus.", "section 2.1.2.2"),
    "S_temporal_transverse": (
        "The transverse temporal sulcus, on the superior aspect of the temporal lobe, divides the transverse temporal "
        "(Heschl’s) gyrus, which holds the primary auditory cortex, in front from the planum temporale behind. It "
        "starts at the posterior segment of the lateral sulcus and runs forwards and laterally to the lateral aspect of "
        "the temporal lobe.", "section 2.3.2"),
}
OWN_LOBE_TEXTS: dict[str, tuple[str, str]] = {
    "occipital": (
        "The occipital lobe is limited by sulci only in part: on the medial aspect the parieto-occipital sulcus "
        "separates it from the parietal lobe, and at the inferior edge of the hemisphere the temporo-occipital incisure "
        "(preoccipital notch) marks its limit. Elsewhere its limits are lines drawn between such landmarks, and on the "
        "ventral aspect its sulci and gyri continue into those of the temporal lobe. On the lateral aspect the superior "
        "occipital sulcus divides the superior from the middle occipital gyrus. On the medial aspect the calcarine "
        "sulcus runs back to the occipital pole, with the cuneus above it and the lingual gyrus below.",
        "sections 2.3.1 and 2.3.3 to 2.3.5"),
}
OWN_TEXT_REF = "destrieux2010"
# lobe-level texts for the group cards
ZTEXT_LOBES = {"frontal": "Frontal lobe", "parietal": "Parietal lobe", "temporal": "Temporal lobe",
               "occipital": None, "cingulate": "Limbic lobe", "insula": "Insula"}
# what a lobe's text is about where that is not the lobe the card is named for (the audit's B-014: the cingulate cortex's
# card shows the text on the limbic lobe)
ZTEXT_LOBE_SCOPE = {"cingulate": "the limbic lobe"}

LOBES = ["frontal", "parietal", "temporal", "occipital", "cingulate", "insula"]
LOBE_NAME = {"frontal": "Frontal lobe", "parietal": "Parietal lobe", "temporal": "Temporal lobe",
             "occipital": "Occipital lobe", "cingulate": "Cingulate cortex", "insula": "Insula"}
DK_LOBE = {
    **{r: "temporal" for r in ["entorhinal", "parahippocampal", "temporalpole", "fusiform", "superiortemporal",
                               "middletemporal", "inferiortemporal", "transversetemporal", "bankssts"]},
    **{r: "frontal" for r in ["superiorfrontal", "rostralmiddlefrontal", "caudalmiddlefrontal", "parsopercularis",
                              "parstriangularis", "parsorbitalis", "lateralorbitofrontal", "medialorbitofrontal",
                              "frontalpole", "precentral", "paracentral"]},
    **{r: "parietal" for r in ["postcentral", "supramarginal", "superiorparietal", "inferiorparietal", "precuneus"]},
    **{r: "occipital" for r in ["lingual", "pericalcarine", "cuneus", "lateraloccipital"]},
    **{r: "cingulate" for r in ["rostralanteriorcingulate", "caudalanteriorcingulate", "posteriorcingulate", "isthmuscingulate"]},
    "insula": "insula",
}
# labels whose Destrieux long name places them in the cingulate gyrus, the insula's circular sulcus or the occipital
# lobe: their colour follows that name (the measured Desikan-Killiany shares are still listed). The superior occipital
# gyrus and sulcus lie mostly in Desikan-Killiany's superior and inferior parietal regions, which reach further back
# than Destrieux's parietal lobe: Destrieux 2010 (section 2.3.3) defines both on the lateral aspect of the occipital lobe
NAMED_LOBE = {
    "G_and_S_cingul-Ant": "cingulate", "G_and_S_cingul-Mid-Ant": "cingulate", "G_and_S_cingul-Mid-Post": "cingulate",
    "G_cingul-Post-dorsal": "cingulate", "G_cingul-Post-ventral": "cingulate",
    "S_circular_insula_ant": "insula", "S_circular_insula_inf": "insula", "S_circular_insula_sup": "insula",
    "G_occipital_sup": "occipital", "S_oc_sup_and_transversal": "occipital",
}
# the insular cortex and its circular sulcus (Destrieux labels); the insular view removes what lies lateral to them
INSULA_LABELS = ["G_insular_short", "G_Ins_lg_and_S_cent_ins", "S_circular_insula_ant", "S_circular_insula_inf", "S_circular_insula_sup"]
