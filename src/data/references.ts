import type { Reference, Topic } from './schema';
import citations from '../../pipeline/sources/citations.json';

/**
 * Literature references, ported verbatim from the `R` object of the attached
 * dbs-targets.html (g -> topic, s -> shortLabel, t -> citation, u -> url).
 */
const CONTENT: Reference[] = [
  { id: 'hollunder2024', topic: 'net', shortLabel: 'Hollunder 2024', citation: 'Hollunder B, Ostrem JL, Sahin IA, Rajamani N, et al., Li N, Horn A. Mapping dysfunctional circuits in the frontal cortex using deep brain stimulation. Nat Neurosci. 2024;27(3):573–586. doi:10.1038/s41593-024-01570-1.', url: 'https://sfb-retune.de/?p=48139' },
  { id: 'goede2025', topic: 'net', shortLabel: 'Goede 2025', citation: 'Goede LL, Al-Fatly B, Li N, et al., Joutsa J, et al., Horn A. Convergent mapping of a tremor treatment network. Nat Commun. 2025;16:4772. doi:10.1038/s41467-025-60089-6.', url: 'https://sfb-retune.de/?p=48639' },
  { id: 'cns2018', topic: 'pd', shortLabel: 'CNS guideline 2018', citation: "Congress of Neurological Surgeons. Systematic review and evidence-based guideline on STN and GPi DBS for Parkinson's disease: executive summary. Neurosurgery. 2018;82(6):753–756.", url: 'https://scholarlycommons.henryford.com/neurosurgery_articles/106' },
  { id: 'meta2014', topic: 'pd', shortLabel: 'Meta-analysis 2014', citation: "Globus pallidus vs subthalamic nucleus deep brain stimulation for Parkinson's disease: a meta-analysis. Neurology. 2014.", url: 'https://www.epistemonikos.org/en/documents/a511b15399aa5fbcf4e07d7fcc4e907d26913388' },
  { id: 'review2013', topic: 'pd', shortLabel: 'Review 2013', citation: "Review of STN and GPi deep brain stimulation for Parkinson's disease. 2013. PMID 24210797.", url: 'https://pubmed.ncbi.nlm.nih.gov/24210797' },
  { id: 'wong', topic: 'pd', shortLabel: 'Wong et al.', citation: 'Wong JK, Cauraugh JH, Ho KWD, et al., Okun MS. STN vs. GPi deep brain stimulation for tremor suppression in Parkinson disease: a systematic review and meta-analysis.', url: 'https://experts.umn.edu/en/publications/stn-vs-gpi-deep-brain-stimulation-for-tremor-suppression-in-parki/' },
  { id: 'williams2014', topic: 'pd', shortLabel: 'Williams 2014', citation: 'Williams NR, et al. Subthalamic nucleus versus globus pallidus internus deep brain stimulation: translating the rematch into clinical practice. Mov Disord Clin Pract. 2014.', url: 'https://aemreview.stanfordhealthcare.org/publications/406/406050.html' },
  { id: 'akram2017', topic: 'pd', shortLabel: 'Akram 2017', citation: "Akram H, Sotiropoulos SN, Jbabdi S, Georgiev D, Mahlknecht P, et al. Subthalamic deep brain stimulation sweet spots and hyperdirect cortical connectivity in Parkinson's disease. NeuroImage. 2017.", url: 'https://www.sciencedirect.com/science/article/abs/pii/S1053811917305803' },
  { id: 'rajamani2024', topic: 'pd', shortLabel: 'Rajamani 2024', citation: "Rajamani N, Friedrich H, Butenko K, Dembek T, et al., Horn A. Deep brain stimulation of symptom-specific networks in Parkinson's disease. Nat Commun. 2024;15:4662. doi:10.1038/s41467-024-48731-1. Author correction: doi:10.1038/s41467-024-51394-7.", url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11143329' },
  { id: 'npj2026', topic: 'pd', shortLabel: "npj Parkinson's Dis 2026", citation: "Targeting based on patient-specific 7 Tesla MRI connectivity analysis improves deep brain stimulation for Parkinson's disease. npj Parkinsons Dis. 2026.", url: 'https://www.nature.com/articles/s41531-026-01414-8' },
  { id: 'peeters2024', topic: 'pd', shortLabel: 'Peeters 2024', citation: "Peeters J, et al. Electrophysiological sweet spot mapping in deep brain stimulation for Parkinson's disease patients. Brain Stimul. 2024;17(4):794–801. doi:10.1016/j.brs.2024.05.013.", url: 'https://pubmed.ncbi.nlm.nih.gov/38821395' },
  { id: 'weiss2013', topic: 'pd', shortLabel: 'Weiss 2013', citation: "Weiss D, et al. Combined subthalamic and nigral stimulation for axial symptoms in Parkinson's disease: a randomized controlled trial. Brain. 2013;136(7):2098.", url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3692032' },
  { id: 'artusi2025', topic: 'pd', shortLabel: 'Artusi 2025', citation: "Artusi CA, et al. Subthalamic and nigral stimulation for freezing of gait in Parkinson's disease: randomized pilot trial. 2025.", url: 'https://iris.unito.it/handle/2318/2089950' },
  { id: 'mds2024', topic: 'pd', shortLabel: 'Crossover study 2024', citation: "Short-term effects of combined STN–SNr DBS on gait. International Congress of Parkinson's Disease and Movement Disorders, 2024 (abstract).", url: 'https://www.mdsabstracts.org/?p=23325' },
  { id: 'brainsci2025', topic: 'pd', shortLabel: 'Brain Sci 2025', citation: "Functional and structural connectivity correlates of axial symptom outcomes after pallidal deep brain stimulation in Parkinson's disease. Brain Sci. 2025;15(11):1245.", url: 'https://www.mdpi.com/2076-3425/15/11/1245' },
  { id: 'sid', topic: 'pd', shortLabel: 'MDS abstract', citation: "The subthalamic fasciculus and connectivity profiling of stimulation-induced dyskinesia following pallidal DBS in Parkinson's disease (abstract).", url: 'https://www.mdsabstracts.org/abstract/the-subthalamic-fasciculus-and-connectivity-profiling-of-stimulation-induced-dyskinesia-following-pallidal-dbs-in-parkinsons-disease/' },
  { id: 'adapt', topic: 'pd', shortLabel: 'ADAPT-PD 2025', citation: 'ADAPT-PD trial results, JAMA Neurol. 2025 (Medtronic announcement).', url: 'https://news.medtronic.com/Groundbreaking-study-published-in-the-Journal-of-the-American-Medical-Association-JAMA-Neurology-demonstrates-effectiveness-of-Medtronic-BrainSense-TM-Adaptive-deep-brain-stimulation-for-people-with-Parkinsons' },
  { id: 'fda2025', topic: 'pd', shortLabel: 'FDA approval 2025', citation: 'FDA approval of BrainSense adaptive DBS, February 2025.', url: 'https://www.massdevice.com/medtronic-fda-nod-adaptive-dbs-parkinsons/' },
  { id: 'fmri2026', topic: 'pd', shortLabel: 'fMRI study 2026', citation: 'The pattern of fMRI activation with STN DBS reveals symptom-specific networks. 2026.', url: 'https://pubmed.ncbi.nlm.nih.gov/42049768/' },
  { id: 'akram2018', topic: 'tremor', shortLabel: 'Akram 2018', citation: 'Akram H, et al. Connectivity derived thalamic segmentation in deep brain stimulation for tremor. NeuroImage Clin. 2018.', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5790021/' },
  { id: 'jns2021', topic: 'tremor', shortLabel: 'J Neurosurg 2021', citation: 'DBS targeting for essential tremor using intersectional dentato-rubro-thalamic tractography and direct proton density visualization of the VIM: technical note on 2 cases. J Neurosurg. 2021;135(3):806.', url: 'https://pubmed.ncbi.nlm.nih.gov/33450737/' },
  { id: 'nma2025', topic: 'tremor', shortLabel: 'Network meta-analysis 2025', citation: 'Comparative efficacy of PSA and VIM deep brain stimulation in essential tremor: a network and multilevel meta-analysis. Neurosurg Rev. 2025.', url: 'https://link.springer.com/article/10.1007/s10143-025-03898-z' },
  { id: 'barbe2018', topic: 'tremor', shortLabel: 'Barbe 2018', citation: 'Barbe MT, et al. DBS of the PSA and the VIM in essential tremor: a randomized, double-blind, crossover trial. Neurology. 2018.', url: 'https://www.researchgate.net/publication/326180808_DBS_of_the_PSA_and_the_VIM_in_essential_tremor_A_randomized_double-blind_crossover_trial' },
  { id: 'poster', topic: 'tremor', shortLabel: 'DRTT distance poster', citation: 'PSA and VIM DBS efficiency in essential tremor depends on distance to the dentatorubrothalamic tract (poster).', url: 'https://www.researchgate.net/publication/335568247_PSA_and_VIM_DBS_efficieny_in_essential_tremor_depends_on_distance_to_the_dentatorubrothalamic_tract' },
  { id: 'barrow', topic: 'tremor', shortLabel: 'Barrow series', citation: 'Direct versus indirect VIM targeting in 230 patients. Barrow Neurological Institute.', url: 'https://scholar.barrowneuro.org/neurosurgery/2054' },
  { id: 'mrgfus2025', topic: 'tremor', shortLabel: 'MRgFUS preprint 2025', citation: 'Direct targeting for focused ultrasound thalamotomy in the treatment of movement disorders: a retrospective cohort study. medRxiv preprint, 2025.', url: 'https://www.medrxiv.org/content/10.1101/2025.09.03.25335065.full.pdf' },
  { id: 'vimma2026', topic: 'tremor', shortLabel: 'Vim meta-analysis 2026', citation: 'Tremor improvement despite heterogeneous ventral intermediate nucleus targeting in deep brain stimulation: a systematic review and meta-analysis. medRxiv preprint, 2026.', url: 'https://www.medrxiv.org/content/10.64898/2026.04.07.26350347.full.pdf' },
  { id: 'nct', topic: 'tremor', shortLabel: 'NCT05968976', citation: 'Multicentre RCT of awake versus asleep tractography-based DBS for essential tremor. NCT05968976.', url: 'https://clinicaltrials.gov/study/NCT05968976' },
  { id: 'wang2020', topic: 'tremor', shortLabel: 'Wang 2020', citation: 'Wang KL, Wong JK, Eisinger RS, et al., Ramirez-Zamora A. Therapeutic advances in the treatment of Holmes tremor: systematic review. Neuromodulation. 2020.', url: 'https://neurology.ufl.edu/2020/07/31/therapeutic-advances-in-the-treatment-of-holmes-tremor-systematic-review/' },
  { id: 'kamo2023', topic: 'tremor', shortLabel: 'Kamo 2023', citation: 'Kamo H, Oyama G, Ito M, Iwamuro H, Umemura A, Hattori N. Deep brain stimulation in posterior subthalamic area for Holmes tremor: case reports with review of the literature. Front Neurol. 2023. doi:10.3389/fneur.2023.1139477.', url: 'https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2023.1139477/full' },
  { id: 'holmesgpi', topic: 'tremor', shortLabel: 'Pallidal DBS case series', citation: 'Clinical outcome and characterization of local field potentials in Holmes tremor treated with pallidal deep brain stimulation.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4929492' },
  { id: 'reich2019', topic: 'dyst', shortLabel: 'Reich 2019', citation: 'Reich MM, Horn A, Lange F, et al. Probabilistic mapping of the antidystonic effect of pallidal neurostimulation: a multicentre imaging study. Brain. 2019;142(5):1386–1398. doi:10.1093/brain/awz046.', url: 'https://davidmarsdenaward.org/assets/papers/2021_reich.pdf' },
  { id: 'horn2022', topic: 'dyst', shortLabel: 'Horn 2022', citation: 'Horn A, et al. Optimal deep brain stimulation sites and networks for cervical vs. generalized dystonia. Proc Natl Acad Sci U S A. 2022;119(14):e2114985119. doi:10.1073/pnas.2114985119.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC9168456' },
  { id: 'thieme2021', topic: 'dyst', shortLabel: 'Somatotopy study 2021', citation: 'Somatotopy of the posteroventral GPi in dystonia DBS. Thieme, 2021. doi:10.1055/s-0041-1735856.', url: 'https://www.thieme-connect.com/products/ejournals/pdf/10.1055/s-0041-1735856.pdf' },
  { id: 'cd2025', topic: 'dyst', shortLabel: 'Cervical dystonia study 2025', citation: 'Optimal stimulation sites and connectomes for GPi- and STN-DBS in cervical dystonia. 2025.', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12358681/' },
  { id: 'horisawa2019', topic: 'dyst', shortLabel: 'Horisawa 2019', citation: 'Horisawa S, Ochiai T, Goto S, et al., Taira T. Safety and long-term efficacy of ventro-oral thalamotomy for focal hand dystonia. Neurology. 2019.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC6345121' },
  { id: 'shimizu2018', topic: 'dyst', shortLabel: 'Shimizu 2018', citation: "Shimizu T, Maruo T, Miura S, Kishima H, Ushio Y, Goto S. Stereotactic lesioning of the thalamic Vo nucleus for the treatment of writer's cramp (focal hand dystonia). Front Neurol. 2018;9:1008. doi:10.3389/fneur.2018.01008.", url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6275197/' },
  { id: 'bmjno', topic: 'dyst', shortLabel: 'BMJ Neurology Open', citation: 'MRgFUS thalamotomy for focal hand dystonia. BMJ Neurology Open.', url: 'https://neurologyopen.bmj.com/content/5/2/e000522' },
  { id: 'vocoords', topic: 'dyst', shortLabel: 'Task-specific dystonia series', citation: "Surgical interventions for task-specific dystonia (writer's dystonia).", url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5586136' },
  { id: 'hyper2015', topic: 'dyst', shortLabel: 'Hyperkinetic review 2015', citation: 'Uncommon applications of deep brain stimulation in hyperkinetic movement disorders. Tremor Other Hyperkinet Mov. 2015.', url: 'https://tremorjournal.org/articles/265' },
  { id: 'tardiveov', topic: 'dyst', shortLabel: 'Tardive overview', citation: 'Deep brain stimulation for intractable tardive dystonia: literature overview. Neurol Neurochir Pol.', url: 'https://journals.viamedica.pl/neurologia_neurochirurgia_polska/article/view/61123' },
  { id: 'macerollo2018', topic: 'dyst', shortLabel: 'Macerollo 2018', citation: 'Macerollo A, Deuschl G. Deep brain stimulation for tardive syndromes: systematic review and meta-analysis. J Neurol Sci. 2018;389:55–60.', url: 'https://livrepository.liverpool.ac.uk/id/eprint/3089197' },
  { id: 'johnson2019', topic: 'ts', shortLabel: 'Johnson 2019', citation: 'Johnson KA, Fletcher PT, Servello D, Bona A, Porta M, et al. Image-based analysis and long-term clinical outcomes of deep brain stimulation for Tourette syndrome: a multisite study. J Neurol Neurosurg Psychiatry. 2019;90:1078.', url: 'https://escholarship.org/uc/item/12j695d1' },
  { id: 'johnson2020', topic: 'ts', shortLabel: 'Johnson 2020', citation: 'Johnson KA, Duffley G, et al. Structural connectivity predicts clinical outcomes of deep brain stimulation for Tourette syndrome. Brain. 2020. doi:10.1093/brain/awaa188.', url: 'https://www.omicsdi.org/dataset/biostudies-literature/S-EPMC7447520' },
  { id: 'johnson2021', topic: 'ts', shortLabel: 'Johnson, pallidal pathways', citation: 'Johnson KA, Duffley G, Foltynie T, Hariz M, Zrinzo L, et al. Basal ganglia pathways associated with therapeutic pallidal deep brain stimulation for Tourette syndrome. Biol Psychiatry Cogn Neurosci Neuroimaging.', url: 'https://discovery-pp.ucl.ac.uk/10121391/1/1-s2.0-S2451902220303475-main.pdf' },
  { id: 'protocol2025', topic: 'img', shortLabel: 'MRI protocol study 2025', citation: 'Toward a standard preoperative MRI protocol for functional neurosurgery. Imaging Neurosci. 2025. doi:10.1162/IMAG.a.52.', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12319828/' },
  { id: 'sudhyadhom2009', topic: 'img', shortLabel: 'Sudhyadhom 2009', citation: 'Sudhyadhom A, et al. A high resolution and high contrast MRI for differentiation of subcortical structures for DBS targeting: the Fast Gray Matter Acquisition T1 Inversion Recovery (FGATIR). NeuroImage. 2009.', url: 'https://www.researchgate.net/publication/24273989_A_high_resolution_and_high_contrast_MRI_for_differentiation_of_subcortical_structures_for_DBS_targeting_The_Fast_Gray_Matter_Acquisition_T1_Inversion_Recovery_FGATIR' },
  { id: 'fgatir7t', topic: 'img', shortLabel: 'NeuroImage 2022', citation: 'Optimization of fast gray matter acquisition T1 inversion recovery (FGATIR) on 7T MRI for deep brain stimulation targeting. NeuroImage. 2022.', url: 'https://www.sciencedirect.com/science/article/pii/S1053811922001720' },
  { id: 'mdeft', topic: 'img', shortLabel: 'MDEFT study', citation: 'Using MDEFT MRI sequences to target the GPi in DBS surgery.', url: 'https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4569189/' },
  { id: 'imgreview2025', topic: 'img', shortLabel: 'Imaging review 2025', citation: 'Neuroimaging in deep brain stimulation: bridging technical progress with clinical practice. 2025.', url: 'https://www.sciencedirect.com/science/article/pii/S2949669125000077' },
  { id: 'calgary', topic: 'img', shortLabel: 'Calgary teaching slides', citation: 'University of Calgary. Surgery for movement disorders (teaching slides).', url: 'https://cumming.ucalgary.ca/sites/default/files/teams/122/education/neurosurgery/fn2-pd-surgery-for-movement-disorders.pdf' },
  { id: 'stnanat2025', topic: 'img', shortLabel: 'STN anatomy study 2025', citation: "Anatomical factors influencing STN localization in Parkinson's disease patients undergoing DBS. 2025.", url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC12021997' },
];

/**
 * Citations for the atlases and datasets the geometry is built from. These
 * are not part of the attached content; each string is the Crossref record
 * for the DOI (pipeline/sources/citations.json).
 */
const DATASET_LABELS: Record<string, string> = {
  leaddbs3: 'Neudorfer 2023 (Lead-DBS)',
  ewert2018: 'Ewert 2018 (DISTAL)',
  pauli2018: 'Pauli 2018 (CIT168)',
  morel1997: 'Morel 1997 (thalamus atlas)',
  krauth2010: 'Krauth 2010 (Morel atlas, 3D)',
  lau2020: 'Lau 2020 (zona incerta)',
  snijders2016: 'Snijders 2016 (PPN)',
  diedrichsen2006: 'Diedrichsen 2006 (SUIT)',
  diedrichsen2009: 'Diedrichsen 2009 (cerebellar atlas)',
  mayka2006: 'Mayka 2006 (HMAT)',
  desikan2006: 'Desikan 2006 (cortical labels)',
  klein2012: 'Klein 2012 (Mindboggle-101)',
  middlebrooks2020: 'Middlebrooks 2020 (DBS tractography atlas)',
  meola2016: 'Meola 2016 (brainstem tracts)',
  elias2021: 'Elias 2021 (TOR-PSM maps)',
  petersen2019: 'Petersen 2019 (pathway atlas)',
  fonov2011: 'Fonov 2011 (ICBM 2009 templates)',
};

const DATASET_REFS: Reference[] = Object.entries(citations as Record<string, { citation: string; url: string }>).map(
  ([id, c]) => ({ id, topic: 'atlas' as Topic, shortLabel: DATASET_LABELS[id] ?? id, citation: c.citation, url: c.url }),
);

export const REFERENCES: Reference[] = [...CONTENT, ...DATASET_REFS];
export const CONTENT_REFERENCE_IDS = CONTENT.map((r) => r.id);

export const TOPICS: [Topic | 'all', string][] = [
  ['all', 'All'], ['net', 'Networks'], ['pd', "Parkinson's"], ['tremor', 'Tremor'], ['dyst', 'Dystonia'],
  ['ts', 'Tourette'], ['img', 'Imaging'], ['atlas', 'Atlases and datasets'],
];
