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
    structures: ['stn', 'stn_motor'], alternativeStructures: ['dentate'],
    tracts: ['sw_pd_m1', 'drtt'], corticalAreas: ['m1'], targetId: 't-ss-pd',
    evidence: [
      { claim: 'Symptom-specific tracts mapped in 237 patients from five centres', refIds: ['rajamani2024'] },
      { claim: 'Tremor responds whichever target is used', refIds: ['wong'] },
    ],
    note: `${RAJAMANI_NOTE} Cerebellar side shown with the DRTT (Middlebrooks 2020). The tremor tract did not survive 10-fold cross-validation, and most of this mapping is retrospective.`,
    noteRefIds: ['rajamani2024'],
    camera: 'lateral',
  },
  {
    id: 'pd-bradykinesia', indicationId: 'pd', name: 'Bradykinesia',
    summary: 'Bradykinesia maps to SMA.',
    structures: ['stn', 'stn_motor'], tracts: ['sw_pd_sma'], corticalAreas: ['sma'], targetId: 't-ss-pd',
    evidence: [{ claim: 'Symptom-specific tracts mapped in 237 patients from five centres', refIds: ['rajamani2024'] }],
    note: RAJAMANI_NOTE, noteRefIds: ['rajamani2024'],
    camera: 'lateral',
  },
  {
    id: 'pd-rigidity', indicationId: 'pd', name: 'Rigidity',
    summary: 'Rigidity maps to premotor cortex.',
    structures: ['stn', 'stn_motor'], tracts: ['sw_pd_pm'], corticalAreas: ['pmd', 'pmv'], targetId: 't-ss-pd',
    evidence: [{ claim: 'Symptom-specific tracts mapped in 237 patients from five centres', refIds: ['rajamani2024'] }],
    note: RAJAMANI_NOTE, noteRefIds: ['rajamani2024'],
    camera: 'lateral',
  },
  {
    id: 'pd-axial', indicationId: 'pd', name: 'Axial signs and gait',
    summary: 'Axial signs map to SMA and brainstem. For freezing of gait, deep contacts at the STN/SNr border.',
    structures: ['stn', 'stn_motor', 'ppn'], alternativeStructures: ['snr'],
    tracts: ['sw_pd_sma'], corticalAreas: ['sma'], targetId: 't-ss-pd',
    evidence: [
      { claim: 'Symptom-specific tracts mapped in 237 patients from five centres', refIds: ['rajamani2024'] },
      { claim: 'Combined STN plus SNr may help freezing, with mixed results', refIds: ['weiss2013', 'artusi2025', 'mds2024'] },
    ],
    note: `${RAJAMANI_NOTE} No brainstem-connected tract is distributed as a file; the brainstem side is represented by the PPN (Snijders 2016) only.`,
    noteRefIds: ['rajamani2024'],
    camera: 'anterior',
  },
  {
    id: 'pd-dyskinesia', indicationId: 'pd', name: 'Dyskinesia',
    summary: 'Stimulation-induced dyskinesia from GPi linked to lenticular-fasciculus connectivity.',
    structures: ['gpi', 'gpi_sm'], tracts: ['lf', 'al'], corticalAreas: [], targetId: 't-atlas-gpi-sm',
    evidence: [{ claim: 'Stimulation-induced dyskinesia from GPi linked to lenticular-fasciculus connectivity', refIds: ['sid'] }],
    note: 'Pallidofugal fibres shown with the ansa lenticularis and lenticular fasciculus of the DBS Tractography Atlas (Middlebrooks 2020). The marker is the DISTAL sensorimotor GPi centroid (atlas coordinate).',
    camera: 'anterior',
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
    camera: 'anterior',
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
    camera: 'anterior',
  },
  {
    id: 'gdys-generalized', indicationId: 'gdys', name: 'Generalized dystonia',
    summary: 'The best stimulation volume sits in posteroventral GPi and extends into subpallidal white matter, implicating the ansa lenticularis. In generalized dystonia, benefit followed the pallidothalamic bundles.',
    structures: ['gpi', 'gpi_sm'], tracts: ['rt_gen', 'al', 'lf'], corticalAreas: ['s1'], targetId: 't-ss-gen',
    evidence: [
      { claim: 'Sweet spot in posteroventral GPi bordering subpallidal white matter predicted individual outcome', refIds: ['reich2019'] },
      { claim: 'Generalized dystonia responded to the pallidothalamic bundles', refIds: ['horn2022'] },
    ],
    camera: 'anterior',
  },
  {
    id: 'cdys-cervical', indicationId: 'cdys', name: 'Cervical dystonia',
    summary: 'Cervical dystonia responded best to modulation of the striatopallidofugal axis. Face and neck lie in the ventral, lateral and posterior GPi.',
    structures: ['gpi'], alternativeStructures: ['putamen'], tracts: ['rt_cerv'], corticalAreas: ['s1'], targetId: 't-ss-cerv',
    evidence: [
      { claim: 'Striatopallidofugal axis linked to optimal cervical outcomes in 80 patients', refIds: ['horn2022'] },
      { claim: 'Ventral, lateral and posterior GPi represent face and neck', refIds: ['thieme2021'] },
    ],
    note: 'The thresholded cervical tract file contains six positively weighted streamlines per hemisphere; all are shown.',
    camera: 'anterior',
  },
  {
    id: 'fhd-hand', indicationId: 'fhd', name: 'Focal hand dystonia',
    summary: 'Vo is the main pallidal-receiving thalamus. Lesioning or stimulating it can give long-term remission of task-specific hand dystonia.',
    structures: ['vo'], tracts: ['al', 'lf'], corticalAreas: ['s1', 'sma'], targetId: 't-atlas-vo',
    evidence: [
      { claim: '171 consecutive Vo thalamotomies for task-specific hand dystonia', refIds: ['horisawa2019'] },
      { claim: 'Vo targeted at the Voa/Vop junction from published coordinates', refIds: ['vocoords'] },
    ],
    note: 'Marker: centroid of the Morel VLa label shown as Vo (atlas coordinate). The published Voa/Vop junction coordinates are not included; see the referenced series.',
    camera: 'lateral',
  },
  {
    id: 'ts-tics', indicationId: 'ts', name: 'Tics',
    summary: 'CM connectivity to sensorimotor cortex, putamen and cerebellum predicted tic improvement.',
    structures: ['cm', 'pf'], alternativeStructures: ['putamen'], tracts: ['sw_ts'], corticalAreas: ['m1', 's1'], targetId: 't-atlas-cm',
    evidence: [
      { claim: 'CM connectivity predicted tic improvement under cross-validation', refIds: ['johnson2020'] },
      { claim: 'Tourette response maps to M1-connected circuits', refIds: ['hollunder2024'] },
    ],
    note: 'Streamlines: Tourette sweet streamlines (Hollunder 2024). The CM-specific connectivity of Johnson 2020 is not distributed as a file. Overlap with the best-connected CM region did not predict response by itself.',
    noteRefIds: ['johnson2020'],
    camera: 'anterior',
  },
  {
    id: 'ts-ocb', indicationId: 'ts', name: 'Obsessive-compulsive behaviour',
    summary: 'Contacts within, above or medial to the GPi helped obsessive-compulsive behaviour more.',
    structures: ['gpi'], tracts: [], corticalAreas: [], targetId: 't-atlas-gpi',
    evidence: [{ claim: 'No difference between targets in 110 patients; benefit builds over months', refIds: ['johnson2019'] }],
    note: 'No region map for this finding is distributed as a file. The marker is the DISTAL GPi centroid for orientation only.',
    camera: 'anterior',
  },
];
