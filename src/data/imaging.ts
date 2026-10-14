import type { Imaging } from './schema';

/** Imaging per target structure, ported verbatim from the `IMG` array of the attached file. */
export const IMAGING: Imaging[] = [
  {
    id: 'stn', structureId: 'stn', label: 'STN', title: 'Subthalamic nucleus', accent: 'stn',
    sequences: [
      { name: 'T2w', note: 'Rated highest for STN' },
      { name: 'SWI', note: 'Highest STN contrast; runs on most scanners' },
      { name: 'QSM', note: 'Rated highest for STN' },
      { name: 'T2-FLAIR', note: 'Rated highest for STN' },
    ],
    tract: 'The hyperdirect pathway to M1 and SMA defines the motor STN. Patient-specific 7T tractography of it improved outcomes prospectively.',
    note: 'Atrophy, ventricle size and AC–PC length shift where the STN lies, so check indirect coordinates against the images.',
    refIds: ['protocol2025', 'imgreview2025', 'akram2017', 'npj2026', 'stnanat2025'],
  },
  {
    id: 'gpi', structureId: 'gpi', label: 'GPi', title: 'Globus pallidus internus', accent: 'gpi',
    sequences: [
      { name: 'FGATIR', note: 'Rated best for GPi' },
      { name: 'PDw', note: 'Next best; higher pallidal contrast' },
      { name: 'MDEFT', note: 'Delineates GPi well in most patients' },
    ],
    tract: 'Pallidothalamic bundles for generalized dystonia; the striatopallidofugal axis for cervical dystonia.',
    note: 'Face and neck lie in the ventral, lateral and posterior GPi.',
    refIds: ['protocol2025', 'imgreview2025', 'mdeft', 'horn2022', 'thieme2021'],
  },
  {
    id: 'vim', structureId: 'vim', label: 'Vim', title: 'Ventral intermediate nucleus', accent: 'vim',
    sequences: [
      { name: 'FGATIR', note: 'The only sequence all raters preferred' },
      { name: 'PD-weighted', note: 'Combined with DRTT tractography for intersectional targeting' },
    ],
    tract: 'DRTT, with the pyramidal tract and medial lemniscus as borders in dual-tract models.',
    note: 'Directly targeted leads sat more lateral and anterior and needed lower amplitudes, but had more symptomatic haemorrhages in one series.',
    refIds: ['protocol2025', 'jns2021', 'vimma2026', 'barrow'],
  },
  {
    id: 'psa', structureId: 'psa', label: 'PSA / cZi', title: 'Posterior subthalamic area', accent: 'psa',
    sequences: [], noSequences: 'Not rated separately in the 2025 sequence survey.',
    tract: 'DRTT. Efficacy tracks how close the active contact is to the tract.',
    note: 'Often reached by extending a Vim trajectory, so one lead can cover both.',
    refIds: ['poster', 'nma2025', 'nct'],
  },
  {
    id: 'cm', structureId: 'cm', label: 'CM', title: 'Centromedian thalamus', accent: 'cm',
    sequences: [], noSequences: 'Not covered by the 2025 sequence survey.',
    tract: 'Connectivity to sensorimotor cortex, putamen and cerebellum predicted tic improvement in Tourette syndrome.',
    note: 'Overlap with the best-connected region did not predict response on its own.',
    refIds: ['johnson2020'],
  },
  {
    id: 'vo', structureId: 'vo', label: 'Vo', title: 'Ventral oral thalamus', accent: 'vo',
    sequences: [], noSequences: 'Not covered by the 2025 sequence survey.',
    tract: 'Receives pallidal output through the pallidothalamic bundles.',
    note: 'Often planned from published coordinates at the junction of Voa and Vop.',
    refIds: ['vocoords', 'bmjno'],
  },
];

/** Aside paragraph under the imaging cards (verbatim, with its reference ids). */
export const IMAGING_ASIDE: { text: string; refIds: string[] }[] = [
  { text: 'Ratings come from 12 surgeons at 11 centres scoring 22 sequences', refIds: ['protocol2025'] },
  { text: 'At 7T, transmit-field inhomogeneity degrades contrast; optimized FGATIR or synthetic FGATIR from MP2RAGE helps', refIds: ['fgatir7t'] },
  { text: 'FGATIR itself dates from 2009', refIds: ['sudhyadhom2009'] },
];
