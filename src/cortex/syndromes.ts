import type { CameraPreset } from '../data/schema';
import type { Hemi } from '../state';

/**
 * Syndromes as a way into the cortex (module plan, Part A, addition 1): pick a classic syndrome of cognitive neurology and
 * the cortex usually tied to it lights up, with a card on what the syndrome is, which areas and tracts it is tied to, and
 * how firm that tie is. Every sentence comes from a paper read in full text (SYN_REFS); the areas are drawn as the
 * Destrieux labels nearest to what the sources name, an approximation the card says it is. The owner reads every card.
 */

export type SynGroupId = 'aphasia' | 'attention' | 'visual';
export const SYN_GROUPS: { id: SynGroupId; name: string }[] = [
  { id: 'aphasia', name: 'Aphasias and alexia' },
  { id: 'attention', name: 'Attention and praxis' },
  { id: 'visual', name: 'Vision' },
];

/** a sentence of a card and the papers it rests on */
export interface Claim { text: string; refIds: string[] }

export interface Syndrome {
  id: string;
  name: string;
  group: SynGroupId;
  /** the hemisphere the sources tie it to ('both': bilateral, or either side) */
  side: Hemi;
  /** the camera it opens with */
  camera: CameraPreset;
  /** the Destrieux labels drawn for it, and why each (from the sources' wording) */
  labels: { id: string; why: string }[];
  /** HMAT motor areas drawn for it (the Function selector's, vertex by vertex: Mayka 2006), and why each; where the sources
   * name an area HMAT draws, such as the supplementary motor area, it is drawn rather than a gyrus approximating it */
  fns?: { id: string; why: string }[];
  /** white-matter tracts the sources tie it to, by the white-matter section's ids and names (a unit test holds them to it) */
  tracts: { id: string; name: string }[];
  /** what the syndrome is */
  signs: Claim[];
  /** where: the cortex (and tracts, deep structures) usually involved */
  areas: Claim[];
  /** how firm the anatomical tie is, where the sources say */
  firmness: Claim[];
}

/** the syndrome cards' sources, each read in open full text (short: the label shown, where the id does not spell the
 * surname as printed) */
export const SYN_REFS: Record<string, { citation: string; url: string; short?: string }> = {
  // aphasias and alexia
  osullivan2019: { short: 'O’Sullivan 2019', citation: 'O’Sullivan M, Brownsett S, Copland D. Language and language disorders: neuroscience to clinical practice. Pract Neurol. 2019;19(5):380-8. doi:10.1136/practneurol-2018-001961.', url: 'https://doi.org/10.1136/practneurol-2018-001961' },
  pracar2025: { citation: 'Pracar AL, Biondo N, Dronkers NF, Ivanova MV. The neuroanatomy of Broca’s aphasia. Front Lang Sci. 2025;4:1496209. doi:10.3389/flang.2025.1496209.', url: 'https://doi.org/10.3389/flang.2025.1496209' },
  gajardovidal2021: { short: 'Gajardo-Vidal 2021', citation: 'Gajardo-Vidal A, Lorca-Puls DL, PLORAS Team, Warner H, Pshdary B, Crinion JT, et al. Damage to Broca’s area does not contribute to long-term speech production outcome after stroke. Brain. 2021;144(3):817-32. doi:10.1093/brain/awaa460.', url: 'https://doi.org/10.1093/brain/awaa460' },
  fridriksson2018: { citation: 'Fridriksson J, den Ouden DB, Hillis AE, Hickok G, Rorden C, Basilakos A, et al. Anatomy of aphasia revisited. Brain. 2018;141(3):848-62. doi:10.1093/brain/awx363.', url: 'https://doi.org/10.1093/brain/awx363' },
  robson2014: { citation: 'Robson H, Zahn R, Keidel JL, Binney RJ, Sage K, Lambon Ralph MA. The anterior temporal lobes support residual comprehension in Wernicke’s aphasia. Brain. 2014;137(Pt 3):931-43. doi:10.1093/brain/awt373.', url: 'https://doi.org/10.1093/brain/awt373' },
  binder2015: { citation: 'Binder JR. The Wernicke area: modern evidence and a reinterpretation. Neurology. 2015;85(24):2170-5. doi:10.1212/WNL.0000000000002219.', url: 'https://doi.org/10.1212/WNL.0000000000002219' },
  buchsbaum2011: { citation: 'Buchsbaum BR, Baldo J, Okada K, Berman KF, Dronkers N, D’Esposito M, et al. Conduction aphasia, sensory-motor integration, and phonological short-term memory – an aggregate analysis of lesion and fMRI data. Brain Lang. 2011;119(3):119-28. doi:10.1016/j.bandl.2010.12.001.', url: 'https://doi.org/10.1016/j.bandl.2010.12.001' },
  canas2018: { short: 'Cañas 2018', citation: 'Cañas A, Juncadella M, Lau R, Gabarrós A, Hernández M. Working memory deficits after lesions involving the supplementary motor area. Front Psychol. 2018;9:765. doi:10.3389/fpsyg.2018.00765.', url: 'https://doi.org/10.3389/fpsyg.2018.00765' },
  lacorte2021: { short: 'La Corte 2021', citation: 'La Corte E, Eldahaby D, Greco E, Aquino D, Bertolini G, Levi V, et al. The frontal aslant tract: a systematic review for neurosurgical applications. Front Neurol. 2021;12:641586. doi:10.3389/fneur.2021.641586.', url: 'https://doi.org/10.3389/fneur.2021.641586' },
  starrfelt2013: { citation: 'Starrfelt R, Ólafsdóttir RR, Arendt IM. Rehabilitation of pure alexia: a review. Neuropsychol Rehabil. 2013;23(5):755-79. doi:10.1080/09602011.2013.809661.', url: 'https://doi.org/10.1080/09602011.2013.809661' },
  woodhead2013: { citation: 'Woodhead ZVJ, Penny W, Barnes GR, Crewes H, Wise RJS, Price CJ, et al. Reading therapy strengthens top-down connectivity in patients with pure alexia. Brain. 2013;136(Pt 8):2579-91. doi:10.1093/brain/awt186.', url: 'https://doi.org/10.1093/brain/awt186' },
  starrfelt2009: { citation: 'Starrfelt R, Habekost T, Leff AP. Too little, too late: reduced visual span and speed characterize pure alexia. Cereb Cortex. 2009;19(12):2880-90. doi:10.1093/cercor/bhp059.', url: 'https://doi.org/10.1093/cercor/bhp059' },
  starrfelt2014: { citation: 'Starrfelt R, Shallice T. What’s in a name? The characterization of pure alexia. Cogn Neuropsychol. 2014;31(5-6):367-77. doi:10.1080/02643294.2014.924226.', url: 'https://doi.org/10.1080/02643294.2014.924226' },
  // attention and praxis
  molenberghs2012: { citation: 'Molenberghs P, Sale MV, Mattingley JB. Is there a critical lesion site for unilateral spatial neglect? A meta-analysis using activation likelihood estimation. Front Hum Neurosci. 2012;6:78. doi:10.3389/fnhum.2012.00078.', url: 'https://doi.org/10.3389/fnhum.2012.00078' },
  dalrymple2013: { citation: 'Dalrymple KA, Barton JJS, Kingstone A. A world unglued: simultanagnosia as a spatial restriction of attention. Front Hum Neurosci. 2013;7:145. doi:10.3389/fnhum.2013.00145.', url: 'https://doi.org/10.3389/fnhum.2013.00145' },
  shahab2022: { citation: 'Shahab QS, Young IM, Dadario NB, Tanglay O, Nicholas PJ, Lin YH, et al. A connectivity model of the anatomic substrates underlying Gerstmann syndrome. Brain Commun. 2022;4(3):fcac140. doi:10.1093/braincomms/fcac140.', url: 'https://doi.org/10.1093/braincomms/fcac140' },
  borchers2013: { citation: 'Borchers S, Müller L, Synofzik M, Himmelbach M. Guidelines and quality measures for the diagnosis of optic ataxia. Front Hum Neurosci. 2013;7:324. doi:10.3389/fnhum.2013.00324.', url: 'https://doi.org/10.3389/fnhum.2013.00324' },
  pisella2015: { citation: 'Pisella L, Biotti D, Vighetto A. Combination of attentional and spatial working memory deficits in Bálint-Holmes syndrome. Ann N Y Acad Sci. 2015;1339(1):165-75. doi:10.1111/nyas.12731.', url: 'https://doi.org/10.1111/nyas.12731' },
  park2017: { citation: 'Park JE. Apraxia: review and update. J Clin Neurol. 2017;13(4):317-24. doi:10.3988/jcn.2017.13.4.317.', url: 'https://doi.org/10.3988/jcn.2017.13.4.317' },
  rosenzopf2022: { citation: 'Rosenzopf H, Wiesen D, Basilakos A, Yourganov G, Bonilha L, Rorden C, et al. Mapping the human praxis network: an investigation of white matter disconnection in limb apraxia of gesture production. Brain Commun. 2022;4(1):fcac004. doi:10.1093/braincomms/fcac004.', url: 'https://doi.org/10.1093/braincomms/fcac004' },
  // the supplementary motor areas in apraxia and in transcortical motor aphasia (the owner: the premotor areas are the SMA and
  // pre-SMA, drawn as such; 2026-11-25)
  chang2015: { citation: 'Chang MC, Chun MH. Right lower limb apraxia in a patient with left supplementary motor area infarction: intactness of the corticospinal tract confirmed by transcranial magnetic stimulation. Neural Regen Res. 2015;10(2):325-7. doi:10.4103/1673-5374.152389.', url: 'https://doi.org/10.4103/1673-5374.152389' },
  kubel2018: { short: 'Kübel 2018', citation: 'Kübel S, Stegmayer K, Vanbellingen T, Walther S, Bohlhalter S. Deficient supplementary motor area at rest: neural basis of limb kinetic deficits in Parkinson’s disease. Hum Brain Mapp. 2018;39(9):3691-700. doi:10.1002/hbm.24204.', url: 'https://doi.org/10.1002/hbm.24204' },
  peigneux2004: { citation: 'Peigneux P, Van der Linden M, Garraux G, Laureys S, Degueldre C, Aerts J, et al. Imaging a cognitive model of apraxia: the neural substrate of gesture-specific cognitive processes. Hum Brain Mapp. 2004;21(3):119-42. doi:10.1002/hbm.10161.', url: 'https://doi.org/10.1002/hbm.10161' },
  kroliczak2009: { short: 'Króliczak 2009', citation: 'Króliczak G, Frey SH. A common network in the left cerebral hemisphere represents planning of tool use pantomimes and familiar intransitive gestures at the hand-independent level. Cereb Cortex. 2009;19(10):2396-410. doi:10.1093/cercor/bhn261.', url: 'https://doi.org/10.1093/cercor/bhn261' },
  niessen2014: { citation: 'Niessen E, Fink GR, Weiss PH. Apraxia, pantomime and the parietal cortex. Neuroimage Clin. 2014;5:42-52. doi:10.1016/j.nicl.2014.05.017.', url: 'https://doi.org/10.1016/j.nicl.2014.05.017' },
  levy2025: { citation: 'Levy D, Greicius Q, Wang C, Ko E, Xu D, Andrews J, et al. Role for left dorsomedial prefrontal cortex in self-generated, but not externally cued, language production. Neurobiol Lang (Camb). 2025;6:nol_a_00166. doi:10.1162/nol_a_00166.', url: 'https://doi.org/10.1162/nol_a_00166' },
  potgieser2014: { citation: 'Potgieser AR, de Jong BM, Wagemakers M, Hoving EW, Groen RJ. Insights from the supplementary motor area syndrome in balancing movement initiation and inhibition. Front Hum Neurosci. 2014;8:960. doi:10.3389/fnhum.2014.00960.', url: 'https://doi.org/10.3389/fnhum.2014.00960' },
  dick2019: { citation: 'Dick AS, Garic D, Graziano P, Tremblay P. The frontal aslant tract (FAT) and its role in speech, language and executive function. Cortex. 2019;111:148-63. doi:10.1016/j.cortex.2018.10.015.', url: 'https://doi.org/10.1016/j.cortex.2018.10.015' },
  // vision
  corrow2016: { citation: 'Corrow SL, Dalrymple KA, Barton JJ. Prosopagnosia: current perspectives. Eye Brain. 2016;8:165-75. doi:10.2147/EB.S92838.', url: 'https://doi.org/10.2147/EB.S92838' },
  // prosopagnosia's lesion sites, the posterior ones among them (the owner asked for them, 2026-11-25)
  josephs2024: { citation: 'Josephs KA, Josephs KA Jr. Prosopagnosia: face blindness and its association with neurological disorders. Brain Commun. 2024;6(1):fcae002. doi:10.1093/braincomms/fcae002.', url: 'https://doi.org/10.1093/braincomms/fcae002' },
  gainotti2011: { citation: 'Gainotti G, Marra C. Differential contribution of right and left temporo-occipital and anterior temporal lesions to face recognition disorders. Front Hum Neurosci. 2011;5:55. doi:10.3389/fnhum.2011.00055.', url: 'https://doi.org/10.3389/fnhum.2011.00055' },
  robotham2023: { citation: 'Robotham RJ, Rice GE, Leff AP, Lambon Ralph MA, Starrfelt R. Systematic evaluation of high-level visual deficits and lesions in posterior cerebral artery stroke. Brain Commun. 2023;5(2):fcad050. doi:10.1093/braincomms/fcad050.', url: 'https://doi.org/10.1093/braincomms/fcad050' },
  barton2009: { citation: 'Barton JJ, Hanif H, Ashraf S. Relating visual to verbal semantic knowledge: the evaluation of object recognition in prosopagnosia. Brain. 2009;132(Pt 12):3456-66. doi:10.1093/brain/awp252.', url: 'https://doi.org/10.1093/brain/awp252' },
  prieto2011: { citation: 'Prieto EA, Caharel S, Henson R, Rossion B. Early (N170/M170) face-sensitivity despite right lateral occipital brain damage in acquired prosopagnosia. Front Hum Neurosci. 2011;5:138. doi:10.3389/fnhum.2011.00138.', url: 'https://doi.org/10.3389/fnhum.2011.00138' },
  rossion2011: { citation: 'Rossion B, Dricot L, Goebel R, Busigny T. Holistic face categorization in higher order visual areas of the normal and prosopagnosic brain: toward a non-hierarchical view of face perception. Front Hum Neurosci. 2011;4:225. doi:10.3389/fnhum.2010.00225.', url: 'https://doi.org/10.3389/fnhum.2010.00225' },
  jonas2014: { citation: 'Jonas J, Frismand S, Vignal JP, Colnat-Coulbois S, Koessler L, Vespignani H, et al. Right hemispheric dominance of visual phenomena evoked by intracerebral stimulation of the human visual cortex. Hum Brain Mapp. 2014;35(7):3360-71. doi:10.1002/hbm.22407.', url: 'https://doi.org/10.1002/hbm.22407' },
  cohen2019: { citation: 'Cohen AL, Soussand L, Corrow SL, Martinaud O, Barton JJS, Fox MD. Looking beyond the face area: lesion network mapping of prosopagnosia. Brain. 2019;142(12):3975-90. doi:10.1093/brain/awz332.', url: 'https://doi.org/10.1093/brain/awz332' },
  goodwin2014: { citation: 'Goodwin D. Homonymous hemianopia: challenges and solutions. Clin Ophthalmol. 2014;8:1919-27. doi:10.2147/OPTH.S59452.', url: 'https://doi.org/10.2147/OPTH.S59452' },
  thirugnanachandran2026: { citation: 'Thirugnanachandran T, Vuong J, Kong Y, Chen J, Chen C, Clissold B, et al. The anatomy of infarcts causing hemianopia and quadrantanopia in posterior cerebral artery stroke. Cerebrovasc Dis. 2026;55(3):311-7. doi:10.1159/000547444.', url: 'https://doi.org/10.1159/000547444' },
};

/** the sources name the superior longitudinal fasciculus as one: the white-matter section's three parts of it, all linked */
const SLF = [
  { id: 'wm_slf1', name: 'Superior longitudinal fasciculus I' }, { id: 'wm_slf2', name: 'Superior longitudinal fasciculus II' },
  { id: 'wm_slf3', name: 'Superior longitudinal fasciculus III' },
];

export const SYNDROMES: Syndrome[] = [
  // ---------------------------------------------------------------- aphasias and alexia
  {
    id: 'broca', name: 'Broca’s aphasia', group: 'aphasia', side: 'L', camera: 'lateral',
    labels: [
      { id: 'ctx_g_front_inf_opercular', why: 'pars opercularis (area 44), part of Broca’s area' },
      { id: 'ctx_g_front_inf_triangul', why: 'pars triangularis (area 45), part of Broca’s area' },
    ],
    tracts: [{ id: 'wm_af', name: 'Arcuate fasciculus' }, { id: 'wm_emc', name: 'Extreme capsule fasciculus' }, { id: 'wm_mdlf', name: 'Middle longitudinal fasciculus' }],
    signs: [
      { text: 'Non-fluent speech and language production with relatively less impaired comprehension: difficulty naming words and producing long, grammatical sentences, and motor speech difficulty with hard sound combinations.', refIds: ['pracar2025'] },
    ],
    areas: [
      { text: 'Classically tied to Broca’s area, areas 44 (pars opercularis) and 45 (pars triangularis) in the posterior half of the left inferior frontal gyrus.', refIds: ['gajardovidal2021', 'pracar2025'] },
    ],
    firmness: [
      { text: 'Lesions of Broca’s area alone are thought to cause a transient Broca’s aphasia rather than a chronic one, and localised damage rarely gives the complete syndrome.', refIds: ['pracar2025', 'fridriksson2018'] },
      { text: 'Chronic Broca’s aphasia needs wider damage: to the dorsolateral prefrontal cortex, the supramarginal gyrus, the anterior superior temporal gyrus and the white matter beneath them; in a lesion analysis the left insula came out as most critical, with the motor cortex of the tongue and larynx, and complete disconnections of the arcuate fasciculus, extreme capsule and middle longitudinal fasciculus.', refIds: ['pracar2025'] },
      { text: 'Long-lasting speech production impairment after stroke has been accounted for by damage to the white matter above the insula, near the arcuate fasciculus, rather than by damage to Broca’s area.', refIds: ['gajardovidal2021'] },
    ],
  },
  {
    id: 'wernicke', name: 'Wernicke’s aphasia', group: 'aphasia', side: 'L', camera: 'lateral',
    labels: [
      { id: 'ctx_g_temp_sup_lateral', why: 'the posterior superior temporal gyrus, classical Wernicke’s area' },
      { id: 'ctx_g_temp_sup_plan_tempo', why: 'the posterior superior temporal plane' },
      { id: 'ctx_g_pariet_inf_supramar', why: 'supramarginal gyrus: the lesions reach the inferior parietal lobe' },
      { id: 'ctx_g_temporal_middle', why: 'middle temporal gyrus, often reached too' },
    ],
    tracts: [],
    signs: [
      { text: 'Impaired comprehension and repetition of single words, with fluent, sentence-like speech punctuated with phonological or neologistic errors.', refIds: ['robson2014'] },
      { text: 'Written words are understood significantly better than spoken ones; patients with posterior lesions are often unaware of the full scale of their language deficit.', refIds: ['robson2014', 'osullivan2019'] },
    ],
    areas: [
      { text: 'It results from lesions of the left posterior temporoparietal cortex, in the territory of the inferior division of the left middle cerebral artery.', refIds: ['robson2014', 'osullivan2019'] },
      { text: 'In one series the lesions overlapped most in the white matter beneath the posterior superior temporal lobe, reached the inferior parietal lobe or temporoparietal junction in every patient, and often the middle temporal lobe.', refIds: ['robson2014'] },
      { text: '“Wernicke’s area” has come to mean the left posterior superior temporal and supramarginal gyri, around the posterior end of the Sylvian fissure.', refIds: ['binder2015'] },
    ],
    firmness: [
      { text: 'Damage restricted to Wernicke’s area does not by itself impair comprehension: the full aphasia comes from larger lesions that also reach the surrounding semantic cortex.', refIds: ['binder2015', 'fridriksson2018'] },
    ],
  },
  {
    id: 'conduction', name: 'Conduction aphasia', group: 'aphasia', side: 'L', camera: 'lateral',
    labels: [
      { id: 'ctx_g_pariet_inf_supramar', why: 'supramarginal gyrus' },
      { id: 'ctx_g_temp_sup_plan_tempo', why: 'the posterior planum temporale (area Spt)' },
      { id: 'ctx_lat_fis_post', why: 'the posterior Sylvian fissure the lesions centre on' },
    ],
    tracts: [{ id: 'wm_af', name: 'Arcuate fasciculus' }],
    signs: [
      { text: 'Frequent phonemic paraphasias with attempts at self-correction, impaired verbatim repetition and naming difficulty, in otherwise fluent and grammatical speech, with relatively spared auditory comprehension.', refIds: ['buchsbaum2011'] },
      { text: 'Repeated attempts may come closer to the target with each try (conduite d’approche).', refIds: ['buchsbaum2011', 'osullivan2019'] },
    ],
    areas: [
      { text: 'Most often caused by damage to the left superior temporal and/or supramarginal gyrus, around the posterior Sylvian fissure; across studies the lesions overlap most in the posterior planum temporale (area Spt).', refIds: ['buchsbaum2011', 'binder2015'] },
      { text: 'Neurological tradition attributed it to damage to the arcuate fasciculus, the tract connecting Wernicke’s and Broca’s areas.', refIds: ['buchsbaum2011'] },
    ],
    firmness: [
      { text: 'Damage to the arcuate fasciculus is not a prerequisite: lesions restricted to the cortex, most notably the supramarginal gyrus, can cause it, and diffusion MRI has found no straightforward relationship between the arcuate fasciculus and repetition.', refIds: ['buchsbaum2011', 'osullivan2019'] },
    ],
  },
  {
    // (on the medial surface, where the supplementary motor areas lie)
    id: 'tcmotor', name: 'Transcortical motor aphasia', group: 'aphasia', side: 'L', camera: 'medial',
    labels: [],
    fns: [
      { id: 'ctx_fn_presma', why: 'the pre-supplementary motor area: in a series of left-sided resections, of the medial frontal regions compared, the one whose damage went with a deficit of self-generated speech' },
      { id: 'ctx_fn_sma', why: 'the supplementary motor area proper, behind it: its resection can give the SMA syndrome, a transient akinesia with, on the dominant side, mutism' },
    ],
    tracts: [{ id: 'wm_fat', name: 'Frontal aslant tract' }],
    signs: [
      { text: 'Dysfluency and agrammatism in spontaneous speech, which is hard to initiate, with relative sparing of repetition.', refIds: ['osullivan2019', 'canas2018'] },
    ],
    areas: [
      { text: 'The lesions are often anterior or superior to Broca’s area, though in many cases part of Broca’s area is involved.', refIds: ['osullivan2019'] },
      { text: 'Lesions of the supplementary motor area of the dominant hemisphere can give varying degrees of it too, typically after their resection.', refIds: ['canas2018', 'lacorte2021'] },
      { text: 'In 307 left-hemisphere resections, a deficit of self-generated but not externally cued speech was tied to damage in the left medial prefrontal cortex; among the 18 patients with resections there, only damage to the pre-SMA set apart those with the deficit. The authors liken it to transcortical motor aphasia; it came without the hemiparesis or akinetic mutism of the SMA syndrome that damage to the SMA proper gives.', refIds: ['levy2025'] },
      { text: 'An anterior part of the frontal aslant tract has been described joining the pre-SMA to area 44, and a posterior part joining the SMA to area 6; disorders of self-initiated speech, hesitancy and pauses have been reported straight after surgery involving it.', refIds: ['lacorte2021'] },
    ],
    firmness: [
      { text: 'There is some controversy about the transcortical syndromes; the sparing of repetition is an important feature to recognise, as it may be put to use in speech and language therapy.', refIds: ['osullivan2019'] },
      { text: 'Lesions confined to the SMA most often give no specific class of aphasia: the transcortical motor aphasias described more plausibly reflect wider damage to the white matter beneath.', refIds: ['potgieser2014'] },
      { text: 'Reduced spontaneous speech may follow resection of the SMA, described mainly on the dominant side though not only there; in most cases it resolves within weeks to months.', refIds: ['potgieser2014', 'dick2019'] },
    ],
  },
  {
    id: 'tcsensory', name: 'Transcortical sensory aphasia', group: 'aphasia', side: 'L', camera: 'lateral',
    labels: [
      { id: 'ctx_g_temporal_middle', why: 'middle temporal gyrus, part of the semantic network' },
      { id: 'ctx_g_pariet_inf_angular', why: 'angular gyrus, part of the semantic network' },
    ],
    tracts: [],
    signs: [
      { text: 'Impaired comprehension with relative sparing of repetition, without full access to the meaning of what is repeated; anomia and empty speech that lacks meaningful content.', refIds: ['osullivan2019', 'binder2015'] },
    ],
    areas: [
      { text: 'The lesions typically lie in the vicinity of Wernicke’s area.', refIds: ['osullivan2019'] },
      { text: 'Binder attributes it to damage confined to the semantic network, which includes the angular gyrus and middle temporal gyrus; comprehension impairment is associated with damage there, not with damage to the posterior superior temporal or supramarginal gyrus.', refIds: ['binder2015'] },
    ],
    firmness: [
      { text: 'There is some controversy about the transcortical syndromes; the sparing of repetition is an important feature to recognise, as it may be put to use in speech and language therapy.', refIds: ['osullivan2019'] },
    ],
  },
  {
    id: 'purealexia', name: 'Alexia without agraphia', group: 'aphasia', side: 'L', camera: 'inferior',
    labels: [
      { id: 'ctx_g_oc_temp_lat_fusifor', why: 'the left mid-fusiform gyrus, with the visual word form area' },
      { id: 'ctx_s_oc_temp_lat', why: 'just lateral to the fusiform gyrus' },
      { id: 'ctx_g_oc_temp_med_lingual', why: 'lingual gyrus, part of the ventral occipitotemporal cortex' },
      { id: 'ctx_s_calcarine', why: 'the left primary visual cortex of the classic account' },
    ],
    tracts: [{ id: 'wm_ilf', name: 'Inferior longitudinal fasciculus' }, { id: 'wm_cc', name: 'Corpus callosum' }],
    signs: [
      { text: 'Pure alexia: the selective loss of reading in previously literate adults, after injury to the posterior left hemisphere, with writing and other language functions intact.', refIds: ['starrfelt2013', 'osullivan2019'] },
      { text: 'Many patients read letter by letter; reading is slow, with a pronounced word length effect, and visual field defects commonly go with it.', refIds: ['starrfelt2013', 'starrfelt2009', 'woodhead2013'] },
    ],
    areas: [
      { text: 'It is almost always caused by damage to the left ventral occipitotemporal cortex, by way of the fusiform or lingual gyri, and the white matter beneath it, including the inferior longitudinal fasciculus.', refIds: ['woodhead2013'] },
      { text: 'The area in or just lateral to the left mid-fusiform gyrus (the visual word form area) has been suggested to be the critical region.', refIds: ['starrfelt2009'] },
      { text: 'The classic account is a disconnection: a lesion of the left primary visual cortex with one of the splenium of the corpus callosum cuts visual input off from the angular gyrus, while the language areas that write are intact.', refIds: ['osullivan2019'] },
    ],
    firmness: [
      { text: 'Some patients’ lesions spare the visual word form area and disconnect it from visual input instead; whether the deficit is specific to letters and words or part of a more general visual impairment has long been controversial.', refIds: ['starrfelt2014'] },
    ],
  },
  // ---------------------------------------------------------------- attention and praxis
  {
    id: 'neglect', name: 'Hemispatial neglect', group: 'attention', side: 'R', camera: 'lateral',
    labels: [
      { id: 'ctx_g_pariet_inf_angular', why: 'inferior parietal lobule, at the temporo-parietal junction' },
      { id: 'ctx_g_pariet_inf_supramar', why: 'inferior parietal lobule, at the temporo-parietal junction' },
      { id: 'ctx_g_temp_sup_lateral', why: 'superior temporal gyrus' },
      { id: 'ctx_s_temporal_sup', why: 'superior temporal sulcus, between the superior and middle temporal gyri' },
      { id: 'ctx_g_temporal_middle', why: 'middle temporal gyrus' },
      { id: 'ctx_s_intrapariet_and_p_trans', why: 'intraparietal sulcus' },
    ],
    tracts: SLF,
    signs: [
      { text: 'An inability to detect, attend or respond to stimuli on the side of space opposite the brain damage.', refIds: ['molenberghs2012'] },
      { text: 'It usually follows damage to the right hemisphere, so that the left side is neglected, though it also arises after left-sided lesions.', refIds: ['molenberghs2012', 'dalrymple2013'] },
    ],
    areas: [
      { text: 'A meta-analysis of 20 lesion-mapping studies found the damage tied to neglect in the right hemisphere: in the middle and superior temporal gyri, the inferior parietal lobule, the intraparietal sulcus, the precuneus, the middle occipital gyrus and the posterior insula, and in the caudate nucleus.', refIds: ['molenberghs2012'] },
      { text: 'The largest area was white matter in the posterior part of the superior longitudinal fasciculus, which connects parietal and frontal areas.', refIds: ['molenberghs2012'] },
    ],
    firmness: [
      { text: 'The critical lesion site has been debated for more than a decade: the angular gyrus, the superior temporal cortex, the temporo-parietal junction and the white matter connecting parietal and frontal areas have each been proposed.', refIds: ['molenberghs2012'] },
      { text: 'Neglect is now widely accepted as a heterogeneous syndrome whose parts, such as extinction and allocentric and personal neglect, are tied to distinct lesion sites.', refIds: ['molenberghs2012'] },
    ],
  },
  {
    id: 'gerstmann', name: 'Gerstmann syndrome', group: 'attention', side: 'L', camera: 'lateral',
    labels: [
      { id: 'ctx_g_pariet_inf_angular', why: 'the angular gyrus, the dominant parietal site earlier studies name' },
      { id: 'ctx_s_intrapariet_and_p_trans', why: 'the intraparietal sulcus, where a connectivity model puts its core' },
    ],
    tracts: SLF,
    signs: [
      { text: 'A tetrad of agraphia, acalculia, finger agnosia and impaired left–right discrimination.', refIds: ['shahab2022'] },
    ],
    areas: [
      { text: 'It is generally agreed to follow damage to the dominant parietal lobe, often from an infarct; the intraparietal sulcus and the angular gyrus have both been held most responsible.', refIds: ['shahab2022'] },
      { text: 'A connectivity model built from healthy subjects’ imaging placed a “Gerstmann core” around the anteromedial part of the left intraparietal sulcus, and one proposal is a disconnection of the intraparietal fibres beneath it, likely part of the superior longitudinal fasciculus.', refIds: ['shahab2022'] },
    ],
    firmness: [
      { text: 'The exact site of the lesion within the parietal lobe is much debated, and a pure Gerstmann syndrome is rare.', refIds: ['shahab2022'] },
      { text: 'Whether the four signs belong together is disputed: authors differ on how many must occur together, and they are often found apart or with aphasia or apraxia.', refIds: ['shahab2022'] },
    ],
  },
  {
    id: 'balint', name: 'Bálint syndrome', group: 'attention', side: 'both', camera: 'axial',
    labels: [
      { id: 'ctx_g_parietal_sup', why: 'posterior parietal cortex' },
      { id: 'ctx_s_intrapariet_and_p_trans', why: 'the inferior intraparietal sulcus' },
      { id: 'ctx_s_parieto_occipital', why: 'the medial parieto-occipital junction' },
      { id: 'ctx_g_cuneus', why: 'the cuneus' },
    ],
    tracts: [],
    signs: [
      { text: 'A triad: optic ataxia (gross misreaching to targets in the peripheral visual field), oculomotor apraxia and simultanagnosia, a restriction of visual attention to one object at a time.', refIds: ['borchers2013', 'dalrymple2013'] },
      { text: 'Despite intact visual acuity, simultanagnosia can be so disabling that patients are described as functionally blind.', refIds: ['dalrymple2013'] },
    ],
    areas: [
      { text: 'It is characteristic of bilateral damage to the posterior parietal cortex.', refIds: ['pisella2015'] },
      { text: 'Optic ataxia has been tied to the lateral and medial parieto-occipital junction; simultanagnosia to bilateral damage to the medial occipito-parietal junction, the cuneus and the inferior intraparietal sulcus, with the white matter beneath them.', refIds: ['borchers2013', 'dalrymple2013'] },
    ],
    firmness: [
      { text: 'A heterogeneous entity: Bálint’s own third sign was a one-sided spatial attention disorder, now called neglect, where Holmes described a wandering of gaze.', refIds: ['pisella2015'] },
      { text: 'Patients are few and their lesions vary, which makes the regions responsible hard to determine; optic ataxia also occurs on its own.', refIds: ['dalrymple2013', 'borchers2013'] },
    ],
  },
  {
    // (from above: the supplementary motor areas lie on the medial surface, the parietal and temporal areas on the lateral)
    id: 'apraxia', name: 'Limb apraxia (ideomotor)', group: 'attention', side: 'L', camera: 'axial',
    labels: [
      { id: 'ctx_g_pariet_inf_supramar', why: 'supramarginal gyrus, inferior parietal lobe' },
      { id: 'ctx_g_pariet_inf_angular', why: 'angular gyrus' },
      { id: 'ctx_g_temporal_middle', why: 'middle temporal gyrus' },
    ],
    fns: [
      { id: 'ctx_fn_sma', why: 'the supplementary motor area: ideomotor apraxia has been found with damage to it (the lesion reports do not separate it from the pre-SMA)' },
      { id: 'ctx_fn_presma', why: 'the pre-supplementary motor area, in front of it: more active when healthy people plan a tool-use pantomime with the right hand (imaging, not lesions)' },
    ],
    tracts: SLF,
    signs: [
      { text: 'Apraxia is the inability to carry out skilled, learned movements without an elementary motor, sensory or coordination deficit to explain it.', refIds: ['park2017'] },
      { text: 'In ideomotor apraxia gestures fail on command although the task is known, as when asked to show how to use a screwdriver; in ideational apraxia the concept of the task is lost although the tools are recognised.', refIds: ['park2017'] },
    ],
    areas: [
      { text: 'It follows mainly damage to the left hemisphere, which is held to be the one relevant for praxis.', refIds: ['park2017', 'rosenzopf2022'] },
      { text: 'Lesion studies tie it to left parietal, temporal and frontal cortex: the angular and supramarginal gyri, the middle and superior temporal gyri, the inferior frontal gyrus, the insula and premotor areas; ideomotor apraxia has also been found with damage to the supplementary motor cortex or the corpus callosum.', refIds: ['rosenzopf2022', 'park2017'] },
      { text: 'Patients with lesions of the supplementary motor area have shown ideomotor apraxia, reportedly of both hands after a left-sided lesion; in one case report an infarct mainly of the left one seemed to cause apraxia of the right leg.', refIds: ['chang2015', 'kubel2018'] },
      { text: 'In 12 healthy people, planning a tool-use pantomime with the right hand raised activity more than an intransitive gesture did in the left pre-SMA, dorsal premotor, cingulate, parietal and primary motor areas; with the left hand there was no such difference.', refIds: ['kroliczak2009'] },
      { text: 'In the white matter, Geschwind proposed a disconnection through the superior longitudinal fasciculus; a disconnection study also implicated the uncinate, inferior fronto-occipital and inferior longitudinal fasciculi.', refIds: ['park2017', 'rosenzopf2022'] },
    ],
    firmness: [
      { text: 'The lesion studies’ results differ markedly, and apraxia is now seen as damage to a network rather than to one area.', refIds: ['rosenzopf2022', 'park2017'] },
      { text: 'Few studies have reported clear apraxia with lesions confined to the supplementary motor area, perhaps because the other hemisphere makes up for a one-sided lesion.', refIds: ['peigneux2004'] },
      { text: 'The supplementary motor and premotor activity seen in imaging of pantomime has been read as the general motor work of a complex task rather than as pantomime itself.', refIds: ['niessen2014'] },
    ],
  },
  // ---------------------------------------------------------------- vision
  {
    id: 'prosopagnosia', name: 'Prosopagnosia', group: 'visual', side: 'R', camera: 'inferior',
    labels: [
      { id: 'ctx_g_and_s_occipital_inf', why: 'the inferior occipital gyrus, where the occipital face area lies' },
      { id: 'ctx_g_oc_temp_lat_fusifor', why: 'the fusiform gyrus, with the fusiform face area in its posterior and middle part' },
      { id: 'ctx_g_oc_temp_med_lingual', why: 'the lingual gyrus: with the fusiform gyrus, where the search for its anatomy first centred' },
      { id: 'ctx_pole_temporal', why: 'the anterior temporal lobe, approximately (more often the associative form)' },
    ],
    tracts: [{ id: 'wm_ilf', name: 'Inferior longitudinal fasciculus' }, { id: 'wm_ifof', name: 'Inferior fronto-occipital fasciculus' }],
    signs: [
      { text: 'A selective visual agnosia: the inability to recognise the identity of faces, not due to more general problems with vision, object recognition or memory.', refIds: ['corrow2016'] },
      { text: 'Acquired prosopagnosia follows brain injury, among others stroke, trauma, encephalitis, tumours or temporal lobe resection.', refIds: ['corrow2016'] },
      { text: 'With occipitotemporal lesions the classic companions are upper visual field defects, impaired colour vision (almost always only when the lesions are on both sides) and topographic disorientation.', refIds: ['corrow2016'] },
    ],
    areas: [
      { text: 'Lesions may be on both sides or on one; when on one, far more often on the right. In a clinical series, all but 5 of 66 patients whose prosopagnosia was not degenerative (for most a reported complaint, not confirmed by testing) and whose imaging showed a lesion had one involving the right temporal or right occipital lobe: with infarcts the right occipital lobe was the commonest site, with tumours and epilepsy the right temporal lobe.', refIds: ['corrow2016', 'josephs2024'] },
      { text: 'For its first century the search for its anatomy centred on the lingual and fusiform gyri of the medial occipitotemporal cortex.', refIds: ['josephs2024'] },
      { text: 'The most specific forms follow lesions of a right posterior network that includes the occipital face area, in the inferior occipital gyrus, and the fusiform face area, in the posterior and middle fusiform gyrus; damage there impairs visual perception and tends to give the apperceptive form, a failure to encode the face.', refIds: ['gainotti2011', 'robotham2023', 'corrow2016'] },
      { text: 'Three patients with right posterior medial occipitotemporal infarcts or haemorrhage had lost the right fusiform face area, one the occipital face area too; in the patient PS the main lesion, thought to cause her prosopagnosia, takes in the right occipital face area, with a second lesion in the left fusiform face area.', refIds: ['barton2009', 'prieto2011', 'rossion2011'] },
      { text: 'Electrical stimulation of the right inferior occipital gyrus in one patient and of the right middle fusiform gyrus in another caused a prosopagnosia that ended with the stimulation; in that series no stimulation of the left hemisphere did.', refIds: ['jonas2014'] },
      { text: 'Patients with anterior temporal lesions more often have the associative form. With right anterior temporal lesions the defect has been held usually to be part of a wider, multimodal disorder of person recognition, though in one study voices were impaired only when the anterior temporal lesions were on both sides.', refIds: ['corrow2016', 'gainotti2011'] },
      { text: 'After posterior cerebral artery stroke, face recognition correlated with a right-hemisphere cluster mainly in the white matter of the inferior fronto-occipital and inferior longitudinal fasciculi.', refIds: ['robotham2023'] },
    ],
    firmness: [
      { text: 'Many different lesions can cause it: acquired prosopagnosia is a family of disorders with different mechanisms and lesions that lead to the same impaired face recognition.', refIds: ['corrow2016'] },
      { text: 'No single area is damaged in every case: of 44 published lesions causing it, only 29 involved the right fusiform face area, but all 44 lay in a network defined by their connectivity to that area in healthy brains.', refIds: ['cohen2019'] },
      { text: 'A deficit for faces alone is rare after posterior cerebral artery stroke: in a series of 64 patients none had one, faces suffered after right, left and bilateral lesions, lesion volume mattered most, and taking it into account removed most of the clusters found for faces.', refIds: ['robotham2023'] },
    ],
  },
  {
    id: 'hemianopia', name: 'Homonymous field defects (occipital)', group: 'visual', side: 'both', camera: 'medial',
    labels: [
      { id: 'ctx_s_calcarine', why: 'the striate cortex along the calcarine sulcus' },
      { id: 'ctx_g_cuneus', why: 'above the calcarine sulcus: a lesion here gives a lower quadrantanopia' },
      { id: 'ctx_g_oc_temp_med_lingual', why: 'below the calcarine sulcus: a lesion here gives an upper quadrantanopia' },
      { id: 'ctx_pole_occipital', why: 'the occipital pole, where the macula is represented' },
    ],
    tracts: [{ id: 'wm_or', name: 'Optic radiation' }],
    signs: [
      { text: 'Damage to the visual pathway behind the chiasm on one side causes loss of vision in the opposite half of the visual field of both eyes, respecting the vertical midline.', refIds: ['goodwin2014'] },
      { text: 'Homonymous hemianopia is the main consequence of an occipital lesion, which usually produces no other neurological signs; occipital lesions mostly give defects alike in the two eyes (congruous).', refIds: ['goodwin2014'] },
    ],
    areas: [
      { text: 'The occipital lobe is the commonest site of the lesions causing homonymous hemianopia (45%), followed by the optic radiations (32%).', refIds: ['goodwin2014'] },
      { text: 'The striate cortex lies along the upper and lower borders of the calcarine sulcus; a lesion confined to the cuneus above it gives a lower quadrantanopia, one confined to the lingual gyrus below it an upper quadrantanopia.', refIds: ['thirugnanachandran2026', 'goodwin2014'] },
      { text: 'The macula is represented at the occipital pole, disproportionately large; with that and the posterior occipital lobe’s dual blood supply, sparing of the central 2° to 10° is common with occipital lesions.', refIds: ['goodwin2014'] },
    ],
    firmness: [
      { text: 'The bank rule is loose in stroke: in a series of posterior cerebral artery infarcts only one of seven upper quadrantanopias spared the upper bank alone, and three involved parts of both banks.', refIds: ['thirugnanachandran2026'] },
      { text: 'Macular sparing can also occur with lesions of the optic radiations or optic tracts.', refIds: ['goodwin2014'] },
    ],
  },
];

export const SYNDROME = new Map(SYNDROMES.map((s) => [s.id, s]));
