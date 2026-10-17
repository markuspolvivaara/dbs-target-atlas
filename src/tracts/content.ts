import type { Claim, TractGroup, TractTopicInput } from './schema';

/**
 * White-matter section content (October 2026). Every sentence paraphrases the cited abstract
 * (PubMed), except claims citing yeh2018 / yeh2022, which were checked against their
 * open-access full texts (PMC6921501, PMC9395399). Nothing is added from memory; where the
 * sources say nothing (for example the course of SLF I in detail) the card says less.
 *
 * Cortical connections measured in the atlas population are not written here: they come
 * from the published tract-to-region table (src/data/generated/wm-connectome.json).
 */

const c = (text: string, ...refIds: string[]): Claim => ({ text, refIds });

export const TOPICS: TractTopicInput[] = [
  {
    id: 'wm_af', name: 'Arcuate fasciculus', abbr: 'AF', aliases: ['arcuate fascicle'], type: 'association', tier: 'core',
    summary: 'Dorsal perisylvian language tract arching around the end of the Sylvian fissure; the classic subcortical site of phonemic paraphasia during awake mapping.',
    course: [
      c('Arises from the caudal superior temporal gyrus, arches around the caudal end of the Sylvian fissure and runs to the lateral prefrontal cortex together with SLF II fibres; it is counted as the fourth subdivision of the SLF.', 'makris2005'),
      c('Besides the direct pathway between Broca’s and Wernicke’s territories, tractography shows an indirect pathway lateral to it through inferior parietal cortex: an anterior segment (Broca–inferior parietal) and a posterior segment (inferior parietal–Wernicke).', 'catani2005'),
      c('Strongly left-lateralized: in a 30-subject template the left AF had twice the volume of the right, and the left superior temporal gyrus contributed five times more fibre volume.', 'fernandezmiranda2015'),
    ],
    connections: [
      c('Frontal terminations: pars opercularis, pars triangularis, ventral precentral gyrus and caudal middle frontal gyrus.', 'fernandezmiranda2015'),
      c('In the left AF an inner (ventral) pathway links pars opercularis with the superior and rostral middle temporal gyri, and an outer (dorsal) pathway links ventral precentral and caudal middle frontal gyri with the caudal middle and inferior temporal gyri. The right AF shows no such segmentation.', 'fernandezmiranda2015'),
    ],
    functions: [
      c('Phonology: subcortical stimulation of the AF elicits phonemic paraphasia.', 'duffau2008', 'mandonnet2007', 'maldonado2011a'),
      c('In a comparison with tractography, AF stimulation mostly caused articulatory and phonemic or syntactic errors, and less often semantic paraphasias.', 'leclercq2010'),
      c('Whether the AF is specialised for language is debated: some argue it is a domain-general pathway.', 'dick2012'),
      c('After resection of low-grade glioma, mentalizing deficits related mainly to right fronto-parietal disconnection; accuracy in low-level (perception-based) mentalizing correlated with AF disconnection.', 'herbet2014'),
    ],
    deficits: [
      c('Lesion of the classical arcuate pathway was held to cause conduction aphasia; the varied presentations of conduction aphasia fit the two parallel (direct and indirect) pathways better.', 'catani2005'),
    ],
    surgery: [
      c('In 115 awake patients with grade II glioma of the left hemisphere, the AF (phonemic paraphasia) was among the subcortical pathways found in every patient and kept as a resection limit; 98% returned to baseline or better.', 'duffau2008'),
      c('In left inferior parietal gliomas, phonemic paraphasia came from the posterosuperior AF, deeper and more superior than the SLF III fibres that gave articulatory errors.', 'maldonado2011a'),
    ],
    atlas: [
      c('The right AF could not be tracked in 19 of the 1065 atlas subjects; in some it was labelled SLF III because it did not reach the superior temporal lobe.', 'yeh2022'),
    ],
  },
  {
    id: 'wm_slf1', name: 'Superior longitudinal fasciculus I', abbr: 'SLF I', aliases: ['dorsal SLF'], type: 'association', tier: 'core',
    summary: 'The most dorsal SLF branch, in the superior parietal and superior frontal white matter next to the cingulum.',
    course: [
      c('Lies in the white matter of the superior parietal and superior frontal lobes and extends to the dorsal premotor and dorsolateral prefrontal regions.', 'makris2005'),
      c('Lies close to the cingulum and is separated from SLF II and III by the frontal aslant tract.', 'yeh2022'),
    ],
    connections: [
      c('Diffusion imaging defines only the stem of each SLF branch; its origins and terminations were extrapolated from tract-tracing in non-human primates.', 'makris2005'),
      c('By its cortical connections it groups with the cingulum pathways rather than with SLF II and III.', 'yeh2022'),
    ],
    functions: [
      c('Not counted among the language-eloquent tracts: studies cited in the atlas paper found no significant language function for SLF I.', 'yeh2022'),
    ],
    deficits: [],
    surgery: [],
    atlas: [],
  },
  {
    id: 'wm_slf2', name: 'Superior longitudinal fasciculus II', abbr: 'SLF II', aliases: [], type: 'association', tier: 'core',
    summary: 'Central SLF branch from the angular gyrus to caudal-lateral prefrontal cortex; its damage best predicts left spatial neglect after right-hemisphere stroke.',
    course: [
      c('Occupies the central core of the white matter above the insula, from the angular gyrus to the caudal-lateral prefrontal regions.', 'makris2005'),
    ],
    connections: [
      c('Clusters with the AF, SLF III and frontal aslant tract in an “arcuate system” whose members all connect to Broca’s area.', 'yeh2022'),
    ],
    functions: [
      c('Visuospatial attention: damage to SLF II best predicts left spatial neglect (see below).', 'thiebaut2014'),
      c('Right-hemisphere dominance for visuospatial attention goes with a larger parieto-frontal network on the right, and the degree of anatomical lateralization correlated with the asymmetry of visuospatial performance.', 'thiebaut2011'),
      c('Language: the areas linked to post-surgical deficits include regions reached by the AF, SLF II and SLF III.', 'yeh2022'),
    ],
    deficits: [
      c('In 58 patients with right middle cerebral artery stroke, damage to SLF II was the best predictor of left spatial neglect among the parietal–frontal pathways.', 'thiebaut2014'),
    ],
    surgery: [
      c('During awake surgery, stimulation of the right inferior parietal lobule or caudal superior temporal gyrus shifted line bisection to the right; the strongest shifts came from subcortical stimulation of a parietal–frontal pathway (named the superior occipitofrontal fasciculus in that study).', 'thiebaut2005'),
    ],
    atlas: [],
  },
  {
    id: 'wm_slf3', name: 'Superior longitudinal fasciculus III', abbr: 'SLF III', aliases: ['ventral SLF', 'lateral SLF'], type: 'association', tier: 'core',
    summary: 'Opercular SLF branch from the supramarginal gyrus to ventral premotor cortex; stimulating it disturbs articulation.',
    course: [
      c('Lies in the white matter of the parietal and frontal opercula, from the supramarginal gyrus to the ventral premotor and prefrontal regions.', 'makris2005'),
    ],
    connections: [
      c('Horizontal SLF fibres connect the supramarginal gyrus with the ventral premotor cortex.', 'maldonado2011b'),
    ],
    functions: [
      c('Articulation: stimulating the horizontal SLF fibres between the supramarginal gyrus and ventral premotor cortex causes dysarthria.', 'maldonado2011b'),
      c('No semantic disturbance was elicited from any part of the left SLF, during stimulation or after surgery.', 'maldonado2011b'),
    ],
    deficits: [
      c('Stimulation of the left ventral premotor cortex and of the lateral SLF beneath it caused anarthria in all eight patients studied.', 'vangeemen2014'),
    ],
    surgery: [
      c('In left inferior parietal gliomas, articulatory disturbances came from white matter in the anterior and lateral cavity, corresponding to the horizontal part of SLF III; it was a reproducible subcortical landmark.', 'maldonado2011a'),
      c('The left ventral premotor cortex showed limited plasticity, probably because it must stay connected to the lateral SLF; its partial resection was possible only after some redistribution.', 'vangeemen2014'),
    ],
    atlas: [],
  },
  {
    id: 'wm_ifof', name: 'Inferior fronto-occipital fasciculus', abbr: 'IFOF', aliases: ['inferior occipitofrontal fasciculus'], type: 'association', tier: 'core',
    summary: 'Long ventral tract from the frontal lobe to occipital and posterior temporal cortex through the floor of the external capsule; the subcortical site of semantic paraphasia.',
    course: [
      c('Passes from the temporal lobe through the temporal stem into the extreme and external capsules, together with the uncinate fasciculus.', 'kier2004'),
      c('Its subcomponents pass through the anterior floor of the external capsule and then fan out to their posterior terminations.', 'wu2016'),
    ],
    connections: [
      c('Two posterior components: a superficial, dorsal one to the superior parietal lobe and posterior superior and middle occipital gyri, and a deep, ventral one to the posterior inferior occipital gyrus and temporo-basal area.', 'martino2010'),
      c('In the frontal lobe a superficial layer ends in the inferior frontal gyrus; a deeper layer ends in the middle frontal gyrus and dorsolateral prefrontal cortex (posterior part), the middle frontal gyrus and lateral orbitofrontal cortex (middle part), and the orbitofrontal cortex and frontal pole (anterior part).', 'sarubbo2013'),
    ],
    functions: [
      c('Semantics: subcortical stimulation of the IFOF elicits semantic paraphasia.', 'duffau2005', 'duffau2008', 'mandonnet2007', 'leclercq2010'),
      c('Its parts may serve different functions: semantic processing (superficial layer and posterior deep component), multimodal sensory-motor integration (middle component), and emotional and behavioural aspects (anterior component). These were offered as hypotheses.', 'sarubbo2013'),
    ],
    deficits: [],
    surgery: [
      c('Where semantic paraphasias were elicited subcortically: under the depth of the posterior superior temporal sulcus in temporal gliomas, at the anterior floor of the external capsule in insular gliomas, and under the inferior frontal sulcus in frontal tumours. These sites were preserved and no permanent deficit followed.', 'duffau2005'),
      c('In a lateral frontal approach the IFOF and SLF form the posterolateral functional boundary of the resection.', 'debenedictis2012'),
    ],
    atlas: [
      c('Inter-individual variability is high (at most 40% overlap in its central part), with no left–right asymmetry.', 'wu2016'),
    ],
  },
  {
    id: 'wm_ilf', name: 'Inferior longitudinal fasciculus', abbr: 'ILF', aliases: [], type: 'association', tier: 'core',
    summary: 'Occipito-temporal tract for visual cognition; in the left temporal lobe it can be resected in part without lasting language loss.',
    course: [
      c('A long-range, multilayered and bidirectional association tract from occipital and temporo-occipital areas to the anterior temporal lobe.', 'herbet2018'),
    ],
    connections: [
      c('Joins posterior occipito-temporal regions to the temporal pole; with the uncinate fasciculus relaying from the temporal pole to frontobasal areas it may form an indirect ventral language route.', 'mandonnet2007'),
    ],
    functions: [
      c('Processes and modulates visual cues and so supports visually guided decisions and behaviour.', 'herbet2018'),
    ],
    deficits: [
      c('Sudden disruption mainly impairs visual cognition: visual agnosia, prosopagnosia and alexia. Bilateral disruption is highly detrimental.', 'herbet2018'),
    ],
    surgery: [
      c('In 12 awake left temporal glioma resections, stimulation of the ILF never disturbed language, and all patients recovered despite resection of at least part of it: it appears not indispensable for language.', 'mandonnet2007'),
      c('Disruption of its anterior part can be compensated by the contralateral tract.', 'herbet2018'),
    ],
    atlas: [],
  },
  {
    id: 'wm_uf', name: 'Uncinate fasciculus', abbr: 'UF', aliases: [], type: 'association', tier: 'core',
    summary: 'Hook-shaped tract between the anterior temporal lobe and orbitofrontal cortex through the temporal stem; its resection impairs proper-name retrieval.',
    course: [
      c('Runs from the temporal lobe through the temporal stem into the extreme and external capsules; Meyer’s loop of the optic radiation lies next to it at the level of the amygdala.', 'kier2004'),
    ],
    connections: [
      c('A bidirectional, long-range tract between the lateral orbitofrontal cortex and Brodmann area 10, and the anterior temporal lobes.', 'vonderheide2013'),
    ],
    functions: [
      c('Proposed roles in episodic memory, language and social-emotional processing; the review’s hypothesis is that it lets temporal-lobe memory associations (such as a person’s name, face and voice) guide behaviour through the orbitofrontal cortex.', 'vonderheide2013'),
    ],
    deficits: [
      c('Abnormalities of the tract have been linked to several psychiatric disorders.', 'vonderheide2013'),
    ],
    surgery: [
      c('In 44 awake resections of left frontal or temporal glioma, removing the frontal or temporal part of the uncinate fasciculus left a lasting deficit in naming famous faces three months later; conceptual knowledge was intact.', 'papagno2011'),
    ],
    atlas: [],
  },
  {
    id: 'wm_fat', name: 'Frontal aslant tract', abbr: 'FAT', aliases: ['aslant tract'], type: 'association', tier: 'core', parcels: ['sma', 'presma'],
    summary: 'Short frontal tract from the inferior frontal gyrus up to SMA and pre-SMA; on the left it supports speech initiation.',
    course: [
      c('An intralobar frontal tract identified by spherical deconvolution tractography and confirmed by post-mortem dissection.', 'catani2012'),
    ],
    connections: [
      c('Connects the posterior Broca region (inferior frontal gyrus) with the supplementary motor area (SMA) and pre-SMA.', 'catani2012', 'dick2019'),
    ],
    functions: [
      c('Left FAT: speech initiation, stuttering and verbal fluency. Right FAT: executive function, namely inhibitory control and conflict monitoring for action.', 'dick2019'),
      c('Proposed overall role: planning, timing and coordination of sequential movements, specialised for speech on the left and for general action control on the right.', 'dick2019'),
    ],
    deficits: [
      c('Resection close to the left FAT was associated with transient speech-initiation disorders, and the cavity-to-FAT distance correlated with semantic and phonemic verbal fluency.', 'kinoshita2015'),
    ],
    surgery: [
      c('In 19 awake frontal glioma resections, subcortical stimulation of the FAT or fronto-striatal tract inhibited movement and/or speech in all patients but one.', 'kinoshita2015'),
      c('Its medial end is the SMA and pre-SMA. SMA resection gives a regressive SMA syndrome whose deficits follow SMA somatotopy: leg, arm, face and, in the left SMA, language, from posterior to anterior.', 'catani2012', 'fontaine2002'),
    ],
    atlas: [
      c('Left-lateralized in 12 healthy right-handed subjects.', 'catani2012'),
    ],
  },
  {
    id: 'wm_cing_fp', name: 'Cingulum, dorsal (frontal–parietal) segment', abbr: 'Cingulum (dorsal)', aliases: ['cingulum bundle'], type: 'association', tier: 'core',
    summary: 'Medial association bundle in the cingulate white matter linking frontal and parietal cortex; lesions usually cause only mild deficits.',
    course: [
      c('Its composition changes along its length as fibres join and leave, despite its apparent continuity.', 'bubb2018'),
    ],
    connections: [
      c('Interconnects frontal, parietal and medial temporal sites and links subcortical nuclei to the cingulate gyrus.', 'bubb2018'),
    ],
    functions: [
      c('Imaging links the dorsal cingulum to executive control, emotion and pain.', 'bubb2018'),
      c('After glioma resection, accuracy in high-level (inference-based) mentalizing correlated with cingulum disconnection.', 'herbet2014'),
    ],
    deficits: [
      c('Despite extensive disconnection, cingulum lesions typically produce only mild deficits, pointing to parallel pathways.', 'bubb2018'),
      c('Cingulum abnormalities are reported in schizophrenia, depression, PTSD, OCD, autism spectrum disorder, mild cognitive impairment and Alzheimer’s disease.', 'bubb2018'),
    ],
    surgery: [],
    atlas: [
      c('The atlas divides the cingulum into several segments; this section shows the frontal–parietal and parahippocampal ones.', 'yeh2022'),
    ],
  },
  {
    id: 'wm_cing_ph', name: 'Cingulum, parahippocampal segment', abbr: 'Cingulum (parahippocampal)', aliases: ['parahippocampal cingulum'], type: 'association', tier: 'core',
    summary: 'Ventral, temporal part of the cingulum bundle, implicated in episodic memory.',
    course: [
      c('The cingulum bundle reaches the medial temporal lobe; this segment is its parahippocampal part.', 'bubb2018'),
    ],
    connections: [
      c('Interconnects frontal, parietal and medial temporal sites.', 'bubb2018'),
    ],
    functions: [
      c('Imaging links the parahippocampal cingulum to episodic memory.', 'bubb2018'),
    ],
    deficits: [
      c('Cingulum abnormalities are reported in mild cognitive impairment and Alzheimer’s disease, among other conditions.', 'bubb2018'),
    ],
    surgery: [],
    atlas: [],
  },
  {
    id: 'wm_or', name: 'Optic radiation', abbr: 'OR', aliases: ['geniculocalcarine tract', 'Meyer’s loop'], type: 'projection', tier: 'core',
    summary: 'Visual projection from the lateral geniculate nucleus to the calcarine cortex; its anterior Meyer’s loop is at risk in temporal lobe surgery.',
    course: [
      c('Runs from the lateral geniculate nucleus to the calcarine sulcus in three bundles, named by their direction on leaving the nucleus: Meyer’s loop, central and direct.', 'sherbondy2008'),
      c('Meyer’s loop reaches forward to the level of the amygdala in the temporal stem, beside the uncinate fasciculus and anterior commissure.', 'kier2004'),
      c('Dissections of 25 hemispheres measured its three-dimensional course and its relations to the temporal horn, trigone and occipital horn of the lateral ventricle for temporal lobe surgery.', 'ebeling1988'),
    ],
    connections: [
      c('Lateral geniculate nucleus to calcarine (primary visual) cortex.', 'sherbondy2008'),
    ],
    functions: [
      c('Carries the visual pathway from thalamus to cortex.', 'sherbondy2008'),
    ],
    deficits: [
      c('Damage to Meyer’s loop during anterior temporal lobe resection causes superior quadrantic visual field defects, sometimes severe enough to prohibit driving.', 'yogarajah2009'),
    ],
    surgery: [
      c('The tip of Meyer’s loop lay 24–47 mm (mean 35) behind the temporal pole in controls, and −11 to +9 mm (mean 0) from the tip of the temporal horn. Distance to the temporal pole and resection size predicted the field defect.', 'yogarajah2009'),
      c('Tractography placed the tip of Meyer’s loop 28 ± 3 mm behind the temporal pole, with a 1 cm range across people, so it should be located in each patient.', 'sherbondy2008'),
      c('Direct subcortical stimulation in awake patients identifies the optic radiation by transient visual disturbance: of 14 glioma patients, only one had a permanent hemianopia although quadrantanopia was expected in 12.', 'grascombe2012'),
    ],
    atlas: [],
  },
  {
    id: 'wm_cst', name: 'Corticospinal tract', abbr: 'CST', aliases: ['pyramidal tract'], type: 'projection', tier: 'core', parcels: ['m1'],
    summary: 'The principal pathway for voluntary movement, fanning from the motor cortex through the internal capsule to the spinal cord.',
    course: [
      c('Fans out from the precentral (motor) cortex along the cortical surface; its lateral fanning parts cross the corpus callosum and are missed by traditional low-angular-resolution tractography.', 'yeh2018'),
      c('In the posterior limb of the internal capsule it lies in a compact area in the third quarter (of four, front to back), more posterior than classically taught; in 17 of 20 tracts hand fibres lay anterolateral to foot fibres.', 'holodny2005'),
      c('Most axons cross the midline at the junction of brainstem and spinal cord, in the pyramidal decussation.', 'welniarz2017'),
    ],
    connections: [
      c('Cortex to spinal cord: the main route of cortical control over spinal motor activity.', 'welniarz2017'),
    ],
    functions: [
      c('The principal motor pathway for voluntary movement; its malformations show its role in the lateralization of motor control.', 'welniarz2017'),
    ],
    deficits: [],
    surgery: [
      c('Subcortical motor evoked potential mapping estimates the distance from the resection cavity to the CST; the relation of stimulation intensity to distance is non-linear and cathodal stimulation suited best. In 37 patients there was no new permanent motor deficit.', 'shiban2015'),
      c('Rostral to the CST, white matter under the dorsal premotor cortex and SMA gives negative motor responses with a somatotopy: leg mesial and posterior, then arm, then face and speech lateral and anterior.', 'rech2016'),
      c('The pyramidal tract with premotor fibres forms the posterior and posteromedial boundary of a lateral frontal resection.', 'debenedictis2012'),
    ],
    atlas: [
      c('Projection pathways such as the CST vary less between individuals than the arcuate fasciculus and SLF.', 'yeh2022'),
    ],
  },
  {
    id: 'wm_cbt', name: 'Corticobulbar tract', abbr: 'CBT', aliases: [], type: 'projection', tier: 'core', parcels: ['m1'],
    summary: 'Motor projection fanning from the precentral cortex alongside the CST; relevant to facial motor function and swallowing.',
    course: [
      c('Like the CST, fans out from the precentral (motor) cortex along the cortical surface.', 'yeh2018'),
      c('The lateral fanning parts of the corticospinal and corticobulbar tracts cross the corpus callosum and cannot be resolved reliably by traditional low-angular-resolution tractography.', 'yeh2018'),
    ],
    connections: [
      c('A projection pathway: projection pathways connect cortical areas with subcortical nuclei and the brainstem.', 'yeh2018'),
    ],
    functions: [
      c('Swallowing: involvement of the tract on both sides was associated with dysphagia after a unilateral corona radiata infarction.', 'ko2019'),
      c('Facial motor control: transcranial stimulation of the corticobulbar tract evokes facial muscle responses (facial corticobulbar MEPs) used to monitor facial nerve function.', 'fernandezconejero2022'),
    ],
    deficits: [
      c('After unilateral corona radiata infarction involving the CBT, leukoaraiosis involving the other side’s CBT independently predicted the feeding method at discharge.', 'ko2019'),
    ],
    surgery: [
      c('In 100 skull base operations, loss of facial corticobulbar MEPs went with complete facial paralysis that did not recover; an amplitude fall above 65% separated outcomes with 89% sensitivity and 99% specificity.', 'fernandezconejero2022'),
    ],
    atlas: [
      c('The tract could not be reconstructed in every atlas subject (left 983 and right 1054 of 1065), probably because tracking struggles with its sharp turns.', 'yeh2022'),
    ],
  },
  {
    id: 'wm_cc', name: 'Corpus callosum', abbr: 'CC', aliases: [], type: 'commissural', tier: 'core',
    summary: 'The great commissure between the hemispheres, arranged front to back by the cortex it connects.',
    course: [
      c('Tractography divides its midsagittal section into five vertical segments, front to back: fibres to prefrontal, premotor and supplementary motor, primary motor, and primary sensory cortex, then parietal, temporal and occipital cortex.', 'hofer2006'),
      c('Callosal motor fibres cross further back than the classic Witelson scheme indicates.', 'hofer2006'),
    ],
    connections: [
      c('Each midsagittal segment carries the fibres of its own cortical territory, in the order given above.', 'hofer2006'),
      c('A commissural pathway: commissural pathways (corpus callosum, anterior and posterior commissure) connect the two hemispheres.', 'yeh2018'),
    ],
    functions: [
      c('Split-brain studies showed the regional specificity of the callosum and its role in integrating the hemispheres, including the perception of causality and an integrated sense of self.', 'gazzaniga2005'),
    ],
    deficits: [],
    surgery: [
      c('Corpus callosotomy for drug-resistant epilepsy (1644 patients, 49 series): complete seizure freedom 12%, complete freedom from drop attacks 62%. Total callosotomy freed more patients from drop attacks than anterior callosotomy (72% vs 57%).', 'wu2023'),
    ],
    atlas: [],
  },
  {
    id: 'wm_fx', name: 'Fornix', abbr: 'Fornix', aliases: [], type: 'projection', tier: 'core',
    summary: 'Limbic tract on the mesial side of the hemisphere, part of the Papez circuit; bilateral injury, as after third-ventricle colloid cyst surgery, causes anterograde amnesia.',
    course: [
      c('A white matter bundle in the mesial aspect of each hemisphere that connects nodes of a limbic circuit.', 'senova2020'),
      c('As a midline structure it is exposed to the shearing forces of diffuse axonal injury.', 'thomas2011'),
    ],
    connections: [
      c('Part of the Papez circuit.', 'thomas2011'),
      c('Preclinical work divides it into two functional axes: a septohippocampal pathway and a subiculothalamic pathway.', 'senova2020'),
      c('Mammillary body volume falls after fornix damage, so it serves as an indirect marker of fornix integrity.', 'tsivilis2008'),
    ],
    functions: [
      c('Believed to play a key role in cognition and episodic memory recall.', 'senova2020'),
      c('In 38 people after colloid cyst removal, mammillary body volume correlated with 13 of 14 tests of episodic recall but poorly with recognition memory.', 'tsivilis2008'),
    ],
    deficits: [
      c('Damage causes anterograde amnesia. Midline gliomas and lymphoma can infiltrate it; herpes simplex encephalitis, multiple sclerosis and Wernicke encephalopathy can involve it; infarction is rare but can cause an acute amnesic syndrome.', 'thomas2011'),
      c('Forniceal atrophy can help in the assessment of mesial temporal sclerosis.', 'thomas2011'),
    ],
    surgery: [
      c('After removal of third-ventricle colloid cysts, bilateral interruption of the fornix was the only consistent MRI predictor of poor memory; learning and recall suffered more than recognition.', 'aggleton2000'),
      c('Fornix/hypothalamus DBS was tested in a phase I trial in six patients with mild Alzheimer’s disease: it drove activity in the memory circuit and reversed impaired temporal and parietal glucose metabolism on PET, with no serious adverse events.', 'laxton2010'),
      c('Optimal targets and stimulation parameters for forniceal DBS for memory have yet to be determined.', 'senova2020'),
    ],
    atlas: [],
    measured: [
      'Near the hypothalamus this atlas’s fornix lies a median 2.8 mm (left) and 3.7 mm (right) from the fornix label of the Neudorfer 2020 hypothalamus atlas shown in the DBS section; a 2 mm anterior and 2 mm superior shift brings them closest. No other tract showed such an offset. The T1 sampled along it is darker than along the other tracts (cerebrospinal fluid next to a thin tract). For millimetre questions near the fornix columns, use the DBS section’s fornix.',
    ],
  },
  // ---------------------------------------------------------------- extended tier
  {
    id: 'wm_mdlf', name: 'Middle longitudinal fasciculus', abbr: 'MdLF', aliases: ['middle longitudinal fascicle'], type: 'association', tier: 'extended',
    summary: 'Long association tract from the superior temporal gyrus and temporal pole to the parietal lobe; resected in part without permanent language loss.',
    course: [
      c('Runs principally between the superior temporal gyrus and the parietal lobe. Its two connections travel together through the dorsal temporal pole and superior temporal gyrus, then split towards the parietal lobe: one ventrolateral to the angular gyrus, one dorsomedial to the superior parietal lobule.', 'makris2013'),
      c('The extreme capsule fibres lie medial and rostral to it, partly flanking the medial wall of the insula.', 'makris2009'),
    ],
    connections: [
      c('In combined tractography and fibre microdissection, the human MdLF connects the superior temporal gyrus with the superior parietal lobule and parieto-occipital region, with only minor connections to the angular gyrus, unlike the monkey tract.', 'wang2013'),
    ],
    functions: [
      c('Suggested roles: language and attention for the superior temporal–angular connection; visuospatial and audiovisual integration for the superior temporal–superior parietal connection.', 'makris2013'),
      c('An alternative proposal: rather than a language tract, the MdLF may belong to the dorsal “where” pathway of the auditory system.', 'wang2013'),
    ],
    deficits: [
      c('Proposed clinical relevance in primary progressive aphasia, frontotemporal dementia, posterior cortical atrophy, Alzheimer’s disease, ADHD and schizophrenia.', 'makris2013'),
    ],
    surgery: [
      c('In eight left superior temporal glioma resections that removed a large part of the MdLF, its stimulation never disturbed picture naming and no new permanent language deficit followed; the IFOF (semantic paraphasia) formed the functional boundary. The MdLF may participate in, but is not essential for, language.', 'dewitthamer2011'),
    ],
    atlas: [],
  },
  {
    id: 'wm_tpat', name: 'Temporo-parietal aslant tract', abbr: 'TPAT', aliases: ['vertical arcuate fasciculus', 'posterior arcuate fasciculus', 'posterior SLF'], type: 'association', tier: 'extended',
    summary: 'Vertical tract between ventral parietal and temporal cortex, earlier described as the vertical (posterior) segment of the arcuate fasciculus.',
    course: [
      c('A bipartite system with dorsal and ventral subdivisions, running vertically between the ventral parietal and temporal regions; spatially separate from the vertical occipital fasciculus.', 'panesar2019'),
    ],
    connections: [
      c('Connects ventral parietal with temporal regions, with variable connections and no volumetric lateralization.', 'panesar2019'),
    ],
    functions: [
      c('Because it shows no overall connective or volumetric lateralization, it was proposed to be distinct from the arcuate system and renamed.', 'panesar2019'),
      c('In the atlas’s tract-to-region clustering it groups with the MdLF, VOF and ILF in a posterior ventral system.', 'yeh2022'),
    ],
    deficits: [],
    surgery: [],
    atlas: [],
  },
  {
    id: 'wm_vof', name: 'Vertical occipital fasciculus', abbr: 'VOF', aliases: [], type: 'association', tier: 'extended',
    summary: 'The only major bundle linking dorsolateral and ventrolateral visual cortex; rediscovered a century after its first description.',
    course: [
      c('A short, vertical fascicle of the posterior hemisphere.', 'panesar2019'),
      c('Found in every one of 74 hemispheres with a dedicated tractography algorithm; its tissue properties (such as myelination) differ from neighbouring tracts.', 'yeatman2014'),
      c('A non-lateralized, non-segmented system connecting lateral occipital areas with basal temporal regions.', 'panesar2019'),
    ],
    connections: [
      c('The only major fibre bundle connecting dorsolateral and ventrolateral visual cortex; its terminations sit in consistent positions relative to the cortical folding of the dorsal and ventral visual streams.', 'yeatman2014'),
    ],
    functions: [
      c('Likely carries signals between ventral regions for the perception of visual categories (words, faces, bodies) and dorsal regions for eye movements, attention and motion perception.', 'yeatman2014'),
    ],
    deficits: [],
    surgery: [],
    atlas: [],
  },
  {
    id: 'wm_emc', name: 'Extreme capsule fasciculus', abbr: 'EmC', aliases: ['extreme capsule'], type: 'association', tier: 'extended',
    summary: 'Ventral fronto-temporal fibre system linking pars triangularis with the superior temporal gyrus, medial to the MdLF along the insula.',
    course: [
      c('A long association pathway from the inferior frontal region to the superior temporal gyrus, extending into the inferior parietal lobule; medial and rostral to the MdLF, partly flanking the medial wall of the insula.', 'makris2009'),
      c('Distinguishable from the external capsule, uncinate fascicle, arcuate fascicle, SLF II and III and the ILF.', 'makris2009'),
    ],
    connections: [
      c('Pars triangularis (area 45) connects with the superior temporal gyrus, anterior to Heschl’s gyrus, through the extreme capsule fibre system; pars opercularis (area 44) instead connects with the rostral inferior parietal lobule through SLF III.', 'frey2008'),
    ],
    functions: [
      c('Its course through Broca’s and Wernicke’s territories suggests a role in language.', 'makris2009'),
      c('Among the pathways proposed to support language; its role is still debated.', 'dick2012'),
    ],
    deficits: [],
    surgery: [],
    atlas: [],
  },
  {
    id: 'wm_ac', name: 'Anterior commissure', abbr: 'AC', aliases: [], type: 'commissural', tier: 'extended',
    summary: 'Small commissure in front of the fornix columns whose temporal limbs reach the temporal stem.',
    course: [
      c('In dissection its fibres curve laterally within the basal forebrain; the anterior (olfactory) limb was sometimes absent, and the tip of the temporal limb intermingled with other fasciculi in a dense network.', 'peltier2011'),
      c('In the temporal stem, Meyer’s loop of the optic radiation lies next to the uncinate fasciculus and anterior commissure.', 'kier2004'),
    ],
    connections: [
      c('A commissural pathway between the hemispheres; its olfactory and occipital connections had to be tracked separately to complete it in the atlas.', 'yeh2018'),
    ],
    functions: [],
    deficits: [
      c('Can be involved in diffuse axonal injury, schizophrenia and tumour dissemination.', 'peltier2011'),
    ],
    surgery: [],
    atlas: [],
  },
  {
    id: 'wm_atr', name: 'Anterior thalamic radiation', abbr: 'ATR', aliases: ['anterior corticothalamic tract'], type: 'projection', tier: 'extended',
    summary: 'Thalamo-frontal projection through the anterior limb of the internal capsule; the shared territory of historical lesion surgery for depression.',
    course: [
      c('Converges with the superolateral branch of the medial forebrain bundle in the anterior limb of the internal capsule and in medial prefrontal cortex.', 'coenen2012'),
      c('Visualized directly with 7 T track-density imaging.', 'cho2015'),
    ],
    connections: [
      c('Thalamus to frontal cortex: diffusion tractography segments the thalamus by cortical connectivity into subregions matching histological nuclei.', 'behrens2003'),
    ],
    functions: [
      c('Proposed, with the medial forebrain bundle, to balance negative and positive affect (punishment and reward seeking).', 'coenen2012'),
    ],
    deficits: [],
    surgery: [
      c('Anterior capsulotomy, anterior cingulotomy, subcaudate tractotomy and limbic leucotomy for depression share connectivity in mediobasal frontal fibres, including the anterior thalamic radiations; lesions of the anterior capsule and subcaudate white matter gave better long-term remission than cingulate lesions.', 'schoenebake2010'),
    ],
    atlas: [],
  },
  {
    id: 'wm_str', name: 'Superior thalamic radiation', abbr: 'STR', aliases: ['superior corticothalamic tract'], type: 'projection', tier: 'extended',
    summary: 'Thalamocortical projection; somatosensory responses from thalamocortical fibres mark a resection limit in parietal awake mapping.',
    course: [
      c('A periventricular white matter bundle, studied together with the corticospinal and dentatorubrothalamic tracts in hydrocephalus.', 'younes2019'),
    ],
    connections: [
      c('Thalamus to cortex; thalamic subregions defined by their cortical connections correspond to histological nuclei.', 'behrens2003'),
    ],
    functions: [
      c('Carries somatosensory input: subcortical stimulation of thalamocortical pathways gave somatosensory responses during inferior parietal glioma surgery.', 'maldonado2011a'),
    ],
    deficits: [
      c('Its increased mean diffusivity, together with ventricular volume, separated normal pressure hydrocephalus from Alzheimer’s disease and healthy elderly people.', 'younes2019'),
    ],
    surgery: [
      c('In left inferior parietal gliomas, thalamocortical somatosensory responses were among the subcortical limits of resection.', 'maldonado2011a'),
    ],
    atlas: [],
  },
  {
    id: 'wm_ptr', name: 'Posterior thalamic radiation', abbr: 'PTR', aliases: ['posterior corticothalamic tract'], type: 'projection', tier: 'extended',
    summary: 'Posterior thalamocortical projection; see the measured cortical connections below.',
    course: [
      c('One of the thalamocortical connections that diffusion tractography maps reproducibly between individuals.', 'behrens2003'),
    ],
    connections: [
      c('A cortico-thalamic connection; its integrity was used as a proxy for cortico-thalamic connectivity in a study of attention.', 'menegaux2017'),
    ],
    functions: [
      c('In full-term-born adults, higher fractional anisotropy in the right posterior thalamic radiation went with higher visual short-term memory capacity; in preterm-born adults the relation was reversed.', 'menegaux2017'),
    ],
    deficits: [],
    surgery: [],
    atlas: [],
    measured: ['The atlas file holds only 84 (left) and 94 (right) streamlines, all shown; its shape is less certain than that of the other tracts.'],
  },
  {
    id: 'wm_ar', name: 'Acoustic radiation', abbr: 'AR', aliases: ['auditory radiation'], type: 'projection', tier: 'extended',
    summary: 'Auditory thalamocortical projection from the medial geniculate nucleus to Heschl’s gyrus, running transversely across the temporal lobe.',
    course: [
      c('A compact bundle running transversely from the midline to the lateral convexity of the posterior temporal lobe; dissection divides it into a genu, stem and fan, each closely related to neighbouring association and projection pathways.', 'maffei2018'),
    ],
    connections: [
      c('Medial geniculate nucleus of the thalamus to the transverse temporal (Heschl’s) gyrus.', 'maffei2019'),
    ],
    functions: [
      c('The thalamocortical projection of the auditory system, relevant to audition and language perception.', 'maffei2019'),
    ],
    deficits: [],
    surgery: [],
    atlas: [
      c('Hard to reconstruct with tractography because of the crossings around it; the atlas authors noted it had not been reported in tractography before.', 'maffei2019', 'yeh2018'),
    ],
  },
];
/** Notes shown for every tract: how far a group-average atlas can be trusted. */
export const GENERAL: Claim[] = [
  c('The tracts are a population average of 1065 healthy young adults (Human Connectome Project). About 85% of tract-to-region entries are the same (connected, or not) in more than 95% of people; about 15% vary substantially between individuals and need individual mapping.', 'yeh2022'),
  c('Tractography can still contain errors, such as deviating trajectories, early termination and wrong routing.', 'yeh2022'),
  c('Compared with intraoperative subcortical stimulation, 81% of positive language sites lay within 6 mm of a DTI fibre tract. A tract missing on tractography may still be there, especially when tumour invades it.', 'leclercq2010'),
  c('Glioma resection with intraoperative stimulation mapping was associated with fewer late severe deficits (3.4% vs 8.2%) and more gross-total resections (75% vs 58%).', 'dewitthamer2012'),
  c('Direct electrical stimulation of white matter in awake patients maps the connectivity behind sensorimotor, visuospatial, language and social-cognitive function in real time.', 'duffau2015'),
];

export const GROUPS: TractGroup[] = [
  {
    id: 'language', kind: 'function', tier: 'core', name: 'Language', hemi: 'L', camera: 'lateral',
    tractIds: ['wm_af', 'wm_slf3', 'wm_slf2', 'wm_fat', 'wm_ifof', 'wm_ilf', 'wm_uf'],
    rationale: [
      c('Seven pathways have been proposed to support language: the SLF and arcuate fasciculus, uncinate fasciculus, extreme capsule, middle longitudinal fasciculus, ILF and IFOF. Their roles are still debated.', 'dick2012'),
      c('Awake mapping in the dominant hemisphere separates a dorsal phonological route (AF: phonemic paraphasia) from a ventral semantic route (IFOF: semantic paraphasia).', 'duffau2008', 'mandonnet2007'),
      c('The AF, SLF II, SLF III and FAT form an “arcuate system” whose members all connect to Broca’s area.', 'yeh2022'),
      c('The left hemisphere is shown first because the AF is strongly left-lateralized; switch to the right with the hemisphere buttons.', 'fernandezmiranda2015'),
    ],
  },
  {
    id: 'visual', kind: 'function', tier: 'core', name: 'Vision', hemi: 'L', camera: 'lateral',
    tractIds: ['wm_or', 'wm_ilf', 'wm_ifof'],
    rationale: [
      c('The optic radiation carries the geniculo-calcarine visual pathway.', 'sherbondy2008'),
      c('The ILF processes visual cues; its disruption causes visual agnosia, prosopagnosia and alexia.', 'herbet2018'),
      c('The IFOF connects the frontal lobe with occipital extrastriate cortex.', 'martino2010'),
    ],
  },
  {
    id: 'motor', kind: 'function', tier: 'core', name: 'Motor and speech initiation', hemi: 'both', camera: 'coronal',
    tractIds: ['wm_cst', 'wm_cbt', 'wm_fat'],
    rationale: [
      c('The corticospinal tract is the principal pathway for voluntary movement.', 'welniarz2017'),
      c('The corticospinal and corticobulbar tracts both fan out from the precentral motor cortex.', 'yeh2018'),
      c('Stimulating the FAT inhibits movement and speech; resection near the left FAT causes transient speech-initiation disorders.', 'kinoshita2015'),
    ],
  },
  {
    id: 'limbic', kind: 'function', tier: 'core', name: 'Memory, emotion and social cognition', hemi: 'L', camera: 'medial',
    tractIds: ['wm_uf', 'wm_cing_fp', 'wm_cing_ph', 'wm_fx'],
    rationale: [
      c('The uncinate fasciculus has proposed roles in episodic memory, language and social-emotional processing.', 'vonderheide2013'),
      c('The dorsal cingulum is linked to executive control, emotion and pain, the parahippocampal cingulum to episodic memory.', 'bubb2018'),
      c('The fornix, part of the Papez circuit, is critical for memory formation.', 'thomas2011'),
    ],
  },
  {
    id: 'slf', kind: 'anatomy', tier: 'core', name: 'SLF–arcuate complex', hemi: 'R', camera: 'lateral',
    tractIds: ['wm_slf1', 'wm_slf2', 'wm_slf3', 'wm_af'],
    rationale: [
      c('Diffusion imaging separates the SLF into four subcomponents, as in non-human primates: SLF I, II and III, and the arcuate fascicle.', 'makris2005'),
      c('The right hemisphere is shown first: its parieto-frontal attention network is larger than the left one.', 'thiebaut2011'),
    ],
  },
  {
    id: 'association', kind: 'anatomy', tier: 'core', name: 'Association tracts', hemi: 'L', camera: 'lateral',
    tractIds: ['wm_af', 'wm_slf1', 'wm_slf2', 'wm_slf3', 'wm_ifof', 'wm_ilf', 'wm_uf', 'wm_fat', 'wm_cing_fp', 'wm_cing_ph'],
    rationale: [c('Association pathways connect disparate cortical areas; tractography atlases group tracts into association, projection and commissural pathways.', 'yeh2018', 'catani2008')],
  },
  {
    id: 'projection', kind: 'anatomy', tier: 'core', name: 'Projection tracts', hemi: 'both', camera: 'coronal',
    tractIds: ['wm_cst', 'wm_cbt', 'wm_or', 'wm_fx'],
    rationale: [c('Projection pathways connect cortical areas with subcortical nuclei and the brainstem; in the atlas network they form hubs at the thalamus, putamen and brainstem.', 'yeh2018')],
  },
  {
    id: 'commissural', kind: 'anatomy', tier: 'core', name: 'Commissural tracts', hemi: 'both', camera: 'axial',
    tractIds: ['wm_cc'],
    rationale: [c('Commissural pathways connect the two hemispheres; the corpus callosum is the one shown here.', 'yeh2018')],
  },
  {
    id: 'all', kind: 'all', tier: 'core', name: 'All core tracts', hemi: 'L', camera: 'lateral',
    tractIds: ['wm_af', 'wm_slf1', 'wm_slf2', 'wm_slf3', 'wm_ifof', 'wm_ilf', 'wm_uf', 'wm_fat', 'wm_cing_fp', 'wm_cing_ph', 'wm_fx', 'wm_or', 'wm_cst', 'wm_cbt', 'wm_cc'],
    rationale: [],
  },
  // ---------------------------------------------------------------- extended tier
  {
    id: 'ext_language', kind: 'function', tier: 'extended', name: 'Language and hearing', hemi: 'L', camera: 'lateral',
    tractIds: ['wm_emc', 'wm_mdlf', 'wm_tpat', 'wm_ar'],
    rationale: [
      c('The extreme capsule and middle longitudinal fasciculus are among the pathways proposed to support language; their roles are debated.', 'dick2012'),
      c('Stimulating and resecting the left MdLF did not disturb language, so it is not essential for it.', 'dewitthamer2011'),
      c('The acoustic radiation carries auditory signals to Heschl’s gyrus; the MdLF may belong to the auditory “where” pathway.', 'maffei2019', 'wang2013'),
    ],
  },
  {
    id: 'ext_posterior', kind: 'anatomy', tier: 'extended', name: 'Posterior ventral system', hemi: 'L', camera: 'lateral',
    tractIds: ['wm_mdlf', 'wm_tpat', 'wm_vof'],
    rationale: [
      c('By their cortical connections the MdLF, TPAT, VOF and ILF form a posterior ventral system (the ILF is a core tract, shown under Vision).', 'yeh2022'),
      c('The TPAT and VOF are spatially separate vertical tracts in the posterior hemisphere.', 'panesar2019'),
    ],
  },
  {
    id: 'ext_thalamic', kind: 'anatomy', tier: 'extended', name: 'Thalamic radiations', hemi: 'L', camera: 'lateral',
    tractIds: ['wm_atr', 'wm_str', 'wm_ptr', 'wm_ar'],
    rationale: [
      c('Diffusion tractography maps the connections between thalamus and cortex, reproducibly between individuals.', 'behrens2003'),
      c('The acoustic radiation is the auditory thalamocortical projection, from the medial geniculate nucleus.', 'maffei2019'),
    ],
  },
  {
    id: 'ext_commissural', kind: 'anatomy', tier: 'extended', name: 'Anterior commissure', hemi: 'both', camera: 'axial',
    tractIds: ['wm_ac'],
    rationale: [c('The commissural pathways comprise the corpus callosum (core) and the anterior and posterior commissures.', 'yeh2018')],
  },
  {
    id: 'ext_all', kind: 'all', tier: 'extended', name: 'All extended tracts', hemi: 'L', camera: 'lateral',
    tractIds: ['wm_mdlf', 'wm_tpat', 'wm_vof', 'wm_emc', 'wm_ac', 'wm_atr', 'wm_str', 'wm_ptr', 'wm_ar'],
    rationale: [],
  },
];
