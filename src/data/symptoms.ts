import { EPILEPSY_SYMPTOMS } from './epilepsy';
import type { SymptomInput } from './schema';

/**
 * Symptom-level views. Every summary and claim is quoted from the attached
 * content (IND why / howToChoose / evidence / caveat). Where the paper's own
 * tract is not distributed as a file, the shown tract is a derived stand-in and
 * the card says so in `note`.
 */
const RAJAMANI_NOTE =
  'The Rajamani 2024 symptom tracts are not distributed as files. The streamlines shown are the subset of the published Hollunder 2024 PD sweet streamlines that end in this cortical area: a derived stand-in, not the paper’s tract.';

export const SYMPTOMS: SymptomInput[] = [
  {
    id: 'pd-tremor', indicationId: 'pd', name: 'Tremor',
    summary: 'Tremor maps to tracts to M1 and cerebellum.',
    structures: ['stn', 'stn_motor'], contextStructures: ['dentate'],
    tracts: ['sw_pd_m1', 'drtt'], corticalAreas: ['m1'], targetId: 't-ss-pd',
    evidence: [
      { claim: 'Symptom-specific tracts mapped in 237 patients from five centres', refIds: ['rajamani2024'] },
      { claim: 'Tremor responds whichever target is used', refIds: ['wong'] },
    ],
    note: `${RAJAMANI_NOTE} Cerebellar side shown with the DRTT (Middlebrooks 2020). The tremor tract did not survive 10-fold cross-validation, and most of this mapping is retrospective.`,
    noteRefIds: ['rajamani2024'],
    camera: 'sagittal',
  },
  {
    id: 'pd-bradykinesia', indicationId: 'pd', name: 'Bradykinesia',
    summary: 'Bradykinesia maps to SMA.',
    structures: ['stn', 'stn_motor'], tracts: ['sw_pd_sma'], corticalAreas: ['sma'], targetId: 't-ss-pd',
    evidence: [{ claim: 'Symptom-specific tracts mapped in 237 patients from five centres', refIds: ['rajamani2024'] }],
    note: RAJAMANI_NOTE, noteRefIds: ['rajamani2024'],
    camera: 'sagittal',
  },
  {
    id: 'pd-rigidity', indicationId: 'pd', name: 'Rigidity',
    summary: 'Rigidity maps to premotor cortex.',
    structures: ['stn', 'stn_motor'], tracts: ['sw_pd_pm'], corticalAreas: ['pmd', 'pmv'], targetId: 't-ss-pd',
    evidence: [{ claim: 'Symptom-specific tracts mapped in 237 patients from five centres', refIds: ['rajamani2024'] }],
    note: RAJAMANI_NOTE, noteRefIds: ['rajamani2024'],
    camera: 'sagittal',
  },
  {
    id: 'pd-axial', indicationId: 'pd', name: 'Axial signs and gait',
    summary: 'Axial signs map to SMA and brainstem. For freezing of gait, deep contacts at the STN/SNr border.',
    structures: ['stn', 'stn_motor'], alternativeStructures: ['snr'],
    tracts: ['sw_pd_sma'], corticalAreas: ['sma'], targetId: 't-ss-pd',
    evidence: [
      { claim: 'Symptom-specific tracts mapped in 237 patients from five centres', refIds: ['rajamani2024'] },
      { claim: 'Combined STN plus SNr may help freezing, with mixed results', refIds: ['weiss2013', 'artusi2025', 'mds2024'] },
    ],
    note: `${RAJAMANI_NOTE} No brainstem-connected tract is distributed as a file, so the brainstem side is not drawn in this view.`,
    noteRefIds: ['rajamani2024'],
    camera: 'coronal',
  },
  {
    // (the audit's finding A-001, the owner's choice: what DBS does for levodopa-induced dyskinesia, beside the view of the
    // dyskinesia stimulation can induce; where the relief comes from, so no target marker)
    id: 'pd-lid', indicationId: 'pd', name: 'Levodopa-induced dyskinesia',
    summary: 'Pallidal stimulation suppresses levodopa-induced dyskinesia directly, best from the ventral posterior GPi and the fibres beneath it. Subthalamic stimulation does so mostly through the lower levodopa dose it allows; directly, from contacts above the STN, among the pallidal output fibres.',
    structures: ['gpi', 'stn'], tracts: ['al', 'lf'], corticalAreas: [], targetId: null,
    evidence: [
      { claim: 'In 43 patients with dyskinesia before surgery (retrospective, one centre), it improved by 94 % after GPi DBS and by 61 % after STN DBS (UDysRS, median 18 months); after STN DBS the improvement correlated with the cut in levodopa-equivalent dose (44 %), after GPi DBS it did not (13 %)', refIds: ['fan2020'] },
      { claim: 'In acute tests (13 electrodes, 8 patients), stimulation at the ventral margin of the GPi or just below it arrested dyskinesia completely but blocked levodopa\'s effect on akinesia; the most dorsal contacts, at the dorsal border of the GPi or in the GPe, could induce dyskinesia', refIds: ['krack1998'] },
      { claim: 'In 69 patients of the VA CSP-468 trial, the sweet spot for fewer hours of dyskinesia lay in the ventral posterior GPi and extended below it, apart from the sweet spot for motor (UPDRS) benefit; the fibres linked to it ran beneath the GPi, like the ansa lenticularis', refIds: ['dsouza2026'] },
      { claim: 'In the same patients, the zone of below-average outcomes spanned the GPe and dorsal GPi, and more SMA or premotor synchrony went with worse outcomes', refIds: ['dsouza2026'] },
      { claim: 'From STN leads, an interleaved dorsal contact improved dyskinesia by a further 62 % with no significant change in levodopa dose (20 patients, retrospective); the tissue it activated lay above and lateral to the STN, among pallidofugal fibres on their way to the thalamus, which the lenticular fasciculus and the ansa lenticularis form', refIds: ['aquino2019'] },
      { claim: 'Without lowering levodopa (45 patients), contacts above the STN attenuated peak-dose dyskinesia; contacts within the STN tended to provoke or worsen it', refIds: ['katayama2006'] },
    ],
    note: 'Where stimulation relieves dyskinesia, from either kind of lead: the GPi and STN are shown whole, with the ansa lenticularis beneath the GPi and the lenticular fasciculus above the STN, both from the DBS Tractography Atlas (Middlebrooks 2020). No target marker: the antidyskinetic sweet spot\'s abstract gives no coordinates. No cortex: SMA and premotor synchrony went with worse outcomes, not with relief. The same pallidum works both ways: ventral stimulation suppresses dyskinesia, dorsal stimulation can induce it (see Stimulation-induced dyskinesia). The studies are small, and most are retrospective. Fan 2020 was read in full and Aquino 2019 as its author manuscript; Krack 1998, D\'Souza 2026 and Katayama 2006 as their abstracts (the full texts are not open access).',
    noteRefIds: ['middlebrooks2020', 'dsouza2026', 'krack1998', 'fan2020', 'aquino2019', 'katayama2006'],
    camera: 'coronal',
  },
  {
    // (a side effect of pallidal stimulation, not a symptom it treats: where it arose, so no target marker; the audit's
    // finding A-001: the view had put it in the sensorimotor GPi with the ansa lenticularis as a dyskinesia tract,
    // against its own source)
    id: 'pd-dyskinesia', indicationId: 'pd', name: 'Stimulation-induced dyskinesia',
    summary: 'A side effect of pallidal stimulation: in 20 of 68 patients, the contacts that induced dyskinesia lay more dorsally and anteriorly than those that did not, mainly in the dorsal GPi and GPe, and connected more to associative cortex and SMA/premotor cortex.',
    structures: ['gpi', 'gpe'], tracts: [], corticalAreas: ['sma', 'pmd', 'pmv'], targetId: null,
    evidence: [
      { claim: 'Stimulation-induced dyskinesia in 20 of 68 patients (29 %) after pallidal DBS; the contacts that induced it lay more dorsally and anteriorly than those that did not, mainly in the dorsal GPi and GPe', refIds: ['tsuboi2021'] },
      { claim: 'Those contacts connected more to associative cortex and SMA/premotor cortex; those that did not, more to primary sensory cortex, cerebellum, STN and motor thalamus', refIds: ['tsuboi2021'] },
      { claim: 'Preliminary, in 16 patients: the contacts that induced dyskinesia connected less through the ansa lenticularis, whose involvement may suppress it', refIds: ['sid'] },
      { claim: 'Measured differently, as the change in daily hours of levodopa-induced dyskinesia after pallidal DBS (69 patients of the VA CSP-468 trial): the zone of below-average outcomes spanned the GPe and dorsal GPi, and more SMA or premotor synchrony went with worse outcomes', refIds: ['dsouza2026'] },
    ],
    note: 'Where stimulation induced dyskinesia, not a target: the view has no target marker. The GPi and GPe are shown whole; the contacts lay in their dorsal, anterior parts. D\'Souza 2026 measured levodopa-induced dyskinesia, not dyskinesia from stimulation, and found a similar dorsal zone and the same cortex. Tsuboi 2021 and D\'Souza 2026 were read as their abstracts (the full texts are not open access); the ansa lenticularis finding is from a conference abstract by the Tsuboi group and preliminary, so no tract is drawn as the dyskinesia tract.',
    noteRefIds: ['tsuboi2021', 'dsouza2026', 'sid'],
    camera: 'coronal',
  },
  {
    id: 'et-limb', indicationId: 'et', name: 'Limb tremor',
    summary: 'The Vim relays the DRTT from the contralateral dentate nucleus to M1. Efficacy at both Vim and PSA tracks how close the active contact is to the DRTT.',
    structures: ['vim', 'dentate'], tracts: ['drtt', 'ndrtt'], corticalAreas: ['m1'], targetId: 't-ss-tremor',
    evidence: [
      { claim: 'Efficiency tracks distance to the DRTT', refIds: ['poster'] },
      { claim: 'The dentate-connected zone lies ventrolateral within the M1-connected thalamus', refIds: ['akram2018'] },
      { claim: 'Intersectional Vim targeting with PD-weighted MRI and DRTT tractography', refIds: ['jns2021'] },
      { claim: 'A shared tremor network in M1 and motor cerebellum predicts outcome across targets', refIds: ['goede2025'] },
    ],
    note: 'Marker: tremor hotspot of thalamic DBS from the TOR-PSM probabilistic maps (Elias 2021).',
    camera: 'coronal',
  },
  {
    id: 'et-head', indicationId: 'et', name: 'Head tremor',
    summary: 'PSA is better for head tremor, causes less dysarthria and works at lower amplitude.',
    structures: ['psa'], alternativeStructures: ['vim'], tracts: ['drtt'], corticalAreas: [], targetId: 't-atlas-psa',
    evidence: [
      { claim: 'PSA superior for head tremor, with less dysarthria', refIds: ['nma2025'] },
      { claim: 'PSA effective at lower stimulation intensity in a randomized crossover trial', refIds: ['barbe2018'] },
    ],
    note: 'Marker: centroid of the caudal zona incerta label (Lau 2020), an atlas coordinate, not a sweet spot.',
    camera: 'coronal',
  },
  {
    id: 'gdys-generalized', indicationId: 'gdys', name: 'Generalized dystonia',
    summary: 'The best stimulation volume sits in posteroventral GPi and extends into subpallidal white matter, implicating the ansa lenticularis. In generalized dystonia, benefit followed the pallidothalamic bundles.',
    structures: ['gpi', 'gpi_sm'], tracts: ['rt_gen', 'al', 'lf'], corticalAreas: ['s1'], targetId: 't-ss-gen',
    evidence: [
      { claim: 'Sweet spot in posteroventral GPi bordering subpallidal white matter predicted individual outcome', refIds: ['reich2019'] },
      { claim: 'Generalized dystonia responded to the pallidothalamic bundles', refIds: ['horn2022'] },
    ],
    camera: 'coronal',
  },
  {
    id: 'cdys-cervical', indicationId: 'cdys', name: 'Cervical dystonia',
    summary: 'Cervical dystonia responded best to modulation of the striatopallidofugal axis. Face and neck lie in the ventral, lateral and posterior GPi.',
    structures: ['gpi'], contextStructures: ['putamen'], tracts: ['rt_cerv'], corticalAreas: ['s1'], targetId: 't-ss-cerv',
    evidence: [
      { claim: 'Striatopallidofugal axis linked to optimal cervical outcomes in 80 patients', refIds: ['horn2022'] },
      { claim: 'Ventral, lateral and posterior GPi represent face and neck', refIds: ['thieme2021'] },
    ],
    note: 'The thresholded cervical tract file contains six positively weighted streamlines per hemisphere; all are shown.',
    camera: 'coronal',
  },
  {
    id: 'fhd-hand', indicationId: 'fhd', name: 'Focal hand dystonia',
    summary: 'Vo is the main pallidal-receiving thalamus. Lesioning or stimulating it can give long-term remission of task-specific hand dystonia.',
    structures: ['vo'], tracts: ['al', 'lf'], corticalAreas: ['s1', 'sma'], targetId: 't-pub-vo',
    evidence: [
      { claim: '171 consecutive Vo thalamotomies for task-specific hand dystonia', refIds: ['horisawa2019'] },
      { claim: 'Vo targeted at the Voa/Vop junction from published coordinates', refIds: ['vocoords'] },
    ],
    note: 'Marker: centroid of the Morel VLa label shown as Vo (atlas coordinate). The published Voa/Vop junction coordinates are not included; see the referenced series.',
    camera: 'sagittal',
  },
  {
    id: 'ts-tics', indicationId: 'ts', name: 'Tics',
    summary: 'CM connectivity to sensorimotor cortex, putamen and cerebellum predicted tic improvement.',
    structures: ['cm', 'pf'], contextStructures: ['putamen'], tracts: [], corticalAreas: ['m1', 's1'], targetId: 't-atlas-cm',
    evidence: [
      { claim: 'CM connectivity predicted tic improvement under cross-validation', refIds: ['johnson2020'] },
    ],
    // (the site audit's finding A-002: Hollunder 2024's Tourette maps, from subthalamic DBS, were this view's only tract)
    note: 'No tract is drawn: the CM-specific connectivity of Johnson 2020 is not distributed as a file, and Hollunder 2024\'s Tourette sweet spot and streamlines come from subthalamic DBS in 14 patients, not from the CM-Pf. Overlap with the best-connected CM region did not predict response by itself.',
    noteRefIds: ['johnson2020', 'hollunder2024'],
    camera: 'coronal',
  },
  {
    id: 'ts-ocb', indicationId: 'ts', name: 'Obsessive-compulsive behaviour',
    summary: 'Contacts within, above or medial to the GPi helped obsessive-compulsive behaviour more.',
    structures: ['gpi'], tracts: [], corticalAreas: [], targetId: 't-atlas-gpi',
    evidence: [{ claim: 'No difference between targets in 110 patients; benefit builds over months', refIds: ['johnson2019'] }],
    note: 'No region map for this finding is distributed as a file. The marker is the DISTAL GPi centroid for orientation only.',
    camera: 'coronal',
  },
  ...EPILEPSY_SYMPTOMS,
];
